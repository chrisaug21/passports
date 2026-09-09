import { tripStore } from "../../state/trip-store.js";
import { showToast } from "../shared/toast.js";
import { reorderWishlistDestinations } from "../../services/trips-service.js";
import { rerenderDestinations } from "./destinations-state.js";
import { openBoardPromoteModal, openBoardDemoteConfirm } from "./destinations-wire.js";

// Wishlist cards can promote into Planning; Planning cards can demote into
// Wishlist. Only undated Wishlist cards can reorder within their own column
// (dated Wishlist cards and Planning cards are sorted by date, so dragging
// them within their own column is a no-op). Mouse drags start immediately;
// touch requires a brief hold so a normal horizontal-scroll swipe across the
// board isn't mistaken for a drag.
const BOARD_DRAG_CROSS_TARGET = new Map([
  ["wishlist", "planning"],
  ["planning", "wishlist"],
]);

export function wireBoardDragHandles() {
  document.querySelectorAll('[data-destination-column="wishlist"] [data-drag-handle], [data-destination-column="planning"] [data-drag-handle]').forEach((handle) => {
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("pointerdown", onBoardDragHandlePointerDown);
  });
}

function onBoardDragHandlePointerDown(downEvent) {
  const handle = downEvent.currentTarget;
  const card = handle.closest("[data-destination-card]");
  const columnEl = handle.closest("[data-destination-column]");
  const list = columnEl?.querySelector(".destinations-column__cards");

  if (!card || !columnEl || !list) {
    return;
  }

  if (downEvent.pointerType === "mouse") {
    beginBoardDrag({ startEvent: downEvent, card, columnEl, list });
    return;
  }

  const startX = downEvent.clientX;
  const startY = downEvent.clientY;
  let didStartDrag = false;

  const longPressTimer = setTimeout(() => {
    didStartDrag = true;
    beginBoardDrag({ startEvent: downEvent, card, columnEl, list });
  }, 350);

  const cancelPendingDrag = () => {
    clearTimeout(longPressTimer);
    handle.removeEventListener("pointermove", onEarlyMove);
    handle.removeEventListener("pointerup", cancelPendingDrag);
    handle.removeEventListener("pointercancel", cancelPendingDrag);
  };

  const onEarlyMove = (moveEvent) => {
    if (didStartDrag) {
      return;
    }

    if (Math.abs(moveEvent.clientX - startX) > 8 || Math.abs(moveEvent.clientY - startY) > 8) {
      cancelPendingDrag();
    }
  };

  handle.addEventListener("pointermove", onEarlyMove);
  handle.addEventListener("pointerup", cancelPendingDrag);
  handle.addEventListener("pointercancel", cancelPendingDrag);
}

