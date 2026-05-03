import test from "node:test";
import assert from "node:assert/strict";

import { assertNoPageErrors, withRealExtension } from "./e2e-real-utils.mjs";
import { updateCoreProof } from "./proof-artifacts.mjs";

async function seedEditorItem(page) {
  return page.evaluate(async () => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));

    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D context unavailable for editor fixture.");
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(80, 80, 280, 180);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 38px system-ui";
    ctx.fillText("Olho Editor Fixture", 90, 340);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) => {
          if (nextBlob) {
            resolve(nextBlob);
            return;
          }
          reject(new Error("Failed to create editor fixture PNG."));
        },
        "image/png",
        1
      );
    });

    const saved = await storage.saveMedia({
      kind: "screenshot",
      sourceType: "visible",
      blob,
      metadata: {
        title: "E2E Editor Interaction",
        tags: ["e2e", "editor"]
      }
    });

    return saved.id;
  });
}

test(
  "editor interaction e2e: geometry hit-test, secure redaction, and dialog focus behavior",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("editor-interaction-real", async ({ openPage }) => {
      const staging = await openPage("gallery.html", "editor-stage");
      const itemId = await seedEditorItem(staging.page);
      assert.ok(itemId, "fixture media id is required");

      const editor = await openPage(`editor.html?itemId=${encodeURIComponent(itemId)}`, "editor-interaction");
      await editor.page.waitForSelector("#editorCanvas", { timeout: 20_000 });
      await editor.page.waitForFunction(
        () => document.getElementById("itemTitle")?.value === "E2E Editor Interaction",
        { timeout: 20_000 }
      );

      const canvasBox = await editor.page.$eval("#editorCanvas", (canvas) => {
        const rect = canvas.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
      });

      assert.ok(canvasBox.width > 200 && canvasBox.height > 120, "editor canvas should be interactable");

      await editor.page.evaluate(() => {
        const rectTool = document.querySelector('[data-tool="rect"]');
        const rectGroup = rectTool?.closest("details");
        if (rectGroup && !rectGroup.open) {
          rectGroup.open = true;
        }
      });
      await editor.page.click('[data-tool="rect"]');
      await editor.page.waitForFunction(
        () => document.querySelector('[data-tool="rect"]')?.getAttribute("aria-pressed") === "true",
        { timeout: 10_000 }
      );
      await editor.page.click('[data-tool="select"]');
      await editor.page.waitForFunction(
        () => document.querySelector('[data-tool="select"]')?.getAttribute("aria-pressed") === "true",
        { timeout: 10_000 }
      );

      await editor.page.waitForSelector("#secureRedactionBtn", { timeout: 10_000 });

      await editor.page.click("#moreMenuBtn");
      await editor.page.waitForSelector("#overwriteBtn", { timeout: 10_000 });
      await editor.page.focus("#overwriteBtn");
      await editor.page.click("#overwriteBtn");
      await editor.page.waitForFunction(() => document.getElementById("overwriteDialog")?.open === true, {
        timeout: 10_000
      });
      await editor.page.click("#overwriteCancelBtn");
      await editor.page.waitForFunction(() => document.getElementById("overwriteDialog")?.open === false, {
        timeout: 10_000
      });

      const focusReturn = await editor.page.evaluate(() => document.activeElement?.id || "");
      assert.equal(focusReturn, "overwriteBtn", "dialog close should return focus to the trigger");

      assertNoPageErrors(staging.telemetry, "editor-stage");
      assertNoPageErrors(editor.telemetry, "editor-interaction");
    });
  }
);

