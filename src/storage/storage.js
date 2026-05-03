import {
  StorageQuotaError,
  clearAllData as dbClearAllData,
  createFolder as dbCreateFolder,
  deleteFolder as dbDeleteFolder,
  deleteMedia as dbDeleteMedia,
  exportAllMetadata as dbExportAllMetadata,
  getMedia as dbGetMedia,
  getMediaBlob as dbGetMediaBlob,
  getLatestRecordingDraft as dbGetLatestRecordingDraft,
  getRecordingDraft as dbGetRecordingDraft,
  getThumbnailBlob as dbGetThumbnailBlob,
  getSettings as dbGetSettings,
  getStorageUsage as dbGetStorageUsage,
  initRepository,
  listByFolder as dbListByFolder,
  listFolders as dbListFolders,
  listFavourites as dbListFavourites,
  listRecent as dbListRecent,
  listTags as dbListTags,
  listTrash as dbListTrash,
  clearRecordingDrafts as dbClearRecordingDrafts,
  deleteRecordingDraft as dbDeleteRecordingDraft,
  moveToTrash as dbMoveToTrash,
  permanentlyDelete as dbPermanentlyDelete,
  renameFolder as dbRenameFolder,
  resetStorageWriterForTesting,
  resetRepositoryForTesting,
  restoreFromTrash as dbRestoreFromTrash,
  saveMedia as dbSaveMedia,
  saveRecordingDraft as dbSaveRecordingDraft,
  searchMedia as dbSearchMedia,
  setStorageWriterForTesting,
  updateMediaMetadata as dbUpdateMediaMetadata,
  updateSettings as dbUpdateSettings
} from "../../storage/db.js";
import {
  DEFAULT_FOLDER_ID,
  DEFAULT_SETTINGS,
  LEGACY_DB_NAME,
  MEDIA_KINDS,
  SOURCE_TYPES,
  createId,
  nowIso,
  normalizeFolderName,
  normalizeTags,
  normalizeTitle
} from "../../storage/models.js";

const LEGACY_STORAGE_KEY = "snaplib_storage";
const MIGRATION_FLAG_KEY = "olho_media_repo_migration_v2";
const LEGACY_INTERNAL_FLAG_KEY = "olho_idb_migrated_v1";

let migrationPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted."));
    tx.onerror = () => reject(tx.error || new Error("Transaction failed."));
  });
}

function normalizeTypeToKind(type) {
  if (type === "video" || type === MEDIA_KINDS.RECORDING) return MEDIA_KINDS.RECORDING;
  return MEDIA_KINDS.SCREENSHOT;
}

function normalizeKindToType(kind) {
  if (kind === MEDIA_KINDS.RECORDING) return "video";
  return "image";
}

function mapSourceType(input, kind) {
  const source = String(input || "").trim();
  const allowed = new Set(Object.values(SOURCE_TYPES));
  if (allowed.has(source)) return source;

  if (kind === MEDIA_KINDS.RECORDING) {
    return SOURCE_TYPES.SCREEN_RECORDING;
  }
  return SOURCE_TYPES.VISIBLE;
}

function mapFolder(folder) {
  return {
    id: folder.id,
    name: folder.name,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    isDefault: folder.id === DEFAULT_FOLDER_ID
  };
}

function mapMediaSummary(summary, blob = null) {
  if (!summary) return null;
  const metadata = summary.metadata && typeof summary.metadata === "object" ? { ...summary.metadata } : {};

  return {
    id: summary.id,
    kind: summary.kind,
    type: normalizeKindToType(summary.kind),
    folderId: summary.folderId,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    thumbnailId: summary.thumbnailId || null,
    blob,
    blobUrl: null,
    dataUrl: null,
    metadata: {
      ...metadata,
      title: summary.title,
      tags: Array.isArray(summary.tags) ? [...summary.tags] : [],
      mimeType: summary.mimeType,
      extension: summary.extension,
      sizeBytes: summary.sizeBytes,
      width: summary.width,
      height: summary.height,
      durationMs: summary.durationMs,
      favourite: Boolean(summary.favourite),
      sourceType: summary.sourceType,
      privacyLocalOnlyMode: true
    }
  };
}

