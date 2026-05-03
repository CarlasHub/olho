import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const buildScript = path.join(root, "scripts", "build.mjs");
const buildDir = path.join(root, "dist", "build");
const zipPath = path.join(root, "dist", "olho-extension.zip");
const zipPathFromBuildDir = path.join("..", "olho-extension.zip");

const buildResult = spawnSync(process.execPath, [buildScript], { stdio: "inherit" });
if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

await fs.rm(zipPath, { force: true });

const zip = spawnSync("zip", ["-qr", zipPathFromBuildDir, "."], {
  cwd: buildDir,
  stdio: "inherit"
});
if (zip.status !== 0) {
  process.exit(zip.status ?? 1);
}

const listing = spawnSync("unzip", ["-l", zipPath], { encoding: "utf8" });
if (listing.status !== 0) {
  console.error("Failed to inspect generated zip.");
  process.exit(listing.status ?? 1);
}

if (!/(^|\n)\s*\d+\s+[0-9-]+\s+[0-9:]+\s+(\.\/)?manifest\.json(\n|$)/m.test(listing.stdout)) {
  console.error("manifest.json was not found at the zip root.");
  process.exit(1);
}

console.log(`Package output: ${path.relative(root, zipPath)}`);