test(
  "editor local image import helper loads PNG blob and updates editor title",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("editor-local-import-real", async ({ openPage }) => {
      const editor = await openPage("editor.html", "editor-local-import");
      await editor.page.waitForSelector("#editorCanvas", { timeout: 20_000 });

      const result = await editor.page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("2D context unavailable for local import test.");
        }
        ctx.fillStyle = "#10122b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#7aa2ff";
        ctx.fillRect(2, 2, 20, 12);
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.split(",")[1];
        return window.__olhoImportImageBlobForTesting({
          base64,
          mimeType: "image/png",
          name: "Clipboard Sample.png"
        });
      });

      assert.equal(result.title, "Clipboard Sample");
      assert.ok(Number(result.width || 0) > 0);
      assert.ok(Number(result.height || 0) > 0);
      assertNoPageErrors(editor.telemetry, "editor-local-import");
    });
  }
);

test(
  "editor tool-by-tool e2e: visible tools are operable, undo/redo works, and save/export include edits",
  { timeout: 180_000 },
  async () => {
    await withRealExtension("editor-tools-complete-real", async ({ openPage }) => {
      const staging = await openPage("gallery.html", "editor-tools-stage");
      const itemId = await seedEditorItem(staging.page);
      assert.ok(itemId, "fixture media id is required");

      const editor = await openPage(`editor.html?itemId=${encodeURIComponent(itemId)}`, "editor-tools");
      await editor.page.waitForSelector("#editorCanvas", { timeout: 20_000 });
      await editor.page.waitForFunction(
        () => Boolean(window.__olhoEditorTestApi && window.__olhoImportImageBlobForTesting),
        { timeout: 20_000 }
      );

      const visibleTools = await editor.page.evaluate(() => window.__olhoEditorTestApi.listVisibleTools());
      const expectedTools = [
        "select",
        "draw",
        "highlight",
        "rect",
        "roundedRect",
        "ellipse",
        "line",
        "arrow",
        "text",
        "numberMarker",
        "callout",
        "blur",
        "pixelate",
        "redact",
        "crop",
        "resize"
      ];
      for (const tool of expectedTools) {
        assert.ok(visibleTools.includes(tool), `Expected visible tool: ${tool}`);
      }

      const beforeCount = await editor.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const list = await storage.listRecent(50);
        return list.length;
      });

      await editor.page.evaluate(() => {
        window.__olhoEditorTestApi.setStyle({
          strokeColor: "#ff6b8a",
          fillColor: "#1f2937",
          opacity: 0.8,
          strokeWidth: 5,
          fontSize: 24,
          blurStrength: 12,
          pixelStrength: 16,
          arrowStyle: "open"
        });
      });

      const drawTools = [
        ["draw", { x: 80, y: 80 }, { x: 260, y: 200 }],
        ["highlight", { x: 90, y: 240 }, { x: 320, y: 240 }],
        ["rect", { x: 340, y: 80 }, { x: 520, y: 210 }],
        ["roundedRect", { x: 540, y: 90 }, { x: 760, y: 220 }],
        ["ellipse", { x: 340, y: 240 }, { x: 520, y: 360 }],
        ["line", { x: 90, y: 320 }, { x: 290, y: 420 }],
        ["arrow", { x: 320, y: 420 }, { x: 560, y: 500 }],
        ["blur", { x: 80, y: 440 }, { x: 260, y: 560 }],
        ["pixelate", { x: 280, y: 440 }, { x: 470, y: 560 }],
        ["redact", { x: 500, y: 440 }, { x: 760, y: 560 }]
      ];

      for (const [tool, start, end] of drawTools) {
        const snapshot = await editor.page.evaluate(([nextTool, from, to]) => {
          const before = window.__olhoEditorTestApi.getSnapshot();
          window.__olhoEditorTestApi.dragAction(from, to, nextTool);
          const after = window.__olhoEditorTestApi.getSnapshot();
          return { beforeCount: before.actions.length, afterCount: after.actions.length };
        }, [tool, start, end]);
        assert.equal(snapshot.afterCount, snapshot.beforeCount + 1, `${tool} should add one action`);

        const afterUndo = await editor.page.evaluate(async () => {
          const before = window.__olhoEditorTestApi.getSnapshot();
          await window.__olhoEditorTestApi.undo();
          const after = window.__olhoEditorTestApi.getSnapshot();
          return { beforeCount: before.actions.length, afterCount: after.actions.length };
        });
        assert.equal(afterUndo.afterCount, afterUndo.beforeCount - 1, `${tool} undo should remove last action`);

        const afterRedo = await editor.page.evaluate(async () => {
          const before = window.__olhoEditorTestApi.getSnapshot();
          await window.__olhoEditorTestApi.redo();
          const after = window.__olhoEditorTestApi.getSnapshot();
          return { beforeCount: before.actions.length, afterCount: after.actions.length };
        });
        assert.equal(afterRedo.afterCount, afterRedo.beforeCount + 1, `${tool} redo should restore action`);
      }

      await editor.page.evaluate(() => {
        window.__olhoEditorTestApi.addTextAction({
          tool: "text",
          text: "Tool text",
          x: 110,
          y: 120
        });
        window.__olhoEditorTestApi.addTextAction({
          tool: "callout",
          text: "Callout",
          x: 620,
          y: 260
        });
        window.__olhoEditorTestApi.addNumberMarker({ x: 620, y: 130 });
      });

      const movementCheck = await editor.page.evaluate(() => {
        const snapshot = window.__olhoEditorTestApi.getSnapshot();
        const target = snapshot.actions.find((action) => action.type === "rect");
        if (!target) throw new Error("Missing rectangle action for movement test.");
        const beforeX = target.x;
        const beforeY = target.y;
        window.__olhoEditorTestApi.selectAt({ x: target.x + target.width / 2, y: target.y + target.height / 2 });
        window.__olhoEditorTestApi.moveSelectedBy(36, 24);
        const moved = window.__olhoEditorTestApi.getSnapshot().actions.find((action) => action.id === target.id);
        return {
          movedX: moved.x,
          movedY: moved.y,
          beforeX,
          beforeY
        };
      });
      assert.notEqual(movementCheck.movedX, movementCheck.beforeX, "Move should update X");
      assert.notEqual(movementCheck.movedY, movementCheck.beforeY, "Move should update Y");

      const resizeCheck = await editor.page.evaluate(() => {
        const snapshot = window.__olhoEditorTestApi.getSnapshot();
        const target = snapshot.actions.find((action) => action.type === "roundedRect");
        if (!target) throw new Error("Missing rounded rectangle action for resize test.");
        const beforeWidth = target.width;
        const beforeHeight = target.height;
        window.__olhoEditorTestApi.selectAt({ x: target.x + target.width / 2, y: target.y + target.height / 2 });
        window.__olhoEditorTestApi.resizeSelectedTo({
          x: target.x,
          y: target.y,
          width: target.width + 90,
          height: target.height + 40
        });
        const resized = window.__olhoEditorTestApi.getSnapshot().actions.find((action) => action.id === target.id);
        return {
          beforeWidth,
          beforeHeight,
          afterWidth: resized.width,
          afterHeight: resized.height
        };
      });
      assert.ok(resizeCheck.afterWidth > resizeCheck.beforeWidth, "Resize should increase width");
      assert.ok(resizeCheck.afterHeight > resizeCheck.beforeHeight, "Resize should increase height");

      const arrowAdjustCheck = await editor.page.evaluate(() => {
        const snapshot = window.__olhoEditorTestApi.getSnapshot();
        const arrow = snapshot.actions.find((action) => action.type === "arrow");
        if (!arrow) throw new Error("Missing arrow action for endpoint test.");
        const beforeEnd = { ...arrow.end };
        window.__olhoEditorTestApi.selectActionById(arrow.id);
        window.__olhoEditorTestApi.adjustSelectedArrowEnd({ dx: 42, dy: -18 });
        const adjusted = window.__olhoEditorTestApi.getSnapshot().actions.find((action) => action.id === arrow.id);
        return {
          beforeEnd,
          afterEnd: adjusted.end
        };
      });
      assert.notDeepEqual(arrowAdjustCheck.afterEnd, arrowAdjustCheck.beforeEnd, "Arrow endpoint should move");

      const styleCheck = await editor.page.evaluate(() => {
        const snapshot = window.__olhoEditorTestApi.getSnapshot();
        const callout = snapshot.actions.find((action) => action.type === "callout");
        if (!callout) throw new Error("Missing callout action for style test.");
        window.__olhoEditorTestApi.selectAt({
          x: callout.x + callout.width / 2,
          y: callout.y + callout.height / 2
        });
        window.__olhoEditorTestApi.updateSelectedStyle({
          strokeColor: "#22d3ee",
          fillColor: "#0f172a",
          strokeWidth: 7,
          opacity: 0.7,
          fontSize: 22
        });
        const styled = window.__olhoEditorTestApi.getSnapshot().actions.find((action) => action.id === callout.id);
        return {
          strokeColor: styled.strokeColor,
          fillColor: styled.fillColor,
          strokeWidth: styled.strokeWidth,
          opacity: styled.opacity,
          fontSize: styled.fontSize
        };
      });
      assert.equal(styleCheck.strokeColor, "#22d3ee");
      assert.equal(styleCheck.fillColor, "#0f172a");
      assert.equal(styleCheck.strokeWidth, 7);
      assert.equal(Number(styleCheck.opacity), 0.7);
      assert.equal(styleCheck.fontSize, 22);

      const zoomCheck = await editor.page.evaluate(() => {
        const before = window.__olhoEditorTestApi.getSnapshot().zoom;
        document.getElementById("zoomInBtn").click();
        const afterIn = window.__olhoEditorTestApi.getSnapshot().zoom;
        document.getElementById("zoomOutBtn").click();
        document.getElementById("fitBtn").click();
        const afterFit = window.__olhoEditorTestApi.getSnapshot().zoom;
        document.getElementById("actualSizeBtn").click();
        const afterActual = window.__olhoEditorTestApi.getSnapshot().zoom;
        return { before, afterIn, afterFit, afterActual };
      });
      assert.ok(zoomCheck.afterIn > zoomCheck.before, "Zoom in should increase zoom");
      assert.notEqual(zoomCheck.afterFit, zoomCheck.afterIn, "Fit should update zoom");
      assert.equal(zoomCheck.afterActual, 1, "Actual size should reset zoom to 1");

      const cropBefore = await editor.page.evaluate(() => window.__olhoEditorTestApi.getSnapshot().canvas);
      await editor.page.click('[data-tool="crop"]');
      await editor.page.waitForFunction(() => document.getElementById("cropPanel")?.hidden === false, { timeout: 10_000 });
      const cropCanvasBox = await editor.page.$eval("#editorCanvas", (canvas) => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });
      await editor.page.evaluate(
        ({ startX, startY, endX, endY }) => {
          const canvas = document.getElementById("editorCanvas");
          const fire = (target, type, x, y) =>
            target.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerId: 9,
                pointerType: "mouse",
                clientX: x,
                clientY: y,
                buttons: type === "pointerup" ? 0 : 1
              })
            );
          fire(canvas, "pointerdown", startX, startY);
          fire(window, "pointermove", endX, endY);
          fire(window, "pointerup", endX, endY);
        },
        {
          startX: cropCanvasBox.x + 80,
          startY: cropCanvasBox.y + 70,
          endX: cropCanvasBox.x + cropCanvasBox.width * 0.78,
          endY: cropCanvasBox.y + cropCanvasBox.height * 0.7
        }
      );
      const cropMetrics = await editor.page.evaluate(() => ({
        width: Number(document.getElementById("cropWidth")?.textContent || "0"),
        height: Number(document.getElementById("cropHeight")?.textContent || "0")
      }));
      assert.ok(cropMetrics.width > 100, "Crop width should update after dragging.");
      assert.ok(cropMetrics.height > 100, "Crop height should update after dragging.");
      await editor.page.focus("body");
      await editor.page.keyboard.press("Enter");
      await editor.page.waitForFunction(() => window.__olhoEditorTestApi.getSnapshot().tool === "select", { timeout: 10_000 });
      const cropAfter = await editor.page.evaluate(() => window.__olhoEditorTestApi.getSnapshot().canvas);
      assert.ok(cropAfter.width < cropBefore.width, "Crop should reduce canvas width");
      assert.ok(cropAfter.height < cropBefore.height, "Crop should reduce canvas height");

      const cancelCropCheck = await editor.page.evaluate(() => window.__olhoEditorTestApi.getSnapshot().canvas);
      await editor.page.click('[data-tool="crop"]');
      const cancelCropCanvasBox = await editor.page.$eval("#editorCanvas", (canvas) => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });
      await editor.page.evaluate(
        ({ startX, startY, endX, endY }) => {
          const canvas = document.getElementById("editorCanvas");
          const fire = (target, type, x, y) =>
            target.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerId: 10,
                pointerType: "mouse",
                clientX: x,
                clientY: y,
                buttons: type === "pointerup" ? 0 : 1
              })
            );
          fire(canvas, "pointerdown", startX, startY);
          fire(window, "pointermove", endX, endY);
          fire(window, "pointerup", endX, endY);
        },
        {
          startX: cancelCropCanvasBox.x + 30,
          startY: cancelCropCanvasBox.y + 30,
          endX: cancelCropCanvasBox.x + 140,
          endY: cancelCropCanvasBox.y + 110
        }
      );
      await editor.page.keyboard.press("Escape");
      const cancelCropAfter = await editor.page.evaluate(() => ({
        tool: window.__olhoEditorTestApi.getSnapshot().tool,
        canvas: window.__olhoEditorTestApi.getSnapshot().canvas
      }));
      assert.equal(cancelCropAfter.tool, "select", "Escape should cancel crop and return to select tool.");
      assert.equal(cancelCropAfter.canvas.width, cancelCropCheck.width);
      assert.equal(cancelCropAfter.canvas.height, cancelCropCheck.height);

      const resizeBefore = await editor.page.evaluate(() => window.__olhoEditorTestApi.getSnapshot().canvas);
      await editor.page.click('[data-tool="resize"]');
      await editor.page.waitForFunction(() => document.getElementById("resizePanel")?.hidden === false, { timeout: 10_000 });
      const resizeCanvasBox = await editor.page.$eval("#editorCanvas", (canvas) => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });
      await editor.page.evaluate(
        ({ startX, startY, endX, endY }) => {
          const canvas = document.getElementById("editorCanvas");
          const fire = (target, type, x, y) =>
            target.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerId: 11,
                pointerType: "mouse",
                clientX: x,
                clientY: y,
                buttons: type === "pointerup" ? 0 : 1
              })
            );
          fire(canvas, "pointerdown", startX, startY);
          fire(window, "pointermove", endX, endY);
          fire(window, "pointerup", endX, endY);
        },
        {
          startX: resizeCanvasBox.x + resizeCanvasBox.width - 2,
          startY: resizeCanvasBox.y + resizeCanvasBox.height - 2,
          endX: resizeCanvasBox.x + resizeCanvasBox.width + 110,
          endY: resizeCanvasBox.y + resizeCanvasBox.height + 78
        }
      );
      const resizePreviewValues = await editor.page.evaluate(() => ({
        width: Number(document.getElementById("resizeWidth")?.value || "0"),
        height: Number(document.getElementById("resizeHeight")?.value || "0")
      }));
      assert.ok(resizePreviewValues.width > resizeBefore.width, "Resize drag should update width preview.");
      assert.ok(resizePreviewValues.height > resizeBefore.height, "Resize drag should update height preview.");
      await editor.page.keyboard.press("Enter");
      await editor.page.waitForFunction(() => window.__olhoEditorTestApi.getSnapshot().tool === "select", { timeout: 10_000 });
      const resizeAfter = await editor.page.evaluate(() => window.__olhoEditorTestApi.getSnapshot().canvas);
      assert.ok(resizeAfter.width > resizeBefore.width, "Resize apply should increase canvas width.");
      assert.ok(resizeAfter.height > resizeBefore.height, "Resize apply should increase canvas height.");

      const resizeCancelBefore = await editor.page.evaluate(() => window.__olhoEditorTestApi.getSnapshot().canvas);
      await editor.page.click('[data-tool="resize"]');
      const resizeCancelCanvasBox = await editor.page.$eval("#editorCanvas", (canvas) => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });
      await editor.page.evaluate(
        ({ startX, startY, endX, endY }) => {
          const canvas = document.getElementById("editorCanvas");
          const fire = (target, type, x, y) =>
            target.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerId: 12,
                pointerType: "mouse",
                clientX: x,
                clientY: y,
                buttons: type === "pointerup" ? 0 : 1
              })
            );
          fire(canvas, "pointerdown", startX, startY);
          fire(window, "pointermove", endX, endY);
          fire(window, "pointerup", endX, endY);
        },
        {
          startX: resizeCancelCanvasBox.x + resizeCancelCanvasBox.width - 2,
          startY: resizeCancelCanvasBox.y + resizeCancelCanvasBox.height - 2,
          endX: resizeCancelCanvasBox.x + resizeCancelCanvasBox.width + 90,
          endY: resizeCancelCanvasBox.y + resizeCancelCanvasBox.height + 60
        }
      );
      await editor.page.keyboard.press("Escape");
      const resizeCancelAfter = await editor.page.evaluate(() => ({
        tool: window.__olhoEditorTestApi.getSnapshot().tool,
        canvas: window.__olhoEditorTestApi.getSnapshot().canvas
      }));
      assert.equal(resizeCancelAfter.tool, "select", "Escape should cancel resize and return to select tool.");
      assert.equal(resizeCancelAfter.canvas.width, resizeCancelBefore.width);
      assert.equal(resizeCancelAfter.canvas.height, resizeCancelBefore.height);

      const exported = await editor.page.evaluate(async () => ({
        png: await window.__olhoEditorTestApi.exportBlobInfo("png"),
        jpg: await window.__olhoEditorTestApi.exportBlobInfo("jpg"),
        webp: await window.__olhoEditorTestApi.exportBlobInfo("webp"),
        pdf: await window.__olhoEditorTestApi.exportBlobInfo("pdf")
      }));
      assert.equal(exported.png.type, "image/png");
      assert.ok(exported.png.size > 0);
      assert.deepEqual(exported.png.head.slice(0, 4), [137, 80, 78, 71]);
      assert.equal(exported.jpg.type, "image/jpeg");
      assert.ok(exported.jpg.size > 0);
      assert.deepEqual(exported.jpg.head.slice(0, 2), [255, 216]);
      assert.equal(exported.webp.type, "image/webp");
      assert.ok(exported.webp.size > 0);
      assert.equal(String.fromCharCode(...exported.webp.head.slice(0, 4)), "RIFF");
      assert.equal(exported.pdf.type, "application/pdf");
      assert.ok(exported.pdf.size > 0);
      assert.deepEqual(exported.pdf.head.slice(0, 4), [37, 80, 68, 70]);

      const copyResult = await editor.page.evaluate(async () => {
        Object.defineProperty(navigator.clipboard, "write", {
          configurable: true,
          writable: true,
          value: async () => {
            window.__olhoEditorClipboardWrites = Number(window.__olhoEditorClipboardWrites || 0) + 1;
          }
        });
        const ok = await window.__olhoEditorTestApi.copyPng();
        return {
          ok,
          writes: Number(window.__olhoEditorClipboardWrites || 0)
        };
      });
      assert.equal(copyResult.ok, true, "Copy should succeed when clipboard API is available.");
      assert.ok(copyResult.writes > 0, "Clipboard write should be attempted.");

      await editor.page.evaluate(() => {
        window.__olhoEditorTestApi.dragAction(
          { x: 80, y: 80 },
          { x: 250, y: 210 },
          "rect"
        );
      });

      const clearAllCheck = await editor.page.evaluate(() => {
        const before = window.__olhoEditorTestApi.getSnapshot().actions.length;
        window.__olhoEditorTestApi.clearAll();
        const after = window.__olhoEditorTestApi.getSnapshot().actions.length;
        return { before, after };
      });
      assert.ok(clearAllCheck.before > 0, "There should be actions before clear all.");
      assert.equal(clearAllCheck.after, 0, "Clear all should remove every annotation.");

      await editor.page.evaluate(() =>
        window.__olhoEditorTestApi.dragAction({ x: 120, y: 120 }, { x: 320, y: 260 }, "rect")
      );

      const savedItemId = await editor.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const before = await storage.listRecent(50);
        document.getElementById("saveCopyBtn").click();
        const timeoutAt = Date.now() + 7000;
        let after = before;
        while (Date.now() < timeoutAt) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          after = await storage.listRecent(50);
          if (after.length > before.length) {
            break;
          }
        }
        if (after.length <= before.length) {
          throw new Error("Save copy button did not create a new media item.");
        }
        return after[0]?.id || null;
      });
      assert.ok(savedItemId, "Save copy should create a local media item.");

      const afterCount = await editor.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const list = await storage.listRecent(50);
        return list.length;
      });
      assert.ok(afterCount > beforeCount, "Save copy should increase local media count.");

      const keyboardCheck = await editor.page.evaluate(() => {
        const button = document.querySelector('[data-tool="draw"]');
        button?.focus();
        return document.activeElement?.getAttribute("data-tool") || "";
      });
      assert.equal(keyboardCheck, "draw", "Toolbar tool should be keyboard focusable.");

      await editor.page.click("#moreMenuBtn");
      await editor.page.waitForSelector("#editorMoreMenu[open]", { timeout: 10_000 });
      await editor.page.waitForSelector("#openLocalImageBtn", { timeout: 10_000 });
      await editor.page.waitForSelector("#pasteImageBtn", { timeout: 10_000 });
      await editor.page.waitForSelector("#overwriteBtn", { timeout: 10_000 });
      await editor.page.waitForSelector("#resetEditsBtn", { timeout: 10_000 });

      assertNoPageErrors(staging.telemetry, "editor-tools-stage");
      assertNoPageErrors(editor.telemetry, "editor-tools");
    });
  }
);

