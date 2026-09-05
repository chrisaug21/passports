const { z } = require("zod");
const { selectRows, updateRow } = require("../lib/supabase-rest.js");
const { claimProposal, logWrite } = require("../lib/mcp-auth.js");
const { withToolErrorHandling } = require("../lib/tool-error.js");

const REJECTION_MESSAGES = {
  not_found: "No pending proposal found with that id.",
  already_resolved: "This proposal was already confirmed (or is no longer pending).",
  expired: "This proposal expired (30-minute limit) — call propose_update_overview_block again to create a new one.",
  rate_limited: "Too many changes at once — try again in a minute.",
};

// Applies one block's patch: reads the current row (the before-snapshot),
// applies the PATCH via the user's own bearer token so RLS is the real gate,
// then logs a committed audit row with both snapshots. Best-effort across
// the batch, not one all-or-nothing transaction — mirrors
// confirm-update-trip-item.js's applyOneChange exactly, just against
// trip_overview_blocks/blockId instead of trip_items/itemId.
async function applyOneChange({ blockId, patch }, ctx, bearer, tripId, proposalId) {
  let before;
  let after;

  try {
    const beforeRows = await selectRows("trip_overview_blocks", { id: `eq.${blockId}`, deleted_at: "is.null", select: "*" }, { bearer });
    before = beforeRows[0];
    if (!before) {
      return { blockId, ok: false, reason: "Block no longer exists or is no longer accessible." };
    }

    after = await updateRow("trip_overview_blocks", { id: `eq.${blockId}` }, { ...patch, updated_at: new Date().toISOString() }, { bearer });
    if (!after) {
      return { blockId, ok: false, reason: "Update did not apply — block may no longer be accessible." };
    }
  } catch (error) {
    // A failure applying THIS block must not abort the rest of the batch —
    // same reasoning as confirm_update_trip_item.
    console.error(`confirm_update_overview_block: failed to apply block ${blockId}`, error);
    return { blockId, ok: false, reason: "Could not apply this change right now." };
  }

  try {
    await logWrite({
      connectionId: ctx.connectionId,
      userId: ctx.userId,
      toolName: "confirm_update_overview_block",
      tripId,
      itemId: blockId,
      payload: { before, after },
      proposalId,
    });
  } catch (error) {
    // The block update above already succeeded — a logging failure must not
    // be reported as the write itself failing.
    console.error("confirm_update_overview_block: audit log write failed (block was still updated)", error);
  }

  return { blockId, ok: true };
}

function registerConfirmUpdateOverviewBlock(server, ctx) {
  server.registerTool(
    "confirm_update_overview_block",
    {
      title: "Confirm and apply a previously proposed overview block edit",
      description:
        "Commits a proposal created by propose_update_overview_block. Call this only after showing the " +
        "proposal's summary to the user and getting a real go-ahead — this is the step that actually " +
        "changes the trip's overview content. Applies every block in the proposal; if one fails (e.g. it " +
        "was deleted since the proposal was made), the rest still apply and the failure is reported back " +
        "clearly.",
      inputSchema: {
        proposalId: z.string().uuid().describe("The proposalId returned by propose_update_overview_block."),
      },
    },
    withToolErrorHandling(async ({ proposalId }) => {
      const claim = await claimProposal({
        proposalId,
        connectionId: ctx.connectionId,
        expectedToolName: "propose_update_overview_block",
      });
      if (!claim.ok) {
        const text = REJECTION_MESSAGES[claim.reason] || "Could not confirm that proposal right now.";
        return { isError: true, content: [{ type: "text", text }] };
      }

      const bearer = await ctx.getSupabaseAccessToken();
      const outcomes = [];
      for (const change of claim.changeset) {
        outcomes.push(await applyOneChange(change, ctx, bearer, claim.tripId, proposalId));
      }

      const applied = outcomes.filter((o) => o.ok).map((o) => o.blockId);
      const failed = outcomes.filter((o) => !o.ok).map(({ blockId, reason }) => ({ blockId, reason }));

      const result = { proposalId, applied, failed };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    })
  );
}

module.exports = { registerConfirmUpdateOverviewBlock };
