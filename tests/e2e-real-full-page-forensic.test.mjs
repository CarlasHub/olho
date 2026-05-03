import test from "node:test";
import assert from "node:assert/strict";

import {
  assertNoPageErrors,
  launchExtension,
  openFixturePage,
  openPopupPage
} from "./e2e-real-utils.mjs";
import { startFixtureServer } from "./fixtures/server.mjs";
import { updateCoreProof } from "./proof-artifacts.mjs";

async function waitForFixtureMarker(page, marker) {
  if (marker.includes("(")) {
    await page.waitForFunction(
      (pattern) => {
        const regex = new RegExp(pattern);
        return regex.test(document.body?.innerText || "");
      },
      { timeout: 20_000 },
      marker
    );
    return;
  }
  await page.waitForSelector(`text/${marker}`, { timeout: 20_000 });
}

async function runFullPageCaptureFromPopup(popupPage, fixtureFileName) {
  const response = await popupPage.evaluate(async (fixtureName) => {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find((tab) => String(tab.url || "").includes(fixtureName));
    if (!target?.id) {
      return { ok: false, error: `Fixture tab not found for ${fixtureName}` };
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
          source: "forensic-audit",
          ts: Date.now()
        },
        resolve
      );
    });
  }, fixtureFileName);
  return response;
}

async function clearLocalData(page) {
  await page.evaluate(async () => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    await storage.clearAllData();
  });
}

async function listFullPageItems(page) {
  return page.evaluate(async () => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    const items = await storage.listRecent(200);
    return items
      .filter((item) => item?.metadata?.sourceType === "fullPage")
      .map((item) => ({
        id: item.id,
        width: Number(item.metadata?.width || 0),
        height: Number(item.metadata?.height || 0)
      }));
  });
}

async function getSavedFullPageBlobMeta(page, id) {
  return page.evaluate(async (itemId) => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    const blob = await storage.getMediaBlob(itemId);
    return {
      mimeType: blob?.type || "",
      sizeBytes: Number(blob?.size || 0)
    };
  }, id);
}

test(
  "full-page forensic audit: real capture behavior across long/sticky/lazy/hostile fixtures and canvas-limit failure path",
  { timeout: 240_000 },
  async () => {
    const fixtureServer = await startFixtureServer();
    const session = await launchExtension("real-full-page-forensic-audit");

    try {
      const popup = await openPopupPage(session, "popup-full-page-forensic-bootstrap");
      await popup.page.waitForSelector('button[data-action="capture-full"]', { timeout: 15_000 });
      await clearLocalData(popup.page);
      await popup.page.close();

      const fixtures = [
        { file: "long-page.html", marker: "OLHO_LONG_PAGE_TOP_MARKER", minHeight: 4500 },
        { file: "sticky-header-page.html", marker: "Sticky Header Marker", minHeight: 2800 },
        { file: "lazy-content-page.html", marker: "LAZY_CONTENT_(PENDING|LOADED)_MARKER", minHeight: 2500 },
        { file: "hostile-css-page.html", marker: "HOSTILE_CSS_MARKER", minHeight: 2200 }
      ];

      let seenIds = new Set();
      for (const spec of fixtures) {
        const fixture = await openFixturePage(session, fixtureServer, spec.file, `forensic-${spec.file}`);
        await waitForFixtureMarker(fixture.page, spec.marker);
        const expectedScroll = await fixture.page.evaluate(() => {
          window.scrollTo(0, 720);
          return window.scrollY;
        });

        const casePopup = await openPopupPage(session, `popup-forensic-${spec.file}`);
        await casePopup.page.waitForSelector('button[data-action="capture-full"]', { timeout: 15_000 });
        const successResponse = await runFullPageCaptureFromPopup(casePopup.page, spec.file);
        assert.equal(successResponse?.ok, true, `${spec.file}: capture_full_page should succeed`);

        const fullItems = await listFullPageItems(casePopup.page);
        const latest = fullItems.find((item) => !seenIds.has(item.id));
        assert.ok(latest?.id, `Expected a new full-page item for ${spec.file}`);
        seenIds.add(latest.id);
        assert.ok(latest.height >= spec.minHeight, `${spec.file}: full-page height too small`);
        assert.ok(latest.width >= 600, `${spec.file}: full-page width too small`);

        const blobMeta = await getSavedFullPageBlobMeta(casePopup.page, latest.id);
        assert.equal(blobMeta.mimeType, "image/png", `${spec.file}: full-page blob must be PNG`);
        assert.ok(blobMeta.sizeBytes > 0, `${spec.file}: full-page blob must be non-empty`);

        const [overlayMissing, restoredScroll] = await fixture.page.evaluate(() => [
          !document.getElementById("__olho_capture_progress__"),
          window.scrollY
        ]);
        assert.equal(overlayMissing, true, `${spec.file}: full-page progress overlay should be removed`);
        assert.ok(
          Math.abs(Number(restoredScroll || 0) - Number(expectedScroll || 0)) <= 8,
          `${spec.file}: full-page should restore prior scroll position`
        );

        assertNoPageErrors(casePopup.telemetry, `popup-forensic-${spec.file}`);
        assertNoPageErrors(fixture.telemetry, `forensic-${spec.file}`);
        await casePopup.page.close();
        await fixture.page.close();
      }

      const tallFixture = await openFixturePage(session, fixtureServer, "long-page.html", "forensic-canvas-limit");
      await tallFixture.page.waitForSelector("text/OLHO_LONG_PAGE_TOP_MARKER", { timeout: 20_000 });
      await tallFixture.page.evaluate(() => {
        const marker = document.createElement("div");
        marker.id = "olho-forensic-canvas-limit";
        marker.style.height = "24000px";
        marker.textContent = "OLHO_CANVAS_LIMIT_MARKER";
        document.body.appendChild(marker);
      });

      const beforeLimitPopup = await openPopupPage(session, "popup-forensic-before-limit");
      const beforeIds = new Set((await listFullPageItems(beforeLimitPopup.page)).map((item) => item.id));
      await beforeLimitPopup.page.close();
      const limitPopup = await openPopupPage(session, "popup-forensic-canvas-limit");
      await limitPopup.page.waitForSelector('button[data-action="capture-full"]', { timeout: 15_000 });
      const limitResponse = await runFullPageCaptureFromPopup(limitPopup.page, "long-page.html");
      assert.equal(limitResponse?.ok, false, "Canvas-limit case should fail with explicit error response.");
      assert.match(String(limitResponse?.error || ""), /larger than browser canvas limits|too long or complex/i);
      const afterItems = await listFullPageItems(limitPopup.page);
      const newIds = afterItems.filter((item) => !beforeIds.has(item.id));
      assert.deepEqual(newIds, [], "Canvas-limit failure must not save a partial full-page item");
      assertNoPageErrors(limitPopup.telemetry, "popup-forensic-canvas-limit");
      assertNoPageErrors(tallFixture.telemetry, "forensic-canvas-limit");

      await limitPopup.page.close();
      await tallFixture.page.close();

      await updateCoreProof((current) => ({
        ...current,
        fullPage: {
          provenCommonFixtures: true,
          longFixture: true,
          stickyFixture: true,
          lazyFixture: true,
          hostileFixture: true,
          canvasLimitGuard: true
        },
        runtimeNetwork: {
          ...(current.runtimeNetwork || {}),
          fullPage: true
        }
      }));
    } finally {
      await session.close();
      await fixtureServer.close();
    }
  }
);
