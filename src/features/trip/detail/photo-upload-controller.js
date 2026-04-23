import { appStore } from "../../../state/app-store.js";
import { sessionStore } from "../../../state/session-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { rerenderTripDetail } from "./trip-detail-state.js";
import { openPhotoCropModal, selectImageFile } from "../../../lib/photo-upload.js";
import {
  PHOTO_CONTEXTS,
  saveUploadedPrimaryPhoto,
} from "../../../services/photos-service.js";
import { showToast } from "../../shared/toast.js";

export function createPhotoUploadHandlers() {
  return {
    onUploadTripHero: async () => {
      const trip = tripStore.getCurrentTrip();
      await uploadHeroPhoto({
        tripId: trip?.id,
        context: PHOTO_CONTEXTS.tripHero,
      });
    },
    onUploadBaseHero: async (baseId) => {
      const trip = tripStore.getCurrentTrip();
      await uploadHeroPhoto({
        tripId: trip?.id,
        baseId,
        context: PHOTO_CONTEXTS.baseHero,
      });
    },
  };
}

async function uploadHeroPhoto({ tripId, baseId = null, context }) {
  const { session } = sessionStore.getState();

  if (!session?.user?.id || !tripId) {
    showToast("Your session expired. Sign in again.", "error");
    return;
  }

  try {
    const file = await selectImageFile();

    if (!file) {
      return;
    }

    const croppedBlob = await openPhotoCropModal(file, { aspectRatio: 16 / 9 });

    if (!croppedBlob) {
      return;
    }

    appStore.updateTripDetail({
      isSavingTrip: context === PHOTO_CONTEXTS.tripHero,
      isSavingBase: context === PHOTO_CONTEXTS.baseHero,
    });
    rerenderTripDetail();

    const photo = await saveUploadedPrimaryPhoto({
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
