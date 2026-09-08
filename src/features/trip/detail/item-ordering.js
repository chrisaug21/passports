export function getFlexItemsForDay(items, dayId, excludedItemId = null) {
  return items
    .filter((item) => !item.is_anchor && item.day_id === dayId && item.id !== excludedItemId)
    .sort(compareFlexItems);
}

export function buildItemSaveBatch(currentItem, nextItem, items) {
  const updates = [];
  const previousDayId = currentItem.day_id ?? null;
  const nextDayId = nextItem.day_id ?? null;
  const changedDay = previousDayId !== nextDayId;
  const changedAnchorState = Boolean(currentItem.is_anchor) !== Boolean(nextItem.is_anchor);
  const shouldRemoveFromSourceFlex = !currentItem.is_anchor && (changedDay || nextItem.is_anchor);

  // Timed siblings' sort_order is owned by the DB's auto-sort trigger
  // (sql/trip_items_time_based_sort_order.sql) and self-corrects the moment
  // any of them is next written with a time/day change -- so only untimed
  // items need renumbering here. Including timed items in this local
  // recompute is what let a stale in-memory `items` snapshot overwrite the
  // trigger's correct values for items this save never meant to touch.
  if (shouldRemoveFromSourceFlex) {
    updates.push(...normalizeFlexItems(
      getFlexItemsForDay(items, previousDayId, currentItem.id).filter((item) => !item.time_start)
    ));
  }

  // An anchor's sort_order is trigger-owned exactly like a timed flex item's:
  // whenever day_id or time_start actually changes, the trigger recomputes it
  // chronologically server-side regardless of what's sent here, and when
  // neither changes (e.g. only is_anchor was toggled) the item's existing
  // sort_order is already a correct time-sorted position -- overwriting it
  // with a raw sibling count (as this used to) discarded that correct
  // position and stuck permanently, since the trigger only recomputes on a
  // real time/day change.
  if (nextItem.is_anchor) {
    updates.push(nextItem);
    return dedupeItemsById(updates);
  }

  // A timed flex item's own sort_order is fully recomputed server-side by
  // the trigger whenever time_start/day_id changes, so there's nothing to
  // compute client-side -- just send the item.
  if (nextItem.time_start) {
    updates.push(nextItem);
    return dedupeItemsById(updates);
  }

  if (changedDay || changedAnchorState) {
    // Only untimed siblings need renumbering -- see the comment on the
    // shouldRemoveFromSourceFlex block above; the same stale-snapshot risk
    // applies here to the destination day.
    updates.push(...normalizeFlexItems([
      ...getFlexItemsForDay(items, nextDayId, currentItem.id).filter((item) => !item.time_start),
      nextItem,
    ]));
    return dedupeItemsById(updates);
  }

  updates.push(nextItem);
  return dedupeItemsById(updates);
}
export function assignDaySortOrdersFromCombinedItems(combinedItems) {
  const updatedItems = [];

  combinedItems.forEach((item, index) => {
    updatedItems.push({
      ...item,
      sort_order: index,
    });
  });

  return updatedItems;
}
export function canMoveItemInDirection(items, index, direction) {
  const item = items[index];
  const neighbor = items[index + direction];

  if (!item || !neighbor) {
    return false;
  }

  if (!item.time_start) {
    return true;
  }

  return String(neighbor.time_start || "") === String(item.time_start);
}

export function moveCombinedItemByStep(items, itemId, direction) {
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
function compareAnchorItems(left, right) {
  const leftTime = String(left.time_start || "");
  const rightTime = String(right.time_start || "");

  return leftTime.localeCompare(rightTime) || String(left.title || "").localeCompare(String(right.title || ""));
}

export function compareFlexItems(left, right) {
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

export function normalizeFlexItems(items) {
  return items.map((item, index) => ({
    ...item,
    sort_order: index,
  }));
}

export function buildUpdatedItem(currentItem, overrides) {
  return {
    ...currentItem,
    ...overrides,
  };
}

export function dedupeItemsById(items) {
  const itemsById = new Map();
  items.forEach((item) => {
    itemsById.set(item.id, item);
  });
  return [...itemsById.values()];
}
