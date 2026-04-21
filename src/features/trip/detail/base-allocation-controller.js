import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  createTripBase,
  fetchTripDetailBundle,
  saveTripDayAllocations,
  softDeleteTripBase,
  updateTripBase,
  updateTripSettings,
} from "../../../services/trips-service.js";
import { formatShortDateRange } from "../../../lib/format.js";
import { DEFAULT_BASE_TIMEZONE } from "../../../config/constants.js";
import { showToast } from "../../shared/toast.js";
import {
  tripDetailState,
  rerenderTripDetail,
} from "./trip-detail-state.js";
import { escapeHtml, getDisplayTitleForToast } from "./trip-detail-ui.js";

export function renderAllocationRow(row, trip, tripDetail, items, bases, tripLength) {
  const isEditing = row.kind === "base" && tripDetail.editingBaseId === row.base.id;
  const countLabel = row.dayCount === 1 ? "1 day" : `${row.dayCount} days`;
  const rangeLabel = row.dayCount > 0 ? getAllocationRangeLabel(row, trip.start_date) : "No days assigned yet";
  const detailLabel = row.kind === "base"
    ? `${escapeHtml(row.base.location_name || row.base.local_timezone || DEFAULT_BASE_TIMEZONE)}`
    : "Day without a base";
  const summaryLabel = `${countLabel} · ${rangeLabel}`;

  return `
    <article class="allocation-row ${row.kind === "unassigned" ? "allocation-row--unassigned" : ""}">
      <div class="allocation-row__header">
        <div class="allocation-row__copy">
          <h4>${escapeHtml(row.label)}</h4>
          <p class="muted">${detailLabel}</p>
          <p class="allocation-row__summary">${escapeHtml(summaryLabel)}</p>
        </div>
        <div class="allocation-row__toolbar">
          ${row.kind === "base" ? `<button class="allocation-row__edit" data-edit-base="${escapeHtml(row.base.id)}" type="button" aria-label="Edit base"><i data-lucide="pencil"></i></button>` : ""}
          ${
            row.kind === "base" && row.dayCount === 0
              ? `<button class="button button--danger allocation-row__delete" data-delete-base="${escapeHtml(row.base.id)}" type="button">Delete Base</button>`
              : ""
          }
        </div>
      </div>

      ${row.kind === "base" && row.dayCount > 0 ? renderAllocationItemWarning(row, items, bases) : ""}
      <div class="allocation-row__controls">
        <button class="allocation-row__adjust" data-allocation-adjust="decrease" data-slot-key="${escapeHtml(row.key)}" type="button" ${!canDecreaseAllocationRow(row, tripLength) ? "disabled" : ""}>−</button>
        <span class="allocation-row__count">${row.dayCount}</span>
        <button class="allocation-row__adjust" data-allocation-adjust="increase" data-slot-key="${escapeHtml(row.key)}" type="button">+</button>
      </div>
      ${isEditing ? renderEditBaseForm(row.base, tripDetail.isSavingBase) : ""}
    </article>
  `;
}

export function renderAllocationItemWarning(row, items, bases) {
  const movedItems = getItemsForDayRange(row.startDay, row.endDay, items, tripStore.getCurrentDays());

  if (movedItems.length === 0) {
    return "";
  }

  const reservedItems = movedItems.filter((item) => item.status === "reserved" || item.status === "confirmed");
  if (reservedItems.length === 0) {
    return "";
  }

  return `<p class="allocation-row__warning">Includes ${reservedItems.length} reserved/confirmed item${reservedItems.length === 1 ? "" : "s"} that may need review after moving days.</p>`;
}

