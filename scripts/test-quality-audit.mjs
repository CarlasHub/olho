import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const testsDir = path.join(root, "tests");
const outDir = path.join(root, "test-results");
const outJson = path.join(outDir, "test-quality-matrix.json");
const outMd = path.join(outDir, "test-quality-matrix.md");
const coreProofPath = path.join(outDir, "core-proof-evidence.json");

function isLikelyRealE2E(fileName) {
  return fileName.includes("e2e-real") || fileName.includes("operability") || fileName.includes("full-ui-operability");
}

function classify(fileName, text) {
  const usesRealExtension = /withRealExtension\(|launchExtension\(/.test(text);
  const usesRealBrowser = usesRealExtension || /puppeteer|browser\.newPage\(/.test(text);
  const usesMocks = /FakeMediaStream|FakeTrack|FakeMediaRecorder|__olhoTestScreenCaptureBlob|seedImage\(/.test(text);
  const staticOnly = /\.includes\("/.test(text) && !usesRealBrowser;
  const couldPassWhileBroken = staticOnly || usesMocks;

  const blindSpots = [];
  if (staticOnly) blindSpots.push("static string assertions");
  if (usesMocks) blindSpots.push("mocked runtime paths");
  if (usesRealBrowser && /waitForSelector\(/.test(text) && !/signature|mime|blob|size|JSON\.parse|%PDF|RIFF/.test(text)) {
    blindSpots.push("selector/wiring heavy assertions");
  }

  return {
    testFile: fileName,
    claimedPurpose: isLikelyRealE2E(fileName) ? "E2E/operability" : "unit/integration/static",
    actualBehaviourTested: staticOnly ? "source/static assertions" : (usesMocks ? "mock-driven flow" : "runtime behavior"),
    usesRealBuiltExtension: usesRealExtension,
    usesRealBrowser,
    usesMocks,
    staticOnly,
    couldPassWhileBroken,
    knownBlindSpot: blindSpots.join(", ") || "none flagged",
    requiredImprovement: staticOnly
      ? "retain as support test, do not use as release proof"
      : usesMocks
        ? "retain as boundary test, pair with real behavior proof"
        : "expand failure-case coverage",
    keepFixReplace: staticOnly || usesMocks ? "fix" : "keep"
  };
}

function table(rows) {
  const head = [
    "| Test file | Claimed purpose | Actual behaviour tested | Uses real built extension? | Uses real browser? | Uses mocks? | Static-only? | Could pass while broken? | Known blind spot | Required improvement | Keep/fix/replace |",
    "|---|---|---|---|---|---|---|---|---|---|---|"
  ];
  const body = rows.map((row) => `| ${row.testFile} | ${row.claimedPurpose} | ${row.actualBehaviourTested} | ${row.usesRealBuiltExtension ? "yes" : "no"} | ${row.usesRealBrowser ? "yes" : "no"} | ${row.usesMocks ? "yes" : "no"} | ${row.staticOnly ? "yes" : "no"} | ${row.couldPassWhileBroken ? "yes" : "no"} | ${row.knownBlindSpot.replace(/\|/g, "\\|")} | ${row.requiredImprovement.replace(/\|/g, "\\|")} | ${row.keepFixReplace} |`);
  return [...head, ...body].join("\n");
}

function hasAll(value, keys) {
  return keys.every((key) => Boolean(value?.[key]));
}

async function readCoreProof() {
  try {
    return JSON.parse(await fs.readFile(coreProofPath, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const entries = await fs.readdir(testsDir);
  const files = entries.filter((name) => name.endsWith(".test.mjs")).sort();
  const rows = [];

  for (const file of files) {
    const text = await fs.readFile(path.join(testsDir, file), "utf8");
    rows.push(classify(file, text));
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outJson, `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`, "utf8");
  await fs.writeFile(outMd, `# Test Quality Matrix\n\n- Generated: ${new Date().toISOString()}\n- Tests audited: ${rows.length}\n\n${table(rows)}\n`, "utf8");

  const coreProof = await readCoreProof();
  const captureProven = hasAll(coreProof.captureTab, ["blobExists", "blobSizeGtZero", "savedIndexedDb"]);
  const regionProven = hasAll(coreProof.selectAreaTab, ["croppedBlobSaved", "escapeCancelHandled"]);
  const fullPageProven = hasAll(coreProof.fullPage, ["provenCommonFixtures", "hostileFixture", "canvasLimitGuard"]);
  const editorProven = hasAll(coreProof.editorOutput, ["cropApplied", "resizeApplied", "textRendered", "redactionFlattened", "previewExportParity"]);
  const exportProven = hasAll(coreProof.exportOutput, ["pngHeaderValid", "pdfHeaderValid", "zipEntriesNonEmpty", "jsonParses"]);
  const networkProven = hasAll(coreProof.runtimeNetwork, ["monitoredInRealBrowser", "popup", "captureTab", "fullPage"]);

  const criticalGaps = [];
  if (!captureProven) criticalGaps.push("capture tab real proof missing");
  if (!regionProven) criticalGaps.push("select area real proof missing");
  if (!fullPageProven) criticalGaps.push("full-page forensic proof missing");
  if (!editorProven) criticalGaps.push("editor output-truth proof missing");
  if (!exportProven) criticalGaps.push("export output validation proof missing");
  if (!networkProven) criticalGaps.push("runtime outbound network proof missing");

  if (criticalGaps.length > 0) {
    throw new Error(`Core feature release proofs are incomplete:\n- ${criticalGaps.join("\n- ")}`);
  }
}

main().catch((error) => {
  console.error("[test-quality-audit] FAIL", error?.message || error);
  process.exit(1);
});
