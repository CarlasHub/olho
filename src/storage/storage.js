const STORAGE_KEY = "snaplib_storage";

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(value, label) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

async function loadState() {
  const { [STORAGE_KEY]: data } = await chrome.storage.local.get({
    [STORAGE_KEY]: { folders: [], items: [] }
  });
  return {
    folders: Array.isArray(data.folders) ? [...data.folders] : [],
    items: Array.isArray(data.items) ? [...data.items] : []
  };
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function createFolder(name) {
  const folderName = normalizeName(name, "Folder name");
  const state = await loadState();
  const folder = {
    id: crypto.randomUUID(),
    name: folderName,
    createdAt: nowIso()
  };

  state.folders.push(folder);
  await saveState(state);
  return folder;
}

export async function renameFolder(id, name) {
  const folderName = normalizeName(name, "Folder name");
  const state = await loadState();
  const folder = state.folders.find((entry) => entry.id === id);
  if (!folder) {
    throw new Error("Folder not found.");
  }

  folder.name = folderName;
  await saveState(state);
  return folder;
}

export async function deleteFolder(id) {
  const state = await loadState();
  state.folders = state.folders.filter((entry) => entry.id !== id);
  state.items = state.items.map((item) =>
    item.folderId === id ? { ...item, folderId: null } : item
  );
  await saveState(state);
}

export async function createItem({ folderId = null, type, blobUrl, metadata = {} } = {}) {
  if (!type || !["image", "video"].includes(type)) {
    throw new Error("Item type must be 'image' or 'video'.");
  }
  if (!blobUrl) {
    throw new Error("blobUrl is required.");
  }

  const state = await loadState();
  const item = {
    id: crypto.randomUUID(),
    folderId,
    type,
    blobUrl,
    createdAt: nowIso(),
    metadata: { ...metadata }
  };

  state.items.push(item);
  await saveState(state);
  return item;
}

export async function moveItem(id, folderId) {
  const state = await loadState();
  const item = state.items.find((entry) => entry.id === id);
  if (!item) {
    throw new Error("Item not found.");
  }

  item.folderId = folderId;
  await saveState(state);
  return item;
}

export async function deleteItem(id) {
  const state = await loadState();
  state.items = state.items.filter((entry) => entry.id !== id);
  await saveState(state);
}

export async function renameItem(id, name) {
  const itemName = normalizeName(name, "Item name");
  const state = await loadState();
  const item = state.items.find((entry) => entry.id === id);
  if (!item) {
    throw new Error("Item not found.");
  }

  item.metadata = {
    ...item.metadata,
    title: itemName
  };
  await saveState(state);
  return item;
}

export async function listFolders() {
  const state = await loadState();
  return state.folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listItems() {
  const state = await loadState();
  return state.items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
