import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const requiredFiles = [
  "popup.html",
  "editor.html",
  "gallery.html",
  "record.html",
  "options.html",
  "privacy.html",
  "privacy.js",
  "privacy.css",
  "export-report.html",
  "service_worker.js",
  "offscreen.html",
  "offscreen.js",
  "src/background/capture.js",
  "src/background/recorder.js"
];

test("required application surfaces exist", async () => {
  await Promise.all(
    requiredFiles.map(async (rel) => {
      const abs = path.join(root, rel);
      await fs.access(abs);
    })
  );
});

test("capture and recording controls are wired in popup", async () => {
  const html = await fs.readFile(path.join(root, "popup.html"), "utf8");
  assert.equal(html.includes("capture-visible"), true);
  assert.equal(html.includes("capture-region"), true);
  assert.equal(html.includes("capture-full"), true);
  assert.equal(html.includes("capture-element"), true);
  assert.equal(html.includes("capture-screen-window"), true);
  assert.equal(html.includes("capture-screen-region"), true);
  assert.equal(html.includes("retry-capture"), false);
  assert.equal(html.includes("cancel-capture"), false);
  assert.equal(html.includes("clipboardFallbackPanel"), true);
  assert.equal(html.includes("captureBlockedPanel"), true);
  assert.equal(html.includes("blockedScreenCaptureBtn"), true);
  assert.equal(html.includes("openEditorCopyBtn"), true);
  assert.equal(html.includes("annotate-local-image"), true);
  assert.equal(html.includes("start-recording"), true);
  assert.equal(html.includes("recentList"), true);
  assert.equal(html.includes('id="recordMode"'), false);
  assert.equal(html.includes('id="recordMic"'), false);
  assert.equal(html.includes('id="recordSystem"'), false);
  assert.equal(html.includes('id="recordCamera"'), false);
  assert.equal(html.includes('id="captureDestination"'), false);
  assert.equal(html.includes("downloadPdfBtn"), false);
  assert.equal(html.includes("downloadZipBtn"), false);
});

test("export report includes local export actions", async () => {
  const html = await fs.readFile(path.join(root, "export-report.html"), "utf8");
  assert.equal(html.includes('id="downloadPngBtn"'), true);
  assert.equal(html.includes('id="downloadJpgBtn"'), true);
  assert.equal(html.includes('id="downloadWebpBtn"'), true);
  assert.equal(html.includes('id="downloadPdfBtn"'), true);
  assert.equal(html.includes('id="printBtn"'), true);
  assert.equal(html.includes('id="downloadZipBtn"'), true);
  assert.equal(html.includes('id="downloadHtmlSummaryBtn"'), true);
  assert.equal(html.includes('id="copyImageBtn"'), true);
  assert.equal(html.includes('id="copySummaryBtn"'), true);
  assert.equal(html.includes('id="copyHtmlBtn"'), true);
  assert.equal(html.includes("Olho does not upload your files. Export them and attach manually."), true);
  assert.equal(html.includes("Jira issue draft"), true);
  assert.equal(html.includes("GitHub issue draft"), true);
  assert.equal(html.includes("Email draft"), true);
});

test("editor surface includes advanced local annotation controls", async () => {
  const html = await fs.readFile(path.join(root, "editor.html"), "utf8");
  assert.equal(html.includes('data-tool="select"'), true);
  assert.equal(html.includes('data-tool="pixelate"'), true);
  assert.equal(html.includes('data-tool="redact"'), true);
  assert.equal(html.includes('id="annotationList"'), true);
  assert.equal(html.includes('id="overwriteDialog"'), true);
  assert.equal(html.includes('id="copyMarkdownBtn"'), true);
  assert.equal(html.includes('id="copyHtmlBtn"'), true);
  assert.equal(html.includes('id="openExportPanelBtn"'), true);
  assert.equal(html.includes('id="editorMoreMenu"'), true);
  assert.equal(html.includes('id="openLocalImageBtn"'), true);
  assert.equal(html.includes('id="pasteImageBtn"'), true);
  assert.equal(html.includes('id="overwriteBtn"'), true);
  assert.equal(html.includes('id="resetEditsBtn"'), true);
  assert.equal(html.includes('id="inspectorToolSection" open'), true);
  assert.equal(html.includes('id="inspectorDetailsSection"'), true);
  assert.equal(html.includes('id="inspectorExportSection"'), true);
  assert.equal(html.includes('id="copyBtn"'), false);
  assert.equal(html.includes('id="downloadBtn"'), false);
  assert.equal(html.includes('id="exportSaveBtn"'), false);
  assert.equal(html.includes('id="exportProjectBtn"'), true);
  assert.equal(html.includes('id="importProjectBtn"'), true);
});

test("memory export actions are not duplicated across header and export view", async () => {
  const html = await fs.readFile(path.join(root, "gallery.html"), "utf8");
  assert.equal(html.includes('id="openCaptureBtn"'), false);
  assert.equal(html.includes('id="openOptionsBtn"'), false);
  assert.equal(html.includes('id="closeBtn"'), false);
  assert.equal(html.includes('id="openReportBtn"'), false);
  assert.equal(html.includes('id="exportMetadataBtn"'), false);
  assert.equal(html.includes('id="exportFilteredZipBtn"'), false);
  assert.equal(html.includes('id="openExportReportBtn"'), false);
  assert.equal(html.includes('data-view="exports"'), false);
  assert.equal(html.includes("Select an item to see details."), true);
});

test("record page includes setup, control overlay, and preview save controls", async () => {
  const html = await fs.readFile(path.join(root, "record.html"), "utf8");

  assert.equal(html.includes('id="sourceMode"'), true);
  assert.equal(html.includes('id="countdownSeconds"'), true);
  assert.equal(html.includes('id="micToggle"'), true);
  assert.equal(html.includes('id="cameraToggle"'), true);
  assert.equal(html.includes('id="recordingOverlay"'), true);
  assert.equal(html.includes('id="pauseBtn"'), true);
  assert.equal(html.includes('id="stopBtn"'), true);
  assert.equal(html.includes('id="cancelBtn"'), true);
  assert.equal(html.includes('id="previewVideo"'), true);
  assert.equal(html.includes('id="saveDraftBtn"'), true);
  assert.equal(html.includes('id="saveBtn"'), true);
  assert.equal(html.includes('id="downloadBtn"'), true);
});

test("settings page includes capture defaults and delay controls", async () => {
  const html = await fs.readFile(path.join(root, "options.html"), "utf8");
  assert.equal(html.includes('id="defaultAfterCaptureAction"'), true);
  assert.equal(html.includes('id="skipEditorMode"'), true);
  assert.equal(html.includes('id="captureDelaySeconds"'), true);
  assert.equal(html.includes('id="autoDownload"'), true);
});
