import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { sessionStore } from "../../state/session-store.js";
import { navigate, renderRoute } from "../../app/router.js";
import { loadDashboard, setDashboardRenderer, sortTripsByStartDate } from "../dashboard/dashboard-page.js";
import { showToast } from "../shared/toast.js";
import {
  createDestination,
  moveTripToWishlist,
  promoteDestinationToTrip,
  updateDestinationSortOrders,
} from "../../services/trips-service.js";
import { formatDestinationTargetDate, formatStatusLabel, formatTripDateSummary } from "../../lib/format.js";
import { isTripStartingSoon } from "../../lib/derive.js";

const BOARD_COLUMNS = [
  {
    id: "wishlist",
    title: "Wishlist",
  },
  {
    id: "planning",
    title: "Planning",
  },
  {
    id: "active",
    title: "Active",
  },
  {
    id: "archive",
    title: "Archive",
  },
];

let rerenderDestinations = () => {};

export function setDestinationsRenderer(renderer) {
  rerenderDestinations = renderer;
}

export function renderDestinationsPage() {
  const { dashboard, destinationsPage } = appStore.getState();
  const columns = buildBoardColumns(tripStore.getTrips());

  return `
    <section class="destinations">
      <div class="destinations-header">
        <div>
          <p class="eyebrow">Destinations</p>
          <h1>Travel Board</h1>
        </div>
        <button class="button" id="open-create-destination-modal" type="button">
          <i data-lucide="plus" aria-hidden="true"></i>
          <span>New Destination</span>
        </button>
      </div>

      ${renderDestinationsContent(dashboard, columns)}
      ${renderCreateDestinationModal(destinationsPage)}
      ${renderPromoteDestinationModal(destinationsPage)}
    </section>
  `;
}

function renderDestinationsContent(dashboard, columns) {
  if (dashboard.status === "loading") {
    return `
      <section class="panel dashboard-state">
        <h3>Loading destinations...</h3>
        <p class="muted">Pulling your board together now.</p>
      </section>
    `;
  }

  if (dashboard.status === "error") {
    return `
      <section class="panel dashboard-state">
        <h3>Could not load destinations</h3>
        <p class="muted">${escapeHtml(dashboard.error || "Try refreshing the page.")}</p>
        <button class="button button--secondary" id="retry-destinations-load" type="button">Try Again</button>
      </section>
    `;
  }

  if (dashboard.status !== "ready") {
    return "";
  }

  return `
    <section class="destinations-board" aria-label="Destinations board">
      ${BOARD_COLUMNS.map((column) => renderBoardColumn(column, columns[column.id] || [])).join("")}
    </section>
  `;
}

function buildBoardColumns(trips) {
  const wishlist = sortWishlistTrips(trips.filter((trip) => trip.status === "destinations"));

  return {
    wishlist,
    planning: sortTripsByStartDate(trips.filter((trip) => trip.status === "planning"), "asc"),
    active: sortTripsByStartDate(trips.filter((trip) => trip.status === "active"), "asc"),
    archive: sortTripsByStartDate(trips.filter((trip) => trip.status === "done"), "desc"),
  };
}

function sortWishlistTrips(trips) {
  return [...trips].sort((left, right) => {
    const leftTarget = getTargetSortValue(left);
    const rightTarget = getTargetSortValue(right);

    if (leftTarget !== rightTarget) {
      return leftTarget - rightTarget;
    }

    if (leftTarget === Number.POSITIVE_INFINITY) {
      const orderDiff = (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0);

      if (orderDiff !== 0) {
        return orderDiff;
      }
    }

    return String(left.title || "").localeCompare(String(right.title || ""));
  });
}

function getTargetSortValue(trip) {
  const year = Number(trip.target_year);

  if (!Number.isInteger(year)) {
    return Number.POSITIVE_INFINITY;
  }

  const month = Number(trip.target_month);
  return year * 100 + (Number.isInteger(month) ? month : 0);
}

function renderBoardColumn(column, trips) {
  const undatedWishlistIds = column.id === "wishlist"
    ? trips.filter((trip) => !trip.target_year).map((trip) => trip.id)
    : [];

  return `
    <section class="destinations-column" data-destination-column="${column.id}">
      <div class="destinations-column__header">
        <div>
          <h2>${escapeHtml(column.title)}</h2>
        </div>
        <span>${trips.length}</span>
      </div>
      <div class="destinations-column__cards">
        ${
          trips.length > 0
            ? trips.map((trip, index) => {
                const undatedIndex = undatedWishlistIds.indexOf(trip.id);
                return renderDestinationCard(trip, {
                  columnId: column.id,
                  index,
                  totalCount: trips.length,
                  undatedIndex,
                  undatedCount: undatedWishlistIds.length,
                });
              }).join("")
            : renderEmptyColumn(column.id)
        }
      </div>
    </section>
  `;
}

