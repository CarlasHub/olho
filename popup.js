import { MESSAGE_TYPES, createMessage } from "./extension/models.js";
import {
  StorageQuotaError,
  createItem,
  getAppSettings,
  getMediaBlob,
  listRecent,
  moveToTrash,
  saveMedia,
  updateMediaMetadata
} from "./src/storage/storage.js";
import { installRuntimeGuard } from "./src/shared/runtime-guard.js";
import { importDesignScreenshotForReview } from "./src/review/design/design-import-controller.js";
import { detectDesignSource } from "./src/review/design/design-source-detector.js";

const toast = document.getElementById("toast");
const recentList = document.getElementById("recentList");
const clipboardFallbackPanel = document.getElementById("clipboardFallbackPanel");
const clipboardFallbackText = document.getElementById("clipboardFallbackText");
const openEditorCopyBtn = document.getElementById("openEditorCopyBtn");
const captureBlockedPanel = document.getElementById("captureBlockedPanel");
const captureBlockedText = document.getElementById("captureBlockedText");
const blockedScreenCaptureBtn = document.getElementById("blockedScreenCaptureBtn");
const blockedRetryBtn = document.getElementById("blockedRetryBtn");
const blockedDismissBtn = document.getElementById("blockedDismissBtn");
const screenCapturePreviewPanel = document.getElementById("screenCapturePreviewPanel");
const screenCapturePreviewImage = document.getElementById("screenCapturePreviewImage");
const previewSourceLabel = document.getElementById("previewSourceLabel");
const previewDimensions = document.getElementById("previewDimensions");
const previewSizeEstimate = document.getElementById("previewSizeEstimate");
const previewOpenEditorBtn = document.getElementById("previewOpenEditorBtn");
const previewSaveMemoryBtn = document.getElementById("previewSaveMemoryBtn");
const previewDownloadBtn = document.getElementById("previewDownloadBtn");
const previewCopyBtn = document.getElementById("previewCopyBtn");
const previewRetakeBtn = document.getElementById("previewRetakeBtn");
const previewDiscardBtn = document.getElementById("previewDiscardBtn");
const screenRegionCropPanel = document.getElementById("screenRegionCropPanel");
const screenRegionCropCanvas = document.getElementById("screenRegionCropCanvas");
const screenRegionCropConfirmBtn = document.getElementById("screenRegionCropConfirmBtn");
const screenRegionCropRetakeBtn = document.getElementById("screenRegionCropRetakeBtn");
const screenRegionCropCancelBtn = document.getElementById("screenRegionCropCancelBtn");
const reviewCurrentDesignBtn = document.getElementById("reviewCurrentDesignBtn");
const reviewImportInput = document.getElementById("reviewImportInput");

let toastTimer = null;
let pendingClipboardItemId = null;
let screenCapturePreviewState = null;
let screenCapturePreviewUrl = "";
let appSettings = {
  defaultAfterCaptureAction: "editor",
  skipEditorMode: "never",
  captureDelaySeconds: 0,
  autoDownload: false
};
let activeDelayToken = 0;
let cancelActiveDelay = false;
const screenRegionCropState = {
  active: false,
  source: null,
  image: null,
  dragging: false,
  startX: 0,
  startY: 0,
  selection: null
};

const actionMap = {
  "capture-visible": MESSAGE_TYPES.CAPTURE_VISIBLE,
  "capture-region": MESSAGE_TYPES.CAPTURE_REGION,
  "capture-full": MESSAGE_TYPES.CAPTURE_FULL_PAGE,
  "capture-element": MESSAGE_TYPES.CAPTURE_ELEMENT,
  "start-recording": MESSAGE_TYPES.START_RECORDING,
  "open-library": MESSAGE_TYPES.OPEN_LIBRARY,
  "open-options": MESSAGE_TYPES.OPEN_OPTIONS
};

const reviewActionMap = {
  "review-current-screen": {
    type: MESSAGE_TYPES.CAPTURE_VISIBLE,
    captureAction: "capture-visible",
    mode: "current-screen",
    forceDesign: false
  },
  "review-full-page": {
    type: MESSAGE_TYPES.CAPTURE_FULL_PAGE,
    captureAction: "capture-full",
    mode: "full-page",
    forceDesign: false
  },
  "review-current-design": {
    type: MESSAGE_TYPES.CAPTURE_VISIBLE,
    captureAction: "capture-visible",
    mode: "current-design",
    forceDesign: true
  }
};

function showToast(message, isError = false) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  toast.style.borderColor = isError
    ? "var(--olho-danger-border)"
    : "var(--olho-border-medium)";
  toast.style.color = isError
    ? "var(--olho-danger-text)"
    : "var(--olho-text-primary)";
  toast.style.background = isError
    ? "var(--olho-danger-bg)"
    : "var(--olho-bg-panel-raised)";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

installRuntimeGuard({
  onError(message) {
    showToast(`Unexpected error: ${message}`, true);
  }
});

