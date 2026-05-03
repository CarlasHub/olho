import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const resultsDir = path.join(root, "test-results");

const wiringPath = path.join(resultsDir, "wiring-audit.json");
const workflowsPath = path.join(resultsDir, "operability-workflows-audit.json");
const outJson = path.join(resultsDir, "full-ui-operability-audit.json");
const outMd = path.join(resultsDir, "full-ui-operability-audit.md");
const releaseCandidateReportPath = path.join(resultsDir, "release-candidate-report.md");

const MANUAL_HARDWARE_CHECKS = [
  "External monitor capture selection through native picker",
  "App-window capture through native picker",
  "Capture extension panel by selecting browser window/screen in picker",
  "Webcam overlay visual confirmation in final recording on real hardware",
  "System audio availability by browser + OS"
];

const REQUIRED_WORKFLOWS = [
  "capture-tab-editor-savecopy-memory-reload",
  "select-area-save-cropped-export-png",
  "full-page-progress-save-export-pdf",
  "capture-screen-window-preview-save-editor-download",
  "select-area-screen-window-crop-save-memory",
  "import-local-image-edit-save-export-jpg-pdf",
  "paste-clipboard-image-edit-save",
  "bulk-memory-export-zip-real-payload",
  "settings-affect-capture-flow",
  "delete-all-data-clears-indexeddb"
];

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mapKey(page, selector) {
  return `${page}::${selector}`;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function assertFreshArtifact(filePath, maxAgeMs) {
  const stats = await fs.stat(filePath);
  const ageMs = Date.now() - stats.mtimeMs;
  assert.ok(ageMs <= maxAgeMs, `${path.basename(filePath)} is stale (${Math.round(ageMs / 1000)}s old)`);
}

test("full UI operability gate validates control audit + workflow audit and writes release-candidate report", async () => {
  await fs.mkdir(resultsDir, { recursive: true });

  await assertFreshArtifact(wiringPath, 30 * 60 * 1000);
  await assertFreshArtifact(workflowsPath, 30 * 60 * 1000);

  const wiring = await readJson(wiringPath);
  const workflowAudit = await readJson(workflowsPath);

  const controls = Array.isArray(wiring.controls) ? wiring.controls : [];
  const controlFailures = Array.isArray(wiring.failures) ? wiring.failures : [];
  const controlWarnings = Array.isArray(wiring.warnings) ? wiring.warnings : [];

  const workflowRows = Array.isArray(workflowAudit.workflows) ? workflowAudit.workflows : [];
  const workflowFailures = workflowRows.filter((row) => row.status !== "pass");

  const requiredControls = [
    ["popup.html", "button[data-action=\"capture-visible\"]"],
    ["popup.html", "button[data-action=\"capture-region\"]"],
    ["popup.html", "button[data-action=\"capture-full\"]"],
    ["popup.html", "button[data-action=\"capture-screen-window\"]"],
    ["popup.html", "button[data-action=\"start-recording\"]"],
    ["popup.html", "button[data-action=\"annotate-local-image\"]"],
    ["editor.html", "button#saveCopyBtn"],
    ["editor.html", "button#openExportPanelBtn"],
    ["export-report.html", "button#downloadPdfBtn"],
    ["record.html", "button#startBtn"],
    ["options.html", "button#deleteAllBtn"]
  ];

  const byControl = new Map();
  for (const row of controls) {
    byControl.set(mapKey(normalize(row.page), normalize(row.selector)), row);
  }

  const missingRequiredControls = [];
  for (const [page, selector] of requiredControls) {
    const hit = byControl.get(mapKey(page, selector));
    if (!hit || hit.pass !== true) {
      missingRequiredControls.push({ page, selector });
    }
  }

  const byWorkflowId = new Map(workflowRows.map((row) => [String(row.id || ""), row]));
  const missingRequiredWorkflows = REQUIRED_WORKFLOWS.filter((workflowId) => !byWorkflowId.has(workflowId));

  const blockers = [];
  if (controlFailures.length > 0) {
    blockers.push(`${controlFailures.length} enabled controls failed wiring verification.`);
  }
  if (missingRequiredControls.length > 0) {
    blockers.push(`${missingRequiredControls.length} required controls missing or failing.`);
  }
  if (workflowFailures.length > 0) {
    blockers.push(`${workflowFailures.length} required workflows failed.`);
  }
  if (missingRequiredWorkflows.length > 0) {
    blockers.push(`${missingRequiredWorkflows.length} required workflows missing from audit.`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    controlsTested: Number(wiring.totalControls || controls.length),
    controlsPassed: Number(wiring.passed || controls.filter((row) => row.pass).length),
    controlsFailed: Number(wiring.failed || controlFailures.length),
    controlsWarnings: controlWarnings.length,
    workflowsTested: Number(workflowAudit.totalWorkflows || workflowRows.length),
    workflowsPassed: Number(workflowAudit.passedWorkflows || workflowRows.filter((row) => row.status === "pass").length),
    workflowsFailed: Number(workflowAudit.failedWorkflows || workflowFailures.length),
    requiredControlsChecked: requiredControls.length,
    requiredWorkflowsChecked: REQUIRED_WORKFLOWS.length,
    missingRequiredControls,
    missingRequiredWorkflows,
    manualHardwareOnlyChecks: MANUAL_HARDWARE_CHECKS,
    releaseBlockers: blockers
  };

  await fs.writeFile(outJson, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const mdLines = [
    "# Full UI Operability Audit",
    "",
    `- Generated: ${summary.generatedAt}`,
    `- Controls tested: ${summary.controlsTested}`,
    `- Controls passed: ${summary.controlsPassed}`,
    `- Controls failed: ${summary.controlsFailed}`,
    `- Workflow tests: ${summary.workflowsTested}`,
    `- Workflows passed: ${summary.workflowsPassed}`,
    `- Workflows failed: ${summary.workflowsFailed}`,
    "",
    "## Release Blockers",
    ...(summary.releaseBlockers.length > 0 ? summary.releaseBlockers.map((entry) => `- ${entry}`) : ["- None"]),
    "",
    "## Missing Required Controls",
    ...(missingRequiredControls.length > 0
      ? missingRequiredControls.map((entry) => `- ${entry.page} ${entry.selector}`)
      : ["- None"]),
    "",
    "## Missing Required Workflows",
    ...(missingRequiredWorkflows.length > 0
      ? missingRequiredWorkflows.map((entry) => `- ${entry}`)
      : ["- None"]),
    "",
    "## Manual Hardware-Only Checks",
    ...MANUAL_HARDWARE_CHECKS.map((entry) => `- ${entry}`)
  ];

  await fs.writeFile(outMd, `${mdLines.join("\n")}\n`, "utf8");

  const workflowRowsForReport = workflowRows.map((row) => {
    const title = String(row.title || row.id || "workflow").replace(/\|/g, "\\|");
    const status = String(row.status || "unknown");
    const notes = String(row.notes || "").replace(/\|/g, "\\|");
    return `| ${title} | ${status} | ${notes} |`;
  });

  const releaseReport = [
    "# Release Candidate Report",
    "",
    "## Controls",
    `- Controls tested: ${summary.controlsTested}`,
    `- Controls passed: ${summary.controlsPassed}`,
    `- Controls failed: ${summary.controlsFailed}`,
    "",
    "## Workflows",
    `- Workflows tested: ${summary.workflowsTested}`,
    `- Workflows passed: ${summary.workflowsPassed}`,
    `- Workflows failed: ${summary.workflowsFailed}`,
    "",
    "| Workflow | Status | Notes |",
    "|---|---|---|",
    ...(workflowRowsForReport.length ? workflowRowsForReport : ["| None | fail | No workflow evidence generated |"]),
    "",
    "## Manual Hardware-Only Checks",
    ...MANUAL_HARDWARE_CHECKS.map((entry) => `- ${entry}`),
    "",
    "## Public Release Readiness",
    `- Ready for public release: ${blockers.length === 0 && MANUAL_HARDWARE_CHECKS.length === 0 ? "yes" : "no"}`,
    ""
  ].join("\n");

  await fs.writeFile(releaseCandidateReportPath, releaseReport, "utf8");

  assert.equal(summary.controlsFailed, 0, "enabled controls must pass wiring verification");
  assert.deepEqual(missingRequiredControls, [], "required controls are missing/failing");
  assert.equal(summary.workflowsFailed, 0, "required operability workflows failed");
  assert.deepEqual(missingRequiredWorkflows, [], "required operability workflows are missing");
  assert.deepEqual(blockers, [], "release candidate gate has blockers");
});
