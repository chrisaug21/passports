const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  WebStandardStreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");
const { toWebRequest, fromWebResponse } = require("./lib/http-adapter.js");
const { validateAccessToken, rotateSupabaseSession } = require("./lib/mcp-auth.js");
const { registerListTrips } = require("./tools/list-trips.js");
const { registerGetTrip } = require("./tools/get-trip.js");
const { registerGetTripJournal } = require("./tools/get-trip-journal.js");

// Keep in sync with APP_VERSION in src/config/constants.js. Unlike that
// number, this one is actually visible from an MCP client (MCP Inspector
// shows it on connect) — it's the fastest way to confirm you're talking to
// the build you just deployed, without relying on anything in the app UI.
const MCP_SERVER_VERSION = "1.1.0";

// ctx: { getSupabaseAccessToken, userId } — getSupabaseAccessToken() lazily
// resolves (and memoizes for the rest of this request) the connected user's
// own live Supabase access token via rotateSupabaseSession, only when a tool
// actually calls it. A bare `initialize`/`tools/list` handshake never touches
// Supabase at all this way — only an actual tool call does, which also means
// a broken underlying connection surfaces as that one tool's error, not as a
// 401 on every request regardless of whether it needed data.
function createMcpServer(ctx) {
  const server = new McpServer({ name: "passports", version: MCP_SERVER_VERSION });
  registerListTrips(server, ctx);
  registerGetTrip(server, ctx);
  registerGetTripJournal(server, ctx);
  return server;
}

function unauthorizedResponse(resourceMetadataUrl) {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    },
  });
}

async function handleMcpEvent(event) {
  const request = toWebRequest(event);
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host || "localhost";
  const resourceMetadataUrl = `${proto}://${host}/.well-known/oauth-protected-resource`;

  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return fromWebResponse(unauthorizedResponse(resourceMetadataUrl));
  }

  const auth = await validateAccessToken(match[1]);
  if (!auth) {
    return fromWebResponse(unauthorizedResponse(resourceMetadataUrl));
  }

  // Lazy + memoized: the first tool call in this request that awaits this
  // triggers the actual rotation; every later call in the same request
  // (unlikely under the stateless-per-invocation transport below, but
  // harmless either way) reuses the same in-flight/resolved promise instead
  // of rotating the refresh token a second time.
  let supabaseTokenPromise = null;
  function getSupabaseAccessToken() {
    if (!supabaseTokenPromise) {
      supabaseTokenPromise = rotateSupabaseSession(match[1], auth.connectionId, auth.encryptedSupabaseRefreshToken).then(
        (result) => result.supabaseAccessToken
      );
    }
    return supabaseTokenPromise;
  }

  const server = createMcpServer({ getSupabaseAccessToken, userId: auth.userId });
  // Stateless: each Netlify Function invocation is its own process, so
  // there's no server memory to key a session against across requests.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true, // avoids SSE — Netlify's classic function response is buffered, not streamed
  });

  await server.connect(transport);

  const response = await transport.handleRequest(request, {
    authInfo: {
      token: match[1],
      clientId: "passports-mcp",
      scopes: [],
      extra: { userId: auth.userId, connectionId: auth.connectionId },
    },
  });

  return fromWebResponse(response);
}

module.exports = { handleMcpEvent };
