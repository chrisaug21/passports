const { z } = require("zod");
const { selectRows, selectForTrip } = require("../lib/supabase-rest.js");
const { createProposal, MAX_CHANGESET_ITEMS } = require("../lib/mcp-auth.js");
const { withToolErrorHandling } = require("../lib/tool-error.js");
const { ITEM_TYPES, MEAL_SLOTS, ACTIVITY_TYPES, TRANSPORT_MODES, ITEM_STATUSES, validateItemTypeFields } = require("../lib/item-fields.js");

// Every editable field: how it maps to the trip_items column, whether it
// can be explicitly cleared (set to null) via a proposed change, and how to
// render a value for the human-readable summary. baseId/dayId/mealSlot/
// activityType/transportMode are nullable specifically so a proposal can
// clear the old sub-type field when changing itemType — see the merge
// validation below, which requires exactly that.
function fieldDefs(baseNameById, dayLabelById) {
  const idOrUnassigned = (map) => (value) => (value == null ? "Unassigned" : map[value] || value);
  return [
    { camel: "title", snake: "title", nullable: false, zod: z.string().min(1) },
    { camel: "itemType", snake: "item_type", nullable: false, zod: z.enum(ITEM_TYPES) },
    { camel: "status", snake: "status", nullable: false, zod: z.enum(ITEM_STATUSES) },
    { camel: "isAnchor", snake: "is_anchor", nullable: false, zod: z.boolean() },
    { camel: "baseId", snake: "base_id", nullable: true, zod: z.string().uuid(), format: idOrUnassigned(baseNameById) },
    { camel: "dayId", snake: "day_id", nullable: true, zod: z.string().uuid(), format: idOrUnassigned(dayLabelById) },
    { camel: "mealSlot", snake: "meal_slot", nullable: true, zod: z.enum(MEAL_SLOTS) },
    { camel: "activityType", snake: "activity_type", nullable: true, zod: z.enum(ACTIVITY_TYPES) },
    { camel: "transportMode", snake: "transport_mode", nullable: true, zod: z.enum(TRANSPORT_MODES) },
    { camel: "transportOrigin", snake: "transport_origin", nullable: true, zod: z.string() },
    { camel: "transportDestination", snake: "transport_destination", nullable: true, zod: z.string() },
    { camel: "timeStart", snake: "time_start", nullable: true, zod: z.string() },
    { camel: "timeEnd", snake: "time_end", nullable: true, zod: z.string() },
    { camel: "timeIsEstimated", snake: "time_is_estimated", nullable: false, zod: z.boolean() },
    { camel: "costLow", snake: "cost_low", nullable: true, zod: z.number() },
    { camel: "costHigh", snake: "cost_high", nullable: true, zod: z.number() },
    { camel: "confirmationRef", snake: "confirmation_ref", nullable: true, zod: z.string() },
    { camel: "url", snake: "url", nullable: true, zod: z.string() },
    { camel: "notes", snake: "notes", nullable: true, zod: z.string() },
    { camel: "sortOrder", snake: "sort_order", nullable: false, zod: z.number().int() },
    { camel: "checkOutDate", snake: "check_out_date", nullable: true, zod: z.string() },
  ];
}

// Builds the zod shape for one changeset entry: itemId plus every editable
// field, each genuinely optional (an absent key means "not changing this
// field") and, where nullable, unioned with z.null() so a proposal can
// explicitly clear a field rather than merely omit it.
//
// The null branch carries a .describe() deliberately, not just for
// documentation: zod v4's JSON Schema converter collapses a bare
// `anyOf: [{type: "string"}, {type: "null"}]` into the shorthand
// `type: ["string", "null"]` UNLESS a branch carries a constraint, $ref,
// const, or metadata — see node_modules/zod/v4/core/to-json-schema.js's
// compactifyUnion. The array-type form is legal JSON Schema, but several
// MCP clients (including, per Inspector's own portability check, some real
// ones) read `type` as a single string and mishandle it. The .describe()
// is what keeps this as an explicit anyOf instead.
function changeEntrySchema() {
  const shape = { itemId: z.string().uuid() };
  for (const def of fieldDefs({}, {})) {
    shape[def.camel] = def.nullable
      ? z.union([def.zod, z.null().describe("null clears this field")]).optional()
      : def.zod.optional();
  }
  return z.object(shape).strict();
}

// Merges a proposed change onto the item's current row and re-validates
// itemType/sub-field consistency against the *resulting* state — so a
// change that flips itemType without also clearing the old sub-type field
// (or setting the new one) is rejected with a clear reason, rather than
// silently leaving mismatched columns.
function validateMergedItemType(change, currentItem) {
  const mergedItemType = "itemType" in change ? change.itemType : currentItem.item_type;
  const mergedSubfields = {
    mealSlot: "mealSlot" in change ? change.mealSlot : currentItem.meal_slot,
    activityType: "activityType" in change ? change.activityType : currentItem.activity_type,
    transportMode: "transportMode" in change ? change.transportMode : currentItem.transport_mode,
  };
  return validateItemTypeFields(mergedItemType, mergedSubfields);
}

