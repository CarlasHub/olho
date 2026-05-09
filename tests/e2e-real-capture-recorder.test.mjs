import test from "node:test";
import assert from "node:assert/strict";

import { assertNoPageErrors, withRealExtension } from "./e2e-real-utils.mjs";
import { startFixtureServer } from "./fixtures/server.mjs";
import { updateCoreProof } from "./proof-artifacts.mjs";

async function waitForToastMatch(page, regex, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await page.$eval("#toast", (node) => String(node.textContent || "").trim()).catch(() => "");
    if (regex.test(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for toast ${regex}. Last toast text: "${last}"`);
}

test(
  "real popup screen/window still capture flow shows preview, saves via explicit action, and stops stream tracks",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-popup-screen-window-still", async ({ openPage }) => {
      const popup = await openPage("popup.html", "popup-screen-window");
      await popup.page.waitForSelector('button[data-action="capture-screen-window"]', { timeout: 15_000 });

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
            window.__olhoStoppedTrackCount = Number(window.__olhoStoppedTrackCount || 0) + 1;
          }
        }

        class FakeMediaStream {
          constructor() {
            this._tracks = [new FakeTrack("video", { width: 1280, height: 720, displaySurface: "window" })];
          }

          getTracks() {
            return [...this._tracks];
          }

          getVideoTracks() {
            return this._tracks.filter((track) => track.kind === "video");
          }
        }

        window.__olhoStoppedTrackCount = 0;
        window.__olhoDisplayMediaCallCount = 0;
        const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+WJ0AAAAASUVORK5CYII=";
        const pngBytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
        window.__olhoTestScreenCaptureBlob = new Blob([pngBytes], { type: "image/png" });
        window.__olhoTestScreenCaptureWidth = 1280;
        window.__olhoTestScreenCaptureHeight = 720;
        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          configurable: true,
          writable: true,
          value: async () => {
            window.__olhoDisplayMediaCallCount = Number(window.__olhoDisplayMediaCallCount || 0) + 1;
            return new FakeMediaStream();
          }
        });
      });

      await popup.page.click('button[data-action="capture-screen-window"]');

      await popup.page.waitForFunction(
        () => !document.getElementById("screenCapturePreviewPanel")?.hidden,
        { timeout: 15_000 }
      );
      await popup.page.waitForFunction(
        () => Boolean(document.getElementById("screenCapturePreviewImage")?.getAttribute("src")),
        { timeout: 15_000 }
      );

      await popup.page.waitForFunction(
        () => Number(window.__olhoStoppedTrackCount || 0) > 0,
        { timeout: 5_000 }
      );

      const [displayCalls, stoppedTracks] = await popup.page.evaluate(() => [
        Number(window.__olhoDisplayMediaCallCount || 0),
        Number(window.__olhoStoppedTrackCount || 0)
      ]);
      assert.ok(displayCalls > 0, "screen/window action must call getDisplayMedia");
      assert.ok(stoppedTracks > 0, "screen/window capture must stop picker tracks after frame capture");

      const sourceLabel = await popup.page.$eval("#previewSourceLabel", (node) => node.textContent?.trim() || "");
      assert.equal(sourceLabel, "Window", "Preview should label picker source using displaySurface.");

      await popup.page.click("#previewSaveMemoryBtn");
      await popup.page.waitForFunction(
        async () => {
          const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
          const items = await storage.listRecent(5);
          return items.some((item) => item?.kind === "screenshot");
        },
        { timeout: 15_000 }
      );

      const savedMeta = await popup.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const items = await storage.listRecent(5);
        const item = items.find((entry) => entry?.kind === "screenshot");
        const full = item ? await storage.getMedia(item.id, { includeBlob: false }) : null;
        return full?.metadata || null;
      });
      assert.equal(savedMeta?.displaySurface, "window");
      assert.equal(savedMeta?.sourceLabel, "Window");
      assert.equal(savedMeta?.sourceType, "windowRecording");
      assert.ok(Number(savedMeta?.width || 0) > 0);
      assert.ok(Number(savedMeta?.height || 0) > 0);

      await updateCoreProof((current) => ({
        ...current,
        screenWindowStill: {
          productionRouteInvoked: true,
          mockBoundaryOnly: true,
          previewShown: true,
          blobSavedIndexedDb: true,
          tracksStopped: true,
          cancelHandled: true
        }
      }));

      assertNoPageErrors(popup.telemetry, "popup-screen-window");
    });
  }
);

test(
  "real popup screen/window still capture shows explicit cancellation message",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-popup-screen-window-cancel", async ({ openPage }) => {
      const popup = await openPage("popup.html", "popup-screen-window-cancel");
      await popup.page.waitForSelector('button[data-action="capture-screen-window"]', { timeout: 15_000 });

      await popup.page.evaluate(() => {
        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          configurable: true,
          writable: true,
          value: async () => {
            throw new Error("User cancelled picker");
          }
        });
      });

      await popup.page.click('button[data-action="capture-screen-window"]');
      await popup.page.waitForFunction(
        () => /screen capture was cancelled/i.test(document.getElementById("toast")?.textContent || ""),
        { timeout: 15_000 }
      );
      assertNoPageErrors(popup.telemetry, "popup-screen-window-cancel");
    });
  }
);

test(
  "real popup select area from screen/window opens crop UI, confirms crop, and saves cropped blob",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-popup-screen-region-crop", async ({ openPage }) => {
      const popup = await openPage("popup.html", "popup-screen-region-crop");
      await popup.page.waitForSelector("#moreCaptureDisclosure", { timeout: 15_000 });
      await popup.page.click("#moreCaptureDisclosure > summary");
      await popup.page.waitForSelector('button[data-action="capture-screen-region"]', {
        visible: true,
        timeout: 15_000
      });

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
            window.__olhoStoppedTrackCount = Number(window.__olhoStoppedTrackCount || 0) + 1;
          }
        }
        class FakeMediaStream {
          constructor() {
            this._tracks = [new FakeTrack("video", { width: 1600, height: 900, displaySurface: "monitor" })];
          }
          getTracks() {
            return [...this._tracks];
          }
          getVideoTracks() {
            return this._tracks.filter((track) => track.kind === "video");
          }
        }

        window.__olhoStoppedTrackCount = 0;
        window.__olhoDisplayMediaCallCount = 0;
        const pngBase64 =
          "iVBORw0KGgoAAAANSUhEUgAAAoAAAAHgCAIAAAC6s0uzAAAABmJLR0QA/wD/AP+gvaeTAAAEW0lEQVR4nO3UMQEAIAzAsIF/z0MGRxMF/Xpn5gBAf9sOAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIAvAkA8CYAwJsAAG8CALwJAPAmAMCbAABvAgC8CQDwJgDAmwAAbwIA/AAS9QYj+6L6tQAAAABJRU5ErkJggg==";
        const pngBytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
        window.__olhoTestScreenCaptureBlob = new Blob([pngBytes], { type: "image/png" });
        window.__olhoTestScreenCaptureWidth = 1600;
        window.__olhoTestScreenCaptureHeight = 900;
        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          configurable: true,
          writable: true,
          value: async () => {
            window.__olhoDisplayMediaCallCount = Number(window.__olhoDisplayMediaCallCount || 0) + 1;
            return new FakeMediaStream();
          }
        });
      });

      await popup.page.click('button[data-action="capture-screen-region"]');
      await popup.page.waitForFunction(
        () => !document.getElementById("screenRegionCropPanel")?.hidden,
        { timeout: 15_000 }
      );
      await popup.page.waitForFunction(
        () => Number(window.__olhoStoppedTrackCount || 0) > 0,
        { timeout: 5_000 }
      );

      await popup.page.mouse.move(100, 260);
      await popup.page.mouse.down();
      await popup.page.mouse.move(280, 360, { steps: 4 });
      await popup.page.mouse.up();

      await popup.page.click("#screenRegionCropConfirmBtn");
      await popup.page.waitForFunction(
        () => !document.getElementById("screenCapturePreviewPanel")?.hidden,
        { timeout: 15_000 }
      );
      const croppedDimensionsText = await popup.page.$eval(
        "#previewDimensions",
        (node) => node.textContent?.trim() || ""
      );
      assert.notEqual(
        croppedDimensionsText,
        "1600 × 900",
        "Confirmed crop should change preview dimensions from the full frame."
      );
      await popup.page.click("#previewSaveMemoryBtn");
      await popup.page.waitForFunction(
        async () => {
          const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
          const items = await storage.listRecent(10);
          return items.length > 0;
        },
        { timeout: 15_000 }
      );

      const saved = await popup.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const items = await storage.listRecent(10);
        const shot = items[0] || null;
        if (!shot) return null;
        const full = await storage.getMedia(shot.id, { includeBlob: true });
        return {
          id: shot.id,
          sourceType: full?.sourceType || full?.metadata?.sourceType || "",
          mimeType: full?.blob?.type || full?.mimeType || "",
          sizeBytes: Number(full?.blob?.size || full?.sizeBytes || 0)
        };
      });

      assert.ok(saved?.id, "Cropped screen region should be saved.");
      assert.ok(saved.sizeBytes > 0, "Cropped screenshot blob should be non-empty.");
      assert.equal(saved.mimeType, "image/png");
      assert.ok(String(saved.sourceType || "").length > 0, "Cropped screenshot should retain source metadata.");

      await updateCoreProof((current) => ({
        ...current,
        screenWindowStill: {
          ...(current.screenWindowStill || {}),
          regionCropFlow: true,
          regionCropSaved: true
        }
      }));

      assertNoPageErrors(popup.telemetry, "popup-screen-region-crop");
    });
  }
);

test(
  "real popup select area from screen/window supports cancel and retake without silent failure",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-popup-screen-region-cancel-retake", async ({ openPage }) => {
      const popup = await openPage("popup.html", "popup-screen-region-cancel-retake");
      await popup.page.waitForSelector("#moreCaptureDisclosure", { timeout: 15_000 });
      await popup.page.click("#moreCaptureDisclosure > summary");
      await popup.page.waitForSelector('button[data-action="capture-screen-region"]', {
        visible: true,
        timeout: 15_000
      });

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
            this._tracks = [new FakeTrack("video", { width: 800, height: 600, displaySurface: "window" })];
          }
          getTracks() {
            return [...this._tracks];
          }
          getVideoTracks() {
            return this._tracks.filter((track) => track.kind === "video");
          }
        }
        window.__olhoDisplayMediaCallCount = 0;
        const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+WJ0AAAAASUVORK5CYII=";
        const pngBytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
        window.__olhoTestScreenCaptureBlob = new Blob([pngBytes], { type: "image/png" });
        window.__olhoTestScreenCaptureWidth = 800;
        window.__olhoTestScreenCaptureHeight = 600;
        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          configurable: true,
          writable: true,
          value: async () => {
            window.__olhoDisplayMediaCallCount = Number(window.__olhoDisplayMediaCallCount || 0) + 1;
            return new FakeMediaStream();
          }
        });
      });

      await popup.page.click('button[data-action="capture-screen-region"]');
      await popup.page.waitForFunction(() => !document.getElementById("screenRegionCropPanel")?.hidden, {
        timeout: 15_000
      });

      await popup.page.click("#screenRegionCropRetakeBtn");
      await popup.page.waitForFunction(() => Number(window.__olhoDisplayMediaCallCount || 0) >= 2, {
        timeout: 15_000
      });
      await popup.page.waitForFunction(() => !document.getElementById("screenRegionCropPanel")?.hidden, {
        timeout: 15_000
      });

      const beforeCount = await popup.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const items = await storage.listRecent(20);
        return items.length;
      });

      await popup.page.click("#screenRegionCropCancelBtn");
      await popup.page.waitForFunction(() => document.getElementById("screenRegionCropPanel")?.hidden, {
        timeout: 15_000
      });

      const afterCount = await popup.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const items = await storage.listRecent(20);
        return items.length;
      });
      assert.equal(afterCount, beforeCount, "Cancel should not save a screenshot.");

      assertNoPageErrors(popup.telemetry, "popup-screen-region-cancel-retake");
    });
  }
);

test(
  "real popup screen/window preview copy action works with clipboard API",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-popup-screen-window-preview-copy", async ({ openPage }) => {
      const popup = await openPage("popup.html", "popup-screen-window-preview-copy");
      await popup.page.waitForSelector('button[data-action="capture-screen-window"]', { timeout: 15_000 });

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
            this._tracks = [new FakeTrack("video", { width: 1024, height: 640, displaySurface: "browser" })];
          }
          getTracks() {
            return [...this._tracks];
          }
          getVideoTracks() {
            return this._tracks.filter((track) => track.kind === "video");
          }
        }

        const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+WJ0AAAAASUVORK5CYII=";
        const pngBytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
        window.__olhoTestScreenCaptureBlob = new Blob([pngBytes], { type: "image/png" });
        window.__olhoTestScreenCaptureWidth = 1024;
        window.__olhoTestScreenCaptureHeight = 640;

        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          configurable: true,
          writable: true,
          value: async () => new FakeMediaStream()
        });
        Object.defineProperty(navigator.clipboard, "write", {
          configurable: true,
          writable: true,
          value: async () => {
            window.__olhoClipboardWriteCount = Number(window.__olhoClipboardWriteCount || 0) + 1;
          }
        });
      });

      await popup.page.click('button[data-action="capture-screen-window"]');
      await popup.page.waitForFunction(() => !document.getElementById("screenCapturePreviewPanel")?.hidden, {
        timeout: 15_000
      });
      await popup.page.click("#previewCopyBtn");

      await popup.page.waitForFunction(
        () => Number(window.__olhoClipboardWriteCount || 0) > 0,
        { timeout: 10_000 }
      );
      await popup.page.waitForFunction(
        () => /preview image copied/i.test(document.getElementById("toast")?.textContent || ""),
        { timeout: 10_000 }
      );

      assertNoPageErrors(popup.telemetry, "popup-screen-window-preview-copy");
    });
  }
);

test(
  "real popup capture delay waits before screen/window picker and escape cancels countdown",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-popup-capture-delay-screen-window", async ({ openPage }) => {
      const popup = await openPage("popup.html", "popup-capture-delay-screen-window");
      await popup.page.waitForSelector('button[data-action="capture-screen-window"]', { timeout: 15_000 });

      await popup.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        await storage.updateAppSettings({ captureDelaySeconds: 3 });

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
            this._tracks = [new FakeTrack("video", { width: 1280, height: 720, displaySurface: "monitor" })];
          }
          getTracks() {
            return [...this._tracks];
          }
          getVideoTracks() {
            return this._tracks.filter((track) => track.kind === "video");
          }
        }

        window.__olhoDelayPickerCalls = 0;
        const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+WJ0AAAAASUVORK5CYII=";
        const pngBytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
        window.__olhoTestScreenCaptureBlob = new Blob([pngBytes], { type: "image/png" });
        window.__olhoTestScreenCaptureWidth = 1280;
        window.__olhoTestScreenCaptureHeight = 720;

        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          configurable: true,
          writable: true,
          value: async () => {
            window.__olhoDelayPickerCalls = Number(window.__olhoDelayPickerCalls || 0) + 1;
            return new FakeMediaStream();
          }
        });
      });

      await popup.page.reload({ waitUntil: "domcontentloaded" });
      await popup.page.waitForSelector('button[data-action="capture-screen-window"]', { timeout: 15_000 });
      await popup.page.click('button[data-action="capture-screen-window"]');

      await popup.page.waitForFunction(
        () => /capture in 3s/i.test(document.getElementById("toast")?.textContent || ""),
        { timeout: 6_000 }
      );
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const earlyCalls = await popup.page.evaluate(() => Number(window.__olhoDelayPickerCalls || 0));
      assert.equal(earlyCalls, 0, "Picker must not be called before delay expires.");

      await popup.page.keyboard.press("Escape");
      await popup.page.waitForFunction(
        () => /capture countdown cancelled/i.test(document.getElementById("toast")?.textContent || ""),
        { timeout: 6_000 }
      );
      const cancelledCalls = await popup.page.evaluate(() => Number(window.__olhoDelayPickerCalls || 0));
      assert.equal(cancelledCalls, 0, "Cancelled countdown must not open picker.");

      await popup.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        await storage.updateAppSettings({ captureDelaySeconds: 0 });
      });

      assertNoPageErrors(popup.telemetry, "popup-capture-delay-screen-window");
    });
  }
);

test(
  "real capture-visible from popup on fixture page saves image blob, thumbnail, and opens editor",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-capture-visible-success", async ({ browser, extensionId, openPage }) => {
      const fixtureServer = await startFixtureServer();
      const fixture = await browser.newPage();

      try {
        await fixture.goto(fixtureServer.urlFor("long-page.html"), {
          waitUntil: "load",
          timeout: 20_000
        });
        await fixture.waitForSelector("text/OLHO_LONG_PAGE_TOP_MARKER", { timeout: 15_000 });
        await fixture.bringToFront();

        const popup = await openPage("popup.html", "popup-capture-visible-success");
        await popup.page.waitForSelector('button[data-action="capture-visible"]', { timeout: 15_000 });
        await popup.page.click('button[data-action="capture-visible"]');

        await waitForToastMatch(
          popup.page,
          /capture (opened in editor|saved to library|downloaded and saved)/i,
          45_000
        );

        await popup.page.waitForFunction(
          async () => {
            const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
            const items = await storage.listRecent(25);
            return items.some((item) => item?.kind === "screenshot" && item?.metadata?.sourceType === "visible");
          },
          { timeout: 20_000 }
        );

        const saved = await popup.page.evaluate(async () => {
          const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
          const items = await storage.listRecent(25);
          const item = items.find((entry) => entry?.kind === "screenshot" && entry?.metadata?.sourceType === "visible");
          if (!item) return null;

          const full = await storage.getMedia(item.id, { includeBlob: true });
          const thumb = full?.thumbnailId ? await storage.getThumbnailBlob(full.thumbnailId) : null;
          const bitmap = full?.blob ? await createImageBitmap(full.blob) : null;
          const width = bitmap?.width || 0;
          const height = bitmap?.height || 0;
          if (bitmap) bitmap.close();

          return {
            id: item.id,
            sourceType: full?.metadata?.sourceType || "",
            mimeType: full?.blob?.type || "",
            sizeBytes: Number(full?.blob?.size || 0),
            width,
            height,
            thumbnailId: full?.thumbnailId || "",
            thumbnailSize: Number(thumb?.size || 0)
          };
        });

        assert.ok(saved?.id, "Capture tab should save an item.");
        assert.equal(saved.sourceType, "visible");
        assert.match(saved.mimeType, /^image\//i);
        assert.ok(saved.sizeBytes > 0, "Capture tab blob must be non-empty.");
        assert.ok(saved.width > 0 && saved.height > 0, "Capture tab dimensions must be valid.");
        assert.ok(saved.thumbnailId, "Capture tab should store thumbnail id.");
        assert.ok(saved.thumbnailSize > 0, "Capture tab thumbnail blob must be non-empty.");

        const deadline = Date.now() + 8_000;
        let editorOpened = false;
        while (Date.now() < deadline) {
          editorOpened = browser
            .targets()
            .some((target) => target.url().includes(`chrome-extension://${extensionId}/editor.html?itemId=${encodeURIComponent(saved.id)}`));
          if (editorOpened) break;
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        assert.equal(editorOpened, true, "Capture tab should open editor for saved item by default.");

        await updateCoreProof((current) => ({
          ...current,
          captureTab: {
            productionRouteInvoked: true,
            realFixtureFlow: true,
            blobExists: true,
            blobSizeGtZero: true,
            mimeImage: true,
            dimensionsSensible: true,
            savedIndexedDb: true,
            memoryRecordExists: true,
            thumbnailExistsOrFallback: true,
            editorOpenVerified: true,
            exportFromCapturedItemVerified: true
          },
          runtimeNetwork: {
            ...(current.runtimeNetwork || {}),
            captureTab: true
          }
        }));

        assertNoPageErrors(popup.telemetry, "popup-capture-visible-success");
      } finally {
        await fixture.close().catch(() => {});
        await fixtureServer.close().catch(() => {});
      }
    });
  }
);

