import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { sessionStore } from "../../../state/session-store.js";
import {
  batchUpdateTripItems,
  createDetailedTripItem,
  softDeleteTripItem,
} from "../../../services/trips-service.js";
import { showToast } from "../../shared/toast.js";
import { tripDetailState, rerenderTripDetail } from "./trip-detail-state.js";
import { normalizeNullableId } from "./base-allocation-controller.js";
import { buildItemSaveBatch, buildUpdatedItem } from "./item-ordering.js";
import {
  buildAddItemEditorDraft,
  buildItemEditorDraft,
  ensureItemEditorInitialSnapshot,
  hasUnsavedItemEditorChanges,
  serializeItemEditorDraft,
  syncItemEditorDraftFromForm,
} from "./item-editor-draft.js";
import {
  syncItemEditorAssignmentHint,
  syncItemEditorTypeFields,
  wireAnchorCheckbox,
  wireDiscardConfirmModal,
} from "./item-editor-dom.js";
import { normalizeTimeInput, wireTimeInputs } from "./item-editor-time.js";

export function getTripItemErrorMessage(action = "update") {
  const messages = {
    create: "Could not add to trip. Please try again.",
    update: "Could not save those changes right now. Please try again.",
    delete: "Could not delete that stop right now. Please try again.",
    baseDelete: "Could not delete that base right now. Please try again.",
    tripDelete: "Could not delete that trip right now. Please try again.",
    tripUpdate: "Could not update that trip right now. Please try again.",
  };

  return messages[action] || "Something went wrong. Please try again.";
}

function closeItemEditor() {
  requestCloseItemEditor(() => {
    appStore.updateTripDetail({
      editingItemId: null,
      itemEditorMode: "edit",
      itemEditorContext: null,
      isSavingItem: false,
      showDiscardConfirm: false,
    });
    tripDetailState.persistedEditorItemId = null;
    tripDetailState.itemEditorInitialSnapshot = "";
    tripDetailState.itemEditorDraft = null;
    tripDetailState.pendingDiscardAction = null;
    rerenderTripDetail();
  });
}

function requestCloseItemEditor(onDiscard) {
  const { editingItemId, itemEditorMode } = appStore.getState().tripDetail;

  if (!editingItemId && itemEditorMode !== "add") {
    onDiscard();
    return;
  }

  if (!hasUnsavedItemEditorChanges()) {
    onDiscard();
    return;
  }

  tripDetailState.pendingDiscardAction = onDiscard;
  appStore.updateTripDetail({
    showDiscardConfirm: true,
  });
  rerenderTripDetail();
}

export function closeDeleteItemConfirm() {
  appStore.updateTripDetail({
    showDeleteItemConfirm: false,
    isDeletingItem: false,
    deletingItemId: null,
  });
  rerenderTripDetail();
}

