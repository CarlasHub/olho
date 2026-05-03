import test from "node:test";
import assert from "node:assert/strict";

import { assertNoPageErrors, launchExtension, openFixturePage, openPopupPage } from "./e2e-real-utils.mjs";
import { startFixtureServer } from "./fixtures/server.mjs";

async function waitForPopupToastText(page, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await page.evaluate(() => document.getElementById("toast")?.textContent || "");
    const normalized = text.toLowerCase();
    if (normalized.includes("capture opened in editor and saved to library") || normalized.includes("saved to library")) {
      return text;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for full-page success toast.");
}

test(
  "real full-page capture on long fixture saves stitched image and restores page state",
  { timeout: 180_000 },
  async () => {
    const fixtureServer = await startFixtureServer();
    const session = await launchExtension("real-full-page-capture");

    try {
      const fixture = await openFixturePage(session, fixtureServer, "long-page.html", "fixture-long-page");
      await fixture.page.waitForSelector("text/OLHO_LONG_PAGE_TOP_MARKER", { timeout: 15_000 });

      const popup = await openPopupPage(session, "popup-full-page");
      await popup.page.waitForSelector('button[data-action="capture-full"]', { timeout: 15_000 });

      await popup.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        await storage.clearAllData();
      });

      await popup.page.click('button[data-action="capture-full"]');
      await waitForPopupToastText(popup.page, 90_000);

      const saved = await popup.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const items = await storage.listRecent(20);
        const full = items.find((item) => item?.metadata?.sourceType === "fullPage");
        return full || null;
      });

      assert.ok(saved, "full-page capture must create a saved fullPage item");
      assert.equal(saved.metadata?.sourceType, "fullPage");
      assert.ok(Number(saved.metadata?.height || 0) >= 4500, "full-page height should reflect long-page content");
      assert.ok(Number(saved.metadata?.width || 0) >= 700, "full-page width should be captured");

      const overlayGone = await fixture.page.evaluate(() => !document.getElementById("__olho_capture_progress__"));
      assert.equal(overlayGone, true, "full-page progress overlay must be removed after capture");

      assertNoPageErrors(popup.telemetry, "popup-full-page");
      assertNoPageErrors(fixture.telemetry, "fixture-long-page");
    } finally {
      await session.close();
      await fixtureServer.close();
    }
  }
);
