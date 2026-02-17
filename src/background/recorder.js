import { createItem } from "../storage/storage.js";

const DEFAULT_TITLE_PREFIX = "Screen Recording";
const MAX_PERSIST_BYTES = 2_000_000;

const state = {
  mediaRecorder: null,
  stream: null,
  micStream: null,
  chunks: [],
  startTime: 0,
  mimeType: "",
  recordingId: null
};

function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

async function requestDisplayStream({ mode, includeSystemAudio }) {
  const videoConstraints = {
    frameRate: 30
  };

  const audioConstraints = includeSystemAudio ? { echoCancellation: false, noiseSuppression: false } : false;

  const displayConstraints = {
    video: videoConstraints,
    audio: audioConstraints
  };

  if (mode === "tab") {
    displayConstraints.video = {
      ...videoConstraints,
      preferCurrentTab: true
    };
  }

  return navigator.mediaDevices.getDisplayMedia(displayConstraints);
}

async function requestMicStream() {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

function mixAudioTracks(displayStream, micStream) {
  if (!micStream) return displayStream;

  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  if (displayStream.getAudioTracks().length) {
    const displaySource = audioContext.createMediaStreamSource(displayStream);
    displaySource.connect(destination);
  }

  const micSource = audioContext.createMediaStreamSource(micStream);
  micSource.connect(destination);

  const mixedTracks = destination.stream.getAudioTracks();
  const videoTracks = displayStream.getVideoTracks();

  return new MediaStream([...videoTracks, ...mixedTracks]);
}

function cleanupStreams() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }
  if (state.micStream) {
    state.micStream.getTracks().forEach((track) => track.stop());
  }
  state.stream = null;
  state.micStream = null;
}

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export async function startRecording({
  mode = "tab",
  includeMic = false,
  includeSystemAudio = true
} = {}) {
  if (state.mediaRecorder) {
    throw new Error("Recording already in progress.");
  }

  state.chunks = [];
  state.startTime = Date.now();
  state.mimeType = pickMimeType();

  const displayStream = await requestDisplayStream({ mode, includeSystemAudio });

  let micStream = null;
  if (includeMic) {
    micStream = await requestMicStream();
  }

  const mixedStream = mixAudioTracks(displayStream, micStream);
  state.stream = mixedStream;
  state.micStream = micStream;

  const mediaRecorder = new MediaRecorder(mixedStream, state.mimeType ? { mimeType: state.mimeType } : {});
  state.mediaRecorder = mediaRecorder;

  const recordingId = crypto.randomUUID();
  state.recordingId = recordingId;

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      state.chunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    cleanupStreams();
  };

  mixedStream.getVideoTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
        stopRecording();
      }
    });
  });

  mediaRecorder.start(300);

  return {
    recordingId,
    mimeType: state.mimeType || mediaRecorder.mimeType,
    startedAt: state.startTime
  };
}

export async function stopRecording() {
  if (!state.mediaRecorder) {
    throw new Error("No active recording.");
  }

  const recorder = state.mediaRecorder;

  if (recorder.state !== "inactive") {
    recorder.stop();
  }

  await new Promise((resolve) => {
    if (recorder.state === "inactive") {
      resolve();
      return;
    }
    recorder.addEventListener("stop", () => resolve(), { once: true });
  });

  const blob = new Blob(state.chunks, { type: state.mimeType || recorder.mimeType || "video/webm" });
  const durationMs = Date.now() - state.startTime;

  let finalBlob = blob;
  let finalMimeType = blob.type || "video/webm";

  if (blob.type.includes("webm") && MediaRecorder.isTypeSupported("video/mp4")) {
    // Best-effort: some Chromium builds can record directly to mp4.
    // If supported, the recording would already be mp4; otherwise keep webm.
  }

  const title = `${DEFAULT_TITLE_PREFIX} ${new Date().toLocaleString()}`;
  const blobUrl = URL.createObjectURL(finalBlob);
  const canPersist = finalBlob.size <= MAX_PERSIST_BYTES;
  const dataUrl = canPersist ? await blobToDataUrl(finalBlob) : null;

  const savedItem = await createItem({
    type: "video",
    blobUrl,
    dataUrl,
    metadata: {
      title,
      durationMs,
      mimeType: finalMimeType,
      sizeBytes: finalBlob.size,
      persisted: Boolean(dataUrl)
    }
  });

  const result = {
    recordingId: state.recordingId,
    blobUrl: blobUrl,
    blob: finalBlob,
    item: savedItem,
    durationMs
  };

  state.mediaRecorder = null;
  state.chunks = [];
  state.startTime = 0;
  state.recordingId = null;

  return result;
}

export function isRecording() {
  return Boolean(state.mediaRecorder && state.mediaRecorder.state !== "inactive");
}

export function getRecordingState() {
  return {
    active: isRecording(),
    recordingId: state.recordingId,
    mimeType: state.mimeType,
    startedAt: state.startTime,
    status: state.mediaRecorder?.state || "inactive"
  };
}

export function pauseRecording() {
  if (!state.mediaRecorder) {
    throw new Error("No active recording.");
  }
  if (state.mediaRecorder.state === "recording") {
    state.mediaRecorder.pause();
  }
}

export function resumeRecording() {
  if (!state.mediaRecorder) {
    throw new Error("No active recording.");
  }
  if (state.mediaRecorder.state === "paused") {
    state.mediaRecorder.resume();
  }
}

export function isPaused() {
  return state.mediaRecorder?.state === "paused";
}
