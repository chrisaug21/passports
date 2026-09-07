import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { sessionStore } from "../../state/session-store.js";
import { navigate, renderRoute } from "../../app/router.js";
import { loadDashboard, setDashboardRenderer, sortTripsByStartDate } from "../dashboard/dashboard-page.js";
import { showToast } from "../shared/toast.js";
import { createDestination } from "../../services/trips-service.js";
import { DEFAULT_PHOTO_ASPECT_RATIO, openPhotoCropModal } from "../../lib/photo-upload.js";
import { PHOTO_CONTEXTS, saveUploadedPrimaryPhoto } from "../../services/photos-service.js";
import { formatDestinationTargetDate, formatTripDateSummary } from "../../lib/format.js";
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

  return `
    <article
      class="destination-card"
      data-destination-card
      data-trip-id="${escapeHtml(String(trip.id))}"
      role="button"
      tabindex="0"
      aria-label="Open ${tripTitle}"
    >
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
    </article>
  `;
}

function renderEmptyColumn(columnId) {
  const messages = {
    wishlist: "No Wishlist places yet.",
    planning: "No trips being planned.",
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

function renderMonthOption(month) {
  const label = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2026, month - 1, 1));
  return `<option value="${month}">${escapeHtml(label)}</option>`;
}

export function wireDestinationsPage() {
  document.querySelector("#open-create-destination-modal")?.addEventListener("click", openCreateDestinationModal);
  document.querySelector("#retry-destinations-load")?.addEventListener("click", () => {
    loadDashboard();
  });

  document.querySelectorAll("[data-destination-card]").forEach((card) => {
    const openCard = () => {
      openTrip(card.getAttribute("data-trip-id"));
    };

    card.addEventListener("click", openCard);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCard();
      }
    });
  });

  wireCreateDestinationModal();
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

function openTrip(tripId) {
  const trip = tripStore.getTrips().find((entry) => String(entry.id) === String(tripId));

  if (!trip) {
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
