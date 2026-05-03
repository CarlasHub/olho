import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanupExtensionStorage,
  launchExtension,
  openExtensionPage,
  seedMediaBlobInExtensionContext
} from "../tests/e2e-real-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test-results", "ui-snapshots");

async function waitForReady(page) {
  await page.waitForFunction(() => document.readyState === "complete", { timeout: 20_000 });
}

async function seedScreenshotFromCanvas(page, title, accent = "#8b7cff") {
  return page.evaluate(async (input) => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for UI snapshot seed.");

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#0b1220");
    gradient.addColorStop(1, "#182846");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = input.accent;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.34, canvas.height * 0.48, canvas.width * 0.18, canvas.height * 0.14, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#b7d2ff";
    ctx.beginPath();
    ctx.arc(canvas.width * 0.34, canvas.height * 0.48, 34, 0, Math.PI * 2);
    ctx.fill();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
          return;
        }
        reject(new Error("Failed to generate UI snapshot seed blob."));
      }, "image/png", 1);
    });

    const saved = await storage.saveMedia({
      kind: "screenshot",
      sourceType: "visible",
      blob,
      metadata: {
        title: input.title,
        tags: ["snapshot", "visual"]
      }
    });
    return saved.id;
  }, { title, accent });
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const session = await launchExtension("ui-snapshot-capture");
  try {
    const gallery = await openExtensionPage(session, "gallery.html", "snapshot-gallery");
    await waitForReady(gallery.page);
    await cleanupExtensionStorage(gallery.page);
    await gallery.page.reload({ waitUntil: "load" });
    await waitForReady(gallery.page);
    await gallery.page.waitForSelector("#emptyState:not([hidden])", { timeout: 15_000 });
    await gallery.page.screenshot({ path: path.join(outDir, "memory-empty.png"), fullPage: true });

    const seededIds = [];
    seededIds.push(await seedScreenshotFromCanvas(gallery.page, "Snapshot Screenshot A", "#8dbbff"));
    seededIds.push(
      await seedMediaBlobInExtensionContext(gallery.page, {
        kind: "recording",
        mimeType: "video/webm",
        title: "Snapshot Recording B",
        tags: ["snapshot", "b"]
      })
    );
    seededIds.push(await seedScreenshotFromCanvas(gallery.page, "Snapshot Screenshot C", "#76d6ff"));

    await gallery.page.reload({ waitUntil: "load" });
    await waitForReady(gallery.page);
    await gallery.page.waitForSelector(".gallery-card", { timeout: 15_000 });
    await gallery.page.screenshot({ path: path.join(outDir, "memory-with-items.png"), fullPage: true });

    await gallery.page.click(".gallery-card input[type='checkbox']");
    await gallery.page.waitForSelector("#bulkToolbar:not([hidden])", { timeout: 10_000 });
    await gallery.page.screenshot({ path: path.join(outDir, "memory-selected-items.png"), fullPage: true });

    await gallery.page.waitForFunction(() => {
      const body = document.getElementById("inspectorBody");
      return Boolean(body && !body.hasAttribute("hidden"));
    }, { timeout: 10_000 });
    await gallery.page.screenshot({ path: path.join(outDir, "memory-inspector-selected.png"), fullPage: true });

    const exportPage = await openExtensionPage(session, "export-report.html", "snapshot-export");
    await waitForReady(exportPage.page);
    await exportPage.page.waitForSelector("#itemsContainer", { timeout: 15_000 });
    await exportPage.page.screenshot({ path: path.join(outDir, "export-page.png"), fullPage: true });

    await exportPage.page.evaluate(() => {
      document.getElementById("itemsHeading")?.scrollIntoView({ block: "start" });
    });
    await exportPage.page.screenshot({ path: path.join(outDir, "export-manual-attachment.png"), fullPage: true });

    const popup = await openExtensionPage(session, "popup.html", "snapshot-popup");
    await waitForReady(popup.page);
    await popup.page.waitForSelector('button[data-action="capture-visible"]', { timeout: 15_000 });
    await popup.page.screenshot({ path: path.join(outDir, "popup.png"), fullPage: true });

    const recorder = await openExtensionPage(session, "record.html", "snapshot-recorder");
    await waitForReady(recorder.page);
    await recorder.page.waitForSelector("#startBtn", { timeout: 15_000 });
    await recorder.page.screenshot({ path: path.join(outDir, "recorder-setup.png"), fullPage: true });

    const settings = await openExtensionPage(session, "options.html", "snapshot-settings");
    await waitForReady(settings.page);
    await settings.page.waitForSelector("h1", { timeout: 15_000 });
    await settings.page.screenshot({ path: path.join(outDir, "settings.png"), fullPage: true });

    const privacy = await openExtensionPage(session, "privacy.html", "snapshot-privacy");
    await waitForReady(privacy.page);
    await privacy.page.waitForSelector("h1", { timeout: 15_000 });
    await privacy.page.screenshot({ path: path.join(outDir, "privacy.png"), fullPage: true });

    const editor = await openExtensionPage(
      session,
      `editor.html?itemId=${encodeURIComponent(seededIds[0])}`,
      "snapshot-editor"
    );
    await waitForReady(editor.page);
    await editor.page.waitForSelector("#editorCanvas", { timeout: 15_000 });
    await editor.page.click('button.tool-btn[data-tool="rect"]');
    const canvasBox = await editor.page.evaluate(() => {
      const el = document.getElementById("editorCanvas");
      if (!el) {
        return null;
      }
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left + rect.width * 0.28,
        y: rect.top + rect.height * 0.28,
        x2: rect.left + rect.width * 0.56,
        y2: rect.top + rect.height * 0.56
      };
    });
    if (!canvasBox) {
      throw new Error("Editor canvas not found for screenshot interaction.");
    }
    await editor.page.mouse.move(canvasBox.x, canvasBox.y);
    await editor.page.mouse.down();
    await editor.page.mouse.move(canvasBox.x2, canvasBox.y2, { steps: 8 });
    await editor.page.mouse.up();
    await editor.page.click('button.tool-btn[data-tool="select"]');
    await editor.page.mouse.click((canvasBox.x + canvasBox.x2) / 2, (canvasBox.y + canvasBox.y2) / 2);
    await editor.page.screenshot({ path: path.join(outDir, "editor-selected-object.png"), fullPage: true });

    console.log(`UI snapshots written to ${path.relative(root, outDir)}`);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
