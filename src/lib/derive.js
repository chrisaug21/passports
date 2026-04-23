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
    return "traveling";
  }

  return "past";
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
