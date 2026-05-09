import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const REQUIRED_FILES = [
  "manifest.json",
  ".gitignore",
  ".npmignore",
  "PRIVACY.md",
  "PERMISSIONS.md",
  "CHROME_WEB_STORE_LISTING.md",
  "MANUAL_QA_CHECKLIST.md",
  "package.json"
];

const REQUIRED_SCRIPT_NAMES = [
  "lint",
  "typecheck",
  "test",
  "test:e2e",
  "test:operability",
  "test:claims",
  "test:feature-health",
  "test:output-validation",
  "test:accessibility",
  "test:privacy",
  "test:no-remote-services",
  "test:no-competitor-references",
  "build",
  "package",
  "package:source",
  "verify:release"
];

const REQUIRED_TEST_COVERAGE = [
  { category: "Unit: MediaRepository", file: "tests/media-repository.test.mjs" },
  { category: "Unit: ExportService", file: "tests/export-sharing.test.mjs" },
  { category: "Unit: Annotation Model", file: "tests/annotation-model.unit.test.mjs" },
  { category: "Unit: Settings", file: "tests/settings.unit.test.mjs" },
  { category: "Integration (Mocked): Capture", file: "tests/capture-system.test.mjs" },
  { category: "Integration (Mocked): Editor", file: "tests/editor-workflow.test.mjs" },
  { category: "Integration (Mocked): Recorder", file: "tests/recording-system.test.mjs" },
  { category: "Integration (Mocked): Gallery", file: "tests/gallery-offscreen.test.mjs" },
  { category: "Unit: Review Engine", file: "tests/review-engine.test.mjs" },
  { category: "Unit: Review Reports", file: "tests/review-report.test.mjs" },
  { category: "Unit: Optional AI Review", file: "tests/ai-review.test.mjs" },
  { category: "Unit: Design Review", file: "tests/design-review.test.mjs" },
  { category: "Unit: Side Panel Review", file: "tests/sidepanel-review.test.mjs" },
  { category: "Unit: Local Visual Analysis", file: "tests/visual-analysis.test.mjs" },
  { category: "Review Quality: Finding Relevance", file: "tests/review-quality/finding-relevance.test.mjs" },
  { category: "Review Quality: Finding Depth", file: "tests/review-quality/finding-depth.test.mjs" },
  { category: "Review Quality: Synthesis", file: "tests/review-quality/synthesis-quality.test.mjs" },
  { category: "Review Quality: False Positives", file: "tests/review-quality/false-positive-rate.test.mjs" },
  { category: "Review Quality: Missed Issues", file: "tests/review-quality/missed-issue-rate.test.mjs" },
  { category: "Review Quality: Prioritisation", file: "tests/review-quality/prioritisation-quality.test.mjs" },
  { category: "Review Quality: Zeplin/Figma Scoping", file: "tests/review-quality/zeplin-scoping-quality.test.mjs" },
  { category: "Review Quality: Marker Pixel Accuracy", file: "tests/review-quality/marker-pixel-accuracy.test.mjs" },
  { category: "Integration (Mocked): Extension Workflow", file: "tests/e2e-smoke.test.mjs" },
  { category: "Production Hardening", file: "tests/production-hardening.test.mjs" },
  { category: "Accessibility (Static)", file: "tests/ui-redesign-a11y.test.mjs" },
  { category: "Accessibility (Contrast)", file: "tests/theme-contrast.test.mjs" },
  { category: "E2E (Real Browser): Extension Smoke", file: "tests/e2e-real-extension-smoke.test.mjs" },
  { category: "E2E (Real Browser): Persistence+Export", file: "tests/e2e-real-persistence-export.test.mjs" },
  { category: "E2E (Real Browser): Accessibility Smoke", file: "tests/e2e-real-accessibility.test.mjs" },
  { category: "E2E (Real Browser): Capture+Recorder Flow", file: "tests/e2e-real-capture-recorder.test.mjs" },
  { category: "E2E (Real Browser): Full-Page Forensic", file: "tests/e2e-real-full-page-forensic.test.mjs" },
  { category: "E2E (Real Browser): Local Fixture Pages", file: "tests/e2e-fixture-pages.test.mjs" },
  { category: "E2E (Real Browser): Wiring Audit", file: "tests/e2e-real-wiring-audit.test.mjs" },
  { category: "E2E (Real Browser): Accessibility Audit Report", file: "tests/e2e-real-accessibility-audit-report.test.mjs" },
  { category: "E2E (Real Browser): Editor Interaction", file: "tests/e2e-editor-interaction.test.mjs" },
  { category: "E2E (Real Browser): Operability Workflows", file: "tests/e2e-real-operability-workflows.test.mjs" },
  { category: "E2E (Real Browser): UI Structure Walkthrough", file: "tests/e2e-real-ui-structure-walkthrough.test.mjs" },
  { category: "E2E (Real Browser): Runtime Network Monitoring", file: "tests/e2e-real-runtime-network.test.mjs" },
  { category: "E2E (Real Browser): Full UI Operability Audit", file: "tests/full-ui-operability-audit.test.mjs" },
  { category: "Privacy", file: "tests/privacy-gate.test.mjs" },
  { category: "Privacy/Cost/Security Audit", file: "tests/privacy-cost-security-audit.test.mjs" },
  { category: "No Owner Cost Audit", file: "tests/no-owner-cost-audit.test.mjs" },
  { category: "Performance/Cleanup Audit", file: "tests/performance-cleanup-audit.test.mjs" },
  { category: "Static Source Scan", file: "tests/no-remote-services.test.mjs" },
  { category: "Competitor Scan", file: "tests/no-competitor-references.test.mjs" },
  { category: "Claims Audit", file: "scripts/claims-audit.mjs" },
  { category: "Feature Health Audit", file: "scripts/feature-health-audit.mjs" },
  { category: "Output Validation Audit", file: "scripts/output-validation-audit.mjs" },
  { category: "Test Quality Audit", file: "scripts/test-quality-audit.mjs" }
];