function renderDestinationCard(trip, options) {
  const safeCoverUrl = sanitizeCoverUrl(trip.hero_photo_url || trip.cover_photo_url);
  const statusLabel = trip.status === "destinations"
    ? formatDestinationTargetDate(trip)
    : formatTripDateSummary(trip, { includeYear: trip.status === "done" });
  const canReorder = options.columnId === "wishlist" && !trip.target_year;

  return `
    <article class="destination-card" data-destination-card data-trip-id="${escapeHtml(String(trip.id))}">
      <div class="destination-card__media">
        ${safeCoverUrl ? `<img src="${escapeHtml(safeCoverUrl)}" alt="" loading="lazy" decoding="async" />` : ""}
        <span class="destination-card__badge destination-card__badge--${escapeHtml(trip.status)}">
          ${escapeHtml(formatStatusLabel(trip.status))}
        </span>
      </div>
      <div class="destination-card__body">
        <div>
          <h3>${escapeHtml(trip.title || "Untitled trip")}</h3>
          <p>${escapeHtml(trip.description || getFallbackDescription(trip.status))}</p>
        </div>
        <div class="destination-card__meta">
          <span>${escapeHtml(statusLabel)}</span>
          ${isTripStartingSoon(trip) ? `<span>Starting soon</span>` : ""}
        </div>
        ${renderCardActions(trip, { ...options, canReorder })}
      </div>
    </article>
  `;
}

function renderCardActions(trip, options) {
  if (trip.status === "destinations") {
    return `
      <div class="destination-card__actions">
        <button class="button button--secondary" type="button" data-open-trip="${escapeHtml(String(trip.id))}">Open</button>
        <button class="button" type="button" data-promote-destination="${escapeHtml(String(trip.id))}">Promote</button>
        ${
          options.canReorder
            ? `
              <div class="destination-card__order" aria-label="Reorder ${escapeHtml(trip.title || "destination")}">
                <button class="icon-button" type="button" data-reorder-wishlist="${escapeHtml(String(trip.id))}" data-direction="up" ${options.undatedIndex === 0 ? "disabled" : ""} aria-label="Move up">
                  <i data-lucide="arrow-up" aria-hidden="true"></i>
                </button>
                <button class="icon-button" type="button" data-reorder-wishlist="${escapeHtml(String(trip.id))}" data-direction="down" ${options.undatedIndex === options.undatedCount - 1 ? "disabled" : ""} aria-label="Move down">
                  <i data-lucide="arrow-down" aria-hidden="true"></i>
                </button>
              </div>
            `
            : ""
        }
      </div>
    `;
  }

  return `
    <div class="destination-card__actions">
      <button class="button button--secondary" type="button" data-open-trip="${escapeHtml(String(trip.id))}">Open</button>
      ${
        trip.status === "planning"
          ? `<button class="button-link" type="button" data-move-to-wishlist="${escapeHtml(String(trip.id))}">Move to Wishlist</button>`
          : ""
      }
    </div>
  `;
}

function renderEmptyColumn(columnId) {
  const messages = {
    wishlist: "No Wishlist places yet.",
    planning: "No trips being planned.",
    active: "No active trips right now.",
    archive: "Past trips will show up here.",
  };

  return `
    <div class="destinations-empty">
      <p>${escapeHtml(messages[columnId] || "Nothing here yet.")}</p>
    </div>
  `;
}

