import { listFolders, listItems } from "../storage/storage.js";

const toast = document.getElementById("toast");
const folderList = document.getElementById("folderList");
const folderCount = document.getElementById("folderCount");
const recentList = document.getElementById("recentList");
const itemCount = document.getElementById("itemCount");

const actionMap = {
  "capture-visible": "capture_visible",
  "capture-region": "capture_region",
  "capture-full": "capture_full",
  "record-start": "record_start",
  "record-stop": "record_stop"
};

let toastTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function sendMessage(type) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type }, (response) => resolve(response));
  });
}

async function handleAction(action) {
  const type = actionMap[action];
  if (!type) return;
  await sendMessage(type);
  showToast(`Queued: ${labelFromAction(action)}`);
}

function labelFromAction(action) {
  return action
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function renderFolders(folders) {
  folderList.innerHTML = "";
  folderCount.textContent = String(folders.length);

  if (!folders.length) {
    const empty = document.createElement("li");
    empty.className = "list-item";
    empty.textContent = "No folders yet";
    folderList.append(empty);
    return;
  }

  folders.slice(0, 4).forEach((folder) => {
    const item = document.createElement("li");
    item.className = "list-item";
    item.innerHTML = `<strong>${folder.name}</strong><span>${new Date(folder.createdAt).toLocaleDateString()}</span>`;
    folderList.append(item);
  });
}

function renderItems(items) {
  recentList.innerHTML = "";
  itemCount.textContent = String(items.length);

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "list-item";
    empty.textContent = "No items captured";
    recentList.append(empty);
    return;
  }

  items.slice(0, 3).forEach((entry) => {
    const item = document.createElement("li");
    item.className = "list-item";
    const title = entry.metadata?.title || `${entry.type} capture`;
    item.innerHTML = `<strong>${title}</strong><span>${new Date(entry.createdAt).toLocaleTimeString()}</span>`;
    recentList.append(item);
  });
}

async function refresh() {
  try {
    const [folders, items] = await Promise.all([listFolders(), listItems()]);
    renderFolders(folders);
    renderItems(items);
  } catch (error) {
    console.error("Popup load error", error);
  }
}

document.querySelectorAll("button[data-action]").forEach((button) => {
  button.addEventListener("click", () => handleAction(button.dataset.action));
});

refresh();
