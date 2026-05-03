import {
  STORE_MEDIA,
  STORE_THUMBNAILS,
  STORE_FOLDERS,
  STORE_TAGS,
  STORE_SETTINGS,
  STORE_TRASH,
  STORE_RECORDING_DRAFTS
} from "./models.js";

export const DB_VERSION = 2;

function ensureStore(db, name, options) {
  if (db.objectStoreNames.contains(name)) {
    return null;
  }
  return db.createObjectStore(name, options);
}

function ensureIndex(store, name, keyPath, options) {
  if (!store || store.indexNames.contains(name)) {
    return;
  }
  store.createIndex(name, keyPath, options);
}

export function runMigrations(db) {
  const media = ensureStore(db, STORE_MEDIA, { keyPath: "id" });
  ensureIndex(media, "by_kind", "kind", { unique: false });
  ensureIndex(media, "by_folder", "folderId", { unique: false });
  ensureIndex(media, "by_created", "createdAt", { unique: false });
  ensureIndex(media, "by_updated", "updatedAt", { unique: false });
  ensureIndex(media, "by_favourite", "favourite", { unique: false });
  ensureIndex(media, "by_source_type", "sourceType", { unique: false });
  ensureIndex(media, "by_title_lower", "titleLower", { unique: false });
  ensureIndex(media, "by_tags_lower", "tagsLower", { unique: false, multiEntry: true });
  ensureIndex(media, "by_thumbnail", "thumbnailId", { unique: false });

  const thumbs = ensureStore(db, STORE_THUMBNAILS, { keyPath: "id" });
  ensureIndex(thumbs, "by_media", "mediaId", { unique: true });

  const folders = ensureStore(db, STORE_FOLDERS, { keyPath: "id" });
  ensureIndex(folders, "by_name_lower", "nameLower", { unique: false });

  const tags = ensureStore(db, STORE_TAGS, { keyPath: "id" });
  ensureIndex(tags, "by_name_lower", "nameLower", { unique: true });

  ensureStore(db, STORE_SETTINGS, { keyPath: "id" });

  const trash = ensureStore(db, STORE_TRASH, { keyPath: "id" });
  ensureIndex(trash, "by_deleted_at", "deletedAt", { unique: false });
  ensureIndex(trash, "by_original_media", "originalMediaId", { unique: false });

  const recordingDrafts = ensureStore(db, STORE_RECORDING_DRAFTS, { keyPath: "id" });
  ensureIndex(recordingDrafts, "by_updated_at", "updatedAt", { unique: false });
  ensureIndex(recordingDrafts, "by_created_at", "createdAt", { unique: false });
}
