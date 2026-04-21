import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { sessionStore } from "../../../state/session-store.js";
import {
  batchUpdateTripItems,
  createTripItem,
} from "../../../services/trips-service.js";
import {
  formatCostLabel,
  formatItemTypeLabel,
  formatStatusLabel,
  formatTimeLabel,
} from "../../../lib/format.js";
import { showToast } from "../../shared/toast.js";
import {
  ACTIVITY_TYPES,
  ITEM_STATUSES,
  ITEM_TYPES,
  MEAL_SLOTS,
  TRANSPORT_MODES,
} from "../../../config/constants.js";
import {
  tripDetailState,
  rerenderTripDetail,
} from "./trip-detail-state.js";
import {
  escapeHtml,
  getDisplayTitleForToast,
  renderAnchorIndicator,
  renderItemStatusMeta,
  renderItemSubtypeLine,
  renderItemTypeIcon,
} from "./trip-detail-ui.js";
import { normalizeNullableId } from "./base-allocation-controller.js";

const MASTER_LIST_COLUMN_LABELS = {
  type: "Type",
  title: "Name",
  status: "Status",
  base: "Base",
  day: "Day",
  subtype: "Subtype",
};

const MASTER_LIST_SORT_KEYS = ["type", "title", "status", "base", "day", "subtype"];

export function renderMasterListRow(item, days, bases) {
  const day = days.find((entry) => entry.id === item.day_id);
  const base = bases.find((entry) => entry.id === item.base_id);
  const metaParts = [
    base ? escapeHtml(base.name || "") : "",
    day ? `Day ${day.day_number}` : "Not yet placed",
  ].filter(Boolean);
  const detailParts = [
    item.item_type === "meal" && item.meal_slot ? escapeHtml(formatItemTypeLabel(item.meal_slot)) : "",
    item.item_type === "activity" && item.activity_type ? escapeHtml(formatItemTypeLabel(item.activity_type)) : "",
    item.item_type === "transport" && item.transport_mode ? escapeHtml(formatItemTypeLabel(item.transport_mode)) : "",
    item.item_type === "transport" && (item.transport_origin || item.transport_destination)
      ? [item.transport_origin, item.transport_destination].filter(Boolean).map((value) => escapeHtml(value)).join(" → ")
      : "",
    item.time_start ? escapeHtml(formatTimeLabel(item.time_start)) : "",
    item.time_end ? escapeHtml(`to ${formatTimeLabel(item.time_end, false)}`) : "",
    escapeHtml(formatCostLabel(item.cost_low, item.cost_high)),
  ].filter(Boolean);

  return `
    <article class="master-list-row">
      <div class="master-list-row__main">
        <div class="master-list-row__title-line">
          ${renderItemTypeIcon(item, "master-list-row__type-icon")}
          ${item.is_anchor ? renderAnchorIndicator() : ""}
          <h4 title="${escapeHtml(item.title || "Untitled stop")}">${escapeHtml(item.title || "Untitled stop")}</h4>
        </div>
        ${renderItemStatusMeta(item.status)}
        <p class="muted master-list-row__meta">${metaParts.join(" · ")}</p>
        ${detailParts.length > 0 ? `<p class="master-list-row__details">${detailParts.join(" · ")}</p>` : ""}
      </div>
      ${renderItemActionsMenu(item)}
    </article>
  `;
}

export function renderMasterListPlanningTable({ items, days, bases, tripDetail }) {
  const filters = tripDetail.masterListFilters || {};
  const sort = tripDetail.masterListSort || { key: "default", direction: "asc" };
  const filteredItems = getFilteredMasterListItems(items, filters);
  const sortedItems = getSortedMasterListItems(filteredItems, days, bases, sort);
  const hasActiveFilters = isMasterListFiltered(filters);

  return `
    <div class="master-list-filter-bar">
      ${renderMasterListFilterSelect("type", "Type", filters.type || "all", [
        ["all", "All"],
        ...ITEM_TYPES.map((type) => [type, formatItemTypeLabel(type)]),
      ])}
      ${renderMasterListFilterSelect("status", "Status", filters.status || "all", [
        ["all", "All"],
        ...ITEM_STATUSES.map((status) => [status, formatStatusLabel(status)]),
      ])}
      ${renderMasterListFilterSelect("baseId", "Base", filters.baseId || "all", [
        ["all", "All"],
        ...bases.map((base) => [base.id, base.name || "Untitled base"]),
        ["unassigned", "Unassigned"],
      ])}
      ${hasActiveFilters ? `<button class="button-link master-list-filter-bar__clear" data-clear-master-list-filters type="button">Clear</button>` : ""}
      <button class="button button--secondary master-list-filter-bar__mobile" data-open-master-list-filters type="button">Filters</button>
    </div>

    ${tripDetail.isShowingMasterListFilters ? renderMobileFilterSheet(filters, bases) : ""}
    ${renderMasterListQuickAdd(tripDetail)}

    ${
      sortedItems.length === 0
        ? `
          <div class="master-list-empty">
            <h4>No stops match those filters</h4>
            <p class="muted">Clear filters or add a new idea to keep planning.</p>
          </div>
        `
        : `
          <div class="master-list-table" role="table" aria-label="Planning list">
            <div class="master-list-table__header" role="row">
              ${renderMasterListHeaderCell("type", sort)}
              ${renderMasterListHeaderCell("title", sort)}
              ${renderMasterListHeaderCell("status", sort)}
              ${renderMasterListHeaderCell("base", sort)}
              ${renderMasterListHeaderCell("day", sort)}
              ${renderMasterListHeaderCell("subtype", sort)}
              <span class="master-list-table__header-cell master-list-table__header-cell--actions"></span>
            </div>
            <div class="master-list-table__body">
              ${sortedItems.map((item) => renderMasterListPlanningRow(item, days, bases, tripDetail)).join("")}
            </div>
          </div>
        `
    }
  `;
}

