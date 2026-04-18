export function formatTripDateSummary(trip) {
  if (!trip.start_date) {
    return `${trip.trip_length} day${trip.trip_length === 1 ? "" : "s"} · dates TBD`;
  }

  const startDate = new Date(`${trip.start_date}T12:00:00`);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + Math.max(trip.trip_length - 1, 0));

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

export function formatStatusLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatItemTypeLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
