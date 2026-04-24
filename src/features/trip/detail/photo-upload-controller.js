import { appStore } from "../../../state/app-store.js";
import { sessionStore } from "../../../state/session-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { rerenderTripDetail } from "./trip-detail-state.js";
import {
  DEFAULT_PHOTO_ASPECT_RATIO,
  openPhotoCropModal,
  openPhotoCropModalFromUrl,
  selectImageFile,
} from "../../../lib/photo-upload.js";
import {
  PHOTO_CONTEXTS,
  recropExistingPrimaryPhoto,
  replaceExistingPrimaryPhoto,
} from "../../../services/photos-service.js";
import { showToast } from "../../shared/toast.js";

export function createPhotoUploadHandlers() {
  return {
    onUploadTripHero: async () => {
      const trip = tripStore.getCurrentTrip();
      await handleHeroPhotoAction({
        tripId: trip?.id,
        context: PHOTO_CONTEXTS.tripHero,
        mode: "adjust",
      });
    },
    onReplaceTripHero: async () => {
      const trip = tripStore.getCurrentTrip();
      await handleHeroPhotoAction({
        tripId: trip?.id,
        context: PHOTO_CONTEXTS.tripHero,
        mode: "replace",
      });
    },
    onUploadBaseHero: async (baseId) => {
      const trip = tripStore.getCurrentTrip();
      await handleHeroPhotoAction({
        tripId: trip?.id,
        baseId,
        context: PHOTO_CONTEXTS.baseHero,
        mode: "adjust",
      });
    },
    onReplaceBaseHero: async (baseId) => {
      const trip = tripStore.getCurrentTrip();
      await handleHeroPhotoAction({
        tripId: trip?.id,
        baseId,
        context: PHOTO_CONTEXTS.baseHero,
        mode: "replace",
      });
    },
  };
}

async function handleHeroPhotoAction({ tripId, baseId = null, context, mode }) {
  const { session } = sessionStore.getState();
  const existingPhoto = getExistingPhoto({ baseId, context });

  if (!session?.user?.id || !tripId) {
    showToast("Your session expired. Sign in again.", "error");
    return;
  }

  try {
    const croppedBlob = existingPhoto && mode !== "replace"
      ? await openPhotoCropModalFromUrl(existingPhoto.public_url, { aspectRatio: DEFAULT_PHOTO_ASPECT_RATIO })
      : await selectAndCropNewPhoto();

    if (!croppedBlob) {
      return;
    }

    appStore.updateTripDetail({
      isSavingTrip: context === PHOTO_CONTEXTS.tripHero,
      isSavingBase: context === PHOTO_CONTEXTS.baseHero,
    });
    rerenderTripDetail();

    const photo = existingPhoto && mode !== "replace"
      ? await recropExistingPrimaryPhoto({
        photoId: existingPhoto.id,
        storagePath: existingPhoto.storage_path,
        blob: croppedBlob,
      })
      : await replaceExistingPrimaryPhoto({
        userId: session.user.id,
        tripId,
        baseId,
        context,
        blob: croppedBlob,
      });

    appStore.updateTripDetail({
      isSavingTrip: false,
      isSavingBase: false,
    });
    applyUploadedPhotoToStore({ photo, baseId, context });
    rerenderTripDetail();
    showToast("Photo updated.", "success");
  } catch (error) {
    console.error(error);
    appStore.updateTripDetail({
      isSavingTrip: false,
      isSavingBase: false,
    });
    rerenderTripDetail();
    showToast("Something went wrong saving. Please try again.", "error");
  }
}

async function selectAndCropNewPhoto() {
  const file = await selectImageFile();

  if (!file) {
    return null;
  }

  return openPhotoCropModal(file, { aspectRatio: DEFAULT_PHOTO_ASPECT_RATIO });
}

function getExistingPhoto({ baseId, context }) {
  if (context === PHOTO_CONTEXTS.tripHero) {
    return tripStore.getCurrentTrip()?.hero_photo || null;
  }

  return tripStore.getCurrentBases().find((entry) => entry.id === baseId)?.hero_photo || null;
}

function applyUploadedPhotoToStore({ photo, baseId, context }) {
  if (context === PHOTO_CONTEXTS.tripHero) {
    const trip = tripStore.getCurrentTrip();

    if (trip) {
      tripStore.updateCurrentTrip({
        ...trip,
        hero_photo_url: photo.public_url,
        hero_photo: photo,
      });
    }

    return;
  }

  const base = tripStore.getCurrentBases().find((entry) => entry.id === baseId) || null;

  if (base) {
    tripStore.updateCurrentBase({
      ...base,
      hero_photo_url: photo.public_url,
      hero_photo: photo,
    });
  }
}
