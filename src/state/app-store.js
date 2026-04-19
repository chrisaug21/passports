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
      isCreatingItem: false,
      isSavingItem: false,
      editingItemId: null,
      showDiscardConfirm: false,
      viewMode: "master-list",
      isShowingAddBaseForm: false,
      editingBaseId: null,
      assigningBaseId: null,
      isSavingBase: false,
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
          isCreatingItem: false,
          isSavingItem: false,
          editingItemId: null,
          showDiscardConfirm: false,
          viewMode: "master-list",
          isShowingAddBaseForm: false,
          editingBaseId: null,
          assigningBaseId: null,
          isSavingBase: false,
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
