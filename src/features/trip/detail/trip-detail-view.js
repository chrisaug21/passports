import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  formatItemTypeLabel,
  formatStatusLabel,
  formatTripDateSummary,
} from "../../../lib/format.js";
import { ITEM_TYPES } from "../../../config/constants.js";
import {
  escapeHtml,
  getTripHeaderMediaStyle,
  getTripStatTiles,
} from "./trip-detail-ui.js";
import { tripDetailState } from "./trip-detail-state.js";
import {
  renderDeleteTripConfirmModal,
  renderTripSettingsForm,
  renderTripSettingsSummary,
  renderTripStatusConfirmModal,
} from "./trip-settings-controller.js";
import {
  buildAllocationRows,
  getAllocationState,
  getAllocationSummary,
  hasAllocationDraftChanges,
  renderAddBaseForm,
  renderAllocationConfirmModal,
  renderAllocationRow,
  renderDeleteBaseConfirmModal,
  renderTimezoneOptionsDatalist,
  renderTripLengthConfirmModal,
} from "./base-allocation-controller.js";
import { renderDaysView } from "./days-view-controller.js";
import {
  getInterleavedDayItems,
  getSortedUnassignedItems,
  renderDayItem,
  renderMasterListRow,
} from "./items-controller.js";
import {
  renderDeleteItemConfirmModal,
  renderDiscardConfirmModal,
  renderItemEditorModal,
  renderMoveItemModal,
} from "./item-editor-controller.js";

