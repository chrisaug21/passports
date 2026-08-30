// These endpoints authenticate via an explicit Bearer token (or, for OAuth
// discovery/register, carry no secret at all), never cookies — so an open
// CORS policy carries none of the risk it would on a cookie-authenticated
// endpoint, and is what lets any MCP client reach them directly from a
// browser context.

function corsHeaders(event) {
  const requestedHeaders = event.headers?.["access-control-request-headers"];
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": requestedHeaders || "authorization, content-type, mcp-protocol-version, mcp-session-id",
    "access-control-max-age": "86400",
  };
}

function isPreflight(event) {
  return event.httpMethod === "OPTIONS";
}

function preflightResponse(event) {
  return {
    statusCode: 204,
    headers: corsHeaders(event),
    body: "",
  };
}

// Wraps a Netlify function handler: answers OPTIONS preflights directly,
// and merges CORS headers onto whatever the handler returns (success or
// error) so every response — not just the happy path — stays reachable
// cross-origin.
function withCors(handler) {
  return async function wrapped(event) {
    if (isPreflight(event)) {
      return preflightResponse(event);
    }

    const response = await handler(event);
    return {
      ...response,
      headers: { ...corsHeaders(event), ...(response.headers || {}) },
    };
  };
}

module.exports = { corsHeaders, isPreflight, preflightResponse, withCors };
