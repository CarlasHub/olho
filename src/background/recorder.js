import {
  deleteRecordingDraft,
  estimateStoragePressure,
  getLatestRecordingDraft,
  saveMedia,
  saveRecordingDraft,
  StorageQuotaError
} from "../storage/storage.js";

const DEFAULT_TITLE_PREFIX = "Screen Recording";

const MODE_VALUES = new Set(["screen", "window", "tab", "camera"]);
const OVERLAY_POSITIONS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
const OVERLAY_SHAPES = new Set(["circle", "rounded"]);

const WEBM_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=h264,opus",
  "video/webm"
];

const MP4_MIME_CANDIDATES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"];

const EVENT_TYPES = Object.freeze({
  STARTED: "started",
  PAUSED: "paused",
  RESUMED: "resumed",
  STOPPED: "stopped",
  ERROR: "error"
});

const state = {
  status: "idle",
  mode: "tab",
  sourceType: "tabRecording",
  mediaRecorder: null,
  recorderMimeType: "",
  displayStream: null,
  micStream: null,
  cameraStream: null,
  composedStream: null,
  mixedAudioContext: null,
  compositor: null,
  chunks: [],
  startedAt: 0,
  pausedAt: 0,
  totalPausedMs: 0,
  lastResult: null,
  stopPromise: null,
  activeOptions: null,
  systemAudioDetected: false,
  microphoneEnabled: false,
  cameraOverlayEnabled: false,
  displaySurface: "unknown",
  captureDimensions: {
    width: null,
    height: null
  }
};

const listeners = new Set();

function getGlobalNavigator() {
  return typeof navigator !== "undefined" ? navigator : null;
}

function getGlobalDocument() {
  return typeof document !== "undefined" ? document : null;
}

function getNow() {
  return Date.now();
}

function createDefaultCanvas(width, height) {
  const doc = getGlobalDocument();
  if (doc && typeof doc.createElement === "function") {
    const canvas = doc.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  throw new RecorderError(
    "Olho cannot render local video composition in this environment.",
    "canvas_unavailable",
    false
  );
}

function createDefaultVideoElement(stream, muted = true) {
  const doc = getGlobalDocument();
  if (!doc || typeof doc.createElement !== "function") {
    throw new RecorderError("Video preview is unavailable in this environment.", "video_element_unavailable", false);
  }

  const video = doc.createElement("video");
  video.muted = Boolean(muted);
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  return video;
}

function defaultRequestAnimationFrame(callback) {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(getNow()), 16);
}

function defaultCancelAnimationFrame(id) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
    return;
  }
  clearTimeout(id);
}

function defaultCreateMediaRecorder(stream, options) {
  if (typeof MediaRecorder === "undefined") {
    throw new RecorderError("MediaRecorder is unavailable in this browser.", "media_recorder_unavailable", false);
  }
  return new MediaRecorder(stream, options);
}

function defaultCreateAudioContext() {
  if (typeof AudioContext !== "undefined") {
    return new AudioContext();
  }
  if (typeof webkitAudioContext !== "undefined") {
    return new webkitAudioContext();
  }
  return null;
}

function defaultLogError(...args) {
  console.error(...args);
}

const defaultDependencies = {
  now: getNow,
  getDisplayMedia: (constraints) => {
    const nav = getGlobalNavigator();
    if (!nav?.mediaDevices?.getDisplayMedia) {
      throw new RecorderError(
        "Screen recording is unavailable in this browser context.",
        "display_unavailable",
        false
      );
    }
    return nav.mediaDevices.getDisplayMedia(constraints);
  },
  getUserMedia: (constraints) => {
    const nav = getGlobalNavigator();
    if (!nav?.mediaDevices?.getUserMedia) {
      throw new RecorderError(
        "Camera and microphone capture are unavailable in this browser context.",
        "user_media_unavailable",
        false
      );
    }
    return nav.mediaDevices.getUserMedia(constraints);
  },
  enumerateDevices: async () => {
    const nav = getGlobalNavigator();
    if (!nav?.mediaDevices?.enumerateDevices) {
      return [];
    }
    return nav.mediaDevices.enumerateDevices();
  },
  isMimeTypeSupported: (mimeType) =>
    typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function"
      ? MediaRecorder.isTypeSupported(mimeType)
      : false,
  createCanvas: createDefaultCanvas,
  createVideoElement: createDefaultVideoElement,
  requestAnimationFrame: defaultRequestAnimationFrame,
  cancelAnimationFrame: defaultCancelAnimationFrame,
  createMediaRecorder: defaultCreateMediaRecorder,
  createAudioContext: defaultCreateAudioContext,
  estimateStoragePressure,
  saveMedia,
  saveRecordingDraft,
  getLatestRecordingDraft,
  deleteRecordingDraft,
  logError: defaultLogError
};

let dependencies = { ...defaultDependencies };

export class RecorderError extends Error {
  constructor(message, code = "recorder_error", recoverable = true, cause = null) {
    super(message || "Recorder error");
    this.name = "RecorderError";
    this.code = code;
    this.recoverable = recoverable;
    this.cause = cause;
  }
}

