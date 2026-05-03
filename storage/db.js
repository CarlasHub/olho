import {
  DB_NAME,
  DEFAULT_FOLDER_ID,
  DEFAULT_FOLDER_NAME,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  STORE_FOLDERS,
  STORE_MEDIA,
  STORE_SETTINGS,
  STORE_TAGS,
  STORE_THUMBNAILS,
  STORE_TRASH,
  STORE_RECORDING_DRAFTS,
  MEDIA_KINDS,
  SOURCE_TYPES,
  createId,
  inferExtension,
  isQuotaError,
  normalizeFolderName,
  normalizeMediaKind,
  normalizeSourceType,
  normalizeTags,
  normalizeTitle,
  nowIso,
  safeNumber
} from "./models.js";
import { DB_VERSION, runMigrations } from "./migrations.js";

export class StorageQuotaError extends Error {
  constructor(message, options = {}) {
    super(message || "Not enough local storage space available.");
    this.name = "StorageQuotaError";
    this.blob = options.blob || null;
    this.media = options.media || null;
    this.cause = options.cause || null;
  }
}

let dbPromise = null;
let readyPromise = null;
let storageWriter = {
  putMedia: (store, media) => store.put(media),
  putThumbnail: (store, thumbnail) => store.put(thumbnail)
};

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

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      runMigrations(db);
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

async function ensureDefaults(db) {
  const tx = db.transaction([STORE_FOLDERS, STORE_SETTINGS], "readwrite");
  const folders = tx.objectStore(STORE_FOLDERS);
  const settings = tx.objectStore(STORE_SETTINGS);

  const existingFolder = await requestToPromise(folders.get(DEFAULT_FOLDER_ID));
  if (!existingFolder) {
    folders.put({
      id: DEFAULT_FOLDER_ID,
      name: DEFAULT_FOLDER_NAME,
      nameLower: DEFAULT_FOLDER_NAME.toLowerCase(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      isDefault: true
    });
  }

  const existingSettings = await requestToPromise(settings.get(SETTINGS_KEY));
  if (!existingSettings) {
    settings.put({
      id: SETTINGS_KEY,
      ...DEFAULT_SETTINGS,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  await waitForTx(tx);
}

async function getDb() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const db = await openDb();
      await ensureDefaults(db);
      return db;
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

function readAsSummaries(records) {
  return records.map((record) => ({
    id: record.id,
    kind: record.kind,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    mimeType: record.mimeType,
    extension: record.extension,
    sizeBytes: record.sizeBytes,
    width: record.width,
    height: record.height,
    durationMs: record.durationMs,
    folderId: record.folderId,
    tags: Array.isArray(record.tags) ? [...record.tags] : [],
    favourite: Boolean(record.favourite),
    sourceType: record.sourceType,
    thumbnailId: record.thumbnailId || null,
    metadata: record.metadata && typeof record.metadata === "object" ? { ...record.metadata } : {}
  }));
}

function sendRuntimeMessage(message) {
  if (!chrome?.runtime?.sendMessage) {
    return Promise.resolve(null);
  }

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

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  return null;
}

function get2dContext(canvas) {
  if (!canvas || typeof canvas.getContext !== "function") return null;
  return canvas.getContext("2d");
}

function blobFromCanvas(canvas, mimeType = "image/webp", quality = 0.86) {
  if (!canvas) {
    return Promise.resolve(null);
  }

  if (canvas.convertToBlob) {
    return canvas.convertToBlob({ type: mimeType, quality }).catch(() => null);
  }

  if (canvas.toBlob) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), mimeType, quality);
    });
  }

  return Promise.resolve(null);
}

function drawFitted(ctx, sourceWidth, sourceHeight, targetSize) {
  const ratio = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * ratio));
  const drawHeight = Math.max(1, Math.round(sourceHeight * ratio));
  const x = Math.round((targetSize - drawWidth) / 2);
  const y = Math.round((targetSize - drawHeight) / 2);
  return { x, y, drawWidth, drawHeight };
}

async function createImageThumbnail(blob, size) {
  if (!(blob instanceof Blob)) return null;
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = makeCanvas(size, size);
  const ctx = get2dContext(canvas);

  if (!ctx || !canvas) {
    bitmap.close?.();
    return null;
  }

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, size, size);

  const fit = drawFitted(ctx, bitmap.width, bitmap.height, size);
  ctx.drawImage(bitmap, fit.x, fit.y, fit.drawWidth, fit.drawHeight);

  bitmap.close?.();

  return blobFromCanvas(canvas, "image/webp", 0.82);
}

