import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test-results");
const outJson = path.join(outDir, "claim-inventory.json");
const outMd = path.join(outDir, "claim-inventory.md");
const coreProofPath = path.join(outDir, "core-proof-evidence.json");
const workflowAuditPath = path.join(outDir, "operability-workflows-audit.json");
const releaseReportPath = path.join(root, "RELEASE_CHECK.md");

const PROOF = {
  REAL_E2E: "real browser E2E",
  MANUAL: "manual verified",
  INTEGRATION: "integration test",
  MOCKED: "mocked only",
  STATIC: "static only",
  NONE: "no proof"
};

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

async function readTextSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function toMdTable(rows) {
  const head = [
    "| Claim ID | Source file / UI location | Exact claim | Feature area | User-facing | What behaviour would prove it | Current proof found | Proof quality | Current status | Required verification |",
    "|---|---|---|---|---|---|---|---|---|---|"
  ];
  const body = rows.map((row) => {
    return `| ${row.id} | ${row.source} | ${row.claim.replace(/\|/g, "\\|")} | ${row.area} | ${row.userFacing ? "yes" : "no"} | ${row.prove.replace(/\|/g, "\\|")} | ${row.proofFound.replace(/\|/g, "\\|")} | ${row.quality} | ${row.status} | ${row.required.replace(/\|/g, "\\|")} |`;
  });
  return [...head, ...body].join("\n");
}

function hasAll(value, keys) {
  return keys.every((key) => Boolean(value?.[key]));
}