function emit(event, payload = {}) {
  const detail = {
    event,
    ts: dependencies.now(),
    ...payload
  };

  listeners.forEach((listener) => {
    try {
      listener(detail);
    } catch (error) {
      dependencies.logError("Olho recorder listener failure", error);
    }
  });
}

export function subscribeRecorderEvents(listener) {
  if (typeof listener !== "function") {
    throw new Error("Recorder listener must be a function.");
  }

  listeners.add(listener);
  return () => listeners.delete(listener);
}

function normalizeMode(mode) {
  const value = String(mode || "").trim().toLowerCase();
  if (MODE_VALUES.has(value)) {
    return value;
  }
  return "tab";
}

function normalizeOverlayOptions(options = {}) {
  const sizePercent = Number(options.sizePercent);
  const clampedSize = Number.isFinite(sizePercent) ? Math.max(14, Math.min(45, sizePercent)) : 24;

  const position = OVERLAY_POSITIONS.has(options.position) ? options.position : "bottom-right";
  const shape = OVERLAY_SHAPES.has(options.shape) ? options.shape : "circle";

  return {
    enabled: options.enabled !== false,
    position,
    shape,
    sizePercent: clampedSize
  };
}

function normalizeAudioOptions(options = {}) {
  return {
    includeMic: Boolean(options.includeMic),
    includeSystemAudio: options.includeSystemAudio !== false
  };
}

function normalizeStreamOptions(options = {}) {
  return {
    mode: normalizeMode(options.mode),
    audio: normalizeAudioOptions(options),
    includeCamera: Boolean(options.includeCamera),
    cameraDeviceId: options.cameraDeviceId ? String(options.cameraDeviceId) : "",
    micDeviceId: options.micDeviceId ? String(options.micDeviceId) : "",
    overlay: normalizeOverlayOptions(options.overlay),
    frameRate: clampInt(options.frameRate, 10, 60, 30)
  };
}

function clampInt(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function cleanupVideoElement(video) {
  if (!video) return;
  try {
    video.pause?.();
    video.removeAttribute?.("src");
    video.load?.();
    if ("srcObject" in video) {
      video.srcObject = null;
    }
  } catch {
    // Ignore best-effort cleanup failures.
  }
}

function stopStream(stream) {
  if (!stream?.getTracks) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Ignore stop races.
    }
  });
}

function createRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function computeOverlayBox(baseWidth, baseHeight, sourceWidth, sourceHeight, overlayOptions) {
  const margin = Math.max(12, Math.round(Math.min(baseWidth, baseHeight) * 0.03));
  const overlaySize = Math.max(80, Math.round(Math.min(baseWidth, baseHeight) * (overlayOptions.sizePercent / 100)));

  const sourceRatio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
  let width = overlaySize;
  let height = overlaySize;

  if (sourceRatio >= 1) {
    height = Math.max(60, Math.round(overlaySize / sourceRatio));
  } else {
    width = Math.max(60, Math.round(overlaySize * sourceRatio));
  }

  let x = margin;
  let y = margin;

  if (overlayOptions.position.includes("right")) {
    x = baseWidth - width - margin;
  }
  if (overlayOptions.position.includes("bottom")) {
    y = baseHeight - height - margin;
  }

  return { x, y, width, height };
}

function getDisplaySurface(trackSettings = {}) {
  const value = String(trackSettings.displaySurface || "").toLowerCase();
  if (value === "browser") return "browser";
  if (value === "window") return "window";
  if (value === "monitor") return "monitor";
  return "unknown";
}

function deriveSourceType(mode, displaySurface = "unknown") {
  if (mode === "camera") return "cameraRecording";
  if (displaySurface === "browser") {
    return "tabRecording";
  }
  if (displaySurface === "window") {
    return "windowRecording";
  }
  if (displaySurface === "monitor") {
    return "screenRecording";
  }

  if (mode === "tab") return "tabRecording";
  if (mode === "window") return "windowRecording";
  return "screenRecording";
}

