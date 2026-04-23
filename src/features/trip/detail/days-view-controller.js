import { tripStore } from "../../../state/trip-store.js";
import { updateTripDayTitle } from "../../../services/days-service.js";
import { formatDayDateLabel } from "../../../lib/format.js";
import { showToast } from "../../shared/toast.js";
import {
  tripDetailState,
  rerenderTripDetail,
} from "./trip-detail-state.js";
import {
  escapeHtml,
  getBaseHeroPhotoUrl,
  renderHeroPhotoImage,
} from "./trip-detail-ui.js";
import { buildAllocationRows } from "./base-allocation-controller.js";

export function renderDaysView(bases, days, assignedItems, unassignedItems, helpers) {
  const { getSortedUnassignedItems, renderDayItem } = helpers;
  const sortedUnassignedItems = getSortedUnassignedItems(unassignedItems);
  const groupedRows = buildAllocationRows(bases, days).filter((row) => row.dayCount > 0);

  return `
    <section class="days-view">
      ${groupedRows.map((row) => renderBaseDaysSection(row, days, assignedItems, groupedRows.length, helpers)).join("")}

      <section class="panel days-view__pool">
        <div class="days-view__panel-header">
          <div>
            <p class="eyebrow">Unassigned Ideas</p>
          </div>
          <button class="button button--secondary section-action-button" data-add-item-to-trip type="button">Add to trip</button>
        </div>
        ${
          sortedUnassignedItems.length > 0
            ? `<div class="days-view__list days-view__pool-list">${sortedUnassignedItems.map((item) => renderDayItem(item)).join("")}</div>`
            : `<div class="day-card__empty"><p class="muted">Nothing unassigned.</p></div>`
        }
      </section>
    </section>
  `;
}

export function renderBaseDaysSection(row, days, items, rowCount, helpers) {
  const baseDays = days.filter((day) => day.day_number >= row.startDay && day.day_number <= row.endDay);
  const baseHeroPhotoUrl = row.kind === "base" ? getBaseHeroPhotoUrl(row.base) : "";

  return `
    <section class="panel days-base-section">
      ${
        row.kind === "base"
          ? `
            <div class="days-base-section__hero photo-hero">
              ${baseHeroPhotoUrl ? renderHeroPhotoImage(baseHeroPhotoUrl) : `<span class="photo-hero__empty-label">Add photo</span>`}
              <button class="photo-hero__action" data-base-hero-upload="${escapeHtml(row.base.id)}" type="button" aria-label="${baseHeroPhotoUrl ? `Change photo for ${escapeHtml(row.label)}` : `Add photo for ${escapeHtml(row.label)}`}">
                <i data-lucide="camera" aria-hidden="true"></i>
              </button>
            </div>
          `
          : ""
      }
      ${rowCount > 1 ? `
        <div class="days-view__panel-header">
          <div>
            <p class="eyebrow">Base</p>
            <h3>${escapeHtml(row.label)}</h3>
          </div>
          ${row.kind === "base" ? `<button class="button button--secondary section-action-button section-action-button--base" data-add-item-to-base="${escapeHtml(row.base.id)}" type="button"><span class="section-action-button__full">Add to ${escapeHtml(row.label)}</span><span class="section-action-button__short">Add</span></button>` : ""}
        </div>
      ` : `
        <div class="days-view__panel-header">
          <div>
            <p class="eyebrow">Base</p>
            <h3>${escapeHtml(row.label)}</h3>
          </div>
          ${row.kind === "base" ? `<button class="button button--secondary section-action-button section-action-button--base" data-add-item-to-base="${escapeHtml(row.base.id)}" type="button"><span class="section-action-button__full">Add to ${escapeHtml(row.label)}</span><span class="section-action-button__short">Add</span></button>` : ""}
        </div>
      `}
      <div class="day-card-grid">
        ${baseDays.map((day) => renderDayCard(day, items, helpers)).join("")}
      </div>
    </section>
  `;
}