function renderCreateDestinationModal(destinationsPage) {
  return `
    <div class="modal-shell is-hidden" id="create-destination-modal" aria-hidden="true">
      <div class="modal-backdrop" data-close-create-destination></div>
      <section class="panel modal-card">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Wishlist</p>
            <h3>Add a destination</h3>
          </div>
          <button class="icon-button" id="close-create-destination-modal" type="button" aria-label="Close destination form">x</button>
        </div>

        <form class="create-trip-form" id="create-destination-form">
          <label class="field">
            <span>Destination Title</span>
            <input name="title" type="text" maxlength="120" placeholder="Portugal someday" required />
          </label>

          <label class="field">
            <span>Description</span>
            <input name="description" type="text" maxlength="160" placeholder="Optional short note" />
          </label>

          <div class="destinations-form-grid">
            <label class="field">
              <span>Target Year</span>
              <input name="targetYear" type="number" min="2026" max="2100" placeholder="2028" />
            </label>

            <label class="field">
              <span>Target Month</span>
              <select name="targetMonth">
                <option value="">Any month</option>
                ${Array.from({ length: 12 }, (_value, index) => renderMonthOption(index + 1)).join("")}
              </select>
            </label>
          </div>

          <div class="modal-card__actions">
            <button class="button button--secondary" id="cancel-create-destination" type="button">Cancel</button>
            <button class="button" type="submit" ${destinationsPage.isCreatingDestination ? "disabled" : ""}>
              ${destinationsPage.isCreatingDestination ? "Adding..." : "Add Destination"}
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderPromoteDestinationModal(destinationsPage) {
  const trip = tripStore.getTrips().find((entry) => entry.id === destinationsPage.promotingTripId) || null;
  const isHidden = trip ? "" : " is-hidden";

  return `
    <div class="modal-shell${isHidden}" id="promote-destination-modal" aria-hidden="${trip ? "false" : "true"}">
      <div class="modal-backdrop" data-close-promote-destination></div>
      <section class="panel modal-card">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Promote to Planning</p>
            <h3>${escapeHtml(trip?.title || "Plan this trip")}</h3>
          </div>
          <button class="icon-button" id="close-promote-destination-modal" type="button" aria-label="Close promotion form">x</button>
        </div>

        <form class="create-trip-form" id="promote-destination-form">
          <label class="field">
            <span>Trip Length</span>
            <input name="tripLength" type="number" min="1" max="60" value="${escapeHtml(String(trip?.trip_length || 7))}" required />
          </label>

          <label class="field">
            <span>Start Date</span>
            <input name="startDate" type="date" required />
          </label>

          <div class="modal-card__actions">
            <button class="button button--secondary" id="cancel-promote-destination" type="button">Cancel</button>
            <button class="button" type="submit" ${destinationsPage.isPromotingDestination ? "disabled" : ""}>
              ${destinationsPage.isPromotingDestination ? "Promoting..." : "Promote to Planning"}
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderMonthOption(month) {
  const label = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2026, month - 1, 1));
  return `<option value="${month}">${escapeHtml(label)}</option>`;
}

export function wireDestinationsPage() {
  document.querySelector("#open-create-destination-modal")?.addEventListener("click", openCreateDestinationModal);
  document.querySelector("#retry-destinations-load")?.addEventListener("click", () => {
    loadDashboard();
  });

  document.querySelectorAll("[data-open-trip]").forEach((button) => {
    button.addEventListener("click", () => {
      navigate(`/app/trip/${button.getAttribute("data-open-trip")}`);
    });
  });

  document.querySelectorAll("[data-promote-destination]").forEach((button) => {
    button.addEventListener("click", () => {
      appStore.updateDestinationsPage({ promotingTripId: button.getAttribute("data-promote-destination") });
      rerenderDestinations();
    });
  });

  document.querySelectorAll("[data-move-to-wishlist]").forEach((button) => {
    button.addEventListener("click", () => {
      moveToWishlist(button.getAttribute("data-move-to-wishlist"));
    });
  });

  document.querySelectorAll("[data-reorder-wishlist]").forEach((button) => {
    button.addEventListener("click", () => {
      reorderWishlist(button.getAttribute("data-reorder-wishlist"), button.getAttribute("data-direction"));
    });
  });

  wireCreateDestinationModal();
  wirePromoteDestinationModal();
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

function openCreateDestinationModal() {
  document.querySelector("#create-destination-modal")?.classList.remove("is-hidden");
}

function wireCreateDestinationModal() {
  const modal = document.querySelector("#create-destination-modal");
  const form = document.querySelector("#create-destination-form");
  const closeModal = () => modal?.classList.add("is-hidden");

  document.querySelector("#close-create-destination-modal")?.addEventListener("click", closeModal);
  document.querySelector("#cancel-create-destination")?.addEventListener("click", closeModal);
  document.querySelector("[data-close-create-destination]")?.addEventListener("click", closeModal);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const { session } = sessionStore.getState();

    if (!session?.user?.id) {
      showToast("Your session expired. Sign in again.", "error");
      return;
    }

    const formData = new FormData(form);
    const targetYear = parseOptionalInteger(formData.get("targetYear"));
    const targetMonth = targetYear ? parseOptionalInteger(formData.get("targetMonth")) : null;

    appStore.updateDestinationsPage({ isCreatingDestination: true });

    try {
      const newDestination = await createDestination({
        ownerId: session.user.id,
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        targetYear,
        targetMonth,
      });

      tripStore.prependTrip(newDestination);
      appStore.updateDestinationsPage({ isCreatingDestination: false });
      showToast("Destination added.", "success");
      closeModal();
      form.reset();
      rerenderDestinations();
    } catch (error) {
      console.error(error);
      appStore.updateDestinationsPage({ isCreatingDestination: false });
      showToast("Could not add that destination right now.", "error");
      rerenderDestinations();
    }
  });
}

