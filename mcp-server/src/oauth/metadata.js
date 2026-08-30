// Serves the two discovery documents Claude.ai (or any MCP client) needs to
// find our OAuth endpoints. Both are static per-request — computed from the
// requesting host, nothing stored.

function baseUrl(event) {
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host || "localhost";
  return `${proto}://${host}`;
}

function protectedResourceMetadata(event) {
  const origin = baseUrl(event);
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
  };
}

function authorizationServerMetadata(event) {
  const origin = baseUrl(event);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/app/connect`,
    token_endpoint: `${origin}/api/mcp-oauth-token`,
    registration_endpoint: `${origin}/api/mcp-oauth-register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

module.exports = { protectedResourceMetadata, authorizationServerMetadata };
