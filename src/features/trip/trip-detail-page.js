import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { fetchTripDetailBundle } from "../../services/trips-service.js";
import { formatItemTypeLabel, formatLongDate, formatStatusLabel, formatTripDateSummary } from "../../lib/format.js";
import { navigate } from "../../app/router.js";

let rerenderTripDetail = () => {};

export function setTripDetailRenderer(renderer) {
  rerenderTripDetail = renderer;
}

export function renderTripDetailPage() {
  const { tripDetail } = appStore.getState();
  const trip = tripStore.getCurrentTrip();
  const bases = tripStore.getCurrentBases();
  const days = tripStore.getCurrentDays();
  const items = tripStore.getCurrentItems();

  if (tripDetail.status === "loading") {
    return `
      <section class="trip-detail">
        <section class="panel trip-detail__state">
          <p class="eyebrow">Trip</p>
          <h2>Loading trip…</h2>
          <p class="muted">Pulling trip details, bases, days, and items now.</p>
        </section>
      </section>
    `;
  }

  if (tripDetail.status === "error") {
    return `
      <section class="trip-detail">
        <section class="panel trip-detail__state">
          <p class="eyebrow">Trip</p>
          <h2>Could not load trip</h2>
          <p class="muted">${tripDetail.error || "Try going back to the dashboard and opening the trip again."}</p>
          <div class="trip-detail__state-actions">
            <button class="button button--secondary" id="trip-back-to-dashboard" type="button">Back to Dashboard</button>
            <button class="button" id="retry-trip-load" type="button">Try Again</button>
          </div>
        </section>
      </section>
    `;
  }

  if (!trip) {
    return `
      <section class="trip-detail">
        <section class="panel trip-detail__state">
          <p class="eyebrow">Trip</p>
          <h2>No trip selected</h2>
          <p class="muted">Go back to the dashboard and open a trip card.</p>
          <button class="button" id="trip-back-to-dashboard" type="button">Back to Dashboard</button>
        </section>
      </section>
    `;
  }

  return `
    <section class="trip-detail">
      <button class="text-link" id="trip-back-to-dashboard" type="button">← Back to Dashboard</button>

      <section class="panel trip-header">
        <div class="trip-header__meta">
          <p class="eyebrow">Master List</p>
          <h2 class="trip-header__title">${trip.title}</h2>
          <p class="muted">${trip.description || "Trip details are starting here. Master List will be the main planning workspace."}</p>
        </div>
        <div class="trip-header__status-block">
          <span class="trip-pill">${formatStatusLabel(trip.status)}</span>
          <p class="trip-header__dates">${formatTripDateSummary(trip)}</p>
          <p class="muted">${trip.start_date ? `Starts ${formatLongDate(trip.start_date)}` : "Start date not set yet"}</p>
        </div>
      </section>

      <section class="trip-stats">
        <article class="panel trip-stat">
          <p class="eyebrow">Bases</p>
          <h3>${bases.length}</h3>
          <p class="muted">${bases.length === 1 ? bases[0]?.name || "Main Base" : "Cities or stays in this trip"}</p>
        </article>
        <article class="panel trip-stat">
          <p class="eyebrow">Days</p>
          <h3>${days.length}</h3>
          <p class="muted">Trip length structure is already in place.</p>
        </article>
        <article class="panel trip-stat">
          <p class="eyebrow">Items</p>
          <h3>${items.length}</h3>
          <p class="muted">${items.length === 0 ? "No meals, activities, transport, or lodging yet." : "Items already saved to this trip."}</p>
        </article>
      </section>

      <section class="trip-view-tabs">
        <button class="trip-view-tabs__button is-active" type="button">Master List</button>
        <button class="trip-view-tabs__button" type="button" disabled>Days View Next</button>
      </section>

      <section class="panel master-list-panel">
        <div class="master-list-panel__header">
          <div>
            <p class="eyebrow">All Items</p>
            <h3>Master List</h3>
          </div>
          <p class="muted">Read-only for this checkpoint. Add and edit flows come next.</p>
        </div>

        ${
          items.length === 0
            ? `
              <div class="master-list-empty">
                <h4>No items yet</h4>
                <p class="muted">This trip exists, its base and day structure are loaded, and the app is ready for the next checkpoint: adding items into the master list.</p>
              </div>
            `
            : `
              <div class="master-list-table">
                ${items.map((item) => renderMasterListRow(item, days, bases)).join("")}
              </div>
            `
        }
      </section>
    </section>
  `;
}

export function wireTripDetailPage(tripId) {
  document.querySelector("#trip-back-to-dashboard")?.addEventListener("click", () => {
    navigate("/app");
  });

  document.querySelector("#retry-trip-load")?.addEventListener("click", () => {
    loadTripDetail(tripId);
  });
}

export async function loadTripDetail(tripId) {
  appStore.updateTripDetail({
    status: "loading",
    error: "",
  });

  try {
    const bundle = await fetchTripDetailBundle(tripId);
    tripStore.setCurrentTripBundle(bundle);
    appStore.updateTripDetail({
      status: "ready",
      error: "",
    });
    rerenderTripDetail();
  } catch (error) {
    console.error(error);
    tripStore.resetCurrentTrip();
    appStore.updateTripDetail({
      status: "error",
      error: "We could not load that trip.",
    });
    rerenderTripDetail();
  }
}

function renderMasterListRow(item, days, bases) {
  const day = days.find((entry) => entry.id === item.day_id);
  const base = bases.find((entry) => entry.id === item.base_id);

  return `
    <article class="master-list-row">
      <div class="master-list-row__main">
        <div class="master-list-row__title-line">
          <h4>${item.title}</h4>
          ${item.is_anchor ? '<span class="trip-pill trip-pill--anchor">Anchor</span>' : ""}
        </div>
        <p class="muted">
          ${formatItemTypeLabel(item.item_type)} · ${formatStatusLabel(item.status)}
          ${base ? ` · ${base.name}` : " · Unassigned base"}
          ${day ? ` · Day ${day.day_number}` : " · Unassigned day"}
        </p>
      </div>
    </article>
  `;
}
