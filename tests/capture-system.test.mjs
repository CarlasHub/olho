import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCaptureGrid, isProtectedCaptureUrl, PROTECTED_PAGE_MESSAGE } from "../src/background/capture.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

async function read(relPath) {
  return fs.readFile(path.join(root, relPath), "utf8");
}

test("protected page detection covers browser internal URLs", () => {
  assert.equal(isProtectedCaptureUrl("chrome://settings"), true);
  assert.equal(isProtectedCaptureUrl("https://chromewebstore.google.com/detail/example"), true);
  assert.equal(isProtectedCaptureUrl("https://example.com"), false);
  assert.equal(
    PROTECTED_PAGE_MESSAGE,
    "Olho cannot access this page as a tab. Use Capture screen/window to capture what is visible."
  );
});

test("full-page capture grid generation is bounded and deterministic", () => {
  const grid = buildCaptureGrid({
    pageWidth: 1920,
    pageHeight: 4800,
    viewportWidth: 1280,
    viewportHeight: 720,
    overlap: 120
  });

  assert.ok(grid.tiles.length > 1);
  assert.ok(grid.columns >= 1);
  assert.ok(grid.rows >= 2);
  assert.ok(grid.tiles.length <= 640);
});

test("service worker capture routes support visible/region/full/element/retry/cancel", async () => {
  const worker = await read("service_worker.js");

  assert.equal(worker.includes("MESSAGE_TYPES.CAPTURE_VISIBLE"), true);
  assert.equal(worker.includes("MESSAGE_TYPES.CAPTURE_REGION"), true);
  assert.equal(worker.includes("MESSAGE_TYPES.CAPTURE_FULL_PAGE"), true);
  assert.equal(worker.includes("MESSAGE_TYPES.CAPTURE_ELEMENT"), true);
  assert.equal(worker.includes("MESSAGE_TYPES.RETRY_CAPTURE"), true);
  assert.equal(worker.includes("MESSAGE_TYPES.CANCEL_CAPTURE"), true);

  assert.equal(worker.includes("captureVisibleArea"), true);
  assert.equal(worker.includes("captureRegion"), true);
  assert.equal(worker.includes("captureFullPage"), true);
  assert.equal(worker.includes("captureElement"), true);
  assert.equal(worker.includes('"review"'), true);
  assert.equal(worker.includes("Capture ready for Review Mode."), true);

  assert.equal(worker.includes("clipboardPending"), true);
  assert.equal(worker.includes("copyCaptureToClipboard"), false);
  assert.equal(worker.includes("downloadCapture"), true);
  assert.equal(worker.includes("resolveCaptureTargetTab"), true);
  assert.equal(worker.includes("findMostRecentCapturableTab"), true);
  assert.equal(worker.includes("focusCaptureTargetTab"), true);
});

test("capture module persists captures through media repository", async () => {
  const capture = await read("src/background/capture.js");

  assert.equal(capture.includes("import { getAppSettings, saveMedia }"), true);
  assert.equal(capture.includes("persistCaptureBlob"), true);
  assert.equal(capture.includes("kind: \"screenshot\""), true);
  assert.equal(capture.includes("storeSourceUrl"), true);
  assert.equal(capture.includes("sourcePageTitle"), true);
  assert.equal(capture.includes("sourceUrl"), true);

  assert.equal(capture.includes("selectRegion"), true);
  assert.equal(capture.includes("selectElement"), true);
  assert.equal(capture.includes("Escape"), true);
  assert.equal(capture.includes("attachShadow"), true);
  assert.equal(capture.includes("olho-capture-region-host"), true);
  assert.equal(capture.includes("olho-overlay"), true);

  assert.equal(capture.includes("restorePageAfterFullCapture"), true);
  assert.equal(capture.includes("preparePageForFullCapture"), true);
  assert.equal(capture.includes("triggerLazyContent"), true);
});

test("editor is opened with captured media id", async () => {
  const worker = await read("service_worker.js");
  assert.equal(worker.includes("?itemId=${encodeURIComponent(itemId)}"), true);
  assert.equal(worker.includes("openEditorTab"), true);
});

test("popup clipboard flow runs in extension page with fallback", async () => {
  const popup = await read("popup.js");
  assert.equal(popup.includes("navigator.clipboard.write"), true);
  assert.equal(popup.includes("getMediaBlob"), true);
  assert.equal(popup.includes("downloadPngFallback"), true);
  assert.equal(popup.includes("editor.html?"), true);
  assert.equal(popup.includes("captureScreenWindowStill"), true);
  assert.equal(popup.includes("getDisplayMedia"), true);
  assert.equal(popup.includes("capture-screen-window"), true);
  assert.equal(popup.includes("review-current-screen"), true);
  assert.equal(popup.includes("openReviewSidePanel"), true);
  assert.equal(popup.includes("chrome.sidePanel.open"), true);
  assert.equal(popup.includes('destination: "review"'), true);
  assert.equal(popup.includes("review.html?itemId="), true);
  assert.equal(popup.includes("updateMediaMetadata"), true);
  assert.equal(popup.includes("collectReviewMetricsForTab"), true);
  assert.equal(popup.includes("popup-live-dom"), true);
  assert.equal(popup.includes("stream.getTracks().forEach"), true);
  assert.equal(popup.includes("captureDelaySeconds"), true);
  assert.equal(popup.includes("runCaptureDelayIfNeeded"), true);
  assert.equal(popup.includes("annotate-local-image"), true);
});

test("editor supports auto-copy query flow and explicit clipboard errors", async () => {
  const editor = await read("editor.js");
  const editorHtml = await read("editor.html");
  assert.equal(editor.includes('params.get("copy") === "1"'), true);
  assert.equal(editor.includes('params.get("import") === "1"'), true);
  assert.equal(editor.includes("__olhoImportImageBlobForTesting"), true);
  assert.equal(editorHtml.includes("Drop image to open in editor"), true);
  assert.equal(editor.includes("RDP, enterprise policy, or Linux/Wayland"), true);
  assert.equal(editor.includes("autoTriggered"), true);
});
