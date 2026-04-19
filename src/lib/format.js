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
