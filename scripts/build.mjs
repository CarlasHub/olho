import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist", "build");

const includeDirs = ["assets", "icons", "src", "storage", "extension"];
const runtimeRootFiles = [
  "manifest.json",
  "service_worker.js",
  "offscreen.html",
  "offscreen.js",
  "popup.html",
  "popup.js",
  "popup.css",
  "sidepanel.html",
  "sidepanel.js",
  "sidepanel.css",
  "editor.html",
  "editor.js",
  "editor.css",
  "gallery.html",
  "gallery.js",
  "gallery.css",
  "review.html",
  "review.js",
  "review.css",
  "record.html",
  "record.js",
  "record.css",
  "options.html",
  "options.js",
  "options.css",
  "privacy.html",
  "privacy.js",
  "privacy.css",
  "export-report.html",
  "export-report.js",
  "export-report.css",
  "index.html",
  "styles.css",
  "favicon.ico",
  "favicon-32.png"
];

async function copyFile(relPath) {
  const src = path.join(root, relPath);
  const dst = path.join(outDir, relPath);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
}

async function copyDir(relDir) {
  const srcDir = path.join(root, relDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const nextRel = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(nextRel);
    } else if (entry.isFile()) {
      await copyFile(nextRel);
    }
  }
}

async function ensureExists(relPath) {
  const abs = path.join(root, relPath);
  await fs.access(abs);
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

for (const file of runtimeRootFiles) {
  await ensureExists(file);
  await copyFile(file);
}

for (const dir of includeDirs) {
  await ensureExists(dir);
  await copyDir(dir);
}

console.log(`Build output: ${path.relative(root, outDir)}`);
