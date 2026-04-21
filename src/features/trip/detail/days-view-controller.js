import { tripStore } from "../../../state/trip-store.js";
import { updateTripDayTitle } from "../../../services/days-service.js";
import { formatDayDateLabel } from "../../../lib/format.js";
import { showToast } from "../../shared/toast.js";
import {
  tripDetailState,
  rerenderTripDetail,
} from "./trip-detail-state.js";
import { escapeHtml } from "./trip-detail-ui.js";
import {
  buildAllocationRows,
  getAllocationRangeLabel,
} from "./base-allocation-controller.js";

export function renderDaysView(bases, days, assignedItems, unassignedItems, helpers) {
  const { getSortedUnassignedItems, renderDayItem } = helpers;
  const sortedUnassignedItems = getSortedUnassignedItems(unassignedItems);
  const groupedRows = buildAllocationRows(bases, days).filter((row) => row.dayCount > 0);

  return `
    <section class="days-view">
      ${sortedUnassignedItems.length > 0 ? `
        <section class="panel days-view__pool">
          <div class="days-view__panel-header">
            <div>
              <p class="eyebrow">Unassigned Ideas</p>
              <h3>Unassigned Ideas</h3>
            </div>
            <p class="muted">Ideas and stops not yet added to a day.</p>
          </div>
          <div class="days-view__list days-view__pool-list">
            ${sortedUnassignedItems.map((item) => renderDayItem(item)).join("")}
          </div>
        </section>
      ` : ""}

      ${groupedRows.map((row, index) => renderBaseDaysSection(row, days, assignedItems, groupedRows.length, index === 0, helpers)).join("")}
    </section>
  `;
}

export function renderBaseDaysSection(row, days, items, rowCount, isFirst, helpers) {
  const baseDays = days.filter((day) => day.day_number >= row.startDay && day.day_number <= row.endDay);

  return `
    <section class="panel days-base-section">
      ${rowCount > 1 ? `
        <div class="days-view__panel-header">
          <div>
            <p class="eyebrow">${row.kind === "unassigned" ? "Unassigned" : isFirst ? "Days View" : "Base"}</p>
            <h3>${escapeHtml(row.label)}</h3>
          </div>
          <p class="muted">${getAllocationRangeLabel(row, tripStore.getCurrentTrip()?.start_date)}</p>
        </div>
      ` : `
        <div class="days-view__panel-header">
          <div>
            <p class="eyebrow">Days View</p>
            <h3>${escapeHtml(row.label)}</h3>
          </div>
          <p class="muted">${getAllocationRangeLabel(row, tripStore.getCurrentTrip()?.start_date)}</p>
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
          ? `<div class="day-card__empty"><p class="muted">No items assigned yet.</p></div>`
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

  const nextTitle = tripDetailState.editingDayTitleValue;
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