function mapRecordingDraft(draft) {
  if (!draft) return null;
  const metadata = draft.metadata && typeof draft.metadata === "object" ? { ...draft.metadata } : {};

  return {
    id: draft.id,
    kind: "recording",
    type: "video",
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    folderId: draft.folderId || DEFAULT_FOLDER_ID,
    blob: draft.blob || null,
    metadata: {
      ...metadata,
      title: draft.title || "Unsaved Recording Draft",
      tags: Array.isArray(draft.tags) ? [...draft.tags] : [],
      mimeType: draft.mimeType || draft.blob?.type || "video/webm",
      extension: draft.extension || "webm",
      sizeBytes: draft.sizeBytes || draft.blob?.size || 0,
      width: draft.width ?? null,
      height: draft.height ?? null,
      durationMs: draft.durationMs ?? null,
      sourceType: draft.sourceType || SOURCE_TYPES.SCREEN_RECORDING,
      privacyLocalOnlyMode: true
    }
  };
}

async function dataUrlToBlob(dataUrl) {
  const [meta = "", data = ""] = String(dataUrl || "").split(",");
  if (!data) {
    throw new Error("Invalid data URL.");
  }

  const mimeMatch = meta.match(/data:(.*?);base64/i);
  const mimeType = mimeMatch?.[1] || "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function isSafeDataUrl(value) {
  const input = String(value || "").trim();
  return /^data:[^,]+;base64,/i.test(input);
}

function getRuntimeExtensionId() {
  const id = String(chrome?.runtime?.id || "").trim();
  return /^[a-z]{32}$/i.test(id) ? id : "";
}

function isSafeExtensionBlobUrl(value) {
  const input = String(value || "").trim();
  if (!input.toLowerCase().startsWith("blob:")) {
    return false;
  }

  const inner = input.slice(5);
  let innerUrl;
  try {
    innerUrl = new URL(inner);
  } catch {
    return false;
  }

  if (innerUrl.protocol !== "chrome-extension:") {
    return false;
  }

  const runtimeId = getRuntimeExtensionId();
  if (runtimeId && innerUrl.host !== runtimeId) {
    return false;
  }

  return true;
}

async function blobUrlToBlob(blobUrl) {
  const input = String(blobUrl || "").trim();
  if (!isSafeExtensionBlobUrl(input)) {
    throw new Error("Unsupported legacy blob URL.");
  }

  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(`Unable to load blob URL (${response.status}).`);
  }
  return response.blob();
}

async function resolveBlobSource({ blob, dataUrl, blobUrl }) {
  if (blob instanceof Blob) return blob;
  if (dataUrl) {
    if (!isSafeDataUrl(dataUrl)) {
      throw new Error("Unsupported legacy data URL.");
    }
    return dataUrlToBlob(dataUrl);
  }
  if (blobUrl) return blobUrlToBlob(blobUrl);
  return null;
}

async function legacyDbExists() {
  if (typeof indexedDB === "undefined") return false;
  if (typeof indexedDB.databases !== "function") return true;

  try {
    const list = await indexedDB.databases();
    return list.some((entry) => entry.name === LEGACY_DB_NAME);
  } catch {
    return true;
  }
}