// The dragged card floats at the pointer (position: fixed + a translate
// offset) while a dashed placeholder holds its landing spot in the list, so
// dragging reads as picking the card up rather than swapping slots outright.
// Dropping over a different column never mutates data directly — it opens
// the same Promote/Move-to-Wishlist modal the board already uses elsewhere,
// and the card visually snaps back to its origin until that modal is confirmed.
function beginBoardDrag({ startEvent, card, columnEl, list }) {
  const pointerId = startEvent.pointerId;
  const tripId = card.getAttribute("data-trip-id");
  const originColumnId = columnEl.getAttribute("data-destination-column");
  const isReorderable = Boolean(card.querySelector('[data-reorderable="true"]'));
  const startX = startEvent.clientX;
  const startY = startEvent.clientY;
  const rect = card.getBoundingClientRect();
  const offsetX = startX - rect.left;
  const offsetY = startY - rect.top;

  const placeholder = document.createElement("div");
  placeholder.className = "destination-card-placeholder";
  placeholder.style.height = `${rect.height}px`;
  list.insertBefore(placeholder, card.nextSibling);

  document.documentElement.classList.add("is-board-drag-active");
  card.dataset.justDragged = "true";
  card.classList.add("is-dragging");
  card.style.position = "fixed";
  card.style.top = `${rect.top}px`;
  card.style.left = `${rect.left}px`;
  card.style.width = `${rect.width}px`;

  card.setPointerCapture(pointerId);

  let didMove = false;
  let hoveredColumnId = originColumnId;
  let dropTargetColumnEl = null;

  const setDropTargetColumn = (nextColumnEl) => {
    if (dropTargetColumnEl === nextColumnEl) {
      return;
    }

    dropTargetColumnEl?.classList.remove("is-drop-target");
    dropTargetColumnEl = nextColumnEl || null;
    dropTargetColumnEl?.classList.add("is-drop-target");
  };

  const onPointerMove = (moveEvent) => {
    card.style.top = `${moveEvent.clientY - offsetY}px`;
    card.style.left = `${moveEvent.clientX - offsetX}px`;

    if (!didMove && (Math.abs(moveEvent.clientX - startX) > 6 || Math.abs(moveEvent.clientY - startY) > 6)) {
      didMove = true;
    }

    const hoveredColumnEl = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest("[data-destination-column]");
    hoveredColumnId = hoveredColumnEl?.getAttribute("data-destination-column") || null;

    if (hoveredColumnId === originColumnId) {
      setDropTargetColumn(null);

      if (isReorderable) {
        updateReorderPlaceholder({ list, card, placeholder, pointerY: moveEvent.clientY });
      }

      return;
    }

    if (hoveredColumnEl && BOARD_DRAG_CROSS_TARGET.get(originColumnId) === hoveredColumnId) {
      setDropTargetColumn(hoveredColumnEl);
      return;
    }

    setDropTargetColumn(null);
  };

  const finishDrag = async () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", finishDrag);
    document.removeEventListener("pointercancel", finishDrag);

    try {
      card.releasePointerCapture(pointerId);
    } catch {
      // Already released (e.g. pointercancel fired first) — nothing to do.
    }

    document.documentElement.classList.remove("is-board-drag-active");
    setDropTargetColumn(null);

    list.insertBefore(card, placeholder);
    placeholder.remove();

    card.classList.remove("is-dragging");
    card.style.position = "";
    card.style.top = "";
    card.style.left = "";
    card.style.width = "";
    setTimeout(() => {
      delete card.dataset.justDragged;
    }, 0);

    if (!didMove) {
      return;
    }

    if (hoveredColumnId === originColumnId) {
      if (isReorderable) {
        await commitWishlistReorder(list);
      } else {
        showToast("This trip has a date assigned. Change its date to re-order it.");
      }
      return;
    }

    if (BOARD_DRAG_CROSS_TARGET.get(originColumnId) === hoveredColumnId) {
      if (originColumnId === "wishlist") {
        openBoardPromoteModal(tripId);
      } else if (originColumnId === "planning") {
        openBoardDemoteConfirm(tripId);
      }
    }
  };

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", finishDrag);
  document.addEventListener("pointercancel", finishDrag);
}

function updateReorderPlaceholder({ list, card, placeholder, pointerY }) {
  const reorderableSiblings = Array.from(list.children).filter(
    (child) => child !== placeholder && child !== card && child.querySelector?.('[data-reorderable="true"]')
  );

  let insertBeforeEl = null;

  for (const sibling of reorderableSiblings) {
    const siblingRect = sibling.getBoundingClientRect();

    if (pointerY < siblingRect.top + siblingRect.height / 2) {
      insertBeforeEl = sibling;
      break;
    }
  }

  if (insertBeforeEl) {
    if (insertBeforeEl !== placeholder.nextSibling) {
      list.insertBefore(placeholder, insertBeforeEl);
    }
  } else if (placeholder !== list.lastElementChild) {
    list.appendChild(placeholder);
  }
}

async function commitWishlistReorder(list) {
  const orderedTripIds = Array.from(list.children)
    .filter((child) => child.querySelector('[data-reorderable="true"]'))
    .map((child) => child.getAttribute("data-trip-id"));

  if (orderedTripIds.length < 2) {
    return;
  }

  const previousSortOrders = new Map(
    orderedTripIds.map((tripId) => [
      tripId,
      tripStore.getTrips().find((trip) => String(trip.id) === String(tripId))?.sort_order,
    ])
  );

  orderedTripIds.forEach((tripId, index) => {
    tripStore.updateTrip({ id: tripId, sort_order: index });
  });

  try {
    await reorderWishlistDestinations({ orderedTripIds });
  } catch (error) {
    console.error(error);
    previousSortOrders.forEach((sortOrder, tripId) => {
      tripStore.updateTrip({ id: tripId, sort_order: sortOrder });
    });
    showToast("Could not save that order right now.", "error");
    rerenderDestinations();
  }
}
