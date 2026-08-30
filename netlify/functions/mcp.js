const { handleMcpEvent } = require("../../mcp-server/src/index.js");
const { withCors } = require("../../mcp-server/src/lib/cors.js");

exports.handler = withCors(async function handler(event) {
  try {
    return await handleMcpEvent(event);
  } catch (error) {
    console.error("mcp endpoint failed:", error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Something went wrong." }),
    };
  }
});