function sendBusMessage(type, payload = {}) {
  const message = createMessage(type, payload);
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

function isCapturableTabUrl(url) {
  const value = String(url || "").trim().toLowerCase();
  if (!value) return false;
  const extensionRoot = chrome.runtime.getURL("").toLowerCase();
  if (value.startsWith(extensionRoot)) return false;
  return !(
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

async function resolveCaptureTabId() {
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const activeTab = tabs.find((tab) => tab?.active);
  if (Number.isFinite(activeTab?.id)) {
    const activeUrl = String(activeTab.url || activeTab.pendingUrl || "").toLowerCase();
    const extensionRoot = chrome.runtime.getURL("").toLowerCase();

    // If popup.html is opened as a browser tab during debug/testing, target the
    // opener tab so capture still applies to the user page.
    if (activeUrl.startsWith(extensionRoot) && Number.isFinite(activeTab.openerTabId)) {
      return activeTab.openerTabId;
    }
    if (activeUrl.startsWith(extensionRoot)) {
      // popup.html can be opened as a standalone extension tab (no openerTabId).
      // In that case, capture must target the most recently used capturable page tab.
      const fallbackFromExtensionTab = tabs
        .filter((tab) => tab?.id && tab.id !== activeTab.id && isCapturableTabUrl(tab.url || tab.pendingUrl))
        .sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
      if (Number.isFinite(fallbackFromExtensionTab?.id)) {
        return fallbackFromExtensionTab.id;
      }
    } else {
      return activeTab.id;
    }
  }

  const fallback = tabs
    .filter((tab) => tab?.id && isCapturableTabUrl(tab.url || tab.pendingUrl))
    .sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];

  return Number.isFinite(fallback?.id) ? fallback.id : null;
}

function capturePayload(action) {
  if (!["capture-visible", "capture-region", "capture-full", "capture-element"].includes(action)) {
    return {};
  }

  let destination = String(appSettings.defaultAfterCaptureAction || "editor");
  if (!["editor", "library", "clipboard", "download"].includes(destination)) {
    destination = "editor";
  }

  if (destination === "editor") {
    if (appSettings.skipEditorMode === "always") {
      destination = "library";
    } else if (appSettings.skipEditorMode === "fullPageOnly" && action === "capture-full") {
      destination = "library";
    }
  }

  if (appSettings.autoDownload && destination === "library") {
    destination = "download";
  }

  return {
    destination
  };
}

function shouldApplyCaptureDelay(action) {
  return action.startsWith("capture-");
}

async function runCaptureDelayIfNeeded(action) {
  if (!shouldApplyCaptureDelay(action)) return;
  const seconds = Math.max(0, Number(appSettings.captureDelaySeconds || 0));
  if (!seconds) return;

  const token = ++activeDelayToken;
  cancelActiveDelay = false;
  for (let remaining = seconds; remaining > 0; remaining -= 1) {
    if (cancelActiveDelay || token !== activeDelayToken) {
      throw new Error("Delayed capture cancelled.");
    }
    showToast(`Capture in ${remaining}s. Press Escape to cancel.`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (cancelActiveDelay || token !== activeDelayToken) {
    throw new Error("Delayed capture cancelled.");
  }
}

function hideClipboardFallback() {
  pendingClipboardItemId = null;
  if (clipboardFallbackPanel) {
    clipboardFallbackPanel.hidden = true;
  }
  if (clipboardFallbackText) {
    clipboardFallbackText.textContent = "Clipboard copy is blocked in this environment.";
  }
}

function showClipboardFallback(message, itemId) {
  pendingClipboardItemId = itemId || null;
  if (clipboardFallbackText) {
    clipboardFallbackText.textContent = message;
  }
  if (clipboardFallbackPanel) {
    clipboardFallbackPanel.hidden = false;
  }
}

function showCaptureBlockedFallback(message) {
  if (captureBlockedText) {
    captureBlockedText.textContent = message;
  }
  if (captureBlockedPanel) {
    captureBlockedPanel.hidden = false;
  }
}

function hideCaptureBlockedFallback() {
  if (captureBlockedPanel) {
    captureBlockedPanel.hidden = true;
  }
  if (captureBlockedText) {
    captureBlockedText.textContent = "Capture blocked on this page.";
  }
}

function classifyClipboardError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  const lockedDownPatterns = [
    /enterprise/,
    /policy/,
    /managed/,
    /rdp/,
    /remote desktop/,
    /wayland/,
    /permission denied/,
    /denied/,
    /security/,
    /notallowederror/,
    /clipboard.*disabled/,
    /operation is insecure/
  ];

  const gesturePatterns = [/user activation/, /gesture/, /not focused/, /focus/];

  if (lockedDownPatterns.some((pattern) => pattern.test(message))) {
    return {
      lockedDown: true,
      message:
        "Clipboard is blocked by this environment (RDP, enterprise policy, or Linux/Wayland)."
    };
  }

  if (gesturePatterns.some((pattern) => pattern.test(message))) {
    return {
      lockedDown: false,
      message: "Clipboard write needs a direct click in an Olho page."
    };
  }

  return {
    lockedDown: false,
    message: "Clipboard write was blocked in this browser context."
  };
}

function derivePickerSourceType(trackSettings = {}) {
  const display = String(trackSettings.displaySurface || "").toLowerCase();
  if (display === "window") {
    return {
      sourceType: "windowRecording",
      sourceLabel: "Window",
      displaySurface: "window"
    };
  }
  if (display === "browser") {
    return {
      sourceType: "tabRecording",
      sourceLabel: "Tab",
      displaySurface: "browser"
    };
  }
  if (display === "monitor") {
    return {
      sourceType: "screenRecording",
      sourceLabel: "Screen",
      displaySurface: "monitor"
    };
  }

  return {
    sourceType: "screenRecording",
    sourceLabel: "Unknown source",
    displaySurface: display || "unknown"
  };
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function sanitizeTitleSegment(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function safeHostFromUrl(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function resolveCaptureTab() {
  const tabId = await resolveCaptureTabId();
  if (!Number.isFinite(tabId)) return null;
  return chrome.tabs.get(tabId).catch(() => null);
}

function reviewSourceFromTab(tab, { forceDesign = false } = {}) {
  const host = safeHostFromUrl(tab?.url || tab?.pendingUrl || "");
  const detected = detectDesignSource({
    metadata: {
      sourceUrl: tab?.url || tab?.pendingUrl || "",
      sourceLabel: host,
      title: tab?.title || ""
    }
  });
  const isKnownDesign = detected.sourceType === "figma-capture" || detected.sourceType === "zeplin-capture";

  if (isKnownDesign) {
    return {
      ...detected,
      host,
      isDesignScreen: true
    };
  }

  if (forceDesign) {
    return {
      sourceType: "static-design",
      isDesignScreen: true,
      platform: "",
      confidence: 0.5,
      reason: "User requested Design Review from current screen.",
      host
    };
  }

  return {
    sourceType: "webpage-capture",
    isDesignScreen: false,
    platform: "",
    confidence: 0.7,
    reason: "Current browser tab capture.",
    host
  };
}

function reviewMetadataForTab(tab, reviewAction = {}) {
  const source = reviewSourceFromTab(tab, reviewAction);
  const metadata = {
    reviewEntryPoint: "popup-review",
    reviewCaptureMode: reviewAction.mode || "current-screen",
    reviewSourceType: source.sourceType,
    sourceHost: source.host || "",
    sourcePageTitle: sanitizeTitleSegment(tab?.title || ""),
    sourceDetectionReason: source.reason || "",
    sourceDetectionConfidence: source.confidence
  };

  if (source.isDesignScreen) {
    metadata.designReview = true;
    metadata.isDesignScreen = true;
    metadata.designPlatform = source.platform || "";
  }

  return metadata;
}

function collectVisibleReviewMetrics() {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1
  };
  const selectors = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[role='heading']",
    "[role='tab']",
    "[role='menuitem']",
    "[role='alert']",
    "[role='status']",
    "label",
    "p",
    "li",
    "th",
    "td",
    "main",
    "article",
    "section",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "fieldset",
    "[class*='card' i]",
    "[class*='tile' i]",
    "[class*='panel' i]",
    "[class*='section' i]",
    "[class*='hero' i]",
    "[class*='block' i]",
    "[class*='container' i]",
    "[class*='content' i]",
    "[class*='grid' i]",
    "[class*='row' i]",
    "[class*='column' i]",
    "[class*='toolbar' i]",
    "[class*='sidebar' i]",
    "[class*='modal' i]",
    "[class*='dialog' i]",
    "[class*='badge' i]",
    "[class*='pill' i]",
    "[class*='alert' i]",
    "[class*='error' i]",
    "[class*='status' i]"
  ];

  function selectorFor(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const tag = element.tagName.toLowerCase();
    const classNames = Array.from(element.classList || [])
      .slice(0, 2)
      .map((name) => `.${CSS.escape(name)}`)
      .join("");
    return `${tag}${classNames}`;
  }

  function roleFor(element) {
    return element.getAttribute("role") || "";
  }

  function componentTypeFor(element, role, selector) {
    const tag = element.tagName.toLowerCase();
    const text = `${selector} ${role} ${tag}`.toLowerCase();
    if (/^h[1-6]$/.test(tag) || role === "heading") return "heading";
    if (tag === "button" || role === "button" || /\b(btn|button|cta)\b/.test(text)) return "button";
    if (tag === "a" || role === "link") return "link";
    if (/\b(card|tile|panel|modal|dialog)\b/.test(text)) return "card";
    if (/\b(alert|error)\b/.test(text)) return "error";
    if (/\b(status|badge|pill|tag)\b/.test(text)) return "status";
    if (
      /^(main|article|section|nav|header|footer|aside|form|fieldset)$/.test(tag) ||
      /\b(section|hero|block|container|content|grid|row|column|toolbar|sidebar)\b/.test(text)
    ) {
      return "region";
    }
    return "";
  }

  function isVisible(rect, style) {
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    if (rect.width < 4 || rect.height < 4) return false;
    if (rect.right < 0 || rect.bottom < 0 || rect.left > viewport.width || rect.top > viewport.height) return false;
    return true;
  }

  const seen = new Set();
  const elements = [];
  document.querySelectorAll(selectors.join(",")).forEach((element) => {
    if (!(element instanceof HTMLElement) || seen.has(element)) return;
    seen.add(element);
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (!isVisible(rect, style)) return;
    const selector = selectorFor(element);
    const role = roleFor(element);
    const text = String(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const type = componentTypeFor(element, role, selector);
    if (!text && !type) return;

    elements.push({
      selector,
      tagName: element.tagName.toLowerCase(),
      role,
      type,
      text,
      bounds: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      computedStyle: {
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight
      },
      interactive: Boolean(
        element.matches("button,a[href],input,select,textarea,[role='button'],[role='link'],[role='tab'],[role='menuitem']")
      ),
      headingLevel: /^h[1-6]$/i.test(element.tagName) ? Number(element.tagName.slice(1)) : Number(element.getAttribute("aria-level") || 0)
    });
  });

  return {
    source: "popup-live-dom",
    capturedAt: new Date().toISOString(),
    viewport,
    elements: elements.slice(0, 140)
  };
}

async function collectReviewMetricsForTab(tabId) {
  if (!Number.isFinite(tabId) || !chrome?.scripting?.executeScript) return null;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectVisibleReviewMetrics
  });
  const metrics = result?.result || null;
  if (!metrics || !Array.isArray(metrics.elements)) return null;
  return metrics;
}

async function openReviewItem(itemId) {
  const safeItemId = String(itemId || "").trim();
  if (!safeItemId) {
    throw new Error("Review Mode needs a captured image item.");
  }
  const url = chrome.runtime.getURL(`review.html?itemId=${encodeURIComponent(safeItemId)}`);
  await chrome.tabs.create({ url });
}

async function queueSidepanelLaunch(action) {
  const storage = chrome.storage?.session;
  if (!storage?.set || !action) return;
  await storage.set({
    olhoSidepanelLaunch: {
      action,
      ts: Date.now()
    }
  });
}

async function openReviewSidePanel(action = "") {
  if (!chrome.sidePanel?.open) return false;
  const tab = await resolveCaptureTab();
  if (!Number.isFinite(tab?.id)) {
    throw new Error("No active page is available for Review Panel.");
  }
  await queueSidepanelLaunch(action);
  if (chrome.sidePanel.setOptions) {
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: "sidepanel.html",
      enabled: true
    });
  }
  await chrome.sidePanel.open({ windowId: tab.windowId });
  return true;
}

function makeScreenCaptureTitle(sourceLabel) {
  const source = sanitizeTitleSegment(sourceLabel || "Screen");
  return `${source} Capture ${new Date().toLocaleString()}`;
}

function revokeScreenCapturePreviewUrl() {
  if (!screenCapturePreviewUrl) return;
  try {
    URL.revokeObjectURL(screenCapturePreviewUrl);
  } catch {
    // best effort
  }
  screenCapturePreviewUrl = "";
}

function clearScreenCapturePreview() {
  screenCapturePreviewState = null;
  revokeScreenCapturePreviewUrl();
  if (screenCapturePreviewImage) {
    screenCapturePreviewImage.removeAttribute("src");
    screenCapturePreviewImage.alt = "";
  }
  if (screenCapturePreviewPanel) {
    screenCapturePreviewPanel.hidden = true;
  }
  if (previewSourceLabel) previewSourceLabel.textContent = "Unknown source";
  if (previewDimensions) previewDimensions.textContent = "0 × 0";
  if (previewSizeEstimate) previewSizeEstimate.textContent = "0 B";
}

function hideScreenRegionCropPanel() {
  screenRegionCropState.active = false;
  screenRegionCropState.source = null;
  screenRegionCropState.image = null;
  screenRegionCropState.dragging = false;
  screenRegionCropState.selection = null;
  if (screenRegionCropPanel) {
    screenRegionCropPanel.hidden = true;
  }
}

function renderScreenCapturePreview(state) {
  if (!state || !(state.blob instanceof Blob)) {
    clearScreenCapturePreview();
    return;
  }

  revokeScreenCapturePreviewUrl();
  screenCapturePreviewUrl = URL.createObjectURL(state.blob);
  screenCapturePreviewState = state;

  if (screenCapturePreviewImage) {
    screenCapturePreviewImage.src = screenCapturePreviewUrl;
    screenCapturePreviewImage.alt = `${state.sourceLabel} preview`;
  }
  if (previewSourceLabel) previewSourceLabel.textContent = state.sourceLabel;
  if (previewDimensions) previewDimensions.textContent = `${state.width} × ${state.height}`;
  if (previewSizeEstimate) previewSizeEstimate.textContent = formatBytes(state.blob.size);
  if (screenCapturePreviewPanel) {
    screenCapturePreviewPanel.hidden = false;
  }
  hideScreenRegionCropPanel();
}

function normalizeRect(rect) {
  if (!rect) return null;
  const x = Math.min(rect.x, rect.x + rect.width);
  const y = Math.min(rect.y, rect.y + rect.height);
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);
  return { x, y, width, height };
}

