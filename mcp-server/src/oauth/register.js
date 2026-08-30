const { callRpc } = require("../lib/supabase-rest.js");

// Dynamic Client Registration (RFC 7591). Called by Claude.ai (or any MCP
// client) automatically the first time a user adds this connector — no
// user is signed in yet at this point, so this is intentionally an
// anonymous, low-stakes operation: it only ever creates a row describing a
// client (a name + an allow-list of redirect URIs), never grants access to
// any data.
async function registerClient(body) {
  const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0) {
    const error = new Error("redirect_uris is required");
    error.status = 400;
    error.oauthError = "invalid_client_metadata";
    throw error;
  }

  const clientId = await callRpc("mcp_register_client", {
    p_client_name: body?.client_name || null,
    p_redirect_uris: redirectUris,
  });

  return {
    client_id: clientId,
    client_name: body?.client_name || null,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

module.exports = { registerClient };
