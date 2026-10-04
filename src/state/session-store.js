export const sessionStore = createSessionStore();

function createSessionStore() {
  let state = {
    session: null,
    // Cosmetic only (shows the admin menu item); the server re-checks every request.
    isAdmin: false,
  };

  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setSession(session) {
      state = { ...state, session, isAdmin: session ? state.isAdmin : false };
      listeners.forEach((listener) => listener(state));
    },
    setAdmin(isAdmin) {
      state = { ...state, isAdmin: Boolean(isAdmin) };
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
