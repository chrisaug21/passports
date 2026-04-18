export const appStore = createAppStore();

function createAppStore() {
  let state = {
    dashboard: {
      status: "idle",
      trips: [],
      error: "",
      isCreatingTrip: false,
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
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
