import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  clearRecordingPreview,
  getLastRecordingResult,
  getRecordingState,
  pauseRecording,
  resetRecorderDependenciesForTesting,
  resetRecorderForTesting,
  restoreLatestRecordingDraft,
  resumeRecording,
  saveRecording,
  saveRecordingDraftProgress,
  setRecorderDependenciesForTesting,
  startRecording,
  stopRecording
} from "../src/background/recorder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const originalMediaStream = globalThis.MediaStream;

function createMediaError(name, message) {
  if (typeof DOMException === "function") {
    return new DOMException(message, name);
  }
  return Object.assign(new Error(message), { name });
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, handler, options = {}) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    const wrapped = options?.once
      ? (...args) => {
          this.removeEventListener(type, wrapped);
          handler(...args);
        }
      : handler;

    wrapped.__original = handler;
    this.listeners.get(type).add(wrapped);
  }

  removeEventListener(type, handler) {
    const set = this.listeners.get(type);
    if (!set) return;

    [...set].forEach((entry) => {
      if (entry === handler || entry.__original === handler) {
        set.delete(entry);
      }
    });
  }

  dispatchEvent(type, payload = {}) {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    [...handlers].forEach((handler) => {
      handler(payload);
    });
  }
}

class FakeTrack extends FakeEventTarget {
  constructor(kind, settings = {}) {
    super();
    this.kind = kind;
    this.settings = settings;
    this.stopped = false;
  }

  getSettings() {
    return { ...this.settings };
  }

  stop() {
    this.stopped = true;
    this.dispatchEvent("ended", { target: this });
  }
}

class FakeMediaStream {
  constructor(tracks = []) {
    this.tracks = Array.isArray(tracks) ? [...tracks] : [];
  }

  getTracks() {
    return [...this.tracks];
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
}

class FakeMediaRecorder extends FakeEventTarget {
  constructor(stream, options = {}) {
    super();
    this.stream = stream;
    this.options = options;
    this.mimeType = options.mimeType || "video/webm";
    this.state = "inactive";
  }

  start() {
    this.state = "recording";
  }

  pause() {
    if (this.state === "recording") {
      this.state = "paused";
    }
  }

  resume() {
    if (this.state === "paused") {
      this.state = "recording";
    }
  }

  stop() {
    if (this.state === "inactive") {
      this.dispatchEvent("stop");
      return;
    }

    this.state = "inactive";
    const chunk = new Blob(["recording-bytes"], { type: this.mimeType || "video/webm" });
    this.dispatchEvent("dataavailable", { data: chunk });
    this.dispatchEvent("stop", {});
  }