function clampRectToCanvas(rect) {
  if (!(screenRegionCropCanvas instanceof HTMLCanvasElement)) return rect;
  const safe = normalizeRect(rect);
  if (!safe) return null;
  const x = Math.max(0, Math.min(screenRegionCropCanvas.width - 1, safe.x));
  const y = Math.max(0, Math.min(screenRegionCropCanvas.height - 1, safe.y));
  const width = Math.max(1, Math.min(screenRegionCropCanvas.width - x, safe.width));
  const height = Math.max(1, Math.min(screenRegionCropCanvas.height - y, safe.height));
  return { x, y, width, height };
}

function drawScreenRegionCropCanvas() {
  if (!(screenRegionCropCanvas instanceof HTMLCanvasElement)) return;
  const image = screenRegionCropState.image;
  const selection = screenRegionCropState.selection;
  if (!(image instanceof HTMLImageElement)) return;

  const ctx = screenRegionCropCanvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, screenRegionCropCanvas.width, screenRegionCropCanvas.height);
  ctx.drawImage(image, 0, 0, screenRegionCropCanvas.width, screenRegionCropCanvas.height);

  if (!selection) return;

  const rect = clampRectToCanvas(selection);
  if (!rect) return;

  ctx.fillStyle = "rgba(8, 8, 22, 0.45)";
  ctx.fillRect(0, 0, screenRegionCropCanvas.width, screenRegionCropCanvas.height);
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "rgba(168, 148, 255, 0.95)";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
}