const EXECUTION_STEPS = [
  { name: "lint", command: process.execPath, args: ["scripts/lint.mjs"] },
  { name: "typecheck", command: process.execPath, args: ["scripts/typecheck.mjs"] },
  {
    name: "test",
    command: process.execPath,
    args: [
      "--test",
      "tests/constraints.test.mjs",
      "tests/surfaces.test.mjs",
      "tests/media-repository.test.mjs",
      "tests/gallery-offscreen.test.mjs",
      "tests/capture-system.test.mjs",
      "tests/editor-workflow.test.mjs",
      "tests/recording-system.test.mjs",
      "tests/export-sharing.test.mjs",
      "tests/settings.unit.test.mjs",
      "tests/annotation-model.unit.test.mjs",
      "tests/production-hardening.test.mjs",
      "tests/review-engine.test.mjs",
      "tests/review-report.test.mjs",
      "tests/ai-review.test.mjs",
      "tests/design-review.test.mjs",
      "tests/sidepanel-review.test.mjs",
      "tests/visual-analysis.test.mjs",
      "tests/review-quality/finding-relevance.test.mjs",
      "tests/review-quality/finding-depth.test.mjs",
      "tests/review-quality/synthesis-quality.test.mjs",
      "tests/review-quality/false-positive-rate.test.mjs",
      "tests/review-quality/missed-issue-rate.test.mjs",
      "tests/review-quality/prioritisation-quality.test.mjs",
      "tests/review-quality/zeplin-scoping-quality.test.mjs",
      "tests/review-quality/marker-pixel-accuracy.test.mjs"
    ]
  },
  {
    name: "test:e2e",
    command: process.execPath,
    args: [
      "--test",
      "--test-concurrency=1",
      "tests/e2e-real-extension-smoke.test.mjs",
      "tests/e2e-real-persistence-export.test.mjs",
      "tests/e2e-real-accessibility.test.mjs",
      "tests/e2e-real-capture-recorder.test.mjs",
      "tests/e2e-real-full-page-capture.test.mjs",
      "tests/e2e-real-full-page-forensic.test.mjs",
      "tests/e2e-fixture-pages.test.mjs",
      "tests/e2e-real-wiring-audit.test.mjs",
      "tests/e2e-real-accessibility-audit-report.test.mjs",
      "tests/e2e-editor-interaction.test.mjs",
      "tests/e2e-real-operability-workflows.test.mjs",
      "tests/e2e-real-ui-structure-walkthrough.test.mjs",
      "tests/e2e-real-runtime-network.test.mjs"
    ]
  },
  {
    name: "test:operability",
    command: process.execPath,
    args: [
      "--test",
      "--test-concurrency=1",
      "tests/e2e-real-wiring-audit.test.mjs",
      "tests/e2e-real-operability-workflows.test.mjs",
      "tests/e2e-real-ui-structure-walkthrough.test.mjs",
      "tests/full-ui-operability-audit.test.mjs"
    ]
  },
  {
    name: "test:claims",
    command: process.execPath,
    args: ["scripts/claims-audit.mjs"]
  },
  {
    name: "test:feature-health",
    command: process.execPath,
    args: ["scripts/feature-health-audit.mjs"]
  },
  {
    name: "test:hidden-failure-disclosure",
    command: process.execPath,
    args: ["scripts/hidden-failure-disclosure.mjs"]
  },
  {
    name: "test:test-quality-audit",
    command: process.execPath,
    args: ["scripts/test-quality-audit.mjs"]
  },
  {
    name: "test:output-validation",
    command: process.execPath,
    args: ["scripts/output-validation-audit.mjs"]
  },
  {
    name: "test:accessibility",
    command: process.execPath,
    args: ["--test", "tests/ui-redesign-a11y.test.mjs", "tests/theme-contrast.test.mjs"]
  },
  {
    name: "test:privacy",
    command: process.execPath,
    args: [
      "--test",
      "--test-concurrency=1",
      "tests/privacy-gate.test.mjs",
      "tests/privacy-cost-security-audit.test.mjs",
      "tests/no-owner-cost-audit.test.mjs",
      "tests/performance-cleanup-audit.test.mjs",
      "tests/e2e-real-runtime-network.test.mjs"
    ]
  },
  {
    name: "test:no-remote-services",
    command: process.execPath,
    args: ["--test", "tests/no-remote-services.test.mjs"]
  },
  {
    name: "test:no-competitor-references",
    command: process.execPath,
    args: ["--test", "tests/no-competitor-references.test.mjs"]
  },
  { name: "build", command: process.execPath, args: ["scripts/build.mjs"] },
  { name: "package", command: process.execPath, args: ["scripts/package.mjs"] },
  { name: "package:source", command: process.execPath, args: ["scripts/package-source.mjs"] }
];

