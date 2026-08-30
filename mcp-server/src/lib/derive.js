// Self-contained copy of src/lib/derive.js's deriveTripStatus, same reasoning as
// netlify/functions/trip-export.js's own duplicate: this package is plain CommonJS
// with no build step and can't import the app's ES modules.
//
// Unlike the browser version — which uses the *viewer's own device* local time as
// "today" — this runs server-side, where there is no viewer-local timezone to read.
// Pass the trip's own base timezone (trip_bases.local_timezone) as `timezone` so
// "today" is computed correctly relative to the trip itself; omitting it falls back
// to UTC, which can be off by up to a day right at trip start/end boundaries.

function parseLocalDate(value) {
  const normalizedValue = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) return null;
  const date = new Date(`${normalizedValue}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayInTimezone(timezone) {
  try {
    // en-CA formats as YYYY-MM-DD, so this doubles as the date string we need.
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function deriveTripStatus(trip, timezone) {
  const startDate = parseLocalDate(trip.start_date);
  const tripLength = Number(trip.trip_length);
  if (!startDate || !Number.isInteger(tripLength) || tripLength < 1) return "planning";

  const today = parseLocalDate(timezone ? todayInTimezone(timezone) : new Date().toISOString().slice(0, 10));
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + tripLength - 1);

  if (today < startDate) return "planning";
  if (today <= endDate) return "traveling";
  return "past";
}

module.exports = { deriveTripStatus };
