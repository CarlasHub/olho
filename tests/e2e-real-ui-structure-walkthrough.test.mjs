import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertNoPageErrors, withRealExtension } from "./e2e-real-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const resultsDir = path.join(root, "test-results");
const screenshotDir = path.join(resultsDir, "ui-structure-walkthrough");
const outJson = path.join(resultsDir, "ui-structure-walkthrough.json");
const outMd = path.join(resultsDir, "ui-structure-walkthrough.md");

const DESKTOP = { name: "desktop", width: 1280, height: 900 };
const NARROW = { name: "narrow", width: 390, height: 844 };
const GALLERY_NARROW = { name: "narrow", width: 456, height: 844 };
const POPUP_NARROW = { name: "narrow", width: 420, height: 844 };
const VIEWPORTS = [NARROW, DESKTOP];
const GALLERY_VIEWPORTS = [GALLERY_NARROW, DESKTOP];
const POPUP_VIEWPORTS = [POPUP_NARROW, DESKTOP];

function escapeMarkdown(text) {
  return String(text || "").replace(/\|/g, "\\|");
}

async function setViewport(page, viewport) {
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
}

async function saveScreenshot(page, slug, viewport) {
  await fs.mkdir(screenshotDir, { recursive: true });
  const fileName = `${slug}-${viewport.name}.png`;
  const target = path.join(screenshotDir, fileName);
  await page.screenshot({ path: target, fullPage: true });
  return path.relative(root, target);
}

async function collectLayout(page) {
  return page.evaluate(() => {
    const rootEl = document.documentElement;
    const body = document.body;
    const hScroll = Math.max(rootEl.scrollWidth - rootEl.clientWidth, body.scrollWidth - body.clientWidth);
    const vScroll = Math.max(rootEl.scrollHeight - rootEl.clientHeight, body.scrollHeight - body.clientHeight);
    let widest = null;
    for (const node of document.querySelectorAll("*")) {
      const rect = node.getBoundingClientRect();
      if (!widest || rect.right > widest.right) {
        const id = node.id ? `#${node.id}` : "";
        const className =
          typeof node.className === "string" && node.className.trim()
            ? `.${node.className.trim().replace(/\s+/g, ".")}`
            : "";
        widest = {
          target: `${String(node.tagName || "").toLowerCase()}${id}${className}`,
          right: Number(rect.right || 0),
          left: Number(rect.left || 0),
          width: Number(rect.width || 0)
        };
      }
    }
    return {
      clientWidth: Number(rootEl.clientWidth || 0),
      scrollXOverflow: Number(hScroll || 0),
      verticalScrollable: Number(vScroll || 0),
      title: String(document.title || "").trim(),
      h1: String(document.querySelector("h1")?.textContent || "").trim(),
      widest
    };
  });
}

async function collectFocusTrail(page, steps = 10) {
  await page.evaluate(() => {
    if (document.body) {
      document.body.focus();
    }
  });
  const trail = [];
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Tab");
    const snapshot = await page.evaluate(() => {
      const node = document.activeElement;
      if (!node) return null;
      const id = node.id ? `#${node.id}` : "";
      const dataAction = node.getAttribute?.("data-action");
      const rect = node.getBoundingClientRect();
      return {
        tag: String(node.tagName || "").toLowerCase(),
        label: String(
          node.getAttribute?.("aria-label") ||
            node.textContent ||
            node.getAttribute?.("title") ||
            ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 70),
        target: `${String(node.tagName || "").toLowerCase()}${id}${dataAction ? `[data-action="${dataAction}"]` : ""}`,
        x: Math.round(rect.left),
        y: Math.round(rect.top)
      };
    });
    if (snapshot) {
      trail.push(snapshot);
    }
  }
  return trail;
}

async function ensureNoHorizontalOverflow(page, context) {
  const layout = await collectLayout(page);
  assert.ok(
    layout.scrollXOverflow <= 1,
    `${context} has horizontal overflow (${layout.scrollXOverflow}px) at clientWidth=${layout.clientWidth}; widest=${JSON.stringify(layout.widest)}`
  );
  return layout;
}

