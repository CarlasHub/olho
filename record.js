import {
  startRecording,
  stopRecording,
  getRecordingState,
  pauseRecording,
  resumeRecording,
  isPaused
} from "./src/background/recorder.js";

const status = document.getElementById("status");
const stopBtn = document.getElementById("stopBtn");
const pauseBtn = document.getElementById("pauseBtn");
const modeValue = document.getElementById("modeValue");
const micValue = document.getElementById("micValue");
const systemValue = document.getElementById("systemValue");
const elapsedValue = document.getElementById("elapsedValue");
const galleryBtn = document.getElementById("galleryBtn");
const optionsBtn = document.getElementById("optionsBtn");
const closeBtn = document.getElementById("closeBtn");

let started = false;
let timerId = null;
let startTime = 0;

function updateStatus(message) {
  status.textContent = message;
}

function parseOptions() {
  const params = new URLSearchParams(window.location.search);
  return {
    mode: params.get("mode") || "tab",
    includeMic: params.get("mic") === "1",
    includeSystemAudio: params.get("system") !== "0"
  };
}

function updateMeta(options) {
  if (modeValue) {
    modeValue.textContent = options.mode === "screen" ? "Screen" : "Tab";
  }
  if (micValue) {
    micValue.textContent = options.includeMic ? "On" : "Off";
  }
  if (systemValue) {
    systemValue.textContent = options.includeSystemAudio ? "On" : "Off";
  }
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    if (!elapsedValue) return;
    elapsedValue.textContent = formatElapsed(Date.now() - startTime);
  }, 500);
}

function updatePauseButton() {
  if (!pauseBtn) return;
  pauseBtn.textContent = isPaused() ? "Resume" : "Pause";
}

async function begin() {
  if (started) return;
  started = true;
  const options = parseOptions();
  updateMeta(options);

  try {
    await startRecording(options);
    updateStatus(`Recording ${options.mode}…`);
    startTime = Date.now();
    startTimer();
    updatePauseButton();
  } catch (error) {
    console.error(error);
    updateStatus("Failed to start recording.");
  }
}

async function endRecording() {
  try {
    updateStatus("Stopping…");
    const result = await stopRecording();
    updateStatus("Saved to library.");
    clearInterval(timerId);
    await chrome.runtime.sendMessage({ type: "record_complete", payload: result });
    setTimeout(() => window.close(), 800);
  } catch (error) {
    console.error(error);
    updateStatus("Failed to stop recording.");
  }
}

pauseBtn?.addEventListener("click", () => {
  try {
    if (isPaused()) {
      resumeRecording();
    } else {
      pauseRecording();
    }
    updatePauseButton();
  } catch (error) {
    console.error(error);
    updateStatus("Pause failed.");
  }
});

stopBtn?.addEventListener("click", endRecording);

galleryBtn?.addEventListener("click", () => {
  const url = chrome.runtime.getURL("gallery.html");
  chrome.tabs.create({ url });
});

optionsBtn?.addEventListener("click", () => chrome.runtime.openOptionsPage());

closeBtn?.addEventListener("click", () => window.close());

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "record_stop") {
    endRecording();
  }
});

if (!getRecordingState().active) {
  begin();
}
