import { navigate } from "../../../app/router.js";
import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  softDeleteTrip,
  updateTripSettings,
} from "../../../services/trips-service.js";
import { getTripEndDate, isValidDateInput } from "../../../lib/derive.js";
import { showToast } from "../../shared/toast.js";
import {
  tripDetailState,
  rerenderTripDetail,
} from "./trip-detail-state.js";
import {
  escapeHtml,
  getDisplayTitleForToast,
  getTripHeroPhotoUrl,
  renderHeroPhotoImage,
} from "./trip-detail-ui.js";

function getTripShrinkSummary(nextTripLength, days, items) {
  const removedDays = days.filter((day) => day.day_number > nextTripLength);
  const removedDayIds = new Set(removedDays.map((day) => day.id));
  const affectedItems = items.filter((item) => removedDayIds.has(item.day_id));
  const removedLabels = formatRemovedDayLabels(removedDays.map((day) => day.day_number));

  return {
    itemCount: affectedItems.length,
    removedDays: removedDays.length,
    message: `Reducing to ${nextTripLength} day${nextTripLength === 1 ? "" : "s"} will remove ${removedLabels}. ${affectedItems.length} stop${affectedItems.length === 1 ? "" : "s"} will move to unassigned. Continue?`,
  };
}

function formatTripSettingsEndDate(startDateValue, tripLengthValue) {
  const tripLength = Number(tripLengthValue);

  if (!startDateValue) {
    return "Set start date";
  }

  if (!isValidDateInput(startDateValue) || !Number.isInteger(tripLength) || tripLength < 1) {
    return "Choose a valid date";
  }

  const endDate = getTripEndDate({
    start_date: startDateValue,
    trip_length: tripLength,
  });

  return endDate
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(endDate)
    : "Set start date";
}

function wireTripSettingsDatePreview() {
  const form = document.querySelector("#trip-settings-form");
  const endDateInput = form?.querySelector("[data-trip-end-date]");

  if (!form || !endDateInput) {
    return;
  }

  const updatePreview = () => {
    const formData = new FormData(form);
    endDateInput.value = formatTripSettingsEndDate(formData.get("startDate"), formData.get("tripLength"));
  };

  form.querySelector('[name="startDate"]')?.addEventListener("input", updatePreview);
  form.querySelector('[name="tripLength"]')?.addEventListener("input", updatePreview);
  updatePreview();
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
  const endDate = getTripEndDate(trip);
  const endDateLabel = endDate
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(endDate)
    : "Set start date";

  return `
    <div class="modal-shell" id="trip-settings-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-trip-settings></div>
      <section class="panel modal-card modal-card--editor trip-settings-modal">
        <div class="modal-card__header">
          <h3>${escapeHtml(trip.title || "Untitled trip")}</h3>
          <button class="icon-button" id="cancel-trip-settings" type="button" aria-label="Close trip settings">×</button>
        </div>

        <form class="trip-settings-form" id="trip-settings-form">
          <div class="item-editor-form__content">
            ${renderTripSettingsPhotoField(trip)}

            <label class="field">
              <span>Title</span>
              <input name="title" type="text" maxlength="120" value="${escapeHtml(trip.title || "")}" required />
            </label>

            <div class="trip-settings-form__date-grid">
              <label class="field">
                <span>Trip Length</span>
                <input name="tripLength" type="number" min="1" step="1" value="${trip.trip_length}" required />
              </label>
              <label class="field">
                <span>Start Date</span>
                <input name="startDate" type="date" value="${trip.start_date || ""}" />
              </label>
              <label class="field">
                <span>End Date</span>
                <input data-trip-end-date type="text" value="${escapeHtml(endDateLabel)}" readonly />
              </label>
            </div>
            <p class="field-hint">End date is always derived from start date and trip length</p>

            <label class="field">
              <span>Description</span>
              <textarea name="description" rows="4">${escapeHtml(trip.description || "")}</textarea>
            </label>

          </div>

          <div class="modal-card__actions modal-card__actions--sticky">
            <button class="button-link button-link--danger" id="open-delete-trip-confirm-footer" type="button">Delete Trip</button>
            <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Changes"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderTripSettingsPhotoField(trip) {
  const heroPhotoUrl = getTripHeroPhotoUrl(trip);

  return `
    <div class="photo-field">
      <div class="photo-field__preview photo-hero">
        ${heroPhotoUrl ? renderHeroPhotoImage(heroPhotoUrl) : `<span class="photo-hero__empty-label">Add photo</span>`}
      </div>
      <button class="button button--secondary" data-trip-hero-upload type="button">
        ${heroPhotoUrl ? "Change photo" : "Add photo"}
      </button>
    </div>
  `;
}

export function renderTripSettingsSummary(_trip) {
  return "";
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
      appStore.updateTripDetail({
        isShowingTripSettings: true,
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
    onAfterTripSettingsOpen: wireTripSettingsDatePreview,
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
      const startDate = String(formData.get("startDate") || "").trim();

      if (!trip?.id || !title || !Number.isInteger(tripLength) || tripLength < 1) {
        showToast("Add a title and a valid trip length first.", "error");
        return;
      }

      if (startDate && !isValidDateInput(startDate)) {
        showToast("Choose a valid start date.", "error");
        return;
      }

      const nextSettings = {
        tripId: trip.id,
        title,
        description: String(formData.get("description") || "").trim(),
        startDate,
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
