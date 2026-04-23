import {
  formatItemTypeLabel,
  formatStatusLabel,
} from "../../../lib/format.js";
import { TRANSPORT_MODES } from "../../../config/constants.js";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderAnchorIndicator() {
  return `
    <span class="anchor-indicator" aria-label="Anchor stop" title="Anchor stop">
      <i data-lucide="lock" aria-hidden="true"></i>
    </span>
  `;
}

export function getTripStatTiles(trip, bases, items) {
  const confirmedStatuses = new Set(["confirmed", "reserved", "done"]);
  const mealCount = items.filter((item) => item.item_type === "meal" && confirmedStatuses.has(item.status)).length;
  const activityCount = items.filter((item) => item.item_type === "activity" && confirmedStatuses.has(item.status)).length;
  const stayCount = items.filter((item) => item.item_type === "lodging" && confirmedStatuses.has(item.status)).length;
  const transportCounts = TRANSPORT_MODES.reduce((counts, mode) => ({
    ...counts,
    [mode]: items.filter((item) => item.item_type === "transport" && item.transport_mode === mode).length,
  }), {});
  const ideaCount = items.filter((item) => item.status === "idea" || item.status === "shortlisted").length;
  const tiles = [
    { label: getCountLabel(bases.length, "Base", "Bases"), count: bases.length },
    { label: getCountLabel(Number(trip.trip_length) || 0, "Day", "Days"), count: Number(trip.trip_length) || 0 },
    { label: getCountLabel(mealCount, "Meal", "Eats"), count: mealCount },
    { label: getCountLabel(activityCount, "Activity", "Activities"), count: activityCount },
    { label: getCountLabel(stayCount, "Stay", "Stays"), count: stayCount },
    ...TRANSPORT_MODES.map((mode) => ({
      label: getTransportCountLabel(transportCounts[mode], mode),
      count: transportCounts[mode],
    })),
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

function getTransportCountLabel(count, mode) {
  const labels = {
    flight: ["Flight", "Flights"],
    train: ["Train", "Trains"],
    car: ["Ride", "Rides"],
    ferry: ["Ferry", "Ferries"],
    bus: ["Bus", "Buses"],
    other: ["Transport", "Transport"],
  }[mode] || [formatItemTypeLabel(mode), formatItemTypeLabel(mode)];

  return getCountLabel(count, labels[0], labels[1]);
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
    sports: "trophy",
    tastings_drinks: "wine",
    cafes_markets: "coffee",
    shopping: "shopping-bag",
    walking_exploring: "footprints",
    wellness_spa: "flower",
    entertainment: "ticket",
    nightlife: "moon",
    other: "sparkles",
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

export function getTripHeroPhotoUrl(trip) {
  return sanitizeCoverUrl(trip?.hero_photo_url || trip?.cover_photo_url);
}

export function getBaseHeroPhotoUrl(base) {
  return sanitizeCoverUrl(base?.hero_photo_url);
}

export function renderHeroPhotoImage(photoUrl) {
  const safePhotoUrl = sanitizeCoverUrl(photoUrl);
  return safePhotoUrl ? `<img class="photo-hero__image" src="${escapeHtml(safePhotoUrl)}" alt="" />` : "";
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