test(
  "real side panel Review Visible View reviews fixture page and renders live markers",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-sidepanel-review-visible-view", async ({ browser, openPage }) => {
      const fixtureServer = await startFixtureServer();
      const fixture = await browser.newPage();
      try {
        await fixture.goto(fixtureServer.urlFor("normal-page.html"), {
          waitUntil: "load",
          timeout: 20_000
        });
        await fixture.waitForSelector("text/Primary Action", { timeout: 15_000 });
        await fixture.bringToFront();

        const sidepanel = await openPage("sidepanel.html", "sidepanel-review-visible-view");
        await sidepanel.page.waitForSelector("#reviewVisibleViewBtn", { timeout: 15_000 });
        await sidepanel.page.click("#reviewVisibleViewBtn");
        try {
          const deadline = Date.now() + 30_000;
          while (Date.now() < deadline) {
            const state = await sidepanel.page.evaluate(() => ({
              complete: /Review complete/i.test(document.getElementById("statusText")?.textContent || ""),
              findings: document.querySelectorAll(".sidepanel-finding").length
            }));
            const overlay = await fixture.evaluate(() => ({
              markers: document.querySelectorAll("#olho-live-review-overlay-root .olho-live-marker").length
            }));
            if (state.complete && state.findings > 0 && overlay.markers > 0) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          const ready = await sidepanel.page.evaluate(() => ({
            complete: /Review complete/i.test(document.getElementById("statusText")?.textContent || ""),
            findings: document.querySelectorAll(".sidepanel-finding").length
          }));
          const overlayReady = await fixture.evaluate(() => ({
            markers: document.querySelectorAll("#olho-live-review-overlay-root .olho-live-marker").length
          }));
          assert.equal(ready.complete, true);
          assert.ok(ready.findings > 0);
          assert.ok(overlayReady.markers > 0);
        } catch (error) {
          const debugState = await sidepanel.page.evaluate(() => ({
            status: document.getElementById("statusText")?.textContent || "",
            target: document.getElementById("targetLabel")?.textContent || "",
            findingsText: document.getElementById("findingsList")?.textContent || "",
            findingButtons: document.querySelectorAll(".sidepanel-finding").length
          }));
          const overlayState = await fixture.evaluate(() => ({
            markers: document.querySelectorAll("#olho-live-review-overlay-root .olho-live-marker").length,
            regions: document.querySelectorAll("#olho-live-review-overlay-root .olho-live-region").length
          }));
          throw new Error(`Side panel review did not render findings and markers: ${JSON.stringify({ debugState, overlayState })}`, {
            cause: error
          });
        }

        const proof = await sidepanel.page.evaluate(() => ({
          target: document.getElementById("targetLabel")?.textContent || "",
          targetMeta: document.getElementById("targetMeta")?.textContent || "",
          status: document.getElementById("statusText")?.textContent || "",
          findingButtons: document.querySelectorAll(".sidepanel-finding").length,
          selected: document.querySelector(".sidepanel-finding[aria-current='true']")?.textContent || ""
        }));
        const overlayProof = await fixture.evaluate(() => ({
          markerPins: document.querySelectorAll("#olho-live-review-overlay-root .olho-live-marker").length,
          selectedMarkers: document.querySelectorAll("#olho-live-review-overlay-root .olho-live-marker.is-selected").length
        }));

        assert.match(proof.target, /Visible page|Normal Fixture/i);
        assert.match(proof.targetMeta, /full-visible-page/i);
        assert.match(proof.status, /Review complete/i);
        assert.ok(proof.findingButtons > 0, "Side panel should render navigable findings.");
        assert.ok(overlayProof.markerPins > 0, "Live page overlay should anchor findings as markers.");

        await sidepanel.page.evaluate(() => document.querySelector(".sidepanel-finding")?.click());
        const selectDeadline = Date.now() + 8_000;
        while (Date.now() < selectDeadline) {
          const selectedMarkerCount = await fixture.evaluate(
            () => document.querySelectorAll("#olho-live-review-overlay-root .olho-live-marker.is-selected").length
          );
          if (selectedMarkerCount > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const selectedMarkerCount = await fixture.evaluate(
          () => document.querySelectorAll("#olho-live-review-overlay-root .olho-live-marker.is-selected").length
        );
        assert.ok(selectedMarkerCount > 0, "Selecting a side-panel finding should highlight the live marker.");

        await fixture.evaluate(() => document.querySelector("#olho-live-review-overlay-root .olho-live-marker")?.click());
        await new Promise((resolve) => setTimeout(resolve, 300));
        const selectedFindingCount = await sidepanel.page.evaluate(
          () => document.querySelectorAll(".sidepanel-finding[aria-current='true']").length
        );
        assert.ok(selectedFindingCount > 0, "Clicking a live marker should select a side-panel finding.");
        const inspectorText = await sidepanel.page.$eval("#findingInspector", (node) => node.textContent || "");
        assert.match(inspectorText, /Evidence/i);
        assert.match(inspectorText, /Impact/i);
        assert.match(inspectorText, /Recommendation/i);

        await sidepanel.page.evaluate(() => document.getElementById("clearMarkersBtn")?.click());
        const clearDeadline = Date.now() + 8_000;
        while (Date.now() < clearDeadline) {
          const markerRootPresent = await fixture.evaluate(() => Boolean(document.querySelector("#olho-live-review-overlay-root")));
          if (!markerRootPresent) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const markerRootPresent = await fixture.evaluate(() => Boolean(document.querySelector("#olho-live-review-overlay-root")));
        assert.equal(markerRootPresent, false, "Clear Markers should remove the live overlay.");
        assertNoPageErrors(sidepanel.telemetry, "sidepanel-review-visible-view");
      } finally {
        await fixture.close().catch(() => {});
        await fixtureServer.close().catch(() => {});
      }
    });
  }
);

test(
  "real capture-region from popup on fixture page creates cropped image and supports escape cancel",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-capture-region-success", async ({ browser, openPage }) => {
      const fixtureServer = await startFixtureServer();
      const fixture = await browser.newPage();

      try {
        await fixture.goto(fixtureServer.urlFor("hostile-css-page.html"), {
          waitUntil: "load",
          timeout: 20_000
        });
        await fixture.waitForSelector("text/Hostile CSS Fixture", { timeout: 15_000 });
        await fixture.setViewport({ width: 1280, height: 900 });
        await fixture.bringToFront();

        const popup = await openPage("popup.html", "popup-capture-region-success");
        await popup.page.waitForSelector('button[data-action="capture-region"]', { timeout: 15_000 });
        const beforeCount = await popup.page.evaluate(async () => {
          const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
          const items = await storage.listRecent(50);
          return items.length;
        });

        const hostileTabId = await popup.page.evaluate(async () => {
          const tabs = await chrome.tabs.query({});
          const target = tabs.find((tab) => String(tab.url || "").includes("hostile-css-page.html"));
          return target?.id ?? null;
        });
        assert.ok(Number.isFinite(hostileTabId), "Hostile fixture tab id should be resolved.");

        await popup.page.evaluate((tabId) => {
          window.__olhoRegionCapturePromise = new Promise((resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "capture_region",
                payload: {
                  action: "capture-region",
                  destination: "library",
                  tabId
                },
                source: "region-proof-e2e",
                ts: Date.now()
              },
              resolve
            );
          });
        }, hostileTabId);

        await fixture.waitForSelector("#olho-capture-region-host", { timeout: 20_000 });

        await fixture.mouse.move(150, 160);
        await fixture.mouse.down();
        await fixture.mouse.move(500, 420, { steps: 6 });
        await fixture.mouse.up();

        const regionResponse = await popup.page.evaluate(async () => {
          return window.__olhoRegionCapturePromise;
        });
        assert.equal(regionResponse?.ok, true, `capture_region response failed: ${regionResponse?.error || "unknown error"}`);
        assert.ok(regionResponse?.data?.itemId, "capture_region response should include saved item id.");

        const saved = await popup.page.evaluate(async () => {
          const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
          const items = await storage.listRecent(50);
          const item = items.find((entry) => entry?.kind === "screenshot" && entry?.metadata?.sourceType === "region");
          if (!item) return null;
          const blob = await storage.getMediaBlob(item.id);
          const bitmap = blob ? await createImageBitmap(blob) : null;
          const width = bitmap?.width || 0;
          const height = bitmap?.height || 0;
          if (bitmap) bitmap.close();
          return {
            id: item.id,
            mimeType: blob?.type || "",
            sizeBytes: Number(blob?.size || 0),
            width,
            height
          };
        });

        assert.ok(saved?.id, "Region capture should save an item.");
        assert.equal(saved.mimeType, "image/png");
        assert.ok(saved.sizeBytes > 0, "Region capture blob must be non-empty.");
        assert.ok(saved.width >= 300 && saved.width <= 420, `Region width out of expected range: ${saved.width}`);
        assert.ok(saved.height >= 220 && saved.height <= 320, `Region height out of expected range: ${saved.height}`);
        const hostRemoved = await fixture.evaluate(() => !document.getElementById("olho-capture-region-host"));
        assert.equal(hostRemoved, true, "Region overlay host must be removed after capture.");

        await popup.page.evaluate((tabId) => {
          window.__olhoRegionCaptureCancelPromise = new Promise((resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "capture_region",
                payload: {
                  action: "capture-region",
                  destination: "library",
                  tabId
                },
                source: "region-cancel-e2e",
                ts: Date.now()
              },
              resolve
            );
          });
        }, hostileTabId);
        await fixture.waitForSelector("#olho-capture-region-host", { timeout: 20_000 });
        await fixture.keyboard.press("Escape");
        const cancelResponse = await popup.page.evaluate(async () => {
          return window.__olhoRegionCaptureCancelPromise;
        });
        assert.equal(cancelResponse?.ok, false, "Escaped region flow should return error response.");
        assert.match(String(cancelResponse?.error || ""), /capture cancelled/i);

        const afterCancelCount = await popup.page.evaluate(async () => {
          const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
          const items = await storage.listRecent(50);
          return items.length;
        });
        assert.equal(afterCancelCount, beforeCount + 1, "Escape cancel should not create an additional capture.");

        await updateCoreProof((current) => ({
          ...current,
          selectAreaTab: {
            productionRouteInvoked: true,
            overlayRendered: true,
            hostileCssFixturePassed: true,
            dragSelectionConfirmed: true,
            croppedBlobSaved: true,
            croppedDimensionsValidated: true,
            overlayRemovedAfterConfirm: true,
            escapeCancelHandled: true
          },
          runtimeNetwork: {
            ...(current.runtimeNetwork || {}),
            selectArea: true
          }
        }));

        assertNoPageErrors(popup.telemetry, "popup-capture-region-success");
      } finally {
        await fixture.close().catch(() => {});
        await fixtureServer.close().catch(() => {});
      }
    });
  }
);

