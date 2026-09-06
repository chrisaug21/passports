import { fetchTripDetailBundle } from "../../../services/trips-service.js";
import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  renderNotesView,
  renderNotesLoadingView,
  renderNotesErrorView,
} from "./notes-view.js";
import { wireNotesView } from "./notes-wire.js";

export function renderNotesPage() {
  return `
    <section class="notes-view">
      <div id="notes-view-root">
        ${renderNotesLoadingView()}
      </div>
    </section>
  `;
}

export function renderAndWireNotesPage() {
  const root = document.querySelector("#notes-view-root");
  const trip = tripStore.getCurrentTrip();

  if (!root || !trip) {
    return;
  }

  const notes = tripStore.getCurrentNotes();
  const { notesPage } = appStore.getState();

  root.innerHTML = renderNotesView({ trip, notes, notesPage });
  window.lucide?.createIcons?.();
  wireNotesView({ trip, notes, notesPage, rerender: renderAndWireNotesPage });
}

export async function loadNotesPage(tripId) {
  appStore.resetNotesPage();
  appStore.updateNotesPage({ status: "loading", error: "" });

  try {
    const bundle = await fetchTripDetailBundle(tripId);
    tripStore.setCurrentTripBundle(bundle);
    appStore.updateNotesPage({ status: "ready", error: "" });
    document.title = `Passports | Notes — ${bundle.trip.title || "Trip"}`;
    renderAndWireNotesPage();
  } catch (error) {
    console.error(error);
    appStore.updateNotesPage({ status: "error", error: "We could not load your notes." });

    const root = document.querySelector("#notes-view-root");
    if (root) {
      root.innerHTML = renderNotesErrorView();
    }
  }
}
