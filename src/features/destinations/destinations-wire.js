import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { sessionStore } from "../../state/session-store.js";
import { navigate } from "../../app/router.js";
import { showToast } from "../shared/toast.js";
import {
  createDestination,
  demoteTripToWishlist,
  promoteDestinationToTrip,
  softDeleteTrip,
  updateDestination,
} from "../../services/trips-service.js";
import { fetchTripNotes } from "../../services/notes-service.js";
import { DEFAULT_PHOTO_ASPECT_RATIO, openPhotoCropModal } from "../../lib/photo-upload.js";
import { PHOTO_CONTEXTS, saveUploadedPrimaryPhoto } from "../../services/photos-service.js";
import { isValidDateInput } from "../../lib/derive.js";
import { getLocationSelection, wireLocationSearch } from "../shared/location-search.js";
import { getSelectedDestination } from "./destinations-view.js";
import { rerenderDestinations } from "./destinations-state.js";

export function openCreateDestinationModal() {
  document.querySelector("#create-destination-modal")?.classList.remove("is-hidden");
}

export function openDestinationCard(tripId) {
  const trip = tripStore.getTrips().find((entry) => String(entry.id) === String(tripId));

  if (!trip) {
    return;
  }

  if (trip.status === "destinations") {
    openDestinationDetail(trip.id);
    return;
  }

  if (trip.status === "active") {
    navigate(`/app/trip/${trip.id}/guide`);
    return;
  }

  if (trip.status === "done") {
    navigate(`/app/trip/${trip.id}/guide#journal`);
    return;
  }

  navigate(`/app/trip/${trip.id}`);
}

async function openDestinationDetail(destinationId) {
  if (!destinationId) {
    return;
  }

  appStore.updateDestinationsPage({
    selectedDestinationId: destinationId,
    destinationDetailStatus: "loading",
    destinationDetailError: "",
    selectedDestinationNotes: [],
  });
  rerenderDestinations();

  try {
    const notes = await fetchTripNotes(destinationId);
    appStore.updateDestinationsPage({
      destinationDetailStatus: "ready",
      destinationDetailError: "",
      selectedDestinationNotes: notes,
    });
    rerenderDestinations();
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({
      destinationDetailStatus: "error",
      destinationDetailError: "We could not load that destination.",
    });
    rerenderDestinations();
  }
}

function closeDestinationDetail() {
  appStore.updateDestinationsPage({
    selectedDestinationId: null,
    destinationDetailStatus: "idle",
    destinationDetailError: "",
    selectedDestinationNotes: [],
    isSavingDestination: false,
    isPromotingDestination: false,
    promotingDestinationId: null,
    isShowingDeleteDestinationConfirm: false,
    isDeletingDestination: false,
  });
  rerenderDestinations();
}

export function openBoardDemoteConfirm(tripId) {
  if (!tripId) {
    return;
  }

  appStore.updateDestinationsPage({
    demotingDestinationId: tripId,
    isDemotingDestination: false,
  });
  rerenderDestinations();
}

export function openBoardPromoteModal(tripId) {
  if (!tripId) {
    return;
  }

  appStore.updateDestinationsPage({ promotingDestinationId: tripId });
  rerenderDestinations();
}

function closeBoardDemoteConfirm() {
  appStore.updateDestinationsPage({
    demotingDestinationId: null,
    isDemotingDestination: false,
  });
  rerenderDestinations();
}

export function wireBoardDemoteConfirmModal() {
  document.querySelector("#cancel-demote-destination")?.addEventListener("click", closeBoardDemoteConfirm);
  document.querySelector("[data-cancel-demote-destination]")?.addEventListener("click", closeBoardDemoteConfirm);
  document.querySelector("#confirm-demote-destination")?.addEventListener("click", handleConfirmBoardDemote);
}

async function handleConfirmBoardDemote() {
  const { demotingDestinationId } = appStore.getState().destinationsPage;
  const trip = getSelectedDestination(demotingDestinationId);

  if (!trip?.id) {
    return;
  }

  appStore.updateDestinationsPage({ isDemotingDestination: true });
  rerenderDestinations();

  try {
    const demotedTrip = await demoteTripToWishlist({ tripId: trip.id });
    tripStore.updateTrip(demotedTrip);
    appStore.updateDestinationsPage({
      demotingDestinationId: null,
      isDemotingDestination: false,
    });
    showToast(`${trip.title || "Trip"} moved to Wishlist.`, "success");
    rerenderDestinations();
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({ isDemotingDestination: false });
    showToast("Could not move that trip to Wishlist right now.", "error");
    rerenderDestinations();
  }
}