function canvasPointFromEvent(event) {
  if (!(screenRegionCropCanvas instanceof HTMLCanvasElement)) {
    return { x: 0, y: 0 };
  }
  const rect = screenRegionCropCanvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? screenRegionCropCanvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? screenRegionCropCanvas.height / rect.height : 1;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function bindScreenRegionCropCanvas() {
  if (!(screenRegionCropCanvas instanceof HTMLCanvasElement)) return;

  screenRegionCropCanvas.addEventListener("pointerdown", (event) => {
    if (!screenRegionCropState.active) return;
    event.preventDefault();
    const point = canvasPointFromEvent(event);
    screenRegionCropState.dragging = true;
    screenRegionCropState.startX = point.x;
    screenRegionCropState.startY = point.y;
    screenRegionCropState.selection = { x: point.x, y: point.y, width: 0, height: 0 };
    drawScreenRegionCropCanvas();
  });

  screenRegionCropCanvas.addEventListener("pointermove", (event) => {
    if (!screenRegionCropState.active || !screenRegionCropState.dragging) return;
    event.preventDefault();
    const point = canvasPointFromEvent(event);
    screenRegionCropState.selection = {
      x: screenRegionCropState.startX,
      y: screenRegionCropState.startY,
      width: point.x - screenRegionCropState.startX,
      height: point.y - screenRegionCropState.startY
    };
    drawScreenRegionCropCanvas();
  });

  const stopDrag = () => {
    if (!screenRegionCropState.active) return;
    screenRegionCropState.dragging = false;
    if (screenRegionCropState.selection) {
      screenRegionCropState.selection = clampRectToCanvas(screenRegionCropState.selection);
    }
    drawScreenRegionCropCanvas();
  };

  screenRegionCropCanvas.addEventListener("pointerup", stopDrag);
  screenRegionCropCanvas.addEventListener("pointerleave", stopDrag);
}

function imageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Olho could not render the captured frame for cropping."));
    };
    image.src = url;
  });
}

async function showScreenRegionCropPanel(sourceState) {
  if (!(sourceState?.blob instanceof Blob)) {
    throw new Error("No captured frame is available for crop selection.");
  }
  if (!(screenRegionCropCanvas instanceof HTMLCanvasElement)) {
    throw new Error("Screen crop canvas is unavailable.");
  }

  const image = await imageFromBlob(sourceState.blob);
  const maxWidth = 520;
  const scale = image.width > maxWidth ? maxWidth / image.width : 1;
  const canvasWidth = Math.max(1, Math.round(image.width * scale));
  const canvasHeight = Math.max(1, Math.round(image.height * scale));

  screenRegionCropCanvas.width = canvasWidth;
  screenRegionCropCanvas.height = canvasHeight;

  screenRegionCropState.active = true;
  screenRegionCropState.source = sourceState;
  screenRegionCropState.image = image;
  screenRegionCropState.dragging = false;
  screenRegionCropState.selection = {
    x: Math.round(canvasWidth * 0.2),
    y: Math.round(canvasHeight * 0.2),
    width: Math.round(canvasWidth * 0.6),
    height: Math.round(canvasHeight * 0.6)
  };

  if (screenCapturePreviewPanel) {
    screenCapturePreviewPanel.hidden = true;
  }
  if (screenRegionCropPanel) {
    screenRegionCropPanel.hidden = false;
  }
  drawScreenRegionCropCanvas();
}

