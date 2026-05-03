import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";

import {
  StorageQuotaError,
  createFolder,
  deleteRecordingDraft,
  getLatestRecordingDraft,
  setStorageWriterForTestingAdapter,
  getMedia,
  getMediaBlob,
  getStorageUsage,
  getThumbnailBlob,
  listTrash,
  migrateNowForTesting,
  moveItem,
  moveToTrash,
  permanentlyDelete,
  resetStorageForTesting,
  restoreFromTrash,
  saveMedia,
  saveRecordingDraft,
  searchMedia
} from "../src/storage/storage.js";

class MockOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this._ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textAlign: "left",
      fillRect() {},
      drawImage() {},
      beginPath() {},
      ellipse() {},
      stroke() {},
      arc() {},
      fill() {},
      fillText() {},
      createLinearGradient() {
        return {
          addColorStop() {}
        };
      }
    };
  }

  getContext(type) {
    if (type !== "2d") return null;
    return this._ctx;
  }

  async convertToBlob(options = {}) {
    return new Blob(["thumb"], { type: options.type || "image/webp" });
  }
}

function createStorageArea() {
  const data = Object.create(null);
  return {
    async get(keys) {
      if (keys == null) {
        return { ...data };
      }

      if (typeof keys === "string") {
        return { [keys]: data[keys] };
      }

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
    },

    _dump() {
      return { ...data };
    }
  };
}

globalThis.OffscreenCanvas = MockOffscreenCanvas;
if (!globalThis.chrome) {
  const local = createStorageArea();
  const session = createStorageArea();
  globalThis.chrome = {
    storage: {
      local,
      session
    }
  };
}

test.beforeEach(async () => {
  await resetStorageForTesting();
  setStorageWriterForTestingAdapter(null);
});

test("save screenshot Blob and reload it", async () => {
  const source = new Blob(["screenshot-bytes"], { type: "image/png" });
  const saved = await saveMedia({
    kind: "screenshot",
    blob: source,
    sourceType: "visible",
    metadata: {
      title: "Visual Test",
      tags: ["ui", "regression"]
    }
  });

  const loaded = await getMedia(saved.id, { includeBlob: true });

  assert.equal(loaded.kind, "screenshot");
  assert.equal(loaded.metadata.title, "Visual Test");
  assert.deepEqual(loaded.metadata.tags, ["ui", "regression"]);
  assert.ok(loaded.blob instanceof Blob);
  assert.equal(await loaded.blob.text(), "screenshot-bytes");
});

test("save recording Blob and reload it", async () => {
  const source = new Blob(["recording-bytes"], { type: "video/webm" });
  const saved = await saveMedia({
    kind: "recording",
    blob: source,
    sourceType: "tabRecording",
    metadata: {
      title: "Flow Clip",
      durationMs: 1234
    }
  });

  const blob = await getMediaBlob(saved.id);
  const loaded = await getMedia(saved.id, { includeBlob: true });

  assert.equal(loaded.kind, "recording");
  assert.equal(loaded.metadata.durationMs, 1234);
  assert.ok(blob instanceof Blob);
  assert.equal(await blob.text(), "recording-bytes");
});

test("save and restore latest recording draft", async () => {
  const saved = await saveRecordingDraft({
    blob: new Blob(["draft-bytes"], { type: "video/webm" }),
    title: "Draft Capture",
    folderId: "folder_default_eye",
    tags: ["draft", "resume"],
    sourceType: "screenRecording",
    durationMs: 2450,
    width: 1280,
    height: 720,
    metadata: {
      recordingMode: "screen"
    }
  });

  assert.ok(saved.id);
  assert.ok(saved.blob instanceof Blob);

  const latest = await getLatestRecordingDraft();
  assert.ok(latest);
  assert.equal(latest.id, saved.id);
  assert.equal(latest.metadata.title, "Draft Capture");
  assert.deepEqual(latest.metadata.tags, ["draft", "resume"]);
  assert.equal(await latest.blob.text(), "draft-bytes");

  await deleteRecordingDraft(saved.id);
  const missing = await getLatestRecordingDraft();
  assert.equal(missing, null);
});

