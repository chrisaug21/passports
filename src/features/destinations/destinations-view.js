import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { sortTripsByStartDate } from "../dashboard/dashboard-page.js";
import { formatDestinationTargetDate, formatTripDateSummary } from "../../lib/format.js";
import { isTripStartingSoon } from "../../lib/derive.js";
import { CANONICAL_TIMEZONES, DEFAULT_BASE_TIMEZONE } from "../../config/constants.js";
import { renderLocationSearchField } from "../shared/location-search.js";

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
      ${renderDestinationBaseEditorHtml(destinationsPage)}
      ${renderPromoteDestinationModal(destinationsPage)}
      ${renderDeleteDestinationConfirmModal(destinationsPage)}
      ${renderBoardDemoteConfirmModal(destinationsPage)}
    </section>
  `;
}

function renderPromoteDestinationModal(destinationsPage) {
  const destination = getSelectedDestination(destinationsPage.promotingDestinationId);

  if (!destination) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-promote-destination></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Promote</p>
            <h3>Turn "${escapeHtml(destination.title || "this destination")}" into a planned trip</h3>
          </div>
          <button class="icon-button" id="cancel-promote-destination" type="button" aria-label="Cancel promote" ${destinationsPage.isPromotingDestination ? "disabled" : ""}>x</button>
        </div>
        <form class="create-trip-form" id="promote-destination-form">
          <p class="muted">Add real dates and Passports will create the starter base and days.</p>
          <div class="destinations-form-grid destinations-form-grid--compact">
            <label class="field">
              <span>Trip Length</span>
              <input class="destinations-trip-length-input" name="promoteTripLength" type="number" min="1" max="60" value="7" required />
            </label>
            <label class="field">
              <span>Start Date</span>
              <input class="destinations-date-input" name="promoteStartDate" type="date" required />
            </label>
          </div>
          <div class="modal-card__actions modal-card__actions--end">
            <button class="button" type="submit" ${destinationsPage.isPromotingDestination ? "disabled" : ""}>
              ${destinationsPage.isPromotingDestination ? "Promoting…" : "Promote to Planning"}
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderDeleteDestinationConfirmModal(destinationsPage) {
  const destination = getSelectedDestination(destinationsPage.selectedDestinationId);

  if (!destinationsPage.isShowingDeleteDestinationConfirm || !destination) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-delete-destination></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Delete</p>
            <h3>${escapeHtml(destination.title || "Untitled destination")}</h3>
          </div>
        </div>
        <p class="muted">This deletes ${escapeHtml(destination.title || "this destination")} from your Wishlist.</p>
        <div class="modal-card__actions modal-card__actions--row">
          <button class="button button--secondary" id="cancel-delete-destination" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-destination" type="button" ${destinationsPage.isDeletingDestination ? "disabled" : ""}>
            ${destinationsPage.isDeletingDestination ? "Deleting…" : "Delete"}
          </button>
        </div>
      </section>
    </div>
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
          <button class="icon-button" id="cancel-demote-destination" type="button" aria-label="Cancel move to Wishlist">x</button>
        </div>
        <p class="muted">This clears the trip's start date. Bases, days, items, notes, and photos all stay intact.</p>
        <div class="modal-card__actions modal-card__actions--end">
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
  const safeCoverUrl = sanitizeCoverUrl(trip.hero_photo_card_url || trip.hero_photo_url || trip.cover_photo_url);
  const dateLabel = trip.status === "destinations"
    ? formatDestinationTargetDate(trip)
    : formatTripDateSummary(trip, { includeYear: trip.status === "done" });
  const tripTitle = escapeHtml(trip.title || "Untitled trip");
  const shouldShowDate = trip.status !== "destinations" || hasDestinationTargetDate(trip);
  const isUndatedWishlistCard = trip.status === "destinations" && !hasDestinationTargetDate(trip);
  const isDatedWishlistCard = trip.status === "destinations" && !isUndatedWishlistCard;
  const isPlanningCard = trip.status === "planning";
  const isDraggableCard = isUndatedWishlistCard || isDatedWishlistCard || isPlanningCard;

  return `
    <article
      class="destination-card"
      data-destination-card
      data-trip-id="${escapeHtml(String(trip.id))}"
      role="button"
      tabindex="0"
      aria-label="Open ${tripTitle}"
    >
      ${isDraggableCard ? `
        <button
          class="destination-card__drag-handle"
          data-drag-handle
          ${isUndatedWishlistCard ? 'data-reorderable="true"' : ""}
          type="button"
          aria-label="${isUndatedWishlistCard ? `Reorder ${tripTitle}` : `Drag ${tripTitle} to a different column`}"
          tabindex="-1"
        >
          <i data-lucide="grip-vertical" aria-hidden="true"></i>
        </button>
      ` : ""}
      <div class="destination-card__media">
        ${safeCoverUrl ? `
          <img
            src="${escapeHtml(safeCoverUrl)}"
            ${trip.hero_photo_card_url && trip.hero_photo_url ? `data-full-src="${escapeHtml(trip.hero_photo_url)}"` : ""}
            alt=""
            loading="lazy"
            decoding="async"
            data-destination-card-image
          />
        ` : ""}
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

          ${renderLocationSearchField({
            idPrefix: "create-destination",
            label: "Mapped Location",
            required: true,
          })}

          <label class="field">
            <span>Photo</span>
            <input name="photo" type="file" accept="image/*" />
          </label>

          <div class="destinations-form-grid">
            <label class="field">
              <span>Target Year</span>
              <select name="targetYear">
                <option value="">No target year</option>
                ${getWishlistTargetYearOptions().map((year) => renderYearOption(year)).join("")}
              </select>
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

        <div class="destinations-form-grid">
          <label class="field">
            <span>Target Year</span>
            <select name="targetYear">
              <option value="">No target year</option>
              ${getWishlistTargetYearOptions().map((year) => renderYearOption(year, destination.target_year)).join("")}
            </select>
          </label>

          <label class="field">
            <span>Target Month</span>
            <select name="targetMonth">
              <option value="">Any month</option>
              ${Array.from({ length: 12 }, (_value, index) => renderMonthOption(index + 1, destination.target_month)).join("")}
            </select>
          </label>
        </div>

        ${renderDestinationBasesPanel(destinationsPage.selectedDestinationBases)}

        ${renderDestinationNotesPreview(destination, destinationsPage)}
      </div>

      <div class="modal-card__actions modal-card__actions--sticky">
        <div class="trip-settings-form__destructive-actions">
          <button class="icon-button icon-button--danger" id="open-delete-destination-confirm" type="button" title="Delete" aria-label="Delete destination">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
          <button class="icon-button" id="open-promote-destination-modal" type="button" title="Promote to Planning" aria-label="Promote to Planning">
            <i data-lucide="calendar-check" aria-hidden="true"></i>
          </button>
        </div>
        <button class="button" type="submit" ${destinationsPage.isSavingDestination ? "disabled" : ""}>
          ${destinationsPage.isSavingDestination ? "Saving..." : "Save"}
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

