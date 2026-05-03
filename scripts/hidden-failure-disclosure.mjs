import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test-results");
const outJson = path.join(outDir, "hidden-failure-disclosure.json");
const outMd = path.join(outDir, "hidden-failure-disclosure.md");
const coreProofPath = path.join(outDir, "core-proof-evidence.json");
const workflowAuditPath = path.join(outDir, "operability-workflows-audit.json");

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

function table(items) {
  const head = [
    "| Hidden failure | Evidence | Why previous tests missed it | User impact | Severity | Required fix | Test needed | Release blocker |",
    "|---|---|---|---|---|---|---|---|"
  ];
  const body = items.map((row) => `| ${row.hiddenFailure.replace(/\|/g, "\\|")} | ${row.evidence.replace(/\|/g, "\\|")} | ${row.whyMissed.replace(/\|/g, "\\|")} | ${row.impact.replace(/\|/g, "\\|")} | ${row.severity} | ${row.requiredFix.replace(/\|/g, "\\|")} | ${row.testNeeded.replace(/\|/g, "\\|")} | ${row.blocker ? "yes" : "no"} |`);
  return [...head, ...body].join("\n");
}

async function main() {
  const coreProof = await readJsonSafe(coreProofPath);
  const workflows = await readJsonSafe(workflowAuditPath);
  const rows = [];

  if (!hasAll(coreProof.captureTab, ["blobExists", "mimeImage", "savedIndexedDb"])) {
    rows.push({
      hiddenFailure: "Capture tab UI can exist while successful output path is unproven.",
      evidence: "Missing capture-tab proof flags in core-proof-evidence.json.",
      whyMissed: "Static/wiring checks can pass without validating saved blob output.",
      impact: "Users may click Capture Tab and receive no usable result.",
      severity: "high",
      requiredFix: "Keep real fixture capture-tab E2E as required gate.",
      testNeeded: "tests/e2e-real-capture-recorder.test.mjs capture-visible proof flow",
      blocker: true
    });
  }

  if (!hasAll(coreProof.selectAreaTab, ["overlayRendered", "croppedBlobSaved", "escapeCancelHandled"])) {
    rows.push({
      hiddenFailure: "Select area claim can pass UI checks without crop output proof.",
      evidence: "Missing select-area-tab proof flags in core-proof-evidence.json.",
      whyMissed: "Button/overlay presence does not prove persisted cropped output.",
      impact: "Region capture can silently fail or save wrong dimensions.",
      severity: "high",
      requiredFix: "Keep hostile-fixture drag/crop/cancel E2E in gate.",
      testNeeded: "tests/e2e-real-capture-recorder.test.mjs capture-region proof flow",
      blocker: true
    });
  }

  if (!hasAll(coreProof.runtimeNetwork, ["monitoredInRealBrowser", "popup", "captureTab", "fullPage", "privacy"])) {
    rows.push({
      hiddenFailure: "No-runtime-network claim can be based on static scans only.",
      evidence: "Runtime network monitor proof flags are missing or incomplete.",
      whyMissed: "Static scans do not observe dynamic outbound requests.",
      impact: "Unexpected remote requests could ship undetected.",
      severity: "high",
      requiredFix: "Run runtime network E2E and keep strict allowlist.",
      testNeeded: "tests/e2e-real-runtime-network.test.mjs",
      blocker: true
    });
  }

  if (Number(workflows?.failedWorkflows || 0) > 0) {
    rows.push({
      hiddenFailure: "Workflow report can show partial implementation while isolated tests pass.",
      evidence: `operability-workflows-audit reports ${workflows.failedWorkflows} failed workflow(s).`,
      whyMissed: "Unit/static tests can miss cross-surface workflow failures.",
      impact: "Users experience broken end-to-end flows.",
      severity: "high",
      requiredFix: "Fix failing workflows and keep workflow audit blocking.",
      testNeeded: "tests/e2e-real-operability-workflows.test.mjs",
      blocker: true
    });
  }

  if (Boolean(coreProof?.manualRequired?.recordingHardwareAudioVideo)) {
    rows.push({
      hiddenFailure: "Recording hardware/browser verification remains manual-only.",
      evidence: "core-proof-evidence manualRequired.recordingHardwareAudioVideo=true",
      whyMissed: "Automation cannot exercise native picker/device hardware end-to-end.",
      impact: "Public-ready status would overstate hardware confidence.",
      severity: "medium",
      requiredFix: "Complete manual hardware matrix before public release.",
      testNeeded: "MANUAL_DEVICE_CAPTURE_QA.md checklist execution",
      blocker: false
    });
  }

  await fs.mkdir(outDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    rows
  };
  await fs.writeFile(outJson, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const md = [
    "# Hidden Failure Disclosure",
    "",
    `- Generated: ${payload.generatedAt}`,
    `- Findings: ${rows.length}`,
    "",
    rows.length ? table(rows) : "No unresolved hidden-failure findings in current evidence set."
  ].join("\n");

  await fs.writeFile(outMd, `${md}\n`, "utf8");
}

main().catch((error) => {
  console.error("[hidden-failure-disclosure] FAIL", error?.message || error);
  process.exit(1);
});