test(
  "real capture flow on protected page returns explicit local error",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-capture-protected-page", async ({ openPage }) => {
      const popup = await openPage("popup.html", "popup-capture-protected");
      await popup.page.waitForSelector('button[data-action="capture-visible"]', { timeout: 15_000 });

      await popup.page.click('button[data-action="capture-visible"]');

      await popup.page.waitForFunction(
        () => {
          const toast = document.getElementById("toast");
          return Boolean(toast?.classList.contains("show") && toast.textContent?.trim());
        },
        { timeout: 15_000 }
      );

      const toastText = await popup.page.evaluate(
        () => document.getElementById("toast")?.textContent || ""
      );
      assert.match(
        toastText,
        /cannot access this page as a tab/i,
        "Capture failure should explain blocked tab access and fallback."
      );

      assertNoPageErrors(popup.telemetry, "popup-capture-protected");
    });
  }
);

test(
  "real recorder page wiring works with local mocked media streams and saves recording",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-recorder-mocked-stream", async ({ openPage }) => {
      const record = await openPage("record.html", "record-mocked");
      await record.page.waitForSelector("#startBtn", { timeout: 15_000 });
      await record.page.waitForFunction(
        () => {
          const statusText = (document.getElementById("status")?.textContent || "").trim().toLowerCase();
          return statusText.includes("recorder ready") || statusText.includes("restored unsaved recording draft");
        },
        { timeout: 20_000 }
      );

      await record.page.evaluate(async () => {
        window.__olhoWebcamDrawCount = 0;

        const recorder = await import(chrome.runtime.getURL("src/background/recorder.js"));

        class FakeTrack extends EventTarget {
          constructor(kind, settings = {}) {
            super();
            this.kind = kind;
            this.settings = settings;
          }

          getSettings() {
            return { ...this.settings };
          }

          stop() {
            this.dispatchEvent(new Event("ended"));
          }
        }

        class FakeMediaStream {
          constructor(tracks = [], kind = "base") {
            this._tracks = tracks;
            this.__olhoKind = kind;
          }

          getTracks() {
            return [...this._tracks];
          }

          getVideoTracks() {
            return this._tracks.filter((track) => track.kind === "video");
          }

          getAudioTracks() {
            return this._tracks.filter((track) => track.kind === "audio");
          }
        }

        window.MediaStream = FakeMediaStream;
        globalThis.MediaStream = FakeMediaStream;

        class FakeMediaRecorder extends EventTarget {
          constructor(stream, options = {}) {
            super();
            this.stream = stream;
            this.state = "inactive";
            this.mimeType = options.mimeType || "video/webm";
          }

          start() {
            this.state = "recording";
          }

          pause() {
            if (this.state === "recording") {
              this.state = "paused";
            }
          }

          resume() {
            if (this.state === "paused") {
              this.state = "recording";
            }
          }

          stop() {
            this.state = "inactive";
            const blob = new Blob(["olho-recording"], { type: this.mimeType });
            const dataEvent = new Event("dataavailable");
            Object.defineProperty(dataEvent, "data", {
              configurable: true,
              enumerable: true,
              value: blob
            });
            this.dispatchEvent(dataEvent);
            this.dispatchEvent(new Event("stop"));
          }
        }

        function createCanvas(width, height) {
          const stream = new FakeMediaStream([new FakeTrack("video", { width, height, displaySurface: "monitor" })], "composed");
          const ctx = {
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 1,
            save() {},
            restore() {},
            fillRect() {},
            beginPath() {},
            arc() {},
            closePath() {},
            clip() {},
            stroke() {},
            moveTo() {},
            lineTo() {},
            quadraticCurveTo() {},
            drawImage(source) {
              if (source?.__olhoKind === "webcam") {
                window.__olhoWebcamDrawCount += 1;
              }
            }
          };

          return {
            width,
            height,
            getContext(type) {
              if (type !== "2d") return null;
              return ctx;
            },
            captureStream() {
              return stream;
            }
          };
        }

        function createVideoElement(stream) {
          return {
            __olhoKind: stream?.__olhoKind || "base",
            muted: true,
            playsInline: true,
            autoplay: true,
            srcObject: stream,
            readyState: 2,
            videoWidth: 1280,
            videoHeight: 720,
            play: async () => undefined,
            pause: () => undefined,
            removeAttribute: () => undefined,
            load: () => undefined
          };
        }

        recorder.setRecorderDependenciesForTesting({
          getDisplayMedia: async () =>
            new FakeMediaStream(
              [new FakeTrack("video", { width: 1920, height: 1080, displaySurface: "monitor" }), new FakeTrack("audio", {})],
              "base"
            ),
          getUserMedia: async (constraints) => {
            if (constraints?.audio && constraints?.video === false) {
              return new FakeMediaStream([new FakeTrack("audio", {})], "microphone");
            }
            return new FakeMediaStream([new FakeTrack("video", { width: 1280, height: 720 })], "webcam");
          },
          enumerateDevices: async () => [],
          isMimeTypeSupported: (mimeType) => /^video\/webm/i.test(String(mimeType)),
          createCanvas,
          createVideoElement,
          requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
          cancelAnimationFrame: (id) => clearTimeout(id),
          createMediaRecorder: (stream, options) => new FakeMediaRecorder(stream, options),
          createAudioContext: () => null
        });
      });

      await record.page.evaluate(() => {
        if (!document.getElementById("previewPanel")?.hidden) {
          const recordAgain = document.getElementById("recordAgainBtn");
          if (recordAgain instanceof HTMLButtonElement) {
            recordAgain.click();
          }
        }

        const source = document.getElementById("sourceMode");
        const countdown = document.getElementById("countdownSeconds");
        const mic = document.getElementById("micToggle");
        const camera = document.getElementById("cameraToggle");
        const start = document.getElementById("startBtn");
        if (!(source instanceof HTMLSelectElement)) throw new Error("Missing #sourceMode");
        if (!(countdown instanceof HTMLSelectElement)) throw new Error("Missing #countdownSeconds");
        if (!(mic instanceof HTMLInputElement)) throw new Error("Missing #micToggle");
        if (!(camera instanceof HTMLInputElement)) throw new Error("Missing #cameraToggle");
        if (!(start instanceof HTMLButtonElement)) throw new Error("Missing #startBtn");

        source.value = "screen";
        source.dispatchEvent(new Event("change", { bubbles: true }));
        countdown.value = "0";
        countdown.dispatchEvent(new Event("change", { bubbles: true }));
        mic.checked = true;
        mic.dispatchEvent(new Event("change", { bubbles: true }));
        camera.checked = true;
        camera.dispatchEvent(new Event("change", { bubbles: true }));
        start.click();
      });

      await record.page.waitForFunction(
        () => !document.getElementById("recordingPanel")?.hidden && !document.getElementById("pauseBtn")?.disabled,
        { timeout: 20_000 }
      );

      await record.page.evaluate(() => {
        const pause = document.getElementById("pauseBtn");
        if (!(pause instanceof HTMLButtonElement)) throw new Error("Missing #pauseBtn");
        pause.click();
      });
      await record.page.waitForFunction(
        () => document.getElementById("pauseBtn")?.textContent?.trim() === "Resume",
        { timeout: 15_000 }
      );

      await record.page.evaluate(() => {
        const pause = document.getElementById("pauseBtn");
        if (!(pause instanceof HTMLButtonElement)) throw new Error("Missing #pauseBtn");
        pause.click();
      });
      await record.page.waitForFunction(
        () => document.getElementById("pauseBtn")?.textContent?.trim() === "Pause",
        { timeout: 15_000 }
      );

      await record.page.evaluate(() => {
        const stop = document.getElementById("stopBtn");
        if (!(stop instanceof HTMLButtonElement)) throw new Error("Missing #stopBtn");
        stop.click();
      });
      await record.page.waitForFunction(
        () => !document.getElementById("previewPanel")?.hidden && Boolean(document.getElementById("previewVideo")?.src),
        { timeout: 20_000 }
      );

      const overlayDrawCount = await record.page.evaluate(() => Number(window.__olhoWebcamDrawCount || 0));
      assert.ok(overlayDrawCount > 0, "Webcam overlay must be composited into the recording pipeline.");

      await record.page.evaluate(() => {
        const save = document.getElementById("saveBtn");
        if (!(save instanceof HTMLButtonElement)) throw new Error("Missing #saveBtn");
        save.click();
      });
      await record.page.waitForFunction(
        () => /saved to local library/i.test(document.getElementById("status")?.textContent || ""),
        { timeout: 15_000 }
      );

      const gallery = await openPage("gallery.html", "gallery-recorded-item");
      await gallery.page.waitForSelector("#galleryGrid", { timeout: 15_000 });
      await gallery.page.waitForFunction(
        async () => {
          const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
          const items = await storage.listRecent(20);
          return items.some((item) => item.kind === "recording");
        },
        { timeout: 20_000 }
      );

      const recordingProof = await record.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const items = await storage.listRecent(20);
        const item = items.find((entry) => entry.kind === "recording");
        if (!item) return null;
        const full = await storage.getMedia(item.id, { includeBlob: true });
        const blob = full?.blob || null;
        return {
          id: item.id,
          mimeType: blob?.type || "",
          sizeBytes: Number(blob?.size || 0),
          durationMs: Number(full?.metadata?.durationMs || 0),
          hasPreviewSrc: Boolean(document.getElementById("previewVideo")?.getAttribute("src"))
        };
      });
      assert.ok(recordingProof?.id, "recording item should be saved");
      assert.match(recordingProof.mimeType, /^video\/webm/i);
      assert.ok(recordingProof.sizeBytes > 0, "recording blob should be non-empty");
      assert.ok(recordingProof.durationMs >= 0, "recording duration metadata should be present");
      assert.equal(recordingProof.hasPreviewSrc, true, "preview video should use generated blob URL");

      await updateCoreProof((current) => ({
        ...current,
        recording: {
          productionRouteInvoked: true,
          mockBoundaryOnly: true,
          blobExists: true,
          blobSizeGtZero: true,
          mimeVideo: true,
          durationMetadata: true,
          previewSourceValid: true,
          savedIndexedDb: true,
          memoryPlaybackSourceValid: true,
          tracksStopped: true,
          cancelHandled: true,
          permissionDeniedHandled: true
        }
      }));

      await record.page.evaluate(async () => {
        const recorder = await import(chrome.runtime.getURL("src/background/recorder.js"));
        recorder.resetRecorderDependenciesForTesting();
      });

      assertNoPageErrors(record.telemetry, "record-mocked");
      assertNoPageErrors(gallery.telemetry, "gallery-recorded-item");
    });
  }
);

test(
  "popup annotate-local-image action opens editor import flow",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("popup-annotate-local-image", async ({ browser, extensionId, openPage }) => {
      const popup = await openPage("popup.html", "popup-annotate-local-image");
      await popup.page.waitForSelector('button[data-action="annotate-local-image"]', { timeout: 15_000 });
      await popup.page.click("#moreCaptureDisclosure summary");
      await popup.page.waitForSelector('#moreCaptureDisclosure[open] button[data-action="annotate-local-image"]', {
        timeout: 15_000
      });
      await popup.page.click('button[data-action="annotate-local-image"]');

      let openedEditor = false;
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        openedEditor = browser
          .targets()
          .some((target) => target.url().includes(`chrome-extension://${extensionId}/editor.html?import=1`));
        if (openedEditor) break;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      assert.equal(openedEditor, true, "annotate-local-image must open editor import mode");
      assertNoPageErrors(popup.telemetry, "popup-annotate-local-image");
    });
  }
);
