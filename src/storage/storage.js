const STORAGE_KEY = "snaplib_storage";
const DEFAULT_FOLDER_NAME = "Unsorted";

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

function ensureDefaultFolder(state) {
  let changed = false;
  let defaultFolder =
    state.folders.find((folder) => folder.isDefault) ||
    state.folders.find((folder) => folder.name === DEFAULT_FOLDER_NAME);

  if (!defaultFolder) {
    defaultFolder = {
      id: crypto.randomUUID(),
      name: DEFAULT_FOLDER_NAME,
      createdAt: nowIso(),
      isDefault: true
    };
    state.folders.push(defaultFolder);
    changed = true;
  } else if (!defaultFolder.isDefault) {
    defaultFolder.isDefault = true;
    changed = true;
  }

  state.items = state.items.map((item) => {
    if (!item.folderId) {
      changed = true;
      return { ...item, folderId: defaultFolder.id };
    }
    return item;
  });

  return { state, changed, defaultFolderId: defaultFolder.id };
}

async function loadState() {
  const { [STORAGE_KEY]: data } = await chrome.storage.local.get({
    [STORAGE_KEY]: { folders: [], items: [] }
  });
  const state = {
    folders: Array.isArray(data.folders) ? [...data.folders] : [],
    items: Array.isArray(data.items) ? [...data.items] : []
  };
  const result = ensureDefaultFolder(state);
  if (result.changed) {
    await saveState(result.state);
  }
  return result.state;
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
    createdAt: nowIso(),
    isDefault: false
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
  if (folder.isDefault) {
    throw new Error("Default folder cannot be renamed.");
  }

  folder.name = folderName;
  await saveState(state);
  return folder;
}

export async function deleteFolder(id) {
  const state = await loadState();
  const folder = state.folders.find((entry) => entry.id === id);
  if (!folder) {
    throw new Error("Folder not found.");
  }
  if (folder.isDefault) {
    throw new Error("Default folder cannot be deleted.");
  }
  const defaultFolder = state.folders.find((entry) => entry.isDefault);
  state.folders = state.folders.filter((entry) => entry.id !== id);
  state.items = state.items.map((item) =>
    item.folderId === id ? { ...item, folderId: defaultFolder?.id || null } : item
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
  const defaultFolderId = state.folders.find((entry) => entry.isDefault)?.id || null;
  const item = {
    id: crypto.randomUUID(),
    folderId: folderId || defaultFolderId,
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
  return state.folders.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function listItems() {
  const state = await loadState();
  return state.items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getItem(id) {
  const state = await loadState();
  return state.items.find((entry) => entry.id === id) || null;
}

export async function updateItem(id, { blobUrl, metadata, folderId } = {}) {
  const state = await loadState();
  const item = state.items.find((entry) => entry.id === id);
  if (!item) {
    throw new Error("Item not found.");
  }

  if (typeof blobUrl === "string" && blobUrl.length) {
    item.blobUrl = blobUrl;
  }

  if (metadata && typeof metadata === "object") {
    item.metadata = { ...item.metadata, ...metadata };
  }

  if (folderId !== undefined) {
    item.folderId = folderId;
  }

  await saveState(state);
  return item;
}
