// Self-contained copy of src/lib/derive.js's deriveTripStatus, same reasoning as
// netlify/functions/trip-export.js's own duplicate: this package is plain CommonJS
// with no build step and can't import the app's ES modules.

function parseLocalDate(value) {
  const normalizedValue = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) return null;
  const date = new Date(`${normalizedValue}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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

module.exports = { deriveTripStatus };