export function renderDayCard(day, items, helpers) {
  const { getInterleavedDayItems, renderDayItem } = helpers;
  const combinedItems = getInterleavedDayItems(items, day.id);
  const trip = tripStore.getCurrentTrip();
  const dateLabel = trip?.start_date ? formatDayDateLabel(trip.start_date, day.day_number) : "";
  const isEditingTitle = tripDetailState.editingDayTitleId === day.id;
  const title = String(day.title || "").trim();

  return `
    <article class="day-card">
      <div class="day-card__header">
        <div class="day-card__header-main">
          <p class="eyebrow">Day ${day.day_number}${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ""}</p>
          ${
            isEditingTitle
              ? `
                <input
                  class="day-card__title-input"
                  id="day-title-inline-input"
                  type="text"
                  maxlength="120"
                  value="${escapeHtml(tripDetailState.editingDayTitleValue)}"
                  placeholder="Add day title"
                />
              `
              : title
                ? `<button class="day-card__title-button" data-day-title-trigger="${escapeHtml(day.id)}" type="button">${escapeHtml(title)}</button>`
                : ""
          }
        </div>
        <button class="icon-button day-card__edit-title" data-edit-day-title="${escapeHtml(day.id)}" type="button" title="Edit day title" aria-label="Edit day title">
          <i data-lucide="pencil"></i>
        </button>
        ${day.location_name ? `<p class="muted">${escapeHtml(day.location_name)}</p>` : ""}
      </div>
      ${
        combinedItems.length === 0
          ? `<div class="day-card__empty"><p class="muted">Nothing assigned yet.</p></div>`
          : `<div class="days-view__list">${combinedItems.map((item, index) => renderDayItem(item, {
              dayId: day.id,
              canMoveUp: index > 0,
              canMoveDown: index < combinedItems.length - 1,
            })).join("")}</div>`
      }
    </article>
  `;
}

async function saveInlineDayTitle() {
  const dayId = tripDetailState.editingDayTitleId;

  if (!dayId) {
    return;
  }

  const nextTitle = tripDetailState.editingDayTitleValue.trim();
  tripDetailState.editingDayTitleId = null;
  tripDetailState.editingDayTitleValue = "";
  rerenderTripDetail();

  try {
    const updatedDay = await updateTripDayTitle({
      dayId,
      title: nextTitle,
    });
    tripStore.updateCurrentDay(updatedDay);
    rerenderTripDetail();
  } catch (error) {
    console.error(error);
    tripDetailState.editingDayTitleId = dayId;
    tripDetailState.editingDayTitleValue = nextTitle;
    rerenderTripDetail();
    showToast("Something went wrong saving. Please try again.", "error");
  }
}

function cancelInlineDayTitleEdit() {
  tripDetailState.editingDayTitleId = null;
  tripDetailState.editingDayTitleValue = "";
  rerenderTripDetail();
}

export function createDaysViewHandlers() {
  return {
    onEditDayTitle: (dayId) => {
      const day = tripStore.getCurrentDays().find((entry) => entry.id === dayId);

      if (!dayId || !day) {
        return;
      }

      tripDetailState.editingDayTitleId = dayId;
      tripDetailState.editingDayTitleValue = day.title || "";
      rerenderTripDetail();
    },
    onDayTitleTrigger: (dayId) => {
      const day = tripStore.getCurrentDays().find((entry) => entry.id === dayId);

      if (!dayId || !day?.title) {
        return;
      }

      tripDetailState.editingDayTitleId = dayId;
      tripDetailState.editingDayTitleValue = day.title || "";
      rerenderTripDetail();
    },
    onDayTitleInputReady: (input) => {
      input.focus();
      input.select();
    },
    onDayTitleInput: (value) => {
      tripDetailState.editingDayTitleValue = value;
    },
    onDayTitleBlur: async () => {
      await saveInlineDayTitle();
    },
    onDayTitleKeydown: async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await saveInlineDayTitle();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelInlineDayTitleEdit();
      }
    },
  };
}