test("generate screenshot thumbnail", async () => {
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["shot-thumb"], { type: "image/png" }),
    metadata: { title: "Thumb Test" }
  });

  assert.ok(saved.thumbnailId, "thumbnailId should be set");
  const thumb = await getThumbnailBlob(saved.thumbnailId);
  assert.ok(thumb instanceof Blob, "thumbnail blob should exist");
  assert.ok(thumb.size > 0, "thumbnail blob should not be empty");
});

test("generate recording poster thumbnail or fallback", async () => {
  const saved = await saveMedia({
    kind: "recording",
    blob: new Blob(["video-thumb"], { type: "video/webm" }),
    sourceType: "screenRecording",
    metadata: { title: "Video Thumb Test", durationMs: 1000 }
  });

  assert.ok(saved.thumbnailId, "recording thumbnailId should be set");
  const thumb = await getThumbnailBlob(saved.thumbnailId);
  assert.ok(thumb instanceof Blob, "recording thumbnail blob should exist");
  assert.ok(thumb.size > 0, "recording thumbnail blob should not be empty");
});

test("delete and restore item", async () => {
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["trash-me"], { type: "image/png" }),
    metadata: { title: "Trash Restore" }
  });

  await moveToTrash(saved.id);
  const afterDelete = await getMedia(saved.id, { includeBlob: true });
  assert.equal(afterDelete, null);

  const restored = await restoreFromTrash(saved.id);
  assert.ok(restored);
  assert.equal(restored.metadata.title, "Trash Restore");

  const loaded = await getMedia(restored.id, { includeBlob: true });
  assert.ok(loaded?.blob instanceof Blob);
  assert.equal(await loaded.blob.text(), "trash-me");
});

test("permanently delete item", async () => {
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["delete-forever"], { type: "image/png" }),
    metadata: { title: "Forever Gone" }
  });

  await moveToTrash(saved.id);
  await permanentlyDelete(saved.id);

  const missing = await getMedia(saved.id, { includeBlob: true });
  assert.equal(missing, null);

  const trash = await listTrash();
  assert.equal(trash.find((entry) => entry.originalMediaId === saved.id), undefined);
});

test("search by title", async () => {
  await saveMedia({
    kind: "screenshot",
    blob: new Blob(["a"], { type: "image/png" }),
    metadata: { title: "Login screen" }
  });
  await saveMedia({
    kind: "screenshot",
    blob: new Blob(["b"], { type: "image/png" }),
    metadata: { title: "Dashboard" }
  });

  const results = await searchMedia({ query: "login" });
  assert.equal(results.length, 1);
  assert.equal(results[0].metadata.title, "Login screen");
});

test("filter by tag", async () => {
  await saveMedia({
    kind: "screenshot",
    blob: new Blob(["tagged"], { type: "image/png" }),
    metadata: { title: "Bug capture", tags: ["bug", "urgent"] }
  });
  await saveMedia({
    kind: "screenshot",
    blob: new Blob(["other"], { type: "image/png" }),
    metadata: { title: "Feature note", tags: ["feature"] }
  });

  const results = await searchMedia({ tag: "bug" });
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].metadata.tags, ["bug", "urgent"]);
});

test("move between folders", async () => {
  const folder = await createFolder("Regression");
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["move"], { type: "image/png" }),
    metadata: { title: "Move Test" }
  });

  await moveItem(saved.id, folder.id);
  const loaded = await getMedia(saved.id);
  assert.equal(loaded.folderId, folder.id);
});

test("simulate quota error and verify fallback", async () => {
  setStorageWriterForTestingAdapter({
    putMedia(store, value) {
      if (value && value.id === "quota-trigger-media") {
        const error = typeof DOMException === "function"
          ? new DOMException("Quota reached", "QuotaExceededError")
          : Object.assign(new Error("Quota reached"), { name: "QuotaExceededError" });
        throw error;
      }
      return store.put(value);
    },
    putThumbnail(store, value) {
      return store.put(value);
    }
  });

  try {
    await assert.rejects(
      () =>
        saveMedia({
          id: "quota-trigger-media",
          kind: "screenshot",
          blob: new Blob(["quota-data"], { type: "image/png" }),
          metadata: { title: "Quota Case" }
        }),
      (error) => {
        assert.ok(error instanceof StorageQuotaError);
        assert.ok(error.blob instanceof Blob);
        assert.match(error.message, /storage is full|local library/i);
        return true;
      }
    );
  } finally {
    setStorageWriterForTestingAdapter(null);
  }
});

