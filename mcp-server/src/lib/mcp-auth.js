const { sha256Hex, randomToken, encrypt, decrypt } = require("./crypto.js");
const { callRpc, refreshSupabaseSession } = require("./supabase-rest.js");

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour — Claude refreshes reactively on 401
// and proactively up to 5 minutes before this expiry, per Anthropic's connector docs.

// Called on every incoming MCP request. Returns null for anything not
// usable (missing, revoked, expired, needs_reconnect) rather than throwing,
// since "not authenticated" is an expected outcome here, not an error.
async function validateAccessToken(rawToken) {
  try {
    const rows = await callRpc("mcp_validate_access_token", {
      p_access_token_hash: sha256Hex(rawToken),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;

    return {
      connectionId: row.connection_id,
      userId: row.user_id,
      encryptedSupabaseRefreshToken: row.encrypted_refresh_token,
    };
  } catch {
    return null;
  }
}

// Mints this server's own opaque access/refresh token pair for a connection
// and stores their hashes (never the raw values) plus the given encrypted
// Supabase refresh token.
async function issueTokensForConnection(connectionId, encryptedSupabaseRefreshToken) {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  const accessTokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();

  await callRpc("mcp_finalize_token_issuance", {
    p_connection_id: connectionId,
    p_encrypted_supabase_refresh_token: encryptedSupabaseRefreshToken,
    p_access_token_hash: sha256Hex(accessToken),
    p_access_token_expires_at: accessTokenExpiresAt,
    p_refresh_token_hash: sha256Hex(refreshToken),
  });

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

// Exchanges the stored (encrypted) Supabase refresh token for a fresh
// Supabase access token, and rotates the stored refresh token — Supabase
// rotates it on every use. Uses a compare-and-swap update so that if two
// requests race on the same connection, the loser retries once against
// whatever the winner just stored, instead of both trying to reuse a
// refresh token Supabase has already invalidated.
//
// There are two distinct ways a request can lose that race, and both need
// the same "re-read latest and retry once" treatment:
//   1. Our own CAS write loses (line ~row?.swapped false below) — the
//      RPC itself hands back the current value, so we retry with that.
//   2. Supabase's own /token endpoint rejects OUR refresh call with
//      invalid_grant/400 because a concurrent request already consumed
//      this exact refresh token before we got there. Unlike case 1, this
//      fails before we ever reach the CAS RPC, so it has no "current
//      value" handed back — mcp_validate_access_token does a plain
//      (non-CAS) read of the connection's row, so re-calling it gets us
//      the latest stored value to retry against once.
// Only mark the connection needs_reconnect when this retry is exhausted
// or the failure isn't a same-token-reused race at all (e.g. the
// credential really is dead) — a transient network/5xx blip against
// Supabase's own endpoint shouldn't be treated as "reconnect your account".
async function rotateSupabaseSession(rawAccessToken, connectionId, encryptedRefreshToken) {
  let currentEncrypted = encryptedRefreshToken;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const supabaseRefreshToken = decrypt(currentEncrypted);
      const session = await refreshSupabaseSession(supabaseRefreshToken);
      const newEncrypted = encrypt(session.refresh_token);

      const rows = await callRpc("mcp_rotate_supabase_refresh_token", {
        p_connection_id: connectionId,
        p_expected_encrypted_refresh_token: currentEncrypted,
        p_new_encrypted_refresh_token: newEncrypted,
      });
      const row = Array.isArray(rows) ? rows[0] : rows;

      if (row?.swapped) {
        return { supabaseAccessToken: session.access_token, encryptedSupabaseRefreshToken: newEncrypted };
      }

      // Another request rotated it first — retry once against the latest value.
      currentEncrypted = row?.current_encrypted_refresh_token;
      if (!currentEncrypted) break;
    } catch (error) {
      const isTokenReuseCollision = error.code === "invalid_grant" || error.status === 400;

      if (attempt === 0 && isTokenReuseCollision) {
        const fresh = await validateAccessToken(rawAccessToken);
        if (fresh?.encryptedSupabaseRefreshToken) {
          currentEncrypted = fresh.encryptedSupabaseRefreshToken;
          continue;
        }
      }

      if (attempt === 1 || isTokenReuseCollision) {
        await callRpc("mcp_set_connection_status", { p_connection_id: connectionId, p_status: "needs_reconnect" });
        error.needsReconnect = true;
      }
      throw error;
    }
  }

  await callRpc("mcp_set_connection_status", { p_connection_id: connectionId, p_status: "needs_reconnect" });
  const error = new Error("Could not refresh the underlying session after a retry.");
  error.needsReconnect = true;
  throw error;
}

// Starting points chosen from estimated usage (most days hold well under 10
// items), not tuned from real data — revisit all three if real Phase 3
// usage shows they're too tight (legitimate proposals getting rejected) or
// too loose (meaningful spam/mess risk).
const RATE_LIMIT_MAX_WRITES = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_CHANGESET_ITEMS = 10;
const PROPOSAL_EXPIRY_MINUTES = 30;

// Atomic check-and-increment against mcp_connections' write_count/window —
// see the migration for why this is race-safe across concurrent requests
// on the same connection. Returns false once the connection has made
// RATE_LIMIT_MAX_WRITES writes within the current window. Used directly by
// create_trip_item (count=1 per call); confirm_update_trip_item instead
// goes through claimProposal below, which folds the same check into the
// proposal-claim transaction rather than calling this separately.
async function checkAndIncrementRateLimit(connectionId) {
  const rows = await callRpc("mcp_check_and_increment_rate_limit", {
    p_connection_id: connectionId,
    p_limit: RATE_LIMIT_MAX_WRITES,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return Boolean(row?.allowed);
}

// Records one write to mcp_write_log. Best-effort in the sense that a
// logging failure shouldn't be allowed to look like the write itself
// failed — callers should log after the real write succeeds, not before.
// state/expiresAt/proposalId default to Phase 2's original shape (a single
// committed row with no expiry or proposal link) so existing call sites are
// unaffected; propose/confirm (Phase 3) pass them explicitly.
async function logWrite({ connectionId, userId, toolName, tripId, itemId, payload, state, expiresAt, proposalId }) {
  const rows = await callRpc("mcp_log_write", {
    p_connection_id: connectionId,
    p_user_id: userId,
    p_tool_name: toolName,
    p_trip_id: tripId || null,
    p_item_id: itemId || null,
    p_payload: payload || null,
    p_state: state || "committed",
    p_expires_at: expiresAt || null,
    p_proposal_id: proposalId || null,
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.id;
}

// Creates a pending proposal row and returns its id. Never touches
// trip_items — propose_update_trip_item only validates and records intent.
async function createProposal({ connectionId, userId, tripId, changeset, summary }) {
  const expiresAt = new Date(Date.now() + PROPOSAL_EXPIRY_MINUTES * 60 * 1000).toISOString();
  return logWrite({
    connectionId,
    userId,
    toolName: "propose_update_trip_item",
    tripId,
    payload: { changeset, summary },
    state: "pending",
    expiresAt,
  });
}

// Atomically validates + rate-limit-checks + claims a proposal in one
// transaction (see mcp-server-spec.md's Phase 3 design decisions for why
// this can't be two separate steps without a race between them). Returns
// { ok: true, tripId, changeset, summary } on success, or
// { ok: false, reason } where reason is one of:
// "not_found" | "already_resolved" | "expired" | "rate_limited".
async function claimProposal({ proposalId, connectionId }) {
  const rows = await callRpc("mcp_claim_proposal", {
    p_proposal_id: proposalId,
    p_connection_id: connectionId,
    p_rate_limit: RATE_LIMIT_MAX_WRITES,
    p_rate_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  const row = Array.isArray(rows) ? rows[0] : rows;

  if (!row) return { ok: false, reason: "not_found" };
  if (row.result !== "ok") return { ok: false, reason: row.result };

  const payload = row.payload || {};
  return { ok: true, tripId: row.trip_id, changeset: payload.changeset || [], summary: payload.summary || "" };
}

module.exports = {
  validateAccessToken,
  issueTokensForConnection,
  rotateSupabaseSession,
  checkAndIncrementRateLimit,
  logWrite,
  createProposal,
  claimProposal,
  ACCESS_TOKEN_TTL_SECONDS,
  MAX_CHANGESET_ITEMS,
  PROPOSAL_EXPIRY_MINUTES,
};
