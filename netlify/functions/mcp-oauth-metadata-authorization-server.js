const { authorizationServerMetadata } = require("../../mcp-server/src/oauth/metadata.js");
const { withCors } = require("../../mcp-server/src/lib/cors.js");

// Its own distinct function/URL — see mcp-oauth-metadata-resource.js for why
// this isn't one function branching on a query param anymore.
exports.handler = withCors(async function handler(event) {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(authorizationServerMetadata(event)),
  };
});
