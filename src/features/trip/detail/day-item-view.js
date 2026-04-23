import { tripStore } from "../../../state/trip-store.js";
import { formatTimeLabel } from "../../../lib/format.js";
import {
  escapeHtml,
  renderAnchorIndicator,
  renderItemStatusMeta,
  renderItemSubtypeLine,
  renderItemTypeIcon,
} from "./trip-detail-ui.js";

export function renderDayItem(item, options = {}) {
  const {
    dayId = "",
    canMoveUp = false,
    canMoveDown = false,
  } = options;
  const detailParts = [
    item.time_start ? escapeHtml(formatTimeLabel(item.time_start)) : "",
  ].filter(Boolean);

  return `
    <article class="day-item" data-day-item-id="${escapeHtml(item.id)}" data-day-id="${escapeHtml(item.day_id || "")}">
      <div class="day-item__body">
        <div class="day-item__header">
          <div class="day-item__title-line">
            ${item.is_anchor ? renderAnchorIndicator() : ""}
            ${renderItemTypeIcon(item)}
            <h5 title="${escapeHtml(item.title || "Untitled stop")}">${escapeHtml(item.title || "Untitled stop")}</h5>
          </div>
          <div class="day-item__header-actions">
            ${renderItemActionsMenu(item)}
            ${
              !item.is_anchor && dayId
                ? `
                  <div class="day-item__reorder-controls" aria-label="Reorder stop">
                    <button
                      class="day-item__reorder-button"
                      data-reorder-item-up="${escapeHtml(item.id)}"
                      data-reorder-day-id="${escapeHtml(dayId)}"
                      type="button"
                      aria-label="Move stop up"
                      ${canMoveUp ? "" : "disabled"}
                    >
                      <i data-lucide="chevron-up"></i>
                    </button>
                    <button
                      class="day-item__reorder-button"
                      data-reorder-item-down="${escapeHtml(item.id)}"
                      data-reorder-day-id="${escapeHtml(dayId)}"
                      type="button"
                      aria-label="Move stop down"
                      ${canMoveDown ? "" : "disabled"}
                    >
                      <i data-lucide="chevron-down"></i>
                    </button>
                  </div>
                `
                : ""
            }
          </div>
        </div>
        ${renderItemStatusMeta(item.status)}
        ${renderItemSubtypeLine(item)}
        ${renderItemBaseLine(item)}
        ${detailParts.length > 0 ? `<p class="day-item__details">${detailParts.join(" · ")}</p>` : ""}
      </div>
    </article>
  `;
}

export function renderItemBaseLine(item) {
  if (item.day_id || !item.base_id) {
    return "";
  }

  const base = tripStore.getCurrentBases().find((entry) => entry.id === item.base_id);
  if (!base?.name) {
    return "";
  }

  return `<p class="muted day-item__base">${escapeHtml(base.name)}</p>`;
}

export function renderItemActionsMenu(item, options = {}) {
  return `
    <details class="item-actions-menu">
      <summary class="item-actions-menu__trigger" aria-label="Open stop actions">⋮</summary>
      <div class="item-actions-menu__panel">
        <button class="item-actions-menu__item" data-edit-item="${escapeHtml(item.id)}" type="button">Edit</button>
        <button class="item-actions-menu__item" data-open-move-item="${escapeHtml(item.id)}" type="button">Move</button>
        ${options.includeRemove ? `<button class="item-actions-menu__item item-actions-menu__item--danger" data-request-delete-item="${escapeHtml(item.id)}" type="button">Remove from trip</button>` : ""}
      </div>
    </details>
  `;
}
