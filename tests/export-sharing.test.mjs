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

test("1. Export PNG", async () => {
  const html = await read("editor.html");
  const js = await read("editor.js");
  assert.equal(html.includes('<option value="png">PNG</option>'), true);
  assert.equal(js.includes("async function exportImageBlob(format = \"png\")"), true);
});

test("2. Export JPG", async () => {
  const html = await read("editor.html");
  const js = await read("editor.js");
  assert.equal(html.includes('<option value="jpg">JPG</option>'), true);
  assert.equal(js.includes('if (format === "jpg")'), true);
});

test("3. Export WebP", async () => {
  const html = await read("editor.html");
  const js = await read("editor.js");
  assert.equal(html.includes('<option value="webp">WebP</option>'), true);
  assert.equal(js.includes('if (format === "webp")'), true);
});

test("4. Export PDF", async () => {
  const editorHtml = await read("editor.html");
  const editorJs = await read("editor.js");
  const reportJs = await read("export-report.js");
  assert.equal(editorHtml.includes('<option value="pdf">PDF</option>'), true);
  assert.equal(editorJs.includes("createPdfBlobFromCanvasAndVectors"), true);
  assert.equal(reportJs.includes("renderReportPagesToCanvases"), true);
  assert.equal(reportJs.includes("buildPdfFromJpegPages"), true);
  assert.equal(reportJs.includes("buildReportPdfBlob"), true);
  assert.equal(reportJs.includes("getThumbnailBlob"), true);
});

test("5. Export HTML report", async () => {
  const html = await read("export-report.html");
  const js = await read("export-report.js");
  assert.equal(html.includes('id="downloadHtmlBtn"'), true);
  assert.equal(html.includes('id="downloadHtmlSummaryBtn"'), true);
  assert.equal(js.includes("async function downloadHtmlReport()"), true);
  assert.equal(js.includes("async function downloadHtmlSummary()"), true);
  assert.equal(js.includes("fullReportDocument"), true);
});

test("6. Export Markdown", async () => {
  const html = await read("export-report.html");
  const js = await read("export-report.js");
  assert.equal(html.includes('id="downloadMarkdownBtn"'), true);
  assert.equal(js.includes("async function downloadMarkdown()"), true);
  assert.equal(js.includes("markdownSummary(entries)"), true);
});

test("7. Export JSON", async () => {
  const html = await read("export-report.html");
  const js = await read("export-report.js");
  assert.equal(html.includes('id="downloadJsonBtn"'), true);
  assert.equal(js.includes("async function downloadJsonMetadata()"), true);
  assert.equal(js.includes("reportJson(entries)"), true);
  assert.equal(js.includes("sourceUrlRaw"), true);
});

test("8. Export ZIP", async () => {
  const html = await read("export-report.html");
  const js = await read("export-report.js");
  assert.equal(html.includes('id="downloadZipBtn"'), true);
  assert.equal(js.includes("async function createZipBlob(entries)"), true);
  assert.equal(js.includes("async function downloadZipBundle()"), true);
  assert.equal(html.includes("ZIP bundle"), true);
  assert.equal(html.includes("attach manually"), true);
  assert.equal(js.includes("Set Source URL"), true);
});

test("9. Copy Markdown", async () => {
  const html = await read("export-report.html");
  const js = await read("export-report.js");
  assert.equal(html.includes('id="copySummaryBtn"'), true);
  assert.equal(js.includes("async function copySummary()"), true);
  assert.equal(js.includes("navigator.clipboard.writeText"), true);
  assert.equal(js.includes("tryLegacyImageClipboardCopy"), true);
  assert.equal(js.includes("openEditorAndCopy"), true);
  assert.equal(js.includes("Open Editor and Copy"), true);
  assert.equal(js.includes("Clipboard video copy is not available"), true);
});

test("10. mailto generation", async () => {
  const js = await read("export-report.js");
  assert.equal(js.includes("async function openMailDraft()"), true);
  assert.equal(js.includes("mailto:?subject="), true);
  assert.equal(js.includes("&body="), true);
  assert.equal(js.includes("async function printSelection()"), true);
});

test("11. GitHub issue URL generation", async () => {
  const js = await read("export-report.js");
  assert.equal(js.includes("async function openGithubDraft()"), true);
  assert.equal(js.includes("title="), true);
  assert.equal(js.includes("body="), true);
});

test("12. Jira issue URL generation", async () => {
  const js = await read("export-report.js");
  assert.equal(js.includes("async function openJiraDraft()"), true);
  assert.equal(js.includes("CreateIssueDetails!init.jspa"), true);
  assert.equal(js.includes("summary="), true);
  assert.equal(js.includes("description="), true);
});

test("13. Verify no network requests", async () => {
  const js = await read("export-report.js");
  assert.equal(js.includes("fetch("), false);
  assert.equal(js.includes("XMLHttpRequest"), false);
  assert.equal(js.includes("WebSocket"), false);
  assert.equal(js.includes("navigator.sendBeacon"), false);
});

test("14. Verify no remote services in code", async () => {
  const files = ["export-report.js", "service_worker.js", "src/background/capture.js", "src/background/recorder.js"];
  const combined = (
    await Promise.all(
      files.map(async (file) => {
        const text = await read(file);
        return `${file}\n${text}`;
      })
    )
  ).join("\n");

  const forbidden = [
    /firebase/i,
    /supabase/i,
    /sentry/i,
    /posthog/i,
    /google analytics/i,
    /cloudflare workers/i,
    /vercel/i,
    /netlify/i,
    /\baws\b/i,
    /\bgcp\b/i,
    /azure/i,
    /sendgrid/i,
    /mailgun/i,
    /stripe/i
  ];

  forbidden.forEach((pattern) => {
    assert.equal(pattern.test(combined), false, `Forbidden remote service reference found: ${pattern}`);
  });
});
