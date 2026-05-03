import { createResponse, isMessage, MESSAGE_TYPES } from "./extension/models.js";
import {
  PROTECTED_PAGE_MESSAGE,
  cancelPageCapture,
  captureElement,
  captureFullPage,
  captureRegion,
  captureVisibleArea,
  downloadCapture,
  normalizeCaptureError
} from "./src/background/capture.js";

const captureRuntime = {
  active: false,
  cancelRequested: false,
  activeTabId: null,
  lastRequest: null,
  lastFailure: null
};
const OFFSCREEN_PATH = "offscreen.html";
let offscreenReadyPromise = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log("Olho service worker installed");
});

self.addEventListener("unhandledrejection", (event) => {
  console.error("Olho service worker unhandled rejection", event.reason);
});

self.addEventListener("error", (event) => {
  console.error("Olho service worker error", event.error || event.message);
});

function parseTabId(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

function isCaptureEligibleTabUrl(url) {
  const value = String(url || "").trim().toLowerCase();
  if (!value) return false;
  return !(
    value.startsWith("chrome-extension://") ||
    value.startsWith("chrome://") ||
    value.startsWith("chrome-search://") ||
    value.startsWith("edge://") ||
    value.startsWith("about:") ||
    value.startsWith("devtools://") ||
    value.startsWith("view-source:") ||
    value.includes("chrome.google.com/webstore") ||
    value.includes("chromewebstore.google.com")
  );
}

async function getActiveTab(preferredTabId = null) {
  const explicitTabId = parseTabId(preferredTabId);
  if (Number.isFinite(explicitTabId)) {
    try {
      const tab = await chrome.tabs.get(explicitTabId);
      if (tab?.id) {
        return tab;
      }
    } catch {
      // fall through to active-tab discovery
    }
  }

  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }
  return tab;
}

async function findMostRecentCapturableTab(excludeIds = []) {
  const excluded = new Set(excludeIds.filter((id) => Number.isFinite(id)));
  const ranked = [];

  const addCandidates = (tabs) => {
    for (const tab of tabs || []) {
      if (!tab?.id || excluded.has(tab.id)) continue;
      if (!isCaptureEligibleTabUrl(tab.url || tab.pendingUrl)) continue;
      ranked.push(tab);
    }
  };

  const lastFocusedTabs = await chrome.tabs.query({ lastFocusedWindow: true }).catch(() => []);
  addCandidates(lastFocusedTabs);

  const allTabs = await chrome.tabs.query({}).catch(() => []);
  addCandidates(allTabs);

  ranked.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  return ranked[0] || null;
}

async function resolveCaptureTargetTab(payloadTabId, fallbackTabId = null) {
  const explicitPayloadId = parseTabId(payloadTabId);
  const fallbackId = parseTabId(fallbackTabId);
  const candidateIds = [explicitPayloadId, fallbackId].filter((id) => Number.isFinite(id));

  if (Number.isFinite(explicitPayloadId)) {
    const explicitTab = await chrome.tabs.get(explicitPayloadId).catch(() => null);
    if (explicitTab?.id) {
      if (!isCaptureEligibleTabUrl(explicitTab.url || explicitTab.pendingUrl)) {
        throw new Error(PROTECTED_PAGE_MESSAGE);
      }
      return explicitTab;
    }
  }

  for (const id of candidateIds) {
    const tab = await chrome.tabs.get(id).catch(() => null);
    if (tab?.id && isCaptureEligibleTabUrl(tab.url || tab.pendingUrl)) {
      return tab;
    }
  }

  const activeTab = await getActiveTab();
  if (activeTab?.id && isCaptureEligibleTabUrl(activeTab.url || activeTab.pendingUrl)) {
    return activeTab;
  }

  const fallback = await findMostRecentCapturableTab([activeTab?.id ?? null, ...candidateIds]);
  if (fallback?.id) {
    return fallback;
  }

  throw new Error("No capturable browser tab is available. Open the page you want to capture and try again.");
}

