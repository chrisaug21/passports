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
  formatTimeLabel,
} from "../../../lib/format.js";
import { showToast } from "../../shared/toast.js";
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

export function renderMasterListRow(item, days, bases) {
  const day = days.find((entry) => entry.id === item.day_id);
  const base = bases.find((entry) => entry.id === item.base_id);
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
          <h4>${escapeHtml(item.title || "Untitled item")}</h4>
        </div>
        ${renderItemStatusMeta(item.status)}
        <p class="muted master-list-row__meta">
          ${base ? ` · ${escapeHtml(base.name || "")}` : ""}
          ${day ? ` · Day ${day.day_number}` : " · Not yet placed"}
        </p>
        ${detailParts.length > 0 ? `<p class="master-list-row__details">${detailParts.join(" · ")}</p>` : ""}
      </div>
      ${renderItemActionsMenu(item)}
    </article>
  `;
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
            <h5>${escapeHtml(item.title || "Untitled item")}</h5>
          </div>
          <div class="day-item__header-actions">
            ${
              !item.is_anchor && dayId
                ? `
                  <div class="day-item__reorder-controls" aria-label="Reorder item">
                    <button
                      class="day-item__reorder-button"
                      data-reorder-item-up="${escapeHtml(item.id)}"
                      data-reorder-day-id="${escapeHtml(dayId)}"
                      type="button"
                      aria-label="Move item up"
                      ${canMoveUp ? "" : "disabled"}
                    >
                      <i data-lucide="chevron-up"></i>
                    </button>
                    <button
                      class="day-item__reorder-button"
                      data-reorder-item-down="${escapeHtml(item.id)}"
                      data-reorder-day-id="${escapeHtml(dayId)}"
                      type="button"
                      aria-label="Move item down"
                      ${canMoveDown ? "" : "disabled"}
                    >
                      <i data-lucide="chevron-down"></i>
                    </button>
                  </div>
                `
                : ""
            }
            ${renderItemActionsMenu(item)}
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
      <summary class="item-actions-menu__trigger" aria-label="Open item actions">⋮</summary>
      <div class="item-actions-menu__panel">
        <button class="item-actions-menu__item" data-edit-item="${escapeHtml(item.id)}" type="button">Edit</button>
        <button class="item-actions-menu__item" data-open-move-item="${escapeHtml(item.id)}" type="button">Move</button>
        <button class="item-actions-menu__item item-actions-menu__item--danger" data-request-delete-item="${escapeHtml(item.id)}" type="button">Remove</button>
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
  const reorderedItems = assignFlexSortOrdersFromCombinedItems(reorderedCombinedItems)
    .filter((item) => {
      const currentItem = items.find((entry) => entry.id === item.id);
      return currentItem && Number(currentItem.sort_order) !== Number(item.sort_order);
    });

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
    showToast("Anchor items require a start time.", "error");
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
        showToast("Add a title and item type first.", "error");
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
        });
        rerenderTripDetail();
        showToast("Item added.", "success");
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
        showToast(`${getDisplayTitleForToast(item.title, "Item")} moved to ${getMoveDestinationLabel(destinationDayId, tripStore.getCurrentDays())}`, "success");
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
