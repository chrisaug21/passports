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
  cafes_markets: "Cafés & Markets",
  shopping: "Shopping",
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

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(options.includeYear ? { year: "numeric" } : {}),
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

export function formatStatusLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
