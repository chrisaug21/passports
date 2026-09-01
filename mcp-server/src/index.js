const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  WebStandardStreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");
const { toWebRequest, fromWebResponse } = require("./lib/http-adapter.js");
const { validateAccessToken, rotateSupabaseSession } = require("./lib/mcp-auth.js");
const { registerListTrips } = require("./tools/list-trips.js");
const { registerGetTrip } = require("./tools/get-trip.js");
const { registerGetTripJournal } = require("./tools/get-trip-journal.js");
const { registerCreateTripItem } = require("./tools/create-trip-item.js");
const { registerProposeUpdateTripItem } = require("./tools/propose-update-trip-item.js");
const { registerConfirmUpdateTripItem } = require("./tools/confirm-update-trip-item.js");

// Keep in sync with APP_VERSION in src/config/constants.js. Unlike that
// number, this one is actually visible from an MCP client (MCP Inspector
// shows it on connect) — it's the fastest way to confirm you're talking to
// the build you just deployed, without relying on anything in the app UI.
const MCP_SERVER_VERSION = "1.3.8";

// The app's existing PWA icon, reused here so the connector shows the same
// logo in Claude's connector list and tool-call UI as the app itself uses —
// absolute URLs since this is served to Claude, not the browser.
const SERVER_ICONS = [
  { src: "https://passports.chrisaug.com/android-chrome-192x192.png", mimeType: "image/png", sizes: ["192x192"] },
  { src: "https://passports.chrisaug.com/android-chrome-512x512.png", mimeType: "image/png", sizes: ["512x512"] },
];

// ctx: { getSupabaseAccessToken, userId, connectionId } — getSupabaseAccessToken()
// lazily resolves (and memoizes for the rest of this request) the connected
// user's own live Supabase access token via rotateSupabaseSession, only when
// a tool actually calls it. A bare `initialize`/`tools/list` handshake never
// touches Supabase at all this way — only an actual tool call does, which
// also means a broken underlying connection surfaces as that one tool's
// error, not as a 401 on every request regardless of whether it needed data.
// connectionId is needed by write tools (Phase 2+) to check/increment the
// per-connection rate limit and record the audit log entry.
function createMcpServer(ctx) {
  const server = new McpServer({ name: "passports", version: MCP_SERVER_VERSION, icons: SERVER_ICONS });
  registerListTrips(server, ctx);
  registerGetTrip(server, ctx);
  registerGetTripJournal(server, ctx);
  registerCreateTripItem(server, ctx);
  registerProposeUpdateTripItem(server, ctx);
  registerConfirmUpdateTripItem(server, ctx);
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

// The MCP SDK's transport always opens a genuine, indefinitely-open SSE
// stream for a GET request (no config option disables it), but this
// Netlify Function's response path is fully buffered — fromWebResponse
// awaits response.text() before returning anything, which can never
// complete for a stream that's designed to stay open. Left unchecked, the
// underlying Lambda invocation hangs until the runtime kills it
// (Runtime.NodeJsExit: "a Promise that was never settled"), which reaches
// the client as an opaque 502. Reject GET outright instead, before it ever
// reaches the transport: server-initiated SSE is an optional capability
// per the Streamable HTTP spec, and 405 is the standard way to decline
// it — a compliant client falls back to request/response-only operation
// rather than treating this as fatal. Nothing here currently needs
// server-initiated push, so there's no capability actually lost.
function methodNotAllowedResponse() {
  return new Response(JSON.stringify({ error: "This server does not support server-initiated SSE (GET)." }), {
    status: 405,
    headers: { "content-type": "application/json", allow: "POST" },
  });
}

async function handleMcpEvent(event) {
  const request = toWebRequest(event);
  if (request.method === "GET") {
    return fromWebResponse(methodNotAllowedResponse());
  }

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
      supabaseTokenPromise = rotateSupabaseSession(auth.connectionId, auth.encryptedSupabaseRefreshToken).then(
        (result) => result.supabaseAccessToken
      );
    }
    return supabaseTokenPromise;
  }

  const server = createMcpServer({ getSupabaseAccessToken, userId: auth.userId, connectionId: auth.connectionId });
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
