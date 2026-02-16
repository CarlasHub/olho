import { STORE_BLOBS, STORE_FOLDERS, STORE_ITEMS } from "./models.js";

export const DB_VERSION = 1;

export function runMigrations(db, oldVersion) {
  if (oldVersion < 1) {
    const items = db.createObjectStore(STORE_ITEMS, { keyPath: "itemId" });
    items.createIndex("by_folder", "folderId", { unique: false });
    items.createIndex("by_type", "type", { unique: false });

    db.createObjectStore(STORE_BLOBS, { keyPath: "itemId" });

    const folders = db.createObjectStore(STORE_FOLDERS, { keyPath: "folderId" });
    folders.createIndex("by_name", "name", { unique: false });
  }
}
