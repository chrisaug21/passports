import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  formatStatusLabel,
  formatTripDateSummary,
} from "../../../lib/format.js";
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
} from "./trip-settings-controller.js";
import {
  buildAllocationRows,
  getAllocationState,
  getAllocationSummary,
  hasAllocationDraftChanges,
  renderAddBaseForm,
  renderEditBaseForm,
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
  renderMasterListPlanningTable,
} from "./items-controller.js";
import {
  renderDeleteItemConfirmModal,
  renderDiscardConfirmModal,
  renderItemEditorModal,
  renderMoveItemModal,
} from "./item-editor-controller.js";
import { deriveTripStatus } from "../../../lib/derive.js";

export function renderTripDetailPageView() {
  const { tripDetail } = appStore.getState();
  const trip = tripStore.getCurrentTrip();
  const bases = tripStore.getCurrentBases();
  const days = tripStore.getCurrentDays();
  const items = tripStore.getCurrentItems();
  const editingItem = items.find((item) => item.id === tripDetail.editingItemId) || null;
  const selectedEditBase = bases.find((base) => base.id === tripDetail.editingBaseId) || null;
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
      <section class="panel trip-header">
        <div class="trip-header__media"${getTripHeaderMediaStyle(trip)}></div>
        <div class="trip-header__content">
          <div class="trip-header__top">
            <div class="trip-header__meta">
              <h2 class="trip-header__title">${escapeHtml(trip.title || "Untitled trip")}</h2>
              <div class="trip-header__summary-line">
                <p class="trip-header__dates">${formatTripDateSummary(trip)}</p>
                <span class="trip-pill">${formatStatusLabel(deriveTripStatus(trip))}</span>
              </div>
              ${trip.description ? `<p class="muted">${escapeHtml(trip.description)}</p>` : ""}
            </div>
            <button class="button button--secondary trip-header__edit-button section-action-button" id="toggle-trip-settings" type="button">
              Edit Trip
            </button>
          </div>
          ${renderTripSettingsSummary(trip)}
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
          <button class="button button--secondary section-action-button" id="show-add-base-form" type="button">Add Base</button>
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

      </section>

      <section class="trip-view-tabs" aria-label="Trip views">
        <button class="trip-view-tabs__button ${tripDetail.viewMode === "days" ? "is-active" : ""}" data-view-mode="days" type="button">Days View</button>
        <button class="trip-view-tabs__button ${tripDetail.viewMode === "master-list" ? "is-active" : ""}" data-view-mode="master-list" type="button">List View</button>
      </section>

      ${
        tripDetail.viewMode === "master-list"
          ? `
      <section class="panel master-list-panel">
        <div class="master-list-panel__header">
          <div>
            <p class="eyebrow">List View</p>
          </div>
        </div>

        ${renderMasterListPlanningTable({ items, days, bases, tripDetail })}
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
        mode: tripDetail.itemEditorMode,
        context: tripDetail.itemEditorContext,
        isSaving: tripDetail.isSavingItem,
        isDeleting: tripDetail.isDeletingItem && tripDetail.deletingItemId === editingItem?.id,
      })}
      ${tripDetail.isShowingTripSettings ? renderTripSettingsForm(trip, tripDetail.isSavingTrip) : ""}
      ${tripDetail.isShowingAddBaseForm ? renderAddBaseForm(bases.length, tripDetail.isSavingBase) : ""}
      ${selectedEditBase ? renderEditBaseForm(selectedEditBase, tripDetail.isSavingBase) : ""}
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
      ${renderDeleteTripConfirmModal({
        trip,
        isOpen: tripDetail.showDeleteTripConfirm,
        isDeleting: tripDetail.isDeletingTrip,
      })}
      ${renderTimezoneOptionsDatalist()}
    </section>
  `;
}
