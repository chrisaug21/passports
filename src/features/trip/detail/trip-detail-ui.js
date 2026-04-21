import {
  formatItemTypeLabel,
  formatStatusLabel,
} from "../../../lib/format.js";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderAnchorIndicator() {
  return `
    <span class="anchor-indicator" aria-label="Anchor item" title="Anchor item">
      <i data-lucide="lock" aria-hidden="true"></i>
    </span>
  `;
}

export function getTripStatTiles(trip, bases, items) {
  const confirmedStatuses = new Set(["confirmed", "reserved", "done"]);
  const mealCount = items.filter((item) => item.item_type === "meal" && confirmedStatuses.has(item.status)).length;
  const activityCount = items.filter((item) => item.item_type === "activity" && confirmedStatuses.has(item.status)).length;
  const stayCount = items.filter((item) => item.item_type === "lodging" && confirmedStatuses.has(item.status)).length;
  const flightCount = items.filter((item) => item.item_type === "transport" && item.transport_mode === "flight").length;
  const trainCount = items.filter((item) => item.item_type === "transport" && item.transport_mode === "train").length;
  const rideCount = items.filter((item) => item.item_type === "transport" && item.transport_mode === "car").length;
  const ferryCount = items.filter((item) => item.item_type === "transport" && item.transport_mode === "ferry").length;
  const ideaCount = items.filter((item) => item.status === "idea" || item.status === "shortlisted" || !item.day_id).length;
  const tiles = [
    { label: getCountLabel(bases.length, "Base", "Bases"), count: bases.length },
    { label: getCountLabel(Number(trip.trip_length) || 0, "Day", "Days"), count: Number(trip.trip_length) || 0 },
    { label: getCountLabel(mealCount, "Meal", "Eats"), count: mealCount },
    { label: getCountLabel(activityCount, "Activity", "Activities"), count: activityCount },
    { label: "Stays", count: stayCount },
    { label: getCountLabel(flightCount, "Flight", "Flights"), count: flightCount },
    { label: getCountLabel(trainCount, "Train", "Trains"), count: trainCount },
    { label: getCountLabel(rideCount, "Ride", "Rides"), count: rideCount },
    { label: getCountLabel(ferryCount, "Ferry", "Ferries"), count: ferryCount },
    { label: getCountLabel(ideaCount, "Idea", "Ideas"), count: ideaCount },
  ].filter((tile) => tile.count > 0);

  if (tiles.length === 0) {
    return [
      { label: "Days", count: Number(trip.trip_length) || 0 },
      { label: "Bases", count: bases.length },
    ];
  }

  return tiles;
}

export function getCountLabel(count, singular, plural) {
  return count === 1 ? singular : plural;
}

export function renderItemTypeIcon(item, className = "") {
  const iconName = getItemIconName(item);
  const extraClass = className ? ` ${className}` : "";

  return `<span class="item-type-icon${extraClass}"><i data-lucide="${iconName}" aria-hidden="true"></i></span>`;
}

export function getItemIconName(item) {
  if (item.item_type === "lodging") {
    return "bed";
  }

  if (item.item_type === "meal") {
    return "utensils";
  }

  if (item.item_type === "transport") {
    return {
      flight: "plane",
      train: "train-front",
      car: "car",
      ferry: "ship",
      bus: "bus",
      other: "navigation",
    }[item.transport_mode] || "navigation";
  }

  return {
    arts_culture: "palette",
    live_music_shows: "music",
    sightseeing: "camera",
    outdoors_nature: "trees",
    sports: "disc",
    tastings_drinks: "wine",
    cafes_markets: "coffee",
    shopping: "shopping-bag",
    wellness_spa: "sparkles",
    entertainment: "ticket",
    nightlife: "moon",
    other: "circle-dot",
  }[item.activity_type] || "circle-dot";
}

export function renderItemSubtypeLine(item) {
  const label = getItemSubtypeLabel(item);

  if (!label) {
    return "";
  }

  return `<p class="muted day-item__subtype">${escapeHtml(label)}</p>`;
}

export function getItemSubtypeLabel(item) {
  if (item.item_type === "meal") {
    return item.meal_slot ? formatItemTypeLabel(item.meal_slot) : "";
  }

  if (item.item_type === "activity") {
    return item.activity_type ? formatItemTypeLabel(item.activity_type) : "";
  }

  if (item.item_type === "transport") {
    return item.transport_mode ? formatItemTypeLabel(item.transport_mode) : "";
  }

  return "";
}

export function renderItemStatusMeta(status) {
  const safeStatus = String(status || "");

  return `
    <p class="item-status-meta item-status-meta--${escapeHtml(safeStatus)}">
      <span class="status-dot status-dot--${escapeHtml(safeStatus)}" aria-hidden="true"></span>
      <span>${escapeHtml(formatStatusLabel(safeStatus))}</span>
    </p>
  `;
}

export function getTripHeaderMediaStyle(trip) {
  const safeCoverUrl = sanitizeCoverUrl(trip?.cover_photo_url);

  if (!safeCoverUrl) {
    return "";
  }

  return ` style="background-image: linear-gradient(180deg, rgba(17, 27, 39, 0.04), rgba(17, 27, 39, 0.42)), url(&quot;${escapeHtml(safeCoverUrl)}&quot;);"`;
}

export function sanitizeCoverUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(String(value));

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.toString();
  } catch (_error) {
    return "";
  }
}

export function getDisplayTitleForToast(value, fallback) {
  const title = String(value || "").trim();
  return title || fallback;
}
