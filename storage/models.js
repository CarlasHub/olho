export const DB_NAME = "snaplib";

export const STORE_ITEMS = "items";
export const STORE_BLOBS = "blobs";
export const STORE_FOLDERS = "folders";

export const ITEM_TYPES = Object.freeze({
  IMAGE: "image",
  VIDEO: "video"
});

export const DEFAULT_FOLDER_ID = "unsorted";
export const DEFAULT_FOLDER_NAME = "Unsorted";

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  return String(tags)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
