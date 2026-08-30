const { issueToken } = require("../../mcp-server/src/oauth/token.js");

// RFC 6749 requires the token endpoint to accept
// application/x-www-form-urlencoded — not JSON.
exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  try {
    const tokens = await issueToken(params);
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(tokens),
    };
  } catch (error) {
    if (error.oauthError) {
      return {
        statusCode: error.status || 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: error.oauthError, error_description: error.message }),
      };
    }

    console.error("mcp-oauth-token failed:", error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "server_error" }),
    };
  }
};