async function openLegacyDb() {
  if (!(await legacyDbExists())) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    let createdFresh = false;

    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        createdFresh = true;
      }
    };

    request.onsuccess = async () => {
      const db = request.result;
      if (createdFresh) {
        db.close();
        try {
          await new Promise((done) => {
            const deleteRequest = indexedDB.deleteDatabase(LEGACY_DB_NAME);
            deleteRequest.onsuccess = () => done();
            deleteRequest.onerror = () => done();
            deleteRequest.onblocked = () => done();
          });
        } catch {
          // best effort
        }
        resolve(null);
        return;
      }
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

async function getLegacyLocalData() {
  if (!chrome?.storage?.local) {
    return { folders: [], items: [] };
  }

  const stored = await chrome.storage.local.get({ [LEGACY_STORAGE_KEY]: { folders: [], items: [] } });
  const payload = stored[LEGACY_STORAGE_KEY] || { folders: [], items: [] };

  return {
    folders: Array.isArray(payload.folders) ? payload.folders : [],
    items: Array.isArray(payload.items) ? payload.items : []
  };
}

async function listExistingFoldersByName() {
  const folders = await dbListFolders();
  const map = new Map();
  folders.forEach((folder) => {
    map.set(String(folder.name || "").toLowerCase(), folder.id);
  });
  return { folders, map };
}

function normalizeFolderCandidate(name) {
  const raw = String(name || "").trim();
  return raw || "Recovered";
}

async function ensureFolderId(folderCache, folderName) {
  const normalized = normalizeFolderCandidate(folderName);
  const key = normalized.toLowerCase();
  if (folderCache.map.has(key)) {
    return folderCache.map.get(key);
  }

  const created = await dbCreateFolder(normalized);
  folderCache.map.set(key, created.id);
  folderCache.folders.push(created);
  return created.id;
}

async function migrateLegacyLocal(folderIdMap, folderCache, report) {
  const legacy = await getLegacyLocalData();

  for (const folder of legacy.folders) {
    if (!folder) continue;
    const legacyId = String(folder.id || folder.folderId || "").trim();
    if (!legacyId) continue;

    if (folder.isDefault || legacyId === "unsorted" || legacyId === DEFAULT_FOLDER_ID) {
      folderIdMap.set(legacyId, DEFAULT_FOLDER_ID);
      continue;
    }

    const nextFolderId = await ensureFolderId(folderCache, folder.name);
    folderIdMap.set(legacyId, nextFolderId);
  }

  for (const item of legacy.items) {
    if (!item) continue;

    const legacyId = String(item.id || item.itemId || createId("legacy_local")).trim();
    const id = `legacy_local_${legacyId}`;

    let blob = null;
    try {
      blob = await resolveBlobSource({ blob: null, dataUrl: item.dataUrl, blobUrl: item.blobUrl });
    } catch (error) {
      report.brokenLegacyItems.push({
        source: "chrome.storage.local",
        legacyId,
        reason: String(error?.message || "Unable to read source")
      });
      continue;
    }

    if (!(blob instanceof Blob)) {
      report.brokenLegacyItems.push({
        source: "chrome.storage.local",
        legacyId,
        reason: "Missing blob source"
      });
      continue;
    }

    const kind = normalizeTypeToKind(item.type);
    const folderId = folderIdMap.get(String(item.folderId || "")) || DEFAULT_FOLDER_ID;
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};

    await dbSaveMedia({
      id,
      kind,
      title: metadata.title || `Recovered ${kind === MEDIA_KINDS.RECORDING ? "Recording" : "Capture"}`,
      createdAt: item.createdAt || nowIso(),
      mimeType: metadata.mimeType || blob.type,
      extension: metadata.extension,
      sizeBytes: metadata.sizeBytes || blob.size,
      width: metadata.width,
      height: metadata.height,
      durationMs: metadata.durationMs,
      folderId,
      tags: normalizeTags(metadata.tags),
      favourite: Boolean(metadata.favourite),
      sourceType: mapSourceType(metadata.sourceType, kind),
      metadata: {
        ...metadata,
        migratedFrom: "chrome.storage.local",
        legacyId,
        legacyBroken: false
      },
      blob
    });

    report.migratedItems += 1;
  }

  report.scannedLegacyItems += legacy.items.length;
}