// Builds the actual PATCH payload (snake_case, only fields present in the
// change) and one human-readable diff line for the summary.
function buildPatchAndDiffLine(change, currentItem, baseNameById, dayLabelById) {
  const patch = {};
  const parts = [];

  for (const def of fieldDefs(baseNameById, dayLabelById)) {
    if (!(def.camel in change)) continue;
    const newValue = change[def.camel];
    const oldValue = currentItem[def.snake];
    if (newValue === oldValue) continue;

    patch[def.snake] = newValue;
    const format = def.format || ((v) => (v == null ? "(none)" : String(v)));
    parts.push(`${def.camel} ${format(oldValue)} → ${format(newValue)}`);
  }

  // updated_at is deliberately NOT set here — this patch may sit pending for
  // up to 30 minutes before confirm_update_trip_item actually applies it,
  // so that timestamp is set fresh at confirm time instead.
  const line = parts.length > 0 ? `${currentItem.title}: ${parts.join(", ")}` : null;
  return { patch, line };
}

async function fetchCurrentItems(tripId, itemIds, bearer) {
  const rows = await selectRows(
    "trip_items",
    { trip_id: `eq.${tripId}`, id: `in.(${itemIds.join(",")})`, deleted_at: "is.null", select: "*" },
    { bearer }
  );
  return new Map(rows.map((row) => [row.id, row]));
}

function registerProposeUpdateTripItem(server, ctx) {
  server.registerTool(
    "propose_update_trip_item",
    {
      title: "Propose edits to one or more existing trip items",
      description:
        "Propose changes to one or more existing items on a trip — time, day/base assignment, status " +
        "(including marking something confirmed or reserved), cost, confirmation number, notes, or " +
        "reordering. Does NOT change anything yet: it validates the changes and returns a plain-language " +
        "summary plus a proposalId. Show the summary to the user and get their go-ahead, then call " +
        "confirm_update_trip_item with that proposalId to actually apply it. The proposal expires after " +
        "30 minutes if not confirmed.\n\n" +
        "Bundle everything from one request into a single call (e.g. every change for 'replan Day 3') " +
        "rather than one call per item — up to 10 items per proposal. For a bigger reorganization " +
        "spanning many days, make one proposal per day rather than one giant proposal, so the user can " +
        "review each one clearly.\n\n" +
        "Changing itemType requires explicitly setting the new sub-type field (mealSlot/activityType/" +
        "transportMode) and clearing the old one (pass it as null) in the same change — otherwise the " +
        "proposal is rejected for an inconsistent item.",
      inputSchema: {
        tripId: z.string().uuid().describe("The trip's id, from list_trips."),
        changes: z
          .array(changeEntrySchema())
          .min(1)
          .max(MAX_CHANGESET_ITEMS)
          .describe(
            `1–${MAX_CHANGESET_ITEMS} item edits. Each entry needs itemId plus only the fields actually ` +
              "changing — omit anything left as-is. Nullable fields (baseId, dayId, mealSlot, activityType, " +
              "transportMode, transportOrigin, transportDestination, timeStart, timeEnd, costLow, costHigh, " +
              "confirmationRef, url, notes, checkOutDate) accept null to explicitly clear them."
          ),
      },
    },
    withToolErrorHandling(async ({ tripId, changes }) => {
      const itemIds = changes.map((change) => change.itemId);
      if (new Set(itemIds).size !== itemIds.length) {
        return { isError: true, content: [{ type: "text", text: "The same itemId appears more than once in this changeset." }] };
      }

      const bearer = await ctx.getSupabaseAccessToken();

      const [trips, bases, days] = await Promise.all([
        selectRows("trips", { id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer }),
        selectForTrip("trip_bases", tripId, "id,name", { bearer }),
        selectForTrip("trip_days", tripId, "id,day_number", { bearer }),
      ]);
      if (!trips[0]) {
        return { isError: true, content: [{ type: "text", text: "No trip found with that id, or you don't have access to it." }] };
      }

      const baseNameById = Object.fromEntries(bases.map((b) => [b.id, b.name]));
      const dayLabelById = Object.fromEntries(days.map((d) => [d.id, `Day ${d.day_number}`]));

      const currentItems = await fetchCurrentItems(tripId, itemIds, bearer);
      const missing = itemIds.filter((id) => !currentItems.has(id));
      if (missing.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `No item found on this trip for id(s): ${missing.join(", ")}` }],
        };
      }

      const diffLines = [];
      const patchesByItemId = {};

      for (const change of changes) {
        const currentItem = currentItems.get(change.itemId);

        if ("baseId" in change && change.baseId != null && !(change.baseId in baseNameById)) {
          return { isError: true, content: [{ type: "text", text: `baseId ${change.baseId} doesn't belong to this trip.` }] };
        }
        if ("dayId" in change && change.dayId != null && !(change.dayId in dayLabelById)) {
          return { isError: true, content: [{ type: "text", text: `dayId ${change.dayId} doesn't belong to this trip.` }] };
        }

        const typeError = validateMergedItemType(change, currentItem);
        if (typeError) {
          return { isError: true, content: [{ type: "text", text: `${currentItem.title}: ${typeError}` }] };
        }

        const { patch, line } = buildPatchAndDiffLine(change, currentItem, baseNameById, dayLabelById);
        if (Object.keys(patch).length === 0) {
          return { isError: true, content: [{ type: "text", text: `No changes given for item '${currentItem.title}'.` }] };
        }
        patchesByItemId[change.itemId] = patch;
        if (line) diffLines.push(line);
      }

      const summary = diffLines.join("\n");
      const proposalId = await createProposal({
        connectionId: ctx.connectionId,
        userId: ctx.userId,
        tripId,
        changeset: itemIds.map((itemId) => ({ itemId, patch: patchesByItemId[itemId] })),
        summary,
      });

      const result = { proposalId, summary, expiresInMinutes: 30 };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    })
  );
}

module.exports = { registerProposeUpdateTripItem };
