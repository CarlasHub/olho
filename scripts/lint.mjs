import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const textExt = new Set([".js", ".mjs", ".html", ".css", ".json", ".md"]);
const skipDirs = new Set([".git", "node_modules", "dist", "tests"]);
const skipFiles = new Set(["package-lock.json", "npm-shrinkwrap.json"]);
const allowedDocDomains = new Set(["developer.chrome.com", "developer.mozilla.org", "chromium.org"]);

function phraseFromCodes(codes) {
  return String.fromCharCode(...codes);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function olhForbiddenBrandPattern() {
  const phrase = phraseFromCodes([
    97, 119, 101, 115, 111, 109, 101, 32, 115, 99, 114, 101, 101, 110, 115, 104, 111, 116
  ]);
  return new RegExp(escapeRegex(phrase).replace("\\ ", "\\s*"), "i");
}

const forbiddenPhrases = [olhForbiddenBrandPattern(), /\btodo\b/i];
const forbiddenCodePatterns = [/\beval\s*\(/, /new\s+Function\s*\(/];
const absoluteUrlPattern = /https?:\/\/[a-z0-9.-]+[^\s"'`<>)]*/gi;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      if (entry.name !== ".github") {
        if (skipDirs.has(entry.name)) continue;
      }
    }
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      if (skipFiles.has(entry.name)) continue;
      if (textExt.has(path.extname(entry.name).toLowerCase())) {
        files.push(rel);
      }
    }
  }
  return files;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isDocsFile(relPath) {
  return relPath.toLowerCase().endsWith(".md");
}

const issues = [];
const files = await walk(root);

for (const rel of files) {
  const abs = path.join(root, rel);
  const text = await fs.readFile(abs, "utf8");

  for (const regex of forbiddenPhrases) {
    if (regex.test(text)) {
      issues.push(`${rel}: forbidden pattern ${regex}`);
    }
  }

  for (const regex of forbiddenCodePatterns) {
    if (regex.test(text)) {
      issues.push(`${rel}: forbidden code pattern ${regex}`);
    }
  }

  const urls = text.match(absoluteUrlPattern) || [];
  if (!urls.length) continue;

  for (const url of urls) {
    if (isDocsFile(rel)) {
      const domain = extractDomain(url);
      if (!allowedDocDomains.has(domain)) {
        issues.push(`${rel}: non-doc URL not allowed in docs (${url})`);
      }
      continue;
    }
    issues.push(`${rel}: remote URL not allowed in source (${url})`);
  }
}

if (issues.length) {
  console.error("Lint failures:");
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log(`Lint passed (${files.length} text files checked).`);