async function migrateLegacyIndexedDb(folderIdMap, folderCache, report) {
  const legacyDb = await openLegacyDb();
  if (!legacyDb) {
    return;
  }

  try {
    const hasFolders = legacyDb.objectStoreNames.contains("folders");
    const hasItems = legacyDb.objectStoreNames.contains("items");
    const hasBlobs = legacyDb.objectStoreNames.contains("blobs");
    if (!hasItems || !hasBlobs) {
      return;
    }

    const stores = ["items", "blobs"];
    if (hasFolders) stores.push("folders");
    const tx = legacyDb.transaction(stores, "readonly");

    const items = await requestToPromise(tx.objectStore("items").getAll());
    const blobs = await requestToPromise(tx.objectStore("blobs").getAll());
    const folders = hasFolders ? await requestToPromise(tx.objectStore("folders").getAll()) : [];

    await waitForTx(tx);

    const blobMap = new Map();
    blobs.forEach((entry) => {
      if (!entry) return;
      const key = String(entry.itemId || entry.id || "");
      if (!key) return;
      if (entry.blob instanceof Blob) {
        blobMap.set(key, entry.blob);
      }
    });

    folders.forEach((folder) => {
      if (!folder) return;
      const legacyId = String(folder.folderId || folder.id || "").trim();
      if (!legacyId) return;
      if (legacyId === "unsorted" || folder.isDefault) {
        folderIdMap.set(legacyId, DEFAULT_FOLDER_ID);
        return;
      }

      const name = normalizeFolderCandidate(folder.name);
      const key = name.toLowerCase();
      if (folderCache.map.has(key)) {
        folderIdMap.set(legacyId, folderCache.map.get(key));
      }
    });

    for (const folder of folders) {
      if (!folder) continue;
      const legacyId = String(folder.folderId || folder.id || "").trim();
      if (!legacyId || folderIdMap.has(legacyId)) continue;
      if (folder.isDefault || legacyId === "unsorted") {
        folderIdMap.set(legacyId, DEFAULT_FOLDER_ID);
        continue;
      }

      const nextFolderId = await ensureFolderId(folderCache, folder.name);
      folderIdMap.set(legacyId, nextFolderId);
    }

    for (const item of items) {
      if (!item) continue;
      const legacyId = String(item.itemId || item.id || createId("legacy_idb")).trim();
      const id = `legacy_idb_${legacyId}`;

      const blob = blobMap.get(legacyId);
      if (!(blob instanceof Blob)) {
        report.brokenLegacyItems.push({
          source: "legacy-indexeddb",
          legacyId,
          reason: "Missing blob payload"
        });
        continue;
      }

      const kind = normalizeTypeToKind(item.type || item.kind);
      const folderId = folderIdMap.get(String(item.folderId || "")) || DEFAULT_FOLDER_ID;

      await dbSaveMedia({
        id,
        kind,
        title: item.title || `Recovered ${kind === MEDIA_KINDS.RECORDING ? "Recording" : "Capture"}`,
        createdAt: item.createdAt || nowIso(),
        mimeType: item.mimeType || blob.type,
        extension: item.extension,
        sizeBytes: item.sizeBytes || blob.size,
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
        folderId,
        tags: normalizeTags(item.tags || []),
        favourite: Boolean(item.favourite),
        sourceType: mapSourceType(item.sourceType || item.extra?.sourceType, kind),
        metadata: {
          ...(item.extra && typeof item.extra === "object" ? item.extra : {}),
          migratedFrom: "legacy-indexeddb",
          legacyId,
          legacyBroken: false
        },
        blob
      });

      report.migratedItems += 1;
    }

    report.scannedLegacyItems += items.length;
  } finally {
    legacyDb.close();
  }
}

async function migrateLegacyStorage() {
  await initRepository();

  if (!chrome?.storage?.local) {
    return;
  }

  const stored = await chrome.storage.local.get({ [MIGRATION_FLAG_KEY]: null });
  if (stored[MIGRATION_FLAG_KEY]?.status === "done") {
    return;
  }

  const report = {
    status: "running",
    startedAt: nowIso(),
    completedAt: null,
    scannedLegacyItems: 0,
    migratedItems: 0,
    migratedFolders: 0,
    brokenLegacyItems: []
  };

  const folderIdMap = new Map();
  folderIdMap.set(DEFAULT_FOLDER_ID, DEFAULT_FOLDER_ID);
  folderIdMap.set("unsorted", DEFAULT_FOLDER_ID);

  const folderCache = await listExistingFoldersByName();
  report.migratedFolders = folderCache.folders.length;

  await migrateLegacyLocal(folderIdMap, folderCache, report);
  await migrateLegacyIndexedDb(folderIdMap, folderCache, report);

  report.migratedFolders = folderCache.folders.length;
  report.status = "done";
  report.completedAt = nowIso();

  await dbUpdateSettings({
    lastMigrationReport: report,
    privacyLocalOnlyMode: true
  });

  await chrome.storage.local.set({
    [MIGRATION_FLAG_KEY]: report,
    [LEGACY_INTERNAL_FLAG_KEY]: true
  });
}

