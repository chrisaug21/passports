import { formatStatusLabel, formatTripDateSummary } from "../../lib/format.js";

export function renderTripCard(trip) {
  const coverStyle = trip.cover_photo_url
    ? `style="background-image: linear-gradient(180deg, rgba(17, 27, 39, 0.04), rgba(17, 27, 39, 0.42)), url('${trip.cover_photo_url}');"`
    : "";

  return `
    <article class="trip-card" data-trip-card data-trip-id="${trip.id}" role="button" tabindex="0" aria-label="Open ${trip.title}">
      <div class="trip-card__media" ${coverStyle}>
        <span class="trip-card__status trip-card__status--${trip.status}">${formatStatusLabel(trip.status)}</span>
      </div>
      <div class="trip-card__body">
        <p class="trip-card__meta">${trip.membership_role === "planner" ? "Planner" : "Traveler"}</p>
        <h3>${trip.title}</h3>
        <p class="muted">${trip.description || "Trip details coming next."}</p>
        <p class="trip-card__summary">${formatTripDateSummary(trip)}</p>
      </div>
    </article>
  `;
}