  requestData() {
    // Best effort no-op for tests that assert flush-before-stop behavior.
  }
}

function createCanvas(width, height) {
  const videoTrack = new FakeTrack("video", { width, height });
  const stream = new FakeMediaStream([videoTrack]);

  const context2d = {
    save() {},
    restore() {},
    fillRect() {},
    drawImage() {},
    beginPath() {},
    arc() {},
    closePath() {},
    clip() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1
  };

  return {
    width,
    height,
    getContext(type) {
      if (type !== "2d") return null;
      return context2d;
    },
    captureStream() {
      return stream;
    }
  };
}

function createVideoElement(stream) {
  return {
    muted: true,
    playsInline: true,
    autoplay: true,
    srcObject: stream,
    readyState: 2,
    videoWidth: 1280,
    videoHeight: 720,
    play: async () => undefined,
    pause: () => undefined,
    removeAttribute: () => undefined,
    load: () => undefined
  };
}

function createDependencies(overrides = {}) {
  const draftStore = new Map();

  return {
    now: () => Date.now(),
    getDisplayMedia: async () =>
      new FakeMediaStream([
        new FakeTrack("video", { width: 1920, height: 1080, displaySurface: "monitor" }),
        new FakeTrack("audio", {})
      ]),
    getUserMedia: async (constraints) => {
      if (constraints?.audio && constraints?.video === false) {
        return new FakeMediaStream([new FakeTrack("audio", {})]);
      }

      return new FakeMediaStream([new FakeTrack("video", { width: 1280, height: 720 })]);
    },
    enumerateDevices: async () => [],
    isMimeTypeSupported: (type) => String(type).startsWith("video/webm"),
    createCanvas,
    createVideoElement,
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    createMediaRecorder: (stream, options) => new FakeMediaRecorder(stream, options),
    createAudioContext: () => null,
    estimateStoragePressure: async () => ({ nearQuota: false, overQuotaLikely: false }),
    saveMedia: async (input) => ({
      id: "media_saved_1",
      kind: "recording",
      folderId: input.folderId,
      metadata: {
        ...(input.metadata || {}),
        title: input.metadata?.title || "Saved Recording"
      }
    }),
    saveRecordingDraft: async (input) => {
      const nowIso = new Date().toISOString();
      const id = input.id || `draft_${Date.now()}`;
      const entry = {
        id,
        kind: "recording",
        title: input.title || "Unsaved Recording Draft",
        folderId: input.folderId || "folder_default_eye",
        tags: Array.isArray(input.tags) ? [...input.tags] : [],
        sourceType: input.sourceType || "screenRecording",
        mimeType: input.mimeType || input.blob?.type || "video/webm",
        extension: input.extension || "webm",
        sizeBytes: input.sizeBytes || input.blob?.size || 0,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
        createdAt: input.createdAt || nowIso,
        updatedAt: nowIso,
        blob: input.blob
      };
      draftStore.set(id, entry);
      return { ...entry };
    },
    getLatestRecordingDraft: async () => {
      if (!draftStore.size) return null;
      const values = [...draftStore.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return { ...values[0] };
    },
    deleteRecordingDraft: async (id) => {
      const deleted = draftStore.delete(id);
      return { deleted, id };
    },
    logError: () => undefined,
    ...overrides
  };
}

async function read(relPath) {
  return fs.readFile(path.join(root, relPath), "utf8");
}

test.beforeEach(async () => {
  globalThis.MediaStream = FakeMediaStream;
  resetRecorderDependenciesForTesting();
  await resetRecorderForTesting();
});

test.after(async () => {
  if (originalMediaStream) {
    globalThis.MediaStream = originalMediaStream;
  } else {
    delete globalThis.MediaStream;
  }
  resetRecorderDependenciesForTesting();
  await resetRecorderForTesting();
});

test("start and stop recording with mocked stream", async () => {
  setRecorderDependenciesForTesting(createDependencies());

  const started = await startRecording({
    mode: "screen",
    includeMic: true,
    includeSystemAudio: true,
    includeCamera: false
  });

  assert.equal(started.mode, "screen");
  assert.equal(started.includeMic, true);

  const stopped = await stopRecording({ reason: "test" });
  assert.ok(stopped.blob instanceof Blob);
  assert.equal(stopped.blob.type.includes("video/webm"), true);
  assert.equal(await stopped.blob.text(), "recording-bytes");
  assert.equal(getRecordingState().active, false);
});

test("permission denied shows explicit error", async () => {
  setRecorderDependenciesForTesting(
    createDependencies({
      getDisplayMedia: async () => {
        throw createMediaError("NotAllowedError", "Permission denied");
      }
    })
  );

  await assert.rejects(() => startRecording({ mode: "screen" }), (error) => {
    assert.match(error.message, /permission was denied/i);
    return true;
  });
});

test("user cancel picker returns non-destructive message", async () => {
  setRecorderDependenciesForTesting(
    createDependencies({
      getDisplayMedia: async () => {
        throw createMediaError("AbortError", "Picker closed");
      }
    })
  );

  await assert.rejects(() => startRecording({ mode: "window" }), (error) => {
    assert.match(error.message, /picker closed/i);
    return true;
  });
});

test("pause and resume update recorder state", async () => {
  setRecorderDependenciesForTesting(createDependencies());

  await startRecording({ mode: "tab" });
  pauseRecording();
  assert.equal(getRecordingState().paused, true);

  resumeRecording();
  assert.equal(getRecordingState().paused, false);

  await stopRecording({ reason: "state_test" });
});

test("stop recording auto-saves draft and restore returns preview", async () => {
  setRecorderDependenciesForTesting(createDependencies());

  await startRecording({ mode: "screen" });
  const stopped = await stopRecording({ reason: "draft_test" });

  assert.equal(stopped.draftPersisted, true);
  assert.ok(stopped.draftId, "stopped result should include draft id");

  const restored = await restoreLatestRecordingDraft();
  assert.ok(restored?.blob instanceof Blob);
  assert.equal(restored.draftId, stopped.draftId);
  assert.ok(getLastRecordingResult()?.blob instanceof Blob);

  await clearRecordingPreview();
});

test("save progress updates local draft metadata", async () => {
  setRecorderDependenciesForTesting(createDependencies());

  await startRecording({ mode: "window" });
  await stopRecording({ reason: "progress_test" });

  const updated = await saveRecordingDraftProgress({
    title: "Draft Title",
    folderId: "folder_progress",
    tags: ["progress", "draft"]
  });

  assert.equal(updated.title, "Draft Title");
  assert.equal(updated.folderId, "folder_progress");
  assert.deepEqual(updated.tags, ["progress", "draft"]);
  assert.ok(updated.draftId);
});

test("recording save persists blob via MediaRepository dependency", async () => {
  let savedPayload = null;
  let deletedDraftId = null;

  setRecorderDependenciesForTesting(
    createDependencies({
      saveMedia: async (input) => {
        savedPayload = input;
        return {
          id: "media_save_check",
          kind: "recording",
          folderId: input.folderId,
          metadata: input.metadata
        };
      },
      deleteRecordingDraft: async (id) => {
        deletedDraftId = id;
        return { deleted: true, id };
      }
    })
  );

  await startRecording({ mode: "screen", includeMic: true });
  const stopped = await stopRecording({ reason: "save_test" });

  const saved = await saveRecording({
    blob: stopped.blob,
    durationMs: stopped.durationMs,
    sourceType: stopped.sourceType,
    draftId: stopped.draftId,
    title: "Team Demo",
    folderId: "folder_demo",
    tags: ["demo", "release"]
  });

  assert.equal(saved.item.id, "media_save_check");
  assert.ok(savedPayload.blob instanceof Blob);
  assert.equal(savedPayload.kind, "recording");
  assert.equal(savedPayload.folderId, "folder_demo");
  assert.deepEqual(savedPayload.metadata.tags, ["demo", "release"]);
  assert.ok(deletedDraftId, "saving should clear persisted recording draft");
});

test("camera missing is handled", async () => {
  setRecorderDependenciesForTesting(
    createDependencies({
      getUserMedia: async (constraints) => {
        if (constraints?.video && constraints?.audio === false) {
          throw createMediaError("NotFoundError", "Camera not found");
        }
        return new FakeMediaStream([new FakeTrack("audio", {})]);
      }
    })
  );

  await assert.rejects(
    () =>
      startRecording({
        mode: "screen",
        includeCamera: true
      }),
    (error) => {
      assert.match(error.message, /camera/i);
      return true;
    }
  );
});

test("camera-only mode records without display picker", async () => {
  let displayCalls = 0;
  let cameraCalls = 0;

  setRecorderDependenciesForTesting(
    createDependencies({
      getDisplayMedia: async () => {
        displayCalls += 1;
        return new FakeMediaStream([
          new FakeTrack("video", { width: 1920, height: 1080, displaySurface: "monitor" }),
          new FakeTrack("audio", {})
        ]);
      },
      getUserMedia: async (constraints) => {
        if (constraints?.video && constraints?.audio === false) {
          cameraCalls += 1;
          return new FakeMediaStream([new FakeTrack("video", { width: 1280, height: 720 })]);
        }
        return new FakeMediaStream([new FakeTrack("audio", {})]);
      }
    })
  );

  const started = await startRecording({ mode: "camera", includeMic: false, includeCamera: false });
  assert.equal(started.mode, "camera");
  assert.equal(displayCalls, 0);
  assert.equal(cameraCalls > 0, true);

  const stopped = await stopRecording({ reason: "camera_mode_test" });
  assert.equal(stopped.sourceType, "cameraRecording");
  assert.equal(stopped.cameraOverlayEnabled, false);
  assert.equal(stopped.microphoneEnabled, false);
});

test("system audio detection reports false when browser provides no audio track", async () => {
  setRecorderDependenciesForTesting(
    createDependencies({
      getDisplayMedia: async () =>
        new FakeMediaStream([new FakeTrack("video", { width: 1920, height: 1080, displaySurface: "browser" })])
    })
  );

  const started = await startRecording({
    mode: "tab",
    includeMic: false,
    includeSystemAudio: true,
    includeCamera: false
  });

  assert.equal(started.includeSystemAudio, true);
  assert.equal(started.systemAudioDetected, false);
  assert.equal(started.displaySurface, "browser");

  const stopped = await stopRecording({ reason: "system_audio_detection_test" });
  assert.equal(stopped.systemAudioDetected, false);
  assert.equal(stopped.displaySurface, "browser");
});

test("microphone missing is handled", async () => {
  setRecorderDependenciesForTesting(
    createDependencies({
      getUserMedia: async (constraints) => {
        if (constraints?.audio && constraints?.video === false) {
          throw createMediaError("NotFoundError", "Microphone missing");
        }
        return new FakeMediaStream([new FakeTrack("video", { width: 1280, height: 720 })]);
      }
    })
  );

  await assert.rejects(
    () =>
      startRecording({
        mode: "screen",
        includeMic: true
      }),
    (error) => {
      assert.match(error.message, /microphone/i);
      return true;
    }
  );
});

test("recording flow performs no network calls", async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Network access is not allowed");
  };

  try {
    setRecorderDependenciesForTesting(createDependencies());
    await startRecording({ mode: "tab" });
    const result = await stopRecording({ reason: "network_check" });
    await saveRecording({ blob: result.blob, title: "No Network" });
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stop recording rejects empty blobs and resets active state", async () => {
  class EmptyChunkRecorder extends FakeMediaRecorder {
    stop() {
      this.state = "inactive";
      this.dispatchEvent("dataavailable", { data: new Blob([], { type: this.mimeType || "video/webm" }) });
      this.dispatchEvent("stop", {});
    }
  }

  setRecorderDependenciesForTesting(
    createDependencies({
      createMediaRecorder: (stream, options) => new EmptyChunkRecorder(stream, options)
    })
  );

  await startRecording({ mode: "screen" });
  await assert.rejects(
    () => stopRecording({ reason: "empty_blob_test" }),
    (error) => {
      assert.match(String(error?.message || ""), /could not finalize a recording/i);
      return true;
    }
  );
  assert.equal(getRecordingState().active, false);
});

test("gallery renders recordings as playable video cards", async () => {
  const source = await read("src/gallery/card-view.js");
  assert.equal(source.includes('document.createElement(itemType(item) === "video" ? "video" : "img")'), true);
  assert.equal(source.includes("thumb.autoplay = true"), true);
  assert.equal(source.includes("openVideoPreview(item)"), true);
});

test("record page supports local WebM download and no fake MP4 or GIF claims", async () => {
  const html = await read("record.html");
  const source = await read("record.js");
  assert.equal(source.includes("downloadPreviewBlob"), true);
  assert.equal(source.includes("chrome.downloads.download"), true);
  assert.equal(source.includes(".webm"), true);
  assert.equal(source.includes("MP4/GIF export is not available locally in this version. WebM is supported."), true);
  assert.equal(html.includes("MP4/GIF export is not available locally in this version. WebM is supported."), true);
  assert.equal(/upload/i.test(source), false);
});
