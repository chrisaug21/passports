const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ITEM_STATUSES = ["confirmed", "reserved"];

// ---------------------------------------------------------------------------
// Date helpers (mirrors src/lib/format.js + src/lib/derive.js — kept
// self-contained here since this function runs as plain CommonJS with no
// build step and can't import the app's ES modules)
// ---------------------------------------------------------------------------

function parseLocalDate(value) {
  const normalizedValue = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) return null;
  const date = new Date(`${normalizedValue}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTripDateByDayNumber(startDate, dayNumber) {
  const start = parseLocalDate(startDate);
  const normalizedDayNumber = Number(dayNumber);
  if (!start || !Number.isInteger(normalizedDayNumber) || normalizedDayNumber < 1) return null;
  const nextDate = new Date(start);
  nextDate.setDate(nextDate.getDate() + (normalizedDayNumber - 1));
  return nextDate;
}

function formatDayDateLabel(startDate, dayNumber) {
  const date = getTripDateByDayNumber(startDate, dayNumber);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(date);
}

function deriveTripStatus(trip) {
  const startDate = parseLocalDate(trip.start_date);
  const tripLength = Number(trip.trip_length);
  if (!startDate || !Number.isInteger(tripLength) || tripLength < 1) return "planning";

  const today = parseLocalDate(new Date().toISOString().slice(0, 10));
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + tripLength - 1);

  if (today < startDate) return "planning";
  if (today <= endDate) return "traveling";
  return "past";
}

function formatTimeLabel(value) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function humanize(value) {
  if (!value) return "";
  return String(value)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getDisplayName(userId, profilesById) {
  const profile = profilesById.get(userId);
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  return name || "A traveler";
}

// ---------------------------------------------------------------------------
// Lodging bands (mirrors getLodgingBands in guide-view.js — lodging renders
// at the first/last day of its base rather than a single day_id)
// ---------------------------------------------------------------------------

function getLodgingBands(items, days, startDate) {
  const bands = [];

  items
    .filter((item) => item.item_type === "lodging" && item.base_id)
    .forEach((lodging) => {
      const baseDays = days
        .filter((day) => day.base_id === lodging.base_id)
        .sort((a, b) => a.day_number - b.day_number);

      if (baseDays.length === 0) return;

      let checkOutDayNumber = baseDays[baseDays.length - 1].day_number;
      if (lodging.check_out_date && startDate) {
        const coDate = new Date(`${lodging.check_out_date}T12:00:00`);
        const stDate = new Date(`${startDate}T12:00:00`);
        const diffDays = Math.round((coDate - stDate) / (1000 * 60 * 60 * 24));
        const derivedDayNumber = diffDays + 1;
        if (days.find((day) => day.day_number === derivedDayNumber)) {
          checkOutDayNumber = derivedDayNumber;
        }
      }

      bands.push({
        lodging,
        checkInDayNumber: baseDays[0].day_number,
        checkOutDayNumber,
      });
    });

  return bands;
}

// ---------------------------------------------------------------------------
// Supabase REST helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Item + journal line formatting
// ---------------------------------------------------------------------------

function formatItemLine(item, basesById) {
  const parts = [];

  if (item.time_start) {
    let timeLabel = item.time_is_estimated ? `~${formatTimeLabel(item.time_start)}` : formatTimeLabel(item.time_start);
    if (item.time_end) {
      timeLabel += ` – ${formatTimeLabel(item.time_end)}`;
    }
    parts.push(timeLabel);
  }

  if (item.is_anchor) {
    parts.push("[FIXED]");
  }

  parts.push(item.title);
  parts.push(`[${humanize(item.status)} ${humanize(item.item_type)}${item.meal_slot ? ` · ${humanize(item.meal_slot)}` : ""}${item.activity_type ? ` · ${humanize(item.activity_type)}` : ""}${item.transport_mode ? ` · ${humanize(item.transport_mode)}` : ""}]`);

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

function formatJournalForDay(day, journal, itemsForDay, profilesById) {
  const lines = [];
  const dayEntries = journal.entries.filter((entry) => entry.day_id === day.id && !entry.item_id);

  if (dayEntries.length > 0) {
    lines.push("  Day notes:");
    dayEntries.forEach((entry) => {
      if (!entry.notes?.trim()) return;
      lines.push(`    ${getDisplayName(entry.user_id, profilesById)}: ${entry.notes.trim()}`);
    });
  }

  itemsForDay.forEach((item) => {
    const itemEntries = journal.entries.filter((entry) => entry.item_id === item.id && entry.notes?.trim());
    const itemPhotos = journal.photos.filter((photo) => photo.item_id === item.id);

    if (itemEntries.length === 0 && itemPhotos.length === 0) return;

    lines.push(`  Journal for "${item.title}":`);
    itemEntries.forEach((entry) => {
      lines.push(`    ${getDisplayName(entry.user_id, profilesById)}: ${entry.notes.trim()}`);
    });
    itemPhotos.forEach((photo) => {
      lines.push(`    Photo (by ${getDisplayName(photo.user_id, profilesById)}): ${photo.public_url}`);
    });
  });

  return lines;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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
      `trips?id=eq.${tripId}&is_public=eq.true&deleted_at=is.null&select=id,title,description,trip_length,start_date,is_journal_public`
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
        `trip_bases?trip_id=eq.${tripId}&deleted_at=is.null&select=id,name,location_name&order=sort_order.asc`
      ),
      fetchFromSupabase(
        supabaseUrl,
        supabaseKey,
        `trip_days?trip_id=eq.${tripId}&deleted_at=is.null&select=id,base_id,day_number,title,location_name&order=day_number.asc`
      ),
      fetchFromSupabase(
        supabaseUrl,
        supabaseKey,
        `trip_items?trip_id=eq.${tripId}&deleted_at=is.null&status=in.(${PUBLIC_ITEM_STATUSES.join(",")})&select=id,base_id,day_id,title,item_type,status,is_anchor,meal_slot,activity_type,transport_mode,transport_origin,transport_destination,time_start,time_end,time_is_estimated,notes,url,sort_order,check_out_date&order=sort_order.asc`
      ),
    ]);

    const basesById = new Map(bases.map((base) => [base.id, base]));
    const lodgingBands = getLodgingBands(items, days, trip.start_date);
    const lodgingItemIds = new Set(lodgingBands.map((band) => band.lodging.id));

    const itemsByDayId = new Map();
    const unassignedItems = [];

    for (const item of items) {
      if (lodgingItemIds.has(item.id)) continue;

      if (item.day_id) {
        if (!itemsByDayId.has(item.day_id)) {
          itemsByDayId.set(item.day_id, []);
        }
        itemsByDayId.get(item.day_id).push(item);
      } else {
        unassignedItems.push(item);
      }
    }

    // Journal is only fetched if it's enabled the same way the app enables it:
    // the owner has turned it on (is_journal_public) and the trip is traveling or past.
    const derivedStatus = deriveTripStatus(trip);
    const journalEnabled = trip.is_journal_public && (derivedStatus === "traveling" || derivedStatus === "past");
    let journal = { entries: [], photos: [] };

    if (journalEnabled) {
      const [entries, photos] = await Promise.all([
        fetchFromSupabase(
          supabaseUrl,
          supabaseKey,
          `journal_entries?trip_id=eq.${tripId}&deleted_at=is.null&select=day_id,item_id,notes,user_id`
        ),
        fetchFromSupabase(
          supabaseUrl,
          supabaseKey,
          `journal_item_photos?trip_id=eq.${tripId}&deleted_at=is.null&select=item_id,public_url,user_id`
        ),
      ]);
      journal = { entries, photos };

      const authorIds = [...new Set([...entries.map((e) => e.user_id), ...photos.map((p) => p.user_id)])];
      if (authorIds.length > 0) {
        const profiles = await fetchFromSupabase(
          supabaseUrl,
          supabaseKey,
          `user_profiles?id=in.(${authorIds.join(",")})&select=id,first_name,last_name`
        );
        journal.profilesById = new Map(profiles.map((p) => [p.id, p]));
      }
    }
    const profilesById = journal.profilesById || new Map();

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
      const checkOutBands = lodgingBands.filter((band) => band.checkOutDayNumber === day.day_number);
      const checkInBands = lodgingBands.filter((band) => band.checkInDayNumber === day.day_number);
      const dateLabel = trip.start_date ? formatDayDateLabel(trip.start_date, day.day_number) : "";

      lines.push(`Day ${day.day_number}${dateLabel ? ` — ${dateLabel}` : ""}${base ? ` — ${base.name || base.location_name}` : ""}`);
      if (day.title) {
        lines.push(`  "${day.title}"`);
      }

      const hasContent = dayItems.length > 0 || checkOutBands.length > 0 || checkInBands.length > 0;

      if (!hasContent) {
        lines.push("  (nothing confirmed yet)");
      } else {
        for (const band of checkOutBands) {
          lines.push(`  - Check out: ${band.lodging.title}${band.lodging.time_end ? ` (${formatTimeLabel(band.lodging.time_end)})` : ""}`);
        }
        for (const band of checkInBands) {
          lines.push(`  - Check in: ${band.lodging.title}${band.lodging.time_start ? ` (${formatTimeLabel(band.lodging.time_start)})` : ""}`);
        }
        for (const item of dayItems) {
          lines.push(formatItemLine(item, basesById));
        }
      }

      if (journalEnabled) {
        const journalLines = formatJournalForDay(day, journal, dayItems, profilesById);
        if (journalLines.length > 0) {
          lines.push(...journalLines);
        }
      }

      lines.push("");
    }

    if (unassignedItems.length > 0) {
      lines.push("Not yet assigned to a specific day (still needs finalizing):");
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
