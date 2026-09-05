const { z } = require("zod");
const { selectRows, selectForTrip, insertRow } = require("../lib/supabase-rest.js");
const { checkAndIncrementRateLimit, logWrite } = require("../lib/mcp-auth.js");
const { withToolErrorHandling } = require("../lib/tool-error.js");
const { ITEM_TYPES, MEAL_SLOTS, ACTIVITY_TYPES, TRANSPORT_MODES, optionalOf, validateItemTypeFields } = require("../lib/item-fields.js");

// Appends to the end of the trip's existing item order, same convention the
// app's own "add item" UI uses.
async function nextSortOrderForTrip(tripId, bearer) {
  const existingItems = await selectForTrip("trip_items", tripId, "sort_order", { bearer });
  return existingItems.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), -1) + 1;
}

// Confirms the trip exists (and is visible to this user via RLS), and that
// baseId/dayId — if given — actually belong to that trip rather than some
// other trip. Returns an error string, or null if everything checks out.
async function validateTripReferences(tripId, baseId, dayId, bearer) {
  const [trips, base, day] = await Promise.all([
    selectRows("trips", { id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer }),
    baseId
      ? selectRows("trip_bases", { id: `eq.${baseId}`, trip_id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer })
      : null,
    dayId
      ? selectRows("trip_days", { id: `eq.${dayId}`, trip_id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer })
      : null,
  ]);

  if (!trips[0]) return "No trip found with that id, or you don't have access to it.";
  if (baseId && !base[0]) return "That baseId doesn't belong to this trip.";
  if (dayId && !day[0]) return "That dayId doesn't belong to this trip.";
  return null;
}

// Builds and inserts the actual trip_items row. status/is_anchor are always
// the Phase 2 defaults — never taken from the caller.
function insertTripItem(fields, bearer) {
  const { tripId, userId, title, itemType, baseId, dayId, mealSlot, activityType, transportMode, notes, url, address, sortOrder } = fields;
  return insertRow(
    "trip_items",
    {
      trip_id: tripId,
      base_id: baseId || null,
      day_id: dayId || null,
      created_by: userId,
      title,
      item_type: itemType,
      status: "idea",
      is_anchor: false,
      meal_slot: mealSlot || null,
      activity_type: activityType || null,
      transport_mode: transportMode || null,
      notes: notes || null,
      url: url || null,
      address: address || null,
      sort_order: sortOrder,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { bearer }
  );
}

// ctx: { getSupabaseAccessToken, userId, connectionId } — see mcp-server/src/index.js.
// This is Phase 2's only write tool. Two hardcoded rules are the whole point
// of this phase: it can only ever create a new `status: 'idea'` item, never
// touch an existing row, and never create anything already confirmed/reserved.
// The actual insert goes through the user's own Supabase access token, so
// RLS's real trip_members check is what actually decides whether the write
// is allowed — not any logic in this file.
function registerCreateTripItem(server, ctx) {
  server.registerTool(
    "create_trip_item",
    {
      title: "Add a new idea to a trip",
      description:
        "Add a new idea to a trip's master list. Always creates the item with status 'idea' and " +
        "is_anchor false, regardless of what's passed — this tool can only suggest new ideas, " +
        "never create something already confirmed/reserved, and never modifies an existing item. " +
        "Get a trip's id from `list_trips`.\n\n" +
        "Base assignment: if you don't already know the trip's bases, call `get_trip` first. Try " +
        "to infer the right `baseId` from context (the destination or activity mentioned); if the " +
        "trip has exactly one base, default to it unless the idea is clearly trip-wide (e.g. an " +
        "inbound/outbound flight). Leave `baseId` empty rather than guessing when it's genuinely " +
        "ambiguous or the trip has no bases yet — an unplaced idea is completely normal and the " +
        "user can assign it later.",
      inputSchema: {
        tripId: z.string().uuid().describe("The trip's id, from list_trips."),
        title: z.string().min(1).describe("Short title for the idea, e.g. 'Try the tasting menu at Noma'."),
        itemType: z.enum(ITEM_TYPES).describe("meal, activity, transport, or lodging."),
        baseId: optionalOf(z.string().uuid()).describe(
          "Which of the trip's bases this belongs to. Omit if unknown or genuinely ambiguous — see guidance above."
        ),
        dayId: optionalOf(z.string().uuid()).describe("Which day this belongs to, if known. Usually omitted for a loose idea."),
        mealSlot: optionalOf(z.enum(MEAL_SLOTS)).describe("Required only when itemType is 'meal'."),
        activityType: optionalOf(z.enum(ACTIVITY_TYPES)).describe("Required only when itemType is 'activity'."),
        transportMode: optionalOf(z.enum(TRANSPORT_MODES)).describe("Required only when itemType is 'transport'."),
        notes: optionalOf(z.string()).describe("Any free-text notes about the idea."),
        url: optionalOf(z.string()).describe("A link related to the idea (restaurant site, listing, article, etc.)."),
        address: optionalOf(z.string()).describe(
          "A physical address for this item — renders as a tap-to-navigate map link in the app."
        ),
      },
    },
    withToolErrorHandling(async ({ tripId, title, itemType, baseId, dayId, mealSlot, activityType, transportMode, notes, url, address }) => {
      const fieldError = validateItemTypeFields(itemType, { mealSlot, activityType, transportMode });
      if (fieldError) {
        return { isError: true, content: [{ type: "text", text: fieldError }] };
      }

      const allowed = await checkAndIncrementRateLimit(ctx.connectionId);
      if (!allowed) {
        return {
          isError: true,
          content: [{ type: "text", text: "Too many changes at once — try again in a minute." }],
        };
      }

      const bearer = await ctx.getSupabaseAccessToken();

      const referenceError = await validateTripReferences(tripId, baseId, dayId, bearer);
      if (referenceError) {
        return { isError: true, content: [{ type: "text", text: referenceError }] };
      }

      const sortOrder = await nextSortOrderForTrip(tripId, bearer);
      const created = await insertTripItem(
        { tripId, userId: ctx.userId, title, itemType, baseId, dayId, mealSlot, activityType, transportMode, notes, url, address, sortOrder },
        bearer
      );

      // The item is already created at this point — a logging failure must
      // not surface as a tool error, or the caller will see "failed" and
      // retry a write that actually succeeded.
      try {
        await logWrite({
          connectionId: ctx.connectionId,
          userId: ctx.userId,
          toolName: "create_trip_item",
          tripId,
          itemId: created?.id,
          payload: { title, itemType, baseId: baseId || null, dayId: dayId || null },
        });
      } catch (error) {
        console.error("create_trip_item: audit log write failed (item was still created)", error);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(created, null, 2) }],
        structuredContent: created,
      };
    })
  );
}

module.exports = { registerCreateTripItem };
