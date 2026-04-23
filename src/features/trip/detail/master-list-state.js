import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { batchUpdateTripItems } from "../../../services/trips-service.js";
import { formatItemTypeLabel, formatStatusLabel } from "../../../lib/format.js";
import {
  ACTIVITY_TYPES,
  ITEM_STATUSES,
  MEAL_SLOTS,
  TRANSPORT_MODES,
} from "../../../config/constants.js";
import { showToast } from "../../shared/toast.js";
import { rerenderTripDetail } from "./trip-detail-state.js";
import { normalizeNullableId } from "./base-allocation-controller.js";
import { buildUpdatedItem, compareFlexItems } from "./item-ordering.js";

const MASTER_LIST_SORT_KEYS = ["title", "status", "base", "day", "itemType", "subtype"];

export function getSubtypeOptions(itemType) {
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

export function getSubtypeFilterOptions(itemType) {
  const normalizedType = String(itemType || "all");

  if (normalizedType === "lodging") {
    return [["all", "All"]];
  }

  if (normalizedType === "meal") {
    const mealOptions = MEAL_SLOTS.includes("snack") ? MEAL_SLOTS : [...MEAL_SLOTS, "snack"];
    return [["all", "All"], ...mealOptions.map((value) => [value, formatItemTypeLabel(value)])];
  }

  if (normalizedType === "activity") {
    return [["all", "All"], ...ACTIVITY_TYPES.map((value) => [value, formatItemTypeLabel(value)])];
  }

  if (normalizedType === "transport") {
    return [["all", "All"], ...TRANSPORT_MODES.map((value) => [value, formatItemTypeLabel(value)])];
  }

  const mealOptions = MEAL_SLOTS.includes("snack") ? MEAL_SLOTS : [...MEAL_SLOTS, "snack"];
  const combinedValues = [...mealOptions, ...ACTIVITY_TYPES, ...TRANSPORT_MODES];
  const seenValues = new Set();
  const options = combinedValues
    .filter((value) => {
      if (seenValues.has(value)) {
        return false;
      }
      seenValues.add(value);
      return true;
    })
    .map((value) => [value, formatItemTypeLabel(value)]);

  return [["all", "All"], ...options];
}

export function getSubtypeValue(item) {
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

export function getSubtypeLabel(item) {
  return getSubtypeValue(item) ? formatItemTypeLabel(getSubtypeValue(item)) : "";
}

export function getBaseLabel(item, bases) {
  const base = bases.find((entry) => entry.id === item.base_id);
  return base ? base.name || "Untitled base" : "Unassigned";
}

export function getFilteredMasterListItems(items, filters) {
  const searchQuery = String(filters.search || "").trim().toLowerCase();
  return items.filter((item) => {
    const searchMatches = !searchQuery || String(item.title || "").toLowerCase().includes(searchQuery);
    const typeMatches = !filters.type || filters.type === "all" || item.item_type === filters.type;
    const subtypeMatches = !filters.subtype || filters.subtype === "all" || getSubtypeValue(item) === filters.subtype;
    const statusMatches = !filters.status || filters.status === "all" || item.status === filters.status;
    const baseMatches = !filters.baseId
      || filters.baseId === "all"
      || (filters.baseId === "unassigned" ? !item.base_id : item.base_id === filters.baseId);

    return searchMatches && typeMatches && subtypeMatches && statusMatches && baseMatches;
  });
}

export function getSortedMasterListItems(items, days, bases, sort) {
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
  if (key === "itemType") {
    return item.item_type ? formatItemTypeLabel(item.item_type) : "";
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

export function isMasterListFiltered(filters = {}) {
  return Boolean(String(filters.search || "").trim())
    || ["type", "subtype", "status", "baseId"].some((key) => filters[key] && filters[key] !== "all");
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

export function closeMasterListInlineEdit() {
  appStore.updateTripDetail({
    masterListEditingCell: null,
  });
}

export function updateMasterListFilters(name, value, options = {}) {
  const { masterListFilters } = appStore.getState().tripDetail;
  const nextFilters = {
    ...(masterListFilters || {}),
    [name]: value || (name === "search" ? "" : "all"),
  };

  if (name === "type") {
    nextFilters.subtype = "all";
  }

  appStore.updateTripDetail({
    masterListFilters: nextFilters,
  });
  rerenderTripDetail();

  if (name === "search" && options.restoreFocus) {
    window.requestAnimationFrame(() => {
      const searchInput = document.querySelector(
        options.isMobileSearch
          ? '.master-list-mobile-search [data-master-list-filter="search"]'
          : '.master-list-filter-bar [data-master-list-filter="search"]'
      );

      if (!searchInput) {
        return;
      }

      searchInput.focus();

      if (
        typeof options.selectionStart === "number"
        && typeof options.selectionEnd === "number"
        && typeof searchInput.setSelectionRange === "function"
      ) {
        searchInput.setSelectionRange(options.selectionStart, options.selectionEnd);
      }
    });
  }
}

export function updateMasterListSort(key) {
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

export async function saveMasterListField(itemId, field, value) {
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
