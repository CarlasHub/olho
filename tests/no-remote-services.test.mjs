import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const RUNTIME_EXTENSIONS = new Set([".js", ".mjs", ".html", ".css", ".json"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "tests", "scripts"]);
const SKIP_FILES = new Set(["package-lock.json"]);
const URL_PATTERN = /https?:\/\/[a-z0-9.-]+[^\s"'`<>)]*/gi;
const FORBIDDEN_CODE_PATTERNS = [/\beval\s*\(/, /new\s+Function\s*\(/];
const FORBIDDEN_SERVICE_PATTERNS = [
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
  /stripe/i
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
  /azure/i
];

const API_KEY_PATTERNS = [
  /AIza[0-9A-Za-z_-]{35}/,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/
];

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
    if (!RUNTIME_EXTENSIONS.has(ext)) continue;
    files.push(rel);
  }

  return files;
}

test("runtime source has no remote service or telemetry hooks", async () => {
  const files = await walk(root);
  const issues = [];

  for (const relPath of files) {
    const text = await fs.readFile(path.join(root, relPath), "utf8");

    FORBIDDEN_CODE_PATTERNS.forEach((pattern) => {
      if (pattern.test(text)) {
        issues.push(`${relPath}: forbidden code pattern ${pattern}`);
      }
    });

    FORBIDDEN_SERVICE_PATTERNS.forEach((pattern) => {
      if (pattern.test(text)) {
        issues.push(`${relPath}: forbidden service pattern ${pattern}`);
      }
    });

    API_KEY_PATTERNS.forEach((pattern) => {
      if (pattern.test(text)) {
        issues.push(`${relPath}: potential key pattern ${pattern}`);
      }
    });

    const urls = text.match(URL_PATTERN) || [];
    urls.forEach((url) => {
      issues.push(`${relPath}: remote URL detected (${url})`);
    });
  }

  assert.deepEqual(issues, []);
});

test("dependency files include no cloud SDK, analytics, or telemetry packages", async () => {
  const packageJson = await fs.readFile(path.join(root, "package.json"), "utf8");
  const packageLock = await fs.readFile(path.join(root, "package-lock.json"), "utf8");
  const combined = `${packageJson}\n${packageLock}`;

  const issues = [];
  FORBIDDEN_DEPENDENCY_PATTERNS.forEach((pattern) => {
    if (pattern.test(combined)) {
      issues.push(`forbidden dependency pattern ${pattern}`);
    }
  });

  assert.deepEqual(issues, []);
});
