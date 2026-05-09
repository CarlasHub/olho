import { MESSAGE_TYPES, createMessage } from "../../../extension/models.js";
import { LIVE_REVIEW_MESSAGES, liveReviewMessage } from "../session/live-review-messages.js";

const OVERLAY_SCRIPT_FILES = [
  "src/review/overlay/overlay-marker-layer.js",
  "src/review/overlay/overlay-target-highlighter.js",
  "src/review/overlay/overlay-message-router.js",
  "src/review/overlay/live-overlay-content.js"
];

export async function getActiveReviewTab() {
  function isCapturable(url) {
    const value = String(url || "").toLowerCase();
    const extensionRoot = chrome.runtime.getURL("").toLowerCase();
    return Boolean(
      value &&
        !value.startsWith(extensionRoot) &&
        !value.startsWith("chrome://") &&
        !value.startsWith("chrome-search://") &&
        !value.startsWith("edge://") &&
        !value.startsWith("about:") &&
        !value.startsWith("devtools://") &&
        !value.includes("chromewebstore.google.com")
    );
  }

  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id && isCapturable(active.url || active.pendingUrl)) {
    return active;
  }
  const tabs = await chrome.tabs.query({});
  const fallback = tabs
    .filter((tab) => tab?.id && isCapturable(tab.url || tab.pendingUrl))
    .sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
  if (!fallback?.id) {
    throw new Error("Open the page or design you want to review, then try again.");
  }
  return fallback;
}

export async function injectLiveOverlay(tabId) {
  if (!Number.isFinite(tabId)) throw new Error("No active tab is available for live overlay.");
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["src/review/overlay/overlay-styles.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: OVERLAY_SCRIPT_FILES
  });
  return true;
}

export function sendOverlayMessage(tabId, type, payload = {}) {
  return chrome.tabs.sendMessage(tabId, liveReviewMessage(type, payload));
}

export async function clearLiveOverlay(tabId) {
  if (!Number.isFinite(tabId)) return;
  await sendOverlayMessage(tabId, LIVE_REVIEW_MESSAGES.CLEAR_MARKERS).catch(() => null);
  await sendOverlayMessage(tabId, LIVE_REVIEW_MESSAGES.CLEAR_HIGHLIGHT).catch(() => null);
}

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

export async function openFallbackReviewTab(tab, captureType = MESSAGE_TYPES.CAPTURE_VISIBLE, options = {}) {
  const response = await sendBusMessage(captureType, {
    destination: "review",
    tabId: tab?.id
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Screenshot fallback capture failed.");
  }
  const itemId = response?.data?.itemId;
  if (!itemId) {
    throw new Error("Screenshot fallback did not return a saved local item.");
  }
  if (typeof options.beforeOpen === "function") {
    await options.beforeOpen(itemId, response);
  }
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`review.html?itemId=${encodeURIComponent(itemId)}`)
  });
  return { itemId, response };
}
