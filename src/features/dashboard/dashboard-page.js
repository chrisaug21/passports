import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { createTripWithDefaults, listTripsForCurrentUser } from "../../services/trips-service.js";
import { sessionStore } from "../../state/session-store.js";
import { renderTripCard } from "./trip-card.js";
import { renderCreateTripModal, wireCreateTripModal } from "./create-trip-modal.js";
import { showToast } from "../shared/toast.js";
import { navigate } from "../../app/router.js";
import { deriveTripStatus } from "../../lib/derive.js";

let rerenderDashboard = () => {};

export function setDashboardRenderer(renderer) {
  rerenderDashboard = renderer;
}

export function renderDashboardPage() {
  const { dashboard } = appStore.getState();
  const trips = tripStore.getTrips();
  const activeTrips = sortTripsByStartDate(trips.filter((trip) => deriveTripStatus(trip) !== "past"), "asc");
  const pastTrips = sortTripsByStartDate(trips.filter((trip) => deriveTripStatus(trip) === "past"), "desc");

  return `
    <section class="dashboard">
      ${
        dashboard.status === "loading"
          ? `
            <section class="panel dashboard-state">
              <h3>Loading trips…</h3>
              <p class="muted">Pulling your trip list now.</p>
            </section>
          `
          : ""
      }

      ${
        dashboard.status === "error"
          ? `
            <section class="panel dashboard-state">
              <h3>Could not load trips</h3>
              <p class="muted">${dashboard.error || "Try refreshing the page."}</p>
              <button class="button button--secondary" id="retry-dashboard-load" type="button">Try Again</button>
            </section>
          `
          : ""
      }

      ${
        dashboard.status === "ready" && trips.length === 0
          ? `
            <section class="panel dashboard-state">
              <p class="eyebrow">No Trips Yet</p>
              <h3>Create your first trip.</h3>
              <p class="muted">Start with a title, total days, and optional start date. Passports will create the base trip structure for you.</p>
              <button class="button" id="empty-create-trip-button" type="button">Create First Trip</button>
            </section>
          `
          : ""
      }

      ${
        dashboard.status === "ready" && trips.length > 0
          ? `
            ${
              activeTrips.length > 0
                ? `
                  <section class="dashboard-grid">
                    ${activeTrips.map((trip) => renderTripCard(trip)).join("")}
                  </section>
                `
                : `
                  <section class="panel dashboard-state">
                    <h3>No active trips right now</h3>
                    <p class="muted">Past trips are waiting below.</p>
                  </section>
                `
            }

            ${
              pastTrips.length > 0
                ? `
                  <details class="panel dashboard-past-trips">
                    <summary class="dashboard-past-trips__summary">
                      <div>
                        <p class="eyebrow">Past Trips</p>
                      </div>
                    </summary>
                    <div class="dashboard-past-trips__content">
                      <section class="dashboard-grid">
                        ${pastTrips.map((trip) => renderTripCard(trip, { includeYear: true })).join("")}
                      </section>
                    </div>
                  </details>
                `
                : ""
            }
          `
          : ""
      }

      ${renderCreateTripModal({ isSubmitting: dashboard.isCreatingTrip })}
    </section>
  `;
}

export function wireDashboardPage() {
  document.querySelector("#open-create-trip-modal")?.addEventListener("click", openCreateTripModal);
  document.querySelector("#empty-create-trip-button")?.addEventListener("click", openCreateTripModal);
  document.querySelector("#retry-dashboard-load")?.addEventListener("click", () => {
    loadDashboard();
  });
  document.querySelectorAll("[data-trip-card]").forEach((card) => {
    const tripId = card.getAttribute("data-trip-id");

    const openTrip = () => {
      if (tripId) {
        navigate(`/app/trip/${tripId}`);
      }
    };

    card.addEventListener("click", openTrip);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openTrip();
      }
    });
  });

  wireCreateTripModal({
    onSubmit: async (formValues) => {
      const { session } = sessionStore.getState();

      if (!session?.user?.id) {
        showToast("Your session expired. Sign in again.", "error");
        return;
      }

      appStore.updateDashboard({ isCreatingTrip: true });

      try {
        const newTrip = await createTripWithDefaults({
          ownerId: session.user.id,
          title: formValues.title,
          description: formValues.description,
          tripLength: Number(formValues.tripLength),
          startDate: formValues.startDate,
        });

        tripStore.prependTrip(newTrip);
        appStore.updateDashboard({ isCreatingTrip: false });
        rerenderDashboard();
        showToast("Trip created.", "success");
        return true;
      } catch (error) {
        console.error(error);
        appStore.updateDashboard({ isCreatingTrip: false });
        showToast(getCreateTripErrorMessage(error), "error");
        return false;
      }
    },
  });
}

export async function loadDashboard() {
  const { session } = sessionStore.getState();

  if (!session?.user?.id) {
    return;
  }

  appStore.updateDashboard({
    status: "loading",
    error: "",
  });

  try {
    const trips = await listTripsForCurrentUser(session.user.id);
    tripStore.setTrips(trips);
    appStore.updateDashboard({
      status: "ready",
      error: "",
    });
    rerenderDashboard();
  } catch (error) {
    console.error(error);
    appStore.updateDashboard({
      status: "error",
      error: "We could not load your trips.",
    });
    rerenderDashboard();
  }
}

function openCreateTripModal() {
  document.querySelector("#create-trip-modal")?.classList.remove("is-hidden");
}

function sortTripsByStartDate(trips, direction) {
  const directionMultiplier = direction === "desc" ? -1 : 1;

  return [...trips].sort((a, b) => {
    const aTime = getTripStartTime(a);
    const bTime = getTripStartTime(b);

    if (aTime == null && bTime == null) {
      return String(a.title || "").localeCompare(String(b.title || ""));
    }

    if (aTime == null) {
      return 1;
    }

    if (bTime == null) {
      return -1;
    }

    if (aTime === bTime) {
      return String(a.title || "").localeCompare(String(b.title || ""));
    }

    return (aTime - bTime) * directionMultiplier;
  });
}

function getTripStartTime(trip) {
  if (!trip.start_date) {
    return null;
  }

  const time = new Date(`${trip.start_date}T12:00:00`).getTime();
  return Number.isNaN(time) ? null : time;
}

function getCreateTripErrorMessage(error) {
  const parts = [error?.message, error?.details, error?.hint].filter(Boolean);

  if (parts.length === 0) {
    return "Could not create that trip right now.";
  }

  return parts.join(" ");
}
