import {
  formatCostLabel,
  formatItemTypeLabel,
  formatStatusLabel,
  formatTimeLabel,
} from "../../../lib/format.js";
import {
  ITEM_STATUSES,
  ITEM_TYPES,
} from "../../../config/constants.js";
import {
  escapeHtml,
  renderAnchorIndicator,
  renderItemStatusMeta,
  renderItemSubtypeLine,
  renderItemTypeIcon,
} from "./trip-detail-ui.js";
import { renderItemActionsMenu } from "./day-item-view.js";
import {
  getBaseLabel,
  getFilteredMasterListItems,
  getSortedMasterListItems,
  getSubtypeFilterOptions,
  getSubtypeLabel,
  getSubtypeOptions,
  getSubtypeValue,
  isMasterListFiltered,
} from "./master-list-state.js";

const MASTER_LIST_COLUMN_LABELS = {
  icon: "",
  title: "Name",
  status: "Status",
  base: "Base",
  day: "Day",
  itemType: "Type",
  subtype: "Subtype",
};

const MASTER_LIST_SORT_KEYS = ["title", "status", "base", "day", "itemType", "subtype"];

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
  const subtypeOptions = getSubtypeFilterOptions(filters.type || "all");
  const effectiveFilters = getEffectiveMasterListFilters(filters);
  const filteredItems = getFilteredMasterListItems(items, effectiveFilters);
  const sortedItems = getSortedMasterListItems(filteredItems, days, bases, sort);
  const hasActiveFilters = isMasterListFiltered(effectiveFilters);

  return `
    ${renderMasterListQuickAdd(tripDetail)}
    <div class="master-list-action-row">
      <div class="master-list-filter-bar">
        ${renderMasterListSearch(filters.search || "")}
        ${renderMasterListFilterSelect("type", "Type", filters.type || "all", [
          ["all", "All"],
          ...ITEM_TYPES.map((type) => [type, formatItemTypeLabel(type)]),
        ])}
        ${renderMasterListFilterSelect("subtype", "Subtype", filters.subtype || "all", subtypeOptions, {
          disabled: subtypeOptions.length <= 1,
        })}
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
      </div>
      <button class="button button--secondary section-action-button master-list-add-trip-button" data-add-item-to-trip type="button" aria-label="Add to trip">
        <i data-lucide="plus" aria-hidden="true"></i>
      </button>
    </div>

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
              <span class="master-list-table__header-cell master-list-table__header-cell--icon"></span>
              ${renderMasterListHeaderCell("title", sort)}
              ${renderMasterListHeaderCell("status", sort)}
              ${renderMasterListHeaderCell("base", sort)}
              ${renderMasterListHeaderCell("day", sort)}
              ${renderMasterListHeaderCell("itemType", sort)}
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
          placeholder="Add a restaurant, hotel, activity..."
          required
        />
      </label>
      <button class="button master-list-quick-add__submit" type="submit" ${tripDetail.isCreatingItem ? "disabled" : ""}>
        <i data-lucide="zap" aria-hidden="true"></i>
        <span class="master-list-quick-add__label-full">${tripDetail.isCreatingItem ? "Saving..." : "Quick Add"}</span>
        <span class="master-list-quick-add__label-short">${tripDetail.isCreatingItem ? "Saving..." : "Add"}</span>
      </button>
    </form>
  `;
}

function getEffectiveMasterListFilters(filters) {
  const isMobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)")?.matches;

  if (!isMobile) {
    return filters;
  }

  return {
    search: filters.search || "",
    type: "all",
    subtype: "all",
    status: "all",
    baseId: "all",
  };
}

function renderMasterListSearch(value) {
  return `
    <label class="field master-list-filter master-list-filter--search">
      <span>Search</span>
      <input
        data-master-list-filter="search"
        type="search"
        value="${escapeHtml(value)}"
        placeholder="Search..."
      />
    </label>
  `;
}