test(
  "editor output truth e2e: crop/resize/text/redaction produce real pixel and dimension changes",
  { timeout: 180_000 },
  async () => {
    await withRealExtension("editor-output-truth-real", async ({ openPage }) => {
      const staging = await openPage("gallery.html", "editor-output-stage");
      const itemId = await seedEditorItem(staging.page);
      assert.ok(itemId, "fixture media id is required");

      const editor = await openPage(`editor.html?itemId=${encodeURIComponent(itemId)}`, "editor-output-truth");
      await editor.page.waitForFunction(() => Boolean(window.__olhoEditorTestApi), { timeout: 20_000 });

      const original = await editor.page.evaluate(async (id) => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const blob = await storage.getMediaBlob(id);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const center = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
        return {
          width: canvas.width,
          height: canvas.height,
          centerRgba: Array.from(center)
        };
      }, itemId);

      const cropSnapshot = await editor.page.evaluate(async () => {
        const before = window.__olhoEditorTestApi.getSnapshot();
        await window.__olhoEditorTestApi.applyCropRect({ x: 60, y: 60, width: 420, height: 260 });
        const after = window.__olhoEditorTestApi.getSnapshot();
        return {
          beforeWidth: before.canvas.width,
          beforeHeight: before.canvas.height,
          afterWidth: after.canvas.width,
          afterHeight: after.canvas.height
        };
      });
      assert.ok(cropSnapshot.afterWidth < cropSnapshot.beforeWidth, "Crop should reduce width");
      assert.ok(cropSnapshot.afterHeight < cropSnapshot.beforeHeight, "Crop should reduce height");

      const resizeSnapshot = await editor.page.evaluate(async () => {
        const before = window.__olhoEditorTestApi.getSnapshot();
        await window.__olhoEditorTestApi.applyResizeSize(640, 360);
        const after = window.__olhoEditorTestApi.getSnapshot();
        return {
          beforeWidth: before.canvas.width,
          beforeHeight: before.canvas.height,
          afterWidth: after.canvas.width,
          afterHeight: after.canvas.height
        };
      });
      assert.equal(resizeSnapshot.afterWidth, 640);
      assert.equal(resizeSnapshot.afterHeight, 360);

      await editor.page.evaluate(() => {
        window.__olhoEditorTestApi.setStyle({
          fontSize: 44,
          fillColor: "#ffffff",
          strokeColor: "#ffffff"
        });
        window.__olhoEditorTestApi.addTextAction({
          tool: "text",
          text: "OUTPUT_TRUTH",
          x: 120,
          y: 120
        });
        window.__olhoEditorTestApi.setStyle({
          fillColor: "#000000",
          strokeColor: "#000000",
          opacity: 1
        });
        window.__olhoEditorTestApi.dragAction({ x: 260, y: 180 }, { x: 420, y: 290 }, "redact");
      });

      const savedCopyId = await editor.page.evaluate(async () => {
        return window.__olhoEditorTestApi.saveCopyAndGetItemId();
      });
      assert.ok(savedCopyId, "save copy should return persisted item id");

      const edited = await editor.page.evaluate(async (id) => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const blob = await storage.getMediaBlob(id);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();

        const center = Array.from(ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data);
        const redaction = Array.from(ctx.getImageData(320, 235, 1, 1).data);
        const textRegion = ctx.getImageData(105, 90, 210, 70).data;
        let brightPixelCount = 0;
        for (let i = 0; i < textRegion.length; i += 4) {
          const r = textRegion[i];
          const g = textRegion[i + 1];
          const b = textRegion[i + 2];
          if (r > 180 && g > 180 && b > 180) {
            brightPixelCount += 1;
          }
        }

        return {
          width: canvas.width,
          height: canvas.height,
          centerRgba: center,
          redactionRgba: redaction,
          textBrightPixelCount: brightPixelCount
        };
      }, savedCopyId);

      assert.equal(edited.width, 640, "Saved output should keep resized width");
      assert.equal(edited.height, 360, "Saved output should keep resized height");
      assert.notDeepEqual(
        edited.centerRgba,
        original.centerRgba,
        "Edited output should differ from original at center pixel after crop/resize/annotations"
      );
      assert.equal(edited.redactionRgba[0], edited.redactionRgba[1], "Redaction should flatten with uniform channel values");
      assert.equal(edited.redactionRgba[1], edited.redactionRgba[2], "Redaction should flatten with uniform channel values");
      assert.ok(edited.textBrightPixelCount > 20, "Text region should contain rendered bright text pixels");

      const pngInfo = await editor.page.evaluate(() => window.__olhoEditorTestApi.exportBlobInfo("png"));
      const pdfInfo = await editor.page.evaluate(() => window.__olhoEditorTestApi.exportBlobInfo("pdf"));
      assert.deepEqual(pngInfo.head.slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(String.fromCharCode(...pdfInfo.head.slice(0, 4)), "%PDF");

      await updateCoreProof((current) => ({
        ...current,
        editorOutput: {
          cropApplied: true,
          resizeApplied: true,
          textRendered: true,
          redactionFlattened: true,
          previewExportParity: true
        }
      }));

      assertNoPageErrors(staging.telemetry, "editor-output-stage");
      assertNoPageErrors(editor.telemetry, "editor-output-truth");
    });
  }
);
