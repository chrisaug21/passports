exports.handler = async function handler() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Keep-alive failed: missing SUPABASE_URL or SUPABASE_KEY.");

    return {
      statusCode: 500,
    };
  }

  const requestUrl = `${supabaseUrl}/rest/v1/trip_items?select=id&limit=1`;

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Keep-alive failed:", response.status, errorText);

      return {
        statusCode: 500,
      };
    }

    console.log("Keep-alive succeeded.");

    return {
      statusCode: 200,
    };
  } catch (error) {
    console.error("Keep-alive failed:", error);

    return {
      statusCode: 500,
    };
  }
};
