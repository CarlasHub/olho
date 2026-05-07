import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "fake-indexeddb/auto";

import {
  createFolder,
  getMedia,
  listFolders,
  listItems,
  listTrash,
  moveItem,
  moveToTrash,
  resetStorageForTesting,
  restoreFromTrash,
  saveMedia,
  searchMedia,
  updateMediaMetadata
} from "../src/storage/storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function createStorageArea() {
  const data = Object.create(null);
  return {
    async get(keys) {
      if (keys == null) return { ...data };
      if (typeof keys === "string") return { [keys]: data[keys] };
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((key) => {
          out[key] = data[key];
        });
        return out;
      }
      if (typeof keys === "object") {
        const out = {};
        Object.entries(keys).forEach(([key, fallback]) => {
          out[key] = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
        });
        return out;
      }
      return {};
    },
    async set(values) {
      Object.entries(values || {}).forEach(([key, value]) => {
        data[key] = value;
      });
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => {
        delete data[key];
      });
    },
    async clear() {
      Object.keys(data).forEach((key) => delete data[key]);
    }
  };
}

if (!globalThis.chrome) {
  globalThis.chrome = {
    storage: {
      local: createStorageArea(),
      session: createStorageArea()
    }
  };
}

async function read(relPath) {
  return fs.readFile(path.join(root, relPath), "utf8");
}

test.beforeEach(async () => {
  await resetStorageForTesting();
});

test("1. loads media from IndexedDB", async () => {
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["gallery-load"], { type: "image/png" }),
    metadata: { title: "Gallery Load" }
  });

  const all = await listItems();
  assert.equal(all.some((item) => item.id === saved.id), true);
});

test("2. search works", async () => {
  await saveMedia({
    kind: "screenshot",
    blob: new Blob(["a"], { type: "image/png" }),
    metadata: { title: "Eye login page" }
  });
  await saveMedia({
    kind: "screenshot",
    blob: new Blob(["b"], { type: "image/png" }),
    metadata: { title: "Capture dashboard" }
  });

  const results = await searchMedia({ query: "login" });
  assert.equal(results.length, 1);
  assert.equal(results[0].metadata.title, "Eye login page");
});

test("3. folder creation works", async () => {
  const folder = await createFolder("Evidence");
  assert.ok(folder.id);
  const folders = await listFolders();
  assert.equal(folders.some((entry) => entry.id === folder.id && entry.name === "Evidence"), true);
});

test("4. move item to folder", async () => {
  const folder = await createFolder("Incidents");
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["move"], { type: "image/png" }),
    metadata: { title: "Move Me" }
  });

  await moveItem(saved.id, folder.id);
  const moved = await getMedia(saved.id);
  assert.equal(moved.folderId, folder.id);
});

test("5. tags work", async () => {
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["tag"], { type: "image/png" }),
    metadata: { title: "Tagged" }
  });

  await updateMediaMetadata(saved.id, { tags: ["bug", "olho"] });
  const results = await searchMedia({ tag: "bug" });
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].metadata.tags, ["bug", "olho"]);
});

test("6. favourite works", async () => {
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["fav"], { type: "image/png" }),
    metadata: { title: "Starred" }
  });

  await updateMediaMetadata(saved.id, { favourite: true });
  const results = await searchMedia({ favourite: true });
  assert.equal(results.some((item) => item.id === saved.id), true);
});

test("7. delete and restore works", async () => {
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["trash"], { type: "image/png" }),
    metadata: { title: "Trash Me" }
  });

  await moveToTrash(saved.id);
  const trash = await listTrash();
  assert.equal(trash.some((entry) => entry.originalMediaId === saved.id), true);

  await restoreFromTrash(saved.id);
  const restored = await getMedia(saved.id);
  assert.ok(restored);
});

test("8. bulk selection controls are present", async () => {
  const html = await read("gallery.html");
  const js = await read("gallery.js");

  assert.equal(html.includes('id="selectAllToggle"'), true);
  assert.equal(html.includes('id="selectionCount"'), true);
  assert.equal(js.includes("selectAllToggle.addEventListener"), true);
  assert.equal(js.includes("visibleMediaIds().forEach"), true);
});

test("9. download action is wired", async () => {
  const html = await read("gallery.html");
  const js = await read("gallery.js");

  assert.equal(html.includes("Export ZIP"), true);
  assert.equal(js.includes("async function downloadItem"), true);
  assert.equal(js.includes("chrome.downloads.download"), true);
});

test("10. ZIP export is wired", async () => {
  const html = await read("gallery.html");
  const js = await read("gallery.js");

  assert.equal(html.includes('id="bulkZipBtn"'), true);
  assert.equal(html.includes('id="openExportReportBtn"'), false);
  assert.equal(html.includes('data-view="exports"'), false);
  assert.equal(js.includes("async function createZipBlob"), true);
  assert.equal(js.includes("downloadItemsAsZip"), true);
});