function wirePromoteDestinationModal() {
  const modal = document.querySelector("#promote-destination-modal");
  const form = document.querySelector("#promote-destination-form");
  const closeModal = () => {
    appStore.updateDestinationsPage({ promotingTripId: null });
    rerenderDestinations();
  };

  document.querySelector("#close-promote-destination-modal")?.addEventListener("click", closeModal);
  document.querySelector("#cancel-promote-destination")?.addEventListener("click", closeModal);
  document.querySelector("[data-close-promote-destination]")?.addEventListener("click", closeModal);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const { destinationsPage } = appStore.getState();
    const trip = tripStore.getTrips().find((entry) => entry.id === destinationsPage.promotingTripId) || null;

    if (!trip) {
      showToast("That destination is no longer available.", "error");
      closeModal();
      return;
    }

    const formData = new FormData(form);
    appStore.updateDestinationsPage({ isPromotingDestination: true });

    try {
      const updatedTrip = await promoteDestinationToTrip({
        tripId: trip.id,
        title: trip.title,
        description: trip.description,
        tripLength: Number(formData.get("tripLength")) || 1,
        startDate: String(formData.get("startDate") || "").trim(),
      });

      tripStore.updateTrip(updatedTrip);
      appStore.updateDestinationsPage({ isPromotingDestination: false, promotingTripId: null });
      showToast("Destination moved to Planning.", "success");
      rerenderDestinations();
    } catch (error) {
      console.error(error);
      appStore.updateDestinationsPage({ isPromotingDestination: false });
      showToast("Could not promote that destination right now.", "error");
      rerenderDestinations();
    }
  });
}

async function moveToWishlist(tripId) {
  if (!tripId) {
    return;
  }

  appStore.updateDestinationsPage({ isMovingToWishlist: true, movingTripId: tripId });

  try {
    const updatedTrip = await moveTripToWishlist({ tripId });
    tripStore.updateTrip(updatedTrip);
    appStore.updateDestinationsPage({ isMovingToWishlist: false, movingTripId: null });
    showToast("Trip moved to Wishlist.", "success");
    rerenderDestinations();
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({ isMovingToWishlist: false, movingTripId: null });
    showToast("Could not move that trip right now.", "error");
    rerenderDestinations();
  }
}

async function reorderWishlist(tripId, direction) {
  const wishlistTrips = sortWishlistTrips(tripStore.getTrips().filter((trip) => trip.status === "destinations" && !trip.target_year));
  const currentIndex = wishlistTrips.findIndex((trip) => trip.id === tripId);
  const offset = direction === "up" ? -1 : 1;
  const nextIndex = currentIndex + offset;

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= wishlistTrips.length) {
    return;
  }

  const reorderedTrips = [...wishlistTrips];
  const [movedTrip] = reorderedTrips.splice(currentIndex, 1);
  reorderedTrips.splice(nextIndex, 0, movedTrip);
  const tripsWithSortOrder = reorderedTrips.map((trip, index) => ({ ...trip, sort_order: index }));

  tripStore.mergeTrips(tripsWithSortOrder);
  appStore.updateDestinationsPage({ isReorderingWishlist: true });
  rerenderDestinations();

  try {
    const savedTrips = await updateDestinationSortOrders(tripsWithSortOrder);
    tripStore.mergeTrips(savedTrips);
    appStore.updateDestinationsPage({ isReorderingWishlist: false });
    rerenderDestinations();
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({ isReorderingWishlist: false });
    showToast("Could not reorder Wishlist right now.", "error");
    loadDashboard();
  }
}

function parseOptionalInteger(value) {
  if (String(value || "").trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function getFallbackDescription(status) {
  if (status === "destinations") {
    return "A place to think about for a future trip.";
  }

  return "Trip details coming next.";
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
