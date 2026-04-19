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