export function renderAddBaseForm(currentBaseCount) {
  return `
    <form class="base-form" id="add-base-form">
      <div class="base-form__header">
        <h4>Add Base</h4>
        <button class="button button--secondary" id="cancel-add-base" type="button">Cancel</button>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Name</span>
          <input name="name" type="text" maxlength="120" placeholder="Barcelona" required />
        </label>
        <label class="field">
          <span>Location Name</span>
          <input name="locationName" type="text" maxlength="120" placeholder="Barcelona, Spain" />
        </label>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Timezone</span>
          ${renderTimezonePicker("add-base-timezone", DEFAULT_BASE_TIMEZONE)}
        </label>
        <label class="field">
          <span>Order</span>
          <input type="text" value="${currentBaseCount + 1}" disabled />
        </label>
      </div>
      <p class="muted">New bases start empty — use the +/− controls to assign days.</p>
      <div class="base-form__actions">
        <button class="button" type="submit">Save Base</button>
      </div>
    </form>
  `;
}

export function renderEditBaseForm(base, isSaving) {
  return `
    <form class="base-form" data-edit-base-form="${escapeHtml(base.id)}">
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Name</span>
          <input name="name" type="text" value="${escapeHtml(base.name)}" required />
        </label>
        <label class="field">
          <span>Location Name</span>
          <input name="locationName" type="text" value="${escapeHtml(base.location_name || "")}" />
        </label>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Timezone</span>
          ${renderTimezonePicker(`edit-base-timezone-${base.id}`, base.local_timezone || DEFAULT_BASE_TIMEZONE)}
        </label>
      </div>
      <div class="base-form__actions">
        <button class="button button--secondary" data-cancel-edit-base type="button">Cancel</button>
        <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Base"}</button>
      </div>
    </form>
  `;
}

export function renderAllocationConfirmModal(state) {
  if (!state) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-close-allocation-confirm></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Review Day Move</p>
            <h3>${escapeHtml(state.title)}</h3>
          </div>
        </div>
        <p class="muted">${escapeHtml(state.message)}</p>
        ${state.items.length > 0 ? `<p class="muted">${state.items.map((item) => item.title || "Untitled item").slice(0, 4).map(escapeHtml).join(", ")}</p>` : ""}
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-allocation-confirm" type="button">Cancel</button>
          <button class="button" id="confirm-allocation-change" type="button">Continue</button>
        </div>
      </section>
    </div>
  `;
}

export function renderTripLengthConfirmModal(state) {
  if (!state) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-close-trip-length-confirm></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Reduce Trip Length</p>
            <h3>Move items from removed days?</h3>
          </div>
        </div>
        <p class="muted">${escapeHtml(state.message)}</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-trip-length-confirm" type="button">Cancel</button>
          <button class="button" id="confirm-trip-length-change" type="button">Continue</button>
        </div>
      </section>
    </div>
  `;
}