async function confirmScreenRegionCrop() {
  if (!screenRegionCropState.active || !(screenRegionCropState.source?.blob instanceof Blob)) {
    throw new Error("No active screen crop is available.");
  }
  const source = screenRegionCropState.source;
  const selection = clampRectToCanvas(screenRegionCropState.selection);
  if (!selection || selection.width < 4 || selection.height < 4) {
    throw new Error("Select a larger area before confirming crop.");
  }

  const scaleX = source.width / screenRegionCropCanvas.width;
  const scaleY = source.height / screenRegionCropCanvas.height;
  const sx = Math.max(0, Math.floor(selection.x * scaleX));
  const sy = Math.max(0, Math.floor(selection.y * scaleY));
  const sw = Math.max(1, Math.floor(selection.width * scaleX));
  const sh = Math.max(1, Math.floor(selection.height * scaleY));

  const sourceImage = await imageFromBlob(source.blob);
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) {
    throw new Error("Crop canvas is unavailable.");
  }

  cropCtx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);
  const croppedBlob = await new Promise((resolve, reject) => {
    cropCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Olho could not generate the cropped image."));
    }, "image/png");
  });

  hideScreenRegionCropPanel();
  renderScreenCapturePreview({
    ...source,
    blob: croppedBlob,
    width: sw,
    height: sh,
    selectAreaAfterCapture: false
  });
  showToast("Area selected. Review before saving.");
}

async function persistScreenCapturePreview() {
  if (!screenCapturePreviewState?.blob || !(screenCapturePreviewState.blob instanceof Blob)) {
    throw new Error("No screen capture preview is available.");
  }

  if (screenCapturePreviewState.savedItemId) {
    return screenCapturePreviewState.savedItemId;
  }

  const metadata = {
    title: makeScreenCaptureTitle(screenCapturePreviewState.sourceLabel),
    mimeType: "image/png",
    sizeBytes: screenCapturePreviewState.blob.size,
    width: screenCapturePreviewState.width,
    height: screenCapturePreviewState.height,
    sourceType: screenCapturePreviewState.sourceType,
    sourceLabel: screenCapturePreviewState.sourceLabel,
    displaySurface: screenCapturePreviewState.displaySurface,
    logicalSurface: screenCapturePreviewState.logicalSurface,
    capturedAt: screenCapturePreviewState.capturedAt
  };

  try {
    const saved = await saveMedia({
      kind: "screenshot",
      sourceType: screenCapturePreviewState.sourceType,
      blob: screenCapturePreviewState.blob,
      metadata
    });
    screenCapturePreviewState.savedItemId = saved.id;
    await refreshRecent();
    return saved.id;
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      const downloaded = await downloadPngFallback(screenCapturePreviewState.blob, screenCapturePreviewState.sourceType);
      if (downloaded) {
        throw new Error(
          "Local storage is full. Olho downloaded a PNG fallback so you can keep the capture."
        );
      }
      throw new Error("Local storage is full and PNG fallback download failed.");
    }
    throw error;
  }
}

function waitForVideoReady(video) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while loading selected screen/window frame."));
    }, 6000);

    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("error", onError);
    }

    async function onLoadedData() {
      cleanup();
      try {
        await video.play().catch(() => {});
        resolve();
      } catch (error) {
        reject(error);
      }
    }

    function onError() {
      cleanup();
      reject(new Error("Could not decode selected screen/window stream."));
    }

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("error", onError);
  });
}

async function captureScreenWindowStill({ selectAreaAfterCapture = false } = {}) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen/window capture is unavailable in this browser context.");
  }

  let stream;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    });

    const track = stream.getVideoTracks?.()[0];
    if (!track) {
      throw new Error("No video track was returned by the browser picker.");
    }

    let blob;
    let width = 1;
    let height = 1;

    if (window.__olhoTestScreenCaptureBlob instanceof Blob) {
      blob = window.__olhoTestScreenCaptureBlob;
      width = Math.max(1, Number(window.__olhoTestScreenCaptureWidth || 1280));
      height = Math.max(1, Number(window.__olhoTestScreenCaptureHeight || 720));
    } else {
      video.srcObject = stream;
      await waitForVideoReady(video);

      width = Math.max(1, video.videoWidth || 1);
      height = Math.max(1, video.videoHeight || 1);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas context unavailable for screen/window capture.");
      }

      ctx.drawImage(video, 0, 0, width, height);
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Failed to create image from selected screen/window frame."));
        }, "image/png");
      });
    }

    const trackSettings = track.getSettings?.() || {};
    const sourceMeta = derivePickerSourceType(trackSettings);
    return {
      sourceType: sourceMeta.sourceType,
      sourceLabel: sourceMeta.sourceLabel,
      displaySurface: sourceMeta.displaySurface,
      logicalSurface: trackSettings.logicalSurface ?? null,
      width,
      height,
      capturedAt: new Date().toISOString(),
      blob,
      selectAreaAfterCapture
    };
  } catch (error) {
    const msg = String(error?.message || error || "");
    const lowered = msg.toLowerCase();
    if (
      lowered.includes("notallowederror") ||
      lowered.includes("permission denied") ||
      lowered.includes("aborted") ||
      lowered.includes("cancel") ||
      lowered.includes("dismissed")
    ) {
      if (lowered.includes("permission denied") || lowered.includes("notallowederror")) {
        throw new Error("Olho needs screen capture permission for this action.");
      }
      throw new Error("Screen capture was cancelled.");
    }
    throw error;
  } finally {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.srcObject = null;
    } catch {}
    if (stream?.getTracks) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    }
  }
}

async function writeBlobToClipboard(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard API unavailable.");
  }
  const type = blob.type || "image/png";
  const normalizedBlob = blob.type ? blob : new Blob([await blob.arrayBuffer()], { type });
  await navigator.clipboard.write([new ClipboardItem({ [type]: normalizedBlob })]);
}

async function downloadPngFallback(blob, sourceType) {
  const filenameBase = sourceType ? `olho-${sourceType}` : "olho-capture";
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `Olho/${filenameBase}-${Date.now()}.png`,
      saveAs: true
    });
    return true;
  } catch (error) {
    console.error("PNG fallback download failed", error);
    return false;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 20_000);
  }
}