async function ensureMigration() {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyStorage().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

export { StorageQuotaError };

export async function estimateStoragePressure(additionalBytes = 0) {
  await ensureMigration();
  const libraryUsage = await dbGetStorageUsage();

  let quotaBytes = null;
  let browserUsageBytes = null;

  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      quotaBytes = Number(estimate?.quota || 0) || null;
      browserUsageBytes = Number(estimate?.usage || 0) || null;
    } catch {
      quotaBytes = null;
      browserUsageBytes = null;
    }
  }

  const usedBytes = browserUsageBytes ?? Number(libraryUsage.totalBytes || 0);
  const projectedBytes = usedBytes + Math.max(0, Number(additionalBytes || 0));
  const usageRatio = quotaBytes ? projectedBytes / quotaBytes : null;

  return {
    additionalBytes: Math.max(0, Number(additionalBytes || 0)),
    usedBytes,
    projectedBytes,
    quotaBytes,
    usageRatio,
    nearQuota: usageRatio !== null ? usageRatio >= 0.85 : false,
    overQuotaLikely: usageRatio !== null ? usageRatio >= 0.98 : false,
    libraryUsage
  };
}

export async function saveMedia(input = {}) {
  await ensureMigration();

  const blob = await resolveBlobSource({
    blob: input.blob,
    dataUrl: input.dataUrl,
    blobUrl: input.blobUrl
  });

  if (!(blob instanceof Blob)) {
    throw new Error("Media Blob is required.");
  }

  const pressure = await estimateStoragePressure(blob.size);
  if (pressure.overQuotaLikely) {
    throw new StorageQuotaError(
      "Olho could not save this file in the local library because browser storage is full. Export it now to avoid loss.",
      {
        blob,
        media: {
          title: input.title || input.metadata?.title || "Untitled",
          kind: input.kind || input.type || "screenshot"
        }
      }
    );
  }

  const kind = normalizeTypeToKind(input.kind || input.type);
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};

  const saved = await dbSaveMedia({
    id: input.id,
    kind,
    title: input.title || metadata.title,
    createdAt: input.createdAt,
    mimeType: input.mimeType || metadata.mimeType || blob.type,
    extension: input.extension || metadata.extension,
    sizeBytes: input.sizeBytes ?? metadata.sizeBytes ?? blob.size,
    width: input.width ?? metadata.width,
    height: input.height ?? metadata.height,
    durationMs: input.durationMs ?? metadata.durationMs,
    folderId: input.folderId || DEFAULT_FOLDER_ID,
    tags: input.tags ?? metadata.tags,
    favourite: input.favourite ?? metadata.favourite,
    sourceType: mapSourceType(input.sourceType || metadata.sourceType, kind),
    metadata,
    blob
  });

  return mapMediaSummary(saved, blob);
}

export async function getMedia(id, options = {}) {
  await ensureMigration();
  const media = await dbGetMedia(id, { includeBlob: Boolean(options.includeBlob) });
  if (!media) return null;
  return mapMediaSummary(media, options.includeBlob ? media.blob || null : null);
}

export async function getMediaBlob(id) {
  await ensureMigration();
  return dbGetMediaBlob(id);
}

export async function getThumbnailBlob(id) {
  await ensureMigration();
  return dbGetThumbnailBlob(id);
}

export async function saveRecordingDraft(input = {}) {
  await ensureMigration();

  const blob = await resolveBlobSource({
    blob: input.blob,
    dataUrl: input.dataUrl,
    blobUrl: input.blobUrl
  });

  if (!(blob instanceof Blob)) {
    throw new Error("Recording draft Blob is required.");
  }

  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const tags = normalizeTags(input.tags ?? metadata.tags ?? []);

  const draft = await dbSaveRecordingDraft({
    id: input.id,
    blob,
    title: input.title || metadata.title || "Unsaved Recording Draft",
    folderId: input.folderId || DEFAULT_FOLDER_ID,
    tags,
    sourceType: mapSourceType(input.sourceType || metadata.sourceType, MEDIA_KINDS.RECORDING),
    mimeType: input.mimeType || metadata.mimeType || blob.type || "video/webm",
    extension: input.extension || metadata.extension,
    sizeBytes: input.sizeBytes ?? metadata.sizeBytes ?? blob.size,
    width: input.width ?? metadata.width ?? null,
    height: input.height ?? metadata.height ?? null,
    durationMs: input.durationMs ?? metadata.durationMs ?? null,
    metadata: {
      ...metadata,
      title: input.title || metadata.title || "Unsaved Recording Draft",
      tags
    }
  });

  return mapRecordingDraft(draft);
}