function renderMasterListQuickAdd(tripDetail) {
  return `
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
        ${tripDetail.isCreatingItem ? "Saving..." : "Add"}
      </button>
    </form>
  `;
}

export function renderUnassignedQuickAdd(tripDetail) {
  return renderMasterListQuickAdd(tripDetail);
}

function renderMobileFilterSheet(filters, bases) {
  return `
    <div class="master-list-filter-sheet" role="dialog" aria-modal="true" aria-label="List filters">
      <button class="master-list-filter-sheet__backdrop" data-close-master-list-filters type="button" aria-label="Close filters"></button>
      <div class="master-list-filter-sheet__panel">
        <div class="master-list-filter-sheet__header">
          <h3>Filters</h3>
          <button class="icon-button" data-close-master-list-filters type="button" aria-label="Close filters">×</button>
        </div>
        <div class="master-list-filter-sheet__controls">
          ${renderMasterListFilterSelect("type", "Type", filters.type || "all", [
            ["all", "All"],
            ...ITEM_TYPES.map((type) => [type, formatItemTypeLabel(type)]),
          ])}
          ${renderMasterListFilterSelect("status", "Status", filters.status || "all", [
            ["all", "All"],
            ...ITEM_STATUSES.map((status) => [status, formatStatusLabel(status)]),
          ])}
          ${renderMasterListFilterSelect("baseId", "Base", filters.baseId || "all", [
            ["all", "All"],
            ...bases.map((base) => [base.id, base.name || "Untitled base"]),
            ["unassigned", "Unassigned"],
          ])}
        </div>
      </div>
    </div>
  `;
}