async function copyCapturedItemFromPopup(itemId, sourceType) {
  if (!itemId) {
    return {
      ok: false,
      downloaded: false,
      errorText: "Capture saved, but Olho could not locate the file for clipboard copy."
    };
  }

  let blob;
  try {
    blob = await getMediaBlob(itemId);
  } catch (error) {
    return {
      ok: false,
      downloaded: false,
      errorText: `Capture saved, but loading the local file failed: ${String(error?.message || error)}`
    };
  }

  if (!(blob instanceof Blob)) {
    return {
      ok: false,
      downloaded: false,
      errorText: "Capture saved, but the local file is unavailable for clipboard copy."
    };
  }

  try {
    await writeBlobToClipboard(blob);
    hideClipboardFallback();
    return {
      ok: true,
      downloaded: false,
      errorText: ""
    };
  } catch (error) {
    const classified = classifyClipboardError(error);
    const downloaded = await downloadPngFallback(blob, sourceType);
    return {
      ok: false,
      downloaded,
      errorText: classified.message
    };
  }
}

function openEditorAndCopy(itemId) {
  if (!itemId) return;
  const params = new URLSearchParams({
    itemId,
    copy: "1"
  });
  const url = chrome.runtime.getURL(`editor.html?${params.toString()}`);
  chrome.tabs.create({ url });
}

async function handleAction(action) {
  if (action === "open-review-panel") {
    try {
      const opened = await openReviewSidePanel("");
      if (!opened) {
        showToast("Review side panel is unavailable in this browser.", true);
        return;
      }
      window.close();
    } catch (error) {
      showToast(`Review panel failed: ${String(error?.message || error)}`, true);
    }
    return;
  }

  if (action === "review-imported-screenshot") {
    reviewImportInput?.click();
    return;
  }

  if (reviewActionMap[action]) {
    if (action === "review-current-screen" || action === "review-current-design") {
      try {
        const opened = await openReviewSidePanel(action);
        if (opened) {
          window.close();
          return;
        }
      } catch (error) {
        console.warn("Review side panel unavailable; falling back to screenshot Review Mode.", error);
      }
    }
    await handleReviewAction(action);
    return;
  }

  if (action === "annotate-local-image") {
    const url = chrome.runtime.getURL("editor.html?import=1");
    await chrome.tabs.create({ url });
    window.close();
    return;
  }

  if (action === "start-recording") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("record.html") });
    window.close();
    return;
  }

  if (
    action &&
    action.startsWith("capture-") &&
    action !== "capture-screen-window" &&
    action !== "capture-screen-region"
  ) {
    clearScreenCapturePreview();
  }

  if (action === "capture-screen-window") {
    hideCaptureBlockedFallback();
    try {
      await runCaptureDelayIfNeeded(action);
      const result = await captureScreenWindowStill({ selectAreaAfterCapture: false });
      renderScreenCapturePreview(result);
      showToast("Screen frame captured. Review before saving.");
    } catch (error) {
      const message = String(error?.message || error || "");
      if (/delayed capture cancelled/i.test(message)) {
        showToast("Capture countdown cancelled.");
      } else {
        showToast(`Capture failed: ${message}`, true);
      }
    }
    return;
  }

  if (action === "capture-screen-region") {
    hideCaptureBlockedFallback();
    try {
      await runCaptureDelayIfNeeded(action);
      const result = await captureScreenWindowStill({ selectAreaAfterCapture: true });
      await showScreenRegionCropPanel(result);
      showToast("Screen frame captured. Select area to continue.");
    } catch (error) {
      const message = String(error?.message || error || "");
      if (/delayed capture cancelled/i.test(message)) {
        showToast("Capture countdown cancelled.");
      } else {
        showToast(`Capture failed: ${message}`, true);
      }
    }
    return;
  }

  const type = actionMap[action];
  if (!type) return;

  try {
    await runCaptureDelayIfNeeded(action);
    const payload = { action, ...capturePayload(action) };
    if (["capture-visible", "capture-region", "capture-full", "capture-element"].includes(action)) {
      payload.tabId = await resolveCaptureTabId();
      if (!Number.isFinite(payload.tabId)) {
        throw new Error("No capturable browser tab is available.");
      }
    }
    const response = await sendBusMessage(type, payload);
    if (response?.ok === false) {
      const message = response.error || "Action failed.";
      showToast(message, true);
      if (
        action.startsWith("capture-") &&
        /cannot capture this protected browser page|cannot access this page as a tab/i.test(message)
      ) {
        showCaptureBlockedFallback(
          "Olho cannot access this page as a tab. Use Capture screen/window to capture what is visible."
        );
      }
      return;
    }

    const data = response?.data || {};
    if (action.startsWith("capture-")) {
      if (data.cancelled) {
        showToast("Capture cancelled.");
        return;
      }

      if (payload.destination === "clipboard") {
        const clipboardResult = await copyCapturedItemFromPopup(data.itemId, data.sourceType);
        if (clipboardResult.ok) {
          showToast("Capture copied to clipboard and saved to library.");
        } else {
          if (clipboardResult.downloaded) {
            showToast("Clipboard blocked. Download PNG fallback started.", true);
            showClipboardFallback(
              `${clipboardResult.errorText} Olho downloaded a PNG fallback. Use Open Editor and Copy.`,
              data.itemId
            );
          } else {
            showToast("Clipboard blocked and PNG download fallback failed.", true);
            showClipboardFallback(
              `${clipboardResult.errorText} PNG download fallback failed. Use Open Editor and Copy.`,
              data.itemId
            );
          }
        }
      } else {
        hideClipboardFallback();
        hideCaptureBlockedFallback();
        showToast(data.message || "Capture complete.");
      }

      await refreshRecent();
      return;
    }

    showToast(action === "start-recording" ? "Recording starting..." : `Done: ${labelFromAction(action)}`);
  } catch (error) {
    showToast(`Failed: ${labelFromAction(action)}`, true);
    console.error("Olho message error", error);
  }
}

