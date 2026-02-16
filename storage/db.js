import {
  DB_NAME,
  STORE_ITEMS,
  STORE_BLOBS,
  STORE_FOLDERS,
  DEFAULT_FOLDER_ID,
  DEFAULT_FOLDER_NAME,
  createId,
  nowIso,
  normalizeTags
} from "./models.js";
import { DB_VERSION, runMigrations } from "./migrations.js";

let dbPromise = null;
let readyPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      runMigrations(db, event.oldVersion);
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function getDb() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const db = await openDb();
      await ensureDefaultFolder(db);
      return db;
    })();
  }
  return readyPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function ensureDefaultFolder(db) {
  const tx = db.transaction(STORE_FOLDERS, "readwrite");
  const store = tx.objectStore(STORE_FOLDERS);
  const existing = await requestToPromise(store.get(DEFAULT_FOLDER_ID));
  if (!existing) {
    store.add({
      folderId: DEFAULT_FOLDER_ID,
      name: DEFAULT_FOLDER_NAME,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }
  await waitForTx(tx);
}

export async function createFolder(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    throw new Error("Folder name is required.");
  }

  const folder = {
    folderId: createId("folder"),
    name: trimmed,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const db = await getDb();
  const tx = db.transaction(STORE_FOLDERS, "readwrite");
  tx.objectStore(STORE_FOLDERS).add(folder);
  await waitForTx(tx);
  return folder;
}

export async function listFolders() {
  const db = await getDb();
  const tx = db.transaction(STORE_FOLDERS, "readonly");
  const folders = await requestToPromise(tx.objectStore(STORE_FOLDERS).getAll());
  await waitForTx(tx);
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function renameFolder(folderId, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    throw new Error("Folder name is required.");
  }

  const db = await getDb();
  const tx = db.transaction(STORE_FOLDERS, "readwrite");
  const store = tx.objectStore(STORE_FOLDERS);
  const folder = await requestToPromise(store.get(folderId));
  if (!folder) {
    throw new Error("Folder not found.");
  }

  folder.name = trimmed;
  folder.updatedAt = nowIso();
  store.put(folder);
  await waitForTx(tx);
  return folder;
}

export async function deleteFolder(folderId) {
  if (folderId === DEFAULT_FOLDER_ID) {
    throw new Error("Cannot delete the default folder.");
  }

  const db = await getDb();
  const tx = db.transaction([STORE_FOLDERS, STORE_ITEMS], "readwrite");
  const folderStore = tx.objectStore(STORE_FOLDERS);
  const itemStore = tx.objectStore(STORE_ITEMS);
  const index = itemStore.index("by_folder");
  const items = await requestToPromise(index.getAll(folderId));

  items.forEach((item) => {
    item.folderId = DEFAULT_FOLDER_ID;
    item.updatedAt = nowIso();
    itemStore.put(item);
  });

  folderStore.delete(folderId);
  await waitForTx(tx);
}

export async function saveItemWithBlob(item, blob) {
  if (!item || !item.type) {
    throw new Error("Item type is required.");
  }

  const now = nowIso();
  const itemRecord = {
    itemId: item.itemId || createId("item"),
    type: item.type,
    folderId: item.folderId || DEFAULT_FOLDER_ID,
    title: item.title || "Untitled",
    tags: normalizeTags(item.tags),
    createdAt: item.createdAt || now,
    updatedAt: now,
    width: item.width ?? null,
    height: item.height ?? null,
    durationMs: item.durationMs ?? null,
    mimeType: item.mimeType || blob?.type || "application/octet-stream",
    sizeBytes: item.sizeBytes ?? (blob ? blob.size : 0)
  };

  const db = await getDb();
  const tx = db.transaction([STORE_ITEMS, STORE_BLOBS], "readwrite");
  tx.objectStore(STORE_ITEMS).put(itemRecord);
  if (blob) {
    tx.objectStore(STORE_BLOBS).put({ itemId: itemRecord.itemId, blob });
  }
  await waitForTx(tx);
  return itemRecord;
}

export async function getItem(itemId) {
  const db = await getDb();
  const tx = db.transaction(STORE_ITEMS, "readonly");
  const item = await requestToPromise(tx.objectStore(STORE_ITEMS).get(itemId));
  await waitForTx(tx);
  return item || null;
}

export async function getBlob(itemId) {
  const db = await getDb();
  const tx = db.transaction(STORE_BLOBS, "readonly");
  const record = await requestToPromise(tx.objectStore(STORE_BLOBS).get(itemId));
  await waitForTx(tx);
  return record ? record.blob : null;
}

export async function listItems({ folderId } = {}) {
  const db = await getDb();
  const tx = db.transaction(STORE_ITEMS, "readonly");
  const store = tx.objectStore(STORE_ITEMS);
  let items = [];

  if (folderId) {
    const index = store.index("by_folder");
    items = await requestToPromise(index.getAll(folderId));
  } else {
    items = await requestToPromise(store.getAll());
  }

  await waitForTx(tx);
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function deleteItem(itemId) {
  const db = await getDb();
  const tx = db.transaction([STORE_ITEMS, STORE_BLOBS], "readwrite");
  tx.objectStore(STORE_ITEMS).delete(itemId);
  tx.objectStore(STORE_BLOBS).delete(itemId);
  await waitForTx(tx);
}

export async function moveItem(itemId, folderId) {
  return updateItemMetadata(itemId, { folderId });
}

export async function updateItemMetadata(itemId, updates) {
  const db = await getDb();
  const tx = db.transaction(STORE_ITEMS, "readwrite");
  const store = tx.objectStore(STORE_ITEMS);
  const item = await requestToPromise(store.get(itemId));
  if (!item) {
    throw new Error("Item not found.");
  }

  const safeUpdates = Object.fromEntries(
    Object.entries(updates || {}).filter(([, value]) => value !== undefined)
  );

  const updated = {
    ...item,
    ...safeUpdates,
    tags: safeUpdates.tags ? normalizeTags(safeUpdates.tags) : item.tags,
    updatedAt: nowIso()
  };

  store.put(updated);
  await waitForTx(tx);
  return updated;
}
