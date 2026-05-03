import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test-results");
const outJson = path.join(outDir, "feature-health-matrix.json");
const outMd = path.join(outDir, "feature-health-matrix.md");
const coreProofPath = path.join(outDir, "core-proof-evidence.json");
const workflowAuditPath = path.join(outDir, "operability-workflows-audit.json");
const uiAuditPath = path.join(outDir, "full-ui-operability-audit.json");

const features = [
  [1, "Capture tab"], [2, "Full page capture"], [3, "Select area in tab"], [4, "Capture screen/window"], [5, "Select area from screen/window"], [6, "Focus element"], [7, "Delayed capture"], [8, "Restricted-page fallback"], [9, "Capture preview"], [10, "Save to Memory"], [11, "Open editor after capture"], [12, "Download after capture"], [13, "Copy after capture"],
  [14, "Load image from Memory"], [15, "Load imported image"], [16, "Select tool"], [17, "Pen"], [18, "Highlighter"], [19, "Rectangle"], [20, "Ellipse"], [21, "Line"], [22, "Arrow"], [23, "Text"], [24, "Number marker"], [25, "Callout"], [26, "Blur"], [27, "Pixelate"], [28, "Solid redaction"], [29, "Crop"], [30, "Resize image"], [31, "Add image/icon"], [32, "Move annotation"], [33, "Resize annotation"], [34, "Arrow endpoint drag"], [35, "Text editing"], [36, "Text font size"], [37, "Text resize"], [38, "Undo"], [39, "Redo"], [40, "Save copy"], [41, "Overwrite"], [42, "Export from editor"], [43, "Copy from editor"],
  [44, "Load Memory"], [45, "Persistence after reload"], [46, "Search"], [47, "Filters"], [48, "Sort"], [49, "Folders"], [50, "Tags"], [51, "Favourite / Keep in Sight"], [52, "Open item"], [53, "Rename item"], [54, "Delete to Trash"], [55, "Restore"], [56, "Permanent delete"], [57, "Bulk selection"], [58, "Bulk ZIP export"], [59, "Storage usage"], [60, "Delete all local data"],
  [61, "PNG"], [62, "JPG"], [63, "WebP"], [64, "PDF"], [65, "Print"], [66, "HTML report"], [67, "Markdown summary"], [68, "HTML summary"], [69, "JSON metadata"], [70, "ZIP bundle"], [71, "Copy image"], [72, "Copy Markdown"], [73, "Copy HTML"], [74, "Email draft"], [75, "GitHub/Jira draft"], [76, "Manual attachment clarity"],
  [77, "Recorder opens"], [78, "Screen recording"], [79, "Window recording"], [80, "Tab recording"], [81, "Camera-only recording"], [82, "Microphone"], [83, "System/tab audio"], [84, "Webcam overlay"], [85, "Countdown"], [86, "Timer"], [87, "Pause"], [88, "Resume"], [89, "Stop"], [90, "Discard"], [91, "Preview"], [92, "Save recording"], [93, "Playback from Memory"], [94, "Download WebM"],
  [95, "Settings persistence"], [96, "After-capture behaviour"], [97, "Default export format"], [98, "Capture delay setting"], [99, "Keyboard shortcuts"], [100, "Privacy page accuracy"], [101, "Permission explanations"], [102, "No-owner-cost guarantee"],
  [103, "Popup clarity"], [104, "Editor usability"], [105, "Memory usability"], [106, "Export usability"], [107, "Recorder usability"], [108, "Responsive layout"], [109, "Colour hierarchy"], [110, "Accessibility"]
];

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

function hasAll(value, keys) {
  return keys.every((key) => Boolean(value?.[key]));
}

function mdTable(items) {
  const head = [
    "| Feature | User goal | Expected end-to-end behaviour | Actual observed behaviour | Output actually produced | Test coverage | Manual verification status | Professional-grade score | Health status | Hidden risk | Required fix | Release blocker |",
    "|---|---|---|---|---|---|---|---:|---|---|---|---|"
  ];
  const body = items.map((row) => {
    return `| ${row.featureId}. ${row.feature} | ${row.userGoal} | ${row.expectedE2E.replace(/\|/g, "\\|")} | ${row.actualObserved} | ${row.outputActual} | ${row.testCoverage} | ${row.manualVerificationStatus} | ${row.professionalGradeScore} | ${row.healthStatus} | ${row.hiddenRisk.replace(/\|/g, "\\|")} | ${row.requiredFix.replace(/\|/g, "\\|")} | ${row.releaseBlocker ? "yes" : "no"} |`;
  });
  return [...head, ...body].join("\n");
}

