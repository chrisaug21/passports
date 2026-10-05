const ITEM_TYPE_LABELS = {
  meal: "Meal",
  activity: "Activity",
  transport: "Transport",
  lodging: "Lodging",
  breakfast: "Breakfast",
  brunch: "Brunch",
  lunch: "Lunch",
  dinner: "Dinner",
  arts_culture: "Arts & Culture",
  live_music_shows: "Live Music & Shows",
  sightseeing: "Sightseeing",
  outdoors_nature: "Outdoors & Nature",
  sports: "Sports",
  tastings_drinks: "Tastings & Drinks",
  cafes_markets: "Cafés & Bakeries",
  shopping: "Markets & Shopping",
  walking_exploring: "Walking & Exploring",
  wellness_spa: "Wellness & Spa",
  entertainment: "Entertainment",
  nightlife: "Nightlife",
  other: "Other",
  flight: "Flight",
  train: "Train",
  car: "Car",
  ferry: "Ferry",
  bus: "Bus",
};

const TIMEZONE_ABBREVIATIONS_BY_LONG_NAME = {
  "Central European Time": "CET",
  "Greenwich Mean Time": "GMT",
};

export function formatTripDateSummary(trip, options = {}) {
  if (!trip.start_date) {
    return `${trip.trip_length} day${trip.trip_length === 1 ? "" : "s"} · dates TBD`;
  }

  const startDate = new Date(`${trip.start_date}T12:00:00`);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + Math.max(trip.trip_length - 1, 0));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const includeYear = options.includeYear !== undefined ? options.includeYear : endDate < today;

  if (!includeYear) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    });

    return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
  }

  const startFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  const endFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startFormatter.format(startDate)} – ${endFormatter.format(endDate)}`;
  }

  return `${endFormatter.format(startDate)} – ${endFormatter.format(endDate)}`;
}

export function formatStatusLabel(value) {
  if (value === "destinations") {
    return "Wishlist";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDestinationTargetDate(trip) {
  const year = parseStoredYear(trip?.target_year);
  const month = parseStoredMonth(trip?.target_month);

  if (year == null) {
    return "Someday";
  }

  if (month == null) {
    return String(year);
  }

  const date = new Date(year, month - 1, 1);

  if (Number.isNaN(date.getTime())) {
    return String(year);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function parseStoredYear(value) {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1000 ? parsed : null;
}

function parseStoredMonth(value) {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

export function formatItemTypeLabel(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  return ITEM_TYPE_LABELS[normalizedValue] || normalizedValue
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatLongDate(value) {
  if (!value) {
    return "Dates TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function getTripDateByDayNumber(startDate, dayNumber) {
  const normalizedDayNumber = Number(dayNumber);

  if (!startDate || !Number.isInteger(normalizedDayNumber) || normalizedDayNumber < 1) {
    return null;
  }

  const nextDate = new Date(`${startDate}T12:00:00`);

  if (Number.isNaN(nextDate.getTime())) {
    return null;
  }

  nextDate.setDate(nextDate.getDate() + (normalizedDayNumber - 1));
  return nextDate;
}

export function formatDayDateLabel(startDate, dayNumber) {
  const date = getTripDateByDayNumber(startDate, dayNumber);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

// Compact form for space-tight nav pills: "Wed Oct 14".
export function formatDayDateCompact(startDate, dayNumber) {
  const date = getTripDateByDayNumber(startDate, dayNumber);
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.weekday} ${parts.month} ${parts.day}`;
}

// Compact form for phone-width nav pills: "Oct 15 Thu".
const MOBILE_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDayDateMobile(startDate, dayNumber) {
  const date = getTripDateByDayNumber(startDate, dayNumber);
  if (!date) return "";

  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  return `${monthDay} ${MOBILE_WEEKDAY_LABELS[date.getDay()]}`;
}

export function formatShortDateRange(startDate, startDayNumber, endDayNumber) {
  const start = getTripDateByDayNumber(startDate, startDayNumber);
  const end = getTripDateByDayNumber(startDate, endDayNumber);

  if (!start || !end) {
    return "";
  }

  if (start.getTime() === end.getTime()) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(start);
  }

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${new Intl.DateTimeFormat("en-US", { month: "short" }).format(start)} ${start.getDate()}-${end.getDate()}`;
  }

  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(start)}-${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(end)}`;
}