export function createItemEditorHandlers() {
  return {
    onEditItem: (itemId) => {
      if (!itemId) {
        return;
      }

      requestCloseItemEditor(() => {
        const nextItem = tripStore.getCurrentItems().find((entry) => entry.id === itemId) || null;
        const nextDraft = nextItem ? buildItemEditorDraft(nextItem) : null;

        appStore.updateTripDetail({
          editingItemId: itemId,
          itemEditorMode: "edit",
          itemEditorContext: null,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = itemId;
        tripDetailState.itemEditorDraft = nextDraft;
        tripDetailState.itemEditorInitialSnapshot = nextDraft
          ? serializeItemEditorDraft(nextDraft)
          : "";
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
      });
    },
    onCloseItemEditor: closeItemEditor,
    onAfterItemEditorOpen: () => {
      wireAnchorCheckbox();
      wireTimeInputs();
      syncItemEditorTypeFields();
      syncItemEditorAssignmentHint();
      ensureItemEditorInitialSnapshot();
      wireDiscardConfirmModal();
    },
    onAddItemToBase: (baseId) => {
      if (!baseId) {
        return;
      }

      requestCloseItemEditor(() => {
        const context = { baseId, dayId: "" };
        appStore.updateTripDetail({
          editingItemId: null,
          itemEditorMode: "add",
          itemEditorContext: context,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = null;
        tripDetailState.itemEditorDraft = buildAddItemEditorDraft(context);
        tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
      });
    },
    onAddItemToTrip: () => {
      requestCloseItemEditor(() => {
        const context = { baseId: "", dayId: "" };
        appStore.updateTripDetail({
          editingItemId: null,
          itemEditorMode: "add",
          itemEditorContext: context,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = null;
        tripDetailState.itemEditorDraft = buildAddItemEditorDraft(context);
        tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
      });
    },
    onItemEditorTypeChange: syncItemEditorTypeFields,
    onItemEditorAssignmentChange: syncItemEditorAssignmentHint,
    onItemEditorDraftChange: syncItemEditorDraftFromForm,
    onItemEditorSubmit: async (event) => {
      event.preventDefault();

      const { editingItemId: currentItemId, itemEditorMode } = appStore.getState().tripDetail;

      const items = tripStore.getCurrentItems();
      const currentItem = items.find((item) => item.id === currentItemId);

      syncItemEditorDraftFromForm();
      const draft = tripDetailState.itemEditorDraft || (currentItem ? buildItemEditorDraft(currentItem) : buildAddItemEditorDraft());
      const nextBaseId = normalizeNullableId(draft.baseId);
      const nextDayId = normalizeNullableId(draft.dayId);
      const timeStart = normalizeTimeInput(getDraftTimeValue(draft, currentItem, "timeStart", "time_start", {
        hydrate: false,
      }));
      const timeEnd = normalizeTimeInput(getDraftTimeValue(draft, currentItem, "timeEnd", "time_end", {
        hydrate: false,
      }));

      if (timeStart === null || timeEnd === null) {
        showToast("Use a valid time.", "error");
        return;
      }

      const itemPayload = {
        title: String(draft.title || "").trim(),
        item_type: String(draft.itemType || "").trim(),
        status: String(draft.status || "").trim(),
        is_anchor: Boolean(draft.isAnchor),
        base_id: nextBaseId,
        day_id: nextDayId,
        check_out_date: String(draft.checkOutDate || "").trim() || null,
        meal_slot: String(draft.mealSlot || "").trim() || null,
        activity_type: String(draft.activityType || "").trim() || null,
        transport_mode: String(draft.transportMode || "").trim() || null,
        transport_origin: String(draft.transportOrigin || "").trim() || null,
        transport_destination: String(draft.transportDestination || "").trim() || null,
        time_start: timeStart || null,
        time_end: timeEnd || null,
        cost_low: String(draft.costLow || "").trim() || null,
        cost_high: String(draft.costHigh || "").trim() || null,
        url: String(draft.url || "").trim() || null,
        notes: String(draft.notes || "").trim() || null,
      };

      if (itemEditorMode === "add") {
        const trip = tripStore.getCurrentTrip();
        const { session } = sessionStore.getState();

        if (!trip?.id || !session?.user?.id || !itemPayload.title || !itemPayload.item_type) {
          showToast("Add a title and type first.", "error");
          return;
        }

        appStore.updateTripDetail({
          isSavingItem: true,
        });
        rerenderTripDetail();

        try {
          const savedItem = await createDetailedTripItem({
            tripId: trip.id,
            createdBy: session.user.id,
            title: itemPayload.title,
            itemType: itemPayload.item_type,
            status: itemPayload.status,
            isAnchor: itemPayload.is_anchor,
            baseId: itemPayload.base_id,
            dayId: itemPayload.day_id,
            checkOutDate: itemPayload.check_out_date,
            mealSlot: itemPayload.meal_slot,
            activityType: itemPayload.activity_type,
            transportMode: itemPayload.transport_mode,
            transportOrigin: itemPayload.transport_origin,
            transportDestination: itemPayload.transport_destination,
            timeStart: itemPayload.time_start,
            timeEnd: itemPayload.time_end,
            costLow: itemPayload.cost_low,
            costHigh: itemPayload.cost_high,
            url: itemPayload.url,
            notes: itemPayload.notes,
            sortOrder: items.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), -1) + 1,
          });

          tripStore.appendCurrentItem(savedItem);
          appStore.updateTripDetail({
            isSavingItem: false,
            editingItemId: null,
            itemEditorMode: "edit",
            itemEditorContext: null,
            showDiscardConfirm: false,
          });
          tripDetailState.itemEditorInitialSnapshot = "";
          tripDetailState.itemEditorDraft = null;
          tripDetailState.pendingDiscardAction = null;
          rerenderTripDetail();
          showToast("Stop added.", "success");
        } catch (error) {
          console.error(error);
          appStore.updateTripDetail({
            isSavingItem: false,
          });
          rerenderTripDetail();
          showToast(getTripItemErrorMessage("create"), "error");
        }
        return;
      }

      if (!currentItem) {
        return;
      }

      const nextItem = buildUpdatedItem(currentItem, {
        ...itemPayload,
      });
      const updatedItems = buildItemSaveBatch(currentItem, nextItem, items);

      appStore.updateTripDetail({
        isSavingItem: true,
      });
      rerenderTripDetail();

      try {
        await batchUpdateTripItems(updatedItems).then((savedItems) => {
          tripStore.mergeCurrentItems(savedItems);
          return savedItems;
        });
        appStore.updateTripDetail({
          isSavingItem: false,
          editingItemId: null,
          itemEditorMode: "edit",
          itemEditorContext: null,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = null;
        tripDetailState.itemEditorInitialSnapshot = "";
        tripDetailState.itemEditorDraft = null;
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
        showToast("Stop updated.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isSavingItem: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("update"), "error");
      }
    },
    onCancelDeleteItem: closeDeleteItemConfirm,
    onConfirmDeleteItem: async () => {
      const trip = tripStore.getCurrentTrip();
      const items = tripStore.getCurrentItems();
      const { deletingItemId } = appStore.getState().tripDetail;
      const deletedItem = items.find((entry) => entry.id === deletingItemId) || null;

      if (!trip?.id || !deletingItemId) {
        return;
      }

      appStore.updateTripDetail({
        isDeletingItem: true,
      });
      rerenderTripDetail();

      try {
        await softDeleteTripItem(deletingItemId);
        tripStore.removeCurrentItem(deletingItemId);
        appStore.updateTripDetail({
          isDeletingItem: false,
          showDeleteItemConfirm: false,
          deletingItemId: null,
          editingItemId: null,
          showDiscardConfirm: false,
        });
        tripDetailState.persistedEditorItemId = null;
        tripDetailState.itemEditorDraft = null;
        tripDetailState.itemEditorInitialSnapshot = "";
        tripDetailState.pendingDiscardAction = null;
        rerenderTripDetail();
        showToast(`${deletedItem?.title || "Stop"} deleted`, "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isDeletingItem: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("delete"), "error");
      }
    },
  };
}

function getDraftTimeValue(draft, item, draftKey, itemKey, options = {}) {
  const hydrate = options.hydrate !== false;

  if (draft && Object.prototype.hasOwnProperty.call(draft, draftKey)) {
    return draft[draftKey];
  }

  if (!hydrate) {
    return "";
  }

  return item?.[itemKey] || "";
}
