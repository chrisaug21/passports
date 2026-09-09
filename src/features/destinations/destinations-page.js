import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { sessionStore } from "../../state/session-store.js";
import { navigate, renderRoute } from "../../app/router.js";
import { loadDashboard, setDashboardRenderer, sortTripsByStartDate } from "../dashboard/dashboard-page.js";
import { showToast } from "../shared/toast.js";
import {
  createDestination,
  demoteTripToWishlist,
  promoteDestinationToTrip,
  reorderWishlistDestinations,
  updateDestination,
} from "../../services/trips-service.js";
import { fetchTripNotes } from "../../services/notes-service.js";
import { DEFAULT_PHOTO_ASPECT_RATIO, openPhotoCropModal } from "../../lib/photo-upload.js";
import { PHOTO_CONTEXTS, saveUploadedPrimaryPhoto } from "../../services/photos-service.js";
import { formatDestinationTargetDate, formatTripDateSummary } from "../../lib/format.js";
import { isTripStartingSoon, isValidDateInput } from "../../lib/derive.js";

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
    id: "archive",
    title: "Archive",
  },
];

let rerenderDestinations = noop;

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
          <span class="destinations-header__button-label">New Destination</span>
          <span class="destinations-header__button-label-mobile">New</span>
        </button>
      </div>

      ${renderDestinationsContent(dashboard, columns)}
      ${renderCreateDestinationModal(destinationsPage)}
      ${renderDestinationDetailModal(destinationsPage)}
      ${renderBoardDemoteConfirmModal(destinationsPage)}
    </section>
  `;
}

function renderBoardDemoteConfirmModal(destinationsPage) {
  const trip = getSelectedDestination(destinationsPage.demotingDestinationId);

  if (!trip) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-demote-destination></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Move to Wishlist</p>
            <h3>${escapeHtml(trip.title || "Untitled trip")}</h3>
          </div>
        </div>
        <p class="muted">This clears the trip's start date. Bases, days, items, notes, and photos all stay intact.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-demote-destination" type="button">Cancel</button>
          <button class="button" id="confirm-demote-destination" type="button" ${destinationsPage.isDemotingDestination ? "disabled" : ""}>
            ${destinationsPage.isDemotingDestination ? "Moving…" : "Move to Wishlist"}
          </button>
        </div>
      </section>
    </div>
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
    planning: sortTripsByStartDate(trips.filter((trip) => trip.status === "planning" || trip.status === "active"), "asc"),
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
  const year = parseStoredYear(trip.target_year);

  if (year == null) {
    return Number.POSITIVE_INFINITY;
  }

  const month = parseStoredMonth(trip.target_month);
  return year * 100 + (month || 0);
}

function renderBoardColumn(column, trips) {
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
            ? trips.map((trip) => renderDestinationCard(trip)).join("")
            : renderEmptyColumn(column.id)
        }
      </div>
    </section>
  `;
}

function renderDestinationCard(trip) {
  const safeCoverUrl = sanitizeCoverUrl(trip.hero_photo_url || trip.cover_photo_url);
  const dateLabel = trip.status === "destinations"
    ? formatDestinationTargetDate(trip)
    : formatTripDateSummary(trip, { includeYear: trip.status === "done" });
  const tripTitle = escapeHtml(trip.title || "Untitled trip");
  const shouldShowDate = trip.status !== "destinations" || hasDestinationTargetDate(trip);
  const isUndatedWishlistCard = trip.status === "destinations" && !hasDestinationTargetDate(trip);
  const isDemotablePlanningCard = trip.status === "planning";

  return `
    <article
      class="destination-card"
      data-destination-card
      data-trip-id="${escapeHtml(String(trip.id))}"
      role="button"
      tabindex="0"
      aria-label="Open ${tripTitle}"
    >
      ${isUndatedWishlistCard ? `
        <button class="destination-card__drag-handle" data-drag-handle type="button" aria-label="Reorder ${tripTitle}" tabindex="-1">
          <i data-lucide="grip-vertical" aria-hidden="true"></i>
        </button>
      ` : ""}
      <div class="destination-card__media">
        ${safeCoverUrl ? `<img src="${escapeHtml(safeCoverUrl)}" alt="" loading="lazy" decoding="async" />` : ""}
      </div>
      <div class="destination-card__body">
        <h3>${tripTitle}</h3>
        <div class="destination-card__meta">
          ${shouldShowDate ? `<span class="destination-card__date">${escapeHtml(dateLabel)}</span>` : ""}
          ${isTripStartingSoon(trip) ? `<span class="destination-card__soon">Starting soon</span>` : ""}
        </div>
      </div>
      ${isDemotablePlanningCard ? `
        <button class="destination-card__quick-action" data-demote-destination="${escapeHtml(String(trip.id))}" type="button" title="Move to Wishlist" aria-label="Move ${tripTitle} to Wishlist">
          <i data-lucide="bookmark" aria-hidden="true"></i>
        </button>
      ` : ""}
    </article>
  `;
}