export async function getRecordingDraft(id) {
  await ensureMigration();
  const draft = await dbGetRecordingDraft(id);
  return mapRecordingDraft(draft);
}

export async function getLatestRecordingDraft() {
  await ensureMigration();
  const draft = await dbGetLatestRecordingDraft();
  return mapRecordingDraft(draft);
}

export async function deleteRecordingDraft(id) {
  await ensureMigration();
  return dbDeleteRecordingDraft(id);
}

export async function clearRecordingDrafts() {
  await ensureMigration();
  return dbClearRecordingDrafts();
}

export async function updateMediaMetadata(id, updates = {}) {
  await ensureMigration();
  const next = await dbUpdateMediaMetadata(id, updates);
  return mapMediaSummary(next);
}

export async function deleteMedia(id) {
  await ensureMigration();
  return dbDeleteMedia(id);
}

export async function moveToTrash(id) {
  await ensureMigration();
  return dbMoveToTrash(id);
}

export async function restoreFromTrash(idOrMediaId) {
  await ensureMigration();
  const restored = await dbRestoreFromTrash(idOrMediaId);
  return mapMediaSummary(restored);
}

export async function permanentlyDelete(idOrMediaId) {
  await ensureMigration();
  return dbPermanentlyDelete(idOrMediaId);
}

export async function searchMedia(filters = {}) {
  await ensureMigration();
  const items = await dbSearchMedia(filters);
  return items.map((item) => mapMediaSummary(item));
}

export async function listByFolder(folderId, options = {}) {
  await ensureMigration();
  const items = await dbListByFolder(folderId, options);
  return items.map((item) => mapMediaSummary(item));
}

export async function listRecent(limit = 20) {
  await ensureMigration();
  const items = await dbListRecent(limit);
  return items.map((item) => mapMediaSummary(item));
}

export async function listFavourites(limit = 50) {
  await ensureMigration();
  const items = await dbListFavourites(limit);
  return items.map((item) => mapMediaSummary(item));
}

export async function getStorageUsage() {
  await ensureMigration();
  return dbGetStorageUsage();
}

export async function exportAllMetadata() {
  await ensureMigration();
  return dbExportAllMetadata();
}

export async function getAppSettings() {
  await ensureMigration();
  const settings = await dbGetSettings();
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    privacyLocalOnlyMode: true,
    shareSettings: {
      ...DEFAULT_SETTINGS.shareSettings,
      ...(settings.shareSettings || {})
    }
  };
}

export async function updateAppSettings(updates = {}) {
  await ensureMigration();
  const normalized = {
    ...updates,
    defaultSaveLocation: "local_library",
    privacyLocalOnlyMode: true
  };
  const saved = await dbUpdateSettings(normalized);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    privacyLocalOnlyMode: true,
    shareSettings: {
      ...DEFAULT_SETTINGS.shareSettings,
      ...(saved.shareSettings || {})
    }
  };
}

export async function listFolders() {
  await ensureMigration();
  const folders = await dbListFolders();
  return folders.map(mapFolder);
}

export async function createFolder(name) {
  await ensureMigration();
  const folder = await dbCreateFolder(normalizeFolderName(name));
  return mapFolder(folder);
}

export async function renameFolder(id, name) {
  await ensureMigration();
  const folder = await dbRenameFolder(id, normalizeFolderName(name));
  return mapFolder(folder);
}

export async function deleteFolder(id) {
  await ensureMigration();
  return dbDeleteFolder(id);
}

export async function listTags() {
  await ensureMigration();
  return dbListTags();
}

export async function listTrash(limit = 100) {
  await ensureMigration();
  return dbListTrash(limit);
}

