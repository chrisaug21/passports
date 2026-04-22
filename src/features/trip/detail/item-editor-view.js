import { formatItemTypeLabel, formatStatusLabel } from "../../../lib/format.js";
import {
  ACTIVITY_TYPES,
  ITEM_STATUSES,
  ITEM_TYPES,
  MEAL_SLOTS,
  TRANSPORT_MODES,
} from "../../../config/constants.js";
import { escapeHtml } from "./trip-detail-ui.js";
import { getCurrentItemEditorDraft, getAddItemModalTitle } from "./item-editor-draft.js";
import { parseEditableTimeToStorage } from "./item-editor-time.js";
import { getItemEditorAssignmentHint } from "./item-editor-dom.js";

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