function renderDestinationBasesPanel(bases = []) {
  const sortedBases = [...(Array.isArray(bases) ? bases : [])].sort((left, right) => {
    const orderDiff = (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0);
    return orderDiff || String(left.name || "").localeCompare(String(right.name || ""));
  });

  return `
    <section class="destination-bases-panel">
      <div class="destination-bases-panel__header">
        <div>
          <p class="eyebrow">Bases</p>
          <h3>Map pins</h3>
        </div>
        <button class="button button--secondary" id="add-destination-base" type="button">
          <i data-lucide="plus" aria-hidden="true"></i>
          Add Base
        </button>
      </div>
      <div class="destination-bases-list">
        ${
          sortedBases.length > 0
            ? sortedBases.map((base) => renderDestinationBaseRow(base)).join("")
            : `
              <div class="destination-bases-empty">
                <p class="muted">Add a base to put this destination on the map.</p>
              </div>
            `
        }
      </div>
    </section>
  `;
}

function renderDestinationBaseRow(base) {
  const hasCoordinates = base.lat != null && base.lng != null;

  return `
    <article class="destination-base-row">
      <div class="destination-base-row__content">
        <h4>${escapeHtml(base.name || "Untitled base")}</h4>
        <p>${escapeHtml(base.location_name || "No mapped location")}${hasCoordinates ? "" : " · Needs pin"}</p>
        <p class="muted">${escapeHtml(formatTimezoneLabel(base.local_timezone))}</p>
      </div>
      <button
        class="icon-button"
        data-edit-destination-base="${escapeHtml(base.id)}"
        type="button"
        title="Edit base"
        aria-label="Edit ${escapeHtml(base.name || "base")}"
      >
        <i data-lucide="pencil" aria-hidden="true"></i>
      </button>
    </article>
  `;
}

