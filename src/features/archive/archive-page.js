import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { renderTripCard } from "../dashboard/trip-card.js";
import { loadDashboard, setDashboardRenderer, sortTripsByStartDate } from "../dashboard/dashboard-page.js";
import { navigate, renderRoute } from "../../app/router.js";

export function renderArchivePage() {
  const { dashboard } = appStore.getState();
  const doneTrips = sortTripsByStartDate(
    tripStore.getTrips().filter((trip) => trip.status === "done"),
    "desc",
  );

  return `
    <section class="dashboard">
      <div class="dashboard-header">
        <h1>Archive of Past Trips</h1>
      </div>

      ${renderArchiveContent(dashboard, doneTrips)}
    </section>
  `;
}

function renderArchiveContent(dashboard, doneTrips) {
  if (dashboard.status === "loading") {
    return `
      <section class="panel dashboard-state">
        <h3>Loading trips…</h3>
        <p class="muted">Pulling your trip list now.</p>
      </section>
    `;
  }

  if (dashboard.status === "error") {
    return `
      <section class="panel dashboard-state">
        <h3>Could not load trips</h3>
        <p class="muted">${dashboard.error || "Try refreshing the page."}</p>
        <button class="button button--secondary" id="retry-archive-load" type="button">Try Again</button>
      </section>
    `;
  }

  if (dashboard.status === "ready" && doneTrips.length === 0) {
    return `
      <section class="panel dashboard-state">
        <p class="eyebrow">Archive</p>
        <h3>No past trips yet.</h3>
        <p class="muted">Trips land here once they're done.</p>
      </section>
    `;
  }

  if (dashboard.status === "ready" && doneTrips.length > 0) {
    return `
      <section class="dashboard-grid">
        ${doneTrips.map((trip) => renderTripCard(trip, { includeYear: true })).join("")}
      </section>
    `;
  }

  return "";
}

export function wireArchivePage() {
  const trips = tripStore.getTrips();

  document.querySelector("#retry-archive-load")?.addEventListener("click", () => {
    loadDashboard();
  });

  document.querySelectorAll("[data-trip-card]").forEach((card) => {
    const tripId = card.getAttribute("data-trip-id");
    const trip = trips.find((entry) => String(entry.id) === String(tripId));

    const openTrip = () => {
      if (!tripId || !trip) {
        return;
      }

      navigate(`/app/trip/${tripId}/guide#journal`);
    };

    card.addEventListener("click", openTrip);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openTrip();
      }
    });
  });
}

export function loadArchivePage() {
  setDashboardRenderer(() => {
    renderRoute({ preserveScroll: true });
  });

  if (appStore.getState().dashboard.status === "idle") {
    loadDashboard();
  }
}
