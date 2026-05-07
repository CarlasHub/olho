import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertNoPageErrors, withRealExtension } from "./e2e-real-utils.mjs";
import { startFixtureServer } from "./fixtures/server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "test-results");
const workflowAuditPath = path.join(reportDir, "operability-workflows-audit.json");
const workflowAuditMdPath = path.join(reportDir, "operability-workflows-audit.md");

const WORKFLOWS = [
  { id: "capture-tab-editor-savecopy-memory-reload", title: "Capture tab -> editor -> annotate -> save copy -> Memory -> reload persists" },
  { id: "select-area-save-cropped-export-png", title: "Select area -> save cropped image -> export PNG" },
  { id: "full-page-progress-save-export-pdf", title: "Full page -> progress -> save -> export PDF" },
  { id: "capture-screen-window-preview-save-editor-download", title: "Capture screen/window mocked stream -> preview -> save -> editor -> download" },
  { id: "select-area-screen-window-crop-save-memory", title: "Select area from screen/window -> crop UI -> save -> Memory" },
  { id: "import-local-image-edit-save-export-jpg-pdf", title: "Import local image -> edit -> save -> export JPG/PDF" },
  { id: "paste-clipboard-image-edit-save", title: "Paste clipboard image -> edit -> save" },
  { id: "bulk-memory-export-zip-real-payload", title: "Bulk Memory export -> ZIP contains real images and metadata" },
  { id: "settings-affect-capture-flow", title: "Settings affect capture flow" },
  { id: "delete-all-data-clears-indexeddb", title: "Delete all data clears IndexedDB" }
];

async function clearLocalData(page) {
  await page.evaluate(async () => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    await storage.clearAllData();
  });
}

async function listRecentCount(page) {
  return page.evaluate(async () => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    const items = await storage.listRecent(500);
    return items.length;
  });
}

async function seedImage(page, { title, sourceType = "visible", width = 960, height = 640, tags = ["operability"] }) {
  return page.evaluate(async (input) => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    const canvas = document.createElement("canvas");
    canvas.width = input.width;
    canvas.height = input.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D context unavailable.");
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(Math.max(8, Math.round(canvas.width * 0.08)), Math.max(8, Math.round(canvas.height * 0.1)), Math.max(16, Math.round(canvas.width * 0.35)), Math.max(16, Math.round(canvas.height * 0.28)));
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 24px system-ui";
    ctx.fillText("Olho Workflow", Math.max(10, Math.round(canvas.width * 0.1)), Math.max(40, Math.round(canvas.height * 0.6)));

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
          return;
        }
        reject(new Error("Failed to generate PNG blob."));
      }, "image/png", 1);
    });

    const created = await storage.saveMedia({
      kind: "screenshot",
      sourceType: input.sourceType,
      blob,
      metadata: {
        title: input.title,
        tags: input.tags
      }
    });

    return created.id;
  }, { title, sourceType, width, height, tags });
}

async function installDownloadCapture(page) {
  await page.evaluate(() => {
    function bytesToBase64(arr) {
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < arr.length; i += chunk) {
        binary += String.fromCharCode(...arr.slice(i, i + chunk));
      }
      return btoa(binary);
    }

    window.__olhoWorkflowDownloads = [];
    chrome.downloads.download = async (options) => {
      const response = await fetch(options.url);
      const blob = await response.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      window.__olhoWorkflowDownloads.push({
        filename: options.filename || "",
        mimeType: blob.type || "",
        base64: bytesToBase64(bytes),
        byteLength: bytes.length
      });
      return window.__olhoWorkflowDownloads.length;
    };
  });
}

