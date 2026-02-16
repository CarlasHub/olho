import { createResponse, isMessage } from "./extension/models.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Olho service worker installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isMessage(message)) {
    return;
  }

  console.log("Olho message received", {
    message,
    sender: sender?.id || "popup"
  });

  sendResponse(createResponse(message, { receivedAt: new Date().toISOString() }));
});
