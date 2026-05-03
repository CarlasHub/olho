import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertNoPageErrors,
  cleanupExtensionStorage,
  withRealExtension,
  seedMediaBlobInExtensionContext
} from "./e2e-real-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test-results", "export-visual-walkthrough");
const outJson = path.join(outDir, "export-visual-walkthrough.json");
const outMd = path.join(outDir, "export-visual-walkthrough.md");

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 }
];

function escapeMarkdown(text) {
  return String(text || "").replace(/\|/g, "\\|");
}

async function collectLayout(page) {
  return page.evaluate(() => {
    const rootEl = document.documentElement;
    const body = document.body;
    const hScroll = Math.max(rootEl.scrollWidth - rootEl.clientWidth, body.scrollWidth - body.clientWidth);
    const header = document.querySelector(".header");
    const actionsCard = document.querySelector(".actions-card");
    const primary = document.getElementById("downloadZipBtn");

    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height)
      };
    };

    return {
      clientWidth: Number(rootEl.clientWidth || 0),
      scrollXOverflow: Number(hScroll || 0),
      sectionCount: document.querySelectorAll("main.layout > section.card").length,
      headerRect: rect(header),
      actionsRect: rect(actionsCard),
      primaryRect: rect(primary),
      primaryVisible: Boolean(primary && primary.offsetWidth > 0 && primary.offsetHeight > 0)
    };
  });
}

test(
  "real export visual walkthrough captures mobile tablet and desktop evidence",
  { timeout: 180_000 },
  async () => {
    await fs.mkdir(outDir, { recursive: true });

    const evidence = [];

    await withRealExtension("real-export-visual-walkthrough", async ({ openPage }) => {
      const gallery = await openPage("gallery.html", "export-visual-seed-gallery");
      await cleanupExtensionStorage(gallery.page);

      for (let index = 0; index < 6; index += 1) {
        await seedMediaBlobInExtensionContext(gallery.page, {
          kind: "screenshot",
          title: `Export walkthrough item ${index + 1} with descriptive title for visual scan`,
          tags: ["export", "walkthrough", `tag-${index + 1}`]
        });
      }

      const exportPage = await openPage("export-report.html", "export-visual-page");
      await exportPage.page.waitForSelector("#itemsContainer .item-row", { timeout: 20_000 });

      for (const viewport of VIEWPORTS) {
        await exportPage.page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
        const layout = await collectLayout(exportPage.page);

        assert.ok(layout.scrollXOverflow <= 1, `${viewport.name} has horizontal overflow (${layout.scrollXOverflow}px)`);
        assert.equal(layout.primaryVisible, true, `${viewport.name} should expose Download ZIP Bundle as primary action`);
        assert.equal(layout.sectionCount >= 3, true, `${viewport.name} should render summary/actions/items sections`);

        const screenshotPath = path.join(outDir, `export-${viewport.name}.png`);
        await exportPage.page.screenshot({ path: screenshotPath, fullPage: true, timeout: 60_000 });

        evidence.push({
          viewport: viewport.name,
          screenshot: path.relative(root, screenshotPath),
          layout
        });
      }

      assertNoPageErrors(exportPage.telemetry, "export-visual-page");
    });

    const result = {
      generatedAt: new Date().toISOString(),
      status: "pass",
      evidence
    };

    await fs.writeFile(outJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    const lines = [
      "# Export Visual Walkthrough",
      "",
      `- Generated: ${result.generatedAt}`,
      "- Status: pass",
      "",
      "## Evidence",
      "| Viewport | Screenshot | Horizontal Overflow (px) | Primary Visible |",
      "|---|---|---:|---|",
      ...evidence.map((row) => {
        return `| ${row.viewport} | ${escapeMarkdown(row.screenshot)} | ${Number(row.layout?.scrollXOverflow || 0)} | ${row.layout?.primaryVisible ? "yes" : "no"} |`;
      })
    ];

    await fs.writeFile(outMd, `${lines.join("\n")}\n`, "utf8");
  }
);
