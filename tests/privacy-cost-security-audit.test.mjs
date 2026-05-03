import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const reportPath = path.join(root, "test-results", "privacy-cost-security-audit.md");

const RUNTIME_EXTENSIONS = new Set([".js", ".mjs", ".html", ".css", ".json"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "tests", "scripts"]);

const REMOTE_URL_PATTERN = /https?:\/\/[a-z0-9.-]+[^\s"'`<>)]*/gi;
const FORBIDDEN_PATTERNS = [
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /firebase/i,
  /supabase/i,
  /sentry/i,
  /posthog/i,
  /google analytics/i,
  /gtag\s*\(/i,
  /mixpanel/i,
  /amplitude/i
];
const COMPETITOR_PATTERN = /awesome\s*screenshot/i;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(abs)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === "package-lock.json") continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!RUNTIME_EXTENSIONS.has(ext)) continue;
    files.push(path.relative(root, abs));
  }
  return files;
}

test(
  "privacy/cost/security audit report (no remote services, no unsafe runtime patterns)",
  { timeout: 150_000 },
  async () => {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });

    const findings = [];

    const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
    const csp = String(manifest?.content_security_policy?.extension_pages || "");
    if (!csp.includes("script-src 'self'")) findings.push("manifest CSP missing script-src 'self'.");
    if (!csp.includes("object-src 'self'")) findings.push("manifest CSP missing object-src 'self'.");

    const files = await walk(root);
    for (const relPath of files) {
      const text = await fs.readFile(path.join(root, relPath), "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) {
          findings.push(`${relPath}: forbidden pattern ${pattern}`);
        }
      }
      if (COMPETITOR_PATTERN.test(text)) {
        findings.push(`${relPath}: competitor reference detected`);
      }
    if (!relPath.endsWith(".md")) {
      const urls = text.match(REMOTE_URL_PATTERN) || [];
      for (const url of urls) {
        findings.push(`${relPath}: remote URL detected (${url})`);
      }
    }
    }

    const chromeStorageWriters = files.filter((relPath) => /\.m?js$/i.test(relPath));
    for (const relPath of chromeStorageWriters) {
      const text = await fs.readFile(path.join(root, relPath), "utf8");
      if (!text.includes("chrome.storage.local.set(")) continue;
      if (relPath !== "src/storage/storage.js" && relPath !== "popup.js") {
        findings.push(`${relPath}: non-allowlisted chrome.storage.local.set usage`);
      }
    }

    const output = [
      "# Privacy/Cost/Security Audit",
      "",
      `- Generated: ${new Date().toISOString()}`,
      `- Runtime files scanned: ${files.length}`,
      `- Findings: ${findings.length}`,
      "",
      findings.length ? "## Findings" : "## Findings\nNone.",
      ...(findings.length ? findings.map((line) => `- ${line}`) : [])
    ].join("\n");

    await fs.writeFile(reportPath, `${output}\n`, "utf8");
    assert.deepEqual(findings, []);
  }
);
