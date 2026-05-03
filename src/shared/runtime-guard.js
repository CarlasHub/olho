function normalizeErrorMessage(error) {
  if (!error) return "Unexpected error.";
  if (typeof error === "string") {
    const text = error.trim();
    return text || "Unexpected error.";
  }
  const message = String(error.message || error.reason || "").trim();
  return message || "Unexpected error.";
}

export function installRuntimeGuard({ onError } = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const notify = typeof onError === "function" ? onError : null;

  window.addEventListener("error", (event) => {
    const message = normalizeErrorMessage(event.error || event.message);
    console.error("Olho runtime error", event.error || event.message);
    if (notify) {
      notify(message);
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = normalizeErrorMessage(event.reason);
    console.error("Olho unhandled rejection", event.reason);
    if (notify) {
      notify(message);
    }
  });
}

