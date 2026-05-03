import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

async function read(relPath) {
  return fs.readFile(path.join(root, relPath), "utf8");
}

test("privacy policy includes required local-only disclosures", async () => {
  const privacy = await read("PRIVACY.md");
  const requiredStatements = [
    "stores screenshots and recordings locally",
    "does not upload screenshots or recordings",
    "does not create an account",
    "does not sell data",
    "does not use analytics",
    "does not track browsing history",
    "only accesses the active tab when the user starts a capture action",
    "only accesses screen, microphone, or camera when the user starts recording and grants browser permission",
    "Local data can be deleted from the gallery or settings",
    "Clearing browser data may remove local Olho data",
    "Exported files are controlled by the user"
  ];

  requiredStatements.forEach((statement) => {
    assert.equal(
      privacy.toLowerCase().includes(statement.toLowerCase()),
      true,
      `Missing privacy statement: ${statement}`
    );
  });
});

test("manifest permissions are documented and least-privilege scoped", async () => {
  const manifest = JSON.parse(await read("manifest.json"));
  const permissionsDoc = await read("PERMISSIONS.md");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(Array.isArray(manifest.permissions), true);
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);

  const documentedPermissions = new Set(
    Array.from(permissionsDoc.matchAll(/`([a-zA-Z]+)`/g), (match) => String(match[1]))
  );

  manifest.permissions.forEach((permission) => {
    assert.equal(
      documentedPermissions.has(permission),
      true,
      `Permission ${permission} is present in manifest but missing in PERMISSIONS.md`
    );
  });
});