function chooseRecordingMimeType() {
  for (const candidate of WEBM_MIME_CANDIDATES) {
    if (dependencies.isMimeTypeSupported(candidate)) {
      return candidate;
    }
  }

  for (const candidate of MP4_MIME_CANDIDATES) {
    if (dependencies.isMimeTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

function getCaptureDimensionsFromTrack(track, fallbackWidth = 1280, fallbackHeight = 720) {
  const settings = track?.getSettings ? track.getSettings() : {};
  const width = clampInt(settings?.width, 320, 7680, fallbackWidth);
  const height = clampInt(settings?.height, 180, 4320, fallbackHeight);
  return {
    width,
    height,
    displaySurface: getDisplaySurface(settings)
  };
}

async function ensureVideoReady(video) {
  if (!video) return;

  if (video.readyState >= 2) {
    await video.play().catch(() => {
      // playback may already be active
    });
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new RecorderError("Video source timed out while preparing recorder.", "video_prepare_timeout", true));
    }, 6000);

    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("error", onError);
    }

    async function onLoadedData() {
      cleanup();
      try {
        await video.play().catch(() => {
          // ignore autoplay failures in extension context
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    }

    function onError() {
      cleanup();
      reject(new RecorderError("Video source failed while preparing recorder.", "video_prepare_failed", true));
    }

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("error", onError);
  });
}

async function createVideoCompositor({ baseStream, webcamStream, overlay, frameRate }) {
  const baseTrack = baseStream?.getVideoTracks?.()[0] || null;
  if (!baseTrack) {
    throw new RecorderError("Selected source does not provide a video track.", "video_track_missing", false);
  }

  const baseDims = getCaptureDimensionsFromTrack(baseTrack);
  const width = baseDims.width;
  const height = baseDims.height;

  const canvas = dependencies.createCanvas(width, height);
  const ctx = canvas?.getContext?.("2d", {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false
  });

  if (!canvas || !ctx) {
    throw new RecorderError(
      "Olho could not initialize local video composition canvas.",
      "canvas_context_unavailable",
      false
    );
  }

  if (typeof canvas.captureStream !== "function") {
    throw new RecorderError(
      "Canvas captureStream is unavailable. Webcam overlay cannot be composed locally.",
      "canvas_capture_unavailable",
      false
    );
  }

  const baseVideo = dependencies.createVideoElement(baseStream, true);
  await ensureVideoReady(baseVideo);

  let webcamVideo = null;
  if (webcamStream?.getVideoTracks?.().length) {
    webcamVideo = dependencies.createVideoElement(webcamStream, true);
    await ensureVideoReady(webcamVideo);
  }

  let rafId = 0;
  let running = true;

  const drawFrame = () => {
    if (!running) return;

    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(baseVideo, 0, 0, width, height);

    if (webcamVideo && overlay.enabled) {
      const webcamWidth = webcamVideo.videoWidth || 1280;
      const webcamHeight = webcamVideo.videoHeight || 720;
      const box = computeOverlayBox(width, height, webcamWidth, webcamHeight, overlay);

      ctx.save();
      if (overlay.shape === "circle") {
        const radius = Math.min(box.width, box.height) / 2;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
      } else {
        createRoundedRectPath(ctx, box.x, box.y, box.width, box.height, Math.max(10, box.width * 0.16));
      }
      ctx.clip();
      ctx.drawImage(webcamVideo, box.x, box.y, box.width, box.height);
      ctx.restore();

      ctx.strokeStyle = "rgba(226, 232, 240, 0.85)";
      ctx.lineWidth = 2;
      if (overlay.shape === "circle") {
        const radius = Math.min(box.width, box.height) / 2;
        ctx.beginPath();
        ctx.arc(box.x + box.width / 2, box.y + box.height / 2, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        createRoundedRectPath(ctx, box.x, box.y, box.width, box.height, Math.max(10, box.width * 0.16));
        ctx.stroke();
      }
    }

    ctx.restore();
    rafId = dependencies.requestAnimationFrame(drawFrame);
  };

  drawFrame();

  const stream = canvas.captureStream(frameRate);

  return {
    stream,
    width,
    height,
    displaySurface: baseDims.displaySurface,
    stop() {
      running = false;
      dependencies.cancelAnimationFrame(rafId);
      cleanupVideoElement(baseVideo);
      cleanupVideoElement(webcamVideo);
      stopStream(stream);
    }
  };
}

function collectAudioTracks({ displayStream, micStream, cameraStream, mode, includeMic }) {
  const tracks = [];

  if (mode !== "camera") {
    const displayTracks = displayStream?.getAudioTracks ? displayStream.getAudioTracks() : [];
    tracks.push(...displayTracks);
  }

  if (includeMic) {
    const micTracks = micStream?.getAudioTracks ? micStream.getAudioTracks() : [];
    tracks.push(...micTracks);

    if (!micTracks.length && mode === "camera") {
      const cameraAudio = cameraStream?.getAudioTracks ? cameraStream.getAudioTracks() : [];
      tracks.push(...cameraAudio);
    }
  }

  return tracks.filter(Boolean);
}

function mixAudioTracks(audioTracks) {
  if (!audioTracks.length) {
    return {
      audioTracks: [],
      audioContext: null
    };
  }

  const audioContext = dependencies.createAudioContext();
  if (!audioContext) {
    return {
      audioTracks,
      audioContext: null
    };
  }

  const destination = audioContext.createMediaStreamDestination();

  audioTracks.forEach((track) => {
    try {
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(destination);
    } catch (error) {
      dependencies.logError("Olho audio track mix failed", error);
    }
  });

  return {
    audioTracks: destination.stream.getAudioTracks(),
    audioContext
  };
}

function buildDisplayConstraints(mode, includeSystemAudio, frameRate) {
  const video = {
    frameRate: {
      ideal: frameRate,
      max: Math.max(frameRate, 30)
    }
  };

  if (mode === "tab") {
    video.preferCurrentTab = true;
    video.displaySurface = "browser";
  }

  if (mode === "window") {
    video.displaySurface = "window";
  }

  if (mode === "screen") {
    video.displaySurface = "monitor";
  }

  const audio = includeSystemAudio
    ? {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    : false;

  return {
    video,
    audio
  };
}

function buildMicConstraints(deviceId = "") {
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };

  if (deviceId) {
    audio.deviceId = { exact: deviceId };
  }

  return {
    video: false,
    audio
  };
}

function buildCameraConstraints(deviceId = "") {
  const video = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 60 }
  };

  if (deviceId) {
    video.deviceId = { exact: deviceId };
  }

  return {
    audio: false,
    video
  };
}

