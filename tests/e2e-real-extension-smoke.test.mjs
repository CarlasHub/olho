import test from "node:test";
import assert from "node:assert/strict";

import { assertNoPageErrors, withRealExtension } from "./e2e-real-utils.mjs";

test(
  "real extension smoke: load unpacked build and open core extension pages",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-extension-smoke", async ({ extensionId, openPage }) => {
      assert.match(extensionId, /^[a-z]{32}$/);

      const popup = await openPage("popup.html", "popup");
      await popup.page.waitForSelector('button[data-action="capture-visible"]', { timeout: 15_000 });
      await popup.page.waitForSelector('button[data-action="capture-region"]', { timeout: 15_000 });
      await popup.page.waitForSelector('button[data-action="capture-full"]', { timeout: 15_000 });
      await popup.page.waitForSelector('button[data-action="capture-screen-window"]', { timeout: 15_000 });
      await popup.page.waitForSelector('button[data-action="capture-element"]', { timeout: 15_000 });
      await popup.page.waitForSelector('button[data-action="capture-screen-region"]', { timeout: 15_000 });
      await popup.page.waitForSelector('button[data-action="annotate-local-image"]', { timeout: 15_000 });
      assertNoPageErrors(popup.telemetry, "popup");

      const editor = await openPage("editor.html", "editor");
      await editor.page.waitForSelector("#editorCanvas", { timeout: 15_000 });
      await editor.page.waitForSelector('[data-tool="rect"]', { timeout: 15_000 });
      await editor.page.waitForSelector("#openLocalImageBtn", { timeout: 15_000 });
      await editor.page.waitForSelector("#pasteImageBtn", { timeout: 15_000 });
      await editor.page.waitForSelector("#localImageInput", { timeout: 15_000 });
      assertNoPageErrors(editor.telemetry, "editor");

      const gallery = await openPage("gallery.html", "gallery");
      await gallery.page.waitForSelector("#galleryGrid", { timeout: 15_000 });
      await gallery.page.waitForSelector("#searchInput", { timeout: 15_000 });
      assertNoPageErrors(gallery.telemetry, "gallery");

      const recorder = await openPage("record.html", "record");
      await recorder.page.waitForSelector("#startBtn", { timeout: 15_000 });
      await recorder.page.waitForSelector("#sourceMode", { timeout: 15_000 });
      await recorder.page.waitForSelector("#micToggle", { timeout: 15_000 });
      assertNoPageErrors(recorder.telemetry, "record");

      const sendView = await openPage("export-report.html", "export-report-smoke");
      await sendView.page.waitForSelector("#downloadPdfBtn", { timeout: 15_000 });
      await sendView.page.waitForSelector("#downloadZipBtn", { timeout: 15_000 });
      assertNoPageErrors(sendView.telemetry, "export-report-smoke");

      const settings = await openPage("options.html", "options");
      await settings.page.waitForSelector('.settings-nav-btn[data-settings-target="privacySettings"]', { timeout: 15_000 });
      await settings.page.click('.settings-nav-btn[data-settings-target="privacySettings"]');
      await settings.page.waitForSelector("#storeSourceUrl", { timeout: 15_000 });
      await settings.page.click('.settings-nav-btn[data-settings-target="storageSettings"]');
      await settings.page.waitForSelector("#deleteAllBtn", { timeout: 15_000 });
      assertNoPageErrors(settings.telemetry, "options");

      const privacy = await openPage("privacy.html", "privacy");
      await privacy.page.waitForSelector("#permissionsTitle", { timeout: 15_000 });
      assertNoPageErrors(privacy.telemetry, "privacy");
    });
  }
);
