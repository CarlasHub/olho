import {
  RecorderError,
  cancelRecording,
  clearRecordingPreview,
  getLastRecordingResult,
  getRecorderCapabilities,
  getRecorderEventTypes,
  getRecordingState,
  isPaused,
  isRecording,
  listRecorderDevices,
  pauseRecording,
  resumeRecording,
  saveRecording,
  saveRecordingDraftProgress,
  startRecording,
  stopRecording,
  restoreLatestRecordingDraft,
  subscribeRecorderEvents
} from "./src/background/recorder.js";
import { StorageQuotaError, listFolders } from "./src/storage/storage.js";
import { installRuntimeGuard } from "./src/shared/runtime-guard.js";

const sourceMode = document.getElementById("sourceMode");
const countdownSeconds = document.getElementById("countdownSeconds");
const micToggle = document.getElementById("micToggle");
const systemAudioToggle = document.getElementById("systemAudioToggle");
const cameraToggle = document.getElementById("cameraToggle");
const micDeviceSelect = document.getElementById("micDeviceSelect");
const cameraDeviceSelect = document.getElementById("cameraDeviceSelect");
const overlayPosition = document.getElementById("overlayPosition");
const overlayShape = document.getElementById("overlayShape");
const overlaySize = document.getElementById("overlaySize");
const overlaySizeValue = document.getElementById("overlaySizeValue");
const folderSelect = document.getElementById("folderSelect");
const tagsInput = document.getElementById("tagsInput");
const refreshDevicesBtn = document.getElementById("refreshDevicesBtn");
const startBtn = document.getElementById("startBtn");

const setupPanel = document.getElementById("setupPanel");
const recordingPanel = document.getElementById("recordingPanel");
const previewPanel = document.getElementById("previewPanel");
const countdownDisplay = document.getElementById("countdownDisplay");
const recordingStatePill = document.getElementById("recordingStatePill");

const recordingStateText = document.getElementById("recordingStateText");
const timerValue = document.getElementById("timerValue");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const cancelBtn = document.getElementById("cancelBtn");

const previewVideo = document.getElementById("previewVideo");
const previewDuration = document.getElementById("previewDuration");
const previewMime = document.getElementById("previewMime");
const previewSize = document.getElementById("previewSize");
const titleInput = document.getElementById("titleInput");
const saveFolderSelect = document.getElementById("saveFolderSelect");
const saveTagsInput = document.getElementById("saveTagsInput");

const saveBtn = document.getElementById("saveBtn");
const saveDraftBtn = document.getElementById("saveDraftBtn");
const downloadBtn = document.getElementById("downloadBtn");
const openGalleryBtn = document.getElementById("openGalleryBtn");
const recordAgainBtn = document.getElementById("recordAgainBtn");
const discardPreviewBtn = document.getElementById("discardPreviewBtn");

const status = document.getElementById("status");
const permissionsStatus = document.getElementById("permissionsStatus");
const formatStatus = document.getElementById("formatStatus");

const confirmDialog = document.getElementById("confirmDialog");
const confirmTitle = document.getElementById("confirmTitle");
const confirmBody = document.getElementById("confirmBody");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmAcceptBtn = document.getElementById("confirmAcceptBtn");

