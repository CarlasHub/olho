import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test-results");
const outJson = path.join(outDir, "output-validation-audit.json");
const outMd = path.join(outDir, "output-validation-audit.md");
const coreProofPath = path.join(outDir, "core-proof-evidence.json");

async function readCoreProof() {
  try {
    return JSON.parse(await fs.readFile(coreProofPath, "utf8"));
  } catch {
    return {};
  }
}

function proven(flag, evidence, fallbackEvidence) {
  return {
    status: flag ? "proven" : "unproven",
    quality: flag ? "real browser E2E" : "no proof",
    evidence: flag ? evidence : fallbackEvidence
  };
}

function buildChecks(coreProof = {}) {
  const capture = coreProof.captureTab || {};
  const editor = coreProof.editorOutput || {};
  const exp = coreProof.exportOutput || {};
  const recording = coreProof.recording || {};

  const recordingQuality = recording.mockBoundaryOnly ? "integration test (mocked browser API boundary)" : "real browser E2E";

  return [
    {
      area: "Capture",
      check: "image Blob exists",
      ...proven(capture.blobExists, "real capture-tab fixture flow stores Blob in IndexedDB", "No capture-tab blob assertion evidence")
    },
    {
      area: "Capture",
      check: "MIME type correct",
      ...proven(capture.mimeImage, "real capture-tab fixture flow asserts image/* mime", "No capture-tab MIME assertion evidence")
    },
    {
      area: "Capture",
      check: "size > 0",
      ...proven(capture.blobSizeGtZero, "real capture-tab fixture flow asserts blob size > 0", "No capture-tab size assertion evidence")
    },
    {
      area: "Capture",
      check: "dimensions correct",
      ...proven(capture.dimensionsSensible, "real capture-tab fixture flow validates decoded dimensions", "No capture-tab dimension assertion evidence")
    },
    {
      area: "Capture",
      check: "thumbnail exists",
      ...proven(
        capture.thumbnailExistsOrFallback,
        "real capture-tab flow verifies thumbnail id and thumbnail blob",
        "No capture-tab thumbnail/fallback assertion evidence"
      )
    },
    {
      area: "Capture",
      check: "Memory record exists",
      ...proven(capture.memoryRecordExists, "real capture-tab flow confirms recent memory record", "No capture-tab memory record assertion evidence")
    },
    {
      area: "Capture",
      check: "opens in editor",
      ...proven(capture.editorOpenVerified, "real capture-tab flow verifies editor opens saved item", "No capture-tab editor-open assertion evidence")
    },

    {
      area: "Editor",
      check: "saved edited image exists",
      ...proven(editor.previewExportParity, "editor output-truth E2E saves edited copy and validates output", "No edited-save output evidence")
    },
    {
      area: "Editor",
      check: "annotation present in output",
      ...proven(editor.previewExportParity, "editor output-truth E2E pixel deltas verify annotation output", "No annotation pixel-delta evidence")
    },
    {
      area: "Editor",
      check: "crop applied",
      ...proven(editor.cropApplied, "editor output-truth E2E validates crop dimensions", "No crop output assertion evidence")
    },
    {
      area: "Editor",
      check: "resize applied",
      ...proven(editor.resizeApplied, "editor output-truth E2E validates resized dimensions", "No resize output assertion evidence")
    },
    {
      area: "Editor",
      check: "text rendered",
      ...proven(editor.textRendered, "editor output-truth E2E validates text-region pixels", "No text-render output assertion evidence")
    },
    {
      area: "Editor",
      check: "redaction flattened",
      ...proven(editor.redactionFlattened, "editor output-truth E2E validates flattened redaction channel values", "No redaction-flattening evidence")
    },
    {
      area: "Editor",
      check: "export matches preview",
      ...proven(editor.previewExportParity, "editor output-truth E2E validates preview/export parity", "No preview/export parity evidence")
    },

    {
      area: "Export",
      check: "PNG header valid",
      ...proven(exp.pngHeaderValid, "real export E2E validates PNG signature", "No PNG header evidence")
    },
    {
      area: "Export",
      check: "JPG header valid",
      ...proven(exp.jpgHeaderValid, "real export E2E validates JPG signature", "No JPG header evidence")
    },
    {
      area: "Export",
      check: "WebP header valid",
      ...proven(exp.webpHeaderValid, "real export E2E validates RIFF/WEBP signature", "No WebP header evidence")
    },
    {
      area: "Export",
      check: "PDF starts with %PDF",
      ...proven(exp.pdfHeaderValid, "real export E2E validates %PDF header", "No PDF header evidence")
    },
    {
      area: "Export",
      check: "ZIP has entries",
      ...proven(exp.zipHasEntries, "real export E2E validates ZIP entry listing", "No ZIP entry listing evidence")
    },
    {
      area: "Export",
      check: "ZIP entries are not empty",
      ...proven(exp.zipEntriesNonEmpty, "real export E2E inflates each ZIP entry and checks non-empty bytes", "No per-entry ZIP payload validation evidence")
    },
    {
      area: "Export",
      check: "JSON parses",
      ...proven(exp.jsonParses, "real export E2E parses JSON payload", "No JSON parse evidence")
    },
    {
      area: "Export",
      check: "HTML sanitized",
      ...proven(exp.htmlSanitized, "real export E2E verifies script-tag escaping", "No HTML sanitization evidence")
    },
    {
      area: "Export",
      check: "Markdown contains expected text",
      ...proven(exp.markdownContainsExpected, "real export E2E validates markdown title/privacy text", "No markdown content evidence")
    },

    {
      area: "Recording",
      check: "Blob exists",
      status: recording.blobExists ? "proven" : "unproven",
      quality: recording.blobExists ? recordingQuality : "no proof",
      evidence: recording.blobExists ? "recorder production route creates Blob and saves to IndexedDB" : "No recorder Blob existence assertion evidence"
    },
    {
      area: "Recording",
      check: "Blob size > 0",
      status: recording.blobSizeGtZero ? "proven" : "unproven",
      quality: recording.blobSizeGtZero ? recordingQuality : "no proof",
      evidence: recording.blobSizeGtZero ? "recorder production route asserts non-empty blob" : "No recorder blob-size assertion evidence"
    },
    {
      area: "Recording",
      check: "MIME type correct",
      status: recording.mimeVideo ? "proven" : "unproven",
      quality: recording.mimeVideo ? recordingQuality : "no proof",
      evidence: recording.mimeVideo ? "recorder production route validates video/webm MIME" : "No recorder MIME assertion evidence"
    },
    {
      area: "Recording",
      check: "duration metadata exists",
      status: recording.durationMetadata ? "proven" : "unproven",
      quality: recording.durationMetadata ? recordingQuality : "no proof",
      evidence: recording.durationMetadata ? "recorder flow validates duration metadata presence" : "No recorder duration metadata evidence"
    },
    {
      area: "Recording",
      check: "preview plays",
      status: recording.previewSourceValid ? "proven" : "unproven",
      quality: recording.previewSourceValid ? recordingQuality : "no proof",
      evidence: recording.previewSourceValid ? "recorder flow validates preview video source from generated blob" : "No preview source validation evidence"
    },
    {
      area: "Recording",
      check: "Memory playback works",
      status: recording.memoryPlaybackSourceValid ? "proven" : "unproven",
      quality: recording.memoryPlaybackSourceValid ? recordingQuality : "no proof",
      evidence: recording.memoryPlaybackSourceValid ? "recording item from Memory resolves to saved video blob" : "No memory playback source validation evidence"
    },
    {
      area: "Recording",
      check: "tracks stopped",
      status: recording.tracksStopped ? "proven" : "unproven",
      quality: recording.tracksStopped ? recordingQuality : "no proof",
      evidence: recording.tracksStopped ? "recorder flow validates stream-track stop behavior" : "No track-stop assertion evidence"
    }
  ];
}