function createUserFacingError(error, context) {
  if (error instanceof RecorderError) {
    return error;
  }

  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  if (context === "display") {
    if (name.includes("abort") || name.includes("notfound")) {
      return new RecorderError("Recording picker closed before selection. Nothing was recorded.", "user_cancelled", true, error);
    }

    if (name.includes("notallowed") || message.includes("permission denied")) {
      return new RecorderError(
        "Screen recording permission was denied. Allow sharing in the browser picker to continue.",
        "display_permission_denied",
        true,
        error
      );
    }
  }

  if (context === "microphone") {
    if (name.includes("notfound") || message.includes("requested device not found")) {
      return new RecorderError("No microphone is available for the selected input.", "mic_unavailable", true, error);
    }

    if (name.includes("notallowed") || message.includes("permission denied")) {
      return new RecorderError("Microphone access was denied.", "mic_permission_denied", true, error);
    }
  }

  if (context === "camera") {
    if (name.includes("notfound") || message.includes("requested device not found")) {
      return new RecorderError("No camera is available for webcam overlay.", "camera_unavailable", true, error);
    }

    if (name.includes("notallowed") || message.includes("permission denied")) {
      return new RecorderError("Camera access was denied.", "camera_permission_denied", true, error);
    }
  }

  return new RecorderError(error?.message || "Recorder failed unexpectedly.", "recorder_unexpected", true, error);
}

function computeElapsedMs() {
  if (!state.startedAt) return 0;

  const now = dependencies.now();
  const reference = state.status === "paused" && state.pausedAt ? state.pausedAt : now;
  return Math.max(0, reference - state.startedAt - state.totalPausedMs);
}

function resetRuntimeState() {
  state.status = "idle";
  state.mode = "tab";
  state.sourceType = "tabRecording";
  state.mediaRecorder = null;
  state.recorderMimeType = "";
  state.displayStream = null;
  state.micStream = null;
  state.cameraStream = null;
  state.composedStream = null;
  state.mixedAudioContext = null;
  state.compositor = null;
  state.chunks = [];
  state.startedAt = 0;
  state.pausedAt = 0;
  state.totalPausedMs = 0;
  state.stopPromise = null;
  state.activeOptions = null;
  state.systemAudioDetected = false;
  state.microphoneEnabled = false;
  state.cameraOverlayEnabled = false;
  state.displaySurface = "unknown";
  state.captureDimensions = { width: null, height: null };
}

function cleanupPipeline() {
  try {
    state.compositor?.stop?.();
  } catch (error) {
    dependencies.logError("Olho compositor cleanup failed", error);
  }

  stopStream(state.displayStream);
  stopStream(state.micStream);
  if (state.cameraStream !== state.displayStream) {
    stopStream(state.cameraStream);
  }
  stopStream(state.composedStream);

  if (state.mixedAudioContext) {
    state.mixedAudioContext.close().catch(() => {
      // Ignore AudioContext close races.
    });
  }
}

async function stopRecorderInstance(recorder) {
  await new Promise((resolve) => {
    if (!recorder) {
      resolve();
      return;
    }

    let finished = false;
    const onStop = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    recorder.addEventListener("stop", onStop, { once: true });

    if (recorder.state === "inactive") {
      onStop();
      return;
    }

    try {
      if (typeof recorder.requestData === "function") {
        try {
          recorder.requestData();
        } catch {
          // Best effort flush before stopping.
        }
      }
      recorder.stop();
    } catch {
      onStop();
    }
  });
}

