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
import {
  formatShortDateRange,
  formatTimezone,
  formatTimezoneOffset,
} from "../../../lib/format.js";
import {
  CANONICAL_TIMEZONES,
  DEFAULT_BASE_TIMEZONE,
} from "../../../config/constants.js";
import { showToast } from "../../shared/toast.js";
import {
  tripDetailState,
  rerenderTripDetail,
} from "./trip-detail-state.js";
import {
  escapeHtml,
  getBaseHeroPhotoUrl,
  getDisplayTitleForToast,
  getTripHeroPhotoUrl,
  renderHeroPhotoImage,
} from "./trip-detail-ui.js";

export function renderAllocationRow(row, trip, tripDetail, items, bases, tripLength) {
  const countLabel = row.dayCount === 1 ? "1 day" : `${row.dayCount} days`;
  const dateLabel = row.dayCount > 0 && trip.start_date ? formatShortDateRange(trip.start_date, row.startDay, row.endDay) : "";
  const summaryLabel = dateLabel ? `${countLabel}<span class="allocation-row__separator">·</span>${escapeHtml(dateLabel)}` : countLabel;
  const detailLabel = row.kind === "base"
    ? `<strong>Timezone:</strong> ${escapeHtml(formatTimezone(row.base.local_timezone || DEFAULT_BASE_TIMEZONE))}`
    : "Day without a base";

  return `
    <article class="allocation-row ${row.kind === "unassigned" ? "allocation-row--unassigned" : ""}">
      <div class="allocation-row__header">
        <div class="allocation-row__copy">
          <h4>${escapeHtml(row.label)}</h4>
          <p class="allocation-row__summary">${summaryLabel}</p>
          <p class="muted allocation-row__timezone">${detailLabel}</p>
        </div>
        <div class="allocation-row__toolbar">
          ${row.kind === "base" ? `<button class="allocation-row__edit" data-edit-base="${escapeHtml(row.base.id)}" type="button" aria-label="Edit base"><i data-lucide="pencil"></i></button>` : ""}
          ${
            row.kind === "base" && row.dayCount === 0
              ? `<button class="allocation-row__delete" data-delete-base="${escapeHtml(row.base.id)}" type="button" aria-label="Delete base"><i data-lucide="trash-2"></i></button>`
              : ""
          }
        </div>
      </div>

      <div class="allocation-row__controls">
        <button class="allocation-row__adjust" data-allocation-adjust="decrease" data-slot-key="${escapeHtml(row.key)}" type="button" ${!canDecreaseAllocationRow(row, tripLength) ? "disabled" : ""}>−</button>
        <span class="allocation-row__count">${row.dayCount}</span>
        <button class="allocation-row__adjust" data-allocation-adjust="increase" data-slot-key="${escapeHtml(row.key)}" type="button">+</button>
      </div>
    </article>
  `;
}