function renderDestinationBaseEditorHtml(destinationsPage) {
  const destination = getSelectedDestination(destinationsPage.selectedDestinationId);

  if (!destination || !destinationsPage.destinationBaseEditorMode) {
    return "";
  }

  const bases = destinationsPage.selectedDestinationBases || [];
  const base = destinationsPage.destinationBaseEditorMode === "edit"
    ? bases.find((entry) => entry.id === destinationsPage.editingDestinationBaseId)
    : null;

  if (destinationsPage.destinationBaseEditorMode === "edit" && !base) {
    return "";
  }

  const modeLabel = base ? "Edit Base" : "Add Base";
  const timezone = base?.local_timezone || DEFAULT_BASE_TIMEZONE;

  return `
    <div class="modal-shell" id="destination-base-editor-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-destination-base-editor></div>
      <section class="panel modal-card modal-card--editor destination-base-editor-modal">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Wishlist Base</p>
            <h3>${escapeHtml(modeLabel)}</h3>
          </div>
          <button class="icon-button" data-close-destination-base-editor type="button" aria-label="Close base editor">x</button>
        </div>
        <form class="destination-base-editor-form" id="destination-base-editor-form" data-base-id="${escapeHtml(base?.id || "")}">
          <div class="destination-detail-form__content">
            <label class="field">
              <span>Name</span>
              <input name="baseName" type="text" maxlength="120" value="${escapeHtml(base?.name || "")}" placeholder="${escapeHtml(destination.title || "Base name")}" required />
            </label>
            ${renderLocationSearchField({
              idPrefix: `destination-base-${base?.id || "new"}`,
              label: "Mapped Location",
              value: base?.location_name || "",
              lat: base?.lat,
              lng: base?.lng,
              required: true,
              hint: "Search and choose a place for this map pin.",
            })}
            <p class="field-hint">Timezone will be inferred from the selected location. Current: ${escapeHtml(formatTimezoneLabel(timezone))}</p>
          </div>
          <div class="modal-card__actions modal-card__actions--sticky">
            ${
              base ? `
                <button class="button button--danger" id="delete-destination-base" type="button" ${destinationsPage.isDeletingDestinationBase ? "disabled" : ""}>
                  ${destinationsPage.isDeletingDestinationBase ? "Deleting..." : "Delete Base"}
                </button>
              ` : "<span></span>"
            }
            <button class="button" type="submit" ${destinationsPage.isSavingDestinationBase ? "disabled" : ""}>
              ${destinationsPage.isSavingDestinationBase ? "Saving..." : "Save Base"}
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function formatTimezoneLabel(timezone) {
  const timezoneId = timezone || DEFAULT_BASE_TIMEZONE;
  const option = CANONICAL_TIMEZONES.find(([value]) => value === timezoneId);
  return option ? option[1] : timezoneId;
}

function renderDestinationPhotoField(destination) {
  const safeCoverUrl = sanitizeCoverUrl(destination.hero_photo_url || destination.cover_photo_url);

  return `
    <label class="destination-detail-photo photo-hero" data-destination-photo-field>
      <input class="sr-only" name="photo" type="file" accept="image/*" data-destination-photo-input />
      <img class="photo-hero__image" ${safeCoverUrl ? `src="${escapeHtml(safeCoverUrl)}"` : ""} alt="" loading="lazy" decoding="async" data-destination-photo-preview ${safeCoverUrl ? "" : "hidden"} />
      <span class="photo-hero__empty-label" data-destination-photo-empty-label ${safeCoverUrl ? "hidden" : ""}>Add photo</span>
    </label>
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

function getWishlistTargetYearOptions() {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 16 }, (_value, index) => currentYear + index);
}

function renderYearOption(year, selectedYear = null) {
  const isSelected = Number(selectedYear) === year;
  return `<option value="${year}" ${isSelected ? "selected" : ""}>${year}</option>`;
}

export function getSelectedDestination(destinationId) {
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
