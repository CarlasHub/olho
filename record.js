import {
  startRecording,
  stopRecording,
  getRecordingState,
  pauseRecording,
  resumeRecording,
  isPaused
} from "./src/background/recorder.js";

const status = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
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
let lastToast = null;

function showToast(message) {
  if (!status) return;
  status.textContent = message;
  lastToast = message;
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = message;
    }
  }, 1200);
}

function updateStatus(message) {
  status.textContent = message;
}

function parseOptions() {
  const params = new URLSearchParams(window.location.search);
  return {
    mode: params.get("mode") || "tab",
    includeMic: params.get("mic") === "1",
    includeSystemAudio: params.get("system") !== "0",
    tabId: Number(params.get("tabId") || 0) || null
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
    await injectOverlay(options.tabId);
    startBtn?.setAttribute("disabled", "true");
    pauseBtn?.removeAttribute("disabled");
    stopBtn?.removeAttribute("disabled");
  } catch (error) {
    console.error(error);
    updateStatus("Failed to start recording.");
    started = false;
  }
}

async function endRecording() {
  try {
    if (!getRecordingState().active) {
      showToast("No active recording.");
      return;
    }
    updateStatus("Stopping…");
    const result = await stopRecording();
    updateStatus("Saved to library.");
    clearInterval(timerId);
    await removeOverlay();
    await chrome.runtime.sendMessage({ type: "record_complete", payload: result });
    setTimeout(() => window.close(), 800);
  } catch (error) {
    console.error(error);
    updateStatus("Failed to stop recording.");
  }
}

pauseBtn?.addEventListener("click", () => {
  try {
    if (!getRecordingState().active) {
      showToast("No active recording.");
      return;
    }
    if (isPaused()) {
      resumeRecording();
      updateStatus("Recording…");
    } else {
      pauseRecording();
      updateStatus("Paused.");
    }
    updatePauseButton();
    updateOverlayState(isPaused());
  } catch (error) {
    console.error(error);
    updateStatus("Pause failed.");
  }
});

startBtn?.addEventListener("click", begin);
stopBtn?.addEventListener("click", endRecording);

galleryBtn?.addEventListener("click", () => {
  const url = chrome.runtime.getURL("gallery.html");
  chrome.tabs.create({ url });
});

optionsBtn?.addEventListener("click", () => chrome.runtime.openOptionsPage());

closeBtn?.addEventListener("click", () => window.close());

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (!started) {
      begin();
      return;
    }
    pauseBtn?.click();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    endRecording();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "record_stop") {
    endRecording();
  }
  if (message?.type === "record_pause") {
    pauseBtn?.click();
  }
  if (message?.type === "record_resume") {
    pauseBtn?.click();
  }
});

updateStatus("Ready to record.");

async function injectOverlay(tabId) {
  if (!tabId || !chrome?.scripting) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (document.getElementById("__olho_record_overlay__")) return;
      const overlay = document.createElement("div");
      overlay.id = "__olho_record_overlay__";
      overlay.style.position = "fixed";
      overlay.style.bottom = "24px";
      overlay.style.right = "24px";
      overlay.style.zIndex = "2147483647";
      overlay.style.background = "rgba(15, 23, 42, 0.9)";
      overlay.style.border = "1px solid rgba(148, 163, 184, 0.3)";
      overlay.style.borderRadius = "14px";
      overlay.style.padding = "10px";
      overlay.style.display = "grid";
      overlay.style.gap = "8px";
      overlay.style.minWidth = "160px";
      overlay.style.color = "#f8fafc";
      overlay.style.font = "600 12px system-ui, sans-serif";
      overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:#f43f5e;box-shadow:0 0 8px rgba(244,63,94,0.8);"></span>
          Recording
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="olhoPauseBtn" style="flex:1;border-radius:10px;padding:6px 8px;border:1px solid rgba(148,163,184,0.3);background:#1f2937;color:#f8fafc;cursor:pointer;">Pause</button>
          <button id="olhoStopBtn" style="flex:1;border-radius:10px;padding:6px 8px;border:none;background:#5b6cff;color:#0b1020;font-weight:700;cursor:pointer;">Stop</button>
        </div>
        <div id="olhoPausePanel" style="display:none;gap:6px;">
          <div style="font-size:11px;color:#cbd5f5;">Paused</div>
          <button id="olhoResumeBtn" style="border-radius:10px;padding:6px 8px;border:1px solid rgba(148,163,184,0.3);background:#111827;color:#f8fafc;cursor:pointer;">Resume</button>
          <button id="olhoGalleryBtn" style="border-radius:10px;padding:6px 8px;border:1px solid rgba(148,163,184,0.3);background:#111827;color:#f8fafc;cursor:pointer;">Open Library</button>
        </div>
      `;
      document.body.appendChild(overlay);

      const pauseBtn = overlay.querySelector("#olhoPauseBtn");
      const stopBtn = overlay.querySelector("#olhoStopBtn");
      const resumeBtn = overlay.querySelector("#olhoResumeBtn");
      const galleryBtn = overlay.querySelector("#olhoGalleryBtn");
      const panel = overlay.querySelector("#olhoPausePanel");

      pauseBtn?.addEventListener("click", () => {
        panel.style.display = "grid";
        pauseBtn.style.display = "none";
        chrome.runtime.sendMessage({ type: "record_pause" });
      });
      resumeBtn?.addEventListener("click", () => {
        panel.style.display = "none";
        pauseBtn.style.display = "inline-flex";
        chrome.runtime.sendMessage({ type: "record_resume" });
      });
      stopBtn?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "record_stop" });
      });
      galleryBtn?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "open_library" });
      });
    }
  });
}

async function updateOverlayState(paused) {
  const options = parseOptions();
  if (!options.tabId || !chrome?.scripting) return;
  await chrome.scripting.executeScript({
    target: { tabId: options.tabId },
    func: (isPaused) => {
      const overlay = document.getElementById("__olho_record_overlay__");
      if (!overlay) return;
      const pauseBtn = overlay.querySelector("#olhoPauseBtn");
      const panel = overlay.querySelector("#olhoPausePanel");
      if (isPaused) {
        panel.style.display = "grid";
        if (pauseBtn) pauseBtn.style.display = "none";
      } else {
        panel.style.display = "none";
        if (pauseBtn) pauseBtn.style.display = "inline-flex";
      }
    },
    args: [paused]
  });
}

async function removeOverlay() {
  const options = parseOptions();
  if (!options.tabId || !chrome?.scripting) return;
  await chrome.scripting.executeScript({
    target: { tabId: options.tabId },
    func: () => {
      const overlay = document.getElementById("__olho_record_overlay__");
      if (overlay) overlay.remove();
    }
  });
}
