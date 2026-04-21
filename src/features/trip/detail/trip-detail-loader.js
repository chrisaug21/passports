import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { fetchTripDetailBundle } from "../../../services/trips-service.js";
import {
  tripDetailState,
  rerenderTripDetail,
} from "./trip-detail-state.js";

let latestRequestedTripId = null;
let latestRequestToken = 0;

export async function loadTripDetail(tripId) {
  latestRequestedTripId = tripId;
  const requestToken = latestRequestToken + 1;
  latestRequestToken = requestToken;
  const previousTripDetail = appStore.getState().tripDetail;
  const currentTrip = tripStore.getCurrentTrip();
  const isSameTrip = currentTrip?.id === tripId;

  if (!isSameTrip) {
    appStore.updateTripDetail({
      status: "loading",
      error: "",
    });
  }

  try {
    const bundle = await fetchTripDetailBundle(tripId);
    if (latestRequestedTripId !== tripId || latestRequestToken !== requestToken) {
      return;
    }

    tripStore.setCurrentTripBundle(bundle);
    const persistedItemStillExists = tripDetailState.persistedEditorItemId
      ? bundle.items.find((item) => item.id === tripDetailState.persistedEditorItemId)
      : null;
    appStore.updateTripDetail({
      ...(isSameTrip ? previousTripDetail : {}),
      status: "ready",
      error: "",
      isShowingTripSettings: false,
      isSavingTrip: false,
      isCreatingItem: false,
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
      editingItemId: persistedItemStillExists ? tripDetailState.persistedEditorItemId : null,
    });
    if (!isSameTrip) {
      tripDetailState.itemEditorInitialSnapshot = "";
      tripDetailState.itemEditorDraft = null;
      tripDetailState.pendingDiscardAction = null;
    }
    if (!persistedItemStillExists) {
      tripDetailState.persistedEditorItemId = null;
    }
    tripDetailState.allocationDraft = null;
    tripDetailState.allocationConfirmState = null;
    tripDetailState.pendingTripSettingsDraft = null;
    tripDetailState.tripLengthConfirmState = null;
    tripDetailState.editingDayTitleId = null;
    tripDetailState.editingDayTitleValue = "";
    rerenderTripDetail();
  } catch (error) {
    if (latestRequestedTripId !== tripId || latestRequestToken !== requestToken) {
      return;
    }

    console.error(error);
    tripStore.resetCurrentTrip();
    appStore.updateTripDetail({
      status: "error",
      error: "We could not load that trip.",
    });
    rerenderTripDetail();
  }
}
