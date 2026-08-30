const { protectedResourceMetadata } = require("../../mcp-server/src/oauth/metadata.js");
const { withCors } = require("../../mcp-server/src/lib/cors.js");

// Its own distinct function/URL, not branched by a query param — a query
// param survived a caching layer incorrectly once and served the wrong
// document (see mcp-oauth-metadata-authorization-server.js for the twin).
exports.handler = withCors(async function handler(event) {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(protectedResourceMetadata(event)),
  };
});
