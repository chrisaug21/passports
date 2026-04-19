import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import {
  assignTripDaysToBase,
  createTripBase,
  createTripItem,
  fetchTripDetailBundle,
  updateTripBase,
  updateTripItem,
} from "../../services/trips-service.js";
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
  DEFAULT_BASE_TIMEZONE,
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
let itemEditorDraft = null;
let supportedTimezonesCache = null;

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
  const unassignedItems = items.filter((item) => !item.day_id);
  const assignedItems = items.filter((item) => item.day_id);

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
        <button class="trip-view-tabs__button ${tripDetail.viewMode === "master-list" ? "is-active" : ""}" data-view-mode="master-list" type="button">Master List</button>
        <button class="trip-view-tabs__button ${tripDetail.viewMode === "days" ? "is-active" : ""}" data-view-mode="days" type="button">Days View</button>
      </section>

      <section class="panel base-manager-panel">
        <div class="base-manager-panel__header">
          <div>
            <p class="eyebrow">Bases</p>
            <h3>Base Management</h3>
          </div>
          <button class="button button--secondary" id="show-add-base-form" type="button">Add Base</button>
        </div>

        <div class="base-list">
          ${bases.map((base) => renderBaseCard(base, days, tripDetail)).join("")}
        </div>

        ${tripDetail.isShowingAddBaseForm ? renderAddBaseForm(trip, bases.length, days) : ""}
      </section>

      ${
        tripDetail.viewMode === "master-list"
          ? `
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
      `
          : renderDaysView(bases, days, assignedItems, unassignedItems)
      }

      ${renderItemEditorModal({
        item: editingItem,
        bases,
        days,
        isSaving: tripDetail.isSavingItem,
      })}
      ${renderDiscardConfirmModal(tripDetail.showDiscardConfirm)}
      ${renderTimezoneOptionsDatalist()}
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
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const viewMode = button.getAttribute("data-view-mode");
      if (!viewMode) {
        return;
      }

      appStore.updateTripDetail({
        viewMode,
      });
      rerenderTripDetail();
    });
  });
  document.querySelector("#show-add-base-form")?.addEventListener("click", () => {
    appStore.updateTripDetail({
      isShowingAddBaseForm: true,
      editingBaseId: null,
      assigningBaseId: null,
    });
    rerenderTripDetail();
  });
  document.querySelector("#cancel-add-base")?.addEventListener("click", () => {
    appStore.updateTripDetail({
      isShowingAddBaseForm: false,
    });
    rerenderTripDetail();
  });
  document.querySelectorAll("[data-edit-base]").forEach((button) => {
    button.addEventListener("click", () => {
      const baseId = button.getAttribute("data-edit-base");
      appStore.updateTripDetail({
        editingBaseId: baseId,
        isShowingAddBaseForm: false,
        assigningBaseId: null,
      });
      rerenderTripDetail();
    });
  });
  document.querySelectorAll("[data-cancel-edit-base]").forEach((button) => {
    button.addEventListener("click", () => {
      appStore.updateTripDetail({
        editingBaseId: null,
      });
      rerenderTripDetail();
    });
  });
  document.querySelectorAll("[data-assign-base]").forEach((button) => {
    button.addEventListener("click", () => {
      const baseId = button.getAttribute("data-assign-base");
      appStore.updateTripDetail({
        assigningBaseId: baseId,
        isShowingAddBaseForm: false,
        editingBaseId: null,
      });
      rerenderTripDetail();
    });
  });
  document.querySelectorAll("[data-cancel-assign-base]").forEach((button) => {
    button.addEventListener("click", () => {
      appStore.updateTripDetail({
        assigningBaseId: null,
      });
      rerenderTripDetail();
    });
  });

  document.querySelector("#add-base-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const trip = tripStore.getCurrentTrip();
    const days = tripStore.getCurrentDays();
    const bases = tripStore.getCurrentBases();
    const formData = new FormData(event.currentTarget);
    const baseName = String(formData.get("name") || "").trim();
    const localTimezone = getValidatedTimezone(formData.get("localTimezone"));
    const startDay = Number(formData.get("startDay"));
    const endDay = Number(formData.get("endDay"));

    if (!localTimezone) {
      return;
    }

    if (!trip?.id || !baseName || !Number.isFinite(startDay) || !Number.isFinite(endDay)) {
      showToast("Add a base name and day range first.", "error");
      return;
    }

    const selectedDayIds = getDayIdsInRange(days, startDay, endDay);
    if (selectedDayIds.length === 0) {
      showToast("Choose a valid day range for that base.", "error");
      return;
    }

    appStore.updateTripDetail({
      isSavingBase: true,
    });
    rerenderTripDetail();

    try {
      const newBase = await createTripBase({
        tripId: trip.id,
        name: baseName,
        locationName: String(formData.get("locationName") || "").trim(),
        localTimezone,
        dateStart: String(formData.get("dateStart") || "").trim(),
        dateEnd: String(formData.get("dateEnd") || "").trim(),
        sortOrder: bases.length,
      });

      await assignTripDaysToBase({
        baseId: newBase.id,
        dayIds: selectedDayIds,
      });

      appStore.updateTripDetail({
        isSavingBase: false,
        isShowingAddBaseForm: false,
      });
      await loadTripDetail(trip.id);
      showToast("Base added.", "success");
    } catch (error) {
      console.error(error);
      appStore.updateTripDetail({
        isSavingBase: false,
      });
      rerenderTripDetail();
      showToast(getTripItemErrorMessage(error), "error");
    }
  });

  document.querySelectorAll("[data-edit-base-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const trip = tripStore.getCurrentTrip();
      const baseId = form.getAttribute("data-edit-base-form");
      const formData = new FormData(form);
      const localTimezone = getValidatedTimezone(formData.get("localTimezone"));

      if (!localTimezone) {
        return;
      }

      if (!trip?.id || !baseId) {
        return;
      }

      appStore.updateTripDetail({
        isSavingBase: true,
      });
      rerenderTripDetail();

      try {
        await updateTripBase({
          baseId,
          name: String(formData.get("name") || "").trim(),
          locationName: String(formData.get("locationName") || "").trim(),
          localTimezone,
          dateStart: String(formData.get("dateStart") || "").trim(),
          dateEnd: String(formData.get("dateEnd") || "").trim(),
        });

        appStore.updateTripDetail({
          isSavingBase: false,
          editingBaseId: null,
        });
        await loadTripDetail(trip.id);
        showToast("Base updated.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isSavingBase: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage(error), "error");
      }
    });
  });

  document.querySelectorAll("[data-assign-base-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const trip = tripStore.getCurrentTrip();
      const baseId = form.getAttribute("data-assign-base-form");
      const days = tripStore.getCurrentDays();
      const formData = new FormData(form);
      const startDay = Number(formData.get("startDay"));
      const endDay = Number(formData.get("endDay"));

      if (!trip?.id || !baseId || !Number.isFinite(startDay) || !Number.isFinite(endDay)) {
        showToast("Choose a valid day range first.", "error");
        return;
      }

      const selectedDayIds = getDayIdsInRange(days, startDay, endDay);
      if (selectedDayIds.length === 0) {
        showToast("Choose a valid day range first.", "error");
        return;
      }

      appStore.updateTripDetail({
        isSavingBase: true,
      });
      rerenderTripDetail();

      try {
        await assignTripDaysToBase({
          baseId,
          dayIds: selectedDayIds,
        });
        appStore.updateTripDetail({
          isSavingBase: false,
          assigningBaseId: null,
        });
        await loadTripDetail(trip.id);
        showToast("Days reassigned.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isSavingBase: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage(error), "error");
      }
    });
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
        const nextItem = tripStore.getCurrentItems().find((entry) => entry.id === itemId) || null;

        appStore.updateTripDetail({
          editingItemId: itemId,
          showDiscardConfirm: false,
        });
        itemEditorDraft = nextItem ? buildItemEditorDraft(nextItem) : null;
        itemEditorInitialSnapshot = itemEditorDraft ? serializeItemEditorDraft(itemEditorDraft) : "";
        pendingDiscardAction = null;
        rerenderTripDetail();
      });
    });
  });

  document.querySelector("#close-item-editor")?.addEventListener("click", closeItemEditor);
  document.querySelector("#cancel-item-editor")?.addEventListener("click", closeItemEditor);
  document.querySelector("[data-close-item-editor]")?.addEventListener("click", closeItemEditor);
  document.querySelector("#item-type-select")?.addEventListener("change", syncItemEditorTypeFields);
  document.querySelector('[name="baseId"]')?.addEventListener("change", syncItemEditorAssignmentHint);
  document.querySelector('[name="dayId"]')?.addEventListener("change", syncItemEditorAssignmentHint);
  syncItemEditorTypeFields();
  syncItemEditorAssignmentHint();
  ensureItemEditorInitialSnapshot();
  wireDiscardConfirmModal();
  document.querySelector("#item-editor-form")?.addEventListener("input", syncItemEditorDraftFromForm);
  document.querySelector("#item-editor-form")?.addEventListener("change", syncItemEditorDraftFromForm);

  document.querySelector("#item-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentItemId = appStore.getState().tripDetail.editingItemId;
    if (!currentItemId) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const nextBaseId = normalizeNullableId(formData.get("baseId"));
    const nextDayId = normalizeNullableId(formData.get("dayId"));

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
      itemEditorDraft = null;
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
      isShowingAddBaseForm: false,
      editingBaseId: null,
      assigningBaseId: null,
      isSavingBase: false,
    });
    itemEditorInitialSnapshot = "";
    itemEditorDraft = null;
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
          ${base ? ` · ${base.name}` : ""}
          ${day ? ` · Day ${day.day_number}` : " · Unassigned day"}
        </p>
        ${detailParts.length > 0 ? `<p class="master-list-row__details">${detailParts.join(" · ")}</p>` : ""}
      </div>
      <button class="button button--secondary master-list-row__action" data-edit-item="${item.id}" type="button">Edit</button>
    </article>
  `;
}

function renderBaseCard(base, days, tripDetail) {
  const dayRange = getBaseDayRange(base.id, days);
  const isEditing = tripDetail.editingBaseId === base.id;
  const isAssigning = tripDetail.assigningBaseId === base.id;

  return `
    <article class="base-card">
      <div class="base-card__header">
        <div>
          <h4>${base.name}</h4>
          <p class="muted">
            ${base.location_name || "No location name"}
            · ${base.local_timezone}
            ${dayRange ? ` · Days ${dayRange.start}-${dayRange.end}` : " · No assigned days"}
          </p>
        </div>
        <div class="base-card__actions">
          <button class="button button--secondary" data-edit-base="${base.id}" type="button">Edit Base</button>
          <button class="button button--secondary" data-assign-base="${base.id}" type="button">Assign Days</button>
        </div>
      </div>
      ${isEditing ? renderEditBaseForm(base, tripDetail.isSavingBase) : ""}
      ${isAssigning ? renderAssignBaseForm(base, dayRange, tripDetail.isSavingBase) : ""}
    </article>
  `;
}

function renderAddBaseForm(trip, currentBaseCount, days) {
  return `
    <form class="base-form" id="add-base-form">
      <div class="base-form__header">
        <h4>Add Base</h4>
        <button class="button button--secondary" id="cancel-add-base" type="button">Cancel</button>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Name</span>
          <input name="name" type="text" maxlength="120" placeholder="Barcelona" required />
        </label>
        <label class="field">
          <span>Location Name</span>
          <input name="locationName" type="text" maxlength="120" placeholder="Barcelona, Spain" />
        </label>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Timezone</span>
          ${renderTimezonePicker("add-base-timezone", DEFAULT_BASE_TIMEZONE)}
        </label>
        <label class="field">
          <span>Suggested Order</span>
          <input type="text" value="${currentBaseCount + 1}" disabled />
        </label>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Date Start</span>
          <input name="dateStart" type="date" />
        </label>
        <label class="field">
          <span>Date End</span>
          <input name="dateEnd" type="date" />
        </label>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Start Day</span>
          <input name="startDay" type="number" min="1" max="${trip.trip_length}" value="${Math.max(1, days.length)}" required />
        </label>
        <label class="field">
          <span>End Day</span>
          <input name="endDay" type="number" min="1" max="${trip.trip_length}" value="${trip.trip_length}" required />
        </label>
      </div>
      <div class="base-form__actions">
        <button class="button" type="submit">Save Base</button>
      </div>
    </form>
  `;
}

function renderEditBaseForm(base, isSaving) {
  return `
    <form class="base-form" data-edit-base-form="${base.id}">
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Name</span>
          <input name="name" type="text" value="${escapeAttribute(base.name)}" required />
        </label>
        <label class="field">
          <span>Location Name</span>
          <input name="locationName" type="text" value="${escapeAttribute(base.location_name || "")}" />
        </label>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Timezone</span>
          ${renderTimezonePicker(`edit-base-timezone-${base.id}`, base.local_timezone || DEFAULT_BASE_TIMEZONE)}
        </label>
        <label class="field">
          <span>Date Start</span>
          <input name="dateStart" type="date" value="${base.date_start || ""}" />
        </label>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Date End</span>
          <input name="dateEnd" type="date" value="${base.date_end || ""}" />
        </label>
      </div>
      <div class="base-form__actions">
        <button class="button button--secondary" data-cancel-edit-base type="button">Cancel</button>
        <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Base"}</button>
      </div>
    </form>
  `;
}

function renderAssignBaseForm(base, dayRange, isSaving) {
  return `
    <form class="base-form" data-assign-base-form="${base.id}">
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Start Day</span>
          <input name="startDay" type="number" min="1" value="${dayRange?.start || ""}" required />
        </label>
        <label class="field">
          <span>End Day</span>
          <input name="endDay" type="number" min="1" value="${dayRange?.end || ""}" required />
        </label>
      </div>
      <div class="base-form__actions">
        <button class="button button--secondary" data-cancel-assign-base type="button">Cancel</button>
        <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Assign Days"}</button>
      </div>
    </form>
  `;
}

function renderDaysView(bases, days, assignedItems, unassignedItems) {
  const sortedUnassignedItems = [...unassignedItems].sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0));

  return `
    <section class="days-view">
      ${sortedUnassignedItems.length > 0 ? `
        <section class="panel days-view__pool">
          <div class="days-view__panel-header">
            <div>
              <p class="eyebrow">Unassigned Pool</p>
              <h3>Unassigned Items</h3>
            </div>
            <p class="muted">Items without a day assignment still live here.</p>
          </div>
          <div class="days-view__list">
            ${sortedUnassignedItems.map((item) => renderDayItem(item)).join("")}
          </div>
        </section>
      ` : ""}

      ${bases.map((base) => renderBaseDaysSection(base, days, assignedItems, bases.length)).join("")}
    </section>
  `;
}

function renderBaseDaysSection(base, days, items, baseCount) {
  const baseDays = days.filter((day) => day.base_id === base.id);

  return `
    <section class="panel days-base-section">
      ${baseCount > 1 ? `
        <div class="days-view__panel-header">
          <div>
            <p class="eyebrow">Base</p>
            <h3>${base.name}</h3>
          </div>
          <p class="muted">${base.location_name || base.local_timezone}</p>
        </div>
      ` : `
        <div class="days-view__panel-header">
          <div>
            <p class="eyebrow">Days View</p>
            <h3>${base.name}</h3>
          </div>
          <p class="muted">${base.location_name || base.local_timezone}</p>
        </div>
      `}
      <div class="day-card-grid">
        ${baseDays.map((day) => renderDayCard(day, items)).join("")}
      </div>
    </section>
  `;
}

function renderDayCard(day, items) {
  const dayItems = items
    .filter((item) => item.day_id === day.id)
    .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0));

  return `
    <article class="day-card">
      <div class="day-card__header">
        <div>
          <p class="eyebrow">Day ${day.day_number}</p>
          <h4>${day.title || `Day ${day.day_number}`}</h4>
        </div>
        ${day.location_name ? `<p class="muted">${day.location_name}</p>` : ""}
      </div>
      ${
        dayItems.length === 0
          ? `<div class="day-card__empty"><p class="muted">No items assigned yet.</p></div>`
          : `<div class="days-view__list">${dayItems.map((item) => renderDayItem(item)).join("")}</div>`
      }
    </article>
  `;
}

function renderDayItem(item) {
  const detailParts = [
    item.time_start ? formatTimeLabel(item.time_start, item.time_is_estimated) : "",
    item.item_type === "meal" && item.meal_slot ? formatItemTypeLabel(item.meal_slot) : "",
    item.item_type === "activity" && item.activity_type ? formatItemTypeLabel(item.activity_type) : "",
    item.item_type === "transport" && item.transport_mode ? formatItemTypeLabel(item.transport_mode) : "",
  ].filter(Boolean);

  return `
    <article class="day-item">
      <div class="day-item__title-line">
        <h5>${item.title}</h5>
        ${item.is_anchor ? '<span class="trip-pill trip-pill--anchor">Anchor</span>' : ""}
      </div>
      <p class="muted">${formatItemTypeLabel(item.item_type)} · ${formatStatusLabel(item.status)}</p>
      ${detailParts.length > 0 ? `<p class="day-item__details">${detailParts.join(" · ")}</p>` : ""}
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

  const draft = itemEditorDraft || buildItemEditorDraft(item);

  return `
    <div class="modal-shell" id="item-editor-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-item-editor></div>
      <section class="panel modal-card">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Edit Item</p>
            <h3>${draft.title}</h3>
          </div>
          <button class="icon-button" id="close-item-editor" type="button" aria-label="Close item editor">×</button>
        </div>

        <form class="item-editor-form" id="item-editor-form">
          <label class="field">
            <span>Title</span>
            <input name="title" type="text" maxlength="120" value="${escapeAttribute(draft.title)}" required />
          </label>

          <div class="item-editor-form__grid">
            <label class="field">
              <span>Type</span>
              <select id="item-type-select" name="itemType" required>
                ${ITEM_TYPES.map((type) => `<option value="${type}" ${draft.itemType === type ? "selected" : ""}>${formatItemTypeLabel(type)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Status</span>
              <select name="status" required>
                ${ITEM_STATUSES.map((status) => `<option value="${status}" ${draft.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>`).join("")}
              </select>
            </label>
          </div>

          <div class="item-editor-form__grid">
            <label class="field">
              <span>Base</span>
              <select name="baseId">
                <option value="">Unassigned</option>
                ${bases.map((base) => `<option value="${base.id}" ${draft.baseId === base.id ? "selected" : ""}>${base.name}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Day</span>
              <select name="dayId">
                <option value="">Unassigned</option>
                ${days.map((day) => {
                  const dayBase = bases.find((base) => base.id === day.base_id);
                  return `<option value="${day.id}" ${draft.dayId === day.id ? "selected" : ""}>Day ${day.day_number}${day.title ? ` · ${day.title}` : ""}${dayBase ? ` · ${dayBase.name}` : ""}</option>`;
                }).join("")}
              </select>
            </label>
          </div>
          <p class="field-hint ${getItemEditorAssignmentHint(draft.baseId, draft.dayId, bases, days) ? "" : "is-hidden"}" id="item-editor-assignment-hint">${getItemEditorAssignmentHint(draft.baseId, draft.dayId, bases, days) || ""}</p>

          <label class="checkbox-field">
            <input name="isAnchor" type="checkbox" ${draft.isAnchor ? "checked" : ""} />
            <span>Anchor item</span>
          </label>

          <div class="item-editor-section">
            <p class="item-editor-section__title">Timing</p>
            <div class="item-editor-form__grid">
              <label class="field">
                <span>Start Time</span>
                <input name="timeStart" type="time" value="${draft.timeStart || ""}" />
              </label>
              <label class="field">
                <span>End Time</span>
                <input name="timeEnd" type="time" value="${draft.timeEnd || ""}" />
              </label>
            </div>
            <label class="checkbox-field">
              <input name="timeIsEstimated" type="checkbox" ${draft.timeIsEstimated ? "checked" : ""} />
              <span>Time is estimated</span>
            </label>
          </div>

          ${renderTypeSpecificFields(draft)}

          <div class="item-editor-section">
            <p class="item-editor-section__title">Cost</p>
            <div class="item-editor-form__grid">
              <label class="field">
                <span>Low / Exact</span>
                <input name="costLow" type="number" step="0.01" min="0" value="${draft.costLow ?? ""}" />
              </label>
              <label class="field">
                <span>High</span>
                <input name="costHigh" type="number" step="0.01" min="0" value="${draft.costHigh ?? ""}" />
              </label>
            </div>
          </div>

          <div class="item-editor-section">
            <p class="item-editor-section__title">Details</p>
            <label class="field">
              <span>URL</span>
              <input name="url" type="url" value="${escapeAttribute(draft.url || "")}" placeholder="https://..." />
            </label>
            <label class="field">
              <span>Notes</span>
              <textarea name="notes" rows="4" placeholder="Booking notes, reminders, context">${escapeTextarea(draft.notes || "")}</textarea>
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
    itemEditorDraft = null;
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

function renderTypeSpecificFields(draft) {
  return `
    <div class="item-editor-section" data-item-type-section="meal">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Meal Slot</span>
        <select name="mealSlot">
          <option value="">None</option>
          ${MEAL_SLOTS.map((slot) => `<option value="${slot}" ${draft.mealSlot === slot ? "selected" : ""}>${formatItemTypeLabel(slot)}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="item-editor-section" data-item-type-section="activity">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Activity Type</span>
        <select name="activityType">
          <option value="">None</option>
          ${ACTIVITY_TYPES.map((type) => `<option value="${type}" ${draft.activityType === type ? "selected" : ""}>${formatItemTypeLabel(type)}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="item-editor-section" data-item-type-section="transport">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Transport Mode</span>
        <select name="transportMode">
          <option value="">None</option>
          ${TRANSPORT_MODES.map((mode) => `<option value="${mode}" ${draft.transportMode === mode ? "selected" : ""}>${formatItemTypeLabel(mode)}</option>`).join("")}
        </select>
      </label>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Transport Origin</span>
          <input name="transportOrigin" type="text" value="${escapeAttribute(draft.transportOrigin || "")}" />
        </label>
        <label class="field">
          <span>Transport Destination</span>
          <input name="transportDestination" type="text" value="${escapeAttribute(draft.transportDestination || "")}" />
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

function syncItemEditorAssignmentHint() {
  const hintElement = document.querySelector("#item-editor-assignment-hint");
  if (!hintElement) {
    return;
  }

  const form = document.querySelector("#item-editor-form");
  if (!form) {
    return;
  }

  const formData = new FormData(form);
  const baseId = String(formData.get("baseId") || "").trim();
  const dayId = String(formData.get("dayId") || "").trim();
  const bases = tripStore.getCurrentBases();
  const days = tripStore.getCurrentDays();
  const hint = getItemEditorAssignmentHint(baseId, dayId, bases, days);

  hintElement.textContent = hint || "";
  hintElement.classList.toggle("is-hidden", !hint);
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
  if (!itemEditorDraft) {
    const editingItemId = appStore.getState().tripDetail.editingItemId;
    const item = tripStore.getCurrentItems().find((entry) => entry.id === editingItemId);

    if (!item) {
      itemEditorInitialSnapshot = "";
      return;
    }

    itemEditorDraft = buildItemEditorDraft(item);
  }

  itemEditorInitialSnapshot = serializeItemEditorDraft(itemEditorDraft);
}

function ensureItemEditorInitialSnapshot() {
  if (itemEditorInitialSnapshot) {
    return;
  }

  captureItemEditorInitialSnapshot();
}

function hasUnsavedItemEditorChanges() {
  syncItemEditorDraftFromForm();

  if (!itemEditorDraft) {
    return false;
  }

  return serializeItemEditorDraft(itemEditorDraft) !== itemEditorInitialSnapshot;
}

function syncItemEditorDraftFromForm() {
  const form = document.querySelector("#item-editor-form");

  if (!form) {
    return;
  }

  const formData = new FormData(form);

  itemEditorDraft = {
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
}

function serializeItemEditorDraft(draft) {
  return JSON.stringify(draft);
}

function buildItemEditorDraft(item) {
  return {
    title: item.title || "",
    itemType: item.item_type || "",
    status: item.status || "",
    baseId: item.base_id || "",
    dayId: item.day_id || "",
    isAnchor: Boolean(item.is_anchor),
    timeStart: item.time_start || "",
    timeEnd: item.time_end || "",
    timeIsEstimated: Boolean(item.time_is_estimated),
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

function getItemEditorAssignmentHint(baseId, dayId, bases, days) {
  if (!baseId || !dayId) {
    return "";
  }

  const selectedDay = days.find((day) => day.id === dayId);
  if (!selectedDay || selectedDay.base_id === baseId) {
    return "";
  }

  const dayBase = bases.find((base) => base.id === selectedDay.base_id);
  if (!dayBase) {
    return "";
  }

  return `Day ${selectedDay.day_number} is in ${dayBase.name} — update base to match?`;
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

function getBaseDayRange(baseId, days) {
  const baseDays = days.filter((day) => day.base_id === baseId);

  if (baseDays.length === 0) {
    return null;
  }

  const dayNumbers = baseDays.map((day) => day.day_number).sort((left, right) => left - right);

  return {
    start: dayNumbers[0],
    end: dayNumbers[dayNumbers.length - 1],
  };
}

function getDayIdsInRange(days, startDay, endDay) {
  const low = Math.min(startDay, endDay);
  const high = Math.max(startDay, endDay);

  return days
    .filter((day) => day.day_number >= low && day.day_number <= high)
    .map((day) => day.id);
}

function getSupportedTimezones() {
  if (supportedTimezonesCache) {
    return supportedTimezonesCache;
  }

  if (typeof Intl?.supportedValuesOf === "function") {
    try {
      supportedTimezonesCache = Intl.supportedValuesOf("timeZone").slice().sort((left, right) => left.localeCompare(right));
      return supportedTimezonesCache;
    } catch (_error) {
      // Ignore and fall back to the default timezone.
    }
  }

  supportedTimezonesCache = [DEFAULT_BASE_TIMEZONE];
  return supportedTimezonesCache;
}

function renderTimezonePicker(inputId, selectedTimezone) {
  return `
    <input
      id="${inputId}"
      name="localTimezone"
      type="text"
      list="timezone-options"
      value="${escapeAttribute(selectedTimezone || DEFAULT_BASE_TIMEZONE)}"
      placeholder="Start typing a timezone"
      autocomplete="off"
      required
    />
  `;
}

function renderTimezoneOptionsDatalist() {
  return `
    <datalist id="timezone-options">
      ${getSupportedTimezones().map((timezone) => `<option value="${escapeAttribute(timezone)}"></option>`).join("")}
    </datalist>
  `;
}

function getValidatedTimezone(rawValue) {
  const timezone = String(rawValue || "").trim();

  if (!timezone) {
    showToast("Choose a timezone from the list first.", "error");
    return null;
  }

  if (!getSupportedTimezones().includes(timezone)) {
    showToast("Choose a valid IANA timezone from the list.", "error");
    return null;
  }

  return timezone;
}

function normalizeNullableId(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function keepEditing() {
  pendingDiscardAction = null;
  appStore.updateTripDetail({
    showDiscardConfirm: false,
  });
  rerenderTripDetail();
}