async function handleReviewAction(action) {
  const reviewAction = reviewActionMap[action];
  if (!reviewAction) return;

  clearScreenCapturePreview();
  hideCaptureBlockedFallback();
  hideClipboardFallback();

  try {
    await runCaptureDelayIfNeeded(reviewAction.captureAction);
    const tab = await resolveCaptureTab();
    if (!Number.isFinite(tab?.id)) {
      throw new Error("No capturable browser tab is available.");
    }

    const payload = {
      action: reviewAction.captureAction,
      destination: "review",
      tabId: tab.id
    };
    const response = await sendBusMessage(reviewAction.type, payload);
    if (response?.ok === false) {
      const message = response.error || "Review capture failed.";
      showToast(message, true);
      if (/cannot capture this protected browser page|cannot access this page as a tab/i.test(message)) {
        showCaptureBlockedFallback(
          "Olho cannot access this page as a tab. Use Capture screen/window to capture what is visible."
        );
      }
      return;
    }

    const data = response?.data || {};
    if (data.cancelled) {
      showToast("Review capture cancelled.");
      return;
    }
    if (!data.itemId) {
      throw new Error("Review capture completed without a saved local image.");
    }

    const metadata = reviewMetadataForTab(tab, reviewAction);
    const reviewMetrics = await collectReviewMetricsForTab(tab.id).catch((error) => {
      console.warn("Review metadata collection failed", error);
      return null;
    });
    if (reviewMetrics?.elements?.length) {
      metadata.reviewMetrics = reviewMetrics;
      metadata.hasReviewMetrics = true;
    } else {
      metadata.reviewMetricsUnavailableReason = "Live DOM/style metrics were unavailable for this capture.";
    }

    await updateMediaMetadata(data.itemId, {
      metadata
    }).catch((error) => {
      console.warn("Review metadata update failed", error);
    });
    await refreshRecent();
    await openReviewItem(data.itemId);
    showToast("Opening Review Mode.");
    window.close();
  } catch (error) {
    const message = String(error?.message || error || "");
    if (/delayed capture cancelled/i.test(message)) {
      showToast("Review capture countdown cancelled.");
      return;
    }
    showToast(`Review failed: ${message}`, true);
    console.error("Olho review action failed", error);
  }
}

function labelFromAction(action) {
  const labels = {
    "capture-visible": "Capture Tab",
    "capture-region": "Select Area",
    "capture-full": "Full Page",
    "capture-screen-window": "Capture Screen/Window",
    "capture-screen-region": "Select Area (Screen/Window)",
    "capture-element": "Focus Element",
    "review-current-screen": "Review Current Screen",
    "review-full-page": "Review Full Page",
    "review-current-design": "Review Current Design",
    "open-review-panel": "Open Review Panel",
    "review-imported-screenshot": "Review Imported Screenshot",
    "start-recording": "Record Screen",
    "annotate-local-image": "Annotate Local Image",
    "open-library": "Open Memory",
    "open-options": "Open Settings"
  };
  if (labels[action]) {
    return labels[action];
  }
  return action
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function updateScreenWindowAvailability() {
  const supported = Boolean(navigator.mediaDevices?.getDisplayMedia);
  const actions = ["capture-screen-window", "capture-screen-region"];
  actions.forEach((action) => {
    const button = document.querySelector(`button[data-action="${action}"]`);
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = !supported;
    if (!supported) {
      button.title = "Screen/window picker is unavailable in this browser context.";
    } else {
      button.removeAttribute("title");
    }
  });
}

function normalizeAfterCaptureAction(value) {
  const next = String(value || "").trim();
  if (["editor", "library", "clipboard", "download"].includes(next)) {
    return next;
  }
  return "editor";
}

function normalizeSkipEditorMode(value) {
  const next = String(value || "").trim();
  if (["never", "always", "fullPageOnly"].includes(next)) {
    return next;
  }
  return "never";
}

async function loadPopupSettings() {
  try {
    const settings = await getAppSettings();
    appSettings = {
      defaultAfterCaptureAction: normalizeAfterCaptureAction(settings.defaultAfterCaptureAction),
      skipEditorMode: normalizeSkipEditorMode(settings.skipEditorMode),
      captureDelaySeconds: Math.max(0, Number(settings.captureDelaySeconds || 0)),
      autoDownload: Boolean(settings.autoDownload)
    };
  } catch (error) {
    console.warn("Popup settings load failed", error);
    appSettings = {
      defaultAfterCaptureAction: "editor",
      skipEditorMode: "never",
      captureDelaySeconds: 0,
      autoDownload: false
    };
  }

}

async function updateReviewDesignAvailability() {
  if (!(reviewCurrentDesignBtn instanceof HTMLButtonElement)) return;
  try {
    const tab = await resolveCaptureTab();
    const source = reviewSourceFromTab(tab);
    const available = source.sourceType === "figma-capture" || source.sourceType === "zeplin-capture";
    reviewCurrentDesignBtn.hidden = !available;
    reviewCurrentDesignBtn.disabled = !available;
    if (available) {
      const label = source.platform === "zeplin" ? "Review Current Zeplin Design" : "Review Current Figma Design";
      reviewCurrentDesignBtn.querySelector(".btn-label").textContent = label;
      reviewCurrentDesignBtn.removeAttribute("title");
    } else {
      reviewCurrentDesignBtn.setAttribute("title", "Open a Figma or Zeplin browser tab to review the current design.");
    }
  } catch {
    reviewCurrentDesignBtn.hidden = true;
    reviewCurrentDesignBtn.disabled = true;
  }
}

function renderRecent(items) {
  if (!recentList) return;
  recentList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "recent-empty";
    empty.textContent = "Nothing captured yet.";
    recentList.append(empty);
    return;
  }

  items.slice(0, 4).forEach((item) => {
    const row = document.createElement("li");
    row.className = "recent-item";

    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.metadata?.title || "Untitled";
    const meta = document.createElement("span");
    meta.textContent = new Date(item.createdAt).toLocaleTimeString();
    text.append(title, meta);

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "secondary";
    openBtn.textContent = "Open";
    openBtn.setAttribute("aria-label", `Open ${title.textContent}`);
    openBtn.addEventListener("click", () => {
      const url = item.type === "image"
        ? chrome.runtime.getURL(`editor.html?itemId=${item.id}`)
        : chrome.runtime.getURL("gallery.html");
      chrome.tabs.create({ url });
      window.close();
    });

    row.append(text, openBtn);
    recentList.append(row);
  });
}

async function refreshRecent() {
  try {
    const items = await listRecent(8);
    renderRecent(items);
  } catch (error) {
    console.error("Popup recent load failed", error);
    renderRecent([]);
  }
}

