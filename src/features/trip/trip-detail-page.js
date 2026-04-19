import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { createTripItem, fetchTripDetailBundle, updateTripItem } from "../../services/trips-service.js";
import {
  formatCostLabel,
  formatItemTypeLabel,
  formatLongDate,
  formatStatusLabel,
  formatTimeLabel,
  formatTripDateSummary,
} from "../../lib/format.js";
import { navigate } from "../../app/router.js";
import {
  ACTIVITY_TYPES,
  ITEM_STATUSES,
  ITEM_TYPES,
  MEAL_SLOTS,
  TRANSPORT_MODES,
} from "../../config/constants.js";
import { sessionStore } from "../../state/session-store.js";
import { showToast } from "../shared/toast.js";

let rerenderTripDetail = () => {};
let itemEditorInitialSnapshot = "";
let pendingDiscardAction = null;

export function setTripDetailRenderer(renderer) {
  rerenderTripDetail = renderer;
}

export function renderTripDetailPage() {
  const { tripDetail } = appStore.getState();
  const trip = tripStore.getCurrentTrip();
  const bases = tripStore.getCurrentBases();
  const days = tripStore.getCurrentDays();
  const items = tripStore.getCurrentItems();
  const editingItem = items.find((item) => item.id === tripDetail.editingItemId) || null;

  if (tripDetail.status === "loading") {
    return `
      <section class="trip-detail">
        <section class="panel trip-detail__state">
          <p class="eyebrow">Trip</p>
          <h2>Loading trip…</h2>
          <p class="muted">Pulling trip details, bases, days, and items now.</p>
        </section>
      </section>
    `;
  }

  if (tripDetail.status === "error") {
    return `
      <section class="trip-detail">
        <section class="panel trip-detail__state">
          <p class="eyebrow">Trip</p>
          <h2>Could not load trip</h2>
          <p class="muted">${tripDetail.error || "Try going back to the dashboard and opening the trip again."}</p>
          <div class="trip-detail__state-actions">
            <button class="button button--secondary" id="trip-back-to-dashboard" type="button">Back to Dashboard</button>
            <button class="button" id="retry-trip-load" type="button">Try Again</button>
          </div>
        </section>
      </section>
    `;
  }

  if (!trip) {
    return `
      <section class="trip-detail">
        <section class="panel trip-detail__state">
          <p class="eyebrow">Trip</p>
          <h2>No trip selected</h2>
          <p class="muted">Go back to the dashboard and open a trip card.</p>
          <button class="button" id="trip-back-to-dashboard" type="button">Back to Dashboard</button>
        </section>
      </section>
    `;
  }

  return `
    <section class="trip-detail">
      <button class="text-link" id="trip-back-to-dashboard" type="button">← Back to Dashboard</button>

      <section class="panel trip-header">
        <div class="trip-header__meta">
          <p class="eyebrow">Master List</p>
          <h2 class="trip-header__title">${trip.title}</h2>
          <p class="muted">${trip.description || "Trip details are starting here. Master List will be the main planning workspace."}</p>
        </div>
        <div class="trip-header__status-block">
          <span class="trip-pill">${formatStatusLabel(trip.status)}</span>
          <p class="trip-header__dates">${formatTripDateSummary(trip)}</p>
          <p class="muted">${trip.start_date ? `Starts ${formatLongDate(trip.start_date)}` : "Start date not set yet"}</p>
        </div>
      </section>

      <section class="trip-stats">
        <article class="panel trip-stat">
          <p class="eyebrow">Bases</p>
          <h3>${bases.length}</h3>
          <p class="muted">${bases.length === 1 ? bases[0]?.name || "Main Base" : "Cities or stays in this trip"}</p>
        </article>
        <article class="panel trip-stat">
          <p class="eyebrow">Days</p>
          <h3>${days.length}</h3>
          <p class="muted">Trip length structure is already in place.</p>
        </article>
        <article class="panel trip-stat">
          <p class="eyebrow">Items</p>
          <h3>${items.length}</h3>
          <p class="muted">${items.length === 0 ? "No meals, activities, transport, or lodging yet." : "Items already saved to this trip."}</p>
        </article>
      </section>

      <section class="trip-view-tabs">
        <button class="trip-view-tabs__button is-active" type="button">Master List</button>
        <button class="trip-view-tabs__button" type="button" disabled>Days View Next</button>
      </section>

      <section class="panel master-list-panel">
        <div class="master-list-panel__header">
          <div>
            <p class="eyebrow">All Items</p>
            <h3>Master List</h3>
          </div>
          <p class="muted">Quick-add is live in this checkpoint. Edit and assignment flows come next.</p>
        </div>

        <form class="master-list-quick-add" id="master-list-quick-add-form">
          <label class="field master-list-quick-add__field master-list-quick-add__field--title">
            <span>Title</span>
            <input
              name="title"
              type="text"
              maxlength="120"
              placeholder="Add a restaurant, museum, hotel, or transport idea"
              required
            />
          </label>
          <label class="field master-list-quick-add__field">
            <span>Type</span>
            <select name="itemType" required>
              ${ITEM_TYPES.map((type) => `<option value="${type}">${formatItemTypeLabel(type)}</option>`).join("")}
            </select>
          </label>
          <button class="button master-list-quick-add__submit" type="submit" ${tripDetail.isCreatingItem ? "disabled" : ""}>
            ${tripDetail.isCreatingItem ? "Saving…" : "Add Item"}
          </button>
        </form>

        ${
          items.length === 0
            ? `
              <div class="master-list-empty">
                <h4>No items yet</h4>
                <p class="muted">This trip exists, its base and day structure are loaded, and the app is ready for the next checkpoint: adding items into the master list.</p>
              </div>
            `
            : `
              <div class="master-list-table">
                ${items.map((item) => renderMasterListRow(item, days, bases)).join("")}
              </div>
            `
        }
      </section>

      ${renderItemEditorModal({
        item: editingItem,
        bases,
        days,
        isSaving: tripDetail.isSavingItem,
      })}
      ${renderDiscardConfirmModal(tripDetail.showDiscardConfirm)}
    </section>
  `;
}