function toTagArray(input) {
  const values = Array.isArray(input) ? input : String(input || "").split(",");
  const seen = new Set();

  return values
    .map((entry) => String(entry || "").trim())
    .filter((entry) => {
      if (!entry) return false;
      const lower = entry.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
}

function defaultRecordingTitle() {
  return `${DEFAULT_TITLE_PREFIX} ${new Date(dependencies.now()).toLocaleString()}`;
}

function extensionFromMimeType(mimeType = "") {
  const lower = String(mimeType).toLowerCase();
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("webm")) return "webm";
  return "webm";
}

function buildDraftPayload(recording, overrides = {}) {
  const blob = overrides.blob instanceof Blob ? overrides.blob : recording?.blob;
  if (!(blob instanceof Blob)) {
    throw new RecorderError("Recording draft Blob is required.", "draft_blob_missing", true);
  }

  const sourceType = overrides.sourceType || recording?.sourceType || "screenRecording";
  const mimeType = overrides.mimeType || recording?.mimeType || blob.type || "video/webm";
  const tags = toTagArray(overrides.tags ?? recording?.tags ?? []);
  const title =
    String(overrides.title ?? recording?.title ?? "").trim() ||
    String(recording?.metadata?.title || "").trim() ||
    defaultRecordingTitle();

  return {
    id: overrides.id || recording?.draftId || null,
    blob,
    title,
    folderId: overrides.folderId || recording?.folderId || null,
    tags,
    sourceType,
    mimeType,
    extension: String(overrides.extension || recording?.extension || extensionFromMimeType(mimeType)),
    sizeBytes: blob.size,
    width:
      Number.isFinite(overrides.width) ? overrides.width : Number.isFinite(recording?.width) ? recording.width : null,
    height:
      Number.isFinite(overrides.height)
        ? overrides.height
        : Number.isFinite(recording?.height)
          ? recording.height
          : null,
    durationMs:
      Number.isFinite(overrides.durationMs)
        ? overrides.durationMs
        : Number.isFinite(recording?.durationMs)
          ? recording.durationMs
          : null,
    metadata: {
      ...(recording?.metadata && typeof recording.metadata === "object" ? recording.metadata : {}),
      ...(overrides.metadata && typeof overrides.metadata === "object" ? overrides.metadata : {}),
      title,
      tags,
      sourceType,
      mimeType,
      extension: String(overrides.extension || recording?.extension || extensionFromMimeType(mimeType))
    }
  };
}

function buildPreviewFromDraft(draft) {
  if (!draft?.blob || !(draft.blob instanceof Blob)) {
    return null;
  }

  const metadata = draft.metadata && typeof draft.metadata === "object" ? { ...draft.metadata } : {};

  return {
    blob: draft.blob,
    durationMs: Number.isFinite(draft.durationMs) ? draft.durationMs : null,
    mimeType: draft.mimeType || draft.blob.type || "video/webm",
    mode: metadata.recordingMode || metadata.mode || "screen",
    sourceType: draft.sourceType || metadata.sourceType || "screenRecording",
    width: Number.isFinite(draft.width) ? draft.width : null,
    height: Number.isFinite(draft.height) ? draft.height : null,
    stoppedAt: new Date(draft.updatedAt || draft.createdAt || dependencies.now()).getTime(),
    reason: "draft_restore",
    discarded: false,
    draftId: draft.id,
    title: draft.title || metadata.title || "Unsaved Recording Draft",
    folderId: draft.folderId || null,
    tags: Array.isArray(draft.tags) ? [...draft.tags] : toTagArray(metadata.tags || []),
    extension: draft.extension || extensionFromMimeType(draft.mimeType || draft.blob.type || "video/webm"),
    metadata: metadata
  };
}

async function persistPreviewDraft(recording, overrides = {}) {
  const payload = buildDraftPayload(recording, overrides);
  const savedDraft = await dependencies.saveRecordingDraft(payload);
  const preview = buildPreviewFromDraft(savedDraft);
  if (!preview) {
    throw new RecorderError("Olho could not build a draft preview from saved data.", "draft_preview_invalid", true);
  }
  return preview;
}

export function getRecorderCapabilities() {
  const nav = getGlobalNavigator();
  const hasDisplayMedia = Boolean(nav?.mediaDevices?.getDisplayMedia);
  const hasUserMedia = Boolean(nav?.mediaDevices?.getUserMedia);
  const hasMediaRecorder = typeof MediaRecorder !== "undefined";

  const webmSupported = WEBM_MIME_CANDIDATES.some((candidate) => dependencies.isMimeTypeSupported(candidate));
  const mp4Supported = MP4_MIME_CANDIDATES.some((candidate) => dependencies.isMimeTypeSupported(candidate));

  return {
    canRecordScreen: hasDisplayMedia && hasMediaRecorder,
    canRecordWindow: hasDisplayMedia && hasMediaRecorder,
    canRecordTab: hasDisplayMedia && hasMediaRecorder,
    canRecordCamera: hasUserMedia && hasMediaRecorder,
    supportsMicrophone: hasUserMedia,
    supportsSystemAudioHint: hasDisplayMedia,
    supportsWebcamOverlay: hasUserMedia,
    webmSupported,
    mp4Supported,
    gifSupported: false,
    recommendedMimeType: chooseRecordingMimeType() || "video/webm"
  };
}

export async function listRecorderDevices() {
  const devices = await dependencies.enumerateDevices();

  const microphones = [];
  const cameras = [];

  devices.forEach((device) => {
    if (!device || !device.kind) return;

    if (device.kind === "audioinput") {
      microphones.push({
        deviceId: device.deviceId,
        label: device.label || "Microphone",
        groupId: device.groupId || ""
      });
    }

    if (device.kind === "videoinput") {
      cameras.push({
        deviceId: device.deviceId,
        label: device.label || "Camera",
        groupId: device.groupId || ""
      });
    }
  });

  return {
    microphones,
    cameras
  };
}

export function getRecordingState() {
  return {
    active: state.status === "recording" || state.status === "paused",
    paused: state.status === "paused",
    status: state.status,
    mode: state.mode,
    sourceType: state.sourceType,
    startedAt: state.startedAt,
    elapsedMs: computeElapsedMs(),
    mimeType: state.recorderMimeType,
    width: state.captureDimensions.width,
    height: state.captureDimensions.height,
    hasPreview: Boolean(state.lastResult?.blob)
  };
}

export function isRecording() {
  return state.status === "recording" || state.status === "paused";
}

export function isPaused() {
  return state.status === "paused";
}

export function getLastRecordingResult() {
  if (!state.lastResult) return null;
  return {
    ...state.lastResult
  };
}

export async function startRecording(options = {}) {
  if (isRecording()) {
    throw new RecorderError("Recording already in progress.", "recording_in_progress", true);
  }

  const normalized = normalizeStreamOptions(options);
  const mimeType = chooseRecordingMimeType();

  state.lastResult = null;
  resetRuntimeState();

  state.status = "preparing";
  state.mode = normalized.mode;
  state.recorderMimeType = mimeType;
  state.activeOptions = normalized;

  let displayStream = null;
  let cameraStream = null;
  let micStream = null;

  try {
    if (normalized.mode === "camera") {
      cameraStream = await dependencies.getUserMedia(buildCameraConstraints(normalized.cameraDeviceId));
    } else {
      displayStream = await dependencies
        .getDisplayMedia(buildDisplayConstraints(normalized.mode, normalized.audio.includeSystemAudio, normalized.frameRate))
        .catch((error) => {
          throw createUserFacingError(error, "display");
        });

      if (!displayStream?.getVideoTracks?.().length) {
        throw new RecorderError("The selected source did not provide a video stream.", "video_track_missing", true);
      }
    }

    if (normalized.audio.includeMic) {
      micStream = await dependencies.getUserMedia(buildMicConstraints(normalized.micDeviceId)).catch((error) => {
        throw createUserFacingError(error, "microphone");
      });
    }

    if (normalized.includeCamera && normalized.mode !== "camera") {
      cameraStream = await dependencies.getUserMedia(buildCameraConstraints(normalized.cameraDeviceId)).catch((error) => {
        throw createUserFacingError(error, "camera");
      });
    }

    const baseStream = normalized.mode === "camera" ? cameraStream : displayStream;

    const compositor = await createVideoCompositor({
      baseStream,
      webcamStream: normalized.mode === "camera" ? null : normalized.includeCamera ? cameraStream : null,
      overlay: normalized.overlay,
      frameRate: normalized.frameRate
    });

    const audioTracks = collectAudioTracks({
      displayStream,
      micStream,
      cameraStream,
      mode: normalized.mode,
      includeMic: normalized.audio.includeMic
    });

    const mixed = mixAudioTracks(audioTracks);
    const composedStream = new MediaStream([...(compositor.stream.getVideoTracks() || []), ...mixed.audioTracks]);
    const systemAudioDetected = normalized.mode !== "camera" && Boolean(displayStream?.getAudioTracks?.().length);

    const recorderOptions = mimeType ? { mimeType } : {};
    const mediaRecorder = dependencies.createMediaRecorder(composedStream, recorderOptions);

    state.displayStream = displayStream;
    state.cameraStream = cameraStream;
    state.micStream = micStream;
    state.compositor = compositor;
    state.composedStream = composedStream;
    state.mixedAudioContext = mixed.audioContext;
    state.mediaRecorder = mediaRecorder;
    state.captureDimensions = {
      width: compositor.width,
      height: compositor.height
    };
    state.sourceType = deriveSourceType(state.mode, compositor.displaySurface);
    state.systemAudioDetected = systemAudioDetected;
    state.microphoneEnabled = Boolean(normalized.audio.includeMic);
    state.cameraOverlayEnabled = Boolean(normalized.includeCamera && normalized.mode !== "camera");
    state.displaySurface = compositor.displaySurface || "unknown";
    state.chunks = [];
    state.startedAt = dependencies.now();
    state.pausedAt = 0;
    state.totalPausedMs = 0;

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        state.chunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("error", (event) => {
      const error = event?.error || new Error("MediaRecorder error");
      const wrapped = createUserFacingError(error, "recorder");
      emit(EVENT_TYPES.ERROR, { error: wrapped });
    });

    const sourceTrack = (normalized.mode === "camera" ? cameraStream : displayStream)?.getVideoTracks?.()[0] || null;

    if (sourceTrack) {
      sourceTrack.addEventListener(
        "ended",
        () => {
          if (!isRecording()) return;
          stopRecording({ reason: "source_ended" }).catch((error) => {
            emit(EVENT_TYPES.ERROR, { error: createUserFacingError(error, "recorder") });
          });
        },
        { once: true }
      );
    }

    mediaRecorder.start(400);

    state.status = "recording";

    const payload = {
      status: state.status,
      mode: state.mode,
      sourceType: state.sourceType,
      mimeType: state.recorderMimeType || mediaRecorder.mimeType || "video/webm",
      startedAt: state.startedAt,
      width: state.captureDimensions.width,
      height: state.captureDimensions.height,
      includeMic: normalized.audio.includeMic,
      includeSystemAudio: normalized.audio.includeSystemAudio,
      includeCamera: normalized.includeCamera,
      systemAudioDetected,
      displaySurface: state.displaySurface
    };

    emit(EVENT_TYPES.STARTED, payload);
    return payload;
  } catch (error) {
    cleanupPipeline();
    resetRuntimeState();

    const wrapped = error instanceof RecorderError ? error : createUserFacingError(error, "recorder");
    emit(EVENT_TYPES.ERROR, { error: wrapped });
    throw wrapped;
  }
}

export function pauseRecording() {
  if (!state.mediaRecorder || state.status !== "recording") {
    throw new RecorderError("No active recording to pause.", "pause_not_available", true);
  }

  try {
    state.mediaRecorder.pause();
    state.status = "paused";
    state.pausedAt = dependencies.now();
    emit(EVENT_TYPES.PAUSED, {
      status: state.status,
      elapsedMs: computeElapsedMs()
    });
  } catch (error) {
    throw createUserFacingError(error, "recorder");
  }
}

export function resumeRecording() {
  if (!state.mediaRecorder || state.status !== "paused") {
    throw new RecorderError("Recording is not paused.", "resume_not_available", true);
  }

  try {
    state.mediaRecorder.resume();
    const now = dependencies.now();
    state.totalPausedMs += Math.max(0, now - state.pausedAt);
    state.pausedAt = 0;
    state.status = "recording";
    emit(EVENT_TYPES.RESUMED, {
      status: state.status,
      elapsedMs: computeElapsedMs()
    });
  } catch (error) {
    throw createUserFacingError(error, "recorder");
  }
}

export async function stopRecording({ reason = "user_stop", discard = false } = {}) {
  if (!state.mediaRecorder || !isRecording()) {
    throw new RecorderError("No active recording.", "stop_not_available", true);
  }

  if (state.stopPromise) {
    return state.stopPromise;
  }

  state.stopPromise = (async () => {
    try {
      if (state.status === "paused" && state.pausedAt) {
        state.totalPausedMs += Math.max(0, dependencies.now() - state.pausedAt);
        state.pausedAt = 0;
      }

      const recorder = state.mediaRecorder;
      await stopRecorderInstance(recorder);

      const durationMs = Math.max(0, dependencies.now() - state.startedAt - state.totalPausedMs);
      const mimeType = state.recorderMimeType || recorder.mimeType || "video/webm";
      const blob = new Blob(state.chunks, { type: mimeType });
      if (blob.size <= 0) {
        throw new RecorderError(
          "Olho could not finalize a recording from the selected source.",
          "recording_blob_empty",
          true
        );
      }

      const result = {
        blob,
        durationMs,
        mimeType,
        mode: state.mode,
        sourceType: state.sourceType,
        displaySurface: state.displaySurface || "unknown",
        width: state.captureDimensions.width,
        height: state.captureDimensions.height,
        microphoneEnabled: state.microphoneEnabled,
        cameraOverlayEnabled: state.cameraOverlayEnabled,
        systemAudioDetected: state.systemAudioDetected,
        stoppedAt: dependencies.now(),
        reason,
        discarded: Boolean(discard)
      };

      let finalResult = { ...result };
      if (!discard) {
        try {
          const persistedDraft = await persistPreviewDraft(result, {
            title: defaultRecordingTitle(),
            tags: [],
            folderId: null,
            metadata: {
              recordingMode: result.mode,
              sourceType: result.sourceType,
              localOnly: true
            }
          });

          finalResult = {
            ...result,
            ...persistedDraft,
            draftPersisted: true
          };
        } catch (error) {
          const wrapped = error instanceof RecorderError ? error : createUserFacingError(error, "recorder");
          emit(EVENT_TYPES.ERROR, {
            error: new RecorderError(
              `Recording stopped, but auto-save draft failed: ${wrapped.message}`,
              "draft_save_failed",
              true,
              wrapped
            )
          });
          finalResult = {
            ...result,
            draftPersisted: false,
            draftErrorMessage: wrapped.message
          };
        }
        state.lastResult = finalResult;
      } else {
        state.lastResult = null;
      }

      cleanupPipeline();
      resetRuntimeState();

      emit(EVENT_TYPES.STOPPED, {
        ...finalResult,
        hasBlob: blob instanceof Blob,
        blobSize: blob.size
      });

      return finalResult;
    } catch (error) {
      cleanupPipeline();
      resetRuntimeState();
      const wrapped = error instanceof RecorderError ? error : createUserFacingError(error, "recorder");
      emit(EVENT_TYPES.ERROR, { error: wrapped });
      throw wrapped;
    }
  })();

  try {
    return await state.stopPromise;
  } finally {
    state.stopPromise = null;
  }
}

export async function cancelRecording() {
  if (!isRecording()) {
    state.lastResult = null;
    return {
      discarded: true,
      reason: "nothing_active"
    };
  }

  return stopRecording({ reason: "user_cancel", discard: true });
}

export async function saveRecording(options = {}) {
  const recording = options.blob instanceof Blob ? options : state.lastResult;
  if (!recording?.blob || !(recording.blob instanceof Blob)) {
    throw new RecorderError("No recording preview is available to save.", "save_not_available", true);
  }

  const blob = recording.blob;
  const sourceType = recording.sourceType || state.sourceType || "screenRecording";
  const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : recording.durationMs || null;
  const width = Number.isFinite(options.width) ? options.width : recording.width || null;
  const height = Number.isFinite(options.height) ? options.height : recording.height || null;
  const mimeType = options.mimeType || recording.mimeType || blob.type || "video/webm";
  const draftId = options.draftId || recording.draftId || null;

  const tags = toTagArray(options.tags || []);
  const title = String(options.title || "").trim() || defaultRecordingTitle();

  const pressure = await dependencies.estimateStoragePressure(blob.size).catch(() => ({ nearQuota: false }));

  let item;
  try {
    item = await dependencies.saveMedia({
      kind: "recording",
      blob,
      folderId: options.folderId || null,
      tags,
      favourite: Boolean(options.favourite),
      sourceType,
      metadata: {
        ...(options.metadata && typeof options.metadata === "object" ? options.metadata : {}),
        title,
        tags,
        durationMs,
        mimeType,
        extension: String(options.extension || "").trim() || extensionFromMimeType(mimeType),
        sizeBytes: blob.size,
        width,
        height,
          sourceType,
          displaySurface: recording.displaySurface || "unknown",
          microphoneEnabled: Boolean(recording.microphoneEnabled),
          cameraOverlayEnabled: Boolean(recording.cameraOverlayEnabled),
          systemAudioDetected: Boolean(recording.systemAudioDetected),
          recordingMode: recording.mode || options.mode || "screen",
          mp4ExportSupported: getRecorderCapabilities().mp4Supported,
          gifExportSupported: false,
        localOnly: true
      }
    });
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      throw error;
    }

    throw new RecorderError(
      error?.message || "Olho could not save this recording locally.",
      "save_failed",
      true,
      error
    );
  }

  const pressureMessage = pressure?.nearQuota
    ? "Saved to local library. Browser storage is nearly full."
    : "Saved to local library.";

  if (draftId) {
    try {
      await dependencies.deleteRecordingDraft(draftId);
    } catch (error) {
      emit(EVENT_TYPES.ERROR, {
        error: new RecorderError(
          `Recording saved, but cleanup of draft failed: ${String(error?.message || error)}`,
          "draft_cleanup_failed",
          true,
          error
        )
      });
    }
  }

  if (state.lastResult?.blob === blob) {
    state.lastResult = {
      ...state.lastResult,
      draftId: null
    };
  }

  return {
    item,
    blob,
    pressureMessage,
    mp4ExportSupported: getRecorderCapabilities().mp4Supported,
    gifExportSupported: false
  };
}