let timerId = null;
let previewUrl = "";
let previewRecording = null;
let countdownActive = false;
let handlingStopRequest = false;
let confirmResolver = null;
let confirmInvoker = null;
let recorderCapabilities = null;

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(durationMs) {
  const totalSeconds = Math.floor(Math.max(0, Number(durationMs || 0)) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function showStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.style.color = isError
    ? "var(--olho-danger-text)"
    : "var(--olho-text-secondary)";
}

installRuntimeGuard({
  onError(message) {
    showStatus(`Unexpected error: ${message}`, true);
  }
});

function sanitizeFileName(value) {
  const text = String(value || "recording").trim() || "recording";
  return text.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function toTagArray(input) {
  const values = String(input || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const seen = new Set();
  return values.filter((entry) => {
    const lower = entry.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

function readQueryParams() {
  return new URLSearchParams(window.location.search);
}

function shouldAutoStartFromQuery() {
  return readQueryParams().get("autoStart") === "1";
}

function setPanel(panel) {
  setupPanel.hidden = panel !== "setup";
  recordingPanel.hidden = panel !== "recording";
  previewPanel.hidden = panel !== "preview";

  if (!recordingStatePill) return;
  if (panel === "recording") {
    recordingStatePill.textContent = isPaused() ? "Paused" : "Recording";
    recordingStatePill.dataset.state = isPaused() ? "warning" : "recording";
    return;
  }
  if (panel === "preview") {
    recordingStatePill.textContent = "Ready to Save";
    recordingStatePill.dataset.state = "success";
    return;
  }
  recordingStatePill.textContent = "Idle";
  recordingStatePill.dataset.state = "info";
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function updateTimer() {
  const current = getRecordingState();
  timerValue.textContent = formatDuration(current.elapsedMs);
}

function startTimer() {
  stopTimer();
  updateTimer();
  timerId = setInterval(updateTimer, 250);
}

function updatePauseLabel() {
  const nextLabel = isPaused() ? "Resume" : "Pause";
  const labelNode = pauseBtn.querySelector(".btn-label");
  if (labelNode) {
    labelNode.textContent = nextLabel;
  } else {
    pauseBtn.textContent = nextLabel;
  }
  recordingStateText.textContent = isPaused() ? "Paused" : "Recording";
  if (recordingStatePill && !recordingPanel.hidden) {
    recordingStatePill.textContent = isPaused() ? "Paused" : "Recording";
    recordingStatePill.dataset.state = isPaused() ? "warning" : "recording";
  }
}

function resetPreviewUrl() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }
}

function applyOverlaySizeLabel() {
  overlaySizeValue.textContent = `${overlaySize.value}%`;
}

function enableField(field, enabled) {
  field.disabled = !enabled;
}

function updateSetupControlStates() {
  const mode = sourceMode.value;
  const micEnabled = micToggle.checked;
  const overlayEnabled = cameraToggle.checked && mode !== "camera";

  if (mode === "camera") {
    systemAudioToggle.checked = false;
    systemAudioToggle.disabled = true;
    cameraToggle.checked = false;
    cameraToggle.disabled = true;
  } else {
    systemAudioToggle.disabled = false;
    cameraToggle.disabled = false;
  }

  enableField(micDeviceSelect, micEnabled);
  enableField(cameraDeviceSelect, mode === "camera" || overlayEnabled);
  enableField(overlayPosition, overlayEnabled);
  enableField(overlayShape, overlayEnabled);
  enableField(overlaySize, overlayEnabled);
}

function populateDeviceSelect(select, devices, defaultLabel) {
  const previous = select.value;
  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  select.append(defaultOption);

  devices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || defaultLabel;
    select.append(option);
  });

  if (previous && devices.some((device) => device.deviceId === previous)) {
    select.value = previous;
  }
}

function renderCapabilities() {
  const capabilities = getRecorderCapabilities();
  recorderCapabilities = capabilities;
  formatStatus.textContent = "MP4/GIF export is not available locally in this version. WebM is supported.";

  if (!capabilities.canRecordScreen) {
    permissionsStatus.textContent = "This browser context does not support screen recording APIs.";
    startBtn.disabled = true;
  }

  if (!capabilities.supportsSystemAudioHint) {
    systemAudioToggle.checked = false;
    systemAudioToggle.disabled = true;
    permissionsStatus.textContent = "System audio capture is unavailable in this browser context.";
  }
}

async function loadFolders() {
  const folders = await listFolders();
  const optionData = folders.length
    ? folders
    : [
        {
          id: "folder_default_eye",
          name: "In Sight"
        }
      ];

  [folderSelect, saveFolderSelect].forEach((select) => {
    const prev = select.value;
    select.innerHTML = "";
    optionData.forEach((folder) => {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = folder.name;
      select.append(option);
    });

    if (prev && optionData.some((entry) => entry.id === prev)) {
      select.value = prev;
    }
  });
}

async function refreshDevices() {
  try {
    const devices = await listRecorderDevices();
    populateDeviceSelect(micDeviceSelect, devices.microphones, "Default microphone");
    populateDeviceSelect(cameraDeviceSelect, devices.cameras, "Default camera");

    permissionsStatus.textContent = `Detected ${devices.microphones.length} microphone(s) and ${devices.cameras.length} camera(s). Labels may stay hidden until permission is granted.`;
  } catch (error) {
    permissionsStatus.textContent = "Device list unavailable until browser media permissions are granted.";
    console.error("Olho device enumeration failed", error);
  }
}

function collectStartOptions() {
  return {
    mode: sourceMode.value,
    includeMic: micToggle.checked,
    includeSystemAudio: systemAudioToggle.checked,
    includeCamera: cameraToggle.checked,
    micDeviceId: micDeviceSelect.value || "",
    cameraDeviceId: cameraDeviceSelect.value || "",
    frameRate: 30,
    overlay: {
      enabled: cameraToggle.checked,
      position: overlayPosition.value,
      shape: overlayShape.value,
      sizePercent: Number(overlaySize.value)
    }
  };
}

function applyPreview(result) {
  previewRecording = result;

  resetPreviewUrl();
  previewUrl = URL.createObjectURL(result.blob);
  previewVideo.src = previewUrl;

  previewDuration.textContent = formatDuration(result.durationMs);
  previewMime.textContent = result.mimeType || "video/webm";
  previewSize.textContent = formatBytes(result.blob?.size || 0);

  const stamp = new Date(result.stoppedAt || Date.now()).toLocaleString();
  const nextTitle = String(result.title || "").trim() || `Screen Recording ${stamp}`;
  const nextTags = Array.isArray(result.tags) ? result.tags.join(", ") : tagsInput.value;
  const nextFolder = result.folderId || folderSelect.value;

  titleInput.value = nextTitle;
  if (nextFolder) {
    saveFolderSelect.value = nextFolder;
  }
  saveTagsInput.value = nextTags;

  setPanel("preview");
  if (result.draftPersisted === false) {
    showStatus("Recording ready, but draft auto-save failed. Keep this tab open or download now.", true);
  } else {
    showStatus("Recording ready. Save or download locally.");
  }
}

async function startCountdown(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  if (!total) return;

  countdownActive = true;
  countdownDisplay.hidden = false;

  for (let value = total; value > 0; value -= 1) {
    if (!countdownActive) {
      countdownDisplay.hidden = true;
      throw new RecorderError("Countdown cancelled.", "countdown_cancelled", true);
    }

    countdownDisplay.textContent = String(value);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  countdownDisplay.textContent = "REC";
  await new Promise((resolve) => setTimeout(resolve, 450));

  countdownDisplay.hidden = true;
  countdownActive = false;
}

async function startFlow() {
  if (isRecording()) {
    showStatus("Recording already in progress.", true);
    return;
  }

  startBtn.disabled = true;
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
  cancelBtn.disabled = true;
  setPanel("recording");
  countdownDisplay.hidden = true;

  try {
    await startCountdown(countdownSeconds.value);

    const options = collectStartOptions();
    const started = await startRecording(options);

    updatePauseLabel();
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    cancelBtn.disabled = false;
    startTimer();

    if (started.includeSystemAudio && !started.systemAudioDetected && started.mode !== "camera") {
      showStatus("Recording started. System audio is not available for this selected source.");
    } else {
      showStatus("Recording started.");
    }

    if (started.mode === "camera") {
      permissionsStatus.textContent = "Camera-only recording is active. Screen/window picker is not used.";
    } else if (started.includeSystemAudio) {
      permissionsStatus.textContent = started.systemAudioDetected
        ? "System audio track detected for this recording source."
        : "System audio was requested, but no system audio track was provided by the browser/OS for this source.";
    } else if (recorderCapabilities?.supportsSystemAudioHint) {
      permissionsStatus.textContent = "System audio is optional and depends on browser/OS support for the selected source.";
    }
  } catch (error) {
    setPanel("setup");
    const message = error instanceof RecorderError ? error.message : String(error?.message || error);
    showStatus(message, true);
  } finally {
    startBtn.disabled = false;
  }
}

async function stopAndPreparePreview(reason = "user_stop") {
  if (!isRecording()) {
    showStatus("No active recording.", true);
    return;
  }

  handlingStopRequest = true;
  stopBtn.disabled = true;
  pauseBtn.disabled = true;
  cancelBtn.disabled = true;

  try {
    const result = await stopRecording({ reason });
    stopTimer();

    if (result.discarded) {
      setPanel("setup");
      showStatus("Recording discarded.");
      return;
    }

    await loadFolders();
    applyPreview(result);
  } catch (error) {
    stopTimer();
    showStatus(error?.message || "Failed to stop recording.", true);
    setPanel("setup");
  } finally {
    handlingStopRequest = false;
    stopBtn.disabled = false;
    pauseBtn.disabled = false;
    cancelBtn.disabled = false;
  }
}

async function handlePauseResume() {
  if (!isRecording()) {
    showStatus("No active recording.", true);
    return;
  }

  try {
    if (isPaused()) {
      resumeRecording();
      showStatus("Recording resumed.");
    } else {
      pauseRecording();
      showStatus("Recording paused.");
    }

    updatePauseLabel();
    updateTimer();
  } catch (error) {
    showStatus(error?.message || "Pause or resume failed.", true);
  }
}

function openConfirm({ title, message, invoker }) {
  if (!(confirmDialog instanceof HTMLDialogElement) || typeof confirmDialog.showModal !== "function") {
    return Promise.resolve(window.confirm(message || "Are you sure?"));
  }

  confirmInvoker = invoker || document.activeElement;
  confirmTitle.textContent = title || "Confirm";
  confirmBody.textContent = message || "Are you sure?";

  return new Promise((resolve) => {
    confirmResolver = resolve;
    confirmDialog.showModal();
    confirmCancelBtn.focus();
  });
}

function resolveConfirm(choice) {
  if (confirmResolver) {
    confirmResolver(choice);
    confirmResolver = null;
  }

  if (confirmDialog.open) {
    confirmDialog.close();
  }

  if (confirmInvoker instanceof HTMLElement) {
    confirmInvoker.focus();
  }
}

async function handleCancelRecording() {
  if (!isRecording()) {
    showStatus("No active recording.", true);
    return;
  }

  const confirmed = await openConfirm({
    title: "Discard active recording?",
    message: "This will stop recording and discard unsaved video.",
    invoker: cancelBtn
  });

  if (!confirmed) {
    return;
  }

  try {
    await cancelRecording();
    stopTimer();
    setPanel("setup");
    showStatus("Recording discarded.");
  } catch (error) {
    showStatus(error?.message || "Could not cancel recording.", true);
  }
}

async function downloadPreviewBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 20_000);
  }
}

function buildDraftProgressPayload(current) {
  return {
    id: current?.draftId || null,
    blob: current?.blob,
    durationMs: current?.durationMs,
    width: current?.width,
    height: current?.height,
    sourceType: current?.sourceType,
    mode: current?.mode,
    mimeType: current?.mimeType,
    title: titleInput.value,
    folderId: saveFolderSelect.value,
    tags: toTagArray(saveTagsInput.value),
    metadata: {
      recorderSource: sourceMode.value,
      webcamOverlay: cameraToggle.checked
    }
  };
}

async function savePreviewProgress() {
  const current = previewRecording || getLastRecordingResult();
  if (!current?.blob) {
    showStatus("No recording preview available.", true);
    return;
  }

  saveDraftBtn.disabled = true;
  try {
    const updated = await saveRecordingDraftProgress(buildDraftProgressPayload(current));
    previewRecording = updated;
    showStatus("Progress saved locally. You can close and resume later.");
  } catch (error) {
    showStatus(error?.message || "Could not save progress.", true);
  } finally {
    saveDraftBtn.disabled = false;
  }
}

async function savePreview() {
  const current = previewRecording || getLastRecordingResult();
  if (!current?.blob) {
    showStatus("No recording preview available.", true);
    return;
  }

  saveBtn.disabled = true;

  try {
    const result = await saveRecording({
      ...buildDraftProgressPayload(current),
      draftId: current.draftId
    });

    showStatus(result.pressureMessage || "Saved to local library.");
    previewRecording = {
      ...current,
      draftId: null
    };
  } catch (error) {
    if (error instanceof StorageQuotaError && error.blob instanceof Blob) {
      await downloadPreviewBlob(
        error.blob,
        `Olho/olho-recording-quota-fallback-${Date.now()}.webm`
      );
      showStatus("Storage is full. Recording was downloaded to avoid loss.", true);
      return;
    }

    showStatus(error?.message || "Save failed.", true);
  } finally {
    saveBtn.disabled = false;
  }
}

async function downloadPreview() {
  const current = previewRecording || getLastRecordingResult();
  if (!current?.blob) {
    showStatus("No recording preview available.", true);
    return;
  }

  try {
    const filename = `Olho/${sanitizeFileName(titleInput.value || "recording")}-${Date.now()}.webm`;
    await downloadPreviewBlob(current.blob, filename);
    showStatus("Download started.");
  } catch (error) {
    showStatus(error?.message || "Download failed.", true);
  }
}

async function discardPreview() {
  const current = previewRecording || getLastRecordingResult();
  if (!current) {
    setPanel("setup");
    return;
  }

  const confirmed = await openConfirm({
    title: "Discard preview?",
    message: "Discard this unsaved recording preview?",
    invoker: discardPreviewBtn
  });

  if (!confirmed) {
    return;
  }

  await clearRecordingPreview();
  previewRecording = null;
  resetPreviewUrl();
  setPanel("setup");
  showStatus("Preview discarded.");
}

function openGallery() {
  const url = chrome.runtime.getURL("gallery.html");
  chrome.tabs.create({ url });
}

function applyQueryPreset() {
  const params = readQueryParams();

  const mode = params.get("mode");
  if (mode && ["tab", "window", "screen", "camera"].includes(mode)) {
    sourceMode.value = mode;
  }

  if (params.get("mic") === "1") {
    micToggle.checked = true;
  }

  if (params.get("system") === "0") {
    systemAudioToggle.checked = false;
  }

  if (params.get("camera") === "1") {
    cameraToggle.checked = true;
  }

  const quick = params.get("quick") === "1";
  if (quick) {
    countdownSeconds.value = "3";
  }

  updateSetupControlStates();

  if (shouldAutoStartFromQuery()) {
    setTimeout(() => {
      startFlow().catch((error) => {
        console.error("Olho auto-start failed", error);
      });
    }, 150);
  }
}

function handleRecorderEvent(event) {
  const events = getRecorderEventTypes();

  if (event.event === events.ERROR) {
    if (event.error?.message) {
      showStatus(event.error.message, true);
    }
    return;
  }

  if (event.event === events.STOPPED && !handlingStopRequest) {
    stopTimer();

    if (event.discarded) {
      setPanel("setup");
      showStatus("Recording discarded.");
      return;
    }

    const runtimeResult = getLastRecordingResult();
    if (runtimeResult?.blob) {
      loadFolders()
        .then(() => {
          applyPreview(runtimeResult);
          if (event.reason === "source_ended") {
            showStatus("Recording ended because the shared source stopped.", true);
          }
        })
        .catch((error) => {
          showStatus(error?.message || "Recording finished, but preview could not load.", true);
        });
    }
  }

  if (event.event === events.PAUSED || event.event === events.RESUMED) {
    updatePauseLabel();
    updateTimer();
  }
}

function bindEvents() {
  sourceMode.addEventListener("change", updateSetupControlStates);
  micToggle.addEventListener("change", updateSetupControlStates);
  cameraToggle.addEventListener("change", updateSetupControlStates);
  overlaySize.addEventListener("input", applyOverlaySizeLabel);

  refreshDevicesBtn.addEventListener("click", refreshDevices);
  startBtn.addEventListener("click", () => {
    startFlow().catch((error) => {
      showStatus(error?.message || "Could not start recording.", true);
    });
  });

  pauseBtn.addEventListener("click", handlePauseResume);
  stopBtn.addEventListener("click", () => {
    stopAndPreparePreview("user_stop").catch((error) => {
      showStatus(error?.message || "Stop failed.", true);
    });
  });
  cancelBtn.addEventListener("click", handleCancelRecording);

  saveBtn.addEventListener("click", savePreview);
  saveDraftBtn.addEventListener("click", savePreviewProgress);
  downloadBtn.addEventListener("click", downloadPreview);
  openGalleryBtn.addEventListener("click", openGallery);
  recordAgainBtn.addEventListener("click", () => {
    clearRecordingPreview()
      .catch((error) => {
        console.error("Olho failed to clear recording draft", error);
      })
      .finally(() => {
        previewRecording = null;
        resetPreviewUrl();
        setPanel("setup");
        showStatus("Ready for a new recording.");
      });
  });
  discardPreviewBtn.addEventListener("click", discardPreview);

  confirmCancelBtn?.addEventListener("click", () => resolveConfirm(false));
  confirmAcceptBtn?.addEventListener("click", () => resolveConfirm(true));
  confirmDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveConfirm(false);
  });

  window.addEventListener("keydown", (event) => {
    const targetTag = event.target?.tagName;
    const targetIsTextInput = targetTag === "INPUT" || targetTag === "TEXTAREA";

    if (event.code === "Space" && !targetIsTextInput && isRecording()) {
      event.preventDefault();
      handlePauseResume();
    }

    if (event.key === "Escape") {
      if (confirmDialog?.open) {
        event.preventDefault();
        resolveConfirm(false);
        return;
      }

      if (countdownActive) {
        event.preventDefault();
        countdownActive = false;
        showStatus("Countdown cancelled.");
        setPanel("setup");
        return;
      }

      if (isRecording()) {
        event.preventDefault();
        stopAndPreparePreview("user_stop").catch((error) => {
          showStatus(error?.message || "Stop failed.", true);
        });
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    stopTimer();
    resetPreviewUrl();
  });
}

async function init() {
  setPanel("setup");
  updateSetupControlStates();
  applyOverlaySizeLabel();
  renderCapabilities();

  await Promise.all([loadFolders(), refreshDevices()]);

  bindEvents();
  subscribeRecorderEvents(handleRecorderEvent);

  if (!shouldAutoStartFromQuery()) {
    const restored = await restoreLatestRecordingDraft().catch((error) => {
      console.error("Olho failed to restore recording draft", error);
      return null;
    });
    if (restored?.blob) {
      applyPreview(restored);
      showStatus("Restored unsaved recording draft from local library.");
    }
  }

  applyQueryPreset();
  if (!previewRecording) {
    showStatus("Recorder ready.");
  }
}

init().catch((error) => {
  console.error("Olho recorder init failed", error);
  showStatus(error?.message || "Recorder failed to initialize.", true);
});
