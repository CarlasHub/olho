import { MESSAGE_TYPES, createMessage } from "./extension/models.js";

const toast = document.getElementById("toast");
let toastTimer = null;
const recordMode = document.getElementById("recordMode");
const recordMic = document.getElementById("recordMic");
const recordSystem = document.getElementById("recordSystem");

const actionMap = {
  "capture-visible": MESSAGE_TYPES.CAPTURE_VISIBLE,
  "capture-region": MESSAGE_TYPES.CAPTURE_REGION,
  "capture-full": MESSAGE_TYPES.CAPTURE_FULL_PAGE,
  "start-recording": MESSAGE_TYPES.START_RECORDING,
  "open-library": MESSAGE_TYPES.OPEN_LIBRARY,
  "open-options": MESSAGE_TYPES.OPEN_OPTIONS
};

function showToast(message, isError = false) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  toast.style.borderColor = isError ? "rgba(248, 113, 113, 0.6)" : "rgba(148, 163, 184, 0.2)";
  toast.style.color = isError ? "#fecaca" : "#f9fafb";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
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

async function handleAction(action) {
  const type = actionMap[action];
  if (!type) return;

  try {
    const payload = { action };
    if (action === "start-recording") {
      payload.mode = recordMode?.value || "tab";
      payload.mic = Boolean(recordMic?.checked);
      payload.systemAudio = recordSystem?.checked !== false;
    }
    await sendBusMessage(type, payload);
    showToast(action === "start-recording" ? "Recording starting…" : `Queued: ${labelFromAction(action)}`);
  } catch (error) {
    showToast(`Failed: ${labelFromAction(action)}`, true);
    console.error("Olho message error", error);
  }

  if (action === "open-library") {
    const url = chrome.runtime.getURL("gallery.html");
    chrome.tabs.create({ url });
  }

  if (action === "open-options") {
    chrome.runtime.openOptionsPage();
  }
}

function labelFromAction(action) {
  return action
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

document.querySelectorAll("button[data-action]").forEach((button) => {
  button.addEventListener("click", () => handleAction(button.dataset.action));
});