document.querySelectorAll("button[data-action]").forEach((button) => {
  button.addEventListener("click", () => handleAction(button.dataset.action));
});

updateScreenWindowAvailability();

openEditorCopyBtn?.addEventListener("click", () => {
  if (!pendingClipboardItemId) {
    showToast("No captured item available for editor copy.", true);
    return;
  }
  openEditorAndCopy(pendingClipboardItemId);
  window.close();
});

blockedScreenCaptureBtn?.addEventListener("click", () => {
  handleAction("capture-screen-window");
});

blockedRetryBtn?.addEventListener("click", () => {
  hideCaptureBlockedFallback();
  showToast("Switch to another tab and try Capture Tab again.");
});

blockedDismissBtn?.addEventListener("click", () => {
  hideCaptureBlockedFallback();
});

previewSaveMemoryBtn?.addEventListener("click", async () => {
  try {
    await persistScreenCapturePreview();
    showToast("Saved to Memory.");
  } catch (error) {
    showToast(String(error?.message || error), true);
  }
});

previewOpenEditorBtn?.addEventListener("click", async () => {
  try {
    const itemId = await persistScreenCapturePreview();
    const params = new URLSearchParams({ itemId });
    if (screenCapturePreviewState?.selectAreaAfterCapture) {
      params.set("hint", "crop");
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?${params.toString()}`) });
    showToast("Saved and opened in editor.");
  } catch (error) {
    showToast(String(error?.message || error), true);
  }
});

previewDownloadBtn?.addEventListener("click", async () => {
  try {
    if (!screenCapturePreviewState?.blob) {
      showToast("No preview image available for download.", true);
      return;
    }
    const downloaded = await downloadPngFallback(
      screenCapturePreviewState.blob,
      screenCapturePreviewState.sourceType
    );
    if (downloaded) {
      showToast("PNG download started.");
    } else {
      showToast("PNG download failed.", true);
    }
  } catch (error) {
    showToast(String(error?.message || error), true);
  }
});

previewCopyBtn?.addEventListener("click", async () => {
  try {
    if (!screenCapturePreviewState?.blob || !(screenCapturePreviewState.blob instanceof Blob)) {
      showToast("No preview image available for copy.", true);
      return;
    }

    try {
      await writeBlobToClipboard(screenCapturePreviewState.blob);
      hideClipboardFallback();
      showToast("Preview image copied.");
      return;
    } catch (error) {
      const classified = classifyClipboardError(error);
      const downloaded = await downloadPngFallback(
        screenCapturePreviewState.blob,
        screenCapturePreviewState.sourceType
      );

      if (downloaded) {
        showToast("Clipboard blocked. Download PNG fallback started.", true);
        showClipboardFallback(
          `${classified.message} Olho downloaded a PNG fallback. Use Open Editor and Copy.`,
          screenCapturePreviewState.savedItemId || null
        );
      } else {
        showToast("Clipboard blocked and PNG download fallback failed.", true);
        showClipboardFallback(
          `${classified.message} PNG download fallback failed. Use Open Editor and Copy.`,
          screenCapturePreviewState.savedItemId || null
        );
      }
    }
  } catch (error) {
    showToast(String(error?.message || error), true);
  }
});

previewRetakeBtn?.addEventListener("click", () => {
  const mode = screenCapturePreviewState?.selectAreaAfterCapture ? "capture-screen-region" : "capture-screen-window";
  clearScreenCapturePreview();
  handleAction(mode);
});

screenRegionCropConfirmBtn?.addEventListener("click", async () => {
  try {
    await confirmScreenRegionCrop();
  } catch (error) {
    showToast(String(error?.message || error), true);
  }
});

screenRegionCropRetakeBtn?.addEventListener("click", () => {
  hideScreenRegionCropPanel();
  handleAction("capture-screen-region");
});

screenRegionCropCancelBtn?.addEventListener("click", () => {
  hideScreenRegionCropPanel();
  showToast("Screen area selection cancelled.");
});

previewDiscardBtn?.addEventListener("click", async () => {
  try {
    if (screenCapturePreviewState?.savedItemId) {
      await moveToTrash(screenCapturePreviewState.savedItemId);
      await refreshRecent();
    }
    clearScreenCapturePreview();
    showToast("Preview discarded.");
  } catch (error) {
    showToast(`Could not discard preview: ${String(error?.message || error)}`, true);
  }
});

reviewImportInput?.addEventListener("change", async () => {
  const file = reviewImportInput.files?.[0] || null;
  if (!file) return;
  try {
    const item = await importDesignScreenshotForReview({
      file,
      createItem,
      openReview: openReviewItem
    });
    await refreshRecent();
    showToast(`Opening Review Mode for ${item?.metadata?.title || "imported screenshot"}.`);
    window.close();
  } catch (error) {
    console.error("Review screenshot import failed", error);
    showToast(String(error?.message || error || "Review import failed."), true);
  } finally {
    reviewImportInput.value = "";
  }
});

window.addEventListener("beforeunload", () => {
  revokeScreenCapturePreviewUrl();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (screenRegionCropState.active) {
    hideScreenRegionCropPanel();
    showToast("Screen area selection cancelled.");
    return;
  }
  if (activeDelayToken > 0) {
    cancelActiveDelay = true;
  }
});

hideClipboardFallback();
hideCaptureBlockedFallback();
hideScreenRegionCropPanel();
bindScreenRegionCropCanvas();

function enforcePopupWidthForActionPanel() {
  if (!chrome?.tabs?.getCurrent) {
    return;
  }
  chrome.tabs.getCurrent((tab) => {
    // When popup.html is opened as a full browser tab during debugging/tests,
    // do not force narrow popup dimensions.
    if (tab?.id) {
      return;
    }
    if (document.documentElement) {
      document.documentElement.style.minWidth = "420px";
      document.documentElement.style.width = "420px";
      document.documentElement.style.maxWidth = "420px";
    }
    if (document.body) {
      document.body.style.minWidth = "420px";
      document.body.style.width = "420px";
      document.body.style.maxWidth = "420px";
    }
  });
}

enforcePopupWidthForActionPanel();
Promise.all([loadPopupSettings(), refreshRecent()]).catch((error) => {
  console.error("Popup initialization failed", error);
});
updateReviewDesignAvailability().catch((error) => {
  console.warn("Review design availability check failed", error);
});
