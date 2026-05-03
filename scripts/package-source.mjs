import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const stageDir = path.join(distDir, ".source-stage");
const outputZip = path.join(distDir, "olho-source.zip");

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "test-results",
  "__MACOSX"
]);

const EXCLUDED_FILES = new Set([
  ".DS_Store"
]);

async function copyTree(srcDir, dstDir) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(srcDir, entry.name);
    const rel = path.relative(root, sourcePath);
    const rootName = rel.split(path.sep)[0];
    if (EXCLUDED_DIRS.has(rootName)) continue;
    if (EXCLUDED_FILES.has(entry.name)) continue;

    const destPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyTree(sourcePath, destPath);
    } else if (entry.isFile()) {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(sourcePath, destPath);
    }
  }
}

function listZipFiles(zipPath) {
  const result = spawnSync("unzip", ["-Z1", zipPath], {
    encoding: "utf8",
    cwd: root
  });
  if (result.status !== 0) {
    throw new Error(`Could not inspect source zip: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function main() {
  await fs.mkdir(distDir, { recursive: true });
  await fs.rm(stageDir, { recursive: true, force: true });
  await fs.rm(outputZip, { force: true });
  await fs.mkdir(stageDir, { recursive: true });

  await copyTree(root, stageDir);

  const zipResult = spawnSync("zip", ["-qr", outputZip, "."], {
    cwd: stageDir,
    stdio: "inherit"
  });
  if (zipResult.status !== 0) {
    process.exit(zipResult.status ?? 1);
  }

  const entries = listZipFiles(outputZip);
  const forbidden = entries.filter((entry) => {
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

  if (forbidden.length > 0) {
    throw new Error(`Source package contains forbidden paths:\n${forbidden.join("\n")}`);
  }

  await fs.rm(stageDir, { recursive: true, force: true });
  console.log(`Source package output: ${path.relative(root, outputZip)}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