function renderMasterListFilterSelect(name, label, value, options, config = {}) {
  return `
    <label class="field master-list-filter master-list-filter--${escapeHtml(name)}">
      <span>${escapeHtml(label)}</span>
      <select data-master-list-filter="${escapeHtml(name)}" ${config.disabled ? "disabled" : ""}>
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
  const label = MASTER_LIST_COLUMN_LABELS[key] || "";

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
  const isEditingItemType = isEditingMasterListCell(tripDetail, item.id, "itemType");
  const isEditingSubtype = isEditingMasterListCell(tripDetail, item.id, "subtype");
  const itemTypeLabel = item.item_type ? formatItemTypeLabel(item.item_type) : "";

  return `
    <article class="master-list-plan-row" data-master-list-row="${escapeHtml(item.id)}" role="row">
      <button class="master-list-plan-row__cell master-list-plan-row__cell--icon" data-edit-item="${escapeHtml(item.id)}" type="button" aria-label="Edit ${escapeHtml(item.title || "stop")}">
        ${renderItemTypeIcon(item, "master-list-plan-row__type-icon")}
      </button>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--title" data-master-list-edit-cell="title" data-master-list-item-id="${escapeHtml(item.id)}">
        ${
          isEditingTitle
            ? `<input class="master-list-inline-input" data-master-list-title-input="${escapeHtml(item.id)}" type="text" maxlength="120" value="${escapeHtml(item.title || "")}" />`
            : `<button class="master-list-inline-trigger master-list-inline-trigger--title" data-master-list-edit-cell="title" data-master-list-item-id="${escapeHtml(item.id)}" type="button" title="${escapeHtml(item.title || "Untitled stop")}">${escapeHtml(item.title || "Untitled stop")}</button>`
        }
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--status" data-master-list-edit-cell="status" data-master-list-item-id="${escapeHtml(item.id)}">
        ${isEditingStatus ? renderStatusSelect(item) : renderInlineTrigger(item, "status", `${renderStatusDot(item.status)}<span>${escapeHtml(formatStatusLabel(item.status || "idea"))}</span>`)}
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--base" data-master-list-edit-cell="base" data-master-list-item-id="${escapeHtml(item.id)}">
        ${isEditingBase ? renderBaseSelect(item, bases) : renderInlineTrigger(item, "base", escapeHtml(getBaseLabel(item, bases)))}
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--day" data-master-list-edit-cell="day" data-master-list-item-id="${escapeHtml(item.id)}">
        ${isEditingDay ? renderDaySelect(item, days) : renderInlineTrigger(item, "day", escapeHtml(day ? `Day ${day.day_number}` : "Unassigned"))}
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--item-type" data-master-list-edit-cell="itemType" data-master-list-item-id="${escapeHtml(item.id)}">
        ${isEditingItemType ? renderItemTypeSelect(item) : renderInlineTrigger(item, "itemType", escapeHtml(itemTypeLabel))}
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--subtype" data-master-list-edit-cell="subtype" data-master-list-item-id="${escapeHtml(item.id)}">
        ${isEditingSubtype ? renderSubtypeSelect(item) : renderInlineTrigger(item, "subtype", escapeHtml(getSubtypeLabel(item)))}
      </div>
      <div class="master-list-plan-row__cell master-list-plan-row__cell--actions">
        ${renderItemActionsMenu(item, { includeRemove: true })}
      </div>
      <button class="master-list-mobile-row" data-edit-item="${escapeHtml(item.id)}" type="button">
        ${renderItemTypeIcon(item, "master-list-mobile-row__type-icon")}
        <span class="master-list-mobile-row__title">${escapeHtml(item.title || "Untitled stop")}</span>
        ${renderStatusDot(item.status)}
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
  return `
    <select class="master-list-inline-select" data-master-list-inline-save="${escapeHtml(item.id)}" data-master-list-field="day">
      <option value="">Unassigned</option>
      ${days.map((day) => `<option value="${escapeHtml(day.id)}" ${item.day_id === day.id ? "selected" : ""}>Day ${day.day_number}</option>`).join("")}
    </select>
  `;
}

function renderItemTypeSelect(item) {
  return `
    <select class="master-list-inline-select" data-master-list-inline-save="${escapeHtml(item.id)}" data-master-list-field="itemType">
      ${ITEM_TYPES.map((type) => `<option value="${type}" ${item.item_type === type ? "selected" : ""}>${formatItemTypeLabel(type)}</option>`).join("")}
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