async function focusCaptureTargetTab(tab) {
  if (!tab?.id) {
    throw new Error("Olho could not resolve a capture target tab.");
  }
  if (!isCaptureEligibleTabUrl(tab.url || tab.pendingUrl)) {
    throw new Error(PROTECTED_PAGE_MESSAGE);
  }

  // When capture is triggered from the extension popup, the underlying page tab
  // is usually already active. Avoid forcing a tab/window focus change in that
  // case so the popup flow remains stable.
  if (tab.active) {
    return tab;
  }

  if (Number.isFinite(tab.windowId)) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => null);
  }

  const activated = await chrome.tabs.update(tab.id, { active: true }).catch(() => null);
  if (!activated?.id) {
    throw new Error("Olho could not focus the target tab for capture. Click the page you want to capture, then try again.");
  }

  await new Promise((resolve) => setTimeout(resolve, 160));
  return activated;
}

async function openEditorTab(itemId) {
  const query = itemId ? `?itemId=${encodeURIComponent(itemId)}` : "";
  const url = chrome.runtime.getURL(`editor.html${query}`);
  await chrome.tabs.create({ url });
}

async function openEditorImportTab() {
  const url = chrome.runtime.getURL("editor.html?import=1");
  await chrome.tabs.create({ url });
}

async function openLibraryTab() {
  const url = chrome.runtime.getURL("gallery.html");
  await chrome.tabs.create({ url });
}

async function openRecordTab({
  mode = "tab",
  mic = false,
  systemAudio = true,
  camera = false,
  autoStart = true
} = {}) {
  const params = new URLSearchParams({
    mode,
    mic: mic ? "1" : "0",
    system: systemAudio ? "1" : "0",
    camera: camera ? "1" : "0",
    autoStart: autoStart ? "1" : "0",
    quick: "1"
  });
  const url = chrome.runtime.getURL(`record.html?${params.toString()}`);
  await chrome.tabs.create({ url });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      resolve(response);
    });
  });
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("Offscreen API is unavailable.");
  }

  if (!offscreenReadyPromise) {
    offscreenReadyPromise = (async () => {
      if (chrome.offscreen.hasDocument) {
        const hasDocument = await chrome.offscreen.hasDocument();
        if (hasDocument) return true;
      }

      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ["BLOBS"],
        justification: "Generate local video poster thumbnails."
      });
      return true;
    })().catch((error) => {
      offscreenReadyPromise = null;
      throw error;
    });
  }

  return offscreenReadyPromise;
}