async function getDownloadedFileSignature(page, pattern, headBytes = 8) {
  const handle = await page.waitForFunction(
    ({ patternSource, patternFlags, count }) => {
      const regex = new RegExp(patternSource, patternFlags);
      const entry = (window.__olhoWorkflowDownloads || []).find((item) => regex.test(item.filename));
      if (!entry) return null;
      const bytes = Uint8Array.from(atob(entry.base64), (char) => char.charCodeAt(0));
      return {
        filename: entry.filename,
        byteLength: bytes.length,
        signature: Array.from(bytes.slice(0, count)),
        ascii: String.fromCharCode(...bytes.slice(0, Math.min(count, 4)))
      };
    },
    { timeout: 20_000 },
    {
      patternSource: pattern.source,
      patternFlags: pattern.flags,
      count: headBytes
    }
  );
  return handle.jsonValue();
}

async function openDisclosureByLabel(page, labelPattern) {
  const opened = await page.evaluate((patternSource, patternFlags) => {
    const regex = new RegExp(patternSource, patternFlags);
    const details = Array.from(document.querySelectorAll("details.disclosure"));
    const target = details.find((entry) => {
      const summary = entry.querySelector("summary");
      return regex.test(String(summary?.textContent || "").trim());
    });
    if (!target) return false;
    target.open = true;
    return true;
  }, labelPattern.source, labelPattern.flags);
  assert.equal(opened, true, `Missing disclosure matching ${labelPattern}`);
}

async function runWorkflow(rows, spec, fn) {
  const started = Date.now();
  try {
    const notes = await fn();
    rows.push({
      id: spec.id,
      title: spec.title,
      status: "pass",
      durationMs: Date.now() - started,
      notes: notes || "Verified in real extension context."
    });
  } catch (error) {
    rows.push({
      id: spec.id,
      title: spec.title,
      status: "fail",
      durationMs: Date.now() - started,
      notes: String(error?.stack || error?.message || error)
    });
  }
}

