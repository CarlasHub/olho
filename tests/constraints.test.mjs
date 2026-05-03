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

function phraseFromCodes(codes) {
  return String.fromCharCode(...codes);
}

const competitorBrandPattern = new RegExp(
  phraseFromCodes([
    97, 119, 101, 115, 111, 109, 101, 32, 115, 99, 114, 101, 101, 110, 115, 104, 111, 116
  ]).replace(/\s+/g, "\\s*"),
  "i"
);

test("manifest keeps local-first baseline", async () => {
  const manifest = JSON.parse(await read("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Olho");
  assert.ok(Array.isArray(manifest.permissions));
  const expected = [
    "activeTab",
    "tabs",
    "scripting",
    "clipboardWrite",
    "storage",
    "desktopCapture",
    "downloads",
    "offscreen"
  ];
  assert.deepEqual([...manifest.permissions].sort(), [...expected].sort());
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.equal(Boolean(manifest.content_security_policy?.extension_pages), true);
  assert.equal(manifest.content_security_policy.extension_pages.includes("script-src 'self'"), true);
  assert.equal(manifest.content_security_policy.extension_pages.includes("object-src 'self'"), true);
  assert.equal(Object.hasOwn(manifest, "web_accessible_resources"), false);
  assert.equal(typeof manifest.commands, "object");
  assert.equal(Boolean(manifest.commands["capture-view"]), true);
  assert.equal(Boolean(manifest.commands["capture-screen-window"]), true);
  assert.equal(Boolean(manifest.commands["record-screen"]), true);
  assert.equal(Boolean(manifest.commands["open-memory"]), true);
});

test("no competitor branding or TODO placeholders", async () => {
  const files = [
    "README.md",
    "manifest.json",
    "popup.html",
    "editor.html",
    "gallery.html",
    "record.html",
    "options.html",
    "privacy.html"
  ];

  for (const file of files) {
    const text = await read(file);
    assert.equal(competitorBrandPattern.test(text), false, `${file} must not reference competitor brand`);
    assert.equal(/\btodo\b/i.test(text), false, `${file} must not include TODO placeholders`);
  }
});

test("storage adapter is indexeddb-backed", async () => {
  const text = await read("src/storage/storage.js");
  assert.equal(text.includes('from "../../storage/db.js"'), true);
  assert.equal(text.includes("saveMedia"), true);
  assert.equal(text.includes("getMediaBlob"), true);
  assert.equal(text.includes("chrome.storage.local.set({ lastCapture"), false);
});