async function seedGalleryData(page, count = 6) {
  return page.evaluate(async (total) => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    const ids = [];
    for (let index = 0; index < total; index += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 560;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("2D context unavailable while seeding gallery walkthrough media.");
      }
      ctx.fillStyle = index % 2 === 0 ? "#0f172a" : "#111827";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#93c5fd";
      ctx.fillRect(40, 50, 420, 240);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 34px sans-serif";
      ctx.fillText(`Walkthrough ${index + 1}`, 60, 350);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((nextBlob) => {
          if (nextBlob) {
            resolve(nextBlob);
            return;
          }
          reject(new Error("Failed to convert walkthrough seed canvas to blob."));
        }, "image/png");
      });
      const saved = await storage.saveMedia({
        kind: "screenshot",
        sourceType: "visible",
        blob,
        metadata: {
          title: `Walkthrough item ${index + 1} with extended descriptive title`,
          tags: ["walkthrough", "ui-structure", `tag-${index + 1}`]
        }
      });
      ids.push(saved.id);
    }
    return ids;
  }, count);
}

async function clearStorage(page) {
  await page.evaluate(async () => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    await storage.clearAllData();
  });
}

test(
  "real rendered UI walkthrough validates structure across core screens and states",
  { timeout: 240_000 },
  async () => {
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.mkdir(screenshotDir, { recursive: true });

    const evidence = [];
    const failures = [];
    const checks = [];

    await withRealExtension("real-ui-structure-walkthrough", async ({ openPage }) => {
      const gallery = await openPage("gallery.html", "ui-walkthrough-gallery");
      await clearStorage(gallery.page);
      await gallery.page.reload({ waitUntil: "load", timeout: 20_000 });
      await gallery.page.waitForSelector("#emptyState:not([hidden])", { timeout: 20_000 });

      for (const viewport of GALLERY_VIEWPORTS) {
        await setViewport(gallery.page, viewport);
        const layout = await ensureNoHorizontalOverflow(gallery.page, `gallery empty (${viewport.name})`);
        const shot = await saveScreenshot(gallery.page, "gallery-empty", viewport);
        evidence.push({ state: "gallery-empty", viewport: viewport.name, screenshot: shot, layout });
      }

      const bulkVisibility = await gallery.page.evaluate(() => {
        const node = document.getElementById("bulkToolbar");
        if (!node) {
          return { exists: false, hidden: false, display: "missing" };
        }
        return {
          exists: true,
          hidden: Boolean(node.hidden),
          display: getComputedStyle(node).display
        };
      });
      assert.equal(bulkVisibility.exists, true, "bulk toolbar must exist in gallery");
      assert.equal(bulkVisibility.hidden, true, "bulk toolbar must remain hidden in empty state");
      assert.equal(bulkVisibility.display, "none", "bulk toolbar hidden state must render as display:none");
      checks.push({
        claim: "Empty memory state hides bulk toolbar",
        evidence: JSON.stringify(bulkVisibility),
        status: "pass"
      });

      const seededIds = await seedGalleryData(gallery.page, 6);
      await gallery.page.reload({ waitUntil: "load", timeout: 20_000 });
      await gallery.page.waitForSelector(".gallery-card", { timeout: 20_000 });
      await gallery.page.click(".gallery-card input[type='checkbox']");
      await gallery.page.waitForSelector("#bulkToolbar:not([hidden])", { timeout: 20_000 });

      for (const viewport of GALLERY_VIEWPORTS) {
        await setViewport(gallery.page, viewport);
        const layout = await ensureNoHorizontalOverflow(gallery.page, `gallery with items (${viewport.name})`);
        const shot = await saveScreenshot(gallery.page, "gallery-items", viewport);
        evidence.push({ state: "gallery-items", viewport: viewport.name, screenshot: shot, layout });
      }

      const popup = await openPage("popup.html", "ui-walkthrough-popup");
      await popup.page.waitForSelector('button[data-action="capture-visible"]', { timeout: 20_000 });
      const popupFocus = await collectFocusTrail(popup.page, 10);
      assert.ok(popupFocus.length >= 5, "popup focus order trail must include at least five focusable controls");

      for (const viewport of POPUP_VIEWPORTS) {
        await setViewport(popup.page, viewport);
        const layout = await ensureNoHorizontalOverflow(popup.page, `popup (${viewport.name})`);
        const shot = await saveScreenshot(popup.page, "popup-default", viewport);
        evidence.push({ state: "popup-default", viewport: viewport.name, screenshot: shot, layout });
      }

      await popup.page.evaluate(() => {
        class FakeTrack {
          constructor(kind, settings = {}) {
            this.kind = kind;
            this.settings = settings;
          }
          getSettings() {
            return { ...this.settings };
          }
          stop() {}
        }
        class FakeMediaStream {
          constructor() {
            this._tracks = [new FakeTrack("video", { width: 640, height: 360, displaySurface: "monitor" })];
          }
          getTracks() {
            return [...this._tracks];
          }
          getVideoTracks() {
            return this._tracks;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(70, 60, 260, 150);
        const dataUrl = canvas.toDataURL("image/png");
        const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (char) => char.charCodeAt(0));
        window.__olhoTestScreenCaptureBlob = new Blob([bytes], { type: "image/png" });
        window.__olhoTestScreenCaptureWidth = 640;
        window.__olhoTestScreenCaptureHeight = 360;
        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          configurable: true,
          writable: true,
          value: async () => new FakeMediaStream()
        });
      });
      await popup.page.click('button[data-action="capture-screen-window"]');
      await popup.page.waitForSelector("#screenCapturePreviewPanel:not([hidden])", { timeout: 20_000 });

      for (const viewport of POPUP_VIEWPORTS) {
        await setViewport(popup.page, viewport);
        const layout = await ensureNoHorizontalOverflow(popup.page, `popup preview (${viewport.name})`);
        const shot = await saveScreenshot(popup.page, "popup-preview", viewport);
        evidence.push({ state: "popup-preview", viewport: viewport.name, screenshot: shot, layout });
      }

      const editor = await openPage(`editor.html?itemId=${encodeURIComponent(seededIds[0])}`, "ui-walkthrough-editor");
      await editor.page.waitForSelector("#editorCanvas", { timeout: 20_000 });
      const editorLoadMessage = await editor.page.evaluate(() => {
        const status = document.getElementById("statusMessage");
        return String(status?.textContent || "").trim().toLowerCase();
      });
      assert.equal(
        editorLoadMessage.includes("failed to load item"),
        false,
        "editor should not show failed-to-load status for valid memory item"
      );

      for (const viewport of VIEWPORTS) {
        await setViewport(editor.page, viewport);
        const layout = await ensureNoHorizontalOverflow(editor.page, `editor (${viewport.name})`);
        const shot = await saveScreenshot(editor.page, "editor", viewport);
        evidence.push({ state: "editor", viewport: viewport.name, screenshot: shot, layout });
      }

      const exportPage = await openPage("export-report.html", "ui-walkthrough-export");
      await exportPage.page.waitForSelector("#itemsContainer", { timeout: 20_000 });
      for (const viewport of VIEWPORTS) {
        await setViewport(exportPage.page, viewport);
        const exportStructure = await exportPage.page.evaluate(() => {
          const header = document.querySelector(".header");
          const nav = document.querySelector(".header .olho-nav");
          const headerStyle = header ? getComputedStyle(header) : null;
          const navStyle = nav ? getComputedStyle(nav) : null;
          const headerRect = header?.getBoundingClientRect();
          const navRect = nav?.getBoundingClientRect();
          return {
            innerWidth: window.innerWidth,
            scrollX: window.scrollX,
            headerFlexDirection: headerStyle?.flexDirection || "",
            headerAlignItems: headerStyle?.alignItems || "",
            headerFlexWrap: headerStyle?.flexWrap || "",
            navDisplay: navStyle?.display || "",
            navPosition: navStyle?.position || "",
            navLeft: navStyle?.left || "",
            navTransform: navStyle?.transform || "",
            navWidth: navStyle?.width || "",
            navMarginLeft: navStyle?.marginLeft || "",
            navPaddingLeft: navStyle?.paddingLeft || "",
            headerWidth: headerStyle?.width || "",
            headerRect: headerRect
              ? { left: headerRect.left, right: headerRect.right, width: headerRect.width }
              : null,
            navRect: navRect
              ? { left: navRect.left, right: navRect.right, width: navRect.width }
              : null
          };
        });
        let layout;
        try {
          layout = await ensureNoHorizontalOverflow(exportPage.page, `export (${viewport.name})`);
        } catch (error) {
          throw new Error(
            `${String(error?.message || error)}; structure=${JSON.stringify(exportStructure)}`
          );
        }
        const shot = await saveScreenshot(exportPage.page, "export", viewport);
        evidence.push({ state: "export", viewport: viewport.name, screenshot: shot, layout, exportStructure });
      }

      const record = await openPage("record.html", "ui-walkthrough-record");
      await record.page.waitForSelector("#startBtn", { timeout: 20_000 });
      for (const viewport of VIEWPORTS) {
        await setViewport(record.page, viewport);
        const recordStructure = await record.page.evaluate(() => {
          const cluster = document.querySelector(".header-actions.olho-topbar-actions");
          const style = cluster ? getComputedStyle(cluster) : null;
          const rect = cluster?.getBoundingClientRect();
          return {
            innerWidth: window.innerWidth,
            marginLeft: style?.marginLeft || "",
            justifyContent: style?.justifyContent || "",
            display: style?.display || "",
            rect: rect ? { left: rect.left, right: rect.right, width: rect.width } : null
          };
        });
        let layout;
        try {
          layout = await ensureNoHorizontalOverflow(record.page, `record (${viewport.name})`);
        } catch (error) {
          throw new Error(`${String(error?.message || error)}; structure=${JSON.stringify(recordStructure)}`);
        }
        const shot = await saveScreenshot(record.page, "record", viewport);
        evidence.push({ state: "record", viewport: viewport.name, screenshot: shot, layout, recordStructure });
      }

      const options = await openPage("options.html", "ui-walkthrough-options");
      await options.page.waitForSelector("#optionsForm", { timeout: 20_000 });
      for (const viewport of VIEWPORTS) {
        await setViewport(options.page, viewport);
        const layout = await ensureNoHorizontalOverflow(options.page, `options (${viewport.name})`);
        const shot = await saveScreenshot(options.page, "options", viewport);
        evidence.push({ state: "options", viewport: viewport.name, screenshot: shot, layout });
      }

      const privacy = await openPage("privacy.html", "ui-walkthrough-privacy");
      await privacy.page.waitForSelector("main", { timeout: 20_000 });
      for (const viewport of VIEWPORTS) {
        await setViewport(privacy.page, viewport);
        const layout = await ensureNoHorizontalOverflow(privacy.page, `privacy (${viewport.name})`);
        const shot = await saveScreenshot(privacy.page, "privacy", viewport);
        evidence.push({ state: "privacy", viewport: viewport.name, screenshot: shot, layout });
      }

      for (const telemetrySource of [gallery, popup, editor, exportPage, record, options, privacy]) {
        assertNoPageErrors(telemetrySource.telemetry, telemetrySource.telemetry.label || "ui-walkthrough-page");
      }
    }).catch((error) => {
      failures.push(String(error?.stack || error?.message || error));
      throw error;
    });

    const result = {
      generatedAt: new Date().toISOString(),
      status: failures.length === 0 ? "pass" : "fail",
      checks,
      screenshots: evidence,
      failures
    };

    await fs.writeFile(outJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    const lines = [
      "# UI Structure Walkthrough",
      "",
      `- Generated: ${result.generatedAt}`,
      `- Status: ${result.status}`,
      `- Screenshots: ${evidence.length}`,
      "",
      "## Checks",
      ...(checks.length
        ? checks.map((row) => `- ${row.claim}: ${row.status} (${row.evidence})`)
        : ["- No explicit checks recorded."]),
      "",
      "## Screenshot Evidence",
      "| State | Viewport | Screenshot | Horizontal Overflow (px) |",
      "|---|---|---|---:|",
      ...evidence.map((row) => {
        return `| ${escapeMarkdown(row.state)} | ${row.viewport} | ${escapeMarkdown(row.screenshot)} | ${Number(row.layout?.scrollXOverflow || 0)} |`;
      }),
      "",
      "## Failures",
      ...(failures.length ? failures.map((entry) => `- ${entry}`) : ["- None"])
    ];

    await fs.writeFile(outMd, `${lines.join("\n")}\n`, "utf8");

    assert.deepEqual(failures, [], "UI structure walkthrough has failures");
  }
);
