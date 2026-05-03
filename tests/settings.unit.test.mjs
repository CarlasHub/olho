import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";

import { getAppSettings, resetStorageForTesting, updateAppSettings } from "../src/storage/storage.js";

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

test("default app settings are local-first", async () => {
  const settings = await getAppSettings();
  assert.equal(settings.defaultSaveLocation, "local_library");
  assert.equal(settings.privacyLocalOnlyMode, true);
  assert.equal(settings.askBeforeDeleting, true);
  assert.equal(settings.defaultAfterCaptureAction, "editor");
  assert.equal(settings.skipEditorMode, "never");
  assert.equal(settings.captureDelaySeconds, 0);
});

test("privacy local-only mode cannot be disabled", async () => {
  const saved = await updateAppSettings({
    privacyLocalOnlyMode: false,
    defaultSaveLocation: "downloads"
  });

  assert.equal(saved.privacyLocalOnlyMode, true);
  assert.equal(saved.defaultSaveLocation, "local_library");
});

test("share setting updates persist locally", async () => {
  const saved = await updateAppSettings({
    shareSettings: {
      jiraUrl: "https://jira.example.local",
      githubIssueUrl: "https://github.com/example/repo/issues/new",
      shareNotes: "Local only"
    }
  });

  assert.equal(saved.shareSettings.jiraUrl, "https://jira.example.local");
  assert.equal(saved.shareSettings.githubIssueUrl, "https://github.com/example/repo/issues/new");
  assert.equal(saved.shareSettings.shareNotes, "Local only");

  const reloaded = await getAppSettings();
  assert.equal(reloaded.shareSettings.jiraUrl, "https://jira.example.local");
  assert.equal(reloaded.shareSettings.githubIssueUrl, "https://github.com/example/repo/issues/new");
});

test("capture preference updates persist locally", async () => {
  const saved = await updateAppSettings({
    defaultAfterCaptureAction: "download",
    skipEditorMode: "fullPageOnly",
    captureDelaySeconds: 5,
    autoDownload: true
  });

  assert.equal(saved.defaultAfterCaptureAction, "download");
  assert.equal(saved.skipEditorMode, "fullPageOnly");
  assert.equal(saved.captureDelaySeconds, 5);
  assert.equal(saved.autoDownload, true);

  const reloaded = await getAppSettings();
  assert.equal(reloaded.defaultAfterCaptureAction, "download");
  assert.equal(reloaded.skipEditorMode, "fullPageOnly");
  assert.equal(reloaded.captureDelaySeconds, 5);
  assert.equal(reloaded.autoDownload, true);
});