export function wireCreateDestinationModal() {
  const modal = document.querySelector("#create-destination-modal");
  const form = document.querySelector("#create-destination-form");
  const closeModal = () => modal?.classList.add("is-hidden");

  document.querySelector("#close-create-destination-modal")?.addEventListener("click", closeModal);
  document.querySelector("#cancel-create-destination")?.addEventListener("click", closeModal);
  document.querySelector("[data-close-create-destination]")?.addEventListener("click", closeModal);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const { session } = sessionStore.getState();

    if (!session?.user?.id) {
      showToast("Your session expired. Sign in again.", "error");
      return;
    }

    const formData = new FormData(form);
    const targetYear = parseOptionalYear(formData.get("targetYear"));
    const targetMonth = targetYear ? parseOptionalMonth(formData.get("targetMonth")) : null;
    const photoFile = getSelectedPhotoFile(formData);
    const location = getLocationSelection(form);

    if (!location.locationName || !location.hasCoordinates) {
      showToast("Search and choose a mapped location before adding.", "error");
      return;
    }

    appStore.updateDestinationsPage({ isCreatingDestination: true });

    try {
      let didPhotoFail = false;
      const newDestination = await createDestination({
        ownerId: session.user.id,
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        targetYear,
        targetMonth,
        locationName: location.locationName,
        lat: location.lat,
        lng: location.lng,
      });
      const destinationWithPhoto = await uploadDestinationPhotoSafely({
        destination: newDestination,
        file: photoFile,
        userId: session.user.id,
        onPhotoFailure: () => {
          didPhotoFail = true;
        },
      });

      tripStore.prependTrip(destinationWithPhoto);
      appStore.updateDestinationsPage({ isCreatingDestination: false });
      showToast(didPhotoFail ? "Destination added, but the photo did not save." : "Destination added.", didPhotoFail ? "error" : "success");
      closeModal();
      form.reset();
      rerenderDestinations();
    } catch (error) {
      console.error(error);
      appStore.updateDestinationsPage({ isCreatingDestination: false });
      showToast("Could not add that destination right now.", "error");
      rerenderDestinations();
    }
  });

  wireLocationSearch(form);
}

export function wireDestinationDetailModal() {
  const form = document.querySelector("#destination-detail-form");

  document.querySelector("#close-destination-detail-modal")?.addEventListener("click", closeDestinationDetail);
  document.querySelector("[data-close-destination-detail]")?.addEventListener("click", closeDestinationDetail);
  document.querySelector("[data-open-destination-notes]")?.addEventListener("click", (event) => {
    const destinationId = event.currentTarget.getAttribute("data-open-destination-notes");

    if (destinationId) {
      appStore.updateDestinationsPage({
        selectedDestinationId: null,
        destinationDetailStatus: "idle",
        selectedDestinationNotes: [],
      });
      navigate(`/app/trip/${destinationId}/notes`);
    }
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSaveDestination(form);
  });

  wireDestinationPhotoField(form);

  document.querySelector("#open-delete-destination-confirm")?.addEventListener("click", () => {
    appStore.updateDestinationsPage({ isShowingDeleteDestinationConfirm: true });
    rerenderDestinations();
  });
  document.querySelector("#cancel-delete-destination")?.addEventListener("click", closeDeleteDestinationConfirm);
  document.querySelector("[data-cancel-delete-destination]")?.addEventListener("click", closeDeleteDestinationConfirm);
  document.querySelector("#confirm-delete-destination")?.addEventListener("click", handleConfirmDeleteDestination);

  document.querySelector("#open-promote-destination-modal")?.addEventListener("click", () => {
    const destinationId = appStore.getState().destinationsPage.selectedDestinationId;
    appStore.updateDestinationsPage({ promotingDestinationId: destinationId });
    rerenderDestinations();
  });
  document.querySelector("#cancel-promote-destination")?.addEventListener("click", closePromoteDestinationModal);
  document.querySelector("[data-cancel-promote-destination]")?.addEventListener("click", closePromoteDestinationModal);
  document.querySelector("#promote-destination-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handlePromoteDestination(event.currentTarget);
  });
}

function closeDeleteDestinationConfirm() {
  appStore.updateDestinationsPage({
    isShowingDeleteDestinationConfirm: false,
    isDeletingDestination: false,
  });
  rerenderDestinations();
}

function closePromoteDestinationModal() {
  appStore.updateDestinationsPage({
    promotingDestinationId: null,
    isPromotingDestination: false,
  });
  rerenderDestinations();
}

function wireDestinationPhotoField(form) {
  const input = form?.querySelector("[data-destination-photo-input]");
  const preview = form?.querySelector("[data-destination-photo-preview]");
  const emptyLabel = form?.querySelector("[data-destination-photo-empty-label]");

  input?.addEventListener("change", () => {
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    emptyLabel.hidden = true;
  });
}