export function wireTripDetailPage(tripId) {
  document.querySelector("#trip-back-to-dashboard")?.addEventListener("click", () => {
    navigate("/app");
  });

  document.querySelector("#retry-trip-load")?.addEventListener("click", () => {
    loadTripDetail(tripId);
  });

  document.querySelector("#master-list-quick-add-form")?.addEventListener("submit", async (event) => {
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
      showToast(getTripItemErrorMessage(error), "error");
    }
  });

  document.querySelectorAll("[data-edit-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.getAttribute("data-edit-item");

      if (!itemId) {
        return;
      }

      requestCloseItemEditor(() => {
        appStore.updateTripDetail({
          editingItemId: itemId,
          showDiscardConfirm: false,
        });
        pendingDiscardAction = null;
        rerenderTripDetail();
      });
    });
  });

  document.querySelector("#close-item-editor")?.addEventListener("click", closeItemEditor);
  document.querySelector("#cancel-item-editor")?.addEventListener("click", closeItemEditor);
  document.querySelector("[data-close-item-editor]")?.addEventListener("click", closeItemEditor);
  document.querySelector("#item-type-select")?.addEventListener("change", syncItemEditorTypeFields);
  syncItemEditorTypeFields();
  captureItemEditorInitialSnapshot();
  wireDiscardConfirmModal();

  document.querySelector("#item-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentItemId = appStore.getState().tripDetail.editingItemId;
    if (!currentItemId) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    let nextBaseId = String(formData.get("baseId") || "").trim();
    let nextDayId = String(formData.get("dayId") || "").trim();
    const currentDays = tripStore.getCurrentDays();
    const selectedDay = currentDays.find((day) => day.id === nextDayId);

    if (selectedDay) {
      nextBaseId = selectedDay.base_id;
    }

    if (nextBaseId && nextDayId) {
      const selectedDayMatchesBase = currentDays.some((day) => day.id === nextDayId && day.base_id === nextBaseId);

      if (!selectedDayMatchesBase) {
        nextDayId = "";
      }
    }

    appStore.updateTripDetail({
      isSavingItem: true,
    });
    rerenderTripDetail();

    try {
      const updatedItem = await updateTripItem({
        itemId: currentItemId,
        title: String(formData.get("title") || "").trim(),
        itemType: String(formData.get("itemType") || "").trim(),
        status: String(formData.get("status") || "").trim(),
        isAnchor: formData.get("isAnchor") === "on",
        baseId: nextBaseId,
        dayId: nextDayId,
        mealSlot: String(formData.get("mealSlot") || "").trim(),
        activityType: String(formData.get("activityType") || "").trim(),
        transportMode: String(formData.get("transportMode") || "").trim(),
        transportOrigin: String(formData.get("transportOrigin") || "").trim(),
        transportDestination: String(formData.get("transportDestination") || "").trim(),
        timeStart: String(formData.get("timeStart") || "").trim(),
        timeEnd: String(formData.get("timeEnd") || "").trim(),
        timeIsEstimated: formData.get("timeIsEstimated") === "on",
        costLow: String(formData.get("costLow") || "").trim(),
        costHigh: String(formData.get("costHigh") || "").trim(),
        url: String(formData.get("url") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
      });

      tripStore.updateCurrentItem(updatedItem);
      appStore.updateTripDetail({
        isSavingItem: false,
        editingItemId: null,
        showDiscardConfirm: false,
      });
      itemEditorInitialSnapshot = "";
      pendingDiscardAction = null;
      rerenderTripDetail();
      showToast("Item updated.", "success");
    } catch (error) {
      console.error(error);
      appStore.updateTripDetail({
        isSavingItem: false,
      });
      rerenderTripDetail();
      showToast(getTripItemErrorMessage(error), "error");
    }
  });
}

