import { appStore } from "../../state/app-store.js";
import { renderRoute } from "../../app/router.js";
import { loadDashboard, setDashboardRenderer } from "../dashboard/dashboard-page.js";
import { setDestinationsRenderer } from "./destinations-state.js";
import {
  openCreateDestinationModal,
  openDestinationCard,
  wireCreateDestinationModal,
  wireDestinationDetailModal,
  wireBoardDemoteConfirmModal,
} from "./destinations-wire.js";
import { wireBoardDragHandles } from "./destinations-drag.js";

export { renderDestinationsPage } from "./destinations-view.js";

export function wireDestinationsPage() {
  document.querySelector("#open-create-destination-modal")?.addEventListener("click", openCreateDestinationModal);
  document.querySelector("#retry-destinations-load")?.addEventListener("click", () => {
    loadDashboard();
  });

  document.querySelectorAll("[data-destination-card]").forEach((card) => {
    const openCard = () => {
      openDestinationCard(card.getAttribute("data-trip-id"));
    };

    card.addEventListener("click", (event) => {
      if (card.dataset.justDragged === "true") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      openCard();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCard();
      }
    });
  });

  document.querySelectorAll("[data-destination-card-image]").forEach((image) => {
    image.addEventListener("error", () => {
      const fallbackUrl = image.getAttribute("data-full-src");

      if (fallbackUrl && image.src !== fallbackUrl) {
        image.src = fallbackUrl;
        image.removeAttribute("data-full-src");
      }
    }, { once: true });
  });

  wireCreateDestinationModal();
  wireDestinationDetailModal();
  wireBoardDemoteConfirmModal();
  wireBoardDragHandles();
}

export function loadDestinationsPage() {
  setDashboardRenderer(() => {
    renderRoute({ preserveScroll: true });
  });

  setDestinationsRenderer(() => {
    renderRoute({ preserveScroll: true });
  });

  if (appStore.getState().dashboard.status === "idle") {
    loadDashboard();
  }
}
