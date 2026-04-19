export const appStore = createAppStore();

function createAppStore() {
  let state = {
    dashboard: {
      status: "idle",
      trips: [],
      error: "",
      isCreatingTrip: false,
    },
    tripDetail: {
      status: "idle",
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
      viewMode: "master-list",
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
    },
  };

  const listeners = new Set();

  const emit = () => {
    listeners.forEach((listener) => listener(state));
  };

  return {
    getState() {
      return state;
    },
    updateDashboard(patch) {
      state = {
        ...state,
        dashboard: {
          ...state.dashboard,
          ...patch,
        },
      };
      emit();
    },
    resetDashboard() {
      state = {
        ...state,
        dashboard: {
          status: "idle",
          trips: [],
          error: "",
          isCreatingTrip: false,
        },
      };
      emit();
    },
    updateTripDetail(patch) {
      state = {
        ...state,
        tripDetail: {
          ...state.tripDetail,
          ...patch,
        },
      };
      emit();
    },
    resetTripDetail() {
      state = {
        ...state,
        tripDetail: {
          status: "idle",
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
          viewMode: "master-list",
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
        },
      };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
