const { protectedResourceMetadata, authorizationServerMetadata } = require("../../mcp-server/src/oauth/metadata.js");
const { withCors } = require("../../mcp-server/src/lib/cors.js");

exports.handler = withCors(async function handler(event) {
  const type = event.queryStringParameters?.type === "authorization-server" ? "authorization-server" : "protected-resource";

  const body = type === "authorization-server" ? authorizationServerMetadata(event) : protectedResourceMetadata(event);

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    },
    body: JSON.stringify(body),
  };
});
