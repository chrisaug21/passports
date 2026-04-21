import { navigate } from "../../../app/router.js";
import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  softDeleteTrip,
  updateTripSettings,
  updateTripStatus,
} from "../../../services/trips-service.js";
import {
  formatShortDateRange,
  formatStatusLabel,
} from "../../../lib/format.js";
import { showToast } from "../../shared/toast.js";
import {
  tripDetailState,
  rerenderTripDetail,
} from "./trip-detail-state.js";
import {
  escapeHtml,
  getDisplayTitleForToast,
} from "./trip-detail-ui.js";

function getTripShrinkSummary(nextTripLength, days, items) {
  const removedDays = days.filter((day) => day.day_number > nextTripLength);
  const removedDayIds = new Set(removedDays.map((day) => day.id));
  const affectedItems = items.filter((item) => removedDayIds.has(item.day_id));
  const removedLabels = formatRemovedDayLabels(removedDays.map((day) => day.day_number));

  return {
    itemCount: affectedItems.length,
    removedDays: removedDays.length,
    message: `Reducing to ${nextTripLength} day${nextTripLength === 1 ? "" : "s"} will remove ${removedLabels}. ${affectedItems.length} item${affectedItems.length === 1 ? "" : "s"} will move to unassigned. Continue?`,
  };
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

export function renderTripSettingsForm(trip, isSaving) {
  const endDateLabel = trip.start_date ? formatShortDateRange(trip.start_date, 1, trip.trip_length) : "";

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

export function renderTripSettingsSummary(_trip) {
  return "";
}

export function renderTripLifecycleSection(trip) {
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
          <button class="button button--danger" id="open-delete-trip-confirm" type="button">Delete Trip</button>
        </div>
      </div>
    </section>
  `;
}

export function renderTripStatusConfirmModal({ trip, isOpen, pendingStatus, isSaving }) {
  if (!isOpen || !trip || !pendingStatus) {
    return "";
  }

  const isMarkingDone = pendingStatus === "done";
  const statusLabel = formatStatusLabel(pendingStatus).toLowerCase();

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-trip-status-confirm></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">${isMarkingDone ? "Mark Trip as Done" : "Reopen Trip"}</p>
            <h3>${isMarkingDone ? `Mark ${escapeHtml(trip.title || "this trip")} as done?` : `Reopen ${escapeHtml(trip.title || "this trip")}?`}</h3>
          </div>
        </div>
        <p class="muted">${isMarkingDone ? "You can still view and edit it." : `This will move the trip back to ${escapeHtml(statusLabel)}.`}</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-trip-status-confirm" type="button">Cancel</button>
          <button class="button" id="confirm-trip-status-change" type="button" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : isMarkingDone ? "Mark as Done" : "Reopen Trip"}</button>
        </div>
      </section>
    </div>
  `;
}

export function renderDeleteTripConfirmModal({ trip, isOpen, isDeleting }) {
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
        <p class="muted">This hides ${escapeHtml(trip.title || "this trip")} from your trips.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-delete-trip" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-trip" type="button" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Deleting…" : "Delete Trip"}</button>
        </div>
      </section>
    </div>
  `;
}

async function saveTripSettings(settings, getTripItemErrorMessage, loadTripDetail) {
  appStore.updateTripDetail({
    isSavingTrip: true,
  });
  rerenderTripDetail();

  try {
    const updatedTrip = await updateTripSettings(settings);
    tripStore.updateCurrentTrip(updatedTrip);
    tripDetailState.pendingTripSettingsDraft = null;
    tripDetailState.tripLengthConfirmState = null;
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

export function createTripSettingsHandlers({ getTripItemErrorMessage, loadTripDetail }) {
  return {
    onToggleTripSettings: () => {
      const { isShowingTripSettings } = appStore.getState().tripDetail;
      appStore.updateTripDetail({
        isShowingTripSettings: !isShowingTripSettings,
      });
      rerenderTripDetail();
    },
    onCancelTripSettings: () => {
      tripDetailState.pendingTripSettingsDraft = null;
      tripDetailState.tripLengthConfirmState = null;
      appStore.updateTripDetail({
        isShowingTripSettings: false,
        isSavingTrip: false,
      });
      rerenderTripDetail();
    },
    onMarkTripDone: () => {
      const trip = tripStore.getCurrentTrip();

      if (!trip) {
        return;
      }

      appStore.updateTripDetail({
        showTripStatusConfirm: true,
        pendingTripStatus: "done",
      });
      tripStore.updateCurrentTrip({
        ...trip,
        previous_status: trip.status === "done" ? trip.previous_status || "planning" : trip.status,
      });
      rerenderTripDetail();
    },
    onReopenTrip: () => {
      const trip = tripStore.getCurrentTrip();

      if (!trip?.id) {
        return;
      }

      appStore.updateTripDetail({
        showTripStatusConfirm: true,
        pendingTripStatus: trip.previous_status || "planning",
      });
      rerenderTripDetail();
    },
    onOpenDeleteTripConfirm: () => {
      appStore.updateTripDetail({
        showDeleteTripConfirm: true,
      });
      rerenderTripDetail();
    },
    onTripSettingsSubmit: async (event) => {
      event.preventDefault();

      const trip = tripStore.getCurrentTrip();
      const formData = new FormData(event.currentTarget);
      const title = String(formData.get("title") || "").trim();
      const tripLength = Number(formData.get("tripLength"));

      if (!trip?.id || !title || !Number.isInteger(tripLength) || tripLength < 1) {
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

      if (tripLength < Number(trip.trip_length) && (shrinkSummary.itemCount > 0 || shrinkSummary.removedDays > 0)) {
        tripDetailState.pendingTripSettingsDraft = nextSettings;
        tripDetailState.tripLengthConfirmState = shrinkSummary;
        rerenderTripDetail();
        return;
      }

      await saveTripSettings(nextSettings, getTripItemErrorMessage, loadTripDetail);
    },
    onCancelTripLengthConfirm: () => {
      tripDetailState.pendingTripSettingsDraft = null;
      tripDetailState.tripLengthConfirmState = null;
      rerenderTripDetail();
    },
    onCloseTripLengthConfirm: () => {
      tripDetailState.pendingTripSettingsDraft = null;
      tripDetailState.tripLengthConfirmState = null;
      rerenderTripDetail();
    },
    onConfirmTripLengthChange: async () => {
      const pendingSettings = tripDetailState.pendingTripSettingsDraft;

      if (!pendingSettings) {
        return;
      }

      tripDetailState.pendingTripSettingsDraft = null;
      tripDetailState.tripLengthConfirmState = null;
      await saveTripSettings(pendingSettings, getTripItemErrorMessage, loadTripDetail);
    },
    onCancelTripStatusConfirm: () => {
      appStore.updateTripDetail({
        showTripStatusConfirm: false,
        pendingTripStatus: null,
        isUpdatingTripStatus: false,
      });
      rerenderTripDetail();
    },
    onConfirmTripStatusChange: async () => {
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
        tripStore.updateCurrentTrip({
          ...updatedTrip,
          previous_status: pendingTripStatus === "done"
            ? trip.previous_status || trip.status
            : pendingTripStatus,
        });
        appStore.updateTripDetail({
          isUpdatingTripStatus: false,
          showTripStatusConfirm: false,
          pendingTripStatus: null,
        });
        rerenderTripDetail();
        showToast(pendingTripStatus === "done" ? "Trip marked as done." : "Trip reopened.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isUpdatingTripStatus: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("tripUpdate"), "error");
      }
    },
    onCancelDeleteTrip: () => {
      appStore.updateTripDetail({
        showDeleteTripConfirm: false,
        isDeletingTrip: false,
      });
      rerenderTripDetail();
    },
    onConfirmDeleteTrip: async () => {
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
    },
  };
}
