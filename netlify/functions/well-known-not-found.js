const { withCors } = require("../../mcp-server/src/lib/cors.js");

// Answers OAuth/OIDC discovery paths we deliberately do NOT implement with a
// real 404, instead of letting the SPA catch-all return index.html with a 200.
//
// This matters more than it looks: a client probing an optional discovery
// document treats 404 as a clean "not supported, try the next one", but a 200
// is a promise of a document — it will parse the body as JSON, hit HTML, and
// throw instead of falling back. Passports is an OAuth 2.0 authorization
// server, not an OpenID Connect provider, so `openid-configuration` must say
// "no" clearly rather than half-succeed.
exports.handler = withCors(async function handler() {
  return {
    statusCode: 404,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      error: "not_found",
      error_description: "This discovery document is not provided. See /.well-known/oauth-authorization-server.",
    }),
  };
});
