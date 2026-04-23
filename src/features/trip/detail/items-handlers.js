import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { sessionStore } from "../../../state/session-store.js";
import { createTripItem } from "../../../services/trips-service.js";
import { showToast } from "../../shared/toast.js";
import { rerenderTripDetail } from "./trip-detail-state.js";
import { escapeHtml } from "./trip-detail-ui.js";
import { normalizeNullableId } from "./base-allocation-controller.js";
import {
  closeMasterListInlineEdit,
  getSubtypeFilterOptions,
  saveMasterListField,
  updateMasterListFilters,
  updateMasterListSort,
} from "./master-list-state.js";
import {
  closeMoveItemModal,
  getMoveDestinationLabel,
  moveItemToDestination,
  openDeleteItemConfirm,
  openMoveItemModal,
  reorderFlexItemsWithinDay,
} from "./item-move-controller.js";

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

      if (!title) {
        showToast("Add a title first.", "error");
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
          itemType: null,
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
      const name = select.getAttribute("data-master-list-filter");
      updateMasterListFilters(name, select.value, {
        restoreFocus: name === "search",
        isMobileSearch: Boolean(select.closest(".master-list-mobile-search")),
        selectionStart: select.selectionStart,
        selectionEnd: select.selectionEnd,
      });
    },
    onMasterListSheetTypeFilterChange: (select) => {
      const subtypeSelect = document.querySelector('[data-master-list-sheet-filter="subtype"]');

      if (!subtypeSelect) {
        return;
      }

      const subtypeOptions = getSubtypeFilterOptions(select.value || "all");
      subtypeSelect.innerHTML = subtypeOptions.map(([optionValue, optionLabel]) => (
        `<option value="${escapeHtml(optionValue)}">${escapeHtml(optionLabel)}</option>`
      )).join("");
      subtypeSelect.value = "all";
      subtypeSelect.disabled = subtypeOptions.length <= 1;
    },
    onApplyMasterListFilters: () => {
      const nextFilters = {
        search: "",
        type: "all",
        subtype: "all",
        status: "all",
        baseId: "all",
      };

      document.querySelectorAll("[data-master-list-sheet-filter]").forEach((select) => {
        nextFilters[select.getAttribute("data-master-list-sheet-filter")] = select.value || "all";
      });

      appStore.updateTripDetail({
        masterListFilters: nextFilters,
        isShowingMasterListFilters: false,
      });
      rerenderTripDetail();
    },
    onOpenMasterListFilters: () => {
      appStore.updateTripDetail({ isShowingMasterListFilters: true });
      rerenderTripDetail();
      window.requestAnimationFrame(() => {
        const sheet = document.querySelector(".master-list-filter-sheet");

        if (!sheet) {
          return;
        }

        sheet.style.position = "fixed";
        sheet.style.bottom = "0";
        sheet.style.left = "0";
        sheet.style.right = "0";
        sheet.style.top = "auto";
      });
    },
    onCloseMasterListFilters: () => {
      appStore.updateTripDetail({ isShowingMasterListFilters: false });
      rerenderTripDetail();
    },
    onClearMasterListFilters: () => {
      appStore.updateTripDetail({
        masterListFilters: {
          search: "",
          type: "all",
          subtype: "all",
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