test("11. delete all local data requires typed confirmation", async () => {
  const html = await read("gallery.html");
  const js = await read("gallery.js");

  assert.equal(html.includes('id="deleteAllBtn"'), true);
  assert.equal(js.includes("DELETE LOCAL DATA"), true);
  assert.equal(js.includes("async function handleDeleteAllData"), true);
  assert.equal(js.includes("openInputDialog"), true);
});

test("12. keyboard navigation is wired", async () => {
  const js = await read("gallery.js");
  const cardView = await read("src/gallery/card-view.js");

  assert.equal(js.includes("createGalleryCardView"), true);
  assert.equal(cardView.includes("function onCardKeydown"), true);
  assert.equal(cardView.includes('event.key === "ArrowRight"'), true);
  assert.equal(cardView.includes('event.key === "ArrowLeft"'), true);
  assert.equal(cardView.includes('event.key === "ArrowDown"'), true);
  assert.equal(cardView.includes('event.key === "ArrowUp"'), true);
  assert.equal(cardView.includes('event.key === "Enter"'), true);
  assert.equal(cardView.includes('event.key === " "'), true);
});

test("13. memory includes imports and edited image views", async () => {
  const html = await read("gallery.html");
  const js = await read("gallery.js");

  assert.equal(html.includes('data-view="imports"'), true);
  assert.equal(html.includes('data-view="edited"'), true);
  assert.equal(js.includes('"imports"'), true);
  assert.equal(js.includes('"edited"'), true);
  assert.equal(js.includes("function isImportedItem"), true);
  assert.equal(js.includes("function isEditedImage"), true);
});

test("14. inspector actions are wired for selected items", async () => {
  const html = await read("gallery.html");
  const js = await read("gallery.js");

  assert.equal(html.includes('id="inspectorOpenBtn"'), true);
  assert.equal(html.includes('id="inspectorRenameBtn"'), true);
  assert.equal(html.includes('id="inspectorFavouriteBtn"'), true);
  assert.equal(html.includes('id="inspectorTagsBtn"'), true);
  assert.equal(html.includes('id="inspectorMoveBtn"'), true);
  assert.equal(html.includes('id="inspectorDeleteBtn"'), true);
  assert.equal(html.includes('id="inspectorRestoreBtn"'), true);
  assert.equal(html.includes('id="inspectorPermanentDeleteBtn"'), true);
  assert.equal(js.includes("inspectorOpenBtn?.addEventListener"), true);
  assert.equal(js.includes("inspectorRenameBtn?.addEventListener"), true);
  assert.equal(js.includes("inspectorFavouriteBtn?.addEventListener"), true);
  assert.equal(js.includes("inspectorTagsBtn?.addEventListener"), true);
  assert.equal(js.includes("inspectorMoveBtn?.addEventListener"), true);
  assert.equal(js.includes("inspectorDeleteBtn?.addEventListener"), true);
  assert.equal(js.includes("inspectorRestoreBtn?.addEventListener"), true);
  assert.equal(js.includes("inspectorPermanentDeleteBtn?.addEventListener"), true);
});

test("15. media cards default actions remain Open + More, with delete contextual", async () => {
  const cardView = await read("src/gallery/card-view.js");

  assert.equal(cardView.includes('actions.append(createContextButton("Open", () => openMediaItem(item)));'), true);
  assert.equal(cardView.includes('summary.textContent = "More";'), true);
  assert.equal(cardView.includes('actions.append(createContextButton("Delete", () => moveItemToOutOfSight(item, summary), "danger"));'), false);
  assert.equal(cardView.includes('createContextButton("Move Out of Sight", () => moveItemToOutOfSight(item, summary), "danger")'), true);
});

test("offscreen thumbnail pipeline is wired", async () => {
  const manifest = JSON.parse(await read("manifest.json"));
  const worker = await read("service_worker.js");
  const db = await read("storage/db.js");
  const offscreen = await read("offscreen.js");

  assert.equal(Array.isArray(manifest.permissions), true);
  assert.equal(manifest.permissions.includes("offscreen"), true);
  assert.equal(worker.includes("generate_video_thumbnail"), true);
  assert.equal(worker.includes("offscreen_thumbnail_generate"), true);
  assert.equal(worker.includes("chrome.offscreen.createDocument"), true);
  assert.equal(db.includes("generate_video_thumbnail"), true);
  assert.equal(db.includes("sendRuntimeMessage"), true);
  assert.equal(offscreen.includes("offscreen_thumbnail_generate"), true);
  assert.equal(offscreen.includes("generateVideoThumbnail"), true);
});
