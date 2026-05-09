const DEFAULT_STATE = Object.freeze({
  activeTab: null,
  status: "idle",
  error: "",
  target: null,
  session: null,
  findings: [],
  selectedFindingId: "",
  overlayReady: false,
  lastRunAt: ""
});

export function createLiveReviewStore() {
  let state = { ...DEFAULT_STATE };
  const subscribers = new Set();

  function notify() {
    subscribers.forEach((subscriber) => subscriber({ ...state }));
  }

  return {
    getState() {
      return { ...state };
    },
    setState(patch = {}) {
      state = {
        ...state,
        ...patch
      };
      notify();
      return { ...state };
    },
    reset() {
      state = { ...DEFAULT_STATE };
      notify();
      return { ...state };
    },
    subscribe(subscriber) {
      if (typeof subscriber !== "function") return () => {};
      subscribers.add(subscriber);
      subscriber({ ...state });
      return () => subscribers.delete(subscriber);
    }
  };
}
