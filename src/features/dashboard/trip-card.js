import { formatStatusLabel, formatTripDateSummary } from "../../lib/format.js";
import { TRIP_STATUSES } from "../../config/constants.js";

export function renderTripCard(trip) {
  const safeStatus = TRIP_STATUSES.includes(trip.status) ? trip.status : "planning";
  const safeCoverUrl = sanitizeCoverUrl(trip.cover_photo_url);
  const coverStyle = safeCoverUrl
    ? `style="background-image: linear-gradient(180deg, rgba(17, 27, 39, 0.04), rgba(17, 27, 39, 0.42)), url(&quot;${escapeHtml(safeCoverUrl)}&quot;);"`
    : "";
  const tripId = escapeHtml(String(trip.id ?? ""));
  const tripTitle = escapeHtml(trip.title || "Untitled trip");
  const tripDescription = escapeHtml(trip.description || "Trip details coming next.");
  const statusLabel = escapeHtml(formatStatusLabel(safeStatus));
  const membershipLabel = trip.membership_role === "planner" ? "Planner" : "Traveler";

  return `
    <article class="trip-card" data-trip-card data-trip-id="${tripId}" role="button" tabindex="0" aria-label="Open ${tripTitle}">
      <div class="trip-card__media" ${coverStyle}>
        <span class="trip-card__status trip-card__status--${safeStatus}">${statusLabel}</span>
      </div>
      <div class="trip-card__body">
        <p class="trip-card__meta">${membershipLabel}</p>
        <h3>${tripTitle}</h3>
        <p class="muted">${tripDescription}</p>
        <p class="trip-card__summary">${escapeHtml(formatTripDateSummary(trip))}</p>
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
