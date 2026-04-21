export const appStore = createAppStore();

function createInitialTripDetail() {
  return {
    status: "idle",
    error: "",
    isShowingTripSettings: false,
    isSavingTrip: false,
    isCreatingItem: false,
    isSavingItem: false,
    itemEditorMode: "edit",
    itemEditorContext: null,
    editingItemId: null,
    showDiscardConfirm: false,
    showDeleteItemConfirm: false,
    isDeletingItem: false,
    deletingItemId: null,
    showMoveItemModal: false,
    movingItemId: null,
    isMovingItem: false,
    movingOperationId: null,
    viewMode: "master-list",
    masterListFilters: {
      type: "all",
      status: "all",
      baseId: "all",
    },
    masterListSort: {
      key: "default",
      direction: "asc",
    },
    masterListEditingCell: null,
    isShowingMasterListFilters: false,
    isShowingAddBaseForm: false,
    editingBaseId: null,
    isSavingBase: false,
    showDeleteBaseConfirm: false,
    isDeletingBase: false,
    deletingBaseId: null,
    showDeleteTripConfirm: false,
    isDeletingTrip: false,
  };
}

function createAppStore() {
  let state = {
    dashboard: {
      status: "idle",
      trips: [],
      error: "",
      isCreatingTrip: false,
    },
    tripDetail: createInitialTripDetail(),
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
        tripDetail: createInitialTripDetail(),
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