export async function saveRecordingDraftProgress(options = {}) {
  const recording = options.blob instanceof Blob ? options : state.lastResult;
  if (!recording?.blob || !(recording.blob instanceof Blob)) {
    throw new RecorderError("No recording preview is available to save as draft.", "draft_not_available", true);
  }

  const saved = await persistPreviewDraft(recording, {
    id: options.id || recording.draftId || null,
    title: options.title ?? recording.title,
    tags: options.tags ?? recording.tags,
    folderId: options.folderId ?? recording.folderId,
    sourceType: options.sourceType ?? recording.sourceType,
    durationMs: options.durationMs ?? recording.durationMs,
    width: options.width ?? recording.width,
    height: options.height ?? recording.height,
    mimeType: options.mimeType ?? recording.mimeType,
    extension: options.extension ?? recording.extension,
    metadata: {
      ...(recording.metadata && typeof recording.metadata === "object" ? recording.metadata : {}),
      ...(options.metadata && typeof options.metadata === "object" ? options.metadata : {}),
      recordingMode: recording.mode || options.mode || "screen",
      localOnly: true
    }
  });

  state.lastResult = {
    ...recording,
    ...saved
  };

  return getLastRecordingResult();
}

export async function restoreLatestRecordingDraft() {
  const draft = await dependencies.getLatestRecordingDraft();
  if (!draft) return null;

  const preview = buildPreviewFromDraft(draft);
  if (!preview) return null;

  state.lastResult = preview;
  return getLastRecordingResult();
}

