import { listFolders, listItems, deleteItem, renameItem, moveItem } from "./src/storage/storage.js";

const folderFilter = document.getElementById("folderFilter");
const galleryGrid = document.getElementById("galleryGrid");
const itemCount = document.getElementById("itemCount");
const emptyState = document.getElementById("emptyState");
const refreshBtn = document.getElementById("refreshBtn");
const toast = document.getElementById("toast");
let toastTimer = null;

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.add("show");
  toast.style.borderColor = isError ? "rgba(248, 113, 113, 0.6)" : "rgba(148, 163, 184, 0.2)";
  toast.style.color = isError ? "#fecaca" : "#f9fafb";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

async function loadFolders() {
  const folders = await listFolders();
  folderFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All folders";
  folderFilter.append(allOption);

  folders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    folderFilter.append(option);
  });
}

async function loadItems() {
  const folderId = folderFilter.value || null;
  const items = await listItems();
  const filtered = folderId ? items.filter((item) => item.folderId === folderId) : items;

  galleryGrid.innerHTML = "";
  itemCount.textContent = String(filtered.length);
  emptyState.hidden = filtered.length > 0;

  filtered.forEach((item) => {
    galleryGrid.append(createCard(item));
  });
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "gallery-card";
  card.setAttribute("role", "listitem");

  const preview = document.createElement(item.type === "video" ? "video" : "img");
  preview.className = "gallery-thumb";
  preview.src = item.blobUrl;
  preview.alt = item.metadata?.title || `${item.type} capture`;
  if (item.type === "video") {
    preview.controls = true;
  }

  const info = document.createElement("div");
  info.className = "gallery-info";

  const title = document.createElement("strong");
  title.textContent = item.metadata?.title || "Untitled";

  const meta = document.createElement("span");
  meta.textContent = new Date(item.createdAt).toLocaleString();

  info.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "actions";

  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "action-btn secondary";
  renameBtn.textContent = "Rename";
  renameBtn.addEventListener("click", async () => {
    const name = prompt("Rename item", title.textContent);
    if (!name) return;
    try {
      await renameItem(item.id, name);
      showToast("Item renamed.");
      refresh();
    } catch (error) {
      console.error(error);
      showToast("Rename failed.", true);
    }
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "action-btn secondary";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Delete this item?")) return;
    try {
      await deleteItem(item.id);
      showToast("Item deleted.");
      refresh();
    } catch (error) {
      console.error(error);
      showToast("Delete failed.", true);
    }
  });

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "action-btn";
  downloadBtn.textContent = "Download";
  downloadBtn.addEventListener("click", async () => {
    try {
      await chrome.downloads.download({
        url: item.blobUrl,
        filename: `${item.metadata?.title || item.id}.${item.type === "video" ? "webm" : "png"}`,
        saveAs: true
      });
      showToast("Download started.");
    } catch (error) {
      console.error(error);
      showToast("Download failed.", true);
    }
  });

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "action-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", async () => {
    try {
      const response = await fetch(item.blobUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast("Copied to clipboard.");
    } catch (error) {
      console.error(error);
      showToast("Copy failed.", true);
    }
  });

  actions.append(renameBtn, downloadBtn, copyBtn, deleteBtn);
  card.append(preview, info, actions);
  return card;
}

async function refresh() {
  await loadFolders();
  await loadItems();
}

folderFilter.addEventListener("change", loadItems);
refreshBtn.addEventListener("click", refresh);

refresh();