async function handleConfirmDeleteDestination() {
  const destination = getSelectedDestination(appStore.getState().destinationsPage.selectedDestinationId);

  if (!destination?.id) {
    return;
  }

  appStore.updateDestinationsPage({ isDeletingDestination: true });
  rerenderDestinations();

  try {
    await softDeleteTrip(destination.id);
    tripStore.removeTrip(destination.id);
    closeDestinationDetail();
    showToast(`${destination.title || "Destination"} deleted.`, "success");
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({ isDeletingDestination: false });
    showToast("Could not delete that destination right now.", "error");
    rerenderDestinations();
  }
}

async function handleSaveDestination(form) {
  const destination = getSelectedDestination(appStore.getState().destinationsPage.selectedDestinationId);
  const { session } = sessionStore.getState();

  if (!form || !destination?.id || !session?.user?.id) {
    return;
  }

  const formData = new FormData(form);
  const values = getDestinationFormValues(formData);

  if (!values.title) {
    showToast("Add a destination title before saving.", "error");
    return;
  }

  appStore.updateDestinationsPage({ isSavingDestination: true });
  rerenderDestinations();

  try {
    let didPhotoFail = false;
    const updatedDestination = await updateDestination({
      tripId: destination.id,
      title: values.title,
      description: values.description,
      targetYear: values.targetYear,
      targetMonth: values.targetMonth,
    });
    const destinationWithPhoto = await uploadDestinationPhotoSafely({
      destination: updatedDestination,
      file: getSelectedPhotoFile(formData),
      userId: session.user.id,
      onPhotoFailure: () => {
        didPhotoFail = true;
      },
    });

    tripStore.updateTrip(destinationWithPhoto);
    showToast(didPhotoFail ? "Destination saved, but the photo did not save." : "Destination saved.", didPhotoFail ? "error" : "success");
    closeDestinationDetail();
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({ isSavingDestination: false });
    showToast("Could not save that destination right now.", "error");
    rerenderDestinations();
  }
}

async function handlePromoteDestination(form) {
  const destination = getSelectedDestination(appStore.getState().destinationsPage.promotingDestinationId);

  if (!form || !destination?.id) {
    return;
  }

  const formData = new FormData(form);
  const tripLength = Number(formData.get("promoteTripLength"));
  const startDate = String(formData.get("promoteStartDate") || "").trim();

  if (!Number.isInteger(tripLength) || tripLength < 1 || !isValidDateInput(startDate)) {
    showToast("Add a trip length and a valid start date before promoting.", "error");
    return;
  }

  appStore.updateDestinationsPage({ isPromotingDestination: true });
  rerenderDestinations();

  try {
    const promotedTrip = await promoteDestinationToTrip({
      tripId: destination.id,
      title: destination.title,
      description: destination.description,
      tripLength,
      startDate,
    });

    tripStore.updateTrip(promotedTrip);
    closeDestinationDetail();
    showToast("Destination promoted to Planning.", "success");
  } catch (error) {
    console.error(error);
    appStore.updateDestinationsPage({ isPromotingDestination: false });
    showToast("Could not promote that destination right now.", "error");
    rerenderDestinations();
  }
}

function getDestinationFormValues(formData) {
  const targetYear = parseOptionalYear(formData.get("targetYear"));

  return {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    targetYear,
    targetMonth: targetYear ? parseOptionalMonth(formData.get("targetMonth")) : null,
  };
}

function getSelectedPhotoFile(formData) {
  const photo = formData.get("photo");
  return photo instanceof File && photo.size > 0 ? photo : null;
}

async function uploadDestinationPhotoSafely({ destination, file, userId, onPhotoFailure }) {
  if (!file) {
    return destination;
  }

  try {
    return await uploadDestinationPhoto({ destination, file, userId });
  } catch (error) {
    console.error(error);
    onPhotoFailure();
    return destination;
  }
}

async function uploadDestinationPhoto({ destination, file, userId }) {
  const croppedBlob = await openPhotoCropModal(file, { aspectRatio: DEFAULT_PHOTO_ASPECT_RATIO });

  if (!croppedBlob) {
    return destination;
  }

  const photo = await saveUploadedPrimaryPhoto({
    userId,
    tripId: destination.id,
    context: PHOTO_CONTEXTS.tripHero,
    blob: croppedBlob,
  });

  return {
    ...destination,
    hero_photo_url: photo.public_url,
    hero_photo: photo,
  };
}

function parseOptionalYear(value) {
  if (String(value || "").trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1000 ? parsed : null;
}

function parseOptionalMonth(value) {
  if (String(value || "").trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}
