import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { batchUpdateTripItems } from "../../../services/items-service.js";
import { showToast } from "../../shared/toast.js";
import { tripDetailState, rerenderTripDetail } from "./trip-detail-state.js";
import { getDisplayTitleForToast } from "./trip-detail-ui.js";
import {
  buildUpdatedItem,
  dedupeItemsById,
  getAnchorDestinationSortOrder,
  getFlexItemsForDay,
  getInterleavedDayItems,
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

  // Swap only the sort_order of the two items changing places. Reassigning
  // sort_order across the whole day (as this used to do) meant every other
  // item in the day -- most of them untouched and possibly missing from this
  // browser's in-memory `items` snapshot -- got silently rewritten too,
  // which is how a single arrow click could scramble a day's chronological
  // order behind a stale-looking local list.
  const movedItem = combinedItems[currentIndex];
  const targetItem = combinedItems[targetIndex];

  await persistItemBatchUpdates([
    buildUpdatedItem(movedItem, { sort_order: targetItem.sort_order }),
    buildUpdatedItem(targetItem, { sort_order: movedItem.sort_order }),
  ]);
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
    // Only untimed siblings need renumbering to stay sequential -- timed
    // items self-correct via the DB's auto-sort trigger the moment their own
    // day/time changes, and touching them here (from this browser's possibly
    // stale `items` snapshot) risks overwriting their correct positions.
    if (sourceDayId !== destinationDayId) {
      updates.push(...normalizeFlexItems(
        getFlexItemsForDay(items, sourceDayId, item.id).filter((sibling) => !sibling.time_start)
      ));
    }

    const movedItem = buildUpdatedItem(item, {
      day_id: destinationDayId,
      base_id: item.base_id,
    });

    if (movedItem.time_start) {
      updates.push(movedItem);
    } else {
      updates.push(...normalizeFlexItems([
        ...getFlexItemsForDay(items, destinationDayId, item.id),
        movedItem,
      ]));
    }
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