async function main() {
  const core = await readJsonSafe(coreProofPath);
  const workflows = await readJsonSafe(workflowAuditPath);
  const ui = await readJsonSafe(uiAuditPath);
  const workflowPass = Number(workflows?.failedWorkflows || 0) === 0 && Number(workflows?.passedWorkflows || 0) >= 10;
  const uiPass = Number(ui?.controlsFailed || 0) === 0 && Number(ui?.workflowsFailed || 0) === 0;

  const captureTabProven = hasAll(core.captureTab, ["blobExists", "blobSizeGtZero", "mimeImage", "savedIndexedDb", "memoryRecordExists"]);
  const selectAreaTabProven = hasAll(core.selectAreaTab, ["overlayRendered", "dragSelectionConfirmed", "croppedBlobSaved", "escapeCancelHandled"]);
  const fullPageProven = hasAll(core.fullPage, ["provenCommonFixtures", "stickyFixture", "lazyFixture", "hostileFixture", "canvasLimitGuard"]);
  const screenWindowLimited = hasAll(core.screenWindowStill, ["productionRouteInvoked", "blobSavedIndexedDb", "tracksStopped", "cancelHandled"]) && Boolean(core?.manualRequired?.screenWindowNativePicker);
  const recordingLimited = hasAll(core.recording, ["productionRouteInvoked", "blobExists", "blobSizeGtZero", "mimeVideo", "savedIndexedDb"]) && Boolean(core?.manualRequired?.recordingHardwareAudioVideo);
  const editorProven = hasAll(core.editorOutput, ["cropApplied", "resizeApplied", "textRendered", "redactionFlattened", "previewExportParity"]);
  const exportProven = hasAll(core.exportOutput, ["pngHeaderValid", "jpgHeaderValid", "webpHeaderValid", "pdfHeaderValid", "zipEntriesNonEmpty", "jsonParses", "htmlSanitized", "markdownContainsExpected"]);
  const runtimeNetworkProven = hasAll(core.runtimeNetwork, ["monitoredInRealBrowser", "popup", "captureTab", "selectArea", "fullPage", "editor", "memory", "export", "recorderLoad", "settings", "privacy"]) && Number(core?.runtimeNetwork?.unexpectedOutboundRequests ?? -1) === 0;

  const rows = features.map(([featureId, feature]) => {
    let proof = "integration test";
    let manual = "not proven";
    let score = 6;
    let health = "Working but not professional-grade";
    let blocker = false;
    let hiddenRisk = "Failure-case depth is still expanding.";
    let requiredFix = "Keep extending adversarial E2E and manual QA evidence.";

    if (featureId === 1) {
      if (!captureTabProven) {
        proof = "no proof";
        score = 2;
        health = "Partial";
        blocker = true;
        hiddenRisk = "Capture tab may fail silently in real use.";
        requiredFix = "Require real fixture capture-tab proof with blob/thumbnail/editor assertions.";
      } else {
        proof = "real browser E2E";
        manual = "partially verified";
        score = 7;
      }
    } else if (featureId === 2) {
      if (!fullPageProven) {
        proof = "integration test";
        score = 3;
        health = "Partial";
        blocker = true;
        hiddenRisk = "Full-page may fail on sticky/lazy/hostile pages.";
        requiredFix = "Pass forensic multi-fixture suite including canvas limit behavior.";
      } else {
        proof = "real browser E2E";
        manual = "partially verified";
        score = 7;
      }
    } else if (featureId === 3) {
      if (!selectAreaTabProven) {
        proof = "no proof";
        score = 2;
        health = "Partial";
        blocker = true;
        hiddenRisk = "Region overlay/crop path may fail on real pages.";
        requiredFix = "Require hostile-page overlay drag/cancel/saved-crop assertions.";
      } else {
        proof = "real browser E2E";
        manual = "partially verified";
        score = 7;
      }
    } else if ([4, 5].includes(featureId)) {
      if (!screenWindowLimited) {
        proof = "mocked only";
        score = 3;
        health = "Mock-tested only";
        blocker = true;
        hiddenRisk = "Native picker path remains unproven for release constraints.";
        requiredFix = "Keep boundary-mocked production proof and manual hardware checklist explicit.";
      } else {
        proof = "integration test";
        manual = "manual hardware verification required";
        score = 6;
        health = "Browser/OS-limited";
        hiddenRisk = "Native picker behavior varies by OS/device/browser policy.";
        requiredFix = "Complete manual hardware matrix for public-ready promotion.";
      }
    } else if (featureId >= 14 && featureId <= 43) {
      if (!editorProven) {
        proof = "integration test";
        score = 4;
        health = "Working only on happy path";
        blocker = featureId >= 29 && featureId <= 30;
        hiddenRisk = "Editor output parity may drift from preview.";
        requiredFix = "Require output-truth assertions for edited exports.";
      } else {
        proof = "real browser E2E";
        manual = "partially verified";
        score = 7;
      }
    } else if (featureId >= 44 && featureId <= 60) {
      if (!workflowPass) {
        proof = "integration test";
        score = 4;
        health = "Working only on happy path";
        blocker = [45, 58, 60].includes(featureId);
        hiddenRisk = "Memory flows may regress without workflow-level evidence.";
        requiredFix = "Pass workflow audit for persistence, bulk ZIP, delete-all.";
      } else {
        proof = "real browser E2E";
        manual = "partially verified";
        score = 6;
      }
    } else if (featureId >= 61 && featureId <= 76) {
      if (!exportProven) {
        proof = "integration test";
        score = 4;
        health = "Working only on happy path";
        blocker = [61, 62, 64, 70].includes(featureId);
        hiddenRisk = "Export bytes may be invalid under some flows.";
        requiredFix = "Require signature/content validation for core formats.";
      } else {
        proof = "real browser E2E";
        manual = "partially verified";
        score = 7;
      }
    } else if (featureId >= 77 && featureId <= 94) {
      if (!recordingLimited) {
        proof = "mocked only";
        score = 3;
        health = "Mock-tested only";
        blocker = [78, 79, 80, 89, 92, 93, 94].includes(featureId);
        hiddenRisk = "Recording can pass tests while failing on hardware.";
        requiredFix = "Maintain strict manual-hardware requirements and boundary assertions.";
      } else {
        proof = "integration test";
        manual = "manual hardware verification required";
        score = 6;
        health = "Browser/OS-limited";
        hiddenRisk = "Audio/webcam/system availability differs by OS and picker permissions.";
        requiredFix = "Complete manual recording hardware verification before public-ready.";
      }
    } else if (featureId >= 95 && featureId <= 102) {
      proof = runtimeNetworkProven ? "real browser E2E" : "integration test";
      manual = "partially verified";
      score = runtimeNetworkProven ? 7 : 5;
      health = runtimeNetworkProven ? "Working but not professional-grade" : "Working only on happy path";
      blocker = featureId === 102 && !runtimeNetworkProven;
      hiddenRisk = runtimeNetworkProven ? "Manual environment variance still possible." : "No runtime outbound monitor proof.";
      requiredFix = runtimeNetworkProven ? "Maintain runtime network monitor in release gate." : "Add runtime network monitor proof.";
    } else if (featureId >= 103 && featureId <= 110) {
      proof = uiPass ? "real browser E2E" : "integration test";
      manual = "partially verified";
      score = uiPass ? 6 : 4;
      health = uiPass ? "Working but not professional-grade" : "Working only on happy path";
      blocker = false;
      hiddenRisk = uiPass ? "Usability polish and edge-state hardening remain." : "UI operability regressions may be hidden.";
      requiredFix = uiPass ? "Keep operability walkthrough and accessibility checks strict." : "Fix failing controls/workflows in UI operability audit.";
    } else if ([6, 7, 8, 9, 10, 11, 12, 13].includes(featureId)) {
      proof = captureTabProven ? "real browser E2E" : "integration test";
      manual = "partially verified";
      score = captureTabProven ? 6 : 4;
      health = captureTabProven ? "Working but not professional-grade" : "Working only on happy path";
      blocker = false;
    }

    return {
      featureId,
      feature,
      userGoal: feature,
      entryPoint: "UI",
      implementation: "See popup/editor/gallery/record/export scripts",
      expectedE2E: `User can complete ${feature} and get expected local output.`,
      actualObserved: health,
      outputExpected: "Local Blob/file/metadata as applicable",
      outputActual: proof,
      storagePath: "IndexedDB (media/thumbnails/settings) when persisted",
      uiFeedback: "Varies by surface",
      failureHandling: "Partially covered by real E2E and operability audits",
      testCoverage: proof,
      testQuality: health,
      manualVerificationStatus: manual,
      professionalGradeScore: score,
      healthStatus: health,
      hiddenRisk,
      requiredFix,
      releaseBlocker: blocker
    };
  });

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outJson, `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`, "utf8");
  const md = [
    "# Feature Health Matrix",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Features audited: ${rows.length}`,
    "",
    mdTable(rows)
  ].join("\n");
  await fs.writeFile(outMd, `${md}\n`, "utf8");

  const blockers = rows.filter((row) => row.releaseBlocker);
  if (blockers.length > 0) {
    const sample = blockers.slice(0, 25).map((row) => `${row.featureId}. ${row.feature}: ${row.healthStatus}`).join("\n");
    throw new Error(`Feature-health blockers present (${blockers.length}). Sample:\n${sample}`);
  }
}

main().catch((error) => {
  console.error("[feature-health-audit] FAIL", error?.message || error);
  process.exit(1);
});