export async function loadTripDetail(tripId) {
  appStore.updateTripDetail({
    status: "loading",
    error: "",
  });

  try {
    const bundle = await fetchTripDetailBundle(tripId);
    tripStore.setCurrentTripBundle(bundle);
    appStore.updateTripDetail({
      status: "ready",
      error: "",
      isCreatingItem: false,
      isSavingItem: false,
      editingItemId: null,
      showDiscardConfirm: false,
    });
    itemEditorInitialSnapshot = "";
    pendingDiscardAction = null;
    rerenderTripDetail();
  } catch (error) {
    console.error(error);
    tripStore.resetCurrentTrip();
    appStore.updateTripDetail({
      status: "error",
      error: "We could not load that trip.",
    });
    rerenderTripDetail();
  }
}

function renderMasterListRow(item, days, bases) {
  const day = days.find((entry) => entry.id === item.day_id);
  const base = bases.find((entry) => entry.id === item.base_id);
  const detailParts = [
    item.item_type === "meal" && item.meal_slot ? formatItemTypeLabel(item.meal_slot) : "",
    item.item_type === "activity" && item.activity_type ? formatItemTypeLabel(item.activity_type) : "",
    item.item_type === "transport" && item.transport_mode ? formatItemTypeLabel(item.transport_mode) : "",
    item.item_type === "transport" && (item.transport_origin || item.transport_destination)
      ? [item.transport_origin, item.transport_destination].filter(Boolean).join(" → ")
      : "",
    item.time_start ? formatTimeLabel(item.time_start, item.time_is_estimated) : "",
    item.time_end ? `to ${formatTimeLabel(item.time_end, false)}` : "",
    formatCostLabel(item.cost_low, item.cost_high),
  ].filter(Boolean);

  return `
    <article class="master-list-row">
      <div class="master-list-row__main">
        <div class="master-list-row__title-line">
          <h4>${item.title}</h4>
          ${item.is_anchor ? '<span class="trip-pill trip-pill--anchor">Anchor</span>' : ""}
        </div>
        <p class="muted">
          ${formatItemTypeLabel(item.item_type)} · ${formatStatusLabel(item.status)}
          ${base ? ` · ${base.name}` : " · Unassigned base"}
          ${day ? ` · Day ${day.day_number}` : " · Unassigned day"}
        </p>
        ${detailParts.length > 0 ? `<p class="master-list-row__details">${detailParts.join(" · ")}</p>` : ""}
      </div>
      <button class="button button--secondary master-list-row__action" data-edit-item="${item.id}" type="button">Edit</button>
    </article>
  `;
}

