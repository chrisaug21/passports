import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  batchUpdateTripItems,
  createDetailedTripItem,
  softDeleteTripItem,
} from "../../../services/trips-service.js";
import { sessionStore } from "../../../state/session-store.js";
import {
  formatDayDateLabel,
  formatItemTypeLabel,
  formatStatusLabel,
} from "../../../lib/format.js";
import {
  ACTIVITY_TYPES,
  ITEM_STATUSES,
  ITEM_TYPES,
  MEAL_SLOTS,
  TRANSPORT_MODES,
} from "../../../config/constants.js";
import { showToast } from "../../shared/toast.js";
import {
  tripDetailState,
  rerenderTripDetail,
} from "./trip-detail-state.js";
import { escapeHtml } from "./trip-detail-ui.js";
import {
  buildItemSaveBatch,
  buildUpdatedItem,
} from "./items-controller.js";
import { normalizeNullableId } from "./base-allocation-controller.js";

export function renderItemEditorModal({ item, bases, days, mode = "edit", context = null, isSaving, isDeleting }) {
  const isAddMode = mode === "add";

  if (!item && !isAddMode) {
    return `
      <div class="modal-shell is-hidden" id="item-editor-modal" aria-hidden="true">
        <div class="modal-backdrop" data-close-item-editor></div>
      </div>
    `;
  }

  const draft = getCurrentItemEditorDraft({ item, isAddMode, context });
  const modalTitle = isAddMode ? getAddItemModalTitle(context, bases) : draft.title || "Untitled stop";

  return `
    <div class="modal-shell" id="item-editor-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-item-editor></div>
      <section class="panel modal-card modal-card--editor">
        <div class="modal-card__header">
          <div>
            <h3>${escapeHtml(modalTitle)}</h3>
          </div>
          <button class="icon-button" id="close-item-editor" type="button" aria-label="Close editor">×</button>
        </div>

        <form class="item-editor-form" id="item-editor-form">
          <div class="item-editor-form__content">
          <label class="field">
            <span>Title</span>
            <input name="title" type="text" maxlength="120" value="${escapeHtml(draft.title)}" required />
          </label>

          <div class="item-editor-form__grid">
            <label class="field">
              <span>Type</span>
              <select id="item-type-select" name="itemType" required>
                <option value="" ${draft.itemType ? "" : "selected"}>Choose type</option>
                ${ITEM_TYPES.map((type) => `<option value="${type}" ${draft.itemType === type ? "selected" : ""}>${formatItemTypeLabel(type)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Status</span>
              <select name="status" required>
                ${ITEM_STATUSES.map((status) => `<option value="${status}" ${draft.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>`).join("")}
              </select>
            </label>
          </div>

          <div class="item-editor-form__grid">
            <label class="field">
              <span>Base</span>
              <select name="baseId">
                <option value="">Unassigned</option>
                ${bases.map((base) => `<option value="${escapeHtml(base.id)}" ${draft.baseId === base.id ? "selected" : ""}>${escapeHtml(base.name || "Untitled base")}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Day</span>
              <select name="dayId">
                <option value="">Unassigned</option>
                ${days.map((day) => {
                  const dayBase = bases.find((base) => base.id === day.base_id);
                  return `<option value="${escapeHtml(day.id)}" ${draft.dayId === day.id ? "selected" : ""}>Day ${day.day_number}${day.title ? ` · ${escapeHtml(day.title)}` : ""}${dayBase ? ` · ${escapeHtml(dayBase.name || "Untitled base")}` : ""}</option>`;
                }).join("")}
              </select>
            </label>
          </div>
          <p class="field-hint ${getItemEditorAssignmentHint(draft.baseId, draft.dayId, bases, days) ? "" : "is-hidden"}" id="item-editor-assignment-hint">${escapeHtml(getItemEditorAssignmentHint(draft.baseId, draft.dayId, bases, days) || "")}</p>

          <div class="item-editor-section">
            <p class="item-editor-section__title">Timing</p>
            <div class="item-editor-form__grid">
              <label class="field">
              <span>Start Time</span>
                <input class="item-time-input" name="timeStart" type="time" step="900" value="${escapeHtml(parseEditableTimeToStorage(draft.timeStart) || "")}" placeholder="— : — AM" />
              </label>
              <label class="field">
                <span>End Time</span>
                <input class="item-time-input" name="timeEnd" type="time" step="900" value="${escapeHtml(parseEditableTimeToStorage(draft.timeEnd) || "")}" placeholder="— : — AM" />
              </label>
            </div>
            <p class="field-hint field-hint--warning is-hidden" id="item-editor-time-warning">End time should be after start time.</p>
            <label class="anchor-checkbox-label ${draft.timeStart ? "" : "is-disabled"}" for="item-anchor-checkbox" title="${draft.timeStart ? "" : "Set a start time to mark as anchor"}">
              <input class="anchor-checkbox-input" id="item-anchor-checkbox" name="isAnchor" type="checkbox" ${draft.isAnchor && draft.timeStart ? "checked" : ""} ${draft.timeStart ? "" : "disabled"} hidden />
              <span class="anchor-checkbox" role="checkbox" aria-checked="${draft.isAnchor && draft.timeStart ? "true" : "false"}" aria-disabled="${draft.timeStart ? "false" : "true"}" tabindex="${draft.timeStart ? "0" : "-1"}">
                ${draft.isAnchor && draft.timeStart ? '<i data-lucide="check" aria-hidden="true"></i>' : ""}
              </span>
              <span>Anchor stop</span>
            </label>
          </div>

          ${renderTypeSpecificFields(draft)}

          <div class="item-editor-section">
            <p class="item-editor-section__title">Cost</p>
            <div class="item-editor-form__grid">
              <label class="field">
                <span>Low / Exact</span>
                <input name="costLow" type="number" step="0.01" min="0" value="${escapeHtml(draft.costLow ?? "")}" />
              </label>
              <label class="field">
                <span>High</span>
                <input name="costHigh" type="number" step="0.01" min="0" value="${escapeHtml(draft.costHigh ?? "")}" />
              </label>
            </div>
          </div>

          <div class="item-editor-section">
            <p class="item-editor-section__title">Details</p>
            <label class="field">
              <span>URL</span>
              <input name="url" type="url" value="${escapeHtml(draft.url || "")}" placeholder="https://..." />
            </label>
            <label class="field">
              <span>Notes</span>
              <textarea name="notes" rows="4" placeholder="Booking notes, reminders, context">${escapeHtml(draft.notes || "")}</textarea>
            </label>
          </div>
          </div>

          <div class="modal-card__actions modal-card__actions--sticky">
            ${isAddMode ? "<span></span>" : `<button class="button-link button-link--danger" id="delete-item-button" type="button" ${isSaving || isDeleting ? "disabled" : ""}>Remove from trip</button>`}
            <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : isAddMode ? "Save" : "Save Changes"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

export function getTripItemErrorMessage(action = "update") {
  const messages = {
    create: "Could not create that stop right now. Please try again.",
    update: "Could not save those changes right now. Please try again.",
    delete: "Could not delete that stop right now. Please try again.",
    baseDelete: "Could not delete that base right now. Please try again.",
    tripDelete: "Could not delete that trip right now. Please try again.",
    tripUpdate: "Could not update that trip right now. Please try again.",
  };

  return messages[action] || "Something went wrong. Please try again.";
}

function closeItemEditor() {
  requestCloseItemEditor(() => {
    appStore.updateTripDetail({
      editingItemId: null,
      itemEditorMode: "edit",
      itemEditorContext: null,
      isSavingItem: false,
      showDiscardConfirm: false,
    });
    tripDetailState.persistedEditorItemId = null;
    tripDetailState.itemEditorInitialSnapshot = "";
    tripDetailState.itemEditorDraft = null;
    tripDetailState.pendingDiscardAction = null;
    rerenderTripDetail();
  });
}

export function renderDiscardConfirmModal(isOpen) {
  if (!isOpen) {
    return "";
  }

  return `
    <div class="modal-shell" id="discard-confirm-modal" aria-hidden="false">
      <div class="modal-backdrop" data-keep-editing></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Unsaved Changes</p>
            <h3>Discard your edits?</h3>
          </div>
        </div>
        <p class="muted">You have unsaved changes. If you close now, they will be lost.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="keep-editing-button" type="button">Keep Editing</button>
          <button class="button" id="discard-changes-button" type="button">Discard Changes</button>
        </div>
      </section>
    </div>
  `;
}

export function renderDeleteItemConfirmModal({ item, isOpen, isDeleting }) {
  if (!isOpen || !item) {
    return "";
  }

  return `
    <div class="modal-shell" id="delete-item-confirm-modal" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-delete-item></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Remove from trip</p>
            <h3>Remove ${escapeHtml(item.title || "this stop")}?</h3>
          </div>
        </div>
        <p class="muted">This cannot be undone.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-delete-item" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-item" type="button" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Removing…" : "Remove from trip"}</button>
        </div>
      </section>
    </div>
  `;
}

export function renderMoveItemModal({ trip, item, bases, days, isOpen, isMoving }) {
  if (!isOpen || !item) {
    return "";
  }

  const daysByBase = bases
    .map((base) => ({
      base,
      days: days.filter((day) => day.base_id === base.id),
    }))
    .filter((group) => group.days.length > 0);
  const showEmptyState = daysByBase.length === 0 && !item.day_id;

  return `
    <div class="modal-shell" id="move-item-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-move-item></div>
      <section class="panel modal-card">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Move Stop</p>
            <h3>Move ${escapeHtml(item.title || "this stop")} to...</h3>
          </div>
          <button class="icon-button" id="close-move-item" type="button" aria-label="Close move dialog">×</button>
        </div>
        <div class="move-item-modal__list">
          ${
            showEmptyState
              ? `<p class="muted">No days available to move to. Add days to your trip first.</p>`
              : `
                <button
                  class="move-item-modal__option"
                  data-move-item-destination=""
                  type="button"
                  ${!item.day_id || isMoving ? "disabled" : ""}
                >
                  <span>Unassigned</span>
                </button>
                ${daysByBase.map((group) => `
                  <div class="move-item-modal__group">
                    <p class="eyebrow">${escapeHtml(group.base.name || "Untitled base")}</p>
                    ${group.days.map((day) => `
                      <button
                        class="move-item-modal__option"
                        data-move-item-destination="${escapeHtml(day.id)}"
                        type="button"
                        ${item.day_id === day.id || isMoving ? "disabled" : ""}
                      >
                        <span>Day ${day.day_number}${trip?.start_date ? ` · ${escapeHtml(formatDayDateLabel(trip.start_date, day.day_number))}` : ""}</span>
                      </button>
                    `).join("")}
                  </div>
                `).join("")}
              `
          }
        </div>
      </section>
    </div>
  `;
}

function renderTypeSpecificFields(draft) {
  return `
    <div class="item-editor-section" data-item-type-section="meal">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Meal Slot</span>
        <select name="mealSlot">
          <option value="">None</option>
          ${MEAL_SLOTS.map((slot) => `<option value="${slot}" ${draft.mealSlot === slot ? "selected" : ""}>${escapeHtml(formatItemTypeLabel(slot))}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="item-editor-section" data-item-type-section="activity">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Activity Type</span>
        <select name="activityType">
          <option value="">None</option>
          ${ACTIVITY_TYPES.map((type) => `<option value="${type}" ${draft.activityType === type ? "selected" : ""}>${escapeHtml(formatItemTypeLabel(type))}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="item-editor-section" data-item-type-section="transport">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Transport Mode</span>
        <select name="transportMode">
          <option value="">None</option>
          ${TRANSPORT_MODES.map((mode) => `<option value="${mode}" ${draft.transportMode === mode ? "selected" : ""}>${escapeHtml(formatItemTypeLabel(mode))}</option>`).join("")}
        </select>
      </label>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Transport Origin</span>
          <input name="transportOrigin" type="text" value="${escapeHtml(draft.transportOrigin || "")}" />
        </label>
        <label class="field">
          <span>Transport Destination</span>
          <input name="transportDestination" type="text" value="${escapeHtml(draft.transportDestination || "")}" />
        </label>
      </div>
    </div>
  `;
}

function syncItemEditorTypeFields() {
  const itemTypeSelect = document.querySelector("#item-type-select");
  const selectedType = itemTypeSelect?.value;

  document.querySelectorAll("[data-item-type-section]").forEach((section) => {
    const sectionType = section.getAttribute("data-item-type-section");
    const isActive = sectionType === selectedType;

    section.classList.toggle("is-hidden", !isActive);
    section.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !isActive;
    });
  });
}

function syncItemEditorAssignmentHint() {
  const hintElement = document.querySelector("#item-editor-assignment-hint");
  if (!hintElement) {
    return;
  }

  const form = document.querySelector("#item-editor-form");
  if (!form) {
    return;
  }

  const formData = new FormData(form);
  const baseId = String(formData.get("baseId") || "").trim();
  const dayId = String(formData.get("dayId") || "").trim();
  const bases = tripStore.getCurrentBases();
  const days = tripStore.getCurrentDays();
  const hint = getItemEditorAssignmentHint(baseId, dayId, bases, days);

  hintElement.textContent = hint || "";
  hintElement.classList.toggle("is-hidden", !hint);
}

function requestCloseItemEditor(onDiscard) {
  const { editingItemId, itemEditorMode } = appStore.getState().tripDetail;

  if (!editingItemId && itemEditorMode !== "add") {
    onDiscard();
    return;
  }

  if (!hasUnsavedItemEditorChanges()) {
    onDiscard();
    return;
  }

  tripDetailState.pendingDiscardAction = onDiscard;
  appStore.updateTripDetail({
    showDiscardConfirm: true,
  });
  rerenderTripDetail();
}

function captureItemEditorInitialSnapshot() {
  if (!tripDetailState.itemEditorDraft) {
    const { editingItemId, itemEditorMode, itemEditorContext } = appStore.getState().tripDetail;

    if (itemEditorMode === "add") {
      tripDetailState.itemEditorDraft = buildAddItemEditorDraft(itemEditorContext);
      tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
      return;
    }

    const item = tripStore.getCurrentItems().find((entry) => entry.id === editingItemId);

    if (!item) {
      tripDetailState.itemEditorInitialSnapshot = "";
      return;
    }

    tripDetailState.itemEditorDraft = buildItemEditorDraft(item);
  }

  tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
}

function ensureItemEditorInitialSnapshot() {
  if (tripDetailState.itemEditorInitialSnapshot) {
    return;
  }

  captureItemEditorInitialSnapshot();
}

function hasUnsavedItemEditorChanges() {
  syncItemEditorDraftFromForm();

  if (!tripDetailState.itemEditorDraft) {
    return false;
  }

  return serializeItemEditorDraft(tripDetailState.itemEditorDraft) !== tripDetailState.itemEditorInitialSnapshot;
}

function syncItemEditorDraftFromForm() {
  const form = document.querySelector("#item-editor-form");

  if (!form) {
    return;
  }

  const formData = new FormData(form);

  tripDetailState.itemEditorDraft = {
    title: String(formData.get("title") || "").trim(),
    itemType: String(formData.get("itemType") || "").trim(),
    status: String(formData.get("status") || "").trim(),
    baseId: String(formData.get("baseId") || "").trim(),
    dayId: String(formData.get("dayId") || "").trim(),
    isAnchor: formData.get("isAnchor") === "on",
    timeStart: String(formData.get("timeStart") || "").trim(),
    timeEnd: String(formData.get("timeEnd") || "").trim(),
    mealSlot: String(formData.get("mealSlot") || "").trim(),
    activityType: String(formData.get("activityType") || "").trim(),
    transportMode: String(formData.get("transportMode") || "").trim(),
    transportOrigin: String(formData.get("transportOrigin") || "").trim(),
    transportDestination: String(formData.get("transportDestination") || "").trim(),
    costLow: String(formData.get("costLow") || "").trim(),
    costHigh: String(formData.get("costHigh") || "").trim(),
    url: String(formData.get("url") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
  };
}

function serializeItemEditorDraft(draft) {
  return JSON.stringify(draft);
}

function getCurrentItemEditorDraft({ item, isAddMode, context }) {
  if (isAddMode) {
    if (!tripDetailState.itemEditorDraft || tripDetailState.persistedEditorItemId !== "add") {
      tripDetailState.persistedEditorItemId = "add";
      tripDetailState.itemEditorDraft = buildAddItemEditorDraft(context);
    }

    return tripDetailState.itemEditorDraft;
  }

  if (item && tripDetailState.persistedEditorItemId !== item.id) {
    tripDetailState.persistedEditorItemId = item.id;
    tripDetailState.itemEditorDraft = buildItemEditorDraft(item);
    tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
  }

  return tripDetailState.itemEditorDraft || buildItemEditorDraft(item);
}

function buildItemEditorDraft(item) {
  return {
    title: item.title || "",
    itemType: item.item_type || "",
    status: item.status || "",
    baseId: item.base_id || "",
    dayId: item.day_id || "",
    isAnchor: Boolean(item.is_anchor),
    timeStart: item.time_start || "",
    timeEnd: item.time_end || "",
    mealSlot: item.meal_slot || "",
    activityType: item.activity_type || "",
    transportMode: item.transport_mode || "",
    transportOrigin: item.transport_origin || "",
    transportDestination: item.transport_destination || "",
    costLow: item.cost_low == null ? "" : String(item.cost_low),
    costHigh: item.cost_high == null ? "" : String(item.cost_high),
    url: item.url || "",
    notes: item.notes || "",
  };
}

function buildAddItemEditorDraft(context = null) {
  return {
    title: "",
    itemType: "",
    status: "idea",
    baseId: context?.baseId || "",
    dayId: context?.dayId || "",
    isAnchor: false,
    timeStart: "",
    timeEnd: "",
    mealSlot: "",
    activityType: "",
    transportMode: "",
    transportOrigin: "",
    transportDestination: "",
    costLow: "",
    costHigh: "",
    url: "",
    notes: "",
  };
}

function getAddItemModalTitle(context, bases) {
  if (context?.baseId) {
    const base = bases.find((entry) => entry.id === context.baseId);
    return `Add to ${base?.name || "base"}`;
  }

  return "Add to trip";
}

function getItemEditorAssignmentHint(baseId, dayId, bases, days) {
  if (!baseId || !dayId) {
    return "";
  }

  const selectedDay = days.find((day) => day.id === dayId);
  if (!selectedDay || selectedDay.base_id === baseId) {
    return "";
  }

  const dayBase = bases.find((base) => base.id === selectedDay.base_id);
  if (!dayBase) {
    return "";
  }

  return `Day ${selectedDay.day_number} is in ${dayBase.name || "that base"} — update base to match?`;
}

function wireAnchorCheckbox() {
  const visualBox = document.querySelector(".anchor-checkbox");
  const input = document.querySelector(".anchor-checkbox-input");
  const label = document.querySelector(".anchor-checkbox-label");
  const startTimeInput = document.querySelector('[name="timeStart"]');

  if (!visualBox || !input) {
    return;
  }

  const sync = () => {
    const hasStartTime = Boolean(String(startTimeInput?.value || "").trim());
    input.disabled = !hasStartTime;

    if (!hasStartTime) {
      input.checked = false;
    }

    label?.classList.toggle("is-disabled", !hasStartTime);
    label?.setAttribute("title", hasStartTime ? "" : "Set a start time to mark as anchor");
    visualBox.setAttribute("aria-checked", input.checked ? "true" : "false");
    visualBox.setAttribute("aria-disabled", hasStartTime ? "false" : "true");
    visualBox.setAttribute("tabindex", hasStartTime ? "0" : "-1");
    visualBox.innerHTML = input.checked ? '<i data-lucide="check" aria-hidden="true"></i>' : "";
    window.lucide?.createIcons?.();
  };

  const toggle = () => {
    if (input.disabled) {
      return;
    }

    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
  };

  label?.addEventListener("click", (event) => {
    if (event.target === input) {
      sync();
      return;
    }

    event.preventDefault();
    toggle();
  });

  visualBox.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle();
    }
  });

  startTimeInput?.addEventListener("input", sync);
  startTimeInput?.addEventListener("change", sync);
  sync();
}

function getNearestUpcomingHour() {
  const now = new Date();
  now.setMinutes(now.getMinutes() === 0 ? 0 : 60, 0, 0);
  return `${String(now.getHours()).padStart(2, "0")}:00`;
}

function parseEditableTimeToStorage(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  const twentyFourHourMatch = normalizedValue.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHourMatch) {
    return `${String(Number(twentyFourHourMatch[1])).padStart(2, "0")}:${twentyFourHourMatch[2]}`;
  }

  const twelveHourMatch = normalizedValue.match(/^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m?\.?$/i);
  if (!twelveHourMatch) {
    return null;
  }

  let hour = Number(twelveHourMatch[1]);
  const minute = twelveHourMatch[2] || "00";
  const meridiem = twelveHourMatch[3].toLowerCase();

  if (hour < 1 || hour > 12) {
    return null;
  }

  if (meridiem === "p" && hour !== 12) {
    hour += 12;
  }

  if (meridiem === "a" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function normalizeTimeInput(value) {
  return parseEditableTimeToStorage(value);
}

function syncTimeWarning() {
  const startInput = document.querySelector('[name="timeStart"]');
  const endInput = document.querySelector('[name="timeEnd"]');
  const warning = document.querySelector("#item-editor-time-warning");

  if (!startInput || !endInput || !warning) {
    return;
  }

  const startTime = normalizeTimeInput(startInput.value);
  const endTime = normalizeTimeInput(endInput.value);
  const shouldWarn = Boolean(startTime && endTime && endTime <= startTime);

  warning.classList.toggle("is-hidden", !shouldWarn);
}

function wireTimeInputs() {
  const isMobile = window.matchMedia?.("(max-width: 767px)")?.matches;
  const defaultTime = getNearestUpcomingHour();

  document.querySelectorAll('[name="timeStart"], [name="timeEnd"]').forEach((input) => {
    input.step = "900";

    if (isMobile) {
      input.addEventListener("focus", () => {
        if (!input.value && input.getAttribute("data-defaulted-empty-time") !== "true") {
          input.value = defaultTime;
          input.setAttribute("data-defaulted-empty-time", "true");
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    }

    input.addEventListener("input", syncTimeWarning);
    input.addEventListener("change", syncTimeWarning);
  });

  syncTimeWarning();
}

function keepEditing() {
  tripDetailState.pendingDiscardAction = null;
  appStore.updateTripDetail({
    showDiscardConfirm: false,
  });
  rerenderTripDetail();
}

function wireDiscardConfirmModal() {
  document.querySelector("#keep-editing-button")?.addEventListener("click", keepEditing);
  document.querySelector("[data-keep-editing]")?.addEventListener("click", keepEditing);
  document.querySelector("#discard-changes-button")?.addEventListener("click", () => {
    const action = tripDetailState.pendingDiscardAction;
    tripDetailState.pendingDiscardAction = null;

    if (action) {
      action();
      return;
    }

    appStore.updateTripDetail({
      showDiscardConfirm: false,
    });
    rerenderTripDetail();
  });
}

export function closeDeleteItemConfirm() {
  appStore.updateTripDetail({
    showDeleteItemConfirm: false,
    isDeletingItem: false,
    deletingItemId: null,
  });
  rerenderTripDetail();
}

export function createItemEditorHandlers() {
  return {
    onEditItem: (itemId) => {
      if (!itemId) {
        return;
      }

      requestCloseItemEditor(() => {
        const nextItem = tripStore.getCurrentItems().find((entry) => entry.id === itemId) || null;

        appStore.updateTripDetail({
          editingItemId: itemId,
          itemEditorMode: "edit",
          itemEditorContext: null,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = itemId;
        tripDetailState.itemEditorDraft = nextItem ? buildItemEditorDraft(nextItem) : null;
        tripDetailState.itemEditorInitialSnapshot = tripDetailState.itemEditorDraft
          ? serializeItemEditorDraft(tripDetailState.itemEditorDraft)
          : "";
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
      });
    },
    onCloseItemEditor: closeItemEditor,
    onAfterItemEditorOpen: () => {
      wireAnchorCheckbox();
      wireTimeInputs();
      syncItemEditorTypeFields();
      syncItemEditorAssignmentHint();
      ensureItemEditorInitialSnapshot();
      wireDiscardConfirmModal();
    },
    onAddItemToBase: (baseId) => {
      if (!baseId) {
        return;
      }

      requestCloseItemEditor(() => {
        const context = { baseId, dayId: "" };
        appStore.updateTripDetail({
          editingItemId: null,
          itemEditorMode: "add",
          itemEditorContext: context,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = null;
        tripDetailState.itemEditorDraft = buildAddItemEditorDraft(context);
        tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
      });
    },
    onAddItemToTrip: () => {
      requestCloseItemEditor(() => {
        const context = { baseId: "", dayId: "" };
        appStore.updateTripDetail({
          editingItemId: null,
          itemEditorMode: "add",
          itemEditorContext: context,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = null;
        tripDetailState.itemEditorDraft = buildAddItemEditorDraft(context);
        tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
      });
    },
    onItemEditorTypeChange: syncItemEditorTypeFields,
    onItemEditorAssignmentChange: syncItemEditorAssignmentHint,
    onItemEditorDraftChange: syncItemEditorDraftFromForm,
    onItemEditorSubmit: async (event) => {
      event.preventDefault();

      const { editingItemId: currentItemId, itemEditorMode } = appStore.getState().tripDetail;

      const items = tripStore.getCurrentItems();
      const currentItem = items.find((item) => item.id === currentItemId);

      const form = event.currentTarget;
      const formData = new FormData(form);
      const nextBaseId = normalizeNullableId(formData.get("baseId"));
      const nextDayId = normalizeNullableId(formData.get("dayId"));
      const isAnchor = formData.get("isAnchor") === "on";
      const timeStart = normalizeTimeInput(formData.get("timeStart"));
      const timeEnd = normalizeTimeInput(formData.get("timeEnd"));

      if (timeStart === null || timeEnd === null) {
        showToast("Use a valid time.", "error");
        return;
      }

      const itemPayload = {
        title: String(formData.get("title") || "").trim(),
        item_type: String(formData.get("itemType") || "").trim(),
        status: String(formData.get("status") || "").trim(),
        is_anchor: isAnchor,
        base_id: nextBaseId,
        day_id: nextDayId,
        meal_slot: String(formData.get("mealSlot") || "").trim() || null,
        activity_type: String(formData.get("activityType") || "").trim() || null,
        transport_mode: String(formData.get("transportMode") || "").trim() || null,
        transport_origin: String(formData.get("transportOrigin") || "").trim() || null,
        transport_destination: String(formData.get("transportDestination") || "").trim() || null,
        time_start: timeStart || null,
        time_end: timeEnd || null,
        cost_low: String(formData.get("costLow") || "").trim() || null,
        cost_high: String(formData.get("costHigh") || "").trim() || null,
        url: String(formData.get("url") || "").trim() || null,
        notes: String(formData.get("notes") || "").trim() || null,
      };

      if (itemEditorMode === "add") {
        const trip = tripStore.getCurrentTrip();
        const { session } = sessionStore.getState();

        if (!trip?.id || !session?.user?.id || !itemPayload.title || !itemPayload.item_type) {
          showToast("Add a title and type first.", "error");
          return;
        }

        appStore.updateTripDetail({
          isSavingItem: true,
        });
        rerenderTripDetail();

        try {
          const savedItem = await createDetailedTripItem({
            tripId: trip.id,
            createdBy: session.user.id,
            title: itemPayload.title,
            itemType: itemPayload.item_type,
            status: itemPayload.status,
            isAnchor: itemPayload.is_anchor,
            baseId: itemPayload.base_id,
            dayId: itemPayload.day_id,
            mealSlot: itemPayload.meal_slot,
            activityType: itemPayload.activity_type,
            transportMode: itemPayload.transport_mode,
            transportOrigin: itemPayload.transport_origin,
            transportDestination: itemPayload.transport_destination,
            timeStart: itemPayload.time_start,
            timeEnd: itemPayload.time_end,
            costLow: itemPayload.cost_low,
            costHigh: itemPayload.cost_high,
            url: itemPayload.url,
            notes: itemPayload.notes,
            sortOrder: items.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), -1) + 1,
          });

          tripStore.appendCurrentItem(savedItem);
          appStore.updateTripDetail({
            isSavingItem: false,
            editingItemId: null,
            itemEditorMode: "edit",
            itemEditorContext: null,
            showDiscardConfirm: false,
          });
          tripDetailState.itemEditorInitialSnapshot = "";
          tripDetailState.itemEditorDraft = null;
          tripDetailState.pendingDiscardAction = null;
          rerenderTripDetail();
          showToast("Stop added.", "success");
        } catch (error) {
          console.error(error);
          appStore.updateTripDetail({
            isSavingItem: false,
          });
          rerenderTripDetail();
          showToast(getTripItemErrorMessage("create"), "error");
        }
        return;
      }

      if (!currentItem) {
        return;
      }

      const nextItem = buildUpdatedItem(currentItem, {
        ...itemPayload,
      });
      const updatedItems = buildItemSaveBatch(currentItem, nextItem, items);

      appStore.updateTripDetail({
        isSavingItem: true,
      });
      rerenderTripDetail();

      try {
        await batchUpdateTripItems(updatedItems).then((savedItems) => {
          tripStore.mergeCurrentItems(savedItems);
          return savedItems;
        });
        appStore.updateTripDetail({
          isSavingItem: false,
          editingItemId: null,
          itemEditorMode: "edit",
          itemEditorContext: null,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = null;
        tripDetailState.itemEditorInitialSnapshot = "";
        tripDetailState.itemEditorDraft = null;
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
        showToast("Stop updated.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isSavingItem: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("update"), "error");
      }
    },
    onCancelDeleteItem: closeDeleteItemConfirm,
    onConfirmDeleteItem: async () => {
      const trip = tripStore.getCurrentTrip();
      const items = tripStore.getCurrentItems();
      const { deletingItemId } = appStore.getState().tripDetail;
      const deletedItem = items.find((entry) => entry.id === deletingItemId) || null;

      if (!trip?.id || !deletingItemId) {
        return;
      }

      appStore.updateTripDetail({
        isDeletingItem: true,
      });
      rerenderTripDetail();

      try {
        await softDeleteTripItem(deletingItemId);
        tripStore.removeCurrentItem(deletingItemId);
        appStore.updateTripDetail({
          isDeletingItem: false,
          showDeleteItemConfirm: false,
          deletingItemId: null,
          editingItemId: null,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = null;
        tripDetailState.itemEditorDraft = null;
        tripDetailState.itemEditorInitialSnapshot = "";
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
        showToast(`${deletedItem?.title || "Stop"} deleted`, "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isDeletingItem: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("delete"), "error");
      }
    },
  };
}
