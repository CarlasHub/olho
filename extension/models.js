export const MESSAGE_TYPES = Object.freeze({
  CAPTURE_VISIBLE: "capture_visible",
  CAPTURE_REGION: "capture_region",
  CAPTURE_FULL_PAGE: "capture_full_page",
  START_RECORDING: "start_recording",
  OPEN_LIBRARY: "open_library",
  OPEN_OPTIONS: "open_options"
});

export function createMessage(type, payload = {}) {
  return {
    type,
    requestId: crypto.randomUUID(),
    payload,
    source: "popup",
    ts: Date.now()
  };
}

export function createResponse(request, data = null, error = null) {
  return {
    ok: !error,
    type: request?.type ?? "unknown",
    requestId: request?.requestId ?? null,
    data,
    error
  };
}

export function isMessage(value) {
  return Boolean(value && typeof value === "object" && typeof value.type === "string");
}
