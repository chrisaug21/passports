const { approveConnection } = require("../../mcp-server/src/oauth/approve.js");
const { withCors } = require("../../mcp-server/src/lib/cors.js");

exports.handler = withCors(async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonError(400, "Malformed JSON body.");
  }

  try {
    const result = await approveConnection({
      supabaseAccessToken: body.supabaseAccessToken,
      supabaseRefreshToken: body.supabaseRefreshToken,
      clientId: body.clientId,
      clientName: body.clientName,
      redirectUri: body.redirectUri,
      codeChallenge: body.codeChallenge,
      codeChallengeMethod: body.codeChallengeMethod,
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("mcp-oauth-approve failed:", error);
    return jsonError(error.status || 500, error.message || "Something went wrong.");
  }
});

function jsonError(status, message) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error: message }),
  };
}
