import { formatDayDateLabel } from "../../../lib/format.js";
import { escapeHtml } from "./trip-detail-ui.js";

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