export function renderAddBaseForm(isSaving) {
  return `
    <div class="modal-shell" id="add-base-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-add-base></div>
      <section class="panel modal-card modal-card--editor base-form-modal">
        <div class="modal-card__header">
          <h3>Add Base</h3>
          <button class="icon-button" id="cancel-add-base" type="button" aria-label="Close add base">×</button>
        </div>
        <form class="base-form" id="add-base-form">
          <div class="item-editor-form__content">
            <label class="field">
              <span>Name</span>
              <input name="name" type="text" maxlength="120" placeholder="Barcelona" required />
            </label>
            <label class="field">
              <span>Location</span>
              <input name="locationName" type="text" maxlength="120" placeholder="Barcelona, Spain" />
            </label>
            <label class="field">
              <span>Timezone</span>
              ${renderTimezonePicker("add-base-timezone", DEFAULT_BASE_TIMEZONE)}
            </label>
          </div>
          <div class="modal-card__actions modal-card__actions--sticky modal-card__actions--end">
            <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Base"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

export function renderEditBaseForm(base, isSaving) {
  return `
    <div class="modal-shell" id="edit-base-modal" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-edit-base></div>
      <section class="panel modal-card modal-card--editor base-form-modal">
        <div class="modal-card__header">
          <h3>${escapeHtml(base.name || "Untitled base")}</h3>
          <button class="icon-button" data-cancel-edit-base type="button" aria-label="Close edit base">×</button>
        </div>
        <form class="base-form" data-edit-base-form="${escapeHtml(base.id)}">
          <div class="item-editor-form__content">
            ${renderBasePhotoField(base)}

            <label class="field">
              <span>Name</span>
              <input name="name" type="text" value="${escapeHtml(base.name)}" required />
            </label>
            <label class="field">
              <span>Location</span>
              <input name="locationName" type="text" value="${escapeHtml(base.location_name || "")}" />
            </label>
            <label class="field">
              <span>Timezone</span>
              ${renderTimezonePicker(`edit-base-timezone-${base.id}`, base.local_timezone || DEFAULT_BASE_TIMEZONE)}
            </label>
          </div>
          <div class="modal-card__actions modal-card__actions--sticky modal-card__actions--end">
            <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Changes"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderBasePhotoField(base) {
  const trip = tripStore.getCurrentTrip();
  const isSingleBaseTrip = tripStore.getCurrentBases().length === 1;
  const heroPhotoUrl = isSingleBaseTrip ? getTripHeroPhotoUrl(trip) : getBaseHeroPhotoUrl(base);

  return `
    <div class="photo-field">
      <div class="photo-field__preview photo-hero">
        ${heroPhotoUrl ? renderHeroPhotoImage(heroPhotoUrl) : `<span class="photo-hero__empty-label">Add photo</span>`}
      </div>
      ${
        isSingleBaseTrip
          ? `<p class="field-hint">Single-base trips use the trip photo here. Add a second base before setting a separate base photo.</p>`
          : `
            <div class="photo-field__actions">
              <button class="button button--secondary" data-base-hero-upload="${escapeHtml(base.id)}" type="button">
                ${heroPhotoUrl ? "Adjust crop" : "Add photo"}
              </button>
              ${heroPhotoUrl ? `<button class="button-link" data-base-hero-replace="${escapeHtml(base.id)}" type="button">Replace photo</button>` : ""}
            </div>
          `
      }
    </div>
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
        ${state.items.length > 0 ? `<p class="muted">${state.items.map((item) => item.title || "Untitled stop").slice(0, 4).map(escapeHtml).join(", ")}</p>` : ""}
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
            <h3>Move stops from removed days?</h3>
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
      ? `Day ${affectedDayNumber} has ${importantItems.length} reserved/confirmed stop${importantItems.length === 1 ? "" : "s"} and will move to ${nextRow.label}. Review after saving.`
      : `Day ${affectedDayNumber} has ${affectedItems.length} stop${affectedItems.length === 1 ? "" : "s"} and they will move to unassigned when this day is removed.`,
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

  tripDetailState.supportedTimezonesCache = CANONICAL_TIMEZONES.map(([timezone]) => timezone);
  return tripDetailState.supportedTimezonesCache;
}

export function renderTimezonePicker(inputId, selectedTimezone) {
  const normalizedTimezone = getSupportedTimezones().includes(selectedTimezone) ? selectedTimezone : DEFAULT_BASE_TIMEZONE;
  const displayLabel = getTimezoneSelectedLabel(normalizedTimezone);
  const options = getTimezonePickerOptions();

  return `
    <span class="timezone-picker">
      <input
        name="localTimezone"
        type="hidden"
        value="${escapeHtml(normalizedTimezone)}"
        data-timezone-value
      />
      <input
        id="${escapeHtml(inputId)}"
        type="text"
        value="${escapeHtml(displayLabel)}"
        placeholder="Start typing a timezone"
        autocomplete="off"
        required
        data-timezone-display
      />
      <span class="timezone-picker__list" role="listbox" aria-label="Timezone options">
        ${options.map((option) => `
          <span
            class="timezone-picker__option"
            role="option"
            tabindex="0"
            data-timezone-option="${escapeHtml(option.timezone)}"
            data-timezone-search="${escapeHtml(option.searchText)}"
          >${escapeHtml(option.optionLabel)}</span>
        `).join("")}
      </span>
    </span>
  `;
}

export function renderTimezoneOptionsDatalist() {
  return "";
}

export function getValidatedTimezone(rawValue) {
  const timezone = String(rawValue || "").trim();

  if (!timezone) {
    showToast("Choose a timezone from the list first.", "error");
    return null;
  }

  const matchedTimezone = getTimezoneFromPickerValue(timezone);

  if (!matchedTimezone) {
    showToast("Choose a valid IANA timezone from the list.", "error");
    return null;
  }

  return matchedTimezone;
}

export function wireTimezonePickers() {
  document.querySelectorAll(".timezone-picker").forEach((picker) => {
    const input = picker.querySelector("[data-timezone-display]");
    const hiddenInput = picker.querySelector("[data-timezone-value]");
    const options = [...picker.querySelectorAll("[data-timezone-option]")];

    if (!input || !hiddenInput) {
      return;
    }

    const filterOptions = () => {
      const query = String(input.value || "").trim().toLowerCase();

      options.forEach((option) => {
        const searchText = option.getAttribute("data-timezone-search") || "";
        option.hidden = Boolean(query) && !searchText.includes(query);
      });
    };

    const selectOption = (option) => {
      const timezone = option.getAttribute("data-timezone-option") || "";

      if (!timezone) {
        return;
      }

      hiddenInput.value = timezone;
      input.value = getTimezoneSelectedLabel(timezone);
      filterOptions();
    };

    input.addEventListener("input", () => {
      const matchedTimezone = getTimezoneFromPickerValue(input.value);

      if (matchedTimezone) {
        hiddenInput.value = matchedTimezone;
      }

      filterOptions();
    });

    input.addEventListener("focus", filterOptions);

    input.addEventListener("blur", () => {
      const matchedTimezone = getTimezoneFromPickerValue(input.value) || hiddenInput.value || DEFAULT_BASE_TIMEZONE;
      hiddenInput.value = matchedTimezone;
      input.value = getTimezoneSelectedLabel(matchedTimezone);
      window.setTimeout(filterOptions, 120);
    });

    options.forEach((option) => {
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      option.addEventListener("click", () => selectOption(option));
      option.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectOption(option);
        }
      });
    });

    filterOptions();
  });
}

function getTimezoneEntry(timezone) {
  return CANONICAL_TIMEZONES.find(([entryTimezone]) => entryTimezone === timezone) || null;
}

function getTimezoneSelectedLabel(timezone) {
  return getTimezoneEntry(timezone)?.[1] || formatTimezone(timezone);
}

function getTimezoneOptionLabel(timezone) {
  const offset = formatTimezoneOffset(timezone);
  return `${getTimezoneSelectedLabel(timezone)}${offset ? ` · ${offset}` : ""}`;
}

function getTimezonePickerOptions() {
  return getSupportedTimezones().map((timezone) => {
    const selectedLabel = getTimezoneSelectedLabel(timezone);
    const abbreviation = selectedLabel.match(/\(([^)]+)\)$/)?.[1] || "";
    const cityAliases = timezone
      .split("/")
      .slice(1)
      .join(" ")
      .replaceAll("_", " ");

    return {
      timezone,
      optionLabel: getTimezoneOptionLabel(timezone),
      searchText: [selectedLabel, abbreviation, cityAliases, timezone].join(" ").toLowerCase(),
    };
  });
}

function getTimezoneFromPickerValue(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  const exactTimezone = getSupportedTimezones().find((timezone) => timezone === normalizedValue);
  if (exactTimezone) {
    return exactTimezone;
  }

  return getSupportedTimezones().find((timezone) => {
    const label = getTimezoneSelectedLabel(timezone);
    const optionLabel = getTimezoneOptionLabel(timezone);
    const abbreviation = label.match(/\(([^)]+)\)$/)?.[1] || "";

    return [label, optionLabel, abbreviation, timezone].includes(normalizedValue);
  }) || "";
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
        isSavingBase: false,
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
        isSavingBase: false,
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
