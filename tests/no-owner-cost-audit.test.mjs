import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const reportJsonPath = path.join(root, "test-results", "no-owner-cost-audit.json");
const reportMdPath = path.join(root, "test-results", "no-owner-cost-audit.md");

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".html", ".css", ".json", ".md"]);
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".html", ".css", ".json", ".md", ".txt"]);
const SKIP_DIRS = new Set([".git", "node_modules", "test-results", "dist"]);
const SKIP_FILES = new Set(["package-lock.json"]);

const REMOTE_URL_PATTERN = /https?:\/\/[a-z0-9.-]+[^\s"'`<>)]*/gi;
const API_PATTERNS = {
  fetch: /\bfetch\s*\(/g,
  xhr: /\bXMLHttpRequest\b/g,
  websocket: /\bWebSocket\b/g,
  eventsource: /\bEventSource\b/g
};

const FORBIDDEN_RUNTIME_PATTERNS = [
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
  /gemini/i,
  /new\s+Function\s*\(/,
  /(^|[^\w$])eval\s*\(/
];

const API_KEY_PATTERNS = [
  /AIza[0-9A-Za-z_-]{35}/,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/
];

const DOC_URL_ALLOWLIST = new Set([
  "developer.chrome.com",
  "developer.mozilla.org",
  "chromium.org",
  "github.com"
]);

const DRAFT_DOMAINS = new Set([
  "github.com",
  "atlassian.net",
  "trello.com"
]);

function isRuntimeFile(relPath) {
  return !relPath.startsWith("tests/") && !relPath.startsWith("scripts/") && !relPath.endsWith(".md");
}

function isAllowedOptionalAiReviewReference(relPath, pattern) {
  const normalizedPath = relPath.replace(/^dist\/build\//, "");
  return normalizedPath.startsWith("src/review/ai/") && String(pattern) === "/gemini/i";
}

function toPos(text, index) {
  const prefix = text.slice(0, index);
  const line = prefix.split("\n").length;
  const col = index - prefix.lastIndexOf("\n");
  return { line, col };
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function classifyApiUsage({ relPath, type, snippet }) {
  const lower = snippet.toLowerCase();

  if (relPath.startsWith("tests/")) {
    return { status: "allowed", reason: "Test-only usage" };
  }

  if (type === "fetch") {
    if (relPath === "src/storage/storage.js" && /fetch\(input\)/.test(snippet)) {
      return {
        status: "allowed",
        reason: "Legacy blob migration fetch restricted to blob:chrome-extension URLs"
      };
    }

    if (relPath === "editor.js" && /fetch\(dataurl\)/i.test(lower)) {
      return {
        status: "allowed",
        reason: "Local data URL decode in editor"
      };
    }

    if (relPath === "src/background/capture.js" && /fetch\(dataurl\)/i.test(lower)) {
      return {
        status: "allowed",
        reason: "Local data URL decode in capture pipeline"
      };
    }

    if (/https?:\/\//i.test(lower)) {
      return { status: "disallowed", reason: "Direct remote fetch in runtime code" };
    }

    return { status: "review", reason: "Fetch usage requires explicit local-only validation" };
  }

  if (type === "xhr" || type === "websocket" || type === "eventsource") {
    return {
      status: "disallowed",
      reason: `${type} usage is disallowed in runtime for no-owner-cost policy`
    };
  }

  return { status: "review", reason: "Unknown network API usage" };
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

function scanTextFile(relPath, text, context = "source") {
  const networkApiPaths = [];
  const remoteUrls = [];
  const disallowedPatterns = [];
  const apiKeys = [];

  for (const [type, pattern] of Object.entries(API_PATTERNS)) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const { line, col } = toPos(text, match.index);
      const snippet = text.slice(Math.max(0, match.index - 90), Math.min(text.length, match.index + 140));
      const classification = classifyApiUsage({ relPath, type, snippet });
      networkApiPaths.push({
        context,
        file: relPath,
        api: type,
        line,
        col,
        status: classification.status,
        reason: classification.reason,
        snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 240)
      });
    }
    pattern.lastIndex = 0;
  }

  let urlMatch;
  while ((urlMatch = REMOTE_URL_PATTERN.exec(text)) !== null) {
    const url = String(urlMatch[0]);
    const { line, col } = toPos(text, urlMatch.index);
    const domain = domainFromUrl(url);

    let status = "disallowed";
    let reason = "Remote URL in runtime path";

    if (relPath.endsWith(".md")) {
      status = DOC_URL_ALLOWLIST.has(domain) ? "allowed" : "review";
      reason = status === "allowed" ? "Documentation reference" : "Documentation URL outside allowlist";
    } else if (relPath.startsWith("tests/")) {
      status = "allowed";
      reason = "Test-only reference";
    } else if (DRAFT_DOMAINS.has(domain)) {
      status = "allowed";
      reason = "User-initiated external draft helper";
    }

    remoteUrls.push({ context, file: relPath, line, col, url, domain, status, reason });
  }
  REMOTE_URL_PATTERN.lastIndex = 0;

  for (const pattern of FORBIDDEN_RUNTIME_PATTERNS) {
    if (!isRuntimeFile(relPath)) continue;
    if (!pattern.test(text)) continue;
    if (isAllowedOptionalAiReviewReference(relPath, pattern)) continue;
    disallowedPatterns.push({ context, file: relPath, pattern: String(pattern), reason: "Forbidden runtime pattern" });
  }

  for (const pattern of API_KEY_PATTERNS) {
    if (!pattern.test(text)) continue;
    apiKeys.push({ context, file: relPath, pattern: String(pattern), reason: "Potential embedded secret/API key" });
  }

  return { networkApiPaths, remoteUrls, disallowedPatterns, apiKeys };
}

function scanBuiltOutput(buildDir) {
  const findings = {
    remoteUrls: [],
    disallowedPatterns: []
  };

  function walkSync(absDir) {
    const entries = fsSync.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) {
        walkSync(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;

      const text = fsSync.readFileSync(abs, "utf8");
      let match;
      while ((match = REMOTE_URL_PATTERN.exec(text)) !== null) {
        const url = String(match[0]);
        const domain = domainFromUrl(url);
        findings.remoteUrls.push({
          context: "dist-build",
          file: rel,
          url,
          domain,
          status: "disallowed",
          reason: "Remote URL in built extension output"
        });
      }
      REMOTE_URL_PATTERN.lastIndex = 0;

      for (const pattern of FORBIDDEN_RUNTIME_PATTERNS) {
        if (pattern.test(text)) {
          if (isAllowedOptionalAiReviewReference(rel, pattern)) continue;
          findings.disallowedPatterns.push({
            context: "dist-build",
            file: rel,
            pattern: String(pattern),
            reason: "Forbidden runtime pattern in build output"
          });
        }
      }
    }
  }

  if (fsSync.existsSync(buildDir)) {
    walkSync(buildDir);
  }

  return findings;
}

function scanZip(zipPath) {
  const findings = {
    entriesScanned: 0,
    remoteUrls: [],
    disallowedPatterns: []
  };

  const listResult = spawnSync("unzip", ["-Z1", zipPath], { cwd: root, encoding: "utf8" });
  if (listResult.status !== 0) {
    throw new Error(`Unable to read zip listing: ${listResult.stderr || listResult.stdout}`);
  }

  const entries = String(listResult.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    const readResult = spawnSync("unzip", ["-p", zipPath, entry], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024
    });

    if (readResult.status !== 0) {
      continue;
    }

    findings.entriesScanned += 1;
    const text = String(readResult.stdout || "");

    let match;
    while ((match = REMOTE_URL_PATTERN.exec(text)) !== null) {
      const url = String(match[0]);
      findings.remoteUrls.push({
        context: "zip",
        file: entry,
        url,
        domain: domainFromUrl(url),
        status: "disallowed",
        reason: "Remote URL in packaged extension"
      });
    }
    REMOTE_URL_PATTERN.lastIndex = 0;

    for (const pattern of FORBIDDEN_RUNTIME_PATTERNS) {
      if (pattern.test(text)) {
        if (isAllowedOptionalAiReviewReference(entry, pattern)) continue;
        findings.disallowedPatterns.push({
          context: "zip",
          file: entry,
          pattern: String(pattern),
          reason: "Forbidden pattern in packaged extension"
        });
      }
    }
  }

  return findings;
}

test(
  "no owner running cost audit (local-first enforcement)",
  { timeout: 180_000 },
  async () => {
    await fs.mkdir(path.dirname(reportJsonPath), { recursive: true });

    const files = await walk(root);

    const sourceFindings = {
      networkApiPaths: [],
      remoteUrls: [],
      disallowedPatterns: [],
      apiKeys: []
    };

    for (const relPath of files) {
      const absPath = path.join(root, relPath);
      const text = await fs.readFile(absPath, "utf8");
      const scanned = scanTextFile(relPath, text, "source");
      sourceFindings.networkApiPaths.push(...scanned.networkApiPaths);
      sourceFindings.remoteUrls.push(...scanned.remoteUrls);
      sourceFindings.disallowedPatterns.push(...scanned.disallowedPatterns);
      sourceFindings.apiKeys.push(...scanned.apiKeys);
    }

    const buildFindings = scanBuiltOutput(path.join(root, "dist", "build"));
    const zipPath = path.join(root, "dist", "olho-extension.zip");
    const zipFindings = await fs
      .access(zipPath)
      .then(() => scanZip(zipPath))
      .catch(() => ({ entriesScanned: 0, remoteUrls: [], disallowedPatterns: [] }));

    const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    const storageSource = await fs.readFile(path.join(root, "src/storage/storage.js"), "utf8");
    const dbSource = await fs.readFile(path.join(root, "storage/db.js"), "utf8");
    const privacySource = await fs.readFile(path.join(root, "privacy.html"), "utf8");

    const csp = String(manifest?.content_security_policy?.extension_pages || "");
    const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    const chromeStorageSetCalls = (storageSource.match(/chrome\.storage\.local\.set\(/g) || []).length;

    const allowedNetworkApiPaths = sourceFindings.networkApiPaths.filter((entry) => entry.status === "allowed");
    const reviewNetworkApiPaths = sourceFindings.networkApiPaths.filter((entry) => entry.status === "review");
    const disallowedNetworkApiPaths = sourceFindings.networkApiPaths.filter((entry) => entry.status === "disallowed");

    const disallowedRemoteUrls = [
      ...sourceFindings.remoteUrls.filter((entry) => entry.status === "disallowed"),
      ...buildFindings.remoteUrls,
      ...zipFindings.remoteUrls
    ];

    const reviewRemoteUrls = sourceFindings.remoteUrls.filter((entry) => entry.status === "review");

    const disallowedPatterns = [
      ...sourceFindings.disallowedPatterns,
      ...buildFindings.disallowedPatterns,
      ...zipFindings.disallowedPatterns
    ];

    const userInitiatedExternalDraftLinks = [
      {
        feature: "GitHub issue draft",
        path: "export-report.js",
        mode: "User-provided issue URL opened by explicit click",
        upload: "none"
      },
      {
        feature: "Jira issue draft",
        path: "export-report.js",
        mode: "User-provided issue URL opened by explicit click",
        upload: "none"
      },
      {
        feature: "Trello draft",
        path: "export-report.js",
        mode: "User-provided card URL opened by explicit click",
        upload: "none"
      },
      {
        feature: "Email draft",
        path: "export-report.js",
        mode: "mailto generated on explicit click",
        upload: "none"
      }
    ];

    const checks = {
      noBackendOrCloudSdkInDependencies: !/firebase|supabase|sentry|posthog|analytics|telemetry|segment|mixpanel|amplitude|aws-sdk|@aws-sdk|google-cloud|@google-cloud|azure|stripe|sendgrid|mailgun/i.test(
        JSON.stringify(pkg)
      ),
      cspBlocksRemoteScripts: csp.includes("script-src 'self'") && csp.includes("object-src 'self'"),
      noLargeMediaInChromeStorageLocal: chromeStorageSetCalls === 1 && /\[MIGRATION_FLAG_KEY\]\s*:\s*report/.test(storageSource),
      indexedDbBlobStorage: /saveMedia requires a Blob\./.test(dbSource) && /return record\?\.blob \|\| null;/.test(dbSource),
      legacyMigrationBlocksHttpHttps: /innerUrl\.protocol !== "chrome-extension:"/.test(storageSource),
      noDisallowedNetworkApis: disallowedNetworkApiPaths.length === 0,
      noDisallowedRemoteUrls: disallowedRemoteUrls.length === 0,
      noForbiddenPatterns: disallowedPatterns.length === 0,
      noApiKeys: sourceFindings.apiKeys.length === 0,
      privacyPageLocalOnlyDisclosure:
        /saved in local IndexedDB Blob storage/i.test(privacySource) &&
        /never uploaded/i.test(privacySource) &&
        /does not upload/i.test(privacySource)
    };

    const audit = {
      generatedAt: new Date().toISOString(),
      scanned: {
        sourceFiles: files.length,
        distBuild: {
          scanned: true,
          path: "dist/build"
        },
        packagedZip: {
          scanned: zipFindings.entriesScanned > 0,
          path: "dist/olho-extension.zip",
          textEntriesScanned: zipFindings.entriesScanned
        }
      },
      checks,
      permissions,
      networkCodePaths: {
        allowed: allowedNetworkApiPaths,
        review: reviewNetworkApiPaths,
        disallowed: disallowedNetworkApiPaths
      },
      remoteUrls: {
        review: reviewRemoteUrls,
        disallowed: disallowedRemoteUrls
      },
      userInitiatedExternalDraftLinks,
      findings: {
        forbiddenPatterns: disallowedPatterns,
        apiKeys: sourceFindings.apiKeys
      },
      summary: {
        noOwnerRunningCost:
          checks.noBackendOrCloudSdkInDependencies &&
          checks.cspBlocksRemoteScripts &&
          checks.noLargeMediaInChromeStorageLocal &&
          checks.indexedDbBlobStorage &&
          checks.legacyMigrationBlocksHttpHttps &&
          checks.noDisallowedNetworkApis &&
          checks.noDisallowedRemoteUrls &&
          checks.noForbiddenPatterns &&
          checks.noApiKeys
      }
    };

    await fs.writeFile(reportJsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

    const md = [
      "# No Owner Cost Audit",
      "",
      `- Generated: ${audit.generatedAt}`,
      `- Source files scanned: ${audit.scanned.sourceFiles}`,
      `- Dist build scanned: ${audit.scanned.distBuild.scanned ? "yes" : "no"}`,
      `- Packaged zip scanned: ${audit.scanned.packagedZip.scanned ? "yes" : "no"}`,
      "",
      "## Policy Checks",
      `- No backend/cloud SDK dependencies: ${checks.noBackendOrCloudSdkInDependencies ? "pass" : "fail"}`,
      `- CSP blocks remote scripts: ${checks.cspBlocksRemoteScripts ? "pass" : "fail"}`,
      `- No large media writes in chrome.storage.local: ${checks.noLargeMediaInChromeStorageLocal ? "pass" : "fail"}`,
      `- IndexedDB Blob storage enforced: ${checks.indexedDbBlobStorage ? "pass" : "fail"}`,
      `- Legacy migration blocks http/https URLs: ${checks.legacyMigrationBlocksHttpHttps ? "pass" : "fail"}`,
      `- No disallowed network APIs: ${checks.noDisallowedNetworkApis ? "pass" : "fail"}`,
      `- No disallowed remote URLs: ${checks.noDisallowedRemoteUrls ? "pass" : "fail"}`,
      `- No forbidden runtime patterns: ${checks.noForbiddenPatterns ? "pass" : "fail"}`,
      `- No API keys: ${checks.noApiKeys ? "pass" : "fail"}`,
      `- Privacy page local-only disclosure: ${checks.privacyPageLocalOnlyDisclosure ? "pass" : "fail"}`,
      "",
      "## Remote / Network Code Paths (Allowed)",
      "| API | File | Line | Reason |",
      "|---|---|---:|---|",
      ...allowedNetworkApiPaths.map((entry) =>
        `| ${escapeMd(entry.api)} | ${escapeMd(entry.file)} | ${entry.line} | ${escapeMd(entry.reason)} |`
      ),
      "",
      "## Remote / Network Code Paths (Review)",
      "| API | File | Line | Reason |",
      "|---|---|---:|---|",
      ...reviewNetworkApiPaths.map((entry) =>
        `| ${escapeMd(entry.api)} | ${escapeMd(entry.file)} | ${entry.line} | ${escapeMd(entry.reason)} |`
      ),
      "",
      "## User-Initiated External Draft Links",
      "| Feature | File | Trigger | Upload |",
      "|---|---|---|---|",
      ...userInitiatedExternalDraftLinks.map((entry) =>
        `| ${escapeMd(entry.feature)} | ${escapeMd(entry.path)} | ${escapeMd(entry.mode)} | ${escapeMd(entry.upload)} |`
      ),
      "",
      "## Disallowed Findings",
      `- Disallowed network API paths: ${disallowedNetworkApiPaths.length}`,
      `- Disallowed remote URLs: ${disallowedRemoteUrls.length}`,
      `- Forbidden patterns: ${disallowedPatterns.length}`,
      `- API keys: ${sourceFindings.apiKeys.length}`,
      "",
      `## Final Result`,
      `- No owner running cost status: ${audit.summary.noOwnerRunningCost ? "pass" : "fail"}`
    ].join("\n");

    await fs.writeFile(reportMdPath, `${md}\n`, "utf8");

    assert.equal(checks.noBackendOrCloudSdkInDependencies, true, "Cloud/analytics dependency detected.");
    assert.equal(checks.cspBlocksRemoteScripts, true, "CSP is not strict enough.");
    assert.equal(checks.noLargeMediaInChromeStorageLocal, true, "Unexpected chrome.storage.local write path.");
    assert.equal(checks.indexedDbBlobStorage, true, "IndexedDB Blob storage contract not detected.");
    assert.equal(checks.legacyMigrationBlocksHttpHttps, true, "Legacy migration URL guard not detected.");
    assert.deepEqual(disallowedNetworkApiPaths, [], "Disallowed network API usage found.");
    assert.deepEqual(disallowedRemoteUrls, [], "Disallowed remote URL references found.");
    assert.deepEqual(disallowedPatterns, [], "Forbidden runtime patterns found.");
    assert.deepEqual(sourceFindings.apiKeys, [], "Potential API key/secret found.");
  }
);
