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

test("runtime pages register global runtime guards", async () => {
  const files = [
    "popup.js",
    "editor.js",
    "record.js",
    "gallery.js",
    "export-report.js",
    "options.js",
    "privacy.js"
  ];

  for (const file of files) {
    const text = await read(file);
    assert.equal(text.includes('from "./src/shared/runtime-guard.js"'), true, `${file} missing runtime-guard import`);
    assert.equal(text.includes("installRuntimeGuard({"), true, `${file} missing runtime guard install`);
  }
});

test("service worker hardening handles global errors and message-type-specific failures", async () => {
  const worker = await read("service_worker.js");

  assert.equal(worker.includes("self.addEventListener(\"unhandledrejection\""), true);
  assert.equal(worker.includes("self.addEventListener(\"error\""), true);
  assert.equal(worker.includes("function resolveResponseErrorMessage"), true);
  assert.equal(worker.includes("return toSafeErrorMessage(error);"), true);
  assert.equal(worker.includes("resolveResponseErrorMessage(message.type, error)"), true);
  assert.equal(worker.includes("chrome.commands.onCommand.addListener"), true);
  assert.equal(worker.includes("async function handleCommand(command)"), true);
});
