const { callRpc } = require("../lib/supabase-rest.js");
const { issueTokensForConnection, rotateSupabaseSession } = require("../lib/mcp-auth.js");
const { sha256Hex } = require("../lib/crypto.js");

function oauthError(status, error, description) {
  const err = new Error(description || error);
  err.status = status;
  err.oauthError = error;
  return err;
}

// RFC 6749 token endpoint: handles both grant types Claude.ai uses —
// authorization_code (initial connect) and refresh_token (every renewal
// after that, reactive on 401 or proactive ~5 min before expiry).
async function issueToken(params) {
  if (params.grant_type === "authorization_code") {
    return handleAuthorizationCodeGrant(params);
  }

  if (params.grant_type === "refresh_token") {
    return handleRefreshTokenGrant(params);
  }

  throw oauthError(400, "unsupported_grant_type", `Unsupported grant_type: ${params.grant_type}`);
}

async function handleAuthorizationCodeGrant(params) {
  const { code, client_id: clientId, redirect_uri: redirectUri, code_verifier: codeVerifier } = params;
  if (!code || !clientId || !redirectUri || !codeVerifier) {
    throw oauthError(400, "invalid_request", "Missing required parameters.");
  }

  let exchanged;
  try {
    const rows = await callRpc("mcp_exchange_authorization_code", {
      p_code: code,
      p_client_id: clientId,
      p_redirect_uri: redirectUri,
      p_code_verifier: codeVerifier,
    });
    exchanged = Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    console.error("mcp_exchange_authorization_code failed:", error);
    throw oauthError(400, "invalid_grant", "The authorization code is invalid, expired, or already used.");
  }

  if (!exchanged?.connection_id) {
    throw oauthError(400, "invalid_grant", "The authorization code is invalid, expired, or already used.");
  }

  const tokens = await issueTokensForConnection(exchanged.connection_id, exchanged.encrypted_refresh_token);
  return toTokenResponse(tokens);
}

async function handleRefreshTokenGrant(params) {
  const presentedRefreshToken = params.refresh_token;
  if (!presentedRefreshToken) {
    throw oauthError(400, "invalid_request", "Missing refresh_token.");
  }

  let rows;
  try {
    rows = await callRpc("mcp_lookup_connection_by_refresh_hash", {
      p_refresh_token_hash: sha256Hex(presentedRefreshToken),
    });
  } catch (error) {
    console.error("mcp_lookup_connection_by_refresh_hash failed:", error);
    throw oauthError(400, "invalid_grant", "The refresh token is not recognized.");
  }
  const row = Array.isArray(rows) ? rows[0] : rows;

  if (!row?.connection_id || row.revoked_at || row.status === "needs_reconnect" || new Date(row.expires_at) < new Date()) {
    throw oauthError(400, "invalid_grant", "This connection needs to be reconnected.");
  }

  let rotated;
  try {
    rotated = await rotateSupabaseSession(row.connection_id, row.encrypted_refresh_token);
  } catch (error) {
    console.error("rotateSupabaseSession failed:", error);
    throw oauthError(400, "invalid_grant", "Could not refresh the underlying session. Please reconnect.");
  }

  const tokens = await issueTokensForConnection(row.connection_id, rotated.encryptedSupabaseRefreshToken);
  return toTokenResponse(tokens);
}

function toTokenResponse(tokens) {
  return {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_type: "bearer",
    expires_in: tokens.expiresIn,
  };
}

module.exports = { issueToken, oauthError };