async function main() {
  const coreProof = await readJsonSafe(coreProofPath);
  const workflows = await readJsonSafe(workflowAuditPath);
  const releaseCheck = await readTextSafe(releaseReportPath);

  const captureTabProven = hasAll(coreProof.captureTab, [
    "productionRouteInvoked",
    "realFixtureFlow",
    "blobExists",
    "blobSizeGtZero",
    "mimeImage",
    "dimensionsSensible",
    "savedIndexedDb",
    "memoryRecordExists",
    "thumbnailExistsOrFallback",
    "editorOpenVerified"
  ]);
  const selectAreaTabProven = hasAll(coreProof.selectAreaTab, [
    "productionRouteInvoked",
    "overlayRendered",
    "hostileCssFixturePassed",
    "dragSelectionConfirmed",
    "croppedBlobSaved",
    "croppedDimensionsValidated",
    "overlayRemovedAfterConfirm",
    "escapeCancelHandled"
  ]);
  const fullPageProven = hasAll(coreProof.fullPage, [
    "provenCommonFixtures",
    "longFixture",
    "stickyFixture",
    "lazyFixture",
    "hostileFixture",
    "canvasLimitGuard"
  ]);
  const screenWindowLimited = hasAll(coreProof.screenWindowStill, [
    "productionRouteInvoked",
    "blobSavedIndexedDb",
    "tracksStopped",
    "cancelHandled"
  ]) && Boolean(coreProof?.manualRequired?.screenWindowNativePicker);
  const recordingLimited = hasAll(coreProof.recording, [
    "productionRouteInvoked",
    "blobExists",
    "blobSizeGtZero",
    "mimeVideo",
    "savedIndexedDb",
    "tracksStopped"
  ]) && Boolean(coreProof?.manualRequired?.recordingHardwareAudioVideo);
  const editorProven = hasAll(coreProof.editorOutput, [
    "cropApplied",
    "resizeApplied",
    "textRendered",
    "redactionFlattened",
    "previewExportParity"
  ]);
  const exportProven = hasAll(coreProof.exportOutput, [
    "pngHeaderValid",
    "jpgHeaderValid",
    "webpHeaderValid",
    "pdfHeaderValid",
    "zipHasEntries",
    "zipEntriesNonEmpty",
    "jsonParses",
    "htmlSanitized",
    "markdownContainsExpected"
  ]);
  const runtimeNetworkProven = hasAll(coreProof.runtimeNetwork, [
    "monitoredInRealBrowser",
    "popup",
    "captureTab",
    "selectArea",
    "fullPage",
    "editor",
    "memory",
    "export",
    "recorderLoad",
    "settings",
    "privacy"
  ]) && Number(coreProof?.runtimeNetwork?.unexpectedOutboundRequests ?? -1) === 0;
  const memoryCoreProven = Number(workflows?.passedWorkflows || 0) >= 10;
  const releaseCandidateClaimMatches = /Release verdict:\s*release candidate/i.test(releaseCheck);
  const publicReadyNo = /Public Chrome Web Store ready:\s*no/i.test(releaseCheck);

  const claims = [
    {
      id: "C001",
      source: "README.md Feature Matrix",
      claim: "Capture visible area works in real extension flow.",
      area: "Capture",
      userFacing: true,
      prove: "Popup capture-visible on real fixture page saves non-empty image Blob + thumbnail in IndexedDB and opens editor.",
      proofFound: captureTabProven ? "Real fixture flow validated in e2e-real-capture-recorder." : "Core capture-tab proof flags incomplete.",
      quality: captureTabProven ? PROOF.REAL_E2E : PROOF.NONE,
      status: captureTabProven ? "proven" : "unproven",
      required: "Run real capture-tab E2E and write proof flags."
    },
    {
      id: "C002",
      source: "README.md Feature Matrix",
      claim: "Capture selected area works in real extension flow.",
      area: "Capture",
      userFacing: true,
      prove: "Popup capture-region on real/hostile fixture validates overlay, crop dimensions, save, and Escape cancel.",
      proofFound: selectAreaTabProven ? "Real hostile fixture region flow validated in e2e-real-capture-recorder." : "Core select-area-tab proof flags incomplete.",
      quality: selectAreaTabProven ? PROOF.REAL_E2E : PROOF.NONE,
      status: selectAreaTabProven ? "proven" : "unproven",
      required: "Run real region E2E and write proof flags."
    },
    {
      id: "C003",
      source: "README.md Feature Matrix",
      claim: "Capture full page works on common fixtures.",
      area: "Capture",
      userFacing: true,
      prove: "Forensic full-page E2E across long/sticky/lazy/hostile fixtures + canvas-limit guard.",
      proofFound: fullPageProven ? "Forensic suite validated all required fixture classes." : "Full-page forensic proof flags incomplete.",
      quality: fullPageProven ? PROOF.REAL_E2E : PROOF.NONE,
      status: fullPageProven ? "proven" : "unproven",
      required: "Run full-page forensic suite and write proof flags."
    },
    {
      id: "C004",
      source: "FEATURE_PARITY_MATRIX.md",
      claim: "Capture screen/window works, with native picker/hardware limits disclosed.",
      area: "Capture",
      userFacing: true,
      prove: "Production screen/window still route proven at browser API boundary + manual-required native picker checks documented.",
      proofFound: screenWindowLimited ? "Boundary-mocked production route proven; manual hardware checklist retained." : "Screen/window proof or manual-limit disclosure incomplete.",
      quality: screenWindowLimited ? PROOF.INTEGRATION : PROOF.NONE,
      status: screenWindowLimited ? "browser-limited" : "unproven",
      required: "Keep manual native-picker verification list and production-route assertions."
    },
    {
      id: "C005",
      source: "README.md + RELEASE_CHECK.md",
      claim: "Recording works with browser/OS/hardware limitations clearly disclosed.",
      area: "Recording",
      userFacing: true,
      prove: "Production recording route creates non-empty Blob, saves locally, and manual hardware checks remain explicit.",
      proofFound: recordingLimited ? "Boundary-mocked production recorder proof exists; manual hardware list present." : "Recording proof/manual-disclosure incomplete.",
      quality: recordingLimited ? PROOF.INTEGRATION : PROOF.NONE,
      status: recordingLimited ? "browser-limited" : "unproven",
      required: "Keep recording manual-hardware checklist and production-route assertions."
    },
    {
      id: "C006",
      source: "README.md Feature Matrix",
      claim: "Editor crop/resize/text/redaction/export parity is proven by output behavior.",
      area: "Editor",
      userFacing: true,
      prove: "Pixel/dimension assertions in editor output-truth E2E.",
      proofFound: editorProven ? "Editor output-truth E2E proof flags complete." : "Editor output-truth flags incomplete.",
      quality: editorProven ? PROOF.REAL_E2E : PROOF.NONE,
      status: editorProven ? "proven" : "unproven",
      required: "Run editor output-truth E2E and write proof flags."
    },
    {
      id: "C007",
      source: "README.md + export-report.html",
      claim: "Local export formats (PNG/JPG/WebP/PDF/ZIP/HTML/Markdown/JSON) generate valid outputs.",
      area: "Export",
      userFacing: true,
      prove: "Real export E2E validates file signatures/content and non-empty ZIP entries.",
      proofFound: exportProven ? "Export output proof flags complete." : "Export output proof flags incomplete.",
      quality: exportProven ? PROOF.REAL_E2E : PROOF.NONE,
      status: exportProven ? "proven" : "unproven",
      required: "Run export validation E2E and write proof flags."
    },
    {
      id: "C008",
      source: "README.md + gallery.html",
      claim: "Memory core workflows persist locally (save/open/bulk ZIP/delete-all).",
      area: "Memory",
      userFacing: true,
      prove: "Operability workflow audit passes core Memory workflows in real extension context.",
      proofFound: memoryCoreProven ? "Operability workflow audit reports all required workflows passing." : "Operability workflow audit missing pass evidence.",
      quality: memoryCoreProven ? PROOF.REAL_E2E : PROOF.NONE,
      status: memoryCoreProven ? "proven" : "unproven",
      required: "Pass operability workflow audit."
    },
    {
      id: "C009",
      source: "README.md + PRIVACY.md + privacy.html",
      claim: "No backend/cloud/analytics/telemetry in runtime behavior.",
      area: "Privacy",
      userFacing: true,
      prove: "Runtime network monitor across core flows with strict allowlist.",
      proofFound: runtimeNetworkProven ? "Runtime monitor found zero unexpected outbound requests." : "Runtime outbound monitor evidence incomplete.",
      quality: runtimeNetworkProven ? PROOF.REAL_E2E : PROOF.STATIC,
      status: runtimeNetworkProven ? "proven" : "unproven",
      required: "Run runtime network monitor E2E and keep allowlist strict."
    },
    {
      id: "C010",
      source: "RELEASE_CHECK.md",
      claim: "Release verdict is release candidate, not public ready.",
      area: "Release",
      userFacing: true,
      prove: "Release check doc reflects release candidate + public-ready=no while hardware checks remain.",
      proofFound: releaseCandidateClaimMatches && publicReadyNo ? "Release check states release candidate and public-ready=no." : "Release check verdict text is inconsistent.",
      quality: releaseCandidateClaimMatches && publicReadyNo ? PROOF.STATIC : PROOF.NONE,
      status: releaseCandidateClaimMatches && publicReadyNo ? "proven" : "false",
      required: "Keep public-ready=no until manual hardware verification is complete."
    }
  ];

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outJson, `${JSON.stringify({ generatedAt: new Date().toISOString(), claims }, null, 2)}\n`, "utf8");
  const md = [
    "# Claim Inventory",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Claims audited: ${claims.length}`,
    "",
    toMdTable(claims)
  ].join("\n");
  await fs.writeFile(outMd, `${md}\n`, "utf8");

  const blockers = claims.filter((row) => row.userFacing && row.status !== "proven" && row.status !== "browser-limited");
  if (blockers.length > 0) {
    const summary = blockers.map((row) => `${row.id} ${row.status}: ${row.claim}`).join("\n");
    throw new Error(`User-facing claims are unproven/exaggerated/false:\n${summary}`);
  }
}

main().catch((error) => {
  console.error("[claims-audit] FAIL", error?.message || error);
  process.exit(1);
});
