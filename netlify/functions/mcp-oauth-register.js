const { registerClient } = require("../../mcp-server/src/oauth/register.js");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonError(400, "invalid_client_metadata", "Malformed JSON body.");
  }

  try {
    const client = await registerClient(body);
    return {
      statusCode: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(client),
    };
  } catch (error) {
    console.error("mcp-oauth-register failed:", error);
    return jsonError(error.status || 500, error.oauthError || "server_error", error.message);
  }
};

function jsonError(status, error, description) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error, error_description: description }),
  };
}