function waitForVideoFrame(video, seekToMs = 200) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while loading video frame."));
    }, 4000);

    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    }

    function onError() {
      cleanup();
      reject(new Error("Unable to load video for thumbnail."));
    }

    function onSeeked() {
      cleanup();
      resolve();
    }

    function onLoadedData() {
      const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      const target = durationMs > 0 ? Math.min(seekToMs, Math.max(0, durationMs - 20)) / 1000 : 0;
      if (target <= 0) {
        cleanup();
        resolve();
        return;
      }
      video.currentTime = target;
    }

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
  });
}

async function createVideoThumbnail(blob, size) {
  if (!(blob instanceof Blob)) return null;
  if (typeof ImageDecoder !== "undefined") {
    try {
      const decoder = new ImageDecoder({ data: blob, type: blob.type || "video/webm" });
      const frame = await decoder.decode({ frameIndex: 0 });
      const canvas = makeCanvas(size, size);
      const ctx = get2dContext(canvas);
      if (ctx && canvas) {
        ctx.fillStyle = "#0b1020";
        ctx.fillRect(0, 0, size, size);
        const fit = drawFitted(ctx, frame.image.displayWidth, frame.image.displayHeight, size);
        ctx.drawImage(frame.image, fit.x, fit.y, fit.drawWidth, fit.drawHeight);
        ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
        ctx.fillRect(8, size - 34, size - 16, 24);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "600 12px system-ui";
        ctx.fillText("REC", 16, size - 17);
        frame.image.close();
        decoder.close();
        return blobFromCanvas(canvas, "image/webp", 0.82);
      }
      frame.image.close();
      decoder.close();
    } catch {
      // fall through to DOM decode
    }
  }

  if (typeof document === "undefined") {
    try {
      const response = await sendRuntimeMessage({
        type: "generate_video_thumbnail",
        payload: { blob, size }
      });
      const data = response?.data || response;
      if (data?.dataUrl) {
        return dataUrlToBlob(data.dataUrl);
      }
    } catch {
      // fall through to null
    }
    return null;
  }

  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  try {
    await waitForVideoFrame(video);

    const sourceWidth = Math.max(1, video.videoWidth || size);
    const sourceHeight = Math.max(1, video.videoHeight || size);

    const canvas = makeCanvas(size, size);
    const ctx = get2dContext(canvas);
    if (!ctx || !canvas) {
      return null;
    }

    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, size, size);

    const fit = drawFitted(ctx, sourceWidth, sourceHeight, size);
    ctx.drawImage(video, fit.x, fit.y, fit.drawWidth, fit.drawHeight);

    ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
    ctx.fillRect(8, size - 34, size - 16, 24);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 12px system-ui";
    ctx.fillText("REC", 16, size - 17);

    return blobFromCanvas(canvas, "image/webp", 0.82);
  } catch {
    try {
      const response = await sendRuntimeMessage({
        type: "generate_video_thumbnail",
        payload: { blob, size }
      });
      const data = response?.data || response;
      if (data?.dataUrl) {
        return dataUrlToBlob(data.dataUrl);
      }
    } catch {
      // fall through to null
    }
    return null;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function createFallbackThumbnail(kind, size) {
  const canvas = makeCanvas(size, size);
  const ctx = get2dContext(canvas);
  if (!ctx || !canvas) {
    return null;
  }

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#0f172a");
  gradient.addColorStop(1, "#1e293b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "#93c5fd";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, size * 0.28, size * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#bfdbfe";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(kind === MEDIA_KINDS.RECORDING ? "VIDEO" : "IMAGE", size / 2, size - 14);

  return blobFromCanvas(canvas, "image/webp", 0.82);
}

async function buildThumbnail({ blob, kind, size }) {
  const targetSize = Math.max(96, Math.min(640, Number(size) || 320));

  let thumbnailBlob = null;
  try {
    if (kind === MEDIA_KINDS.SCREENSHOT) {
      thumbnailBlob = await createImageThumbnail(blob, targetSize);
    } else if (kind === MEDIA_KINDS.RECORDING) {
      thumbnailBlob = await createVideoThumbnail(blob, targetSize);
    }
  } catch {
    thumbnailBlob = null;
  }

  if (!(thumbnailBlob instanceof Blob)) {
    thumbnailBlob = await createFallbackThumbnail(kind, targetSize);
  }

  if (!(thumbnailBlob instanceof Blob)) {
    return null;
  }

  return {
    blob: thumbnailBlob,
    mimeType: thumbnailBlob.type || "image/webp",
    sizeBytes: thumbnailBlob.size,
    width: targetSize,
    height: targetSize
  };
}

function buildMediaRecord(input, blob, settings) {
  const now = nowIso();
  const title = normalizeTitle(input.title || input.metadata?.title);
  const tags = normalizeTags(input.tags || input.metadata?.tags || []);

  const kind = normalizeMediaKind(input.kind);
  const sourceType = normalizeSourceType(
    input.sourceType,
    kind === MEDIA_KINDS.RECORDING ? SOURCE_TYPES.SCREEN_RECORDING : SOURCE_TYPES.VISIBLE
  );

  const mimeType = String(input.mimeType || blob?.type || "application/octet-stream");
  const extension = String(input.extension || inferExtension(mimeType, kind === MEDIA_KINDS.RECORDING ? "webm" : "png"));

  return {
    id: input.id || createId("media"),
    kind,
    title,
    titleLower: title.toLowerCase(),
    createdAt: input.createdAt || now,
    updatedAt: now,
    mimeType,
    extension,
    sizeBytes: safeNumber(input.sizeBytes, blob?.size || 0),
    width: safeNumber(input.width, null),
    height: safeNumber(input.height, null),
    durationMs: kind === MEDIA_KINDS.RECORDING ? safeNumber(input.durationMs, null) : null,
    folderId: input.folderId || DEFAULT_FOLDER_ID,
    tags,
    tagsLower: tags.map((tag) => tag.toLowerCase()),
    favourite: Boolean(input.favourite),
    sourceType,
    blob,
    thumbnailId: input.thumbnailId || null,
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      privacyLocalOnlyMode: true,
      thumbnailSize: safeNumber(settings.thumbnailSize, DEFAULT_SETTINGS.thumbnailSize)
    }
  };
}

async function rebuildTagStore(db) {
  const tx = db.transaction([STORE_MEDIA, STORE_TAGS], "readwrite");
  const mediaStore = tx.objectStore(STORE_MEDIA);
  const tagStore = tx.objectStore(STORE_TAGS);

  const records = await requestToPromise(mediaStore.getAll());
  const counts = new Map();

  records.forEach((record) => {
    const tags = Array.isArray(record.tags) ? record.tags : [];
    tags.forEach((tag) => {
      const name = String(tag || "").trim();
      if (!name) return;
      const lower = name.toLowerCase();
      if (!counts.has(lower)) {
        counts.set(lower, { id: createId("tag"), name, nameLower: lower, usageCount: 1 });
      } else {
        counts.get(lower).usageCount += 1;
      }
    });
  });

  tagStore.clear();
  counts.forEach((value) => {
    tagStore.put({
      ...value,
      updatedAt: nowIso()
    });
  });

  await waitForTx(tx);
}

export async function initRepository() {
  await getDb();
}

export async function getSettings() {
  const db = await getDb();
  const tx = db.transaction(STORE_SETTINGS, "readonly");
  const record = await requestToPromise(tx.objectStore(STORE_SETTINGS).get(SETTINGS_KEY));
  await waitForTx(tx);

  return {
    ...DEFAULT_SETTINGS,
    ...(record || {}),
    privacyLocalOnlyMode: true
  };
}

export async function updateSettings(updates = {}) {
  const db = await getDb();
  const tx = db.transaction(STORE_SETTINGS, "readwrite");
  const store = tx.objectStore(STORE_SETTINGS);
  const current = (await requestToPromise(store.get(SETTINGS_KEY))) || {
    id: SETTINGS_KEY,
    ...DEFAULT_SETTINGS,
    createdAt: nowIso()
  };

  const next = {
    ...current,
    ...updates,
    privacyLocalOnlyMode: true,
    updatedAt: nowIso()
  };

  store.put(next);
  await waitForTx(tx);
  return next;
}

export async function createFolder(name) {
  const folderName = normalizeFolderName(name);
  const db = await getDb();
  const tx = db.transaction(STORE_FOLDERS, "readwrite");
  const store = tx.objectStore(STORE_FOLDERS);

  const folder = {
    id: createId("folder"),
    name: folderName,
    nameLower: folderName.toLowerCase(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    isDefault: false
  };

  store.put(folder);
  await waitForTx(tx);
  return folder;
}

export async function listFolders() {
  const db = await getDb();
  const tx = db.transaction(STORE_FOLDERS, "readonly");
  const folders = await requestToPromise(tx.objectStore(STORE_FOLDERS).getAll());
  await waitForTx(tx);

  return folders
    .sort((a, b) => {
      if (a.id === DEFAULT_FOLDER_ID) return -1;
      if (b.id === DEFAULT_FOLDER_ID) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((folder) => ({ ...folder }));
}

export async function renameFolder(folderId, name) {
  const folderName = normalizeFolderName(name);
  const db = await getDb();
  const tx = db.transaction(STORE_FOLDERS, "readwrite");
  const store = tx.objectStore(STORE_FOLDERS);
  const existing = await requestToPromise(store.get(folderId));

  if (!existing) {
    throw new Error("Folder not found.");
  }

  if (existing.id === DEFAULT_FOLDER_ID) {
    throw new Error("Cannot rename the default folder.");
  }

  const next = {
    ...existing,
    name: folderName,
    nameLower: folderName.toLowerCase(),
    updatedAt: nowIso()
  };

  store.put(next);
  await waitForTx(tx);
  return next;
}

export async function deleteFolder(folderId) {
  if (folderId === DEFAULT_FOLDER_ID) {
    throw new Error("Cannot delete the default folder.");
  }

  const db = await getDb();
  const tx = db.transaction([STORE_FOLDERS, STORE_MEDIA], "readwrite");
  const folderStore = tx.objectStore(STORE_FOLDERS);
  const mediaStore = tx.objectStore(STORE_MEDIA);

  const folder = await requestToPromise(folderStore.get(folderId));
  if (!folder) {
    throw new Error("Folder not found.");
  }

  const index = mediaStore.index("by_folder");
  const items = await requestToPromise(index.getAll(folderId));
  items.forEach((item) => {
    mediaStore.put({
      ...item,
      folderId: DEFAULT_FOLDER_ID,
      updatedAt: nowIso()
    });
  });

  folderStore.delete(folderId);
  await waitForTx(tx);
}

export async function listTags() {
  const db = await getDb();
  const tx = db.transaction(STORE_TAGS, "readonly");
  const tags = await requestToPromise(tx.objectStore(STORE_TAGS).getAll());
  await waitForTx(tx);
  return tags.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveMedia(input = {}) {
  const blob = input.blob;
  if (!(blob instanceof Blob)) {
    throw new Error("saveMedia requires a Blob.");
  }

  const settings = await getSettings();
  const thumbnail = await buildThumbnail({
    blob,
    kind: input.kind,
    size: settings.thumbnailSize
  });

  const media = buildMediaRecord(input, blob, settings);

  if (thumbnail) {
    media.thumbnailId = input.thumbnailId || createId("thumb");
  }

  const db = await getDb();

  try {
    const tx = db.transaction([STORE_MEDIA, STORE_THUMBNAILS], "readwrite");
    const mediaStore = tx.objectStore(STORE_MEDIA);
    const thumbStore = tx.objectStore(STORE_THUMBNAILS);

    if (media.thumbnailId) {
      storageWriter.putThumbnail(thumbStore, {
        id: media.thumbnailId,
        mediaId: media.id,
        blob: thumbnail.blob,
        mimeType: thumbnail.mimeType,
        sizeBytes: thumbnail.sizeBytes,
        width: thumbnail.width,
        height: thumbnail.height,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    }

    storageWriter.putMedia(mediaStore, media);
    await waitForTx(tx);
  } catch (error) {
    if (isQuotaError(error)) {
      throw new StorageQuotaError(
        "Olho could not save this file in the local library because browser storage is full. Export it now to avoid loss.",
        { blob, media, cause: error }
      );
    }
    throw error;
  }

  await rebuildTagStore(db);

  return {
    ...readAsSummaries([media])[0],
    blob
  };
}

export async function getMedia(mediaId, { includeBlob = false } = {}) {
  const db = await getDb();
  const tx = db.transaction(STORE_MEDIA, "readonly");
  const record = await requestToPromise(tx.objectStore(STORE_MEDIA).get(mediaId));
  await waitForTx(tx);

  if (!record) return null;

  const summary = readAsSummaries([record])[0];
  if (includeBlob) {
    summary.blob = record.blob || null;
  }

  return summary;
}

export async function getMediaBlob(mediaId) {
  const db = await getDb();
  const tx = db.transaction(STORE_MEDIA, "readonly");
  const record = await requestToPromise(tx.objectStore(STORE_MEDIA).get(mediaId));
  await waitForTx(tx);
  return record?.blob || null;
}

export async function getThumbnailBlob(thumbnailId) {
  if (!thumbnailId) return null;
  const db = await getDb();
  const tx = db.transaction(STORE_THUMBNAILS, "readonly");
  const record = await requestToPromise(tx.objectStore(STORE_THUMBNAILS).get(thumbnailId));
  await waitForTx(tx);
  return record?.blob || null;
}

function readAsRecordingDraft(record) {
  if (!record) return null;

  return {
    id: record.id,
    kind: record.kind || MEDIA_KINDS.RECORDING,
    title: record.title || "Unsaved Recording Draft",
    folderId: record.folderId || DEFAULT_FOLDER_ID,
    tags: Array.isArray(record.tags) ? [...record.tags] : [],
    sourceType: normalizeSourceType(record.sourceType, SOURCE_TYPES.SCREEN_RECORDING),
    mimeType: record.mimeType || "video/webm",
    extension: record.extension || inferExtension(record.mimeType || "video/webm", "webm"),
    sizeBytes: safeNumber(record.sizeBytes, record.blob?.size || 0),
    width: safeNumber(record.width, null),
    height: safeNumber(record.height, null),
    durationMs: safeNumber(record.durationMs, null),
    metadata: record.metadata && typeof record.metadata === "object" ? { ...record.metadata } : {},
    createdAt: record.createdAt || nowIso(),
    updatedAt: record.updatedAt || nowIso(),
    blob: record.blob || null
  };
}

export async function saveRecordingDraft(input = {}) {
  const blob = input.blob;
  if (!(blob instanceof Blob)) {
    throw new Error("saveRecordingDraft requires a Blob.");
  }

  const now = nowIso();
  const draft = {
    id: input.id || createId("recdraft"),
    kind: MEDIA_KINDS.RECORDING,
    title: normalizeTitle(input.title, "Unsaved Recording Draft"),
    folderId: input.folderId || DEFAULT_FOLDER_ID,
    tags: normalizeTags(input.tags || []),
    sourceType: normalizeSourceType(input.sourceType, SOURCE_TYPES.SCREEN_RECORDING),
    mimeType: String(input.mimeType || blob.type || "video/webm"),
    extension: String(
      input.extension || inferExtension(input.mimeType || blob.type || "video/webm", "webm")
    ),
    sizeBytes: safeNumber(input.sizeBytes, blob.size),
    width: safeNumber(input.width, null),
    height: safeNumber(input.height, null),
    durationMs: safeNumber(input.durationMs, null),
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
    createdAt: input.createdAt || now,
    updatedAt: now,
    blob
  };

  const db = await getDb();
  try {
    const tx = db.transaction(STORE_RECORDING_DRAFTS, "readwrite");
    tx.objectStore(STORE_RECORDING_DRAFTS).put(draft);
    await waitForTx(tx);
  } catch (error) {
    if (isQuotaError(error)) {
      throw new StorageQuotaError(
        "Olho could not save this recording draft in local storage because browser quota is full.",
        {
          blob,
          media: {
            kind: MEDIA_KINDS.RECORDING,
            title: draft.title,
            mimeType: draft.mimeType,
            sizeBytes: draft.sizeBytes
          },
          cause: error
        }
      );
    }
    throw error;
  }

  return readAsRecordingDraft(draft);
}

export async function getRecordingDraft(draftId) {
  if (!draftId) return null;
  const db = await getDb();
  const tx = db.transaction(STORE_RECORDING_DRAFTS, "readonly");
  const record = await requestToPromise(tx.objectStore(STORE_RECORDING_DRAFTS).get(draftId));
  await waitForTx(tx);
  return readAsRecordingDraft(record);
}

export async function getLatestRecordingDraft() {
  const db = await getDb();
  const tx = db.transaction(STORE_RECORDING_DRAFTS, "readonly");
  const store = tx.objectStore(STORE_RECORDING_DRAFTS);
  const records = await requestToPromise(store.getAll());
  await waitForTx(tx);

  if (!records.length) return null;
  records.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return readAsRecordingDraft(records[0]);
}

export async function deleteRecordingDraft(draftId) {
  if (!draftId) {
    return { deleted: false, id: null };
  }

  const db = await getDb();
  const tx = db.transaction(STORE_RECORDING_DRAFTS, "readwrite");
  const store = tx.objectStore(STORE_RECORDING_DRAFTS);
  const existing = await requestToPromise(store.get(draftId));
  if (existing) {
    store.delete(draftId);
  }
  await waitForTx(tx);
  return { deleted: Boolean(existing), id: draftId };
}

export async function clearRecordingDrafts() {
  const db = await getDb();
  const tx = db.transaction(STORE_RECORDING_DRAFTS, "readwrite");
  tx.objectStore(STORE_RECORDING_DRAFTS).clear();
  await waitForTx(tx);
}

export async function updateMediaMetadata(mediaId, updates = {}) {
  const db = await getDb();
  const tx = db.transaction(STORE_MEDIA, "readwrite");
  const store = tx.objectStore(STORE_MEDIA);
  const current = await requestToPromise(store.get(mediaId));

  if (!current) {
    throw new Error("Media not found.");
  }

  const nextTags = updates.tags !== undefined ? normalizeTags(updates.tags) : current.tags;
  const nextTitle = updates.title !== undefined ? normalizeTitle(updates.title, current.title) : current.title;

  const next = {
    ...current,
    title: nextTitle,
    titleLower: nextTitle.toLowerCase(),
    tags: nextTags,
    tagsLower: nextTags.map((tag) => tag.toLowerCase()),
    folderId: updates.folderId ?? current.folderId,
    favourite: updates.favourite ?? current.favourite,
    sourceType: updates.sourceType ? normalizeSourceType(updates.sourceType, current.sourceType) : current.sourceType,
    width: updates.width !== undefined ? safeNumber(updates.width, null) : current.width,
    height: updates.height !== undefined ? safeNumber(updates.height, null) : current.height,
    durationMs: updates.durationMs !== undefined ? safeNumber(updates.durationMs, null) : current.durationMs,
    mimeType: updates.mimeType || current.mimeType,
    extension: updates.extension || current.extension,
    sizeBytes: updates.sizeBytes !== undefined ? safeNumber(updates.sizeBytes, current.sizeBytes) : current.sizeBytes,
    metadata: updates.metadata && typeof updates.metadata === "object"
      ? { ...current.metadata, ...updates.metadata, privacyLocalOnlyMode: true }
      : { ...current.metadata, privacyLocalOnlyMode: true },
    updatedAt: nowIso()
  };

  store.put(next);
  await waitForTx(tx);

  await rebuildTagStore(db);
  return readAsSummaries([next])[0];
}

export async function moveToTrash(mediaId, reason = "user") {
  const db = await getDb();
  const tx = db.transaction([STORE_MEDIA, STORE_THUMBNAILS, STORE_TRASH], "readwrite");
  const mediaStore = tx.objectStore(STORE_MEDIA);
  const thumbStore = tx.objectStore(STORE_THUMBNAILS);
  const trashStore = tx.objectStore(STORE_TRASH);

  const media = await requestToPromise(mediaStore.get(mediaId));
  if (!media) {
    throw new Error("Media not found.");
  }

  const thumbnail = media.thumbnailId
    ? await requestToPromise(thumbStore.get(media.thumbnailId))
    : null;

  const trashEntry = {
    id: createId("trash"),
    originalMediaId: media.id,
    deletedAt: nowIso(),
    reason,
    media,
    thumbnail: thumbnail || null
  };

  trashStore.put(trashEntry);
  mediaStore.delete(media.id);
  if (thumbnail?.id) {
    thumbStore.delete(thumbnail.id);
  }

  await waitForTx(tx);
  await rebuildTagStore(db);

  return {
    id: trashEntry.id,
    originalMediaId: trashEntry.originalMediaId,
    deletedAt: trashEntry.deletedAt
  };
}

export async function deleteMedia(mediaId) {
  return moveToTrash(mediaId, "deleteMedia");
}

async function getTrashEntryByIdOrMediaId(db, idOrMediaId) {
  const tx = db.transaction(STORE_TRASH, "readonly");
  const store = tx.objectStore(STORE_TRASH);

  let entry = await requestToPromise(store.get(idOrMediaId));
  if (!entry) {
    const index = store.index("by_original_media");
    entry = await requestToPromise(index.get(idOrMediaId));
  }

  await waitForTx(tx);
  return entry || null;
}

export async function restoreFromTrash(idOrMediaId) {
  const db = await getDb();
  const entry = await getTrashEntryByIdOrMediaId(db, idOrMediaId);
  if (!entry) {
    throw new Error("Trash item not found.");
  }

  const tx = db.transaction([STORE_MEDIA, STORE_THUMBNAILS, STORE_TRASH], "readwrite");
  const mediaStore = tx.objectStore(STORE_MEDIA);
  const thumbStore = tx.objectStore(STORE_THUMBNAILS);
  const trashStore = tx.objectStore(STORE_TRASH);

  const existing = await requestToPromise(mediaStore.get(entry.media.id));
  const restoredMedia = { ...entry.media };

  if (existing) {
    restoredMedia.id = createId("media");
    if (restoredMedia.thumbnailId) {
      restoredMedia.thumbnailId = createId("thumb");
    }
  }

  restoredMedia.updatedAt = nowIso();

  if (entry.thumbnail?.id && restoredMedia.thumbnailId) {
    thumbStore.put({
      ...entry.thumbnail,
      id: restoredMedia.thumbnailId,
      mediaId: restoredMedia.id,
      updatedAt: nowIso()
    });
  }

  mediaStore.put(restoredMedia);
  trashStore.delete(entry.id);

  await waitForTx(tx);
  await rebuildTagStore(db);

  return readAsSummaries([restoredMedia])[0];
}

export async function permanentlyDelete(idOrMediaId) {
  const db = await getDb();
  const tx = db.transaction([STORE_MEDIA, STORE_THUMBNAILS, STORE_TRASH], "readwrite");
  const mediaStore = tx.objectStore(STORE_MEDIA);
  const thumbStore = tx.objectStore(STORE_THUMBNAILS);
  const trashStore = tx.objectStore(STORE_TRASH);

  const media = await requestToPromise(mediaStore.get(idOrMediaId));
  if (media) {
    if (media.thumbnailId) {
      thumbStore.delete(media.thumbnailId);
    }
    mediaStore.delete(media.id);
    await waitForTx(tx);
    await rebuildTagStore(db);
    return { deletedMediaId: media.id, from: "media" };
  }

  const trashEntry = await requestToPromise(trashStore.get(idOrMediaId));
  if (trashEntry) {
    trashStore.delete(trashEntry.id);
    await waitForTx(tx);
    return { deletedMediaId: trashEntry.originalMediaId, from: "trash" };
  }

  const index = trashStore.index("by_original_media");
  const byMedia = await requestToPromise(index.get(idOrMediaId));
  if (byMedia) {
    trashStore.delete(byMedia.id);
    await waitForTx(tx);
    return { deletedMediaId: byMedia.originalMediaId, from: "trash" };
  }

  await waitForTx(tx);
  throw new Error("Media not found for permanent delete.");
}

function applyFilters(records, filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const folderId = String(filters.folderId || "").trim();
  const tag = String(filters.tag || "").trim().toLowerCase();
  const favourite = filters.favourite;
  const kind = filters.kind;

  let list = [...records];

  if (folderId) {
    list = list.filter((record) => record.folderId === folderId);
  }

  if (kind) {
    list = list.filter((record) => record.kind === kind);
  }

  if (tag) {
    list = list.filter((record) => (record.tagsLower || []).includes(tag));
  }

  if (favourite !== undefined) {
    list = list.filter((record) => Boolean(record.favourite) === Boolean(favourite));
  }

  if (query) {
    list = list.filter((record) => {
      if ((record.titleLower || "").includes(query)) return true;
      const tags = Array.isArray(record.tagsLower) ? record.tagsLower : [];
      if (tags.some((entry) => entry.includes(query))) return true;
      const sourceType = String(record.sourceType || "").toLowerCase();
      return sourceType.includes(query);
    });
  }

  const sort = String(filters.sort || "newest");
  list.sort((a, b) => {
    if (sort === "oldest") {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    if (sort === "title") {
      return String(a.title || "").localeCompare(String(b.title || ""));
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  if (filters.limit) {
    const limit = Math.max(1, Number(filters.limit));
    list = list.slice(0, limit);
  }

  return list;
}

async function listMediaRecords() {
  const db = await getDb();
  const tx = db.transaction(STORE_MEDIA, "readonly");
  const records = await requestToPromise(tx.objectStore(STORE_MEDIA).getAll());
  await waitForTx(tx);
  return records;
}

export async function searchMedia(filters = {}) {
  const records = await listMediaRecords();
  return readAsSummaries(applyFilters(records, filters));
}

export async function listByFolder(folderId, options = {}) {
  return searchMedia({ ...options, folderId });
}

export async function listRecent(limit = 20) {
  return searchMedia({ sort: "newest", limit });
}

export async function listFavourites(limit = 50) {
  return searchMedia({ favourite: true, sort: "newest", limit });
}

export async function listTrash(limit = 100) {
  const db = await getDb();
  const tx = db.transaction(STORE_TRASH, "readonly");
  const entries = await requestToPromise(tx.objectStore(STORE_TRASH).getAll());
  await waitForTx(tx);

  const sorted = entries.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  const sliced = sorted.slice(0, Math.max(1, Number(limit || 100)));
  return sliced.map((entry) => ({
    id: entry.id,
    originalMediaId: entry.originalMediaId,
    deletedAt: entry.deletedAt,
    reason: entry.reason,
    title: entry.media?.title || "Untitled"
  }));
}

export async function getStorageUsage() {
  const db = await getDb();
  const tx = db.transaction([STORE_MEDIA, STORE_THUMBNAILS, STORE_TRASH, STORE_RECORDING_DRAFTS], "readonly");

  const media = await requestToPromise(tx.objectStore(STORE_MEDIA).getAll());
  const thumbs = await requestToPromise(tx.objectStore(STORE_THUMBNAILS).getAll());
  const trash = await requestToPromise(tx.objectStore(STORE_TRASH).getAll());
  const drafts = await requestToPromise(tx.objectStore(STORE_RECORDING_DRAFTS).getAll());
  await waitForTx(tx);

  const mediaBytes = media.reduce((sum, entry) => sum + Number(entry.sizeBytes || entry.blob?.size || 0), 0);
  const thumbnailBytes = thumbs.reduce((sum, entry) => sum + Number(entry.sizeBytes || entry.blob?.size || 0), 0);
  const trashBytes = trash.reduce((sum, entry) => sum + Number(entry.media?.sizeBytes || entry.media?.blob?.size || 0), 0);
  const draftBytes = drafts.reduce((sum, entry) => sum + Number(entry.sizeBytes || entry.blob?.size || 0), 0);

  return {
    totalBytes: mediaBytes + thumbnailBytes + draftBytes,
    mediaBytes,
    thumbnailBytes,
    draftBytes,
    trashBytes,
    mediaCount: media.length,
    itemCount: media.length,
    imageCount: media.filter((entry) => entry.kind === MEDIA_KINDS.SCREENSHOT).length,
    videoCount: media.filter((entry) => entry.kind === MEDIA_KINDS.RECORDING).length,
    folderCount: (await listFolders()).length,
    tagCount: (await listTags()).length,
    trashCount: trash.length,
    recordingDraftCount: drafts.length
  };
}

export async function exportAllMetadata() {
  const db = await getDb();
  const tx = db.transaction(
    [STORE_MEDIA, STORE_FOLDERS, STORE_TAGS, STORE_SETTINGS, STORE_TRASH, STORE_RECORDING_DRAFTS],
    "readonly"
  );

  const media = await requestToPromise(tx.objectStore(STORE_MEDIA).getAll());
  const folders = await requestToPromise(tx.objectStore(STORE_FOLDERS).getAll());
  const tags = await requestToPromise(tx.objectStore(STORE_TAGS).getAll());
  const settings = await requestToPromise(tx.objectStore(STORE_SETTINGS).get(SETTINGS_KEY));
  const trash = await requestToPromise(tx.objectStore(STORE_TRASH).getAll());
  const recordingDrafts = await requestToPromise(tx.objectStore(STORE_RECORDING_DRAFTS).getAll());

  await waitForTx(tx);

  return {
    exportedAt: nowIso(),
    media: readAsSummaries(media),
    folders: folders.map((folder) => ({ ...folder })),
    tags: tags.map((tag) => ({ ...tag })),
    trash: trash.map((entry) => ({
      id: entry.id,
      originalMediaId: entry.originalMediaId,
      deletedAt: entry.deletedAt,
      reason: entry.reason,
      media: entry.media
        ? {
            id: entry.media.id,
            kind: entry.media.kind,
            title: entry.media.title,
            createdAt: entry.media.createdAt,
            updatedAt: entry.media.updatedAt,
            mimeType: entry.media.mimeType,
            extension: entry.media.extension,
            sizeBytes: entry.media.sizeBytes,
            folderId: entry.media.folderId,
            tags: entry.media.tags,
            favourite: entry.media.favourite,
            sourceType: entry.media.sourceType,
            metadata: entry.media.metadata
          }
        : null
    })),
    recordingDrafts: recordingDrafts.map((entry) => ({
      id: entry.id,
      title: entry.title,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      mimeType: entry.mimeType,
      extension: entry.extension,
      sizeBytes: entry.sizeBytes,
      width: entry.width,
      height: entry.height,
      durationMs: entry.durationMs,
      folderId: entry.folderId,
      tags: entry.tags,
      sourceType: entry.sourceType,
      metadata: entry.metadata && typeof entry.metadata === "object" ? { ...entry.metadata } : {}
    })),
    settings: {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
      privacyLocalOnlyMode: true
    }
  };
}

export async function clearAllData() {
  const db = await getDb();
  const tx = db.transaction(
    [STORE_MEDIA, STORE_THUMBNAILS, STORE_FOLDERS, STORE_TAGS, STORE_SETTINGS, STORE_TRASH, STORE_RECORDING_DRAFTS],
    "readwrite"
  );

  tx.objectStore(STORE_MEDIA).clear();
  tx.objectStore(STORE_THUMBNAILS).clear();
  tx.objectStore(STORE_TAGS).clear();
  tx.objectStore(STORE_TRASH).clear();
  tx.objectStore(STORE_RECORDING_DRAFTS).clear();
  tx.objectStore(STORE_FOLDERS).clear();
  tx.objectStore(STORE_SETTINGS).clear();

  await waitForTx(tx);
  await ensureDefaults(db);
}

export async function resetRepositoryForTesting() {
  try {
    const db = await dbPromise;
    db?.close();
  } catch {
    // ignore stale open failures
  }
  dbPromise = null;
  readyPromise = null;

  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export function setStorageWriterForTesting(writer) {
  storageWriter = {
    putMedia: writer?.putMedia || ((store, media) => store.put(media)),
    putThumbnail: writer?.putThumbnail || ((store, thumbnail) => store.put(thumbnail))
  };
}

export function resetStorageWriterForTesting() {
  storageWriter = {
    putMedia: (store, media) => store.put(media),
    putThumbnail: (store, thumbnail) => store.put(thumbnail)
  };
}
