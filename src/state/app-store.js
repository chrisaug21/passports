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
    viewMode: "days",
    masterListFilters: {
      search: "",
      type: "all",
      subtype: "all",
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
    showMoveToNextTripConfirm: false,
    isMovingToNextTrip: false,
    showDemoteToWishlistConfirm: false,
    isDemotingTrip: false,
    isShowingMembersModal: false,
    overviewEditorMode: null,
    editingOverviewBlockId: null,
    overviewEditorScopeBaseId: null,
    isSavingOverviewBlock: false,
    overviewEditorError: "",
    showDeleteOverviewBlockConfirm: false,
    deletingOverviewBlockId: null,
    isDeletingOverviewBlock: false,
  };
}

function createInitialNotesPage() {
  return {
    status: "idle",
    error: "",
    editorMode: null,
    editingNoteId: null,
    isSaving: false,
    editorError: "",
    showDeleteConfirm: false,
    deletingNoteId: null,
    isDeleting: false,
    expandedNoteIds: [],
  };
}

function createInitialPrepPage() {
  return {
    status: "idle",
    error: "",
    editorMode: null,
    editingTodoId: null,
    isSaving: false,
    editorError: "",
    showDeleteConfirm: false,
    deletingTodoId: null,
    isDeleting: false,
    isShowingSuggestions: false,
    hideCompleted: false,
    justRevealedSuggestionTitle: null,
  };
}

function createInitialDestinationsPage() {
  return {
    isCreatingDestination: false,
    selectedDestinationId: null,
    destinationDetailStatus: "idle",
    destinationDetailError: "",
    selectedDestinationNotes: [],
    isSavingDestination: false,
    isPromotingDestination: false,
    promotingDestinationId: null,
    isShowingDeleteDestinationConfirm: false,
    isDeletingDestination: false,
    demotingDestinationId: null,
    isDemotingDestination: false,
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
    notesPage: createInitialNotesPage(),
    prepPage: createInitialPrepPage(),
    destinationsPage: createInitialDestinationsPage(),
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
    updateDestinationsPage(patch) {
      state = {
        ...state,
        destinationsPage: {
          ...state.destinationsPage,
          ...patch,
        },
      };
      emit();
    },
    resetDestinationsPage() {
      state = {
        ...state,
        destinationsPage: createInitialDestinationsPage(),
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
    updateNotesPage(patch) {
      state = {
        ...state,
        notesPage: {
          ...state.notesPage,
          ...patch,
        },
      };
      emit();
    },
    resetNotesPage() {
      state = {
        ...state,
        notesPage: createInitialNotesPage(),
      };
      emit();
    },
    updatePrepPage(patch) {
      state = {
        ...state,
        prepPage: {
          ...state.prepPage,
          ...patch,
        },
      };
      emit();
    },
    resetPrepPage() {
      state = {
        ...state,
        prepPage: createInitialPrepPage(),
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
