export const sessionStore = createSessionStore();

function createSessionStore() {
  let state = {
    session: null,
  };

  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setSession(session) {
      state = { ...state, session };
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
