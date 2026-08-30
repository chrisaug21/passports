const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  WebStandardStreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");
const { toWebRequest, fromWebResponse } = require("./lib/http-adapter.js");
const { validateAccessToken } = require("./lib/mcp-auth.js");

// Phase 0: no tools registered yet. Later phases register them here
// (list_trips, get_trip, get_trip_journal, ...) — see passports-mcp-server-spec.md.
function createMcpServer() {
  return new McpServer({ name: "passports", version: "0.1.0" });
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

  const server = createMcpServer();
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
