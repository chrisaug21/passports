export function getFlexItemsForDay(items, dayId, excludedItemId = null) {
  return items
    .filter((item) => !item.is_anchor && item.day_id === dayId && item.id !== excludedItemId)
    .sort(compareFlexItems);
}

export function getAnchorDestinationSortOrder(items, dayId, excludedItemId = null) {
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

export function insertFlexItemByTime(items, itemToInsert) {
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

export function dedupeItemsById(items) {
  const itemsById = new Map();
  items.forEach((item) => {
    itemsById.set(item.id, item);
  });
  return [...itemsById.values()];
}
