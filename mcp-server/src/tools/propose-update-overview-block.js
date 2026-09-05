const { z } = require("zod");
const { selectRows } = require("../lib/supabase-rest.js");
const { createProposal, MAX_CHANGESET_ITEMS } = require("../lib/mcp-auth.js");
const { withToolErrorHandling } = require("../lib/tool-error.js");
const { arrayOf } = require("../lib/item-fields.js");
const { OVERVIEW_CATEGORIES, OVERVIEW_CATEGORY_LABELS } = require("../lib/overview-fields.js");

// Every editable field: how it maps to the trip_overview_blocks column,
// whether it can be explicitly cleared (set to null) via a proposed change.
// baseId/category-scope changes aren't here at all — scope is fixed at
// create time per the app's own editing rules (see the spec doc), so moving
// a block to a different base means deleting and recreating it, not editing.
const FIELD_DEFS = [
  { camel: "category", snake: "category", nullable: false, zod: z.enum(OVERVIEW_CATEGORIES) },
  { camel: "subtitle", snake: "subtitle", nullable: true, zod: z.string() },
  { camel: "body", snake: "body", nullable: false, zod: z.string().min(1) },
  { camel: "sortOrder", snake: "sort_order", nullable: false, zod: z.number().int() },
  { camel: "isPublished", snake: "is_published", nullable: false, zod: z.boolean() },
];

// Builds the zod shape for one changeset entry: blockId plus every editable
// field, each genuinely optional (an absent key means "not changing this
// field") and, where nullable, unioned with z.null() to explicitly clear it.
// The null branch carries a .describe() so zod's JSON Schema output keeps an
// explicit anyOf instead of collapsing to a type array some MCP clients
// mishandle — see propose-update-trip-item.js's changeEntrySchema for the
// full explanation of why that matters here.
function changeEntrySchema() {
  const shape = { blockId: z.string().uuid() };
  for (const def of FIELD_DEFS) {
    shape[def.camel] = def.nullable
      ? z.union([def.zod, z.null().describe("null clears this field")]).optional()
      : def.zod.optional();
  }
  return z.object(shape).strict();
}

function labelForBlock(block) {
  return block.subtitle || OVERVIEW_CATEGORY_LABELS[block.category] || "block";
}

// Builds the actual PATCH payload (snake_case, only fields present in the
// change) and one human-readable diff line for the summary.
function buildPatchAndDiffLine(change, currentBlock) {
  const patch = {};
  const parts = [];

  for (const def of FIELD_DEFS) {
    if (!(def.camel in change)) continue;
    const newValue = change[def.camel];
    const oldValue = currentBlock[def.snake];
    if (newValue === oldValue) continue;

    patch[def.snake] = newValue;
    const format = (v) => (v == null ? "(none)" : String(v));
    parts.push(`${def.camel} ${format(oldValue)} → ${format(newValue)}`);
  }

  // updated_at is deliberately NOT set here — this patch may sit pending for
  // up to 30 minutes before confirm_update_overview_block actually applies
  // it, so that timestamp is set fresh at confirm time instead.
  const line = parts.length > 0 ? `${labelForBlock(currentBlock)}: ${parts.join(", ")}` : null;
  return { patch, line };
}

function validateAndBuildChange(change, currentBlock) {
  const { patch, line } = buildPatchAndDiffLine(change, currentBlock);
  if (Object.keys(patch).length === 0) {
    return { error: `No changes given for block '${labelForBlock(currentBlock)}'.` };
  }
  return { patch, line };
}

async function fetchCurrentBlocks(tripId, blockIds, bearer) {
  const rows = await selectRows(
    "trip_overview_blocks",
    { trip_id: `eq.${tripId}`, id: `in.(${blockIds.join(",")})`, deleted_at: "is.null", select: "*" },
    { bearer }
  );
  return new Map(rows.map((row) => [row.id, row]));
}

function registerProposeUpdateOverviewBlock(server, ctx) {
  server.registerTool(
    "propose_update_overview_block",
    {
      title: "Propose edits to one or more existing overview blocks",
      description:
        "Propose changes to one or more existing overview content blocks on a trip — category, subtitle, " +
        "body text, sort order, or publish state. Does NOT change anything yet: it validates the changes " +
        "and returns a plain-language summary plus a proposalId. Show the summary to the user and get " +
        "their go-ahead, then call confirm_update_overview_block with that proposalId to actually apply " +
        "it. The proposal expires after 30 minutes if not confirmed.\n\n" +
        "This cannot move a block to a different base or between trip-wide and base-specific — that scope " +
        "is fixed when a block is created. To relocate content, create a new block in the right place and " +
        "delete the old one from the app.\n\n" +
        "Setting isPublished true makes the block visible on the trip's public share link (if the trip is " +
        "public) — flag that clearly in what you tell the user before they confirm.",
      inputSchema: {
        tripId: z.string().uuid().describe("The trip's id, from list_trips."),
        changes: arrayOf(z.array(changeEntrySchema()).min(1).max(MAX_CHANGESET_ITEMS)).describe(
          `1–${MAX_CHANGESET_ITEMS} block edits. Each entry needs blockId (from list_overview_blocks) ` +
            "plus only the fields actually changing — omit anything left as-is. subtitle accepts null to " +
            "explicitly clear it."
        ),
      },
    },
    withToolErrorHandling(async ({ tripId, changes }) => {
      const blockIds = changes.map((change) => change.blockId);
      if (new Set(blockIds).size !== blockIds.length) {
        return { isError: true, content: [{ type: "text", text: "The same blockId appears more than once in this changeset." }] };
      }

      const bearer = await ctx.getSupabaseAccessToken();

      const trips = await selectRows("trips", { id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer });
      if (!trips[0]) {
        return { isError: true, content: [{ type: "text", text: "No trip found with that id, or you don't have access to it." }] };
      }

      const currentBlocks = await fetchCurrentBlocks(tripId, blockIds, bearer);
      const missing = blockIds.filter((id) => !currentBlocks.has(id));
      if (missing.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `No overview block found on this trip for id(s): ${missing.join(", ")}` }],
        };
      }

      const diffLines = [];
      const patchesByBlockId = new Map();

      for (const change of changes) {
        const outcome = validateAndBuildChange(change, currentBlocks.get(change.blockId));
        if (outcome.error) {
          return { isError: true, content: [{ type: "text", text: outcome.error }] };
        }
        patchesByBlockId.set(change.blockId, outcome.patch);
        if (outcome.line) diffLines.push(outcome.line);
      }

      const summary = diffLines.join("\n");
      const proposalId = await createProposal({
        connectionId: ctx.connectionId,
        userId: ctx.userId,
        tripId,
        toolName: "propose_update_overview_block",
        changeset: blockIds.map((blockId) => ({ blockId, patch: patchesByBlockId.get(blockId) })),
        summary,
      });

      const result = { proposalId, summary, expiresInMinutes: 30 };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    })
  );
}

module.exports = { registerProposeUpdateOverviewBlock };