function renderItemEditorModal({ item, bases, days, isSaving }) {
  if (!item) {
    return `
      <div class="modal-shell is-hidden" id="item-editor-modal" aria-hidden="true">
        <div class="modal-backdrop" data-close-item-editor></div>
      </div>
    `;
  }

  return `
    <div class="modal-shell" id="item-editor-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-item-editor></div>
      <section class="panel modal-card">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Edit Item</p>
            <h3>${item.title}</h3>
          </div>
          <button class="icon-button" id="close-item-editor" type="button" aria-label="Close item editor">×</button>
        </div>

        <form class="item-editor-form" id="item-editor-form">
          <label class="field">
            <span>Title</span>
            <input name="title" type="text" maxlength="120" value="${escapeAttribute(item.title)}" required />
          </label>

          <div class="item-editor-form__grid">
            <label class="field">
              <span>Type</span>
              <select id="item-type-select" name="itemType" required>
                ${ITEM_TYPES.map((type) => `<option value="${type}" ${item.item_type === type ? "selected" : ""}>${formatItemTypeLabel(type)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Status</span>
              <select name="status" required>
                ${ITEM_STATUSES.map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>`).join("")}
              </select>
            </label>
          </div>

          <div class="item-editor-form__grid">
            <label class="field">
              <span>Base</span>
              <select name="baseId">
                <option value="">Unassigned</option>
                ${bases.map((base) => `<option value="${base.id}" ${item.base_id === base.id ? "selected" : ""}>${base.name}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Day</span>
              <select name="dayId">
                <option value="">Unassigned</option>
                ${days.map((day) => `<option value="${day.id}" ${item.day_id === day.id ? "selected" : ""}>Day ${day.day_number}${day.title ? ` · ${day.title}` : ""}</option>`).join("")}
              </select>
            </label>
          </div>

          <label class="checkbox-field">
            <input name="isAnchor" type="checkbox" ${item.is_anchor ? "checked" : ""} />
            <span>Anchor item</span>
          </label>

          <div class="item-editor-section">
            <p class="item-editor-section__title">Timing</p>
            <div class="item-editor-form__grid">
              <label class="field">
                <span>Start Time</span>
                <input name="timeStart" type="time" value="${item.time_start || ""}" />
              </label>
              <label class="field">
                <span>End Time</span>
                <input name="timeEnd" type="time" value="${item.time_end || ""}" />
              </label>
            </div>
            <label class="checkbox-field">
              <input name="timeIsEstimated" type="checkbox" ${item.time_is_estimated ? "checked" : ""} />
              <span>Time is estimated</span>
            </label>
          </div>

          ${renderTypeSpecificFields(item)}

          <div class="item-editor-section">
            <p class="item-editor-section__title">Cost</p>
            <div class="item-editor-form__grid">
              <label class="field">
                <span>Low / Exact</span>
                <input name="costLow" type="number" step="0.01" min="0" value="${item.cost_low ?? ""}" />
              </label>
              <label class="field">
                <span>High</span>
                <input name="costHigh" type="number" step="0.01" min="0" value="${item.cost_high ?? ""}" />
              </label>
            </div>
          </div>

          <div class="item-editor-section">
            <p class="item-editor-section__title">Details</p>
            <label class="field">
              <span>URL</span>
              <input name="url" type="url" value="${escapeAttribute(item.url || "")}" placeholder="https://..." />
            </label>
            <label class="field">
              <span>Notes</span>
              <textarea name="notes" rows="4" placeholder="Booking notes, reminders, context">${escapeTextarea(item.notes || "")}</textarea>
            </label>
          </div>

          <div class="modal-card__actions">
            <button class="button button--secondary" id="cancel-item-editor" type="button">Cancel</button>
            <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Changes"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function getTripItemErrorMessage(error) {
  const parts = [error?.message, error?.details, error?.hint].filter(Boolean);

  if (parts.length === 0) {
    return "Could not add that item right now.";
  }

  return parts.join(" ");
}

function closeItemEditor() {
  requestCloseItemEditor(() => {
    appStore.updateTripDetail({
      editingItemId: null,
      isSavingItem: false,
      showDiscardConfirm: false,
    });
    itemEditorInitialSnapshot = "";
    pendingDiscardAction = null;
    rerenderTripDetail();
  });
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeTextarea(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderTypeSpecificFields(item) {
  return `
    <div class="item-editor-section" data-item-type-section="meal">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Meal Slot</span>
        <select name="mealSlot">
          <option value="">None</option>
          ${MEAL_SLOTS.map((slot) => `<option value="${slot}" ${item.meal_slot === slot ? "selected" : ""}>${formatItemTypeLabel(slot)}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="item-editor-section" data-item-type-section="activity">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Activity Type</span>
        <select name="activityType">
          <option value="">None</option>
          ${ACTIVITY_TYPES.map((type) => `<option value="${type}" ${item.activity_type === type ? "selected" : ""}>${formatItemTypeLabel(type)}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="item-editor-section" data-item-type-section="transport">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Transport Mode</span>
        <select name="transportMode">
          <option value="">None</option>
          ${TRANSPORT_MODES.map((mode) => `<option value="${mode}" ${item.transport_mode === mode ? "selected" : ""}>${formatItemTypeLabel(mode)}</option>`).join("")}
        </select>
      </label>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Transport Origin</span>
          <input name="transportOrigin" type="text" value="${escapeAttribute(item.transport_origin || "")}" />
        </label>
        <label class="field">
          <span>Transport Destination</span>
          <input name="transportDestination" type="text" value="${escapeAttribute(item.transport_destination || "")}" />
        </label>
      </div>
    </div>
  `;
}

function syncItemEditorTypeFields() {
  const itemTypeSelect = document.querySelector("#item-type-select");
  const selectedType = itemTypeSelect?.value;

  document.querySelectorAll("[data-item-type-section]").forEach((section) => {
    const sectionType = section.getAttribute("data-item-type-section");
    const isActive = sectionType === selectedType;

    section.classList.toggle("is-hidden", !isActive);
    section.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !isActive;
    });
  });
}

function requestCloseItemEditor(onDiscard) {
  const editingItemId = appStore.getState().tripDetail.editingItemId;

  if (!editingItemId) {
    onDiscard();
    return;
  }

  if (!hasUnsavedItemEditorChanges()) {
    onDiscard();
    return;
  }

  pendingDiscardAction = onDiscard;
  appStore.updateTripDetail({
    showDiscardConfirm: true,
  });
  rerenderTripDetail();
}

function captureItemEditorInitialSnapshot() {
  const form = document.querySelector("#item-editor-form");

  if (!form) {
    itemEditorInitialSnapshot = "";
    return;
  }

  itemEditorInitialSnapshot = serializeItemEditorForm(form);
}

function hasUnsavedItemEditorChanges() {
  const form = document.querySelector("#item-editor-form");

  if (!form) {
    return false;
  }

  return serializeItemEditorForm(form) !== itemEditorInitialSnapshot;
}

function serializeItemEditorForm(form) {
  const formData = new FormData(form);

  const snapshot = {
    title: String(formData.get("title") || "").trim(),
    itemType: String(formData.get("itemType") || "").trim(),
    status: String(formData.get("status") || "").trim(),
    baseId: String(formData.get("baseId") || "").trim(),
    dayId: String(formData.get("dayId") || "").trim(),
    isAnchor: formData.get("isAnchor") === "on",
    timeStart: String(formData.get("timeStart") || "").trim(),
    timeEnd: String(formData.get("timeEnd") || "").trim(),
    timeIsEstimated: formData.get("timeIsEstimated") === "on",
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

  return JSON.stringify(snapshot);
}

function renderDiscardConfirmModal(isOpen) {
  if (!isOpen) {
    return "";
  }

  return `
    <div class="modal-shell" id="discard-confirm-modal" aria-hidden="false">
      <div class="modal-backdrop" data-keep-editing></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Unsaved Changes</p>
            <h3>Discard your edits?</h3>
          </div>
        </div>
        <p class="muted">You have unsaved changes in this item. If you close now, they will be lost.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="keep-editing-button" type="button">Keep Editing</button>
          <button class="button" id="discard-changes-button" type="button">Discard Changes</button>
        </div>
      </section>
    </div>
  `;
}

function wireDiscardConfirmModal() {
  document.querySelector("#keep-editing-button")?.addEventListener("click", keepEditing);
  document.querySelector("[data-keep-editing]")?.addEventListener("click", keepEditing);
  document.querySelector("#discard-changes-button")?.addEventListener("click", () => {
    const action = pendingDiscardAction;
    pendingDiscardAction = null;

    if (action) {
      action();
      return;
    }

    appStore.updateTripDetail({
      showDiscardConfirm: false,
    });
    rerenderTripDetail();
  });
}

function keepEditing() {
  pendingDiscardAction = null;
  appStore.updateTripDetail({
    showDiscardConfirm: false,
  });
  rerenderTripDetail();
}
