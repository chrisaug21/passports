const { encrypt } = require("../lib/crypto.js");
const { getSupabaseUser, upsertRow, callRpc } = require("../lib/supabase-rest.js");

// Called by the browser (already holding a live, logged-in Supabase
// session) right after the user clicks "Allow" on the consent screen. This
// is the one place the real Supabase refresh token is ever seen in transit
// — over a POST body, never a URL or a page — and it's encrypted the
// moment it arrives.
async function approveConnection({ supabaseAccessToken, supabaseRefreshToken, clientId, clientName, redirectUri, codeChallenge, codeChallengeMethod }) {
  if (!supabaseAccessToken || !supabaseRefreshToken || !clientId || !redirectUri || !codeChallenge) {
    const error = new Error("Missing required fields.");
    error.status = 400;
    throw error;
  }

  // Never trust a client-supplied user id — resolve it from Supabase itself.
  const user = await getSupabaseUser(supabaseAccessToken);
  if (!user?.id) {
    const error = new Error("Your session isn't valid. Please sign in again.");
    error.status = 401;
    throw error;
  }

  // Keyed on (user_id, label) rather than (user_id, client_id): a fresh
  // Dynamic Client Registration call mints a brand-new client_id every
  // time, including on a retry after a failed handshake. Matching on the
  // stable app identity (label) instead means a retry updates the same
  // row instead of creating a duplicate "Connected app" entry.
  await upsertRow(
    "mcp_connections",
    {
      user_id: user.id,
      client_id: clientId,
      label: clientName || "Connected app",
      encrypted_supabase_refresh_token: encrypt(supabaseRefreshToken),
      status: "healthy",
      last_used_at: new Date().toISOString(),
      revoked_at: null,
    },
    { bearer: supabaseAccessToken, onConflict: "user_id,label" }
  );

  const code = await callRpc(
    "mcp_create_authorization_code",
    {
      p_client_id: clientId,
      p_redirect_uri: redirectUri,
      p_code_challenge: codeChallenge,
      p_code_challenge_method: codeChallengeMethod || "S256",
    },
    { bearer: supabaseAccessToken }
  );

  return { code };
}

module.exports = { approveConnection };