test("verify no large data is stored in chrome.storage.local", async () => {
  const largeBlob = new Blob(["x".repeat(2_000_000)], { type: "image/png" });
  await saveMedia({
    kind: "screenshot",
    blob: largeBlob,
    metadata: { title: "Large Blob" }
  });

  const usage = await getStorageUsage();
  assert.ok(usage.totalBytes >= largeBlob.size);

  const localData = chrome.storage.local._dump();
  const serialized = JSON.stringify(localData);

  assert.equal(serialized.includes("data:image"), false, "chrome.storage.local must not contain data URLs");
  assert.ok(serialized.length < 50_000, "chrome.storage.local should only hold lightweight metadata/settings");
});

test("legacy migration rejects http and https blob URLs without network fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called for remote legacy URLs");
  };

  try {
    await chrome.storage.local.set({
      snaplib_storage: {
        folders: [],
        items: [
          { id: "legacy-http", type: "image", blobUrl: "http://example.com/remote.png", metadata: { title: "HTTP Remote" } },
          { id: "legacy-https", type: "image", blobUrl: "https://example.com/remote.png", metadata: { title: "HTTPS Remote" } }
        ]
      }
    });

    await migrateNowForTesting();

    assert.equal(fetchCalls, 0, "migration must not fetch remote legacy URLs");
    const httpResults = await searchMedia({ query: "HTTP Remote" });
    const httpsResults = await searchMedia({ query: "HTTPS Remote" });
    assert.equal(httpResults.length, 0);
    assert.equal(httpsResults.length, 0);

    const report = chrome.storage.local._dump().olho_media_repo_migration_v2;
    assert.ok(report, "migration report should be written");
    assert.ok(
      report.brokenLegacyItems.some(
        (entry) => entry.legacyId === "legacy-http" && /unsupported legacy blob url/i.test(String(entry.reason || ""))
      )
    );
    assert.ok(
      report.brokenLegacyItems.some(
        (entry) => entry.legacyId === "legacy-https" && /unsupported legacy blob url/i.test(String(entry.reason || ""))
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy migration accepts safe local data URLs", async () => {
  const dataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+4QYAAAAASUVORK5CYII=";

  await chrome.storage.local.set({
    snaplib_storage: {
      folders: [],
      items: [
        {
          id: "legacy-data-url",
          type: "image",
          dataUrl,
          metadata: {
            title: "Legacy Data URL"
          }
        }
      ]
    }
  });

  await migrateNowForTesting();

  const migrated = await getMedia("legacy_local_legacy-data-url", { includeBlob: true });
  assert.ok(migrated, "expected migrated item");
  assert.ok(migrated.blob instanceof Blob, "migrated item should include blob");
  assert.equal(migrated.blob.type, "image/png");
  assert.ok(migrated.blob.size > 0);
});

test("legacy migration handles invalid legacy values without crashing", async () => {
  const validDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+4QYAAAAASUVORK5CYII=";

  await chrome.storage.local.set({
    snaplib_storage: {
      folders: [],
      items: [
        { id: "legacy-invalid-data", type: "image", dataUrl: "not-a-data-url", metadata: { title: "Broken Data URL" } },
        { id: "legacy-invalid-blob", type: "image", blobUrl: "blob:https://example.com/abc", metadata: { title: "Broken Blob URL" } },
        { id: "legacy-valid-data", type: "image", dataUrl: validDataUrl, metadata: { title: "Recovered Data URL" } }
      ]
    }
  });

  await assert.doesNotReject(() => migrateNowForTesting());

  const recovered = await searchMedia({ query: "Recovered Data URL" });
  assert.equal(recovered.length, 1, "valid local data URL should still migrate");

  const report = chrome.storage.local._dump().olho_media_repo_migration_v2;
  assert.ok(report, "migration report should exist");
  assert.ok(
    report.brokenLegacyItems.some((entry) => entry.legacyId === "legacy-invalid-data"),
    "invalid data URL should be marked as broken legacy data"
  );
  assert.ok(
    report.brokenLegacyItems.some((entry) => entry.legacyId === "legacy-invalid-blob"),
    "invalid blob URL should be marked as broken legacy data"
  );
});