export async function emptyTrash() {
  await ensureMigration();
  const entries = await dbListTrash(5000);
  for (const entry of entries) {
    await dbPermanentlyDelete(entry.id);
  }
  return { removed: entries.length };
}

export async function listLargestMedia(limit = 25) {
  const all = await searchMedia({ sort: "newest" });
  return all
    .slice()
    .sort((a, b) => Number(b.metadata?.sizeBytes || 0) - Number(a.metadata?.sizeBytes || 0))
    .slice(0, Math.max(1, Number(limit || 25)));
}

export async function permanentlyDeleteLargest(limit = 10) {
  const largest = await listLargestMedia(limit);
  for (const item of largest) {
    await dbPermanentlyDelete(item.id);
  }
  return { removed: largest.length, ids: largest.map((item) => item.id) };
}

export async function clearAllData() {
  await ensureMigration();
  await dbClearAllData();

  if (chrome?.storage?.session) {
    await chrome.storage.session.remove(["lastCapture", "olho_editor_drafts"]);
  }

  if (chrome?.storage?.local) {
    await chrome.storage.local.remove([MIGRATION_FLAG_KEY, LEGACY_INTERNAL_FLAG_KEY, LEGACY_STORAGE_KEY]);
  }
}

// Compatibility adapters for existing page scripts.

export async function createItem({
  folderId = null,
  type,
  kind,
  blob = null,
  blobUrl = null,
  dataUrl = null,
  metadata = {}
} = {}) {
  const item = await saveMedia({
    folderId: folderId || DEFAULT_FOLDER_ID,
    type: type || kind,
    blob,
    blobUrl,
    dataUrl,
    metadata,
    sourceType: metadata.sourceType
  });
  return item;
}

export async function getItem(id) {
  return getMedia(id, { includeBlob: true });
}

export async function listItems() {
  const items = await searchMedia({ sort: "newest" });
  return items;
}

export async function moveItem(id, folderId) {
  return updateMediaMetadata(id, { folderId: folderId || DEFAULT_FOLDER_ID });
}

export async function renameItem(id, name) {
  return updateMediaMetadata(id, { title: normalizeTitle(name) });
}

export async function deleteItem(id) {
  return deleteMedia(id);
}

export async function updateItem(id, { blob = undefined, blobUrl, dataUrl, metadata = {}, folderId } = {}) {
  const current = await getMedia(id, { includeBlob: true });
  if (!current) {
    throw new Error("Item not found.");
  }

  const hasSourceUpdate = blob !== undefined || blobUrl !== undefined || dataUrl !== undefined;
  const nextBlob = hasSourceUpdate
    ? await resolveBlobSource({ blob, blobUrl, dataUrl })
    : current.blob;

  if (!(nextBlob instanceof Blob)) {
    throw new Error("Blob source missing for update.");
  }

  const nextMetadata = {
    ...current.metadata,
    ...(metadata && typeof metadata === "object" ? metadata : {})
  };

  const updated = await saveMedia({
    id: current.id,
    kind: current.kind,
    blob: nextBlob,
    folderId: folderId || current.folderId,
    createdAt: current.createdAt,
    title: nextMetadata.title,
    mimeType: nextMetadata.mimeType || nextBlob.type,
    extension: nextMetadata.extension,
    sizeBytes: nextMetadata.sizeBytes || nextBlob.size,
    width: nextMetadata.width,
    height: nextMetadata.height,
    durationMs: nextMetadata.durationMs,
    tags: normalizeTags(nextMetadata.tags || []),
    favourite: Boolean(nextMetadata.favourite),
    sourceType: nextMetadata.sourceType || current.metadata.sourceType,
    metadata: nextMetadata
  });

  return updated;
}

export async function migrateNowForTesting() {
  await ensureMigration();
}

export async function resetStorageForTesting() {
  migrationPromise = null;
  await resetRepositoryForTesting();
  if (chrome?.storage?.local) {
    await chrome.storage.local.clear();
  }
  if (chrome?.storage?.session) {
    await chrome.storage.session.clear();
  }
  resetStorageWriterForTesting();
}

export function setStorageWriterForTestingAdapter(writer) {
  setStorageWriterForTesting(writer);
}
