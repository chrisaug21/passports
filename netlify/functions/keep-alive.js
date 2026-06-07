exports.handler = async function handler() {
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