export function renderTripDetailPageView() {
  const { tripDetail } = appStore.getState();
  const trip = tripStore.getCurrentTrip();
  const bases = tripStore.getCurrentBases();
  const days = tripStore.getCurrentDays();
  const items = tripStore.getCurrentItems();
  const editingItem = items.find((item) => item.id === tripDetail.editingItemId) || null;
  const unassignedItems = items.filter((item) => !item.day_id);
  const assignedItems = items.filter((item) => item.day_id);

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
          <p class="muted">${escapeHtml(tripDetail.error || "Try going back to the dashboard and opening the trip again.")}</p>
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

  const allocationState = getAllocationState(trip, days);
  const allocationRows = buildAllocationRows(bases, allocationState.days);
  const allocationSummary = getAllocationSummary(trip, allocationRows, allocationState.tripLength);
  const statTiles = getTripStatTiles(trip, bases, items);

  return `
    <section class="trip-detail">
      <button class="text-link" id="trip-back-to-dashboard" type="button">← Back to Dashboard</button>

      <section class="panel trip-header">
        <div class="trip-header__media"${getTripHeaderMediaStyle(trip)}></div>
        <div class="trip-header__content">
          <div class="trip-header__top">
            <div class="trip-header__meta">
              <h2 class="trip-header__title">${escapeHtml(trip.title || "Untitled trip")}</h2>
              <div class="trip-header__summary-line">
                <p class="trip-header__dates">${formatTripDateSummary(trip)}</p>
                <span class="trip-pill">${formatStatusLabel(trip.status)}</span>
              </div>
              ${trip.description ? `<p class="muted">${escapeHtml(trip.description)}</p>` : ""}
            </div>
            <button class="button button--secondary trip-header__edit-button" id="toggle-trip-settings" type="button">
              ${tripDetail.isShowingTripSettings ? "Hide editor" : "Edit Trip"}
            </button>
          </div>
          ${
            tripDetail.isShowingTripSettings
              ? renderTripSettingsForm(trip, tripDetail.isSavingTrip)
              : renderTripSettingsSummary(trip)
          }
        </div>
      </section>

      <section class="trip-stat-tiles" aria-label="Trip stats">
        ${statTiles.map((tile) => `
          <article class="panel trip-stat-tile">
            <h3>${tile.count}</h3>
            <p>${tile.label}</p>
          </article>
        `).join("")}
      </section>

      <section class="panel base-manager-panel">
        <div class="base-manager-panel__header">
          <div>
            <p class="eyebrow">Bases</p>
            <h3>Day Allocation</h3>
          </div>
          <button class="button button--secondary" id="show-add-base-form" type="button">Add Base</button>
        </div>

        <div class="allocation-list">
          ${allocationRows.map((row) => renderAllocationRow(row, trip, tripDetail, items, bases, allocationState.tripLength)).join("")}
        </div>

        <p class="muted ${allocationSummary.isComplete ? "allocation-summary--complete" : "allocation-summary--warning"}">${escapeHtml(allocationSummary.label)}</p>

        ${
          hasAllocationDraftChanges(trip, days)
            ? `
              <div class="base-form__actions">
                <button class="button button--secondary" id="cancel-allocation-changes" type="button">Cancel Changes</button>
                <button class="button" id="save-allocation-changes" type="button" ${tripDetail.isSavingBase ? "disabled" : ""}>${tripDetail.isSavingBase ? "Saving…" : "Save Allocation"}</button>
              </div>
            `
            : ""
        }

        ${tripDetail.isShowingAddBaseForm ? renderAddBaseForm(bases.length) : ""}
      </section>

      <section class="trip-view-tabs" aria-label="Trip views">
        <button class="trip-view-tabs__button ${tripDetail.viewMode === "master-list" ? "is-active" : ""}" data-view-mode="master-list" type="button">List View</button>
        <button class="trip-view-tabs__button ${tripDetail.viewMode === "days" ? "is-active" : ""}" data-view-mode="days" type="button">Days View</button>
      </section>

      ${
        tripDetail.viewMode === "master-list"
          ? `
      <section class="panel master-list-panel">
        <div class="master-list-panel__header">
          <div>
            <p class="eyebrow">All Stops</p>
            <h3>All Stops</h3>
          </div>
        </div>

        <form class="master-list-quick-add" id="master-list-quick-add-form">
          <label class="field master-list-quick-add__field master-list-quick-add__field--title">
            <span>Title</span>
            <input
              name="title"
              type="text"
              maxlength="120"
              placeholder="Add a restaurant, museum, hotel, or transport idea"
              required
            />
          </label>
          <label class="field master-list-quick-add__field">
            <span>Type</span>
            <select name="itemType" required>
              ${ITEM_TYPES.map((type) => `<option value="${type}">${formatItemTypeLabel(type)}</option>`).join("")}
            </select>
          </label>
          <button class="button master-list-quick-add__submit" type="submit" ${tripDetail.isCreatingItem ? "disabled" : ""}>
            ${tripDetail.isCreatingItem ? "Saving…" : "Add to trip"}
          </button>
        </form>

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
      `
          : renderDaysView(bases, days, assignedItems, unassignedItems, {
              getInterleavedDayItems,
              getSortedUnassignedItems,
              renderDayItem,
            })
      }

      ${renderItemEditorModal({
        item: editingItem,
        bases,
        days,
        isSaving: tripDetail.isSavingItem,
        isDeleting: tripDetail.isDeletingItem && tripDetail.deletingItemId === editingItem?.id,
      })}
      ${renderDiscardConfirmModal(tripDetail.showDiscardConfirm)}
      ${renderDeleteItemConfirmModal({
        item: items.find((entry) => entry.id === tripDetail.deletingItemId) || null,
        isOpen: tripDetail.showDeleteItemConfirm,
        isDeleting: tripDetail.isDeletingItem,
      })}
      ${renderMoveItemModal({
        trip,
        item: items.find((entry) => entry.id === tripDetail.movingItemId) || null,
        bases,
        days,
        isOpen: tripDetail.showMoveItemModal,
        isMoving: tripDetail.isMovingItem,
      })}
      ${renderAllocationConfirmModal(tripDetailState.allocationConfirmState)}
      ${renderTripLengthConfirmModal(tripDetailState.tripLengthConfirmState)}
      ${renderDeleteBaseConfirmModal({
        base: bases.find((entry) => entry.id === tripDetail.deletingBaseId) || null,
        isOpen: tripDetail.showDeleteBaseConfirm,
        isDeleting: tripDetail.isDeletingBase,
      })}
      ${renderTripStatusConfirmModal({
        trip,
        isOpen: tripDetail.showTripStatusConfirm,
        pendingStatus: tripDetail.pendingTripStatus,
        isSaving: tripDetail.isUpdatingTripStatus,
      })}
      ${renderDeleteTripConfirmModal({
        trip,
        isOpen: tripDetail.showDeleteTripConfirm,
        isDeleting: tripDetail.isDeletingTrip,
      })}
      ${renderTimezoneOptionsDatalist()}
    </section>
  `;
}
