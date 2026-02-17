import { createResponse, isMessage, MESSAGE_TYPES } from "./extension/models.js";
import { captureVisibleArea, captureFullPage, captureRegion } from "./src/background/capture.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Olho service worker installed");
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }
  return tab;
}

async function storeLastCapture(payload) {
  if (!chrome.storage?.session) {
    await chrome.storage.local.set({ lastCapture: payload });
    return;
  }
  await chrome.storage.session.set({ lastCapture: payload });
}

async function openEditorTab() {
  const url = chrome.runtime.getURL("editor.html");
  await chrome.tabs.create({ url });
}

async function openRecordTab({ mode = "tab", mic = false, systemAudio = true } = {}) {
  const params = new URLSearchParams({
    mode,
    mic: mic ? "1" : "0",
    system: systemAudio ? "1" : "0"
  });
  const url = chrome.runtime.getURL(`record.html?${params.toString()}`);
  await chrome.tabs.create({ url });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isMessage(message)) {
    return;
  }

  console.log("Olho message received", {
    message,
    sender: sender?.id || "popup"
  });

  const handle = async () => {
    switch (message.type) {
      case MESSAGE_TYPES.CAPTURE_VISIBLE: {
        const tab = await getActiveTab();
        const payload = await captureVisibleArea(tab.id);
        await storeLastCapture(payload);
        await openEditorTab();
        return createResponse(message, payload);
      }
      case MESSAGE_TYPES.CAPTURE_FULL_PAGE: {
        const tab = await getActiveTab();
        const payload = await captureFullPage(tab.id);
        await storeLastCapture(payload);
        await openEditorTab();
        return createResponse(message, payload);
      }
      case MESSAGE_TYPES.CAPTURE_REGION: {
        const tab = await getActiveTab();
        const payload = await captureRegion(tab.id);
        if (payload?.cancelled) {
          return createResponse(message, { cancelled: true });
        }
        await storeLastCapture(payload);
        await openEditorTab();
        return createResponse(message, payload);
      }
      case MESSAGE_TYPES.START_RECORDING:
      case "record_start": {
        const payload = message.payload || {};
        await openRecordTab({
          mode: payload.mode === "screen" ? "screen" : "tab",
          mic: Boolean(payload.mic),
          systemAudio: payload.systemAudio !== false
        });
        return createResponse(message, { started: true });
      }
      case "record_stop": {
        await chrome.runtime.sendMessage({ type: "record_stop" });
        return createResponse(message, { stopped: true });
      }
      default:
        return createResponse(message, { receivedAt: new Date().toISOString() });
    }
  };

  handle()
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.error("Olho handler error", error);
      sendResponse(createResponse(message, null, String(error?.message || error)));
    });

  return true;
});
