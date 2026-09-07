import { STARTING_SOON_WINDOW_DAYS } from "../config/constants.js";

// What trips.status *should* be, based purely on dates -- used to correct
// the stored value (see reconcileTripStatuses in trips-service.js), not read
// directly by screens. Only ever returns the three date-derived states;
// "destinations" is a manual, pre-planning state with no dates to derive from.
export function deriveTripStatus(trip, today = new Date()) {
  if (!trip?.start_date) {
    return "planning";
  }

  const startDate = parseLocalDate(trip.start_date);
  const tripLength = Number(trip.trip_length);

  if (!startDate || !Number.isInteger(tripLength) || tripLength < 1) {
    return "planning";
  }

  const todayDate = parseLocalDate(formatDateInputValue(today));
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + tripLength - 1);

  if (todayDate < startDate) {
    return "planning";
  }

  if (todayDate <= endDate) {
    return "active";
  }

  return "done";
}

// A planning-status trip whose start date is close enough to warrant a
// "Starting soon" badge on its dashboard card. Reads the already-reconciled
// trip.status rather than re-deriving it, so it stays consistent with
// whatever the rest of the UI is showing for this trip.
export function isTripStartingSoon(trip, today = new Date()) {
  if (trip?.status !== "planning" || !trip?.start_date) {
    return false;
  }

  const startDate = parseLocalDate(trip.start_date);

  if (!startDate) {
    return false;
  }

  const todayDate = parseLocalDate(formatDateInputValue(today));
  const diffDays = Math.round((startDate - todayDate) / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= STARTING_SOON_WINDOW_DAYS;
}

export function getTripEndDate(trip) {
  if (!trip?.start_date) {
    return null;
  }

  const startDate = parseLocalDate(trip.start_date);
  const tripLength = Number(trip.trip_length);

  if (!startDate || !Number.isInteger(tripLength) || tripLength < 1) {
    return null;
  }

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + tripLength - 1);
  return endDate;
}

export function isValidDateInput(value) {
  return Boolean(parseLocalDate(value));
}

export function parseLocalDate(value) {
  const normalizedValue = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return null;
  }

  const date = new Date(`${normalizedValue}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatDateInputValue(date) === normalizedValue ? date : null;
}

export function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
