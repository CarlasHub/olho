import test from "node:test";
import assert from "node:assert/strict";

import { assertNoPageErrors, withRealExtension } from "./e2e-real-utils.mjs";

async function pressTabs(page, count = 4) {
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press("Tab");
  }
}

test(
  "real extension accessibility smoke: keyboard focus, labels, and dialog focus return",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-extension-accessibility-smoke", async ({ openPage }) => {
      const popup = await openPage("popup.html", "popup-a11y");
      await popup.page.waitForSelector('button[data-action="capture-visible"]', { timeout: 15_000 });
      await popup.page.focus("body");
      await pressTabs(popup.page, 5);
      const popupFocus = await popup.page.evaluate(() => {
        const active = document.activeElement;
        return {
          tag: active?.tagName || "",
          id: active?.id || ""
        };
      });
      assert.notEqual(popupFocus.tag, "BODY");

      const editor = await openPage("editor.html", "editor-a11y");
      await editor.page.waitForSelector("#editorCanvas", { timeout: 15_000 });
      await editor.page.focus("body");
      await pressTabs(editor.page, 6);
      const editorFocus = await editor.page.evaluate(() => {
        const active = document.activeElement;
        return {
          tag: active?.tagName || "",
          id: active?.id || ""
        };
      });
      assert.notEqual(editorFocus.tag, "BODY");

      const gallery = await openPage("gallery.html", "gallery-a11y");
      await gallery.page.waitForSelector("#galleryGrid", { timeout: 15_000 });
      await gallery.page.focus("body");
      await pressTabs(gallery.page, 8);
      const galleryFocus = await gallery.page.evaluate(() => {
        const active = document.activeElement;
        return {
          tag: active?.tagName || "",
          id: active?.id || ""
        };
      });
      assert.notEqual(galleryFocus.tag, "BODY");

      const options = await openPage("options.html", "options-a11y");
      await options.page.waitForSelector("#deleteAllBtn", { timeout: 15_000 });
      await options.page.focus("body");
      await pressTabs(options.page, 5);
      const optionsFocus = await options.page.evaluate(() => {
        const active = document.activeElement;
        return {
          tag: active?.tagName || "",
          id: active?.id || ""
        };
      });
      assert.notEqual(optionsFocus.tag, "BODY");

      for (const current of [popup, editor, gallery, options]) {
        const missing = await current.page.evaluate(() => {
          return Array.from(document.querySelectorAll("button"))
            .filter((button) => {
              const text = (button.textContent || "").replace(/\s+/g, "").trim();
              if (text) return false;
              if (!button.querySelector("svg, img")) return false;
              const label = button.getAttribute("aria-label");
              const labelledby = button.getAttribute("aria-labelledby");
              return !label && !labelledby;
            })
            .map((button) => button.outerHTML.slice(0, 180));
        });
        assert.deepEqual(missing, [], `Icon-only buttons missing accessible names on ${current.telemetry.label}`);
      }

      await gallery.page.evaluate(() => {
        const button = document.querySelector('button.view-btn[data-view="storage"]');
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error("Storage view button not found.");
        }
        button.click();
      });
      await gallery.page.waitForSelector("#deleteAllBtn:not([disabled])", { timeout: 15_000 });
      await gallery.page.evaluate(() => {
        const button = document.getElementById("deleteAllBtn");
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error("Delete all button not found.");
        }
        button.click();
      });
      await gallery.page.waitForFunction(() => document.getElementById("inputDialog")?.open === true, {
        timeout: 15_000
      });
      await gallery.page.evaluate(() => {
        const button = document.getElementById("inputDialogCancelBtn");
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error("Dialog cancel button not found.");
        }
        button.click();
      });
      await gallery.page.waitForFunction(() => document.getElementById("inputDialog")?.open === false, {
        timeout: 15_000
      });
      const focusReturnId = await gallery.page.evaluate(() => document.activeElement?.id || "");
      assert.equal(focusReturnId, "deleteAllBtn");

      assertNoPageErrors(popup.telemetry, "popup-a11y");
      assertNoPageErrors(editor.telemetry, "editor-a11y");
      assertNoPageErrors(gallery.telemetry, "gallery-a11y");
      assertNoPageErrors(options.telemetry, "options-a11y");
    });
  }
);
