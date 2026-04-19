import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import {
  createTripBase,
  createTripItem,
  fetchTripDetailBundle,
  saveTripDayAllocations,
  softDeleteTrip,
  softDeleteTripBase,
  softDeleteTripItem,
  updateTripStatus,
  updateTripBase,
  updateTripSettings,
  updateTripItem,
} from "../../services/trips-service.js";
import {
  formatCostLabel,
  formatDayDateLabel,
  formatItemTypeLabel,
  formatLongDate,
  formatShortDateRange,
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
import { updateTripDayTitle } from "../../services/days-service.js";

let rerenderTripDetail = () => {};
let itemEditorInitialSnapshot = "";
let pendingDiscardAction = null;
let itemEditorDraft = null;
let supportedTimezonesCache = null;
let allocationDraft = null;
let allocationConfirmState = null;
let pendingTripSettingsDraft = null;
let tripLengthConfirmState = null;
let editingDayTitleId = null;
let editingDayTitleValue = "";

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

  const allocationState = getAllocationState(trip, days);
  const allocationRows = buildAllocationRows(bases, allocationState.days);
  const allocationSummary = getAllocationSummary(trip, allocationRows, allocationState.tripLength);

  return `
    <section class="trip-detail">
      <button class="text-link" id="trip-back-to-dashboard" type="button">← Back to Dashboard</button>

      <section class="panel trip-header">
        <div class="trip-header__meta">
          <p class="eyebrow">Master List</p>
          <h2 class="trip-header__title">${escapeHtml(trip.title || "Untitled trip")}</h2>
          <p class="muted">${escapeHtml(trip.description || "Trip details are starting here. Master List will be the main planning workspace.")}</p>
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
          <p class="muted">${bases.length === 1 ? escapeHtml(bases[0]?.name || "Main Base") : "Cities or stays in this trip"}</p>
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

      <section class="panel trip-settings-panel">
        <div class="trip-settings-panel__header">
          <div>
            <p class="eyebrow">Trip</p>
            <h3>Trip Settings</h3>
          </div>
          <button class="button button--secondary" id="toggle-trip-settings" type="button">
            ${tripDetail.isShowingTripSettings ? "Hide Settings" : "Edit Trip"}
          </button>
        </div>

        ${
          tripDetail.isShowingTripSettings
            ? renderTripSettingsForm(trip, tripDetail.isSavingTrip)
            : renderTripSettingsSummary(trip)
        }
      </section>

      <section class="trip-view-tabs">
        <button class="trip-view-tabs__button ${tripDetail.viewMode === "master-list" ? "is-active" : ""}" data-view-mode="master-list" type="button">Master List</button>
        <button class="trip-view-tabs__button ${tripDetail.viewMode === "days" ? "is-active" : ""}" data-view-mode="days" type="button">Days View</button>
      </section>

      <section class="panel base-manager-panel">
        <div class="base-manager-panel__header">
          <div>
            <p class="eyebrow">Bases</p>
            <h3>Day Allocation</h3>
          </div>
          <button class="button button--secondary" id="show-add-base-form" type="button">Add Base</button>
        </div>

        <div class="allocation-list">
          ${allocationRows.map((row) => renderAllocationRow(row, trip, tripDetail, items, bases, allocationState.tripLength)).join("")}
        </div>

        <p class="muted ${allocationSummary.isComplete ? "allocation-summary--complete" : "allocation-summary--warning"}">${escapeHtml(allocationSummary.label)}</p>

        ${
          hasAllocationDraftChanges(trip, days)
            ? `
              <div class="base-form__actions">
                <button class="button button--secondary" id="cancel-allocation-changes" type="button">Cancel Changes</button>
                <button class="button" id="save-allocation-changes" type="button" ${tripDetail.isSavingBase ? "disabled" : ""}>${tripDetail.isSavingBase ? "Saving…" : "Save Allocation"}</button>
              </div>
            `
            : ""
        }

        ${tripDetail.isShowingAddBaseForm ? renderAddBaseForm(bases.length) : ""}
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
        isDeleting: tripDetail.isDeletingItem && tripDetail.deletingItemId === editingItem?.id,
      })}
      ${renderDiscardConfirmModal(tripDetail.showDiscardConfirm)}
      ${renderDeleteItemConfirmModal({
        item: items.find((entry) => entry.id === tripDetail.deletingItemId) || null,
        isOpen: tripDetail.showDeleteItemConfirm,
        isDeleting: tripDetail.isDeletingItem,
      })}
      ${renderAllocationConfirmModal(allocationConfirmState)}
      ${renderTripLengthConfirmModal(tripLengthConfirmState)}
      ${renderDeleteBaseConfirmModal({
        base: bases.find((entry) => entry.id === tripDetail.deletingBaseId) || null,
        isOpen: tripDetail.showDeleteBaseConfirm,
        isDeleting: tripDetail.isDeletingBase,
      })}
      ${renderTripStatusConfirmModal({
        trip,
        isOpen: tripDetail.showTripStatusConfirm,
        pendingStatus: tripDetail.pendingTripStatus,
        isSaving: tripDetail.isUpdatingTripStatus,
      })}
      ${renderDeleteTripConfirmModal({
        trip,
        isOpen: tripDetail.showDeleteTripConfirm,
        isDeleting: tripDetail.isDeletingTrip,
      })}
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
  document.querySelector("#toggle-trip-settings")?.addEventListener("click", () => {
    const { isShowingTripSettings } = appStore.getState().tripDetail;
    appStore.updateTripDetail({
      isShowingTripSettings: !isShowingTripSettings,
    });
    rerenderTripDetail();
  });
  document.querySelector("#cancel-trip-settings")?.addEventListener("click", () => {
    pendingTripSettingsDraft = null;
    tripLengthConfirmState = null;
    appStore.updateTripDetail({
      isShowingTripSettings: false,
      isSavingTrip: false,
    });
    rerenderTripDetail();
  });
  document.querySelector("#mark-trip-done")?.addEventListener("click", () => {
    appStore.updateTripDetail({
      showTripStatusConfirm: true,
      pendingTripStatus: "done",
    });
    rerenderTripDetail();
  });
  document.querySelector("#reopen-trip")?.addEventListener("click", async () => {
    const trip = tripStore.getCurrentTrip();

    if (!trip?.id) {
      return;
    }

    appStore.updateTripDetail({
      isUpdatingTripStatus: true,
    });
    rerenderTripDetail();

    try {
      const updatedTrip = await updateTripStatus({
        tripId: trip.id,
        status: "planning",
      });
      tripStore.updateCurrentTrip(updatedTrip);
      appStore.updateTripDetail({
        isUpdatingTripStatus: false,
      });
      rerenderTripDetail();
      showToast("Trip reopened.", "success");
    } catch (error) {
      console.error(error);
      appStore.updateTripDetail({
        isUpdatingTripStatus: false,
      });
      rerenderTripDetail();
      showToast(getTripItemErrorMessage("tripUpdate"), "error");
    }
  });
  document.querySelector("#open-delete-trip-confirm")?.addEventListener("click", () => {
    appStore.updateTripDetail({
      showDeleteTripConfirm: true,
    });
    rerenderTripDetail();
  });
  document.querySelector("#trip-settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const trip = tripStore.getCurrentTrip();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") || "").trim();
    const tripLength = Number(formData.get("tripLength"));

    if (!trip?.id || !title || !Number.isFinite(tripLength) || tripLength < 1) {
      showToast("Add a title and a valid trip length first.", "error");
      return;
    }

    const nextSettings = {
      tripId: trip.id,
      title,
      description: String(formData.get("description") || "").trim(),
      startDate: String(formData.get("startDate") || "").trim(),
      tripLength,
    };
    const shrinkSummary = getTripShrinkSummary(tripLength, tripStore.getCurrentDays(), tripStore.getCurrentItems());

    if (tripLength < Number(trip.trip_length) && shrinkSummary.itemCount > 0) {
      pendingTripSettingsDraft = nextSettings;
      tripLengthConfirmState = shrinkSummary;
      rerenderTripDetail();
      return;
    }

    saveTripSettings(nextSettings);
  });
  document.querySelector("#show-add-base-form")?.addEventListener("click", () => {
    appStore.updateTripDetail({
      isShowingAddBaseForm: true,
      editingBaseId: null,
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
  document.querySelectorAll("[data-allocation-adjust]").forEach((button) => {
    button.addEventListener("click", () => {
      const slotKey = button.getAttribute("data-slot-key");
      const direction = button.getAttribute("data-allocation-adjust");

      if (!slotKey || !direction) {
        return;
      }

      requestAllocationChange(slotKey, direction);
    });
  });
  document.querySelector("#cancel-allocation-changes")?.addEventListener("click", () => {
    allocationDraft = null;
    allocationConfirmState = null;
    rerenderTripDetail();
  });
  document.querySelector("#save-allocation-changes")?.addEventListener("click", async () => {
    const trip = tripStore.getCurrentTrip();

    if (!trip?.id || !allocationDraft) {
      return;
    }

    appStore.updateTripDetail({
      isSavingBase: true,
    });
    rerenderTripDetail();

    try {
      await saveAllocationDraft(trip);
      allocationDraft = null;
      allocationConfirmState = null;
      appStore.updateTripDetail({
        isSavingBase: false,
      });
      await loadTripDetail(trip.id);
      showToast("Day allocation updated.", "success");
    } catch (error) {
      console.error(error);
      appStore.updateTripDetail({
        isSavingBase: false,
      });
      rerenderTripDetail();
      showToast(
        error?.message === "TRIP_LENGTH_UPDATED_ALLOCATIONS_FAILED"
          ? "Trip length updated, but day allocations didn't save — try again."
          : getTripItemErrorMessage("update"),
        "error"
      );
    }
  });
  document.querySelector("#cancel-allocation-confirm")?.addEventListener("click", () => {
    allocationConfirmState = null;
    rerenderTripDetail();
  });
  document.querySelector("[data-close-allocation-confirm]")?.addEventListener("click", () => {
    allocationConfirmState = null;
    rerenderTripDetail();
  });
  document.querySelector("#confirm-allocation-change")?.addEventListener("click", () => {
    if (!allocationConfirmState?.action) {
      return;
    }

    const action = allocationConfirmState.action;
    allocationConfirmState = null;
    applyAllocationChange(action.slotKey, action.direction);
  });
  document.querySelector("#cancel-trip-length-confirm")?.addEventListener("click", () => {
    pendingTripSettingsDraft = null;
    tripLengthConfirmState = null;
    rerenderTripDetail();
  });
  document.querySelector("[data-close-trip-length-confirm]")?.addEventListener("click", () => {
    pendingTripSettingsDraft = null;
    tripLengthConfirmState = null;
    rerenderTripDetail();
  });
  document.querySelector("#confirm-trip-length-change")?.addEventListener("click", () => {
    const pendingSettings = pendingTripSettingsDraft;

    if (!pendingSettings) {
      return;
    }

    pendingTripSettingsDraft = null;
    tripLengthConfirmState = null;
    saveTripSettings(pendingSettings);
  });

  document.querySelector("#add-base-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const trip = tripStore.getCurrentTrip();
    const bases = tripStore.getCurrentBases();
    const formData = new FormData(event.currentTarget);
    const baseName = String(formData.get("name") || "").trim();
    const localTimezone = getValidatedTimezone(formData.get("localTimezone"));

    if (!localTimezone) {
      return;
    }

    if (!trip?.id || !baseName) {
      showToast("Add a base name first.", "error");
      return;
    }

    appStore.updateTripDetail({
      isSavingBase: true,
    });
    rerenderTripDetail();

    try {
      await createTripBase({
        tripId: trip.id,
        name: baseName,
        locationName: String(formData.get("locationName") || "").trim(),
        localTimezone,
        sortOrder: bases.length,
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
      showToast(getTripItemErrorMessage("create"), "error");
    }
  });

  document.querySelectorAll("[data-edit-base-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const trip = tripStore.getCurrentTrip();
      const baseId = form.getAttribute("data-edit-base-form");
      const formData = new FormData(form);
      const localTimezone = getValidatedTimezone(formData.get("localTimezone"));

      if (!localTimezone || !trip?.id || !baseId) {
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
        showToast(getTripItemErrorMessage("update"), "error");
      }
    });
  });
  document.querySelectorAll("[data-delete-base]").forEach((button) => {
    button.addEventListener("click", () => {
      const baseId = button.getAttribute("data-delete-base");

      if (!baseId) {
        return;
      }

      appStore.updateTripDetail({
        showDeleteBaseConfirm: true,
        deletingBaseId: baseId,
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
      showToast(getTripItemErrorMessage("create"), "error");
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
  document.querySelectorAll("[data-request-delete-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.getAttribute("data-request-delete-item");

      if (!itemId) {
        return;
      }

      openDeleteItemConfirm(itemId);
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
      showToast(getTripItemErrorMessage("update"), "error");
    }
  });
  document.querySelector("#delete-item-button")?.addEventListener("click", () => {
    const { editingItemId } = appStore.getState().tripDetail;
    if (!editingItemId) {
      return;
    }

    openDeleteItemConfirm(editingItemId);
  });
  document.querySelector("#cancel-delete-item")?.addEventListener("click", closeDeleteItemConfirm);
  document.querySelector("[data-cancel-delete-item]")?.addEventListener("click", closeDeleteItemConfirm);
  document.querySelector("#confirm-delete-item")?.addEventListener("click", async () => {
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
      itemEditorDraft = null;
      itemEditorInitialSnapshot = "";
      pendingDiscardAction = null;
      rerenderTripDetail();
      showToast(`${getDisplayTitleForToast(deletedItem?.title, "Item")} deleted`, "success");
    } catch (error) {
      console.error(error);
      appStore.updateTripDetail({
        isDeletingItem: false,
      });
      rerenderTripDetail();
      showToast(getTripItemErrorMessage("delete"), "error");
    }
  });
  document.querySelector("#cancel-delete-base")?.addEventListener("click", closeDeleteBaseConfirm);
  document.querySelector("[data-cancel-delete-base]")?.addEventListener("click", closeDeleteBaseConfirm);
  document.querySelector("#confirm-delete-base")?.addEventListener("click", async () => {
    const trip = tripStore.getCurrentTrip();
    const bases = tripStore.getCurrentBases();
    const { deletingBaseId } = appStore.getState().tripDetail;
    const base = bases.find((entry) => entry.id === deletingBaseId) || null;

    if (!trip?.id || !deletingBaseId || !base) {
      return;
    }

    appStore.updateTripDetail({
      isDeletingBase: true,
    });
    rerenderTripDetail();

    try {
      await softDeleteTripBase(deletingBaseId);
      tripStore.removeCurrentBase(deletingBaseId);
      appStore.updateTripDetail({
        isDeletingBase: false,
        showDeleteBaseConfirm: false,
        deletingBaseId: null,
        editingBaseId: null,
      });
      rerenderTripDetail();
      showToast(`${getDisplayTitleForToast(base.name, "Base")} deleted`, "success");
    } catch (error) {
      console.error(error);
      appStore.updateTripDetail({
        isDeletingBase: false,
      });
      rerenderTripDetail();
      showToast(
        error?.message === "BASE_HAS_ASSIGNED_DAYS"
          ? "Remove all days from this base before deleting."
          : getTripItemErrorMessage("baseDelete"),
        "error"
      );
    }
  });
  document.querySelector("#cancel-trip-status-confirm")?.addEventListener("click", closeTripStatusConfirm);
  document.querySelector("[data-cancel-trip-status-confirm]")?.addEventListener("click", closeTripStatusConfirm);
  document.querySelector("#confirm-trip-status-change")?.addEventListener("click", async () => {
    const trip = tripStore.getCurrentTrip();
    const { pendingTripStatus } = appStore.getState().tripDetail;

    if (!trip?.id || !pendingTripStatus) {
      return;
    }

    appStore.updateTripDetail({
      isUpdatingTripStatus: true,
    });
    rerenderTripDetail();

    try {
      const updatedTrip = await updateTripStatus({
        tripId: trip.id,
        status: pendingTripStatus,
      });
      tripStore.updateCurrentTrip(updatedTrip);
      appStore.updateTripDetail({
        isUpdatingTripStatus: false,
        showTripStatusConfirm: false,
        pendingTripStatus: null,
      });
      rerenderTripDetail();
      showToast("Trip marked as done.", "success");
    } catch (error) {
      console.error(error);
      appStore.updateTripDetail({
        isUpdatingTripStatus: false,
      });
      rerenderTripDetail();
      showToast(getTripItemErrorMessage("tripUpdate"), "error");
    }
  });
  document.querySelector("#cancel-delete-trip")?.addEventListener("click", closeDeleteTripConfirm);
  document.querySelector("[data-cancel-delete-trip]")?.addEventListener("click", closeDeleteTripConfirm);
  document.querySelector("#confirm-delete-trip")?.addEventListener("click", async () => {
    const trip = tripStore.getCurrentTrip();

    if (!trip?.id) {
      return;
    }

    appStore.updateTripDetail({
      isDeletingTrip: true,
    });
    rerenderTripDetail();

    try {
      await softDeleteTrip(trip.id);
      tripStore.removeTrip(trip.id);
      tripStore.resetCurrentTrip();
      appStore.resetTripDetail();
      navigate("/app");
      showToast(`${getDisplayTitleForToast(trip.title, "Trip")} deleted`, "success");
    } catch (error) {
      console.error(error);
      appStore.updateTripDetail({
        isDeletingTrip: false,
      });
      rerenderTripDetail();
      showToast(getTripItemErrorMessage("tripDelete"), "error");
    }
  });
  document.querySelectorAll("[data-edit-day-title]").forEach((button) => {
    button.addEventListener("click", () => {
      const dayId = button.getAttribute("data-edit-day-title");
      const day = tripStore.getCurrentDays().find((entry) => entry.id === dayId);

      if (!dayId || !day) {
        return;
      }

      editingDayTitleId = dayId;
      editingDayTitleValue = day.title || "";
      rerenderTripDetail();
    });
  });
  document.querySelectorAll("[data-day-title-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      const dayId = button.getAttribute("data-day-title-trigger");
      const day = tripStore.getCurrentDays().find((entry) => entry.id === dayId);

      if (!dayId || !day?.title) {
        return;
      }

      editingDayTitleId = dayId;
      editingDayTitleValue = day.title || "";
      rerenderTripDetail();
    });
  });
  const dayTitleInput = document.querySelector("#day-title-inline-input");
  if (dayTitleInput) {
    dayTitleInput.focus();
    dayTitleInput.select();
    dayTitleInput.addEventListener("input", (event) => {
      editingDayTitleValue = event.currentTarget.value;
    });
    dayTitleInput.addEventListener("blur", async () => {
      await saveInlineDayTitle();
    });
    dayTitleInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await saveInlineDayTitle();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelInlineDayTitleEdit();
      }
    });
  }
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
      isShowingTripSettings: false,
      isSavingTrip: false,
      isCreatingItem: false,
      isSavingItem: false,
      editingItemId: null,
      showDiscardConfirm: false,
      showDeleteItemConfirm: false,
      isDeletingItem: false,
      deletingItemId: null,
      isShowingAddBaseForm: false,
      editingBaseId: null,
      isSavingBase: false,
      showDeleteBaseConfirm: false,
      isDeletingBase: false,
      deletingBaseId: null,
      showTripStatusConfirm: false,
      pendingTripStatus: null,
      isUpdatingTripStatus: false,
      showDeleteTripConfirm: false,
      isDeletingTrip: false,
    });
    itemEditorInitialSnapshot = "";
    itemEditorDraft = null;
    pendingDiscardAction = null;
    allocationDraft = null;
    allocationConfirmState = null;
    pendingTripSettingsDraft = null;
    tripLengthConfirmState = null;
    editingDayTitleId = null;
    editingDayTitleValue = "";
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
    item.item_type === "meal" && item.meal_slot ? escapeHtml(formatItemTypeLabel(item.meal_slot)) : "",
    item.item_type === "activity" && item.activity_type ? escapeHtml(formatItemTypeLabel(item.activity_type)) : "",
    item.item_type === "transport" && item.transport_mode ? escapeHtml(formatItemTypeLabel(item.transport_mode)) : "",
    item.item_type === "transport" && (item.transport_origin || item.transport_destination)
      ? [item.transport_origin, item.transport_destination].filter(Boolean).map((value) => escapeHtml(value)).join(" → ")
      : "",
    item.time_start ? escapeHtml(formatTimeLabel(item.time_start, item.time_is_estimated)) : "",
    item.time_end ? escapeHtml(`to ${formatTimeLabel(item.time_end, false)}`) : "",
    escapeHtml(formatCostLabel(item.cost_low, item.cost_high)),
  ].filter(Boolean);

  return `
    <article class="master-list-row">
      <div class="master-list-row__main">
        <div class="master-list-row__title-line">
          <h4>${escapeHtml(item.title || "Untitled item")}</h4>
          ${item.is_anchor ? '<span class="trip-pill trip-pill--anchor">Anchor</span>' : ""}
        </div>
        <p class="muted">
          ${formatItemTypeLabel(item.item_type)} · ${formatStatusLabel(item.status)}
          ${base ? ` · ${escapeHtml(base.name || "")}` : ""}
          ${day ? ` · Day ${day.day_number}` : " · Unassigned day"}
        </p>
        ${detailParts.length > 0 ? `<p class="master-list-row__details">${detailParts.join(" · ")}</p>` : ""}
      </div>
      ${renderItemActionsMenu(item)}
    </article>
  `;
}

function renderTripSettingsForm(trip, isSaving) {
  const endDateLabel = trip.start_date ? formatShortDateRange(trip.start_date, trip.trip_length, trip.trip_length) : "";

  return `
    <form class="trip-settings-form" id="trip-settings-form">
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Title</span>
          <input name="title" type="text" maxlength="120" value="${escapeHtml(trip.title || "")}" required />
        </label>
        <label class="field">
          <span>Trip Length</span>
          <input name="tripLength" type="number" min="1" step="1" value="${trip.trip_length}" required />
        </label>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Start Date</span>
          <input name="startDate" type="date" value="${trip.start_date || ""}" />
        </label>
        <label class="field">
          <span>End Date</span>
          <input type="text" value="${endDateLabel ? `Ends ${endDateLabel}` : "Set a start date to derive this"}" disabled />
        </label>
      </div>
      <label class="field">
        <span>Description</span>
        <textarea name="description" rows="3" placeholder="What kind of trip is this?">${escapeHtml(trip.description || "")}</textarea>
      </label>
      <p class="muted">Trip end date is always derived from start date plus trip length.</p>
      ${renderTripLifecycleSection(trip)}
      <div class="base-form__actions">
        <button class="button button--secondary" id="cancel-trip-settings" type="button">Cancel</button>
        <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Trip"}</button>
      </div>
    </form>
  `;
}

function renderTripSettingsSummary(trip) {
  return `
    <div class="trip-settings-summary">
      <p class="muted">${trip.start_date ? `Starts ${formatLongDate(trip.start_date)}` : "Start date not set yet"}</p>
      ${trip.start_date ? `<p class="muted">Ends ${formatShortDateRange(trip.start_date, trip.trip_length, trip.trip_length)}</p>` : ""}
      <p class="muted">${trip.trip_length} day${trip.trip_length === 1 ? "" : "s"} planned.</p>
      <p class="muted">${trip.status === "done" ? "This trip is marked done and will appear in Past Trips on the dashboard." : "Mark a trip as done when it becomes a past trip you still want to keep."}</p>
    </div>
  `;
}

function renderAllocationRow(row, trip, tripDetail, items, bases, tripLength) {
  const isEditing = row.kind === "base" && tripDetail.editingBaseId === row.base.id;
  const countLabel = row.dayCount === 1 ? "1 day" : `${row.dayCount} days`;
  const rangeLabel = row.dayCount > 0 ? getAllocationRangeLabel(row, trip.start_date) : "No days assigned yet";
  const detailLabel = row.kind === "base"
    ? `${escapeHtml(row.base.location_name || row.base.local_timezone || DEFAULT_BASE_TIMEZONE)}`
    : "Day without a base";

  return `
    <article class="allocation-row ${row.kind === "unassigned" ? "allocation-row--unassigned" : ""}">
      <div class="allocation-row__header">
        <div>
          <h4>${escapeHtml(row.label)}</h4>
          <p class="muted">${detailLabel}</p>
        </div>
        <div class="allocation-row__meta">
          <strong>${countLabel}</strong>
          <span class="muted">${rangeLabel}</span>
        </div>
      </div>

      <div class="allocation-row__actions">
        <button class="icon-button" data-allocation-adjust="decrease" data-slot-key="${escapeHtml(row.key)}" type="button" ${!canDecreaseAllocationRow(row, tripLength) ? "disabled" : ""}>−</button>
        <button class="icon-button" data-allocation-adjust="increase" data-slot-key="${escapeHtml(row.key)}" type="button">+</button>
        ${row.kind === "base" ? `<button class="button button--secondary" data-edit-base="${escapeHtml(row.base.id)}" type="button">Edit</button>` : ""}
        ${
          row.kind === "base" && row.dayCount === 0
            ? `<button class="button button--danger-secondary" data-delete-base="${escapeHtml(row.base.id)}" type="button">Delete Base</button>`
            : ""
        }
      </div>

      ${row.kind === "base" && row.dayCount > 0 ? renderAllocationItemWarning(row, items, bases) : ""}
      ${row.kind === "base" && row.dayCount > 0 ? '<p class="allocation-row__hint muted">Remove all days from this base before deleting.</p>' : ""}
      ${isEditing ? renderEditBaseForm(row.base, tripDetail.isSavingBase) : ""}
    </article>
  `;
}

function renderAllocationItemWarning(row, items, bases) {
  const movedItems = getItemsForDayRange(row.startDay, row.endDay, items, tripStore.getCurrentDays());

  if (movedItems.length === 0) {
    return "";
  }

  const reservedItems = movedItems.filter((item) => item.status === "reserved" || item.status === "confirmed");
  if (reservedItems.length === 0) {
    return "";
  }

  return `<p class="muted">Includes ${reservedItems.length} reserved/confirmed item${reservedItems.length === 1 ? "" : "s"} that may need review after moving days.</p>`;
}

function renderAddBaseForm(currentBaseCount) {
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
          <span>Order</span>
          <input type="text" value="${currentBaseCount + 1}" disabled />
        </label>
      </div>
      <p class="muted">New bases start with no days. Use the allocation controls to move days into place.</p>
      <div class="base-form__actions">
        <button class="button" type="submit">Save Base</button>
      </div>
    </form>
  `;
}