async function generateVideoThumbnailWithOffscreen(blob, size) {
  await ensureOffscreenDocument();
  const response = await sendRuntimeMessage({
    target: "offscreen",
    type: "offscreen_thumbnail_generate",
    payload: { blob, size }
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Offscreen thumbnail generation failed.");
  }

  return response.thumbnail;
}

function isCaptureMessageType(type) {
  return [
    MESSAGE_TYPES.CAPTURE_VISIBLE,
    MESSAGE_TYPES.CAPTURE_REGION,
    MESSAGE_TYPES.CAPTURE_FULL_PAGE,
    MESSAGE_TYPES.CAPTURE_ELEMENT
  ].includes(type);
}

async function handleCommand(command) {
  switch (command) {
    case "capture-view": {
      await runCaptureFlow(MESSAGE_TYPES.CAPTURE_VISIBLE, { destination: "editor" });
      return;
    }
    case "capture-full-page": {
      await runCaptureFlow(MESSAGE_TYPES.CAPTURE_FULL_PAGE, { destination: "editor" });
      return;
    }
    case "select-area": {
      await runCaptureFlow(MESSAGE_TYPES.CAPTURE_REGION, { destination: "editor" });
      return;
    }
    case "capture-screen-window": {
      await openRecordTab({
        mode: "window",
        mic: false,
        systemAudio: true,
        camera: false,
        autoStart: false
      });
      return;
    }
    case "record-screen": {
      await openRecordTab({
        mode: "screen",
        mic: false,
        systemAudio: true,
        camera: false,
        autoStart: true
      });
      return;
    }
    case "open-memory": {
      await openLibraryTab();
      return;
    }
    case "annotate-local-image": {
      await openEditorImportTab();
      return;
    }
    default:
      return;
  }
}

function toSafeErrorMessage(error, fallback = "Action failed.") {
  const message = String(error?.message || error || "").trim();
  return message || fallback;
}

function resolveResponseErrorMessage(messageType, error) {
  if (
    isCaptureMessageType(messageType) ||
    messageType === MESSAGE_TYPES.RETRY_CAPTURE ||
    messageType === MESSAGE_TYPES.CANCEL_CAPTURE ||
    messageType === "retry_capture" ||
    messageType === "cancel_capture"
  ) {
    const normalized = normalizeCaptureError(error);
    return normalized.message || PROTECTED_PAGE_MESSAGE;
  }

  return toSafeErrorMessage(error);
}

function captureDestination(payload = {}) {
  const value = String(payload.destination || "editor").trim();
  if (["editor", "library", "clipboard", "download"].includes(value)) {
    return value;
  }
  return "editor";
}

function captureSourceName(type) {
  if (type === MESSAGE_TYPES.CAPTURE_REGION) return "region";
  if (type === MESSAGE_TYPES.CAPTURE_FULL_PAGE) return "full-page";
  if (type === MESSAGE_TYPES.CAPTURE_ELEMENT) return "element";
  return "visible";
}

async function runCapture(type, tabId) {
  const runtime = {
    isCancelled: () => captureRuntime.cancelRequested
  };

  if (type === MESSAGE_TYPES.CAPTURE_REGION) {
    return captureRegion(tabId);
  }

  if (type === MESSAGE_TYPES.CAPTURE_FULL_PAGE) {
    return captureFullPage(tabId, runtime);
  }

  if (type === MESSAGE_TYPES.CAPTURE_ELEMENT) {
    return captureElement(tabId, runtime);
  }

  return captureVisibleArea(tabId);
}

async function performCaptureDestination(destination, tabId, result, type) {
  if (destination === "library") {
    try {
      await openLibraryTab();
      return { message: "Capture saved to library." };
    } catch {
      return {
        message: "Capture saved to library. Olho could not open Memory automatically."
      };
    }
  }

  if (destination === "clipboard") {
    return {
      message: "Capture saved to library. Use Copy in Olho popup or editor.",
      clipboardPending: true
    };
  }

  if (destination === "download") {
    try {
      await downloadCapture(result.blob, `olho-${captureSourceName(type)}`);
      return { message: "Capture downloaded and saved to library." };
    } catch {
      return {
        message: "Capture saved to library. Download could not start automatically."
      };
    }
  }

  try {
    await openEditorTab(result.item?.id);
    return { message: "Capture opened in editor and saved to library." };
  } catch {
    return {
      message: "Capture saved to library. Olho could not open the editor automatically."
    };
  }
}

async function runCaptureFlow(type, payload = {}, options = {}) {
  if (captureRuntime.active) {
    throw new Error("A capture is already running. Cancel it or wait for completion.");
  }

  const tab = await focusCaptureTargetTab(
    await resolveCaptureTargetTab(payload.tabId ?? null, options.preferredTabId ?? null)
  );
  captureRuntime.active = true;
  captureRuntime.cancelRequested = false;
  captureRuntime.activeTabId = tab.id;

  if (!options.fromRetry) {
    captureRuntime.lastRequest = { type, payload };
  }

  try {
    const result = await runCapture(type, tab.id);

    if (captureRuntime.cancelRequested) {
      return {
        cancelled: true,
        message: "Capture cancelled."
      };
    }

    const destination = captureDestination(payload);
    const destinationResult = await performCaptureDestination(destination, tab.id, result, type);

    captureRuntime.lastFailure = null;

    return {
      cancelled: false,
      itemId: result.item?.id || null,
      sourceType: result.sourceType,
      destination,
      message: destinationResult.message,
      clipboardPending: Boolean(destinationResult.clipboardPending)
    };
  } catch (error) {
    const normalized = normalizeCaptureError(error);
    captureRuntime.lastFailure = {
      type,
      payload,
      message: normalized.message,
      retryable: normalized.retryable
    };
    throw normalized;
  } finally {
    captureRuntime.active = false;
    captureRuntime.cancelRequested = false;
    captureRuntime.activeTabId = null;
  }
}

async function cancelCapture() {
  captureRuntime.cancelRequested = true;
  const cancelledOverlay = await cancelPageCapture(captureRuntime.activeTabId);

  if (captureRuntime.active || cancelledOverlay) {
    return {
      cancelled: true,
      message: "Capture cancellation requested."
    };
  }

  return {
    cancelled: false,
    message: "No active capture to cancel."
  };
}

async function retryCapture() {
  const candidate = captureRuntime.lastFailure?.retryable
    ? captureRuntime.lastFailure
    : captureRuntime.lastRequest;

  if (!candidate?.type) {
    return {
      cancelled: false,
      message: "No capture available to retry."
    };
  }

  const result = await runCaptureFlow(candidate.type, candidate.payload || {}, { fromRetry: true });
  return {
    ...result,
    message: `Retry complete. ${result.message}`
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isMessage(message)) {
    return;
  }

  if (message.target === "offscreen") {
    return;
  }

  const handle = async () => {
    switch (message.type) {
      case MESSAGE_TYPES.CAPTURE_VISIBLE:
      case MESSAGE_TYPES.CAPTURE_REGION:
      case MESSAGE_TYPES.CAPTURE_FULL_PAGE:
      case MESSAGE_TYPES.CAPTURE_ELEMENT: {
        const payload = message.payload || {};
        const result = await runCaptureFlow(message.type, payload, {
          preferredTabId: sender?.tab?.id ?? null
        });
        return createResponse(message, result);
      }

      case MESSAGE_TYPES.CANCEL_CAPTURE:
      case "cancel_capture": {
        const result = await cancelCapture();
        return createResponse(message, result);
      }

      case MESSAGE_TYPES.RETRY_CAPTURE:
      case "retry_capture": {
        const result = await retryCapture();
        return createResponse(message, result);
      }

      case MESSAGE_TYPES.OPEN_LIBRARY:
      case "open_library": {
        await openLibraryTab();
        return createResponse(message, { opened: true });
      }

      case MESSAGE_TYPES.OPEN_OPTIONS:
      case "open_options": {
        await chrome.runtime.openOptionsPage();
        return createResponse(message, { opened: true });
      }

      case MESSAGE_TYPES.START_RECORDING:
      case "record_start": {
        const payload = message.payload || {};
        await openRecordTab({
          mode: ["screen", "window", "tab", "camera"].includes(payload.mode) ? payload.mode : "tab",
          mic: Boolean(payload.mic),
          systemAudio: payload.systemAudio !== false,
          camera: Boolean(payload.camera),
          autoStart: payload.autoStart !== false
        });
        return createResponse(message, { started: true });
      }

      case "generate_video_thumbnail": {
        const payload = message.payload || {};
        const thumbnail = await generateVideoThumbnailWithOffscreen(payload.blob, payload.size);
        return createResponse(message, thumbnail);
      }

      default:
        if (isCaptureMessageType(message.type)) {
          throw new Error("Unknown capture message.");
        }
        return createResponse(message, { receivedAt: new Date().toISOString() });
    }
  };

  handle()
    .then((response) => sendResponse(response))
    .catch((error) => {
      const errorMessage = resolveResponseErrorMessage(message.type, error);
      console.error("Olho service worker request failed", message.type, error);
      sendResponse(createResponse(message, null, errorMessage));
    });

  return true;
});

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    handleCommand(command).catch((error) => {
      const message = resolveResponseErrorMessage(command, error);
      console.error("Olho command failed", command, message, error);
    });
  });
}