export function renderDeleteBaseConfirmModal({ base, isOpen, isDeleting }) {
  if (!isOpen || !base) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-delete-base></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Delete Base</p>
            <h3>Delete ${escapeHtml(base.name || "this base")}?</h3>
          </div>
        </div>
        <p class="muted">This cannot be undone.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-delete-base" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-base" type="button" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Deleting…" : "Delete Base"}</button>
        </div>
      </section>
    </div>
  `;
}

export function getAllocationState(trip, days) {
  if (tripDetailState.allocationDraft && tripDetailState.allocationDraft.tripId === trip?.id) {
    return tripDetailState.allocationDraft;
  }

  return {
    tripId: trip?.id || null,
    tripLength: Number(trip?.trip_length || days.length || 0),
    days: [...days]
      .sort((left, right) => left.day_number - right.day_number)
      .map((day) => ({
        id: day.id,
        day_number: day.day_number,
        base_id: day.base_id ?? null,
      })),
  };
}

export function buildAllocationRows(bases, dayEntries) {
  const rows = [];
  const days = [...dayEntries].sort((left, right) => left.day_number - right.day_number);
  let currentRow = null;

  days.forEach((day) => {
    if (!currentRow || currentRow.baseId !== day.base_id) {
      if (currentRow) {
        rows.push(currentRow);
      }

      const base = day.base_id ? bases.find((entry) => entry.id === day.base_id) || null : null;
      currentRow = {
        key: base?.id || `unassigned-${day.day_number}`,
        kind: base ? "base" : "unassigned",
        base,
        baseId: day.base_id ?? null,
        label: base?.name || "Unassigned",
        startDay: day.day_number,
        endDay: day.day_number,
        dayCount: 1,
      };
      return;
    }

    currentRow.endDay = day.day_number;
    currentRow.dayCount += 1;
  });

  if (currentRow) {
    rows.push(currentRow);
  }

  const usedBaseIds = new Set(rows.filter((row) => row.baseId).map((row) => row.baseId));
  bases
    .filter((base) => !usedBaseIds.has(base.id))
    .forEach((base) => {
      rows.push({
        key: base.id,
        kind: "base",
        base,
        baseId: base.id,
        label: base.name || "Untitled base",
        startDay: null,
        endDay: null,
        dayCount: 0,
      });
    });

  return rows;
}

export function getAllocationSummary(trip, rows, tripLength) {
  const assignedDays = rows
    .filter((row) => row.kind === "base")
    .reduce((total, row) => total + row.dayCount, 0);
  const unassignedDays = rows
    .filter((row) => row.kind === "unassigned")
    .reduce((total, row) => total + row.dayCount, 0);
  const isComplete = assignedDays === Number(tripLength);

  let label = `${assignedDays} of ${tripLength} day${tripLength === 1 ? "" : "s"} allocated`;

  if (unassignedDays > 0) {
    label += ` (${unassignedDays} unassigned)`;
  }

  return {
    isComplete,
    label: isComplete
      ? `All ${tripLength} day${tripLength === 1 ? "" : "s"} allocated ✓`
      : label,
  };
}

export function hasAllocationDraftChanges(trip, days) {
  if (!trip?.id || !tripDetailState.allocationDraft || tripDetailState.allocationDraft.tripId !== trip.id) {
    return false;
  }

  if (Number(tripDetailState.allocationDraft.tripLength) !== Number(trip.trip_length)) {
    return true;
  }

  return days.some((day) => {
    const draftDay = tripDetailState.allocationDraft.days.find((entry) => entry.day_number === day.day_number);
    return draftDay && normalizeNullableId(draftDay.base_id) !== normalizeNullableId(day.base_id);
  });
}

export function canDecreaseAllocationRow(row, tripLength) {
  if (row.dayCount === 0) {
    return false;
  }

  return Number(tripLength) > 1;
}

export function getAllocationRangeLabel(row, startDate) {
  if (!row.dayCount || !row.startDay || !row.endDay) {
    return "No days assigned yet";
  }

  const dayLabel = row.startDay === row.endDay ? `Day ${row.startDay}` : `Days ${row.startDay}-${row.endDay}`;
  const dateLabel = startDate ? formatShortDateRange(startDate, row.startDay, row.endDay) : "";

  return dateLabel ? `${dayLabel} · ${dateLabel}` : dayLabel;
}

export function getItemsForDayRange(startDay, endDay, items, days) {
  const dayIds = new Set(
    days
      .filter((day) => day.day_number >= startDay && day.day_number <= endDay)
      .map((day) => day.id)
  );

  return items.filter((item) => dayIds.has(item.day_id));
}

function requestAllocationChange(slotKey, direction) {
  const trip = tripStore.getCurrentTrip();
  const days = tripStore.getCurrentDays();
  const items = tripStore.getCurrentItems();
  const draft = getAllocationState(trip, days);
  const rows = buildAllocationRows(tripStore.getCurrentBases(), draft.days);
  const rowIndex = rows.findIndex((row) => row.key === slotKey);

  if (!trip || rowIndex === -1) {
    return;
  }

  const row = rows[rowIndex];
  const affectedDayNumber = direction === "increase"
    ? row.dayCount > 0
      ? row.endDay + 1
      : rows[rowIndex - 1]?.endDay + 1 || 1
    : row.endDay;
  const nextRow = rows[rowIndex + 1] || null;
  const affectedDay = days.find((day) => day.day_number === affectedDayNumber) || null;
  const affectedItems = affectedDay ? items.filter((item) => item.day_id === affectedDay.id) : [];
  const importantItems = affectedItems.filter((item) => item.status === "reserved" || item.status === "confirmed");

  if (importantItems.length === 0 && !(direction === "decrease" && row.dayCount > 0 && affectedItems.length > 0 && !nextRow)) {
    applyAllocationChange(slotKey, direction);
    return;
  }

  tripDetailState.allocationConfirmState = {
    title: direction === "increase" ? `Move Day ${affectedDayNumber}?` : `Remove Day ${affectedDayNumber}?`,
    message: nextRow
      ? `Day ${affectedDayNumber} has ${importantItems.length} reserved/confirmed item${importantItems.length === 1 ? "" : "s"} and will move to ${nextRow.label}. Review after saving.`
      : `Day ${affectedDayNumber} has ${affectedItems.length} item${affectedItems.length === 1 ? "" : "s"} and they will move to unassigned when this day is removed.`,
    items: importantItems.length > 0 ? importantItems : affectedItems,
    action: {
      slotKey,
      direction,
    },
  };
  rerenderTripDetail();
}

function applyAllocationChange(slotKey, direction) {
  const trip = tripStore.getCurrentTrip();
  const draft = getAllocationState(trip, tripStore.getCurrentDays());
  const rows = buildAllocationRows(tripStore.getCurrentBases(), draft.days);
  const rowIndex = rows.findIndex((row) => row.key === slotKey);

  if (rowIndex === -1) {
    return;
  }

  const row = rows[rowIndex];
  const nextRow = rows[rowIndex + 1] || null;
  tripDetailState.allocationDraft = {
    ...draft,
    days: draft.days.map((day) => ({ ...day })),
  };

  if (direction === "increase") {
    if (nextRow?.startDay) {
      const movedDay = tripDetailState.allocationDraft.days.find((day) => day.day_number === nextRow.startDay);
      if (movedDay) {
        movedDay.base_id = row.baseId;
      }
    } else {
      tripDetailState.allocationDraft.tripLength += 1;
      tripDetailState.allocationDraft.days.push({
        id: null,
        day_number: tripDetailState.allocationDraft.tripLength,
        base_id: row.baseId,
      });
    }
  }

  if (direction === "decrease" && row.endDay) {
    const movedDay = tripDetailState.allocationDraft.days.find((day) => day.day_number === row.endDay);

    if (!movedDay) {
      return;
    }

    if (nextRow?.key) {
      movedDay.base_id = nextRow.baseId;
    } else {
      tripDetailState.allocationDraft.days = tripDetailState.allocationDraft.days.filter((day) => day.day_number !== row.endDay);
      tripDetailState.allocationDraft.tripLength -= 1;
    }
  }

  tripDetailState.allocationDraft.days = tripDetailState.allocationDraft.days
    .sort((left, right) => left.day_number - right.day_number)
    .map((day, index) => ({
      ...day,
      day_number: index + 1,
    }));

  rerenderTripDetail();
}

async function saveAllocationDraft(trip, loadTripDetail) {
  const originalTripLength = Number(trip.trip_length);
  const nextTripLength = Number(tripDetailState.allocationDraft.tripLength);
  let tripLengthUpdated = false;

  if (nextTripLength !== originalTripLength) {
    await updateTripSettings({
      tripId: trip.id,
      title: trip.title,
      description: trip.description || "",
      startDate: trip.start_date || "",
      tripLength: nextTripLength,
    });
    tripLengthUpdated = true;
  }

  const freshBundle = await fetchTripDetailBundle(trip.id);
  const changedAllocations = tripDetailState.allocationDraft.days
    .filter((draftDay) => draftDay.day_number <= nextTripLength)
    .map((draftDay) => {
      const persistedDay = freshBundle.days.find((day) => day.day_number === draftDay.day_number);
      if (!persistedDay) {
        return null;
      }

      if (normalizeNullableId(persistedDay.base_id) === normalizeNullableId(draftDay.base_id)) {
        return null;
      }

      return {
        dayNumber: draftDay.day_number,
        toBaseId: draftDay.base_id,
      };
    })
    .filter(Boolean);

  if (changedAllocations.length > 0) {
    try {
      await saveTripDayAllocations({
        tripId: trip.id,
        allocations: changedAllocations,
      });
    } catch (error) {
      if (tripLengthUpdated) {
        await loadTripDetail(trip.id);
        throw new Error("TRIP_LENGTH_UPDATED_ALLOCATIONS_FAILED");
      }

      throw error;
    }
  }
}

export function getSupportedTimezones() {
  if (tripDetailState.supportedTimezonesCache) {
    return tripDetailState.supportedTimezonesCache;
  }

  if (typeof Intl?.supportedValuesOf === "function") {
    try {
      tripDetailState.supportedTimezonesCache = Intl.supportedValuesOf("timeZone").slice().sort((left, right) => left.localeCompare(right));
      return tripDetailState.supportedTimezonesCache;
    } catch (_error) {
      // Ignore and fall back to the default timezone.
    }
  }

  tripDetailState.supportedTimezonesCache = [DEFAULT_BASE_TIMEZONE];
  return tripDetailState.supportedTimezonesCache;
}

export function renderTimezonePicker(inputId, selectedTimezone) {
  return `
    <input
      id="${escapeHtml(inputId)}"
      name="localTimezone"
      type="text"
      list="timezone-options"
      value="${escapeHtml(selectedTimezone || DEFAULT_BASE_TIMEZONE)}"
      placeholder="Start typing a timezone"
      autocomplete="off"
      required
    />
  `;
}

export function renderTimezoneOptionsDatalist() {
  return `
    <datalist id="timezone-options">
      ${getSupportedTimezones().map((timezone) => `<option value="${escapeHtml(timezone)}"></option>`).join("")}
    </datalist>
  `;
}

export function getValidatedTimezone(rawValue) {
  const timezone = String(rawValue || "").trim();

  if (!timezone) {
    showToast("Choose a timezone from the list first.", "error");
    return null;
  }

  if (!getSupportedTimezones().includes(timezone)) {
    showToast("Choose a valid IANA timezone from the list.", "error");
    return null;
  }

  return timezone;
}

export function normalizeNullableId(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue === "" ? null : normalizedValue;
}

export function closeDeleteBaseConfirm() {
  appStore.updateTripDetail({
    showDeleteBaseConfirm: false,
    isDeletingBase: false,
    deletingBaseId: null,
  });
  rerenderTripDetail();
}

export function createBaseAllocationHandlers({ getTripItemErrorMessage, loadTripDetail }) {
  return {
    onShowAddBaseForm: () => {
      appStore.updateTripDetail({
        isShowingAddBaseForm: true,
        editingBaseId: null,
      });
      rerenderTripDetail();
    },
    onCancelAddBase: () => {
      appStore.updateTripDetail({
        isShowingAddBaseForm: false,
      });
      rerenderTripDetail();
    },
    onEditBase: (baseId) => {
      appStore.updateTripDetail({
        editingBaseId: baseId,
        isShowingAddBaseForm: false,
      });
      rerenderTripDetail();
    },
    onCancelEditBase: () => {
      appStore.updateTripDetail({
        editingBaseId: null,
      });
      rerenderTripDetail();
    },
    onAllocationAdjust: ({ slotKey, direction }) => {
      if (!slotKey || !direction) {
        return;
      }
      requestAllocationChange(slotKey, direction);
    },
    onCancelAllocationChanges: () => {
      tripDetailState.allocationDraft = null;
      tripDetailState.allocationConfirmState = null;
      rerenderTripDetail();
    },
    onSaveAllocationChanges: async () => {
      const trip = tripStore.getCurrentTrip();

      if (!trip?.id || !tripDetailState.allocationDraft) {
        return;
      }

      appStore.updateTripDetail({
        isSavingBase: true,
      });
      rerenderTripDetail();

      try {
        await saveAllocationDraft(trip, loadTripDetail);
        tripDetailState.allocationDraft = null;
        tripDetailState.allocationConfirmState = null;
        appStore.updateTripDetail({
          isSavingBase: false,
        });
        await loadTripDetail(trip.id);
        showToast("Day allocation updated.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isSavingBase: false,
        });
        rerenderTripDetail();
        showToast(
          error?.message === "TRIP_LENGTH_UPDATED_ALLOCATIONS_FAILED"
            ? "Trip length updated, but day allocations didn't save — try again."
            : getTripItemErrorMessage("update"),
          "error"
        );
      }
    },
    onCancelAllocationConfirm: () => {
      tripDetailState.allocationConfirmState = null;
      rerenderTripDetail();
    },
    onCloseAllocationConfirm: () => {
      tripDetailState.allocationConfirmState = null;
      rerenderTripDetail();
    },
    onConfirmAllocationChange: () => {
      if (!tripDetailState.allocationConfirmState?.action) {
        return;
      }
      const action = tripDetailState.allocationConfirmState.action;
      tripDetailState.allocationConfirmState = null;
      applyAllocationChange(action.slotKey, action.direction);
    },
    onAddBaseSubmit: async (event) => {
      event.preventDefault();

      const trip = tripStore.getCurrentTrip();
      const bases = tripStore.getCurrentBases();
      const formData = new FormData(event.currentTarget);
      const baseName = String(formData.get("name") || "").trim();
      const localTimezone = getValidatedTimezone(formData.get("localTimezone"));

      if (!localTimezone) {
        return;
      }

      if (!trip?.id || !baseName) {
        showToast("Add a base name first.", "error");
        return;
      }

      appStore.updateTripDetail({
        isSavingBase: true,
      });
      rerenderTripDetail();

      try {
        await createTripBase({
          tripId: trip.id,
          name: baseName,
          locationName: String(formData.get("locationName") || "").trim(),
          localTimezone,
          sortOrder: bases.length,
        });

        appStore.updateTripDetail({
          isSavingBase: false,
          isShowingAddBaseForm: false,
        });
        await loadTripDetail(trip.id);
        showToast("Base added.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isSavingBase: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("create"), "error");
      }
    },
    onEditBaseSubmit: async (event, form) => {
      event.preventDefault();

      const trip = tripStore.getCurrentTrip();
      const baseId = form.getAttribute("data-edit-base-form");
      const formData = new FormData(form);
      const localTimezone = getValidatedTimezone(formData.get("localTimezone"));

      if (!localTimezone || !trip?.id || !baseId) {
        return;
      }

      appStore.updateTripDetail({
        isSavingBase: true,
      });
      rerenderTripDetail();

      try {
        await updateTripBase({
          baseId,
          name: String(formData.get("name") || "").trim(),
          locationName: String(formData.get("locationName") || "").trim(),
          localTimezone,
        });

        appStore.updateTripDetail({
          isSavingBase: false,
          editingBaseId: null,
        });
        await loadTripDetail(trip.id);
        showToast("Base updated.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isSavingBase: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("update"), "error");
      }
    },
    onRequestDeleteBase: (baseId) => {
      if (!baseId) {
        return;
      }

      appStore.updateTripDetail({
        showDeleteBaseConfirm: true,
        deletingBaseId: baseId,
      });
      rerenderTripDetail();
    },
    onCancelDeleteBase: closeDeleteBaseConfirm,
    onConfirmDeleteBase: async () => {
      const trip = tripStore.getCurrentTrip();
      const bases = tripStore.getCurrentBases();
      const { deletingBaseId } = appStore.getState().tripDetail;
      const base = bases.find((entry) => entry.id === deletingBaseId) || null;

      if (!trip?.id || !deletingBaseId || !base) {
        return;
      }

      appStore.updateTripDetail({
        isDeletingBase: true,
      });
      rerenderTripDetail();

      try {
        await softDeleteTripBase(deletingBaseId);
        tripStore.removeCurrentBase(deletingBaseId);
        appStore.updateTripDetail({
          isDeletingBase: false,
          showDeleteBaseConfirm: false,
          deletingBaseId: null,
          editingBaseId: null,
        });
        rerenderTripDetail();
        showToast(`${getDisplayTitleForToast(base.name, "Base")} deleted`, "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isDeletingBase: false,
        });
        rerenderTripDetail();
        showToast(
          error?.message === "BASE_HAS_ASSIGNED_DAYS"
            ? "Remove all days from this base before deleting it."
            : getTripItemErrorMessage("baseDelete"),
          "error"
        );
      }
    },
  };
}
