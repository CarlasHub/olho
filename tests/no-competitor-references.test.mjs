import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".html", ".css", ".json", ".md"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist"]);
const SKIP_FILES = new Set(["package-lock.json"]);

function fromCodes(codes) {
  return String.fromCharCode(...codes);
}

function toPattern(phrase) {
  return new RegExp(phrase.replace(/\s+/g, "\\s*"), "i");
}

const forbiddenBrandPatterns = [
  toPattern(fromCodes([97, 119, 101, 115, 111, 109, 101, 32, 115, 99, 114, 101, 101, 110, 115, 104, 111, 116])),
  toPattern(fromCodes([108, 105, 103, 104, 116, 115, 104, 111, 116])),
  toPattern(fromCodes([110, 105, 109, 98, 117, 115])),
  toPattern(fromCodes([102, 105, 114, 101, 115, 104, 111, 116]))
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
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    files.push(rel);
  }

  return files;
}

test("repository contains no competitor references", async () => {
  const files = await walk(root);
  const hits = [];

  for (const relPath of files) {
    const text = await fs.readFile(path.join(root, relPath), "utf8");
    for (const pattern of forbiddenBrandPatterns) {
      if (pattern.test(text)) {
        hits.push(`${relPath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(hits, []);
});