export async function clearRecordingPreview() {
  const draftId = state.lastResult?.draftId || null;
  state.lastResult = null;
  if (draftId) {
    try {
      await dependencies.deleteRecordingDraft(draftId);
    } catch (error) {
      emit(EVENT_TYPES.ERROR, {
        error: new RecorderError(
          `Olho could not clear draft from local storage: ${String(error?.message || error)}`,
          "draft_clear_failed",
          true,
          error
        )
      });
    }
  }
}

export function setRecorderDependenciesForTesting(overrides = {}) {
  dependencies = {
    ...dependencies,
    ...overrides
  };
}

export function resetRecorderDependenciesForTesting() {
  dependencies = { ...defaultDependencies };
}

export async function resetRecorderForTesting() {
  try {
    if (isRecording()) {
      await stopRecording({ reason: "test_reset", discard: true });
    }
  } catch {
    // ignore best-effort cleanup during tests
  }

  cleanupPipeline();
  resetRuntimeState();
  await clearRecordingPreview().catch(() => {
    state.lastResult = null;
  });
  try {
    const latest = await dependencies.getLatestRecordingDraft();
    if (latest?.id) {
      await dependencies.deleteRecordingDraft(latest.id);
    }
  } catch {
    // ignore best-effort draft cleanup for tests
  }
  listeners.clear();
}

export function getRecorderEventTypes() {
  return { ...EVENT_TYPES };
}
