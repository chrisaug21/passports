import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { batchUpdateTripItems } from "../../../services/trips-service.js";
import { showToast } from "../../shared/toast.js";
import { tripDetailState, rerenderTripDetail } from "./trip-detail-state.js";
import { getDisplayTitleForToast } from "./trip-detail-ui.js";
import {
  assignFlexSortOrdersFromCombinedItems,
  buildUpdatedItem,
  dedupeItemsById,
  getAnchorDestinationSortOrder,
  getFlexItemsForDay,
  getInterleavedDayItems,
  moveCombinedItemByStep,
  normalizeFlexItems,
} from "./item-ordering.js";

async function persistItemBatchUpdates(updatedItems) {
  const savedItems = await batchUpdateTripItems(updatedItems);
  tripStore.mergeCurrentItems(savedItems);
  return savedItems;
}

export async function reorderFlexItemsWithinDay(dayId, movedItemId, direction) {
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

export function getMoveDestinationLabel(destinationDayId, days) {
  if (!destinationDayId) {
    return "Unassigned";
  }

  const destinationDay = days.find((day) => day.id === destinationDayId);
  return destinationDay ? `Day ${destinationDay.day_number}` : "Unassigned";
}

export async function moveItemToDestination(itemId, destinationDayId) {
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
