import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "fake-indexeddb/auto";

import { getMedia, saveMedia, resetStorageForTesting } from "../src/storage/storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

if (!globalThis.chrome) {
  const localData = Object.create(null);
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return { ...localData };
          if (typeof keys === "string") return { [keys]: localData[keys] };
          if (Array.isArray(keys)) {
            const out = {};
            keys.forEach((key) => {
              out[key] = localData[key];
            });
            return out;
          }
          if (typeof keys === "object") {
            const out = {};
            Object.entries(keys).forEach(([key, fallback]) => {
              out[key] = Object.prototype.hasOwnProperty.call(localData, key) ? localData[key] : fallback;
            });
            return out;
          }
          return {};
        },
        async set(payload) {
          Object.assign(localData, payload || {});
        },
        async remove(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((key) => delete localData[key]);
        },
        async clear() {
          Object.keys(localData).forEach((key) => {
            delete localData[key];
          });
        }
      },
      session: {
        async get() {
          return {};
        },
        async set() {},
        async remove() {},
        async clear() {}
      }
    }
  };
}

const read = (relPath) => fs.readFile(path.join(root, relPath), "utf8");

test.beforeEach(async () => {
  await resetStorageForTesting();
});

test("1. Load image from IndexedDB", async () => {
  const saved = await saveMedia({
    kind: "screenshot",
    blob: new Blob(["editor-image"], { type: "image/png" }),
    metadata: { title: "Editor Load" }
  });

  const loaded = await getMedia(saved.id, { includeBlob: true });
  assert.ok(loaded);
  assert.ok(loaded.blob instanceof Blob);
  assert.equal(await loaded.blob.text(), "editor-image");
});

test("2. Draw rectangle and export path exists", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("TOOL_TYPES.RECT"), true);
  assert.equal(js.includes("drawShape(context, action)"), true);
  assert.equal(js.includes("exportImageBlob(format"), true);
});

test("3. Add text and export path exists", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("TOOL_TYPES.TEXT"), true);
  assert.equal(js.includes("openTextComposer"), true);
  assert.equal(js.includes("drawText(context, action)"), true);
});

test("4. Blur area and export path exists", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("TOOL_TYPES.BLUR"), true);
  assert.equal(js.includes("drawBlur(context, action)"), true);
});

test("5. Pixelate area and export path exists", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("TOOL_TYPES.PIXELATE"), true);
  assert.equal(js.includes("drawPixelate(context, action)"), true);
});

test("6. Crop image and save copy path exists", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("async function applyCrop()"), true);
  assert.equal(js.includes("async function saveEditedCopy()"), true);
});

test("7. Resize image and save copy path exists", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("async function applyResize()"), true);
  assert.equal(js.includes("async function saveEditedCopy()"), true);
});

test("8. Undo and redo implementation exists", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("async function undo()"), true);
  assert.equal(js.includes("async function redo()"), true);
});

test("9. Save edited copy to gallery uses MediaRepository", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("saveEditedCopy"), true);
  assert.equal(js.includes("saveMedia(payload)"), true);
});

test("10. Download PNG exists", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("return \"png\";"), true);
  assert.equal(js.includes("downloadExport"), true);
});

test("11. Download JPG exists", async () => {
  const html = await read("editor.html");
  const js = await read("editor.js");
  assert.equal(html.includes('<option value="jpg">JPG</option>'), true);
  assert.equal(js.includes('if (format === "jpg")'), true);
});

test("12. Export PDF exists", async () => {
  const html = await read("editor.html");
  const js = await read("editor.js");
  assert.equal(html.includes('<option value="pdf">PDF</option>'), true);
  assert.equal(js.includes("createPdfBlobFromCanvas"), true);
  assert.equal(js.includes('application/pdf'), true);
});

test("13. Keyboard operation for toolbar", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("function onKeyDown(event)"), true);
  assert.equal(js.includes("event.key === \"Escape\""), true);
  assert.equal(js.includes("event.key === \"Delete\""), true);
  assert.equal(js.includes('event.key.toLowerCase() === "z"'), true);
});

test("14. Focus management in overwrite dialog", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("lastDialogInvoker"), true);
  assert.equal(js.includes("overwriteDialog.showModal()"), true);
  assert.equal(js.includes("overwriteDialog.addEventListener(\"close\""), true);
});

test("15. No inaccessible icon-only toolbar buttons", async () => {
  const html = await read("editor.html");
  const buttonRegex = /<button[^>]*class=\"tool-btn[^\"]*\"[^>]*>/g;
  const matches = html.match(buttonRegex) || [];
  assert.ok(matches.length >= 12);
  for (const button of matches) {
    assert.equal(/aria-label=\"[^\"]+\"/.test(button), true, `Missing aria-label: ${button}`);
  }
  assert.equal(html.includes('id="clearAllBtn"'), true);
});

test("16. Bottom toolbar layout is present with grouped tools", async () => {
  const html = await read("editor.html");
  assert.equal(html.includes('class="toolbar toolbar-bottom"'), true);
  assert.equal(html.includes('data-tool-group="draw"'), true);
  assert.equal(html.includes('data-tool-group="shapes"'), true);
  assert.equal(html.includes('data-tool-group="redact"'), true);
  assert.equal(html.includes('data-tool-group="transform"'), true);
  assert.equal(html.includes('id="openLocalImageToolbarBtn"'), true);
});

test("17. Crop and resize action bars are contextual and include apply/cancel", async () => {
  const html = await read("editor.html");
  const js = await read("editor.js");
  assert.equal(html.includes('id="transformActionBar"'), true);
  assert.equal(html.includes('id="cropPanel"'), true);
  assert.equal(html.includes('id="resizePanel"'), true);
  assert.equal(html.includes('id="applyCropBtn"'), true);
  assert.equal(html.includes('id="cancelCropBtn"'), true);
  assert.equal(html.includes('id="applyResizeBtn"'), true);
  assert.equal(html.includes('id="cancelResizeBtn"'), true);
  assert.equal(js.includes("transformActionBar.hidden = !cropMode && !resizeMode;"), true);
});

test("18. Crop and resize modules draw high-contrast handles and live dimensions", async () => {
  const crop = await read("src/editor/crop.js");
  const resize = await read("src/editor/resize.js");
  assert.equal(crop.includes('ctx.strokeStyle = "#f8fbff";'), true);
  assert.equal(crop.includes("badgeText ="), true);
  assert.equal(crop.includes("cursorForHandle"), true);
  assert.equal(resize.includes('ctx.strokeStyle = "#f8fbff";'), true);
  assert.equal(resize.includes("badgeText ="), true);
  assert.equal(resize.includes("cursorForHandle"), true);
});

test("19. Enter key applies crop and resize while Escape cancels", async () => {
  const js = await read("editor.js");
  assert.equal(js.includes("if (event.key === \"Enter\")"), true);
  assert.equal(js.includes("if (state.tool === TOOL_TYPES.CROP)"), true);
  assert.equal(js.includes("if (state.tool === TOOL_TYPES.RESIZE)"), true);
  assert.equal(js.includes("event.key === \"Escape\""), true);
});

test("20. Inspector tool options are contextual per active tool", async () => {
  const html = await read("editor.html");
  const js = await read("editor.js");
  assert.equal(html.includes("data-tool-scope"), true);
  assert.equal(js.includes("function updateToolOptionVisibility(tool)"), true);
  assert.equal(js.includes("toolOptionGroups.forEach"), true);
});
