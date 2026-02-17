import {
  listFolders,
  listItems,
  createFolder,
  renameFolder,
  deleteFolder,
  deleteItem,
  renameItem,
  moveItem
} from "./src/storage/storage.js";

const folderFilter = document.getElementById("folderFilter");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const galleryGrid = document.getElementById("galleryGrid");
const itemCount = document.getElementById("itemCount");
const emptyState = document.getElementById("emptyState");
const refreshBtn = document.getElementById("refreshBtn");
const folderList = document.getElementById("folderList");
const newFolderName = document.getElementById("newFolderName");
const createFolderBtn = document.getElementById("createFolderBtn");
const openCaptureBtn = document.getElementById("openCaptureBtn");
const openOptionsBtn = document.getElementById("openOptionsBtn");
const closeBtn = document.getElementById("closeBtn");
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

function renderFolderFilter(folders) {
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

function renderFolderList(folders, items) {
  folderList.innerHTML = "";

  const counts = new Map();
  items.forEach((item) => {
    counts.set(item.folderId, (counts.get(item.folderId) || 0) + 1);
  });

  folders.forEach((folder) => {
    const row = document.createElement("div");
    row.className = "folder-row";

    const meta = document.createElement("div");
    meta.className = "folder-meta";
    const name = document.createElement("strong");
    name.textContent = folder.name;
    const count = document.createElement("span");
    count.textContent = `${counts.get(folder.id) || 0} item(s)`;
    meta.append(name, count);

    const actions = document.createElement("div");
    actions.className = "folder-actions";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "action-btn secondary";
    renameBtn.textContent = "Rename";
    renameBtn.disabled = Boolean(folder.isDefault);
    renameBtn.addEventListener("click", async () => {
      const next = prompt("Rename folder", folder.name);
      if (!next) return;
      try {
        await renameFolder(folder.id, next);
        showToast("Folder renamed.");
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
    deleteBtn.disabled = Boolean(folder.isDefault);
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Delete folder "${folder.name}"? Items will move to Unsorted.`)) return;
      try {
        await deleteFolder(folder.id);
        showToast("Folder deleted.");
        refresh();
      } catch (error) {
        console.error(error);
        showToast("Delete failed.", true);
      }
    });

    actions.append(renameBtn, deleteBtn);
    row.append(meta, actions);
    folderList.append(row);
  });
}

function createCard(item, folders) {
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

  const moveSelect = document.createElement("select");
  moveSelect.className = "action-select";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Move to…";
  moveSelect.append(defaultOption);

  folders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    if (folder.id === item.folderId) {
      option.selected = true;
    }
    moveSelect.append(option);
  });

  moveSelect.addEventListener("change", async (event) => {
    const next = event.target.value;
    if (!next || next === item.folderId) return;
    try {
      await moveItem(item.id, next);
      showToast("Item moved.");
      refresh();
    } catch (error) {
      console.error(error);
      showToast("Move failed.", true);
    }
  });

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

  if (item.type === "image") {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "action-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      const url = chrome.runtime.getURL(`editor.html?itemId=${item.id}`);
      chrome.tabs.create({ url });
    });
    actions.append(editBtn);
  }

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

  actions.append(moveSelect, renameBtn, downloadBtn, copyBtn, deleteBtn);
  card.append(preview, info, actions);
  return card;
}

function renderItems(items, folders) {
  const folderId = folderFilter.value || null;
  let filtered = folderId ? items.filter((item) => item.folderId === folderId) : items;
  const query = searchInput?.value?.trim().toLowerCase();
  if (query) {
    filtered = filtered.filter((item) =>
      (item.metadata?.title || "Untitled").toLowerCase().includes(query)
    );
  }

  const sortMode = sortSelect?.value || "newest";
  filtered = [...filtered].sort((a, b) => {
    if (sortMode === "oldest") {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    if (sortMode === "title") {
      return (a.metadata?.title || "").localeCompare(b.metadata?.title || "");
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  galleryGrid.innerHTML = "";
  itemCount.textContent = String(filtered.length);
  emptyState.hidden = filtered.length > 0;

  filtered.forEach((item) => {
    galleryGrid.append(createCard(item, folders));
  });
}

async function refresh() {
  const selectedFolder = folderFilter.value;
  const [items, folders] = await Promise.all([listItems(), listFolders()]);
  renderFolderFilter(folders);
  if (selectedFolder) {
    folderFilter.value = selectedFolder;
  }
  renderFolderList(folders, items);
  renderItems(items, folders);
}

folderFilter.addEventListener("change", refresh);
searchInput?.addEventListener("input", refresh);
sortSelect?.addEventListener("change", refresh);
refreshBtn.addEventListener("click", refresh);
createFolderBtn?.addEventListener("click", async () => {
  if (!newFolderName?.value) return;
  try {
    await createFolder(newFolderName.value);
    newFolderName.value = "";
    showToast("Folder created.");
    refresh();
  } catch (error) {
    console.error(error);
    showToast("Create failed.", true);
  }
});

openCaptureBtn?.addEventListener("click", () => {
  const url = chrome.runtime.getURL("popup.html");
  chrome.tabs.create({ url });
});

openOptionsBtn?.addEventListener("click", () => chrome.runtime.openOptionsPage());

closeBtn?.addEventListener("click", () => window.close());

refresh();
