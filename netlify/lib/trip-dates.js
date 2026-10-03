// Trip date helpers shared by the email code. Whole-day, UTC-based comparisons:
// no time-zone math (see Timezone Handling in AGENTS.md).

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

// Where a trip sits relative to today, from its start date and length (the
// end date is derived, never stored): "undated", "upcoming", "active", "past".
// Whole-day comparison in UTC — close enough for choosing which wording to
// use, and avoids any time-zone math (see Timezone Handling in AGENTS.md).
function getTripPhase({ startDate, tripLength }, today = new Date()) {
  const start = parseDate(startDate);
  const length = Number(tripLength);
  if (!start || !Number.isInteger(length) || length < 1) return { phase: "undated", end: null };

  const end = new Date(start.getTime() + (length - 1) * MS_PER_DAY);
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (todayUtc < start) return { phase: "upcoming", start, end };
  if (todayUtc <= end) return { phase: "active", start, end };
  return { phase: "past", start, end };
}

function formatShortDate(date, withYear) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}

// "Oct 11 – 19, 2026", "Oct 28 – Nov 2, 2026", "Dec 28, 2026 – Jan 3, 2027".
function formatDateRange(start, end) {
  if (start.getTime() === end.getTime()) return formatShortDate(start, true);
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${formatShortDate(start, true)} – ${formatShortDate(end, true)}`;
  }
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${formatShortDate(start, false)} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  return `${formatShortDate(start, false)} – ${formatShortDate(end, true)}`;
}

// Today as a YYYY-MM-DD string in US Eastern time — which calendar day the
// daily sweep treats as "today".
function getTodayEastern(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  return toIsoDate(new Date(parseDate(isoDate).getTime() + days * MS_PER_DAY));
}

module.exports = { MS_PER_DAY, parseDate, getTripPhase, formatShortDate, formatDateRange, getTodayEastern, toIsoDate, addDays };
