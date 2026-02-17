import { startRecording, stopRecording, getRecordingState } from "./src/background/recorder.js";

const status = document.getElementById("status");
const stopBtn = document.getElementById("stopBtn");

let started = false;

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

async function begin() {
  if (started) return;
  started = true;
  const options = parseOptions();

  try {
    await startRecording(options);
    updateStatus(`Recording ${options.mode}…`);
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
    await chrome.runtime.sendMessage({ type: "record_complete", payload: result });
    setTimeout(() => window.close(), 800);
  } catch (error) {
    console.error(error);
    updateStatus("Failed to stop recording.");
  }
}

stopBtn.addEventListener("click", endRecording);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "record_stop") {
    endRecording();
  }
});

if (!getRecordingState().active) {
  begin();
}