function renderMasterListFilterSelect(name, label, value, options) {
  return `
    <label class="field master-list-filter">
      <span>${escapeHtml(label)}</span>
      <select data-master-list-filter="${escapeHtml(name)}">
        ${options.map(([optionValue, optionLabel]) => (
          `<option value="${escapeHtml(optionValue)}" ${value === optionValue ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`
        )).join("")}
      </select>
    </label>
  `;
}

function renderMasterListHeaderCell(key, sort) {
  const isActive = sort.key === key;
  const chevron = isActive ? (sort.direction === "desc" ? "↓" : "↑") : "";
  const label = key === "type" ? "" : MASTER_LIST_COLUMN_LABELS[key];

  return `
    <button class="master-list-table__header-cell master-list-table__header-cell--${escapeHtml(key)} ${isActive ? "is-active" : ""}" data-master-list-sort="${escapeHtml(key)}" type="button">
      <span>${escapeHtml(label)}</span>
      ${chevron ? `<span aria-hidden="true">${chevron}</span>` : ""}
    </button>
  `;
}

function renderMasterListPlanningRow(item, days, bases, tripDetail) {
  const day = days.find((entry) => entry.id === item.day_id);
  const isEditingTitle = isEditingMasterListCell(tripDetail, item.id, "title");
  const isEditingStatus = isEditingMasterListCell(tripDetail, item.id, "status");
  const isEditingBase = isEditingMasterListCell(tripDetail, item.id, "base");
  const isEditingDay = isEditingMasterListCell(tripDetail, item.id, "day");
  const isEditingSubtype = isEditingMasterListCell(tripDetail, item.id, "subtype");

  return `
    <article class="master-list-plan-row" data-master-list-row="${escapeHtml(item.id)}" role="row">
      <button class="master-list-plan-row__cell master-list-plan-row__cell--icon" data-edit-item="${escapeHtml(item.id)}" type="button" aria-label="Edit ${escapeHtml(item.title || "stop")}">
        ${renderItemTypeIcon(item, "master-list-plan-row__type-icon")}
      </button>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--title">
        ${
          isEditingTitle
            ? `<input class="master-list-inline-input" data-master-list-title-input="${escapeHtml(item.id)}" type="text" maxlength="120" value="${escapeHtml(item.title || "")}" />`
            : `<button class="master-list-inline-trigger master-list-inline-trigger--title" data-master-list-edit-cell="title" data-master-list-item-id="${escapeHtml(item.id)}" type="button" title="${escapeHtml(item.title || "Untitled stop")}">${escapeHtml(item.title || "Untitled stop")}</button>`
        }
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--status">
        ${isEditingStatus ? renderStatusSelect(item) : renderInlineTrigger(item, "status", `${renderStatusDot(item.status)}<span>${escapeHtml(formatStatusLabel(item.status || "idea"))}</span>`)}
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--base">
        ${isEditingBase ? renderBaseSelect(item, bases) : renderInlineTrigger(item, "base", escapeHtml(getBaseLabel(item, bases)))}
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--day">
        ${isEditingDay ? renderDaySelect(item, days) : renderInlineTrigger(item, "day", escapeHtml(day ? `Day ${day.day_number}` : "Unassigned"))}
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--subtype">
        ${isEditingSubtype ? renderSubtypeSelect(item) : renderInlineTrigger(item, "subtype", escapeHtml(getSubtypeLabel(item)))}
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--actions">
        ${renderItemActionsMenu(item)}
      </div>
      <button class="master-list-mobile-row" data-edit-item="${escapeHtml(item.id)}" type="button">
        ${renderItemTypeIcon(item, "master-list-mobile-row__type-icon")}
        <span class="master-list-mobile-row__title">${escapeHtml(item.title || "Untitled stop")}</span>
        ${renderStatusDot(item.status)}
        <span class="master-list-mobile-row__day">${escapeHtml(day ? `Day ${day.day_number}` : "")}</span>
      </button>
    </article>
  `;
}

function isEditingMasterListCell(tripDetail, itemId, field) {
  const cell = tripDetail.masterListEditingCell;
  return cell?.itemId === itemId && cell?.field === field;
}

function renderInlineTrigger(item, field, content) {
  return `<button class="master-list-inline-trigger" data-master-list-edit-cell="${escapeHtml(field)}" data-master-list-item-id="${escapeHtml(item.id)}" type="button">${content || "&nbsp;"}</button>`;
}

function renderStatusDot(status) {
  const safeStatus = escapeHtml(status || "idea");
  return `<span class="status-dot status-dot--${safeStatus}" aria-hidden="true"></span>`;
}

function renderStatusSelect(item) {
  return `
    <select class="master-list-inline-select" data-master-list-inline-save="${escapeHtml(item.id)}" data-master-list-field="status">
      ${ITEM_STATUSES.map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>`).join("")}
    </select>
  `;
}

function renderBaseSelect(item, bases) {
  return `
    <select class="master-list-inline-select" data-master-list-inline-save="${escapeHtml(item.id)}" data-master-list-field="base">
      <option value="">Unassigned</option>
      ${bases.map((base) => `<option value="${escapeHtml(base.id)}" ${item.base_id === base.id ? "selected" : ""}>${escapeHtml(base.name || "Untitled base")}</option>`).join("")}
    </select>
  `;
}

function renderDaySelect(item, days) {
  const filteredDays = item.base_id ? days.filter((day) => day.base_id === item.base_id) : days;

  return `
    <select class="master-list-inline-select" data-master-list-inline-save="${escapeHtml(item.id)}" data-master-list-field="day">
      <option value="">Unassigned</option>
      ${filteredDays.map((day) => `<option value="${escapeHtml(day.id)}" ${item.day_id === day.id ? "selected" : ""}>Day ${day.day_number}</option>`).join("")}
    </select>
  `;
}

function renderSubtypeSelect(item) {
  const options = getSubtypeOptions(item.item_type);

  if (options.length === 0) {
    return `<span class="master-list-inline-empty"></span>`;
  }

  return `
    <select class="master-list-inline-select" data-master-list-inline-save="${escapeHtml(item.id)}" data-master-list-field="subtype">
      <option value="">None</option>
      ${options.map((value) => `<option value="${value}" ${getSubtypeValue(item) === value ? "selected" : ""}>${formatItemTypeLabel(value)}</option>`).join("")}
    </select>
  `;
}

function getSubtypeOptions(itemType) {
  if (itemType === "meal") {
    return MEAL_SLOTS;
  }
  if (itemType === "activity") {
    return ACTIVITY_TYPES;
  }
  if (itemType === "transport") {
    return TRANSPORT_MODES;
  }
  return [];
}

function getSubtypeValue(item) {
  if (item.item_type === "meal") {
    return item.meal_slot || "";
  }
  if (item.item_type === "activity") {
    return item.activity_type || "";
  }
  if (item.item_type === "transport") {
    return item.transport_mode || "";
  }
  return "";
}

function getSubtypeLabel(item) {
  return getSubtypeValue(item) ? formatItemTypeLabel(getSubtypeValue(item)) : "";
}

function getBaseLabel(item, bases) {
  const base = bases.find((entry) => entry.id === item.base_id);
  return base ? base.name || "Untitled base" : "Unassigned";
}

function getFilteredMasterListItems(items, filters) {
  return items.filter((item) => {
    const typeMatches = !filters.type || filters.type === "all" || item.item_type === filters.type;
    const statusMatches = !filters.status || filters.status === "all" || item.status === filters.status;
    const baseMatches = !filters.baseId
      || filters.baseId === "all"
      || (filters.baseId === "unassigned" ? !item.base_id : item.base_id === filters.baseId);

    return typeMatches && statusMatches && baseMatches;
  });
}

function getSortedMasterListItems(items, days, bases, sort) {
  const direction = sort.direction === "desc" ? -1 : 1;
  const sortedItems = [...items];

  if (MASTER_LIST_SORT_KEYS.includes(sort.key)) {
    sortedItems.sort((left, right) => direction * compareMasterListValue(left, right, sort.key, days, bases));
    return sortedItems;
  }

  sortedItems.sort((left, right) => compareDefaultMasterListOrder(left, right, days, bases));
  return sortedItems;
}

function compareMasterListValue(left, right, key, days, bases) {
  const leftValue = getMasterListSortValue(left, key, days, bases);
  const rightValue = getMasterListSortValue(right, key, days, bases);

  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true })
    || compareDefaultMasterListOrder(left, right, days, bases);
}

function getMasterListSortValue(item, key, days, bases) {
  const day = days.find((entry) => entry.id === item.day_id);

  if (key === "type") {
    return item.item_type || "";
  }
  if (key === "title") {
    return item.title || "";
  }
  if (key === "status") {
    return item.status || "";
  }
  if (key === "base") {
    return getBaseLabel(item, bases);
  }
  if (key === "day") {
    return day ? day.day_number : Number.MAX_SAFE_INTEGER;
  }
  if (key === "subtype") {
    return getSubtypeLabel(item);
  }
  return "";
}

function compareDefaultMasterListOrder(left, right, days, bases) {
  const leftBaseIndex = getBaseSortIndex(left, bases);
  const rightBaseIndex = getBaseSortIndex(right, bases);
  const leftDayIndex = getDaySortIndex(left, days);
  const rightDayIndex = getDaySortIndex(right, days);

  return leftBaseIndex - rightBaseIndex
    || leftDayIndex - rightDayIndex
    || compareFlexItems(left, right);
}

function getBaseSortIndex(item, bases) {
  if (!item.base_id) {
    return Number.MAX_SAFE_INTEGER;
  }

  const index = bases.findIndex((base) => base.id === item.base_id);
  return index === -1 ? Number.MAX_SAFE_INTEGER - 1 : index;
}

function getDaySortIndex(item, days) {
  if (!item.day_id) {
    return Number.MAX_SAFE_INTEGER;
  }

  const day = days.find((entry) => entry.id === item.day_id);
  return day ? Number(day.day_number) || Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER - 1;
}

function isMasterListFiltered(filters = {}) {
  return ["type", "status", "baseId"].some((key) => filters[key] && filters[key] !== "all");
}

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

export function renderItemActionsMenu(item) {
  return `
    <details class="item-actions-menu">
      <summary class="item-actions-menu__trigger" aria-label="Open stop actions">⋮</summary>
      <div class="item-actions-menu__panel">
        <button class="item-actions-menu__item" data-edit-item="${escapeHtml(item.id)}" type="button">Edit</button>
        <button class="item-actions-menu__item" data-open-move-item="${escapeHtml(item.id)}" type="button">Move</button>
        <button class="item-actions-menu__item item-actions-menu__item--danger" data-request-delete-item="${escapeHtml(item.id)}" type="button">Remove from trip</button>
      </div>
    </details>
  `;
}

export function wireItemActionsMenus() {
  const menus = [...document.querySelectorAll(".item-actions-menu")];
  tripDetailState.closeOpenItemActionsMenus = (exceptionMenu = null) => {
    document.querySelectorAll(".item-actions-menu").forEach((menu) => {
      if (menu !== exceptionMenu) {
        menu.open = false;
      }
    });
  };

  menus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (menu.open) {
        const trigger = menu.querySelector(".item-actions-menu__trigger");

        if (trigger) {
          const { left, width } = trigger.getBoundingClientRect();
          const midpoint = left + (width / 2);
          menu.dataset.menuDirection = midpoint >= (window.innerWidth / 2) ? "left" : "right";
        }

        tripDetailState.closeOpenItemActionsMenus(menu);
      }
    });
  });

  if (tripDetailState.itemActionsGlobalListenersBound) {
    return;
  }

  document.addEventListener("click", (event) => {
    const menu = event.target instanceof Element ? event.target.closest(".item-actions-menu") : null;

    if (!menu) {
      tripDetailState.closeOpenItemActionsMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      tripDetailState.closeOpenItemActionsMenus();
    }
  });

  tripDetailState.itemActionsGlobalListenersBound = true;
}

function getFlexItemsForDay(items, dayId, excludedItemId = null) {
  return items
    .filter((item) => !item.is_anchor && item.day_id === dayId && item.id !== excludedItemId)
    .sort(compareFlexItems);
}

function getAnchorDestinationSortOrder(items, dayId, excludedItemId = null) {
  return items
    .filter((item) => item.day_id === dayId && item.id !== excludedItemId)
    .length;
}

export function buildItemSaveBatch(currentItem, nextItem, items) {
  const updates = [];
  const previousDayId = currentItem.day_id ?? null;
  const nextDayId = nextItem.day_id ?? null;
  const changedDay = previousDayId !== nextDayId;
  const changedAnchorState = Boolean(currentItem.is_anchor) !== Boolean(nextItem.is_anchor);
  const previousTimeStart = String(currentItem.time_start || "");
  const nextTimeStart = String(nextItem.time_start || "");
  const changedTimeStart = previousTimeStart !== nextTimeStart;
  const shouldRemoveFromSourceFlex = !currentItem.is_anchor && (changedDay || nextItem.is_anchor);

  if (shouldRemoveFromSourceFlex) {
    updates.push(...normalizeFlexItems(getFlexItemsForDay(items, previousDayId, currentItem.id)));
  }

  if (nextItem.is_anchor) {
    const nextAnchorItem = (changedDay || changedAnchorState)
      ? buildUpdatedItem(nextItem, {
          sort_order: getAnchorDestinationSortOrder(items, nextDayId, currentItem.id),
        })
      : nextItem;

    updates.push(nextAnchorItem);
    return dedupeItemsById(updates);
  }

  if (changedDay) {
    const movedFlexItem = buildUpdatedItem(nextItem, {
      time_start: null,
    });
    const destinationItems = normalizeFlexItems([
      ...getFlexItemsForDay(items, nextDayId, currentItem.id),
      movedFlexItem,
    ]);

    updates.push(...destinationItems);
    return dedupeItemsById(updates);
  }

  if (changedAnchorState) {
    if (nextItem.time_start) {
      updates.push(...insertFlexItemByTime(getFlexItemsForDay(items, nextDayId, currentItem.id), nextItem));
      return dedupeItemsById(updates);
    }

    updates.push(...normalizeFlexItems([
      ...getFlexItemsForDay(items, nextDayId, currentItem.id),
      nextItem,
    ]));
    return dedupeItemsById(updates);
  }

  if (changedTimeStart && nextItem.time_start) {
    updates.push(...insertFlexItemByTime(getFlexItemsForDay(items, nextDayId, currentItem.id), nextItem));
    return dedupeItemsById(updates);
  }

  updates.push(nextItem);
  return dedupeItemsById(updates);
}

async function persistItemBatchUpdates(updatedItems) {
  const savedItems = await batchUpdateTripItems(updatedItems);
  tripStore.mergeCurrentItems(savedItems);
  return savedItems;
}

async function persistSingleItemUpdate(item) {
  const [savedItem] = await persistItemBatchUpdates([item]);
  return savedItem;
}

function assignFlexSortOrdersFromCombinedItems(combinedItems) {
  const updatedFlexItems = [];
  let nextSortOrder = 0;
  let previousAnchorBoundary = -1;

  combinedItems.forEach((item) => {
    if (item.is_anchor) {
      const rawBoundary = Number(item.sort_order);
      const anchorBoundary = Number.isFinite(rawBoundary)
        ? Math.max(previousAnchorBoundary, rawBoundary)
        : previousAnchorBoundary;

      previousAnchorBoundary = anchorBoundary;
      nextSortOrder = Math.max(nextSortOrder, anchorBoundary + 1);
      return;
    }

    updatedFlexItems.push({
      ...item,
      sort_order: nextSortOrder,
    });
    nextSortOrder += 1;
  });

  return updatedFlexItems;
}

function moveCombinedItemByStep(items, itemId, direction) {
  const currentIndex = items.findIndex((item) => item.id === itemId);
  const targetIndex = currentIndex + direction;

  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(currentIndex, 1);
  nextItems.splice(targetIndex, 0, movedItem);
  return nextItems;
}

async function reorderFlexItemsWithinDay(dayId, movedItemId, direction) {
  const items = tripStore.getCurrentItems();
  const combinedItems = getInterleavedDayItems(items, dayId);
  const currentIndex = combinedItems.findIndex((item) => item.id === movedItemId);
  const targetIndex = currentIndex + direction;

  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= combinedItems.length) {
    return;
  }

  const reorderedCombinedItems = moveCombinedItemByStep(combinedItems, movedItemId, direction);
  const targetItem = combinedItems[targetIndex];
  const assignedFlexItems = assignFlexSortOrdersFromCombinedItems(reorderedCombinedItems);
  let reorderedItems = assignedFlexItems
    .filter((item) => {
      const currentItem = items.find((entry) => entry.id === item.id);
      return currentItem && Number(currentItem.sort_order) !== Number(item.sort_order);
    });

  if (targetItem?.is_anchor && !reorderedItems.some((item) => item.id === movedItemId)) {
    const movedItem = assignedFlexItems.find((item) => item.id === movedItemId);
    if (movedItem) {
      reorderedItems = [...reorderedItems, movedItem];
    }
  }

  if (reorderedItems.length === 0) {
    return;
  }

  await persistItemBatchUpdates(reorderedItems);
}

function getMoveDestinationLabel(destinationDayId, days) {
  if (!destinationDayId) {
    return "Unassigned";
  }

  const destinationDay = days.find((day) => day.id === destinationDayId);
  return destinationDay ? `Day ${destinationDay.day_number}` : "Unassigned";
}

async function moveItemToDestination(itemId, destinationDayId) {
  const items = tripStore.getCurrentItems();
  const item = items.find((entry) => entry.id === itemId);

  if (!item) {
    return false;
  }

  if (item.is_anchor && !String(item.time_start || "").trim()) {
    showToast("Anchor stops require a start time.", "error");
    return false;
  }

  const sourceDayId = item.day_id ?? null;
  const updates = [];

  if (!item.is_anchor) {
    if (sourceDayId !== destinationDayId) {
      updates.push(...normalizeFlexItems(getFlexItemsForDay(items, sourceDayId, item.id)));
    }

    const destinationFlexItems = normalizeFlexItems([
      ...getFlexItemsForDay(items, destinationDayId, item.id),
      buildUpdatedItem(item, {
        day_id: destinationDayId,
        base_id: item.base_id,
        time_start: null,
      }),
    ]);

    updates.push(...destinationFlexItems);
  } else {
    updates.push(buildUpdatedItem(item, {
      day_id: destinationDayId,
      base_id: item.base_id,
      sort_order: getAnchorDestinationSortOrder(items, destinationDayId, item.id),
    }));
  }

  await persistItemBatchUpdates(dedupeItemsById(updates));
  return true;
}

function compareAnchorItems(left, right) {
  const leftTime = String(left.time_start || "");
  const rightTime = String(right.time_start || "");

  return leftTime.localeCompare(rightTime) || String(left.title || "").localeCompare(String(right.title || ""));
}

function compareFlexItems(left, right) {
  return (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0)
    || String(left.created_at || "").localeCompare(String(right.created_at || ""))
    || String(left.title || "").localeCompare(String(right.title || ""));
}

export function getInterleavedDayItems(items, dayId) {
  const dayItems = items.filter((item) => item.day_id === dayId);
  const anchorItems = dayItems.filter((item) => item.is_anchor).sort(compareAnchorItems);
  const flexItems = dayItems.filter((item) => !item.is_anchor).sort(compareFlexItems);
  const combinedItems = [];
  let flexIndex = 0;
  let previousAnchorBoundary = -1;

  anchorItems.forEach((anchor) => {
    const rawBoundary = Number(anchor.sort_order);
    const anchorBoundary = Number.isFinite(rawBoundary)
      ? Math.max(previousAnchorBoundary, rawBoundary)
      : previousAnchorBoundary;

    while (flexIndex < flexItems.length && Number(flexItems[flexIndex].sort_order) <= anchorBoundary) {
      combinedItems.push(flexItems[flexIndex]);
      flexIndex += 1;
    }

    combinedItems.push(anchor);
    previousAnchorBoundary = anchorBoundary;
  });

  while (flexIndex < flexItems.length) {
    combinedItems.push(flexItems[flexIndex]);
    flexIndex += 1;
  }

  return combinedItems;
}

export function getSortedUnassignedItems(items) {
  return [...items].sort(compareFlexItems);
}

function normalizeFlexItems(items) {
  return items.map((item, index) => ({
    ...item,
    sort_order: index,
  }));
}

function insertFlexItemByTime(items, itemToInsert) {
  const orderedItems = [...items].sort(compareFlexItems);
  const timedItems = orderedItems
    .filter((item) => item.time_start)
    .sort((left, right) => String(left.time_start).localeCompare(String(right.time_start)) || compareFlexItems(left, right));

  if (!itemToInsert.time_start || timedItems.length === 0) {
    return normalizeFlexItems([...orderedItems, itemToInsert]);
  }

  const previousTimedItem = [...timedItems]
    .reverse()
    .find((item) => String(item.time_start).localeCompare(String(itemToInsert.time_start)) <= 0);
  const nextTimedItem = timedItems.find((item) => String(item.time_start).localeCompare(String(itemToInsert.time_start)) > 0);

  let insertIndex = orderedItems.length;

  if (previousTimedItem) {
    insertIndex = orderedItems.findIndex((item) => item.id === previousTimedItem.id) + 1;
  } else if (nextTimedItem) {
    insertIndex = orderedItems.findIndex((item) => item.id === nextTimedItem.id);
  }

  const nextItems = [...orderedItems];
  nextItems.splice(insertIndex, 0, itemToInsert);
  return normalizeFlexItems(nextItems);
}

export function buildUpdatedItem(currentItem, overrides) {
  return {
    ...currentItem,
    ...overrides,
  };
}

function dedupeItemsById(items) {
  const itemsById = new Map();
  items.forEach((item) => {
    itemsById.set(item.id, item);
  });
  return [...itemsById.values()];
}

export function openDeleteItemConfirm(itemId) {
  appStore.updateTripDetail({
    showDeleteItemConfirm: true,
    deletingItemId: itemId,
  });
  rerenderTripDetail();
}

export function openMoveItemModal(itemId) {
  appStore.updateTripDetail({
    showMoveItemModal: true,
    movingItemId: itemId,
    isMovingItem: false,
    movingOperationId: null,
  });
  rerenderTripDetail();
}

function closeMasterListInlineEdit() {
  appStore.updateTripDetail({
    masterListEditingCell: null,
  });
}

function updateMasterListFilters(name, value) {
  const { masterListFilters } = appStore.getState().tripDetail;
  appStore.updateTripDetail({
    masterListFilters: {
      ...(masterListFilters || {}),
      [name]: value || "all",
    },
  });
  rerenderTripDetail();
}

function updateMasterListSort(key) {
  const { masterListSort } = appStore.getState().tripDetail;
  const currentSort = masterListSort || { key: "default", direction: "asc" };
  const nextDirection = currentSort.key === key && currentSort.direction === "asc" ? "desc" : "asc";

  appStore.updateTripDetail({
    masterListSort: {
      key,
      direction: nextDirection,
    },
  });
  rerenderTripDetail();
}

async function saveMasterListField(itemId, field, value) {
  const items = tripStore.getCurrentItems();
  const days = tripStore.getCurrentDays();
  const item = items.find((entry) => entry.id === itemId);

  if (!item) {
    return;
  }

  const normalizedValue = normalizeNullableId(value);
  const overrides = {};

  if (field === "title") {
    const title = String(value || "").trim();
    if (!title) {
      showToast("Add a title first.", "error");
      return;
    }
    overrides.title = title;
  }

  if (field === "status") {
    overrides.status = String(value || "idea");
  }

  if (field === "base") {
    overrides.base_id = normalizedValue;
    if (normalizedValue) {
      const selectedDay = days.find((day) => day.id === item.day_id);
      if (selectedDay && selectedDay.base_id !== normalizedValue) {
        overrides.day_id = null;
      }
    }
  }

  if (field === "day") {
    overrides.day_id = normalizedValue;
  }

  if (field === "subtype") {
    overrides.meal_slot = item.item_type === "meal" ? normalizedValue : null;
    overrides.activity_type = item.item_type === "activity" ? normalizedValue : null;
    overrides.transport_mode = item.item_type === "transport" ? normalizedValue : null;
  }

  const nextItem = buildUpdatedItem(item, overrides);
  closeMasterListInlineEdit();

  try {
    await persistSingleItemUpdate(nextItem);
    rerenderTripDetail();
  } catch (error) {
    console.error(error);
    rerenderTripDetail();
    showToast("Something went wrong saving. Please try again.", "error");
  }
}

export function closeMoveItemModal() {
  appStore.updateTripDetail({
    showMoveItemModal: false,
    movingItemId: null,
    isMovingItem: false,
    movingOperationId: null,
  });
  rerenderTripDetail();
}

export function createItemsHandlers({ getTripItemErrorMessage }) {
  return {
    onQuickAddSubmit: async (event) => {
      event.preventDefault();

      const trip = tripStore.getCurrentTrip();
      const items = tripStore.getCurrentItems();
      const { session } = sessionStore.getState();

      if (!trip?.id || !session?.user?.id) {
        showToast("Your session expired. Sign in again.", "error");
        return;
      }

      const form = event.currentTarget;
      const formData = new FormData(form);
      const title = String(formData.get("title") || "").trim();
      const itemType = String(formData.get("itemType") || "").trim();

      if (!title || !itemType) {
        showToast("Add a title and type first.", "error");
        return;
      }

      const nextSortOrder = items.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), -1) + 1;

      appStore.updateTripDetail({
        isCreatingItem: true,
      });
      rerenderTripDetail();

      try {
        const newItem = await createTripItem({
          tripId: trip.id,
          createdBy: session.user.id,
          title,
          itemType,
          sortOrder: nextSortOrder,
        });

        tripStore.appendCurrentItem(newItem);
        appStore.updateTripDetail({
          isCreatingItem: false,
          masterListSort: {
            key: "default",
            direction: "asc",
          },
          masterListEditingCell: {
            itemId: newItem.id,
            field: "status",
          },
        });
        rerenderTripDetail();
        showToast("Stop added.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isCreatingItem: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("create"), "error");
      }
    },
    onRequestDeleteItem: (itemId) => {
      if (!itemId) {
        return;
      }
      openDeleteItemConfirm(itemId);
    },
    onMasterListFilterChange: (select) => {
      updateMasterListFilters(select.getAttribute("data-master-list-filter"), select.value);
    },
    onOpenMasterListFilters: () => {
      appStore.updateTripDetail({ isShowingMasterListFilters: true });
      rerenderTripDetail();
    },
    onCloseMasterListFilters: () => {
      appStore.updateTripDetail({ isShowingMasterListFilters: false });
      rerenderTripDetail();
    },
    onClearMasterListFilters: () => {
      appStore.updateTripDetail({
        masterListFilters: {
          type: "all",
          status: "all",
          baseId: "all",
        },
      });
      rerenderTripDetail();
    },
    onMasterListSort: (button) => {
      const key = button.getAttribute("data-master-list-sort");
      if (key) {
        updateMasterListSort(key);
      }
    },
    onMasterListEditCell: (button) => {
      const itemId = button.getAttribute("data-master-list-item-id");
      const field = button.getAttribute("data-master-list-edit-cell");

      if (!itemId || !field || window.matchMedia?.("(max-width: 767px)")?.matches) {
        return;
      }

      appStore.updateTripDetail({
        masterListEditingCell: { itemId, field },
      });
      rerenderTripDetail();
    },
    onMasterListInlineSave: (select) => {
      saveMasterListField(
        select.getAttribute("data-master-list-inline-save"),
        select.getAttribute("data-master-list-field"),
        select.value
      );
    },
    onMasterListInlineKeydown: (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMasterListInlineEdit();
        rerenderTripDetail();
      }
    },
    onMasterListTitleInputReady: (input) => {
      input.focus();
      input.select();
    },
    onMasterListTitleBlur: (event) => {
      const editingCell = appStore.getState().tripDetail.masterListEditingCell;
      if (!editingCell) {
        return;
      }

      saveMasterListField(event.currentTarget.getAttribute("data-master-list-title-input"), "title", event.currentTarget.value);
    },
    onMasterListTitleKeydown: (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      }

      if (event.key === "Escape") {
        closeMasterListInlineEdit();
        rerenderTripDetail();
      }
    },
    onOpenMoveItem: (itemId) => {
      if (!itemId) {
        return;
      }
      openMoveItemModal(itemId);
    },
    onCloseMoveItem: closeMoveItemModal,
    onMoveItemDestination: async (rawDestinationDayId) => {
      const { movingItemId } = appStore.getState().tripDetail;
      const item = tripStore.getCurrentItems().find((entry) => entry.id === movingItemId) || null;
      const destinationDayId = normalizeNullableId(rawDestinationDayId);

      if (!movingItemId || !item) {
        return;
      }

      const opId = Symbol("move-item");
      appStore.updateTripDetail({
        isMovingItem: true,
        movingOperationId: opId,
      });
      rerenderTripDetail();

      try {
        const didMove = await moveItemToDestination(movingItemId, destinationDayId);
        const currentTripDetail = appStore.getState().tripDetail;

        if (currentTripDetail.movingOperationId !== opId || currentTripDetail.movingItemId !== movingItemId) {
          return;
        }

        if (!didMove) {
          appStore.updateTripDetail({
            isMovingItem: false,
            movingOperationId: null,
          });
          rerenderTripDetail();
          return;
        }

        appStore.updateTripDetail({
          showMoveItemModal: false,
          movingItemId: null,
          isMovingItem: false,
          movingOperationId: null,
        });
        rerenderTripDetail();
        showToast(`${getDisplayTitleForToast(item.title, "Stop")} moved to ${getMoveDestinationLabel(destinationDayId, tripStore.getCurrentDays())}`, "success");
      } catch (error) {
        console.error(error);
        const currentTripDetail = appStore.getState().tripDetail;

        if (currentTripDetail.movingOperationId !== opId || currentTripDetail.movingItemId !== movingItemId) {
          return;
        }

        appStore.updateTripDetail({
          isMovingItem: false,
          movingOperationId: null,
        });
        rerenderTripDetail();
        showToast("Something went wrong saving. Please try again.", "error");
      }
    },
    onDeleteItemButton: () => {
      const { editingItemId } = appStore.getState().tripDetail;
      if (!editingItemId) {
        return;
      }
      openDeleteItemConfirm(editingItemId);
    },
    onReorderItem: async ({ itemId, dayId, direction, button }) => {
      if (!itemId || !dayId || button.disabled) {
        return;
      }

      button.disabled = true;

      try {
        await reorderFlexItemsWithinDay(dayId, itemId, direction);
        rerenderTripDetail();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        showToast("Something went wrong saving. Please try again.", "error");
      }
    },
  };
}
