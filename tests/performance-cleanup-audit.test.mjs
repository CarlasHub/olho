import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const reportPath = path.join(root, "test-results", "performance-cleanup-audit.md");

async function readFile(relPath) {
  return fs.readFile(path.join(root, relPath), "utf8");
}

test(
  "performance and cleanup audit writes report and enforces core safeguards",
  { timeout: 150_000 },
  async () => {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });

    const findings = [];

    const captureSource = await readFile("src/background/capture.js");
    const popupSource = await readFile("popup.js");
    const recordSource = await readFile("record.js");
    const gallerySource = await readFile("gallery.js");

    if (!captureSource.includes("MAX_CANVAS_DIMENSION") || !captureSource.includes("MAX_CANVAS_AREA")) {
      findings.push("capture.js: missing full-page canvas bounds guard.");
    }
    if (!captureSource.includes("__olho_capture_progress__")) {
      findings.push("capture.js: missing full-page progress overlay marker.");
    }
    if (!captureSource.includes("host.attachShadow")) {
      findings.push("capture.js: region overlay is not isolated with Shadow DOM.");
    }
    if (!captureSource.includes("host.remove()") || !captureSource.includes("overlay.remove()")) {
      findings.push("capture.js: overlay cleanup path is incomplete.");
    }
    if (!popupSource.includes("track.stop()")) {
      findings.push("popup.js: screen/window still-capture tracks are not explicitly stopped.");
    }
    if (!recordSource.includes("URL.revokeObjectURL") || !gallerySource.includes("URL.revokeObjectURL")) {
      findings.push("record/gallery: blob URL revoke logic missing.");
    }
    if (!gallerySource.includes("getThumbnailBlob") || !gallerySource.includes("thumbnailUrl")) {
      findings.push("gallery.js: thumbnail-first gallery rendering path missing.");
    }

    const output = [
      "# Performance and Cleanup Audit",
      "",
      `- Generated: ${new Date().toISOString()}`,
      `- Findings: ${findings.length}`,
      "",
      findings.length ? "## Findings" : "## Findings\nNone.",
      ...(findings.length ? findings.map((line) => `- ${line}`) : [])
    ].join("\n");

    await fs.writeFile(reportPath, `${output}\n`, "utf8");

    assert.deepEqual(findings, []);
  }
);