function renderEmptyColumn(columnId) {
  return `
    <div class="destinations-empty">
      <p>${escapeHtml(getEmptyColumnMessage(columnId))}</p>
    </div>
  `;
}

function getEmptyColumnMessage(columnId) {
  if (columnId === "wishlist") {
    return "No Wishlist places yet.";
  }

  if (columnId === "planning") {
    return "No trips being planned.";
  }

  if (columnId === "archive") {
    return "Past trips will show up here.";
  }

  return "Nothing here yet.";
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

          <label class="field">
            <span>Photo</span>
            <input name="photo" type="file" accept="image/*" />
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

function renderDestinationDetailModal(destinationsPage) {
  const destination = getSelectedDestination(destinationsPage.selectedDestinationId);

  if (!destinationsPage.selectedDestinationId) {
    return "";
  }

  if (destinationsPage.destinationDetailStatus === "loading" && !destination) {
    return renderDestinationDetailShell(`
      <section class="destinations-detail-state">
        <h3>Loading destination...</h3>
        <p class="muted">Pulling the latest details now.</p>
      </section>
    `);
  }

  if (destinationsPage.destinationDetailStatus === "error" && !destination) {
    return renderDestinationDetailShell(`
      <section class="destinations-detail-state">
        <h3>Could not load destination</h3>
        <p class="muted">${escapeHtml(destinationsPage.destinationDetailError || "Try opening it again.")}</p>
      </section>
    `);
  }

  if (!destination) {
    return "";
  }

  return renderDestinationDetailShell(`
    <form class="destination-detail-form" id="destination-detail-form">
      <div class="destination-detail-form__content">
        ${renderDestinationPhotoField(destination)}

        <label class="field">
          <span>Destination Title</span>
          <input name="title" type="text" maxlength="120" value="${escapeHtml(destination.title || "")}" required />
        </label>

        <label class="field">
          <span>Description</span>
          <input name="description" type="text" maxlength="160" value="${escapeHtml(destination.description || "")}" placeholder="Optional short note" />
        </label>

        <label class="field">
          <span>Photo</span>
          <input name="photo" type="file" accept="image/*" />
        </label>

        <div class="destinations-form-grid">
          <label class="field">
            <span>Target Year</span>
            <input name="targetYear" type="number" min="2026" max="2100" value="${escapeHtml(destination.target_year || "")}" placeholder="2028" />
          </label>

          <label class="field">
            <span>Target Month</span>
            <select name="targetMonth">
              <option value="">Any month</option>
              ${Array.from({ length: 12 }, (_value, index) => renderMonthOption(index + 1, destination.target_month)).join("")}
            </select>
          </label>
        </div>

        ${renderDestinationNotesPreview(destination, destinationsPage)}

        <section class="destination-promote-panel">
          <div>
            <p class="eyebrow">Promote</p>
            <h3>Turn this into a planned trip</h3>
            <p class="muted">Add real dates and Passports will create the starter base and days.</p>
          </div>
          <div class="destinations-form-grid">
            <label class="field">
              <span>Trip Length</span>
              <input name="promoteTripLength" type="number" min="1" max="60" value="7" />
            </label>
            <label class="field">
              <span>Start Date</span>
              <input name="promoteStartDate" type="date" />
            </label>
          </div>
          <button class="button button--secondary" id="promote-destination" type="button" ${destinationsPage.isPromotingDestination ? "disabled" : ""}>
            ${destinationsPage.isPromotingDestination ? "Promoting..." : "Promote to Planning"}
          </button>
        </section>
      </div>

      <div class="modal-card__actions modal-card__actions--sticky">
        <button class="button button--secondary" id="close-destination-detail-footer" type="button">Close</button>
        <button class="button" type="submit" ${destinationsPage.isSavingDestination ? "disabled" : ""}>
          ${destinationsPage.isSavingDestination ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  `, destination);
}

function renderDestinationDetailShell(content, destination = null) {
  return `
    <div class="modal-shell" id="destination-detail-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-destination-detail></div>
      <section class="panel modal-card modal-card--editor destination-detail-modal">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Wishlist</p>
            <h3>${escapeHtml(destination?.title || "Destination")}</h3>
          </div>
          <button class="icon-button" id="close-destination-detail-modal" type="button" aria-label="Close destination details">x</button>
        </div>
        ${content}
      </section>
    </div>
  `;
}

function renderDestinationPhotoField(destination) {
  const safeCoverUrl = sanitizeCoverUrl(destination.hero_photo_url || destination.cover_photo_url);

  return `
    <div class="destination-detail-photo photo-hero">
      ${safeCoverUrl ? `<img class="photo-hero__image" src="${escapeHtml(safeCoverUrl)}" alt="" loading="lazy" decoding="async" />` : `<span class="photo-hero__empty-label">Add photo</span>`}
    </div>
  `;
}

function renderDestinationNotesPreview(destination, destinationsPage) {
  const notes = destinationsPage.selectedDestinationNotes || [];
  const notesContent = renderDestinationNotesContent(destinationsPage.destinationDetailStatus, notes);

  return `
    <section class="destination-notes-panel">
      <div class="destination-notes-panel__header">
        <div>
          <p class="eyebrow">Notes</p>
          <h3>Planning research</h3>
        </div>
        <button class="button button--secondary" data-open-destination-notes="${escapeHtml(destination.id)}" type="button">Open Notes</button>
      </div>
      ${notesContent}
    </section>
  `;
}

function renderDestinationNotesContent(status, notes) {
  if (status === "loading") {
    return `<p class="muted">Loading notes...</p>`;
  }

  if (status === "error") {
    return `<p class="muted">Could not load notes.</p>`;
  }

  if (notes.length === 0) {
    return `<p class="muted">No notes yet.</p>`;
  }

  return `<div class="destination-notes-list">${notes.slice(0, 3).map(renderDestinationNotePreview).join("")}</div>`;
}

function renderDestinationNotePreview(note) {
  const body = String(note.body || "").replace(/\s+/g, " ").trim();
  const preview = body.length > 120 ? `${body.slice(0, 117).trim()}...` : body;

  return `
    <article class="destination-note-preview">
      <h4>${escapeHtml(note.title || "Untitled note")}</h4>
      ${preview ? `<p>${escapeHtml(preview)}</p>` : ""}
    </article>
  `;
}

function renderMonthOption(month, selectedMonth = null) {
  const label = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2026, month - 1, 1));
  const isSelected = Number(selectedMonth) === month;
  return `<option value="${month}" ${isSelected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

export function wireDestinationsPage() {
  document.querySelector("#open-create-destination-modal")?.addEventListener("click", openCreateDestinationModal);
  document.querySelector("#retry-destinations-load")?.addEventListener("click", () => {
    loadDashboard();
  });

  document.querySelectorAll("[data-destination-card]").forEach((card) => {
    const openCard = () => {
      openDestinationCard(card.getAttribute("data-trip-id"));
    };

    card.addEventListener("click", openCard);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCard();
      }
    });
  });

  document.querySelectorAll("[data-demote-destination]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openBoardDemoteConfirm(button.getAttribute("data-demote-destination"));
    });
  });

  wireCreateDestinationModal();
  wireDestinationDetailModal();
  wireBoardDemoteConfirmModal();
  wireWishlistDragReorder();
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

async function openDestinationDetail(destinationId) {
  if (!destinationId) {
    return;
  }

  appStore.updateDestinationsPage({
    selectedDestinationId: destinationId,
    destinationDetailStatus: "loading",
    destinationDetailError: "",
    selectedDestinationNotes: [],
  });
  rerenderDestinations();

  try {
    const notes = await fetchTripNotes(destinationId);
    appStore.updateDestinationsPage({
      destinationDetailStatus: "ready",
      destinationDetailError: "",
      selectedDestinationNotes: notes,
    });
    rerenderDestinations();
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({
      destinationDetailStatus: "error",
      destinationDetailError: "We could not load that destination.",
    });
    rerenderDestinations();
  }
}

function closeDestinationDetail() {
  appStore.updateDestinationsPage({
    selectedDestinationId: null,
    destinationDetailStatus: "idle",
    destinationDetailError: "",
    selectedDestinationNotes: [],
    isSavingDestination: false,
    isPromotingDestination: false,
  });
  rerenderDestinations();
}

function openBoardDemoteConfirm(tripId) {
  if (!tripId) {
    return;
  }

  appStore.updateDestinationsPage({
    demotingDestinationId: tripId,
    isDemotingDestination: false,
  });
  rerenderDestinations();
}

function closeBoardDemoteConfirm() {
  appStore.updateDestinationsPage({
    demotingDestinationId: null,
    isDemotingDestination: false,
  });
  rerenderDestinations();
}

function wireBoardDemoteConfirmModal() {
  document.querySelector("#cancel-demote-destination")?.addEventListener("click", closeBoardDemoteConfirm);
  document.querySelector("[data-cancel-demote-destination]")?.addEventListener("click", closeBoardDemoteConfirm);
  document.querySelector("#confirm-demote-destination")?.addEventListener("click", handleConfirmBoardDemote);
}

async function handleConfirmBoardDemote() {
  const { demotingDestinationId } = appStore.getState().destinationsPage;
  const trip = getSelectedDestination(demotingDestinationId);

  if (!trip?.id) {
    return;
  }

  appStore.updateDestinationsPage({ isDemotingDestination: true });
  rerenderDestinations();

  try {
    const demotedTrip = await demoteTripToWishlist({ tripId: trip.id });
    tripStore.updateTrip(demotedTrip);
    appStore.updateDestinationsPage({
      demotingDestinationId: null,
      isDemotingDestination: false,
    });
    showToast(`${trip.title || "Trip"} moved to Wishlist.`, "success");
    rerenderDestinations();
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({ isDemotingDestination: false });
    showToast("Could not move that trip to Wishlist right now.", "error");
    rerenderDestinations();
  }
}

// Pointer-based reorder for undated Wishlist cards: mouse drags immediately,
// touch requires a brief hold so a normal horizontal-scroll swipe across the
// board isn't mistaken for a drag.
function wireWishlistDragReorder() {
  document.querySelectorAll('[data-destination-column="wishlist"] [data-drag-handle]').forEach((handle) => {
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("pointerdown", onWishlistDragHandlePointerDown);
  });
}

function onWishlistDragHandlePointerDown(downEvent) {
  const handle = downEvent.currentTarget;
  const card = handle.closest("[data-destination-card]");
  const list = handle.closest('[data-destination-column="wishlist"]')?.querySelector(".destinations-column__cards");

  if (!card || !list) {
    return;
  }

  if (downEvent.pointerType === "mouse") {
    beginWishlistDrag({ pointerId: downEvent.pointerId, card, list });
    return;
  }

  const startX = downEvent.clientX;
  const startY = downEvent.clientY;
  let didStartDrag = false;

  const longPressTimer = setTimeout(() => {
    didStartDrag = true;
    beginWishlistDrag({ pointerId: downEvent.pointerId, card, list });
  }, 350);

  const cancelPendingDrag = () => {
    clearTimeout(longPressTimer);
    handle.removeEventListener("pointermove", onEarlyMove);
    handle.removeEventListener("pointerup", cancelPendingDrag);
    handle.removeEventListener("pointercancel", cancelPendingDrag);
  };

  const onEarlyMove = (moveEvent) => {
    if (didStartDrag) {
      return;
    }

    if (Math.abs(moveEvent.clientX - startX) > 8 || Math.abs(moveEvent.clientY - startY) > 8) {
      cancelPendingDrag();
    }
  };

  handle.addEventListener("pointermove", onEarlyMove);
  handle.addEventListener("pointerup", cancelPendingDrag);
  handle.addEventListener("pointercancel", cancelPendingDrag);
}

function beginWishlistDrag({ pointerId, card, list }) {
  card.setPointerCapture(pointerId);
  card.classList.add("is-dragging");

  const onPointerMove = (moveEvent) => {
    const target = document
      .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
      ?.closest("[data-destination-card]");

    if (!target || target === card || target.parentElement !== list || !target.querySelector("[data-drag-handle]")) {
      return;
    }

    const cards = Array.from(list.children);
    const cardIndex = cards.indexOf(card);
    const targetIndex = cards.indexOf(target);

    if (cardIndex === -1 || targetIndex === -1) {
      return;
    }

    if (cardIndex < targetIndex) {
      list.insertBefore(card, target.nextSibling);
    } else {
      list.insertBefore(card, target);
    }
  };

  const finishDrag = async () => {
    card.classList.remove("is-dragging");
    card.releasePointerCapture(pointerId);
    card.removeEventListener("pointermove", onPointerMove);
    card.removeEventListener("pointerup", finishDrag);
    card.removeEventListener("pointercancel", finishDrag);

    const orderedTripIds = Array.from(list.children)
      .filter((child) => child.querySelector("[data-drag-handle]"))
      .map((child) => child.getAttribute("data-trip-id"));

    if (orderedTripIds.length < 2) {
      return;
    }

    orderedTripIds.forEach((tripId, index) => {
      tripStore.updateTrip({ id: tripId, sort_order: index });
    });

    try {
      await reorderWishlistDestinations({ orderedTripIds });
    } catch (error) {
      console.error(error);
      showToast("Could not save that order right now.", "error");
      rerenderDestinations();
    }
  };

  card.addEventListener("pointermove", onPointerMove);
  card.addEventListener("pointerup", finishDrag);
  card.addEventListener("pointercancel", finishDrag);
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
    const targetYear = parseOptionalYear(formData.get("targetYear"));
    const targetMonth = targetYear ? parseOptionalMonth(formData.get("targetMonth")) : null;
    const photoFile = getSelectedPhotoFile(formData);

    appStore.updateDestinationsPage({ isCreatingDestination: true });

    try {
      let didPhotoFail = false;
      const newDestination = await createDestination({
        ownerId: session.user.id,
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        targetYear,
        targetMonth,
      });
      const destinationWithPhoto = await uploadDestinationPhotoSafely({
        destination: newDestination,
        file: photoFile,
        userId: session.user.id,
        onPhotoFailure: () => {
          didPhotoFail = true;
        },
      });

      tripStore.prependTrip(destinationWithPhoto);
      appStore.updateDestinationsPage({ isCreatingDestination: false });
      showToast(didPhotoFail ? "Destination added, but the photo did not save." : "Destination added.", didPhotoFail ? "error" : "success");
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

function wireDestinationDetailModal() {
  const form = document.querySelector("#destination-detail-form");

  document.querySelector("#close-destination-detail-modal")?.addEventListener("click", closeDestinationDetail);
  document.querySelector("#close-destination-detail-footer")?.addEventListener("click", closeDestinationDetail);
  document.querySelector("[data-close-destination-detail]")?.addEventListener("click", closeDestinationDetail);
  document.querySelector("[data-open-destination-notes]")?.addEventListener("click", (event) => {
    const destinationId = event.currentTarget.getAttribute("data-open-destination-notes");

    if (destinationId) {
      appStore.updateDestinationsPage({
        selectedDestinationId: null,
        destinationDetailStatus: "idle",
        selectedDestinationNotes: [],
      });
      navigate(`/app/trip/${destinationId}/notes`);
    }
  });
  document.querySelector("#promote-destination")?.addEventListener("click", () => {
    handlePromoteDestination(form);
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSaveDestination(form);
  });
}

async function handleSaveDestination(form) {
  const destination = getSelectedDestination(appStore.getState().destinationsPage.selectedDestinationId);
  const { session } = sessionStore.getState();

  if (!form || !destination?.id || !session?.user?.id) {
    return;
  }

  const formData = new FormData(form);
  const values = getDestinationFormValues(formData);

  if (!values.title) {
    showToast("Add a destination title before saving.", "error");
    return;
  }

  appStore.updateDestinationsPage({ isSavingDestination: true });
  rerenderDestinations();

  try {
    let didPhotoFail = false;
    const updatedDestination = await updateDestination({
      tripId: destination.id,
      title: values.title,
      description: values.description,
      targetYear: values.targetYear,
      targetMonth: values.targetMonth,
    });
    const destinationWithPhoto = await uploadDestinationPhotoSafely({
      destination: updatedDestination,
      file: getSelectedPhotoFile(formData),
      userId: session.user.id,
      onPhotoFailure: () => {
        didPhotoFail = true;
      },
    });

    tripStore.updateTrip(destinationWithPhoto);
    appStore.updateDestinationsPage({ isSavingDestination: false });
    showToast(didPhotoFail ? "Destination saved, but the photo did not save." : "Destination saved.", didPhotoFail ? "error" : "success");
    rerenderDestinations();
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({ isSavingDestination: false });
    showToast("Could not save that destination right now.", "error");
    rerenderDestinations();
  }
}

async function handlePromoteDestination(form) {
  const destination = getSelectedDestination(appStore.getState().destinationsPage.selectedDestinationId);
  const { session } = sessionStore.getState();

  if (!form || !destination?.id || !session?.user?.id) {
    return;
  }

  const formData = new FormData(form);
  const values = getDestinationFormValues(formData);
  const tripLength = Number(formData.get("promoteTripLength"));
  const startDate = String(formData.get("promoteStartDate") || "").trim();

  if (!values.title || !Number.isInteger(tripLength) || tripLength < 1 || !isValidDateInput(startDate)) {
    showToast("Add a title, trip length, and valid start date before promoting.", "error");
    return;
  }

  appStore.updateDestinationsPage({ isPromotingDestination: true });
  rerenderDestinations();

  try {
    let didPhotoFail = false;
    const promotedTrip = await promoteDestinationToTrip({
      tripId: destination.id,
      title: values.title,
      description: values.description,
      tripLength,
      startDate,
    });
    const promotedTripWithPhoto = await uploadDestinationPhotoSafely({
      destination: promotedTrip,
      file: getSelectedPhotoFile(formData),
      userId: session.user.id,
      onPhotoFailure: () => {
        didPhotoFail = true;
      },
    });

    tripStore.updateTrip(promotedTripWithPhoto);
    appStore.updateDestinationsPage({
      selectedDestinationId: null,
      destinationDetailStatus: "idle",
      selectedDestinationNotes: [],
      isPromotingDestination: false,
    });
    navigate(`/app/trip/${promotedTrip.id}`);
    showToast(didPhotoFail ? "Trip promoted, but the photo did not save." : "Destination promoted to Planning.", didPhotoFail ? "error" : "success");
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({ isPromotingDestination: false });
    showToast("Could not promote that destination right now.", "error");
    rerenderDestinations();
  }
}

function getDestinationFormValues(formData) {
  const targetYear = parseOptionalYear(formData.get("targetYear"));

  return {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    targetYear,
    targetMonth: targetYear ? parseOptionalMonth(formData.get("targetMonth")) : null,
  };
}

function getSelectedPhotoFile(formData) {
  const photo = formData.get("photo");
  return photo instanceof File && photo.size > 0 ? photo : null;
}

async function uploadDestinationPhotoSafely({ destination, file, userId, onPhotoFailure }) {
  if (!file) {
    return destination;
  }

  try {
    return await uploadDestinationPhoto({ destination, file, userId });
  } catch (error) {
    console.error(error);
    onPhotoFailure();
    return destination;
  }
}

async function uploadDestinationPhoto({ destination, file, userId }) {
  const croppedBlob = await openPhotoCropModal(file, { aspectRatio: DEFAULT_PHOTO_ASPECT_RATIO });

  if (!croppedBlob) {
    return destination;
  }

  const photo = await saveUploadedPrimaryPhoto({
    userId,
    tripId: destination.id,
    context: PHOTO_CONTEXTS.tripHero,
    blob: croppedBlob,
  });

  return {
    ...destination,
    hero_photo_url: photo.public_url,
    hero_photo: photo,
  };
}

function parseOptionalYear(value) {
  if (String(value || "").trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1000 ? parsed : null;
}

function parseOptionalMonth(value) {
  if (String(value || "").trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

function openDestinationCard(tripId) {
  const trip = tripStore.getTrips().find((entry) => String(entry.id) === String(tripId));

  if (!trip) {
    return;
  }

  if (trip.status === "destinations") {
    openDestinationDetail(trip.id);
    return;
  }

  if (trip.status === "active") {
    navigate(`/app/trip/${trip.id}/guide`);
    return;
  }

  if (trip.status === "done") {
    navigate(`/app/trip/${trip.id}/guide#journal`);
    return;
  }

  navigate(`/app/trip/${trip.id}`);
}

function getSelectedDestination(destinationId) {
  if (!destinationId) {
    return null;
  }

  return tripStore.getTrips().find((entry) => String(entry.id) === String(destinationId)) || null;
}

function parseStoredYear(value) {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1000 ? parsed : null;
}

function parseStoredMonth(value) {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

function hasDestinationTargetDate(trip) {
  return parseStoredYear(trip.target_year) != null;
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

function noop() {
  return null;
}
