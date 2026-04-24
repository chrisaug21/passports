import { formatStatusLabel, formatTripDateSummary } from "../../lib/format.js";
import { DERIVED_TRIP_STATUSES } from "../../config/constants.js";
import { deriveTripStatus } from "../../lib/derive.js";

export function renderTripCard(trip, options = {}) {
  const derivedStatus = deriveTripStatus(trip);
  const safeStatus = DERIVED_TRIP_STATUSES.includes(derivedStatus) ? derivedStatus : "planning";
  const safeCoverUrl = sanitizeCoverUrl(trip.hero_photo_url || trip.cover_photo_url);
  const tripId = escapeHtml(String(trip.id ?? ""));
  const tripTitle = escapeHtml(trip.title || "Untitled trip");
  const tripDescription = escapeHtml(trip.description || "Trip details coming next.");
  const statusLabel = escapeHtml(formatStatusLabel(safeStatus));
  return `
    <article class="trip-card" data-trip-card data-trip-id="${tripId}" role="button" tabindex="0" aria-label="Open ${tripTitle}">
      <div class="trip-card__media photo-hero">
        ${safeCoverUrl ? `<img class="photo-hero__image" src="${escapeHtml(safeCoverUrl)}" alt="" />` : ""}
        <span class="trip-card__status trip-card__status--${safeStatus}">${statusLabel}</span>
      </div>
      <div class="trip-card__body">
        <h3>${tripTitle}</h3>
        <p class="muted">${tripDescription}</p>
        <p class="trip-card__summary">${escapeHtml(formatTripDateSummary(trip, { includeYear: options.includeYear }))}</p>
      </div>
    </article>
  `;
}

function sanitizeCoverUrl(value) {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