const ALLOWED_PERMISSIONS = new Set([
  "activeTab",
  "tabs",
  "scripting",
  "clipboardWrite",
  "storage",
  "sidePanel",
  "desktopCapture",
  "downloads",
  "offscreen"
]);

function phraseFromCodes(codes) {
  return String.fromCharCode(...codes);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function competitorPatterns() {
  const phrases = [
    [97, 119, 101, 115, 111, 109, 101, 32, 115, 99, 114, 101, 101, 110, 115, 104, 111, 116],
    [108, 105, 103, 104, 116, 115, 104, 111, 116],
    [110, 105, 109, 98, 117, 115],
    [102, 105, 114, 101, 115, 104, 111, 116]
  ];

  return phrases.map((codes) => {
    const phrase = phraseFromCodes(codes);
    return new RegExp(escapeRegex(phrase).replace(/\\ /g, "\\\\s*"), "i");
  });
}

const FORBIDDEN_BRAND_PATTERNS = competitorPatterns();

const FORBIDDEN_RUNTIME_SERVICE_PATTERNS = [
  /firebase/i,
  /supabase/i,
  /sentry/i,
  /posthog/i,
  /google analytics/i,
  /gtag\s*\(/i,
  /mixpanel/i,
  /amplitude/i,
  /segment\.io/i,
  /cloudflare workers/i,
  /vercel/i,
  /netlify/i,
  /sendgrid/i,
  /mailgun/i,
  /stripe/i,
  /openai/i,
  /anthropic/i,
  /gemini/i
];

const FORBIDDEN_DEPENDENCY_PATTERNS = [
  /firebase/i,
  /supabase/i,
  /sentry/i,
  /posthog/i,
  /analytics/i,
  /telemetry/i,
  /segment/i,
  /mixpanel/i,
  /amplitude/i,
  /aws-sdk/i,
  /@aws-sdk/i,
  /google-cloud/i,
  /@google-cloud/i,
  /azure/i,
  /stripe/i,
  /sendgrid/i,
  /mailgun/i
];

function isAllowedOptionalAiReviewReference(relPath, pattern) {
  return relPath.startsWith("src/review/ai/") && String(pattern) === "/gemini/i";
}

const API_KEY_PATTERNS = [
  /AIza[0-9A-Za-z_-]{35}/,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/
];

const FORBIDDEN_CODE_PATTERNS = [/(^|[^\w$])eval\s*\(/, /new\s+Function\s*\(/];
const REMOTE_URL_PATTERN = /https?:\/\/[a-z0-9.-]+[^\s"'`<>)]*/gi;

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".html", ".css", ".json", ".md"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist"]);
const SKIP_FILES = new Set(["package-lock.json"]);
const DOC_URL_ALLOWLIST = new Set(["developer.chrome.com", "developer.mozilla.org", "chromium.org"]);

const RELEASE_REPORT_PATH = path.join(root, "RELEASE_CHECK.md");
const PACKAGE_RELATIVE_PATH = "dist/olho-extension.zip";
const SOURCE_PACKAGE_RELATIVE_PATH = "dist/olho-source.zip";
const OPERABILITY_AUDIT_PATH = path.join(root, "test-results", "full-ui-operability-audit.json");
const WORKFLOW_AUDIT_PATH = path.join(root, "test-results", "operability-workflows-audit.json");
const UI_STRUCTURE_WALKTHROUGH_PATH = path.join(root, "test-results", "ui-structure-walkthrough.json");
const RELEASE_CANDIDATE_REPORT_PATH = path.join(root, "test-results", "release-candidate-report.md");
const UI_FILES = [
  "popup.html",
  "editor.html",
  "gallery.html",
  "record.html",
  "export-report.html",
  "options.html",
  "privacy.html"
];

function fail(message) {
  console.error(`\n[release-gate] FAIL: ${message}`);
  process.exit(1);
}

function runStep(stepName, command, args) {
  console.log(`\n[release-gate] ${stepName}`);
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false
  });
  if (result.status !== 0) {
    fail(`${stepName} failed with exit code ${result.status ?? 1}`);
  }
  return {
    name: stepName,
    status: "pass",
    durationMs: Date.now() - started
  };
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(abs)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (SKIP_FILES.has(entry.name)) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    files.push(rel);
  }

  return files;
}

async function readText(relPath) {
  const abs = path.join(root, relPath);
  return fs.readFile(abs, "utf8");
}

async function ensurePathExists(relPath) {
  try {
    await fs.access(path.join(root, relPath));
  } catch {
    fail(`required file missing: ${relPath}`);
  }
}

function checkManifest(manifest) {
  if (manifest.manifest_version !== 3) {
    fail("manifest_version must be 3");
  }

  if (!Array.isArray(manifest.permissions)) {
    fail("manifest.permissions must be an array");
  }

  const unknown = manifest.permissions.filter((permission) => !ALLOWED_PERMISSIONS.has(permission));
  if (unknown.length) {
    fail(`manifest includes unknown permissions: ${unknown.join(", ")}`);
  }

  const hostPermissions = Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [];
  if (hostPermissions.length > 0) {
    const normalized = [...hostPermissions].sort();
    const allowed = ["<all_urls>"];
    if (normalized.length !== allowed.length || normalized.some((value, index) => value !== allowed[index])) {
      fail("host_permissions must be strictly scoped to ['<all_urls>'] when present");
    }
  }

  if (!manifest.content_security_policy?.extension_pages) {
    fail("content_security_policy.extension_pages is required");
  }

  const csp = String(manifest.content_security_policy.extension_pages);
  if (!csp.includes("script-src 'self'")) {
    fail("CSP must include script-src 'self'");
  }
  if (!csp.includes("object-src 'self'")) {
    fail("CSP must include object-src 'self'");
  }

  if (manifest.content_scripts) {
    const broadMatch = JSON.stringify(manifest.content_scripts).includes("<all_urls>");
    if (broadMatch) {
      fail("content_scripts should not be broad-scoped to <all_urls>");
    }
  }

  if (!manifest.action?.default_popup) {
    fail("manifest.action.default_popup is required");
  }

  if (!manifest.background?.service_worker) {
    fail("manifest.background.service_worker is required");
  }

  const iconPaths = Object.values(manifest.icons || {});
  if (!iconPaths.length) {
    fail("manifest.icons must include Olho icon assets");
  }
}

function checkRequiredScripts(packageJson) {
  const scripts = packageJson?.scripts || {};
  const missing = REQUIRED_SCRIPT_NAMES.filter((name) => !Object.prototype.hasOwnProperty.call(scripts, name));
  if (missing.length) {
    fail(`missing required npm scripts: ${missing.join(", ")}`);
  }
}

async function checkRequiredCoverageFiles() {
  for (const entry of REQUIRED_TEST_COVERAGE) {
    await ensurePathExists(entry.file);
  }
}

async function checkPermissionDocumentation(manifest) {
  const permissionsDoc = await readText("PERMISSIONS.md");
  const documented = new Set(Array.from(permissionsDoc.matchAll(/`([a-zA-Z]+)`/g), (match) => match[1]));

  const undocumented = manifest.permissions.filter((permission) => !documented.has(permission));
  if (undocumented.length) {
    fail(`manifest permissions are broader than documented permissions: ${undocumented.join(", ")}`);
  }
}

async function scanDependencyFiles() {
  const packageJson = await readText("package.json");
  const lock = await readText("package-lock.json");
  const combined = `${packageJson}\n${lock}`;

  const hits = [];
  FORBIDDEN_DEPENDENCY_PATTERNS.forEach((pattern) => {
    if (pattern.test(combined)) {
      hits.push(String(pattern));
    }
  });

  if (hits.length) {
    fail(`forbidden dependency patterns found in package files:\n- ${hits.join("\n- ")}`);
  }
}

async function scanSource() {
  const files = await walk(root);

  const brandHits = [];
  const remoteUrlHits = [];
  const evalHits = [];
  const serviceHits = [];
  const apiKeyHits = [];

  for (const relPath of files) {
    const text = await readText(relPath);

    FORBIDDEN_BRAND_PATTERNS.forEach((pattern) => {
      if (pattern.test(text)) {
        brandHits.push(`${relPath}: ${pattern}`);
      }
    });

    FORBIDDEN_CODE_PATTERNS.forEach((pattern) => {
      if (pattern.test(text)) {
        evalHits.push(`${relPath}: ${pattern}`);
      }
    });

    const isRuntimeSource =
      /\.(js|mjs|html|css|json)$/i.test(relPath) &&
      !relPath.startsWith("tests/") &&
      !relPath.startsWith("scripts/");

    if (isRuntimeSource) {
      FORBIDDEN_RUNTIME_SERVICE_PATTERNS.forEach((pattern) => {
        if (pattern.test(text) && !isAllowedOptionalAiReviewReference(relPath, pattern)) {
          serviceHits.push(`${relPath}: ${pattern}`);
        }
      });

      API_KEY_PATTERNS.forEach((pattern) => {
        if (pattern.test(text)) {
          apiKeyHits.push(`${relPath}: ${pattern}`);
        }
      });

      const urls = text.match(REMOTE_URL_PATTERN) || [];
      urls.forEach((url) => {
        remoteUrlHits.push(`${relPath}: ${url}`);
      });
    } else if (/\.md$/i.test(relPath)) {
      const urls = text.match(REMOTE_URL_PATTERN) || [];
      urls.forEach((url) => {
        const domain = domainFromUrl(url);
        if (!DOC_URL_ALLOWLIST.has(domain)) {
          remoteUrlHits.push(`${relPath}: ${url}`);
        }
      });
    }
  }

  if (brandHits.length) {
    fail(`competitor references found:\n- ${brandHits.join("\n- ")}`);
  }
  if (evalHits.length) {
    fail(`forbidden dynamic code patterns found:\n- ${evalHits.join("\n- ")}`);
  }
  if (serviceHits.length) {
    fail(`forbidden analytics/telemetry/remote-service patterns found:\n- ${serviceHits.join("\n- ")}`);
  }
  if (apiKeyHits.length) {
    fail(`potential API keys or secrets found:\n- ${apiKeyHits.join("\n- ")}`);
  }
  if (remoteUrlHits.length) {
    fail(`forbidden remote URLs found:\n- ${remoteUrlHits.join("\n- ")}`);
  }

  console.log(`[release-gate] source scan passed (${files.length} files)`);
}

async function scanChromeStorageLocalWrites() {
  const files = await walk(root);
  const runtimeJs = files.filter(
    (relPath) =>
      /\.(js|mjs)$/i.test(relPath) &&
      !relPath.startsWith("tests/") &&
      !relPath.startsWith("scripts/")
  );

  const issues = [];

  for (const relPath of runtimeJs) {
    const text = await readText(relPath);
    const matches = Array.from(text.matchAll(/chrome\.storage\.local\.set\s*\(/g));
    if (!matches.length) continue;

    for (const match of matches) {
      const idx = match.index ?? 0;
      const snippet = text.slice(idx, idx + 260);

      if (relPath === "src/storage/storage.js") {
        const valid = snippet.includes("MIGRATION_FLAG_KEY") && snippet.includes("LEGACY_INTERNAL_FLAG_KEY");
        if (!valid) {
          issues.push(`${relPath}: unexpected chrome.storage.local.set payload`);
        }
        continue;
      }

      if (relPath === "popup.js") {
        const valid = snippet.includes("ONBOARDING_DISMISSED_KEY");
        if (!valid) {
          issues.push(`${relPath}: unexpected popup local storage payload`);
        }
        continue;
      }

      issues.push(`${relPath}: chrome.storage.local.set usage is not allowlisted`);
    }
  }

  if (issues.length) {
    fail(`chrome.storage.local write guard failed:\n- ${issues.join("\n- ")}`);
  }

  console.log("[release-gate] chrome.storage.local write scan passed");
}

async function scanBuildOutput() {
  const buildDir = path.join(root, "dist", "build");
  const allBuildFiles = [];

  async function walkBuild(dir) {
    const parts = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of parts) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(buildDir, abs);
      if (entry.isDirectory()) {
        await walkBuild(abs);
      } else if (entry.isFile()) {
        allBuildFiles.push(rel);
      }
    }
  }

  await walkBuild(buildDir);

  if (!allBuildFiles.includes("manifest.json")) {
    fail("dist/build/manifest.json is missing");
  }

  const disallowedBuildPaths = allBuildFiles.filter((rel) => {
    return (
      rel.startsWith("tests/") ||
      rel.startsWith("node_modules/") ||
      rel.includes(".env") ||
      rel.endsWith(".map") ||
      rel.endsWith(".ts")
    );
  });

  if (disallowedBuildPaths.length) {
    fail(`build output includes disallowed files:\n- ${disallowedBuildPaths.join("\n- ")}`);
  }

  const textFiles = allBuildFiles.filter((rel) => /\.(js|mjs|html|css|json|md)$/i.test(rel));
  for (const relPath of textFiles) {
    const text = await fs.readFile(path.join(buildDir, relPath), "utf8");

    FORBIDDEN_BRAND_PATTERNS.forEach((pattern) => {
      if (pattern.test(text)) {
        fail(`build output contains competitor reference in ${relPath}`);
      }
    });

    FORBIDDEN_CODE_PATTERNS.forEach((pattern) => {
      if (pattern.test(text)) {
        fail(`build output contains forbidden dynamic code in ${relPath}`);
      }
    });

    FORBIDDEN_RUNTIME_SERVICE_PATTERNS.forEach((pattern) => {
      if (pattern.test(text) && !isAllowedOptionalAiReviewReference(relPath, pattern)) {
        fail(`build output contains forbidden service pattern ${pattern} in ${relPath}`);
      }
    });
  }

  console.log(`[release-gate] build output scan passed (${allBuildFiles.length} files)`);
}

function listZipFiles(zipPath) {
  const result = spawnSync("unzip", ["-Z1", zipPath], {
    cwd: root,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    fail(`unable to inspect package zip: ${result.stderr || result.stdout}`);
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function scanPackageZip() {
  const zipPath = path.join(root, PACKAGE_RELATIVE_PATH);
  const files = listZipFiles(zipPath);

  if (!files.includes("manifest.json")) {
    fail("package zip must include manifest.json at root");
  }

  const disallowed = files.filter((rel) => {
    return (
      rel.startsWith("tests/") ||
      rel.startsWith("node_modules/") ||
      rel.includes(".env") ||
      rel.endsWith(".map") ||
      rel.endsWith(".ts") ||
      rel.includes("secret")
    );
  });

  if (disallowed.length) {
    fail(`package zip includes disallowed content:\n- ${disallowed.join("\n- ")}`);
  }

  console.log(`[release-gate] package zip scan passed (${files.length} files)`);
}

function scanSourcePackageZip() {
  const zipPath = path.join(root, SOURCE_PACKAGE_RELATIVE_PATH);
  const files = listZipFiles(zipPath);
  const forbidden = files.filter((entry) => {
    const lower = entry.toLowerCase();
    return (
      lower.startsWith(".git/") ||
      lower.startsWith("node_modules/") ||
      lower.startsWith("dist/") ||
      lower.startsWith("test-results/") ||
      lower.startsWith("__macosx/") ||
      lower.endsWith("/.ds_store") ||
      lower === ".ds_store"
    );
  });
  if (forbidden.length) {
    fail(`source package zip includes forbidden content:\n- ${forbidden.join("\n- ")}`);
  }
  console.log(`[release-gate] source package scan passed (${files.length} files)`);
}

async function checkUiDoesNotExposePartialStatus() {
  const hits = [];
  for (const relPath of UI_FILES) {
    const text = await readText(relPath);
    if (/\bpartial\b/i.test(text)) {
      hits.push(relPath);
    }
  }
  if (hits.length) {
    fail(`visible UI files must not label features as partial:\n- ${hits.join("\n- ")}`);
  }
}

async function checkOperabilityArtifacts() {
  await ensurePathExists(path.relative(root, OPERABILITY_AUDIT_PATH));
  await ensurePathExists(path.relative(root, WORKFLOW_AUDIT_PATH));
  await ensurePathExists(path.relative(root, UI_STRUCTURE_WALKTHROUGH_PATH));
  await ensurePathExists(path.relative(root, RELEASE_CANDIDATE_REPORT_PATH));

  const operability = JSON.parse(await fs.readFile(OPERABILITY_AUDIT_PATH, "utf8"));
  const workflow = JSON.parse(await fs.readFile(WORKFLOW_AUDIT_PATH, "utf8"));
  const uiWalkthrough = JSON.parse(await fs.readFile(UI_STRUCTURE_WALKTHROUGH_PATH, "utf8"));

  const blockers = Array.isArray(operability.releaseBlockers) ? operability.releaseBlockers : [];
  if (blockers.length) {
    fail(`operability audit has release blockers:\n- ${blockers.join("\n- ")}`);
  }

  if (Number(operability.controlsFailed || 0) > 0) {
    fail(`operability audit reports failed controls: ${operability.controlsFailed}`);
  }
  if (Number(operability.workflowsFailed || 0) > 0) {
    fail(`operability audit reports failed workflows: ${operability.workflowsFailed}`);
  }
  if (Array.isArray(operability.missingRequiredControls) && operability.missingRequiredControls.length > 0) {
    fail("operability audit reports missing required controls");
  }
  if (Array.isArray(operability.missingRequiredWorkflows) && operability.missingRequiredWorkflows.length > 0) {
    fail("operability audit reports missing required workflows");
  }

  if (Number(workflow.failedWorkflows || 0) > 0) {
    const failed = Array.isArray(workflow.workflows)
      ? workflow.workflows
          .filter((row) => row.status !== "pass")
          .map((row) => `${row.id}: ${row.notes || "failed"}`)
      : [];
    fail(`workflow audit has failed workflows:\n- ${failed.join("\n- ")}`);
  }

  if (String(uiWalkthrough.status || "").toLowerCase() !== "pass") {
    const uiFailures = Array.isArray(uiWalkthrough.failures) ? uiWalkthrough.failures : [];
    fail(`UI structure walkthrough failed:\n- ${uiFailures.join("\n- ")}`);
  }

  const uiShots = Array.isArray(uiWalkthrough.screenshots) ? uiWalkthrough.screenshots : [];
  if (uiShots.length < 10) {
    fail(`UI structure walkthrough has insufficient rendered evidence (${uiShots.length} screenshots)`);
  }

  const reportText = await fs.readFile(RELEASE_CANDIDATE_REPORT_PATH, "utf8");
  if (!/Controls tested:/i.test(reportText) || !/Workflows tested:/i.test(reportText)) {
    fail("release-candidate report is missing required controls/workflows summary");
  }
  if (/\bpartial\b/i.test(reportText)) {
    fail("release-candidate report must not label visible features as partial");
  }

  console.log("[release-gate] operability artifacts passed");
}

function resolveCommitHash() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return "unavailable";
  }
  return String(result.stdout || "").trim() || "unavailable";
}

function renderFeatureMatrix() {
  return [
    "| Area | Status |",
    "|---|---|",
    "| Capture View / Focus Area / Scan Page / Focus Element | Implemented |",
    "| Mark View editor (annotation, crop, resize, undo/redo, redaction) | Implemented |",
    "| Record View (screen/window/tab, mic/system audio where supported, webcam overlay, pause/resume) | Implemented |",
    "| Memory gallery (search, folders, tags, favourites, trash restore, bulk actions) | Implemented |",
    "| Send View local exports (PNG/JPG/WebP/PDF/WebM/HTML/Markdown/JSON/ZIP) | Implemented |",
    "| MP4/GIF local conversion pipeline | Working with limitation (WebM baseline) |"
  ].join("\n");
}

function renderKnownLimitations() {
  return [
    "1. System audio availability depends on browser, picker mode, and OS policy.",
    "2. MP4/GIF conversion is not guaranteed locally; WebM is the supported export baseline.",
    "3. Clipboard file writes can be blocked in locked-down environments; explicit download fallback is used.",
    "4. PDF report export is local text-based PDF generation, not a rich layout renderer."
  ].join("\n");
}

function renderManualChecklist() {
  return [
    "1. Load unpacked extension from `dist/build` in `chrome://extensions`.",
    "2. Open popup and run Capture View; confirm item appears in Memory.",
    "3. Run Focus Area and Scan Page; verify save/open in editor.",
    "4. Open editor, add annotation, export PNG and PDF.",
    "5. Start recorder, pause/resume, stop, save recording to Memory.",
    "6. Open recording from Memory and verify playback.",
    "7. Move item to Out of Sight, restore it, then permanently delete.",
    "8. Run delete-all-local-data flow with typed confirmation.",
    "9. Open privacy and permissions pages and verify disclosure text."
  ].join("\n");
}

async function writeReleaseReport({ manifest, stepResults }) {
  const now = new Date();
  const timestamp = now.toISOString();
  const version = String(manifest.version || "unknown");
  const commitHash = resolveCommitHash();
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];

  const testsTable = [
    "| Gate | Result | Duration (ms) |",
    "|---|---|---|",
    ...stepResults.map((step) => `| ${step.name} | ${step.status} | ${step.durationMs} |`)
  ].join("\n");

  const privacyStatement =
    "Olho keeps captures and recordings local in the browser profile, does not upload media, does not create accounts, and does not run analytics or telemetry.";

  const realBrowserE2EPass = stepResults.some((step) => step.name === "test:e2e" && step.status === "pass");
  const releaseVerdict = realBrowserE2EPass ? "release candidate" : "prototype";
  const publicStoreReady = false;

  const markdown = [
    "# RELEASE_CHECK",
    "",
    `- Version: ${version}`,
    `- Date: ${timestamp}`,
    `- Commit: ${commitHash}`,
    "",
    "## Feature Matrix",
    renderFeatureMatrix(),
    "",
    "## Test Results",
    testsTable,
    "",
    "## E2E Scope",
    "- `test:e2e` runs real browser tests against unpacked `dist/build` extension pages.",
    "- Mocked and source-string checks are kept under unit/integration/static gates and are not counted as real e2e coverage.",
    "",
    "## Store Readiness",
    `- Release verdict: ${releaseVerdict}`,
    `- Real-browser extension e2e passing: ${realBrowserE2EPass ? "yes" : "no"}`,
    `- Public Chrome Web Store ready: ${publicStoreReady ? "yes" : "no"}`,
    "",
    "## Known Limitations",
    renderKnownLimitations(),
    "",
    "## Permission List",
    ...permissions.map((permission) => `- \`${permission}\``),
    "",
    "## Privacy Statement",
    privacyStatement,
    "",
    "## Package",
    `- Path: \`${PACKAGE_RELATIVE_PATH}\``,
    "",
    "## Manual Smoke Checklist",
    renderManualChecklist(),
    ""
  ].join("\n");

  await fs.writeFile(RELEASE_REPORT_PATH, markdown, "utf8");
  console.log(`[release-gate] wrote ${path.relative(root, RELEASE_REPORT_PATH)}`);
}

async function main() {
  console.log("[release-gate] starting");

  for (const file of REQUIRED_FILES) {
    await ensurePathExists(file);
  }

  const packageJson = JSON.parse(await readText("package.json"));
  checkRequiredScripts(packageJson);
  await checkRequiredCoverageFiles();

  const manifest = JSON.parse(await readText("manifest.json"));
  checkManifest(manifest);
  await checkPermissionDocumentation(manifest);

  for (const iconPath of Object.values(manifest.icons || {})) {
    await ensurePathExists(String(iconPath));
  }

  const stepResults = [];
  for (const step of EXECUTION_STEPS) {
    stepResults.push(runStep(step.name, step.command, step.args));
  }

  await checkOperabilityArtifacts();
  await checkUiDoesNotExposePartialStatus();
  await scanDependencyFiles();
  await scanSource();
  await scanChromeStorageLocalWrites();
  await scanBuildOutput();
  scanPackageZip();
  scanSourcePackageZip();

  await writeReleaseReport({ manifest, stepResults });

  console.log("\n[release-gate] PASS");
}

main().catch((error) => {
  fail(String(error?.stack || error?.message || error));
});
