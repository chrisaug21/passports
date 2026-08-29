const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ITEM_STATUSES = ["confirmed", "reserved"];

function humanize(value) {
  if (!value) return "";
  return String(value)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function fetchFromSupabase(supabaseUrl, supabaseKey, path) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}): ${path}`);
  }

  return response.json();
}

function formatItemLine(item, basesById) {
  const parts = [];

  if (item.time_start) {
    parts.push(item.time_start);
  }

  parts.push(item.title);
  parts.push(`[${humanize(item.item_type)}${item.meal_slot ? ` · ${humanize(item.meal_slot)}` : ""}${item.activity_type ? ` · ${humanize(item.activity_type)}` : ""}${item.transport_mode ? ` · ${humanize(item.transport_mode)}` : ""}]`);

  if (item.item_type === "transport" && (item.transport_origin || item.transport_destination)) {
    parts.push(`(${item.transport_origin || "?"} → ${item.transport_destination || "?"})`);
  }

  if (item.base_id && basesById.has(item.base_id)) {
    const base = basesById.get(item.base_id);
    parts.push(`— ${base.name || base.location_name}`);
  }

  let line = `  - ${parts.filter(Boolean).join(" ")}`;

  if (item.notes) {
    line += `\n    Notes: ${item.notes}`;
  }

  if (item.url) {
    line += `\n    Link: ${item.url}`;
  }

  return line;
}

exports.handler = async function handler(event) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      body: "Export is temporarily unavailable.",
    };
  }

  const tripId = event.queryStringParameters?.id || "";

  if (!UUID_PATTERN.test(tripId)) {
    return {
      statusCode: 400,
      body: "A valid trip id is required.",
    };
  }

  try {
    const trips = await fetchFromSupabase(
      supabaseUrl,
      supabaseKey,
      `trips?id=eq.${tripId}&is_public=eq.true&deleted_at=is.null&select=id,title,description,trip_length,start_date`
    );
    const trip = trips[0];

    if (!trip) {
      return {
        statusCode: 404,
        body: "This trip isn't public or doesn't exist.",
      };
    }

    const [bases, days, items] = await Promise.all([
      fetchFromSupabase(
        supabaseUrl,
        supabaseKey,
        `trip_bases?trip_id=eq.${tripId}&deleted_at=is.null&select=id,name,location_name,local_timezone&order=sort_order.asc`
      ),
      fetchFromSupabase(
        supabaseUrl,
        supabaseKey,
        `trip_days?trip_id=eq.${tripId}&deleted_at=is.null&select=id,base_id,day_number&order=day_number.asc`
      ),
      fetchFromSupabase(
        supabaseUrl,
        supabaseKey,
        `trip_items?trip_id=eq.${tripId}&deleted_at=is.null&status=in.(${PUBLIC_ITEM_STATUSES.join(",")})&select=id,base_id,day_id,title,item_type,meal_slot,activity_type,transport_mode,transport_origin,transport_destination,time_start,notes,url,sort_order&order=sort_order.asc`
      ),
    ]);

    const basesById = new Map(bases.map((base) => [base.id, base]));
    const itemsByDayId = new Map();
    const unassignedItems = [];

    for (const item of items) {
      if (item.day_id) {
        if (!itemsByDayId.has(item.day_id)) {
          itemsByDayId.set(item.day_id, []);
        }
        itemsByDayId.get(item.day_id).push(item);
      } else {
        unassignedItems.push(item);
      }
    }

    const lines = [];
    lines.push(`Trip: ${trip.title}`);
    if (trip.description) {
      lines.push(trip.description);
    }
    lines.push(`Length: ${trip.trip_length} day${trip.trip_length === 1 ? "" : "s"}`);
    if (trip.start_date) {
      lines.push(`Starts: ${trip.start_date}`);
    }
    lines.push("");

    for (const day of days) {
      const base = day.base_id ? basesById.get(day.base_id) : null;
      const dayItems = itemsByDayId.get(day.id) || [];

      lines.push(`Day ${day.day_number}${base ? ` — ${base.name || base.location_name}` : ""}`);

      if (dayItems.length === 0) {
        lines.push("  (nothing confirmed yet)");
      } else {
        for (const item of dayItems) {
          lines.push(formatItemLine(item, basesById));
        }
      }

      lines.push("");
    }

    if (unassignedItems.length > 0) {
      lines.push("Not assigned to a specific day:");
      for (const item of unassignedItems) {
        lines.push(formatItemLine(item, basesById));
      }
      lines.push("");
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
      body: lines.join("\n"),
    };
  } catch (error) {
    console.error("trip-export failed:", error);

    return {
      statusCode: 500,
      body: "Could not build the export right now.",
    };
  }
};
