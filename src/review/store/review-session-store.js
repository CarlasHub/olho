export function createVolatileReviewSessionStore() {
  let currentSession = null;

  return {
    get() {
      return currentSession;
    },
    set(session) {
      currentSession = session;
      return currentSession;
    },
    clear() {
      currentSession = null;
    }
  };
}