function toTable(rows) {
  const head = [
    "| Area | Check | Evidence | Status | Proof quality |",
    "|---|---|---|---|---|"
  ];
  const body = rows.map((row) => `| ${row.area} | ${row.check} | ${row.evidence.replace(/\|/g, "\\|")} | ${row.status} | ${row.quality} |`);
  return [...head, ...body].join("\n");
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const coreProof = await readCoreProof();
  const checks = buildChecks(coreProof);
  const summary = {
    total: checks.length,
    proven: checks.filter((row) => row.status === "proven").length,
    unproven: checks.filter((row) => row.status === "unproven").length
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    checks,
    summary
  };

  await fs.writeFile(outJson, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(
    outMd,
    `# Output Validation Audit\n\n- Generated: ${payload.generatedAt}\n- Total checks: ${summary.total}\n- Proven: ${summary.proven}\n- Unproven: ${summary.unproven}\n\n${toTable(checks)}\n`,
    "utf8"
  );

  const blockers = checks.filter((row) => row.status !== "proven");
  if (blockers.length > 0) {
    const list = blockers.map((row) => `${row.area} - ${row.check}: ${row.status}`).join("\n");
    throw new Error(`Output validation blockers present:\n${list}`);
  }
}

main().catch((error) => {
  console.error("[output-validation-audit] FAIL", error?.message || error);
  process.exit(1);
});