export function formatTimezone(timezone) {
  const normalizedTimezone = String(timezone || "").trim();

  if (!normalizedTimezone) {
    return "";
  }

  const genericLongName = getTimezoneName(normalizedTimezone, "longGeneric");
  const standardLongName = getTimezoneName(normalizedTimezone, "long");
  const genericShortName = getTimezoneName(normalizedTimezone, "shortGeneric");
  const standardShortName = getTimezoneName(normalizedTimezone, "short");
  const longName = getUsableLongTimezoneName(genericLongName, standardLongName, normalizedTimezone);
  const shortName = TIMEZONE_ABBREVIATIONS_BY_LONG_NAME[longName] || getUsableShortTimezoneName(genericShortName, standardShortName);

  if (!shortName || shortName === longName || shortName.includes("/")) {
    return longName;
  }

  return `${longName} (${shortName})`;
}

export function formatTimezoneOffset(timezone, date = new Date("2026-01-15T12:00:00Z")) {
  const normalizedTimezone = String(timezone || "").trim();

  if (!normalizedTimezone) {
    return "";
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedTimezone,
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const offset = parts.find((part) => part.type === "timeZoneName")?.value || "";

    return offset.replace("GMT", "UTC").replace("UTC+0", "UTC").replace("-", "−");
  } catch (_error) {
    return "";
  }
}

function getTimezoneName(timezone, timeZoneName) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName,
    }).formatToParts(new Date("2026-01-15T12:00:00Z"));

    return parts.find((part) => part.type === "timeZoneName")?.value || "";
  } catch (_error) {
    return "";
  }
}

function getUsableLongTimezoneName(genericName, standardName, timezone) {
  if (genericName && !["United Kingdom Time", "France Time"].includes(genericName)) {
    return genericName;
  }

  return standardName || genericName || timezone.replaceAll("_", " ");
}

function getUsableShortTimezoneName(genericName, standardName) {
  const mappedName = TIMEZONE_ABBREVIATIONS_BY_LONG_NAME[genericName] || TIMEZONE_ABBREVIATIONS_BY_LONG_NAME[standardName];
  if (mappedName) {
    return mappedName;
  }

  if (genericName && /^[A-Z]{2,5}$/.test(genericName)) {
    return genericName;
  }

  if (standardName && /^[A-Z]{2,5}$/.test(standardName)) {
    return standardName;
  }

  return genericName || standardName || "";
}

export function formatTimeLabel(value, isEstimated = false) {
  if (!value) {
    return "";
  }

  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return isEstimated ? `Around ${formatted}` : formatted;
}

// "May 23" for a YYYY-MM-DD string (empty if it isn't a valid date).
export function formatMonthDay(value) {
  const date = new Date(`${value}T12:00:00`);
  if (!value || Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

// Time details for the Plan view. A hotel's two times fall on different days, so
// they're labelled and the check-out carries its date ("Check-out: May 24, 11:00 AM").
// Everything else keeps the plain "start to end" form.
export function getPlanTimeParts(item) {
  if (item?.item_type === "lodging") {
    const checkOutDay = formatMonthDay(item.check_out_date);
    return [
      item.time_start ? `Check-in: ${formatTimeLabel(item.time_start)}` : "",
      item.time_end || checkOutDay
        ? `Check-out: ${[checkOutDay, formatTimeLabel(item.time_end)].filter(Boolean).join(", ")}`
        : "",
    ].filter(Boolean);
  }

  return [
    item?.time_start ? formatTimeLabel(item.time_start) : "",
    getEndTimeText(item) ? `${item?.time_end ? "to " : ""}${getEndTimeText(item)}` : "",
  ].filter(Boolean);
}

// " (Oct 12)" for a transport stop that arrives on a later day than it departs
// (red-eyes, night trains); empty for everything else.
// The "end" half of a time range: the end time plus arrival date for an overnight
// transport stop, or just "arrives May 24" when a date was saved without a time.
export function getEndTimeText(item) {
  const suffix = formatArrivalDateSuffix(item);

  if (item?.time_end) {
    return `${formatTimeLabel(item.time_end)}${suffix}`;
  }

  return suffix ? `arrives ${suffix.trim().slice(1, -1)}` : "";
}

export function formatArrivalDateSuffix(item) {
  const label = item?.item_type === "transport" ? formatMonthDay(item.arrival_date) : "";
  return label ? ` (${label})` : "";
}

export function formatCostLabel(low, high) {
  if (low == null && high == null) {
    return "";
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  if (low != null && high != null && Number(low) !== Number(high)) {
    return `${formatter.format(Number(low))} - ${formatter.format(Number(high))}`;
  }

  const value = low ?? high;
  return formatter.format(Number(value));
}
