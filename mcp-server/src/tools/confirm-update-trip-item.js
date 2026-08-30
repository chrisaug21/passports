const { z } = require("zod");
const { selectRows, updateRow } = require("../lib/supabase-rest.js");
const { claimProposal, logWrite } = require("../lib/mcp-auth.js");
const { withToolErrorHandling } = require("../lib/tool-error.js");

const REJECTION_MESSAGES = {
  not_found: "No pending proposal found with that id.",
  already_resolved: "This proposal was already confirmed (or is no longer pending).",
  expired: "This proposal expired (30-minute limit) — call propose_update_trip_item again to create a new one.",
  rate_limited: "Too many changes at once — try again in a minute.",
};

// Applies one item's patch: reads the current row (the before-snapshot),
// applies the PATCH via the user's own bearer token so RLS is the real
// gate, then logs a committed audit row with both snapshots. Failures are
// caught here, not thrown — confirm_update_trip_item is best-effort across
// the batch, not one all-or-nothing transaction (see mcp-server-spec.md's
// Phase 3 design decisions for why: the write goes through the user's real
// RLS-scoped session, not a privileged transaction, so true cross-item
// atomicity isn't available without bypassing RLS).
async function applyOneChange({ itemId, patch }, ctx, bearer, tripId, proposalId) {
  let before;
  let after;

  try {
    const beforeRows = await selectRows("trip_items", { id: `eq.${itemId}`, deleted_at: "is.null", select: "*" }, { bearer });
    before = beforeRows[0];
    if (!before) {
      return { itemId, ok: false, reason: "Item no longer exists or is no longer accessible." };
    }

    after = await updateRow("trip_items", { id: `eq.${itemId}` }, { ...patch, updated_at: new Date().toISOString() }, { bearer });
    if (!after) {
      return { itemId, ok: false, reason: "Update did not apply — item may no longer be accessible." };
    }
  } catch (error) {
    // A failure applying THIS item must not abort the rest of the batch —
    // confirm_update_trip_item is best-effort per item, not one
    // all-or-nothing transaction (see the file-level comment above).
    console.error(`confirm_update_trip_item: failed to apply item ${itemId}`, error);
    return { itemId, ok: false, reason: "Could not apply this change right now." };
  }

  try {
    await logWrite({
      connectionId: ctx.connectionId,
      userId: ctx.userId,
      toolName: "confirm_update_trip_item",
      tripId,
      itemId,
      payload: { before, after },
      proposalId,
    });
  } catch (error) {
    // The item update above already succeeded — a logging failure must not
    // be reported as the write itself failing.
    console.error("confirm_update_trip_item: audit log write failed (item was still updated)", error);
  }

  return { itemId, ok: true };
}

function registerConfirmUpdateTripItem(server, ctx) {
  server.registerTool(
    "confirm_update_trip_item",
    {
      title: "Confirm and apply a previously proposed edit",
      description:
        "Commits a proposal created by propose_update_trip_item. Call this only after showing the " +
        "proposal's summary to the user and getting a real go-ahead — this is the step that actually " +
        "changes the trip. Applies every item in the proposal; if one item fails (e.g. it was deleted " +
        "since the proposal was made), the rest still apply and the failure is reported back clearly.",
      inputSchema: {
        proposalId: z.string().uuid().describe("The proposalId returned by propose_update_trip_item."),
      },
    },
    withToolErrorHandling(async ({ proposalId }) => {
      const claim = await claimProposal({ proposalId, connectionId: ctx.connectionId });
      if (!claim.ok) {
        const text = REJECTION_MESSAGES[claim.reason] || "Could not confirm that proposal right now.";
        return { isError: true, content: [{ type: "text", text }] };
      }

      const bearer = await ctx.getSupabaseAccessToken();
      const outcomes = [];
      for (const change of claim.changeset) {
        outcomes.push(await applyOneChange(change, ctx, bearer, claim.tripId, proposalId));
      }

      const applied = outcomes.filter((o) => o.ok).map((o) => o.itemId);
      const failed = outcomes.filter((o) => !o.ok).map(({ itemId, reason }) => ({ itemId, reason }));

      const result = { proposalId, applied, failed };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    })
  );
}

module.exports = { registerConfirmUpdateTripItem };