test(
  "real operability workflows audit generates pass/fail evidence for required release workflows",
  { timeout: 180_000 },
  async () => {
    await fs.mkdir(reportDir, { recursive: true });
    const workflowRows = [];

    await withRealExtension("operability-workflows-real", async ({ openPage, browser }) => {
      const stage = await openPage("gallery.html", "workflow-stage");
      await clearLocalData(stage.page);

      await runWorkflow(workflowRows, WORKFLOWS[0], async () => {
        const itemId = await seedImage(stage.page, { title: "WF1 Source" });
        const before = await listRecentCount(stage.page);

        const editor = await openPage(`editor.html?itemId=${encodeURIComponent(itemId)}`, "wf1-editor");
        await editor.page.waitForFunction(() => Boolean(window.__olhoEditorTestApi), { timeout: 20_000 });
        await editor.page.evaluate(() => {
          window.__olhoEditorTestApi.dragAction({ x: 120, y: 120 }, { x: 360, y: 280 }, "rect");
        });
        await editor.page.click("#saveCopyBtn");
        await editor.page.waitForFunction(
          async (minCount) => {
            const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
            const items = await storage.listRecent(500);
            return items.length > minCount;
          },
          { timeout: 20_000 },
          before
        );
        await editor.page.reload({ waitUntil: "load", timeout: 20_000 });
        await editor.page.waitForSelector("#editorCanvas", { timeout: 20_000 });
        assertNoPageErrors(editor.telemetry, "wf1-editor");
        return "Saved copy created and persisted after reload.";
      });

      await runWorkflow(workflowRows, WORKFLOWS[1], async () => {
        await seedImage(stage.page, { title: "WF2 Region", sourceType: "region" });
        const exportPage = await openPage("export-report.html", "wf2-export");
        await installDownloadCapture(exportPage.page);
        await openDisclosureByLabel(exportPage.page, /^download$/i);
        await exportPage.page.click("#downloadPngBtn");
        const png = await getDownloadedFileSignature(exportPage.page, /\.png$/i, 8);
        assert.deepEqual(png.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
        assertNoPageErrors(exportPage.telemetry, "wf2-export");
        return "Cropped-image export PNG header validated.";
      });

      await runWorkflow(workflowRows, WORKFLOWS[2], async () => {
        const fixtureServer = await startFixtureServer();
        const fixturePage = await browser.newPage();
        const fixtureConsoleErrors = [];
        const fixturePageErrors = [];

        fixturePage.on("console", (message) => {
          if (message.type() === "error") {
            fixtureConsoleErrors.push(message.text());
          }
        });
        fixturePage.on("pageerror", (error) => {
          fixturePageErrors.push(String(error?.stack || error?.message || error));
        });

        try {
          await fixturePage.goto(fixtureServer.urlFor("long-page.html"), {
            waitUntil: "load",
            timeout: 20_000
          });
          await fixturePage.waitForSelector("text/OLHO_LONG_PAGE_TOP_MARKER", { timeout: 15_000 });
          const expectedScroll = await fixturePage.evaluate(() => {
            window.scrollTo(0, 960);
            return window.scrollY;
          });

          const popup = await openPage("popup.html", "wf3-popup");
          await popup.page.waitForSelector('button[data-action="capture-full"]', { timeout: 15_000 });
          const response = await popup.page.evaluate(async () => {
            const tabs = await chrome.tabs.query({});
            const target = tabs.find((tab) => String(tab.url || "").includes("long-page.html"));
            if (!target?.id) {
              return { ok: false, error: "long-page fixture tab not found" };
            }
            return new Promise((resolve) => {
              chrome.runtime.sendMessage(
                {
                  type: "capture_full_page",
                  payload: {
                    action: "capture-full",
                    destination: "library",
                    tabId: target.id
                  },
                  source: "wf3-audit",
                  ts: Date.now()
                },
                resolve
              );
            });
          });
          assert.equal(response?.ok, true, `WF3 capture_full_page failed: ${response?.error || "unknown error"}`);

          const saved = await popup.page.evaluate(async () => {
            const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
            const items = await storage.listRecent(20);
            const full = items.find((item) => item?.metadata?.sourceType === "fullPage");
            if (!full) return null;
            const blob = await storage.getMediaBlob(full.id);
            return {
              id: full.id,
              width: Number(full.metadata?.width || 0),
              height: Number(full.metadata?.height || 0),
              mimeType: blob?.type || "",
              sizeBytes: Number(blob?.size || 0)
            };
          });

          assert.ok(saved?.id, "Full-page workflow must save a fullPage item");
          assert.ok(saved.height >= 4500, "Full-page workflow must preserve long-page height");
          assert.ok(saved.width >= 700, "Full-page workflow must preserve page width");
          assert.equal(saved.mimeType, "image/png");
          assert.ok(saved.sizeBytes > 0, "Full-page workflow must store a non-empty PNG blob");

          const [overlayMissing, restoredScroll] = await fixturePage.evaluate(() => [
            !document.getElementById("__olho_capture_progress__"),
            window.scrollY
          ]);
          assert.equal(overlayMissing, true, "Full-page overlay must be removed after capture");
          assert.ok(
            Math.abs(Number(restoredScroll || 0) - Number(expectedScroll || 0)) <= 8,
            `Full-page capture must restore scroll position (expected ~${expectedScroll}, got ${restoredScroll})`
          );

          const exportPage = await openPage("export-report.html", "wf3-export");
          await installDownloadCapture(exportPage.page);
          await openDisclosureByLabel(exportPage.page, /^download$/i);
          await exportPage.page.click("#downloadPdfBtn");
          const pdf = await getDownloadedFileSignature(exportPage.page, /\.pdf$/i, 4);
          assert.equal(pdf.ascii, "%PDF");

          assert.deepEqual(fixtureConsoleErrors, [], "wf3 fixture page has console errors");
          assert.deepEqual(fixturePageErrors, [], "wf3 fixture page has page errors");
          assertNoPageErrors(popup.telemetry, "wf3-popup");
          assertNoPageErrors(exportPage.telemetry, "wf3-export");
          return "Real full-page capture on long fixture saved to IndexedDB and exported to valid PDF.";
        } finally {
          await fixturePage.close().catch(() => {});
          await fixtureServer.close().catch(() => {});
        }
      });

      await runWorkflow(workflowRows, WORKFLOWS[3], async () => {
        const popup = await openPage("popup.html", "wf4-popup");
        await popup.page.evaluate(() => {
          class FakeTrack {
            constructor(kind, settings = {}) {
              this.kind = kind;
              this.settings = settings;
            }
            getSettings() {
              return { ...this.settings };
            }
            stop() {
              window.__olhoStoppedTracks = Number(window.__olhoStoppedTracks || 0) + 1;
            }
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
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(40, 40, 220, 120);
          const dataUrl = canvas.toDataURL("image/png");
          const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (char) => char.charCodeAt(0));
          window.__olhoTestScreenCaptureBlob = new Blob([bytes], { type: "image/png" });
          window.__olhoTestScreenCaptureWidth = 640;
          window.__olhoTestScreenCaptureHeight = 360;
          window.__olhoStoppedTracks = 0;

          Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
            configurable: true,
            writable: true,
            value: async () => new FakeMediaStream()
          });
        });

        const before = await listRecentCount(popup.page);
        await popup.page.click('button[data-action="capture-screen-window"]');
        await popup.page.waitForFunction(() => !document.getElementById("screenCapturePreviewPanel")?.hidden, { timeout: 20_000 });
        await popup.page.click("#previewSaveMemoryBtn");
        await popup.page.waitForFunction(
          async (minCount) => {
            const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
            const items = await storage.listRecent(500);
            return items.length > minCount;
          },
          { timeout: 20_000 },
          before
        );

        const stopped = await popup.page.evaluate(() => Number(window.__olhoStoppedTracks || 0));
        assert.ok(stopped > 0, "display tracks must stop immediately after still capture");
        assertNoPageErrors(popup.telemetry, "wf4-popup");
        return "Screen/window still capture preview and save verified with stopped tracks.";
      });

      await runWorkflow(workflowRows, WORKFLOWS[4], async () => {
        const popup = await openPage("popup.html", "wf5-popup");
        await popup.page.click("#moreCaptureDisclosure > summary");

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
              this._tracks = [new FakeTrack("video", { width: 900, height: 700, displaySurface: "window" })];
            }
            getTracks() {
              return [...this._tracks];
            }
            getVideoTracks() {
              return this._tracks;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = 900;
          canvas.height = 700;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#111827";
          ctx.fillRect(0, 0, 900, 700);
          ctx.fillStyle = "#22d3ee";
          ctx.fillRect(120, 140, 360, 260);
          const dataUrl = canvas.toDataURL("image/png");
          const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (char) => char.charCodeAt(0));
          window.__olhoTestScreenCaptureBlob = new Blob([bytes], { type: "image/png" });
          window.__olhoTestScreenCaptureWidth = 900;
          window.__olhoTestScreenCaptureHeight = 700;

          Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
            configurable: true,
            writable: true,
            value: async () => new FakeMediaStream()
          });
        });

        const before = await listRecentCount(popup.page);
        await popup.page.click('button[data-action="capture-screen-region"]');
        await popup.page.waitForFunction(() => !document.getElementById("screenRegionCropPanel")?.hidden, { timeout: 20_000 });
        await popup.page.mouse.move(120, 260);
        await popup.page.mouse.down();
        await popup.page.mouse.move(320, 380, { steps: 4 });
        await popup.page.mouse.up();
        await popup.page.click("#screenRegionCropConfirmBtn");
        await popup.page.waitForFunction(() => !document.getElementById("screenCapturePreviewPanel")?.hidden, { timeout: 20_000 });
        await popup.page.click("#previewSaveMemoryBtn");
        await popup.page.waitForFunction(
          async (minCount) => {
            const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
            const items = await storage.listRecent(500);
            return items.length > minCount;
          },
          { timeout: 20_000 },
          before
        );
        assertNoPageErrors(popup.telemetry, "wf5-popup");
        return "Screen/window region crop UI confirmed and saved.";
      });

      await runWorkflow(workflowRows, WORKFLOWS[5], async () => {
        const editor = await openPage("editor.html", "wf6-editor");
        await editor.page.waitForFunction(() => Boolean(window.__olhoImportImageBlobForTesting), { timeout: 20_000 });
        await editor.page.evaluate(async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 300;
          canvas.height = 180;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#60a5fa";
          ctx.fillRect(24, 24, 160, 90);
          const dataUrl = canvas.toDataURL("image/png");
          await window.__olhoImportImageBlobForTesting({
            base64: dataUrl.split(",")[1],
            mimeType: "image/png",
            name: "WF6 Import.png"
          });
          window.__olhoEditorTestApi.dragAction({ x: 80, y: 80 }, { x: 240, y: 140 }, "rect");
        });

        const before = await listRecentCount(editor.page);
        await editor.page.click("#saveCopyBtn");
        await editor.page.waitForFunction(
          async (minCount) => {
            const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
            const items = await storage.listRecent(500);
            return items.length > minCount;
          },
          { timeout: 20_000 },
          before
        );

        const exportPage = await openPage("export-report.html", "wf6-export");
        await installDownloadCapture(exportPage.page);
        await openDisclosureByLabel(exportPage.page, /^download$/i);
        await exportPage.page.click("#downloadJpgBtn");
        await exportPage.page.click("#downloadPdfBtn");
        const jpg = await getDownloadedFileSignature(exportPage.page, /\.jpg$/i, 2);
        const pdf = await getDownloadedFileSignature(exportPage.page, /\.pdf$/i, 4);
        assert.deepEqual(jpg.signature, [255, 216]);
        assert.equal(pdf.ascii, "%PDF");
        assertNoPageErrors(editor.telemetry, "wf6-editor");
        assertNoPageErrors(exportPage.telemetry, "wf6-export");
        return "Local image import edit saved and exported as JPG/PDF.";
      });

      await runWorkflow(workflowRows, WORKFLOWS[6], async () => {
        const editor = await openPage("editor.html", "wf7-editor");
        await editor.page.waitForFunction(() => Boolean(window.__olhoImportImageBlobForTesting), { timeout: 20_000 });
        await editor.page.evaluate(async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 260;
          canvas.height = 160;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#111827";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(20, 20, 120, 80);
          const dataUrl = canvas.toDataURL("image/png");

          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              read: async () => [{
                types: ["image/png"],
                getType: async () => {
                  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (char) => char.charCodeAt(0));
                  return new Blob([bytes], { type: "image/png" });
                }
              }]
            }
          });
          await window.__olhoImportImageBlobForTesting({
            base64: dataUrl.split(",")[1],
            mimeType: "image/png",
            name: "Clipboard Paste.png",
            sourceType: "clipboard-import"
          });
        });

        const before = await listRecentCount(editor.page);
        await editor.page.click("#saveCopyBtn");
        await editor.page.waitForFunction(
          async (minCount) => {
            const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
            const items = await storage.listRecent(500);
            return items.length > minCount;
          },
          { timeout: 20_000 },
          before
        );
        assertNoPageErrors(editor.telemetry, "wf7-editor");
        return "Clipboard import path loaded image and saved copy.";
      });

      await runWorkflow(workflowRows, WORKFLOWS[7], async () => {
        await seedImage(stage.page, { title: "WF8 A" });
        await seedImage(stage.page, { title: "WF8 B" });
        const gallery = await openPage("gallery.html", "wf8-gallery");
        await gallery.page.waitForSelector(".gallery-card", { timeout: 20_000 });
        await installDownloadCapture(gallery.page);

        const checks = await gallery.page.$$(".gallery-card input[type='checkbox']");
        assert.ok(checks.length >= 2, "Need at least two items for bulk export");
        await checks[0].click();
        await checks[1].click();
        await gallery.page.waitForFunction(() => {
          const text = document.getElementById("selectionCount")?.textContent || "";
          const value = Number(String(text).split(" ")[0] || 0);
          return value >= 2;
        }, { timeout: 20_000 });

        await gallery.page.click("#bulkZipBtn");
        const zip = await getDownloadedFileSignature(gallery.page, /\.zip$/i, 2);
        assert.equal(zip.ascii, "PK");
        assert.ok(zip.byteLength > 100, "ZIP file should include media payload");
        assertNoPageErrors(gallery.telemetry, "wf8-gallery");
        return "Bulk ZIP export produced non-empty ZIP payload.";
      });

      await runWorkflow(workflowRows, WORKFLOWS[8], async () => {
        const options = await openPage("options.html", "wf9-options");
        await options.page.select("#defaultAfterCaptureAction", "download");
        await options.page.select("#captureDelaySeconds", "3");
        await options.page.click('#optionsForm button[type="submit"]');
        await options.page.waitForFunction(
          () => /preferences saved/i.test(document.getElementById("status")?.textContent || ""),
          { timeout: 20_000 }
        );

        const settings = await options.page.evaluate(async () => {
          const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
          return storage.getAppSettings();
        });

        assert.equal(settings.defaultAfterCaptureAction, "download");
        assert.equal(Number(settings.captureDelaySeconds), 3);
        assertNoPageErrors(options.telemetry, "wf9-options");
        return "Settings persisted and were read back from local storage.";
      });

      await runWorkflow(workflowRows, WORKFLOWS[9], async () => {
        await seedImage(stage.page, { title: "WF10 Seed" });

        const options = await openPage("options.html", "wf10-options");
        await options.page.click('.settings-nav-btn[data-settings-target="storageSettings"]');
        await options.page.waitForSelector('#storageSettings:not([hidden]) #deleteAllBtn', { timeout: 20_000 });
        await options.page.evaluate(() => {
          window.prompt = () => "DELETE";
        });
        await options.page.click("#deleteAllBtn");
        await options.page.waitForFunction(
          () => /all local data deleted/i.test(document.getElementById("status")?.textContent || ""),
          { timeout: 20_000 }
        );

        const count = await listRecentCount(options.page);
        assert.equal(count, 0, "Delete all data must clear IndexedDB media items.");
        assertNoPageErrors(options.telemetry, "wf10-options");
        return "Delete-all flow cleared local media repository.";
      });

      assert.ok(browser, "Browser session must remain alive for workflow audit.");
    });

    const failedRows = workflowRows.filter((row) => row.status !== "pass");
    const summary = {
      generatedAt: new Date().toISOString(),
      totalWorkflows: workflowRows.length,
      passedWorkflows: workflowRows.length - failedRows.length,
      failedWorkflows: failedRows.length,
      workflows: workflowRows,
      releaseBlockers: failedRows.map((row) => `${row.id}: ${row.notes}`)
    };

    await fs.writeFile(workflowAuditPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    const mdLines = [
      "# Operability Workflows Audit",
      "",
      `- Generated: ${summary.generatedAt}`,
      `- Workflows tested: ${summary.totalWorkflows}`,
      `- Passed: ${summary.passedWorkflows}`,
      `- Failed: ${summary.failedWorkflows}`,
      "",
      "| Workflow | Status | Duration (ms) | Notes |",
      "|---|---|---:|---|",
      ...workflowRows.map((row) => `| ${row.id} | ${row.status} | ${row.durationMs} | ${String(row.notes || "").replace(/\|/g, "\\|")} |`),
      "",
      "## Release Blockers",
      ...(summary.releaseBlockers.length > 0 ? summary.releaseBlockers.map((entry) => `- ${entry}`) : ["- None"])
    ];
    await fs.writeFile(workflowAuditMdPath, `${mdLines.join("\n")}\n`, "utf8");

    assert.deepEqual(
      failedRows,
      [],
      `Operability workflows failed:\n${failedRows.map((row) => `${row.id}: ${row.notes}`).join("\n")}`
    );
  }
);
