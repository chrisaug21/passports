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

const ROTATION_CLAIM_STALE_SECONDS = 15;
const ROTATION_CLAIM_RETRY_DELAYS_MS = [250, 500, 750]; // ~1.5s of waiting across 3 retries

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Asks to be the one allowed to rotate this connection's Supabase session
// right now. Always returns the connection's current state regardless of
// whether the claim succeeded, so a caller that doesn't get it can still
// see whether someone else already finished the rotation.
async function claimRotation(connectionId) {
  const rows = await callRpc("mcp_claim_rotation", {
    p_connection_id: connectionId,
    p_stale_after_seconds: ROTATION_CLAIM_STALE_SECONDS,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

// Retries claimRotation with a short backoff until it succeeds or the
// retries run out. Throws a plain (non-needsReconnect) error on giving up,
// since losing this race is transient contention, not a dead credential.
async function acquireRotationClaim(connectionId) {
  let claim = await claimRotation(connectionId);
  for (const delayMs of ROTATION_CLAIM_RETRY_DELAYS_MS) {
    if (claim?.claimed) break;
    await sleep(delayMs);
    claim = await claimRotation(connectionId);
  }

  if (!claim?.claimed) {
    throw new Error("Another request is already refreshing this connection. Try again shortly.");
  }

  return claim;
}

// Exchanges the stored (encrypted) Supabase refresh token for a fresh
// Supabase access token, and rotates the stored refresh token — Supabase
// rotates it on every use.
//
// Two independent code paths can end up calling this for the same
// connection close together: a tool call's per-request lookup (index.js)
// and Claude's own OAuth refresh_token grant (oauth/token.js). If both
// present the same (not-yet-rotated) Supabase refresh token to Supabase's
// /token endpoint within moments of each other, Supabase treats the second
// one as a stolen-token replay and revokes the ENTIRE session chain —
// including the token the first request just legitimately obtained. This
// is exactly what broke the connector in production on 2026-08-31 (two
// requests 12 seconds apart, confirmed via Supabase's own auth logs,
// error_code "refresh_token_already_used").
//
// mcp_claim_rotation serializes this: only the request holding the claim
// actually calls Supabase. A request that doesn't get the claim waits
// briefly and tries again — by the time it gets in, the winner has either
// already stored a fresh, not-yet-consumed refresh token (which this
// request can then safely rotate itself), or the claim is released and
// this request becomes the new owner.
async function rotateSupabaseSession(connectionId, encryptedRefreshToken) {
  const claim = await acquireRotationClaim(connectionId);

  if (!claim.encrypted_refresh_token || claim.revoked_at || claim.status === "needs_reconnect") {
    const error = new Error("This connection needs to be reconnected.");
    error.needsReconnect = true;
    throw error;
  }

  let currentEncrypted = claim.encrypted_refresh_token;

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

      // Shouldn't normally happen while we hold the claim — defensive
      // fallback in case the stored value moved anyway.
      currentEncrypted = row?.current_encrypted_refresh_token;
      if (!currentEncrypted) break;
    } catch (error) {
      const isTokenReuseCollision = error.code === "invalid_grant" || error.status === 400;

      // Still holding our claim, so this just re-reads the row rather than
      // re-attempting the claim itself.
      if (attempt === 0 && isTokenReuseCollision) {
        const fresh = await claimRotation(connectionId);
        if (fresh?.encrypted_refresh_token && fresh.encrypted_refresh_token !== currentEncrypted) {
          currentEncrypted = fresh.encrypted_refresh_token;
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

// Starting points chosen from estimated usage, not tuned from real data.
// Raised from 10 to 20 writes/60s after real Phase 3 usage showed 10 was too
// tight: a multi-day itinerary reshuffle (moving a meal cascades into moving
// other items to different days/times) routinely needs more than 10 confirmed
// edits in a burst. Revisit again if this still gets hit, or if it turns out
// too loose (meaningful spam/mess risk).
const RATE_LIMIT_MAX_WRITES = 20;
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