function renderEditBaseForm(base, isSaving) {
  return `
    <form class="base-form" data-edit-base-form="${escapeHtml(base.id)}">
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Name</span>
          <input name="name" type="text" value="${escapeHtml(base.name)}" required />
        </label>
        <label class="field">
          <span>Location Name</span>
          <input name="locationName" type="text" value="${escapeHtml(base.location_name || "")}" />
        </label>
      </div>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Timezone</span>
          ${renderTimezonePicker(`edit-base-timezone-${base.id}`, base.local_timezone || DEFAULT_BASE_TIMEZONE)}
        </label>
      </div>
      <div class="base-form__actions">
        <button class="button button--secondary" data-cancel-edit-base type="button">Cancel</button>
        <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Base"}</button>
      </div>
    </form>
  `;
}

function renderDaysView(bases, days, assignedItems, unassignedItems) {
  const sortedUnassignedItems = [...unassignedItems].sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0));
  const groupedRows = buildAllocationRows(bases, days).filter((row) => row.dayCount > 0);

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

      ${groupedRows.map((row, index) => renderBaseDaysSection(row, days, assignedItems, groupedRows.length, index === 0)).join("")}
    </section>
  `;
}

function renderBaseDaysSection(row, days, items, rowCount, isFirst) {
  const baseDays = days.filter((day) => day.day_number >= row.startDay && day.day_number <= row.endDay);

  return `
    <section class="panel days-base-section">
      ${rowCount > 1 ? `
        <div class="days-view__panel-header">
          <div>
            <p class="eyebrow">${row.kind === "unassigned" ? "Unassigned" : isFirst ? "Days View" : "Base"}</p>
            <h3>${escapeHtml(row.label)}</h3>
          </div>
          <p class="muted">${getAllocationRangeLabel(row, tripStore.getCurrentTrip()?.start_date)}</p>
        </div>
      ` : `
        <div class="days-view__panel-header">
          <div>
            <p class="eyebrow">Days View</p>
            <h3>${escapeHtml(row.label)}</h3>
          </div>
          <p class="muted">${getAllocationRangeLabel(row, tripStore.getCurrentTrip()?.start_date)}</p>
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
  const trip = tripStore.getCurrentTrip();
  const dateLabel = trip?.start_date ? formatDayDateLabel(trip.start_date, day.day_number) : "";
  const isEditingTitle = editingDayTitleId === day.id;
  const title = String(day.title || "").trim();

  return `
    <article class="day-card">
      <div class="day-card__header">
        <div class="day-card__header-main">
          <p class="eyebrow">Day ${day.day_number}${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ""}</p>
          ${
            isEditingTitle
              ? `
                <input
                  class="day-card__title-input"
                  id="day-title-inline-input"
                  type="text"
                  maxlength="120"
                  value="${escapeHtml(editingDayTitleValue)}"
                  placeholder="Add day title"
                />
              `
              : title
                ? `<button class="day-card__title-button" data-day-title-trigger="${escapeHtml(day.id)}" type="button">${escapeHtml(title)}</button>`
                : ""
          }
        </div>
        <button class="icon-button day-card__edit-title" data-edit-day-title="${escapeHtml(day.id)}" type="button" title="Edit day title" aria-label="Edit day title">
          <i data-lucide="pencil"></i>
        </button>
        ${day.location_name ? `<p class="muted">${escapeHtml(day.location_name)}</p>` : ""}
      </div>
      ${
        dayItems.length === 0
          ? `<div class="day-card__empty"><p class="muted">No items assigned yet.</p></div>`
          : `<div class="days-view__list">${dayItems.map((item) => renderDayItem(item)).join("")}</div>`
      }
    </article>
  `;
}

async function saveInlineDayTitle() {
  const dayId = editingDayTitleId;

  if (!dayId) {
    return;
  }

  const nextTitle = editingDayTitleValue;
  editingDayTitleId = null;
  editingDayTitleValue = "";
  rerenderTripDetail();

  try {
    const updatedDay = await updateTripDayTitle({
      dayId,
      title: nextTitle,
    });
    tripStore.updateCurrentDay(updatedDay);
    rerenderTripDetail();
  } catch (error) {
    console.error(error);
    showToast("Something went wrong saving. Please try again.", "error");
  }
}

function cancelInlineDayTitleEdit() {
  editingDayTitleId = null;
  editingDayTitleValue = "";
  rerenderTripDetail();
}

function renderDayItem(item) {
  const detailParts = [
    item.time_start ? escapeHtml(formatTimeLabel(item.time_start, item.time_is_estimated)) : "",
    item.item_type === "meal" && item.meal_slot ? escapeHtml(formatItemTypeLabel(item.meal_slot)) : "",
    item.item_type === "activity" && item.activity_type ? escapeHtml(formatItemTypeLabel(item.activity_type)) : "",
    item.item_type === "transport" && item.transport_mode ? escapeHtml(formatItemTypeLabel(item.transport_mode)) : "",
  ].filter(Boolean);

  return `
    <article class="day-item">
      <div class="day-item__header">
        <div class="day-item__title-line">
          <h5>${escapeHtml(item.title || "Untitled item")}</h5>
          ${item.is_anchor ? '<span class="trip-pill trip-pill--anchor">Anchor</span>' : ""}
        </div>
        ${renderItemActionsMenu(item)}
      </div>
      <p class="muted">${formatItemTypeLabel(item.item_type)} · ${formatStatusLabel(item.status)}</p>
      ${detailParts.length > 0 ? `<p class="day-item__details">${detailParts.join(" · ")}</p>` : ""}
    </article>
  `;
}

function renderItemEditorModal({ item, bases, days, isSaving, isDeleting }) {
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
            <h3>${escapeHtml(draft.title || "Untitled item")}</h3>
          </div>
          <button class="icon-button" id="close-item-editor" type="button" aria-label="Close item editor">×</button>
        </div>

        <form class="item-editor-form" id="item-editor-form">
          <label class="field">
            <span>Title</span>
            <input name="title" type="text" maxlength="120" value="${escapeHtml(draft.title)}" required />
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
                ${bases.map((base) => `<option value="${escapeHtml(base.id)}" ${draft.baseId === base.id ? "selected" : ""}>${escapeHtml(base.name || "Untitled base")}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Day</span>
              <select name="dayId">
                <option value="">Unassigned</option>
                ${days.map((day) => {
                  const dayBase = bases.find((base) => base.id === day.base_id);
                  return `<option value="${escapeHtml(day.id)}" ${draft.dayId === day.id ? "selected" : ""}>Day ${day.day_number}${day.title ? ` · ${escapeHtml(day.title)}` : ""}${dayBase ? ` · ${escapeHtml(dayBase.name || "Untitled base")}` : ""}</option>`;
                }).join("")}
              </select>
            </label>
          </div>
          <p class="field-hint ${getItemEditorAssignmentHint(draft.baseId, draft.dayId, bases, days) ? "" : "is-hidden"}" id="item-editor-assignment-hint">${escapeHtml(getItemEditorAssignmentHint(draft.baseId, draft.dayId, bases, days) || "")}</p>

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
              <input name="url" type="url" value="${escapeHtml(draft.url || "")}" placeholder="https://..." />
            </label>
            <label class="field">
              <span>Notes</span>
              <textarea name="notes" rows="4" placeholder="Booking notes, reminders, context">${escapeHtml(draft.notes || "")}</textarea>
            </label>
          </div>

          <div class="modal-card__actions">
            <button class="button button--danger" id="delete-item-button" type="button" ${isSaving || isDeleting ? "disabled" : ""}>Delete Item</button>
            <button class="button button--secondary" id="cancel-item-editor" type="button">Cancel</button>
            <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Changes"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function getTripItemErrorMessage(action = "update") {
  const messages = {
    create: "Could not create that item right now. Please try again.",
    update: "Could not save those changes right now. Please try again.",
    delete: "Could not delete that item right now. Please try again.",
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
      isSavingItem: false,
      showDiscardConfirm: false,
    });
    itemEditorInitialSnapshot = "";
    itemEditorDraft = null;
    pendingDiscardAction = null;
    rerenderTripDetail();
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
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
          ${MEAL_SLOTS.map((slot) => `<option value="${slot}" ${draft.mealSlot === slot ? "selected" : ""}>${escapeHtml(formatItemTypeLabel(slot))}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="item-editor-section" data-item-type-section="activity">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Activity Type</span>
        <select name="activityType">
          <option value="">None</option>
          ${ACTIVITY_TYPES.map((type) => `<option value="${type}" ${draft.activityType === type ? "selected" : ""}>${escapeHtml(formatItemTypeLabel(type))}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="item-editor-section" data-item-type-section="transport">
      <p class="item-editor-section__title">Type-Specific Details</p>
      <label class="field">
        <span>Transport Mode</span>
        <select name="transportMode">
          <option value="">None</option>
          ${TRANSPORT_MODES.map((mode) => `<option value="${mode}" ${draft.transportMode === mode ? "selected" : ""}>${escapeHtml(formatItemTypeLabel(mode))}</option>`).join("")}
        </select>
      </label>
      <div class="item-editor-form__grid">
        <label class="field">
          <span>Transport Origin</span>
          <input name="transportOrigin" type="text" value="${escapeHtml(draft.transportOrigin || "")}" />
        </label>
        <label class="field">
          <span>Transport Destination</span>
          <input name="transportDestination" type="text" value="${escapeHtml(draft.transportDestination || "")}" />
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

  return `Day ${selectedDay.day_number} is in ${dayBase.name || "that base"} — update base to match?`;
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

function renderDeleteItemConfirmModal({ item, isOpen, isDeleting }) {
  if (!isOpen || !item) {
    return "";
  }

  return `
    <div class="modal-shell" id="delete-item-confirm-modal" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-delete-item></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Delete Item</p>
            <h3>Delete ${escapeHtml(item.title || "this item")}?</h3>
          </div>
        </div>
        <p class="muted">This cannot be undone.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-delete-item" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-item" type="button" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Deleting…" : "Delete Item"}</button>
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

function renderAllocationConfirmModal(state) {
  if (!state) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-close-allocation-confirm></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Review Day Move</p>
            <h3>${escapeHtml(state.title)}</h3>
          </div>
        </div>
        <p class="muted">${escapeHtml(state.message)}</p>
        ${state.items.length > 0 ? `<p class="muted">${state.items.map((item) => item.title || "Untitled item").slice(0, 4).map(escapeHtml).join(", ")}</p>` : ""}
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-allocation-confirm" type="button">Cancel</button>
          <button class="button" id="confirm-allocation-change" type="button">Continue</button>
        </div>
      </section>
    </div>
  `;
}

function renderTripLengthConfirmModal(state) {
  if (!state) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-close-trip-length-confirm></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Reduce Trip Length</p>
            <h3>Move items from removed days?</h3>
          </div>
        </div>
        <p class="muted">${escapeHtml(state.message)}</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-trip-length-confirm" type="button">Cancel</button>
          <button class="button" id="confirm-trip-length-change" type="button">Continue</button>
        </div>
      </section>
    </div>
  `;
}

function renderDeleteBaseConfirmModal({ base, isOpen, isDeleting }) {
  if (!isOpen || !base) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-delete-base></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Delete Base</p>
            <h3>Delete ${escapeHtml(base.name || "this base")}?</h3>
          </div>
        </div>
        <p class="muted">This cannot be undone.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-delete-base" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-base" type="button" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Deleting…" : "Delete Base"}</button>
        </div>
      </section>
    </div>
  `;
}

function renderTripStatusConfirmModal({ trip, isOpen, pendingStatus, isSaving }) {
  if (!isOpen || !trip || pendingStatus !== "done") {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-trip-status-confirm></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Mark Trip as Done</p>
            <h3>Mark ${escapeHtml(trip.title || "this trip")} as done?</h3>
          </div>
        </div>
        <p class="muted">You can still view and edit it.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-trip-status-confirm" type="button">Cancel</button>
          <button class="button" id="confirm-trip-status-change" type="button" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Mark as Done"}</button>
        </div>
      </section>
    </div>
  `;
}

function renderDeleteTripConfirmModal({ trip, isOpen, isDeleting }) {
  if (!isOpen || !trip) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-delete-trip></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Delete Trip</p>
            <h3>${escapeHtml(trip.title || "Untitled trip")}</h3>
          </div>
        </div>
        <p class="muted">This will permanently hide ${escapeHtml(trip.title || "this trip")} and cannot be undone.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-delete-trip" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-trip" type="button" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Deleting…" : "Delete Trip"}</button>
        </div>
      </section>
    </div>
  `;
}

function renderItemActionsMenu(item) {
  return `
    <details class="item-actions-menu">
      <summary class="item-actions-menu__trigger" aria-label="Open item actions">⋮</summary>
      <div class="item-actions-menu__panel">
        <button class="item-actions-menu__item" data-edit-item="${escapeHtml(item.id)}" type="button">Edit</button>
        <button class="item-actions-menu__item item-actions-menu__item--danger" data-request-delete-item="${escapeHtml(item.id)}" type="button">Delete</button>
      </div>
    </details>
  `;
}

function renderTripLifecycleSection(trip) {
  const { isUpdatingTripStatus } = appStore.getState().tripDetail;
  const isDone = trip.status === "done";

  return `
    <section class="trip-lifecycle">
      <div>
        <p class="eyebrow">Lifecycle</p>
        <h4>${isDone ? "Past Trip" : "Active Trip"}</h4>
      </div>
      <p class="muted">${isDone ? "Done trips stay visible in Past Trips on the dashboard." : "Mark this trip as done when it becomes a memory you still want to keep."}</p>
      <div class="trip-lifecycle__actions">
        ${
          isDone
            ? `<button class="button button--secondary" id="reopen-trip" type="button" ${isUpdatingTripStatus ? "disabled" : ""}>${isUpdatingTripStatus ? "Saving…" : "Reopen Trip"}</button>`
            : `<button class="button button--secondary" id="mark-trip-done" type="button" ${isUpdatingTripStatus ? "disabled" : ""}>${isUpdatingTripStatus ? "Saving…" : "Mark as Done"}</button>`
        }
      </div>
      <div class="trip-lifecycle trip-lifecycle--danger">
        <div>
          <p class="eyebrow">Delete Trip</p>
          <h4>Hide this trip everywhere</h4>
        </div>
        <p class="muted">This is different from marking a trip done. Deleted trips are hidden from the dashboard and trip pages.</p>
        <div class="trip-lifecycle__actions">
          <button class="button button--danger-secondary" id="open-delete-trip-confirm" type="button">Delete Trip</button>
        </div>
      </div>
    </section>
  `;
}

function getAllocationState(trip, days) {
  if (allocationDraft && allocationDraft.tripId === trip?.id) {
    return allocationDraft;
  }

  return {
    tripId: trip?.id || null,
    tripLength: Number(trip?.trip_length || days.length || 0),
    days: [...days]
      .sort((left, right) => left.day_number - right.day_number)
      .map((day) => ({
        id: day.id,
        day_number: day.day_number,
        base_id: day.base_id ?? null,
      })),
  };
}

function buildAllocationRows(bases, dayEntries) {
  const rows = [];
  const days = [...dayEntries].sort((left, right) => left.day_number - right.day_number);
  let currentRow = null;

  days.forEach((day) => {
    const key = day.base_id ?? `unassigned-${day.day_number}`;

    if (!currentRow || currentRow.baseId !== day.base_id) {
      if (currentRow) {
        rows.push(currentRow);
      }

      const base = day.base_id ? bases.find((entry) => entry.id === day.base_id) || null : null;
      currentRow = {
        key: base?.id || `unassigned-${day.day_number}`,
        kind: base ? "base" : "unassigned",
        base,
        baseId: day.base_id ?? null,
        label: base?.name || "Unassigned",
        startDay: day.day_number,
        endDay: day.day_number,
        dayCount: 1,
      };
      return;
    }

    currentRow.endDay = day.day_number;
    currentRow.dayCount += 1;
  });

  if (currentRow) {
    rows.push(currentRow);
  }

  const usedBaseIds = new Set(rows.filter((row) => row.baseId).map((row) => row.baseId));
  bases
    .filter((base) => !usedBaseIds.has(base.id))
    .forEach((base) => {
      rows.push({
        key: base.id,
        kind: "base",
        base,
        baseId: base.id,
        label: base.name || "Untitled base",
        startDay: null,
        endDay: null,
        dayCount: 0,
      });
    });

  return rows;
}

function getAllocationSummary(trip, rows, tripLength) {
  const assignedDays = rows
    .filter((row) => row.kind === "base")
    .reduce((total, row) => total + row.dayCount, 0);
  const unassignedDays = rows
    .filter((row) => row.kind === "unassigned")
    .reduce((total, row) => total + row.dayCount, 0);
  const isComplete = assignedDays === Number(tripLength);

  let label = `${assignedDays} of ${tripLength} day${tripLength === 1 ? "" : "s"} allocated`;

  if (unassignedDays > 0) {
    label += ` (${unassignedDays} unassigned)`;
  }

  return {
    isComplete,
    label: isComplete
      ? `All ${tripLength} day${tripLength === 1 ? "" : "s"} allocated ✓`
      : label,
  };
}

function hasAllocationDraftChanges(trip, days) {
  if (!trip?.id || !allocationDraft || allocationDraft.tripId !== trip.id) {
    return false;
  }

  if (Number(allocationDraft.tripLength) !== Number(trip.trip_length)) {
    return true;
  }

  return days.some((day) => {
    const draftDay = allocationDraft.days.find((entry) => entry.day_number === day.day_number);
    return draftDay && normalizeNullableId(draftDay.base_id) !== normalizeNullableId(day.base_id);
  });
}

function canDecreaseAllocationRow(row, tripLength) {
  if (row.dayCount === 0) {
    return false;
  }

  return Number(tripLength) > 1;
}

function getAllocationRangeLabel(row, startDate) {
  if (!row.dayCount || !row.startDay || !row.endDay) {
    return "No days assigned yet";
  }

  const dayLabel = row.startDay === row.endDay ? `Day ${row.startDay}` : `Days ${row.startDay}-${row.endDay}`;
  const dateLabel = startDate ? formatShortDateRange(startDate, row.startDay, row.endDay) : "";

  return dateLabel ? `${dayLabel} · ${dateLabel}` : dayLabel;
}

function getTripShrinkSummary(nextTripLength, days, items) {
  const removedDays = days.filter((day) => day.day_number > nextTripLength);
  const removedDayIds = new Set(removedDays.map((day) => day.id));
  const affectedItems = items.filter((item) => removedDayIds.has(item.day_id));
  const removedLabels = formatRemovedDayLabels(removedDays.map((day) => day.day_number));

  return {
    itemCount: affectedItems.length,
    message: `Reducing to ${nextTripLength} day${nextTripLength === 1 ? "" : "s"} will remove ${removedLabels}. ${affectedItems.length} item${affectedItems.length === 1 ? "" : "s"} will move to unassigned. Continue?`,
  };
}

function getItemsForDayRange(startDay, endDay, items, days) {
  const dayIds = new Set(
    days
      .filter((day) => day.day_number >= startDay && day.day_number <= endDay)
      .map((day) => day.id)
  );

  return items.filter((item) => dayIds.has(item.day_id));
}

function requestAllocationChange(slotKey, direction) {
  const trip = tripStore.getCurrentTrip();
  const days = tripStore.getCurrentDays();
  const items = tripStore.getCurrentItems();
  const draft = getAllocationState(trip, days);
  const rows = buildAllocationRows(tripStore.getCurrentBases(), draft.days);
  const rowIndex = rows.findIndex((row) => row.key === slotKey);

  if (!trip || rowIndex === -1) {
    return;
  }

  const row = rows[rowIndex];
  const affectedDayNumber = direction === "increase"
    ? row.dayCount > 0
      ? row.endDay + 1
      : rows[rowIndex - 1]?.endDay + 1 || 1
    : row.endDay;
  const nextRow = rows[rowIndex + 1] || null;
  const affectedDay = days.find((day) => day.day_number === affectedDayNumber) || null;
  const affectedItems = affectedDay ? items.filter((item) => item.day_id === affectedDay.id) : [];
  const importantItems = affectedItems.filter((item) => item.status === "reserved" || item.status === "confirmed");

  if (importantItems.length === 0 && !(direction === "decrease" && row.dayCount > 0 && affectedItems.length > 0 && !nextRow)) {
    applyAllocationChange(slotKey, direction);
    return;
  }

  allocationConfirmState = {
    title: direction === "increase" ? `Move Day ${affectedDayNumber}?` : `Remove Day ${affectedDayNumber}?`,
    message: nextRow
      ? `Day ${affectedDayNumber} has ${importantItems.length} reserved/confirmed item${importantItems.length === 1 ? "" : "s"} and will move to ${nextRow.label}. Review after saving.`
      : `Day ${affectedDayNumber} has ${affectedItems.length} item${affectedItems.length === 1 ? "" : "s"} and they will move to unassigned when this day is removed.`,
    items: importantItems.length > 0 ? importantItems : affectedItems,
    action: {
      slotKey,
      direction,
    },
  };
  rerenderTripDetail();
}

function applyAllocationChange(slotKey, direction) {
  const trip = tripStore.getCurrentTrip();
  const draft = getAllocationState(trip, tripStore.getCurrentDays());
  const rows = buildAllocationRows(tripStore.getCurrentBases(), draft.days);
  const rowIndex = rows.findIndex((row) => row.key === slotKey);

  if (rowIndex === -1) {
    return;
  }

  const row = rows[rowIndex];
  const nextRow = rows[rowIndex + 1] || null;
  allocationDraft = {
    ...draft,
    days: draft.days.map((day) => ({ ...day })),
  };

  if (direction === "increase") {
    if (nextRow?.startDay) {
      const movedDay = allocationDraft.days.find((day) => day.day_number === nextRow.startDay);
      if (movedDay) {
        movedDay.base_id = row.baseId;
      }
    } else {
      allocationDraft.tripLength += 1;
      allocationDraft.days.push({
        id: null,
        day_number: allocationDraft.tripLength,
        base_id: row.baseId,
      });
    }
  }

  if (direction === "decrease" && row.endDay) {
    const movedDay = allocationDraft.days.find((day) => day.day_number === row.endDay);

    if (!movedDay) {
      return;
    }

    if (nextRow?.key) {
      movedDay.base_id = nextRow.baseId;
    } else {
      allocationDraft.days = allocationDraft.days.filter((day) => day.day_number !== row.endDay);
      allocationDraft.tripLength -= 1;
    }
  }

  allocationDraft.days = allocationDraft.days
    .sort((left, right) => left.day_number - right.day_number)
    .map((day, index) => ({
      ...day,
      day_number: index + 1,
    }));

  rerenderTripDetail();
}

async function saveAllocationDraft(trip) {
  const originalTripLength = Number(trip.trip_length);
  const nextTripLength = Number(allocationDraft.tripLength);
  let tripLengthUpdated = false;

  if (nextTripLength !== originalTripLength) {
    await updateTripSettings({
      tripId: trip.id,
      title: trip.title,
      description: trip.description || "",
      startDate: trip.start_date || "",
      tripLength: nextTripLength,
    });
    tripLengthUpdated = true;
  }

  const freshBundle = await fetchTripDetailBundle(trip.id);
  const changedAllocations = allocationDraft.days
    .filter((draftDay) => draftDay.day_number <= nextTripLength)
    .map((draftDay) => {
      const persistedDay = freshBundle.days.find((day) => day.day_number === draftDay.day_number);
      if (!persistedDay) {
        return null;
      }

      if (normalizeNullableId(persistedDay.base_id) === normalizeNullableId(draftDay.base_id)) {
        return null;
      }

      return {
        dayNumber: draftDay.day_number,
        toBaseId: draftDay.base_id,
      };
    })
    .filter(Boolean);

  if (changedAllocations.length > 0) {
    try {
      await saveTripDayAllocations({
        tripId: trip.id,
        allocations: changedAllocations,
      });
    } catch (error) {
      if (tripLengthUpdated) {
        await loadTripDetail(trip.id);
        throw new Error("TRIP_LENGTH_UPDATED_ALLOCATIONS_FAILED");
      }

      throw error;
    }
  }
}

function formatRemovedDayLabels(dayNumbers) {
  const sortedDayNumbers = [...dayNumbers]
    .filter((dayNumber) => Number.isInteger(dayNumber))
    .sort((left, right) => left - right);
  const labels = [];
  let rangeStart = null;
  let previousDayNumber = null;

  sortedDayNumbers.forEach((dayNumber) => {
    if (rangeStart == null) {
      rangeStart = dayNumber;
      previousDayNumber = dayNumber;
      return;
    }

    if (dayNumber === previousDayNumber + 1) {
      previousDayNumber = dayNumber;
      return;
    }

    labels.push(formatRemovedDayRange(rangeStart, previousDayNumber));
    rangeStart = dayNumber;
    previousDayNumber = dayNumber;
  });

  if (rangeStart != null) {
    labels.push(formatRemovedDayRange(rangeStart, previousDayNumber));
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function formatRemovedDayRange(startDayNumber, endDayNumber) {
  if (startDayNumber === endDayNumber) {
    return `Day ${startDayNumber}`;
  }

  return `Days ${startDayNumber}-${endDayNumber}`;
}

async function saveTripSettings(settings) {
  appStore.updateTripDetail({
    isSavingTrip: true,
  });
  rerenderTripDetail();

  try {
    const updatedTrip = await updateTripSettings(settings);
    tripStore.updateCurrentTrip(updatedTrip);
    pendingTripSettingsDraft = null;
    tripLengthConfirmState = null;
    appStore.updateTripDetail({
      isSavingTrip: false,
      isShowingTripSettings: false,
    });
    await loadTripDetail(settings.tripId);
    showToast("Trip updated.", "success");
  } catch (error) {
    console.error(error);
    appStore.updateTripDetail({
      isSavingTrip: false,
    });
    rerenderTripDetail();
    showToast(getTripItemErrorMessage("update"), "error");
  }
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
      id="${escapeHtml(inputId)}"
      name="localTimezone"
      type="text"
      list="timezone-options"
      value="${escapeHtml(selectedTimezone || DEFAULT_BASE_TIMEZONE)}"
      placeholder="Start typing a timezone"
      autocomplete="off"
      required
    />
  `;
}

function renderTimezoneOptionsDatalist() {
  return `
    <datalist id="timezone-options">
      ${getSupportedTimezones().map((timezone) => `<option value="${escapeHtml(timezone)}"></option>`).join("")}
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

function openDeleteItemConfirm(itemId) {
  appStore.updateTripDetail({
    showDeleteItemConfirm: true,
    deletingItemId: itemId,
  });
  rerenderTripDetail();
}

function closeDeleteItemConfirm() {
  appStore.updateTripDetail({
    showDeleteItemConfirm: false,
    isDeletingItem: false,
    deletingItemId: null,
  });
  rerenderTripDetail();
}

function closeDeleteBaseConfirm() {
  appStore.updateTripDetail({
    showDeleteBaseConfirm: false,
    isDeletingBase: false,
    deletingBaseId: null,
  });
  rerenderTripDetail();
}

function closeTripStatusConfirm() {
  appStore.updateTripDetail({
    showTripStatusConfirm: false,
    pendingTripStatus: null,
    isUpdatingTripStatus: false,
  });
  rerenderTripDetail();
}

function closeDeleteTripConfirm() {
  appStore.updateTripDetail({
    showDeleteTripConfirm: false,
    isDeletingTrip: false,
  });
  rerenderTripDetail();
}

function getDisplayTitleForToast(value, fallback) {
  const title = String(value || "").trim();
  return title || fallback;
}
