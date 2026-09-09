import { navigate } from "../../../app/router.js";
import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { sessionStore } from "../../../state/session-store.js";
import {
  demoteTripToWishlist,
  moveItemsToNextTrip,
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
import {
  clearShareLinkFeedbackResetTimer,
  wireTripSettingsShareLink,
} from "./share-link-controller.js";

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
          <div class="item-editor-form__content trip-settings-form__content">
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

            <div class="trip-settings-form__sharing">
              <div class="trip-settings-form__sharing-row">
                <div class="trip-settings-form__sharing-label-group">
                  <div class="trip-settings-form__sharing-heading">
                    <span class="trip-settings-form__sharing-label">Public itinerary</span>
                    <button
                      class="trip-settings-share-link${trip.is_public ? "" : " is-disabled"}"
                      data-copy-share-link
                      type="button"
                      aria-disabled="${trip.is_public ? "false" : "true"}"
                      ${trip.is_public ? "" : "hidden"}
                    >
                      <span class="trip-settings-share-link__icon" data-share-link-icon aria-hidden="true">
                        <i data-lucide="link" aria-hidden="true"></i>
                      </span>
                      <span class="trip-settings-share-link__label" data-share-link-label>Copy link</span>
                    </button>
                  </div>
                  <p class="field-hint trip-settings-form__sharing-hint" data-share-link-hint>Anyone with the link can view your itinerary.</p>
                </div>
                <label class="toggle-switch trip-settings-form__sharing-toggle" aria-label="Public itinerary">
                  <input name="isPublic" type="checkbox" class="toggle-switch__input" ${trip.is_public ? "checked" : ""} />
                  <span class="toggle-switch__track" aria-hidden="true"></span>
                </label>
              </div>
              <div class="trip-settings-form__sharing-row">
                <div class="trip-settings-form__sharing-label-group">
                  <div class="trip-settings-form__sharing-heading">
                    <span class="trip-settings-form__sharing-label">LLM planning link</span>
                    <button
                      class="trip-settings-share-link${trip.is_planning_public ? "" : " is-disabled"}"
                      data-copy-planning-share-link
                      type="button"
                      aria-disabled="${trip.is_planning_public ? "false" : "true"}"
                      ${trip.is_planning_public ? "" : "hidden"}
                    >
                      <span class="trip-settings-share-link__icon" data-share-link-icon aria-hidden="true">
                        <i data-lucide="link" aria-hidden="true"></i>
                      </span>
                      <span class="trip-settings-share-link__label" data-share-link-label>Copy link</span>
                    </button>
                  </div>
                  <p class="field-hint trip-settings-form__sharing-hint" data-planning-share-link-hint>A plain-text view of everything, for AI tools.</p>
                </div>
                <label class="toggle-switch trip-settings-form__sharing-toggle" aria-label="LLM planning link">
                  <input name="isPlanningPublic" type="checkbox" class="toggle-switch__input" ${trip.is_planning_public ? "checked" : ""} />
                  <span class="toggle-switch__track" aria-hidden="true"></span>
                </label>
              </div>
              <div class="trip-settings-form__sharing-row trip-settings-form__sharing-row--journal${trip.is_public ? "" : " is-disabled"}">
                <div class="trip-settings-form__sharing-label-group">
                  <div class="trip-settings-form__sharing-heading">
                    <span class="trip-settings-form__sharing-label">Share journal</span>
                    <button
                      class="trip-settings-share-link${trip.is_journal_public ? "" : " is-disabled"}"
                      data-copy-journal-share-link
                      type="button"
                      aria-disabled="${trip.is_journal_public ? "false" : "true"}"
                      ${trip.is_journal_public ? "" : "hidden"}
                    >
                      <span class="trip-settings-share-link__icon" data-share-link-icon aria-hidden="true">
                        <i data-lucide="link" aria-hidden="true"></i>
                      </span>
                      <span class="trip-settings-share-link__label" data-share-link-label>Copy link</span>
                    </button>
                  </div>
                  <span class="field-hint trip-settings-form__sharing-hint" data-journal-share-link-hint>Let anyone with the link read your trip journal.</span>
                </div>
                <label class="toggle-switch trip-settings-form__sharing-toggle" aria-label="Share journal">
                  <input
                    name="isJournalPublic"
                    type="checkbox"
                    class="toggle-switch__input"
                    ${trip.is_journal_public ? "checked" : ""}
                    ${trip.is_public ? "" : "disabled"}
                    data-journal-public-toggle
                  />
                  <span class="toggle-switch__track" aria-hidden="true"></span>
                </label>
              </div>
            </div>

          </div>

          <div class="modal-card__actions modal-card__actions--sticky">
            <div class="trip-settings-form__destructive-actions">
              <button class="icon-button icon-button--danger" id="open-delete-trip-confirm-footer" type="button" title="Delete Trip" aria-label="Delete Trip">
                <i data-lucide="trash-2" aria-hidden="true"></i>
              </button>
              ${trip.status === "planning" ? `
                <button class="icon-button" id="open-demote-to-wishlist-confirm" type="button" title="Move to Wishlist" aria-label="Move to Wishlist">
                  <i data-lucide="bookmark" aria-hidden="true"></i>
                </button>
              ` : ""}
            </div>
            <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : "Save Changes"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderTripSettingsPhotoField(trip) {
  const heroPhotoUrl = getTripHeroPhotoUrl(trip);
  const label = heroPhotoUrl ? "Adjust crop" : "Add photo";

  return `
    <div class="photo-field">
      <div class="photo-field__preview photo-hero" tabindex="0">
        ${heroPhotoUrl ? renderHeroPhotoImage(heroPhotoUrl) : `<span class="photo-hero__empty-label">Add photo</span>`}
        <div class="photo-hero__controls">
          <button class="photo-hero__action" data-trip-hero-upload type="button" aria-label="${label}">
            <i data-lucide="camera" aria-hidden="true"></i>
          </button>
          ${heroPhotoUrl ? `
            <button class="photo-hero__replace" data-trip-hero-replace type="button" aria-label="Replace photo">
              <i data-lucide="refresh-cw" aria-hidden="true"></i>
            </button>
          ` : ""}
        </div>
      </div>
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

export function renderDemoteToWishlistConfirmModal({ trip, isOpen, isDemoting }) {
  if (!isOpen || !trip) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-demote-to-wishlist></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Move to Wishlist</p>
            <h3>${escapeHtml(trip.title || "Untitled trip")}</h3>
          </div>
        </div>
        <p class="muted">This clears the trip's start date. Bases, days, items, notes, and photos all stay intact.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-demote-to-wishlist" type="button">Cancel</button>
          <button class="button" id="confirm-demote-to-wishlist" type="button" ${isDemoting ? "disabled" : ""}>${isDemoting ? "Moving…" : "Move to Wishlist"}</button>
        </div>
      </section>
    </div>
  `;
}

function renderMoveToNextTripScopeButton({ scope, label, count, isMoving }) {
  return `
    <button
      class="button button--secondary"
      data-move-to-next-trip-scope="${scope}"
      type="button"
      ${isMoving || count === 0 ? "disabled" : ""}
    >${isMoving ? "Moving…" : `${label} (${count})`}</button>
  `;
}

export function renderMoveToNextTripConfirmModal({ trip, isOpen, isMoving, unassignedCount, notDoneCount }) {
  if (!isOpen || !trip) {
    return "";
  }

  return `
    <div class="modal-shell" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-move-to-next-trip></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Move to Next Trip</p>
            <h3>${escapeHtml(trip.title || "Untitled trip")}</h3>
          </div>
          <button class="icon-button" id="cancel-move-to-next-trip" type="button" aria-label="Close" ${isMoving ? "disabled" : ""}>×</button>
        </div>
        <p class="muted">
          Creates a new trip called "Next Trip to ${escapeHtml(trip.title || "Untitled trip")}" with the same length, photos,
          overview content (except the summary), and any bases your items need, but no dates yet. The items you pick move
          over — reset to idea status with no time or confirmation number — and are removed from here.
        </p>
        <div class="modal-card__actions modal-card__actions--column">
          ${renderMoveToNextTripScopeButton({ scope: "unassigned", label: "Just unassigned items", count: unassignedCount, isMoving })}
          ${renderMoveToNextTripScopeButton({ scope: "not_done", label: "All items not marked done", count: notDoneCount, isMoving })}
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
    rerenderTripDetail();
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
      clearShareLinkFeedbackResetTimer();
      tripDetailState.pendingTripSettingsDraft = null;
      tripDetailState.tripLengthConfirmState = null;
      appStore.updateTripDetail({
        isShowingTripSettings: false,
        isSavingTrip: false,
      });
      rerenderTripDetail();
    },
    onAfterTripSettingsOpen: () => {
      wireTripSettingsDatePreview();
      wireTripSettingsShareLink(tripStore.getCurrentTrip());
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
      const startDate = String(formData.get("startDate") || "").trim();

      if (!trip?.id || !title || !Number.isInteger(tripLength) || tripLength < 1) {
        showToast("Add a title and a valid trip length first.", "error");
        return;
      }

      if (startDate && !isValidDateInput(startDate)) {
        showToast("Choose a valid start date.", "error");
        return;
      }

      const isPublic = formData.get("isPublic") === "on";
      const nextSettings = {
        tripId: trip.id,
        title,
        description: String(formData.get("description") || "").trim(),
        startDate,
        tripLength,
        isPublic,
        isJournalPublic: isPublic && formData.get("isJournalPublic") === "on",
        isPlanningPublic: formData.get("isPlanningPublic") === "on",
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
    onOpenMoveToNextTripConfirm: () => {
      appStore.updateTripDetail({
        showMoveToNextTripConfirm: true,
      });
      rerenderTripDetail();
    },
    onCancelMoveToNextTripConfirm: () => {
      appStore.updateTripDetail({
        showMoveToNextTripConfirm: false,
        isMovingToNextTrip: false,
      });
      rerenderTripDetail();
    },
    onConfirmMoveToNextTrip: async (scope) => {
      const trip = tripStore.getCurrentTrip();
      const { session } = sessionStore.getState();

      if (!trip?.id || !session?.user?.id) {
        return;
      }

      appStore.updateTripDetail({
        isMovingToNextTrip: true,
      });
      rerenderTripDetail();

      try {
        const { trip: newTrip, movedCount } = await moveItemsToNextTrip({
          sourceTrip: trip,
          ownerId: session.user.id,
          scope,
        });
        tripStore.prependTrip(newTrip);
        appStore.resetTripDetail();
        navigate(`/app/trip/${newTrip.id}`);
        showToast(`Moved ${movedCount} item${movedCount === 1 ? "" : "s"} to ${getDisplayTitleForToast(newTrip.title, "the new trip")}.`, "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isMovingToNextTrip: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("moveToNextTrip"), "error");
      }
    },
    onOpenDemoteToWishlistConfirm: () => {
      appStore.updateTripDetail({
        showDemoteToWishlistConfirm: true,
      });
      rerenderTripDetail();
    },
    onCancelDemoteToWishlistConfirm: () => {
      appStore.updateTripDetail({
        showDemoteToWishlistConfirm: false,
        isDemotingTrip: false,
      });
      rerenderTripDetail();
    },
    onConfirmDemoteToWishlist: async () => {
      const trip = tripStore.getCurrentTrip();

      if (!trip?.id) {
        return;
      }

      appStore.updateTripDetail({
        isDemotingTrip: true,
      });
      rerenderTripDetail();

      try {
        const demotedTrip = await demoteTripToWishlist({ tripId: trip.id });
        tripStore.updateTrip(demotedTrip);
        tripStore.resetCurrentTrip();
        appStore.resetTripDetail();
        navigate("/app/destinations");
        showToast(`${getDisplayTitleForToast(demotedTrip.title, "Trip")} moved to Wishlist.`, "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isDemotingTrip: false,
        });
        rerenderTripDetail();
        showToast(getTripItemErrorMessage("demoteToWishlist"), "error");
      }
    },
  };
}
