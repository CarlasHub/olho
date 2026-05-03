import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import "fake-indexeddb/auto";

import {
  clearAllData,
  getMedia,
  listTrash,
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

if (!globalThis.chrome) {
  const localData = Object.create(null);
  const sessionData = Object.create(null);
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return { ...localData };
          if (typeof keys === "string") return { [keys]: localData[keys] };
          if (Array.isArray(keys)) {
            const output = {};
            keys.forEach((key) => {
              output[key] = localData[key];
            });
            return output;
          }
          if (typeof keys === "object") {
            const output = {};
            Object.entries(keys).forEach(([key, fallback]) => {
              output[key] = Object.prototype.hasOwnProperty.call(localData, key) ? localData[key] : fallback;
            });
            return output;
          }
          return {};
        },
        async set(payload) {
          Object.assign(localData, payload || {});
        },
        async remove(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((key) => {
            delete localData[key];
          });
        },
        async clear() {
          Object.keys(localData).forEach((key) => {
            delete localData[key];
          });
        }
      },
      session: {
        async get(keys) {
          if (keys == null) return { ...sessionData };
          if (typeof keys === "string") return { [keys]: sessionData[keys] };
          return {};
        },
        async set(payload) {
          Object.assign(sessionData, payload || {});
        },
        async remove(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((key) => {
            delete sessionData[key];
          });
        },
        async clear() {
          Object.keys(sessionData).forEach((key) => {
            delete sessionData[key];
          });
        }
      }
    }
  };
}

test.beforeEach(async () => {
  await resetStorageForTesting();
});

test("mocked integration smoke: build and package produce a loadable zip", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, `build failed: ${build.stderr || build.stdout}`);

  const manifestPath = path.join(root, "dist", "build", "manifest.json");
  await fs.access(manifestPath);

  const pack = spawnSync(process.execPath, ["scripts/package.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(pack.status, 0, `package failed: ${pack.stderr || pack.stdout}`);

  const zipPath = path.join(root, "dist", "olho-extension.zip");
  await fs.access(zipPath);

  const list = spawnSync("unzip", ["-l", zipPath], { encoding: "utf8" });
  assert.equal(list.status, 0, `unzip listing failed: ${list.stderr || list.stdout}`);
  assert.match(list.stdout, /\smanifest\.json\s*$/m);
});

test("mocked integration smoke: local workflow data-path checks", async () => {
  const screenshot = await saveMedia({
    kind: "screenshot",
    sourceType: "visible",
    blob: new Blob(["e2e-image"], { type: "image/png" }),
    metadata: {
      title: "E2E Capture View",
      tags: ["smoke"],
      width: 320,
      height: 180
    }
  });

  const loadedScreenshot = await getMedia(screenshot.id, { includeBlob: true });
  assert.ok(loadedScreenshot?.blob instanceof Blob);
  assert.equal(await loadedScreenshot.blob.text(), "e2e-image");

  await updateMediaMetadata(screenshot.id, {
    metadata: {
      annotations: [{ tool: "rect", bounds: { x: 2, y: 2, width: 50, height: 20 } }],
      lastExportFormats: ["png", "pdf"]
    }
  });

  const editorSource = await fs.readFile(path.join(root, "editor.js"), "utf8");
  assert.equal(editorSource.includes("exportImageBlob(format"), true);
  assert.equal(editorSource.includes('if (format === \"pdf\")'), true);

  const recording = await saveMedia({
    kind: "recording",
    sourceType: "screenRecording",
    blob: new Blob(["e2e-video"], { type: "video/webm" }),
    metadata: {
      title: "E2E Record View",
      durationMs: 2400
    }
  });

  const allItems = await searchMedia({ sort: "newest" });
  assert.equal(allItems.length, 2);

  await moveToTrash(screenshot.id);
  const trash = await listTrash();
  assert.ok(trash.some((entry) => entry.originalMediaId === screenshot.id));

  await restoreFromTrash(screenshot.id);
  const restored = await getMedia(screenshot.id);
  assert.ok(restored);

  await moveToTrash(recording.id);
  const trashAfterRecording = await listTrash();
  assert.ok(trashAfterRecording.length >= 1);

  await clearAllData();
  const afterClear = await searchMedia({ sort: "newest" });
  assert.equal(afterClear.length, 0);
});
