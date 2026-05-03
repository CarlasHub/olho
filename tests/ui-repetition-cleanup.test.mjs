import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

async function read(relPath) {
  return fs.readFile(path.join(root, relPath), "utf8");
}

test("popup keeps quick-start actions and avoids export duplication", async () => {
  const html = await read("popup.html");
  assert.equal(html.includes('data-action="capture-visible"'), true);
  assert.equal(html.includes('data-action="capture-region"'), true);
  assert.equal(html.includes('data-action="capture-full"'), true);
  assert.equal(html.includes('data-action="capture-screen-window"'), true);
  assert.equal(html.includes('data-action="start-recording"'), true);
  assert.equal(html.includes('data-action="annotate-local-image"'), true);
  assert.equal(html.includes('id="downloadPdfBtn"'), false);
  assert.equal(html.includes('id="downloadZipBtn"'), false);
});

test("editor top bar and more menu keep single primary path", async () => {
  const html = await read("editor.html");
  assert.equal(html.includes('id="saveCopyBtn" class="primary"'), true);
  assert.equal(html.includes('id="openExportPanelBtn"'), true);
  assert.equal(html.includes('id="editorMoreMenu"'), true);
  assert.equal(html.includes('id="openLocalImageBtn"'), true);
  assert.equal(html.includes('id="pasteImageBtn"'), true);
  assert.equal(html.includes('id="overwriteBtn"'), true);
  assert.equal(html.includes('id="resetEditsBtn"'), true);
  assert.equal(html.includes('id="optionsBtn"'), false);
  assert.equal(html.includes('id="closeBtn"'), false);
  assert.equal(html.includes('id="copyBtn"'), false);
  assert.equal(html.includes('id="downloadBtn"'), false);
});

test("memory cards default to Open + More and bulk bar is contextual", async () => {
  const html = await read("gallery.html");
  const js = await read("gallery.js");
  const cardView = await read("src/gallery/card-view.js");

  assert.equal(html.includes('id="openCaptureBtn"'), false);
  assert.equal(html.includes('id="openOptionsBtn"'), false);
  assert.equal(html.includes('id="closeBtn"'), false);
  assert.equal(html.includes("Select an item to see details."), true);
  assert.equal(cardView.includes('actions.append(createContextButton("Open", () => openMediaItem(item)));'), true);
  assert.equal(cardView.includes('summary.textContent = "More";'), true);
  assert.equal(js.includes('bulkToolbar.hidden = !isMediaCardView() || selected === 0;'), true);
  assert.equal(html.includes('id="inspectorOpenBtn"'), true);
  assert.equal(html.includes('id="inspectorDeleteBtn"'), true);
});

test("settings and privacy avoid duplicate navigation actions", async () => {
  const optionsHtml = await read("options.html");
  const privacyHtml = await read("privacy.html");

  assert.equal(optionsHtml.includes('id="openReportBtn"'), false);
  assert.equal(privacyHtml.includes('id="openMemoryBtn"'), false);
  assert.equal(privacyHtml.includes('id="openSettingsBtn"'), false);
  assert.equal(privacyHtml.includes('id="closeBtn"'), false);
});

test("recorder preview hierarchy keeps save primary and draft contextual", async () => {
  const html = await read("record.html");

  const openDisclosures = (html.match(/<details class="disclosure" open>/g) || []).length;
  assert.equal(openDisclosures, 1);
  assert.equal(html.includes('id="saveBtn" class="primary'), true);
  assert.equal(html.includes('preview-actions-primary'), true);
  assert.equal(html.includes('preview-actions-danger'), true);
  assert.equal(html.includes('id="saveDraftBtn"'), true);
  assert.equal(html.includes('class="disclosure preview-more-actions"'), true);
});

test("export keeps canonical grouped actions without duplicate close controls", async () => {
  const html = await read("export-report.html");
  assert.equal(html.includes("<summary>Download</summary>"), true);
  assert.equal(html.includes("<summary>Bundle</summary>"), true);
  assert.equal(html.includes("<summary>Copy</summary>"), true);
  assert.equal(html.includes("<summary>Draft</summary>"), true);
  assert.equal(html.includes('id="downloadPngBtn"'), true);
  assert.equal(html.includes('id="downloadJpgBtn"'), true);
  assert.equal(html.includes('id="downloadWebpBtn"'), true);
  assert.equal(html.includes('id="copyImageBtn"'), true);
  assert.equal(html.includes('id="closeBtn"'), false);
});
