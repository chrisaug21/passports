import { fetchTripDetailBundle } from "../../../services/trips-service.js";
import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  renderPrepView,
  renderPrepLoadingView,
  renderPrepErrorView,
} from "./prep-view.js";
import { wirePrepView } from "./prep-wire.js";

export function renderPrepPage() {
  return `
    <section class="prep-view">
      <div id="prep-view-root">
        ${renderPrepLoadingView()}
      </div>
    </section>
  `;
}

export function renderAndWirePrepPage() {
  const root = document.querySelector("#prep-view-root");
  const trip = tripStore.getCurrentTrip();

  if (!root || !trip) {
    return;
  }

  const todos = tripStore.getCurrentTodos();
  const { prepPage } = appStore.getState();

  root.innerHTML = renderPrepView({ trip, todos, prepPage });
  window.lucide?.createIcons?.();
  wirePrepView({ trip, todos, prepPage, rerender: renderAndWirePrepPage });
}

export async function loadPrepPage(tripId) {
  appStore.resetPrepPage();
  appStore.updatePrepPage({ status: "loading", error: "" });

  try {
    const bundle = await fetchTripDetailBundle(tripId);
    tripStore.setCurrentTripBundle(bundle);
    appStore.updatePrepPage({ status: "ready", error: "" });
    document.title = `Passports | Prep Checklist — ${bundle.trip.title || "Trip"}`;
    renderAndWirePrepPage();
  } catch (error) {
    console.error(error);
    appStore.updatePrepPage({ status: "error", error: "We could not load your prep checklist." });

    const root = document.querySelector("#prep-view-root");
    if (root) {
      root.innerHTML = renderPrepErrorView();
    }
  }
}
