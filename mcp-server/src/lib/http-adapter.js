// Adapts between Netlify's classic function event shape (used everywhere
// else in netlify/functions/) and the Web Standard Request/Response objects
// the MCP SDK's transport expects. Keeps every netlify/functions/mcp-*.js
// file looking and working like the rest of this repo's functions.

function toWebRequest(event) {
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host || "localhost";
  const url = new URL(event.rawUrl || `${proto}://${host}${event.path}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (value != null) headers.set(key, value);
  }

  const method = event.httpMethod || "GET";
  const hasBody = method !== "GET" && method !== "HEAD" && event.body != null;
  const body = hasBody
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body
    : undefined;

  return new Request(url, { method, headers, body });
}

async function fromWebResponse(response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    statusCode: response.status,
    headers,
    body: await response.text(),
  };
}

module.exports = { toWebRequest, fromWebResponse };
