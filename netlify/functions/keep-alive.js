// OPTIONS is the cheapest real request each of these functions handles —
// every one of them answers a preflight before ever touching Supabase, so
// this only exercises Netlify's own cold-start path (a separate Lambda
// container per function, so pinging Supabase alone below never warmed
// these). Best-effort and silent on failure: keeping Supabase itself from
// auto-pausing (below) is the one thing this run must not let slip, this
// is a bonus on top of that. Confirmed via the 2026-08-31 connector
// reliability investigation that connect/reconnect chains several
// sequential calls into these functions, so a cold start on any one of
// them adds directly to the "takes 3-5 tries" users were hitting.
async function pingOAuthFunctions() {
  const baseUrl = process.env.URL || "https://passports.chrisaug.com";
  const paths = ["/api/mcp", "/api/mcp-oauth-token", "/api/mcp-oauth-approve", "/api/mcp-oauth-register"];

  await Promise.allSettled(
    paths.map((path) =>
      fetch(`${baseUrl}${path}`, { method: "OPTIONS" }).catch((error) => {
        console.error(`Keep-alive ping to ${path} failed:`, error);
      })
    )
  );
}

exports.handler = async function handler() {
  await pingOAuthFunctions();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const missingVars = [
      !supabaseUrl ? "SUPABASE_URL" : null,
      !supabaseKey ? "SUPABASE_ANON_KEY" : null,
    ].filter(Boolean);
    console.error(`Keep-alive failed: missing ${missingVars.join(", ")}.`);

    return {
      statusCode: 500,
    };
  }

  const requestUrl = `${supabaseUrl}/rest/v1/trip_items?select=id&limit=1`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Keep-alive failed: Supabase returned", response.status, errorText);

      return {
        statusCode: 500,
      };
    }

    console.log("Keep-alive succeeded:", response.status);

    return {
      statusCode: 200,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Keep-alive failed:", error);

    return {
      statusCode: 500,
    };
  }
};
