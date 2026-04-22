import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { tripDetailState } from "./trip-detail-state.js";

export function captureItemEditorInitialSnapshot() {
  if (!tripDetailState.itemEditorDraft) {
    const { editingItemId, itemEditorMode, itemEditorContext } = appStore.getState().tripDetail;

    if (itemEditorMode === "add") {
      tripDetailState.itemEditorDraft = buildAddItemEditorDraft(itemEditorContext);
      tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
      return;
    }

    const item = tripStore.getCurrentItems().find((entry) => entry.id === editingItemId);

    if (!item) {
      tripDetailState.itemEditorInitialSnapshot = "";
      return;
    }

    tripDetailState.itemEditorDraft = buildItemEditorDraft(item);
  }

  tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
}

export function ensureItemEditorInitialSnapshot() {
  if (tripDetailState.itemEditorInitialSnapshot) {
    return;
  }

  captureItemEditorInitialSnapshot();
}

export function hasUnsavedItemEditorChanges() {
  syncItemEditorDraftFromForm();

  if (!tripDetailState.itemEditorDraft) {
    return false;
  }

  return serializeItemEditorDraft(tripDetailState.itemEditorDraft) !== tripDetailState.itemEditorInitialSnapshot;
}

export function syncItemEditorDraftFromForm() {
  const form = document.querySelector("#item-editor-form");

  if (!form) {
    return;
  }

  const formData = new FormData(form);

  tripDetailState.itemEditorDraft = {
    title: String(formData.get("title") || "").trim(),
    itemType: String(formData.get("itemType") || "").trim(),
    status: String(formData.get("status") || "").trim(),
    baseId: String(formData.get("baseId") || "").trim(),
    dayId: String(formData.get("dayId") || "").trim(),
    isAnchor: formData.get("isAnchor") === "on",
    timeStart: String(formData.get("timeStart") || "").trim(),
    timeEnd: String(formData.get("timeEnd") || "").trim(),
    mealSlot: String(formData.get("mealSlot") || "").trim(),
    activityType: String(formData.get("activityType") || "").trim(),
    transportMode: String(formData.get("transportMode") || "").trim(),
    transportOrigin: String(formData.get("transportOrigin") || "").trim(),
    transportDestination: String(formData.get("transportDestination") || "").trim(),
    costLow: String(formData.get("costLow") || "").trim(),
    costHigh: String(formData.get("costHigh") || "").trim(),
    url: String(formData.get("url") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
  };
}

export function serializeItemEditorDraft(draft) {
  return JSON.stringify(draft);
}

export function getCurrentItemEditorDraft({ item, isAddMode, context }) {
  if (isAddMode) {
    if (!tripDetailState.itemEditorDraft || tripDetailState.persistedEditorItemId !== "add") {
      tripDetailState.persistedEditorItemId = "add";
      tripDetailState.itemEditorDraft = buildAddItemEditorDraft(context);
    }

    return tripDetailState.itemEditorDraft;
  }

  if (item && (!tripDetailState.itemEditorDraft || tripDetailState.persistedEditorItemId !== item.id)) {
    tripDetailState.persistedEditorItemId = item.id;
    tripDetailState.itemEditorDraft = buildItemEditorDraft(item);
    tripDetailState.itemEditorInitialSnapshot = serializeItemEditorDraft(tripDetailState.itemEditorDraft);
  }

  return tripDetailState.itemEditorDraft || buildItemEditorDraft(item);
}

export function buildItemEditorDraft(item) {
  return {
    title: item.title || "",
    itemType: item.item_type || "",
    status: item.status || "",
    baseId: item.base_id || "",
    dayId: item.day_id || "",
    isAnchor: Boolean(item.is_anchor ?? item.isAnchor),
    timeStart: item.time_start || item.timeStart || "",
    timeEnd: item.time_end || item.timeEnd || "",
    mealSlot: item.meal_slot || "",
    activityType: item.activity_type || "",
    transportMode: item.transport_mode || "",
    transportOrigin: item.transport_origin || "",
    transportDestination: item.transport_destination || "",
    costLow: item.cost_low == null ? "" : String(item.cost_low),
    costHigh: item.cost_high == null ? "" : String(item.cost_high),
    url: item.url || "",
    notes: item.notes || "",
  };
}

export function buildAddItemEditorDraft(context = null) {
  return {
    title: "",
    itemType: "",
    status: "idea",
    baseId: context?.baseId || "",
    dayId: context?.dayId || "",
    isAnchor: false,
    timeStart: "",
    timeEnd: "",
    mealSlot: "",
    activityType: "",
    transportMode: "",
    transportOrigin: "",
    transportDestination: "",
    costLow: "",
    costHigh: "",
    url: "",
    notes: "",
  };
}

export function getAddItemModalTitle(context, bases) {
  if (context?.baseId) {
    const base = bases.find((entry) => entry.id === context.baseId);
    return `Add to ${base?.name || "base"}`;
  }

  return "Add to trip";
}
