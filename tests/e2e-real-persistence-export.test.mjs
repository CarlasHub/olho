import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  assertNoPageErrors,
  root,
  withRealExtension
} from "./e2e-real-utils.mjs";
import { updateCoreProof } from "./proof-artifacts.mjs";

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

test(
  "real extension persistence: save screenshot Blob via MediaRepository and reopen after reload",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-extension-persistence", async ({ openPage }) => {
      const gallery = await openPage("gallery.html", "gallery-persistence");

      const saved = await gallery.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 24;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("2D context unavailable for e2e persistence fixture.");
        }
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(4, 4, 24, 16);
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (nextBlob) => {
              if (nextBlob) {
                resolve(nextBlob);
                return;
              }
              reject(new Error("Failed to create fixture PNG blob."));
            },
            "image/png",
            1
          );
        });

        const created = await storage.saveMedia({
          kind: "screenshot",
          sourceType: "visible",
          blob,
          metadata: {
            title: "E2E Persistence Capture",
            tags: ["e2e", "persistence"]
          }
        });

        const loaded = await storage.getMedia(created.id, { includeBlob: true });

        return {
          id: created.id,
          loadedTitle: loaded?.metadata?.title || "",
          loadedMimeType: loaded?.blob?.type || "",
          loadedSize: loaded?.blob?.size || 0
        };
      });

      assert.ok(saved.id, "saved media id is required");
      assert.equal(saved.loadedTitle, "E2E Persistence Capture");
      assert.equal(saved.loadedMimeType, "image/png");
      assert.ok(saved.loadedSize > 0);

      const editor = await openPage(
        `editor.html?itemId=${encodeURIComponent(saved.id)}`,
        "editor-persistence"
      );

      await editor.page.waitForFunction(
        (expected) => document.getElementById("itemTitle")?.value === expected,
        { timeout: 20_000 },
        "E2E Persistence Capture"
      );

      await editor.page.reload({ waitUntil: "load", timeout: 20_000 });
      await editor.page.waitForFunction(
        (expected) => document.getElementById("itemTitle")?.value === expected,
        { timeout: 20_000 },
        "E2E Persistence Capture"
      );

      const reloaded = await editor.page.evaluate(async (id) => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const blob = await storage.getMediaBlob(id);
        return {
          mimeType: blob?.type || "",
          size: blob?.size || 0
        };
      }, saved.id);

      assert.equal(reloaded.mimeType, "image/png");
      assert.ok(reloaded.size > 0);
      assertNoPageErrors(gallery.telemetry, "gallery-persistence");
      assertNoPageErrors(editor.telemetry, "editor-persistence");
    });
  }
);

test(
  "real extension export validation: image export formats, copy actions, draft helpers, print path, and ZIP payload are generated locally",
  { timeout: 120_000 },
  async () => {
    await withRealExtension("real-extension-export-validation", async ({ openPage }) => {
      const report = await openPage("export-report.html", "export-report");

      await report.page.evaluate(async () => {
        const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
        const canvas = document.createElement("canvas");
        canvas.width = 28;
        canvas.height = 28;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("2D context unavailable for e2e export fixture.");
        }
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(14, 14, 10, 0, Math.PI * 2);
        ctx.fill();
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (nextBlob) => {
              if (nextBlob) {
                resolve(nextBlob);
                return;
              }
              reject(new Error("Failed to create fixture PNG blob."));
            },
            "image/png",
            1
          );
        });
        await storage.saveMedia({
          kind: "screenshot",
          sourceType: "visible",
          blob,
          metadata: {
            title: "E2E <script>alert(1)</script> Export Capture",
            tags: ["e2e", "export"]
          }
        });
      });

      await report.page.reload({ waitUntil: "load", timeout: 20_000 });
      await report.page.waitForSelector(".item-row", { timeout: 20_000 });

      await report.page.evaluate(() => {
        if (!chrome?.downloads) {
          throw new Error("chrome.downloads API unavailable in export page.");
        }

        window.__olhoDownloadCaptures = [];
        window.__olhoTabCreates = [];
        window.__olhoClipboardWrites = { text: 0, binary: 0, lastText: "" };
        window.__olhoPrintCapture = { opened: false, html: "" };

        function bytesToBase64(bytes) {
          const chunkSize = 0x8000;
          let binary = "";
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
          }
          return btoa(binary);
        }

        chrome.downloads.download = async (options) => {
          const response = await fetch(options.url);
          const blob = await response.blob();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          window.__olhoDownloadCaptures.push({
            filename: options.filename || "",
            mimeType: blob.type || "",
            base64: bytesToBase64(bytes),
            byteLength: bytes.length
          });
          return window.__olhoDownloadCaptures.length;
        };

        chrome.tabs.create = async ({ url }) => {
          window.__olhoTabCreates.push(String(url || ""));
          return { id: window.__olhoTabCreates.length + 1000 };
        };

        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (value) => {
              window.__olhoClipboardWrites.text += 1;
              window.__olhoClipboardWrites.lastText = String(value || "");
            },
            write: async () => {
              window.__olhoClipboardWrites.binary += 1;
            }
          }
        });

        window.open = () => {
          const fakeDocument = {
            open() {},
            write(value) {
              window.__olhoPrintCapture.html += String(value || "");
            },
            close() {}
          };
          window.__olhoPrintCapture.opened = true;
          return {
            document: fakeDocument
          };
        };
      });

      await report.page.evaluate(() => {
        const setField = (id, value) => {
          const field = document.getElementById(id);
          if (!field) throw new Error(`Missing field: ${id}`);
          field.value = value;
          field.dispatchEvent(new Event("change", { bubbles: true }));
        };
        setField("jiraUrl", "example.atlassian.net");
        setField("githubIssueUrl", "github.com/org/repo/issues/new");
        setField("shareSubject", "E2E Export Subject");
        setField("shareNotes", "E2E export notes");
      });

      await openDisclosureByLabel(report.page, /^download$/i);
      await report.page.click("#downloadPngBtn");
      await report.page.waitForFunction(
        () => Array.isArray(window.__olhoDownloadCaptures) && window.__olhoDownloadCaptures.some((entry) => /\.png$/i.test(entry.filename)),
        { timeout: 20_000 }
      );

      await report.page.click("#downloadJpgBtn");
      await report.page.waitForFunction(
        () => Array.isArray(window.__olhoDownloadCaptures) && window.__olhoDownloadCaptures.some((entry) => /\.jpg$/i.test(entry.filename)),
        { timeout: 20_000 }
      );

      await report.page.click("#downloadWebpBtn");
      await report.page.waitForFunction(
        () => Array.isArray(window.__olhoDownloadCaptures) && window.__olhoDownloadCaptures.some((entry) => /\.webp$/i.test(entry.filename)),
        { timeout: 20_000 }
      );

      await report.page.click("#downloadPdfBtn");
      await report.page.waitForFunction(
        () => Array.isArray(window.__olhoDownloadCaptures) && window.__olhoDownloadCaptures.some((entry) => /\.pdf$/i.test(entry.filename)),
        { timeout: 20_000 }
      );

      await report.page.click("#downloadHtmlBtn");
      await report.page.waitForFunction(
        () => Array.isArray(window.__olhoDownloadCaptures) && window.__olhoDownloadCaptures.some((entry) => /report.*\.html$/i.test(entry.filename)),
        { timeout: 20_000 }
      );

      await report.page.click("#downloadHtmlSummaryBtn");
      await report.page.waitForFunction(
        () => Array.isArray(window.__olhoDownloadCaptures) && window.__olhoDownloadCaptures.some((entry) => /summary.*\.html$/i.test(entry.filename)),
        { timeout: 20_000 }
      );

      await report.page.click("#downloadMarkdownBtn");
      await report.page.waitForFunction(
        () => Array.isArray(window.__olhoDownloadCaptures) && window.__olhoDownloadCaptures.some((entry) => /\.md$/i.test(entry.filename)),
        { timeout: 20_000 }
      );

      await report.page.click("#downloadJsonBtn");
      await report.page.waitForFunction(
        () => Array.isArray(window.__olhoDownloadCaptures) && window.__olhoDownloadCaptures.some((entry) => /\.json$/i.test(entry.filename)),
        { timeout: 20_000 }
      );

      await report.page.click("#downloadZipBtn");
      await report.page.waitForFunction(
        () => Array.isArray(window.__olhoDownloadCaptures) && window.__olhoDownloadCaptures.some((entry) => /\.zip$/i.test(entry.filename)),
        { timeout: 20_000 }
      );

      await report.page.$eval("#copySummaryBtn", (button) => button.click());
      await report.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
      const copySummaryStatus = await report.page.$eval("#status", (node) => String(node.textContent || ""));
      assert.match(copySummaryStatus, /summary copied/i, "copy markdown should report success");
      await report.page.$eval("#copyHtmlBtn", (button) => button.click());
      await report.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
      const copyHtmlStatus = await report.page.$eval("#status", (node) => String(node.textContent || ""));
      assert.match(copyHtmlStatus, /html summary copied/i, "copy HTML should report success");

      await openDisclosureByLabel(report.page, /^copy$/i);
      await report.page.$eval("#copyImageBtn", (button) => button.click());

      await openDisclosureByLabel(report.page, /^download$/i);
      await report.page.click("#printBtn");

      await openDisclosureByLabel(report.page, /^draft$/i);
      await report.page.click("#openMailBtn");
      await report.page.click("#openGithubBtn");
      await report.page.click("#openJiraBtn");

      const downloads = await report.page.evaluate(() => window.__olhoDownloadCaptures || []);
      const pngDownload = downloads.find((entry) => /\.png$/i.test(entry.filename));
      const jpgDownload = downloads.find((entry) => /\.jpg$/i.test(entry.filename));
      const webpDownload = downloads.find((entry) => /\.webp$/i.test(entry.filename));
      const pdfDownload = downloads.find((entry) => /\.pdf$/i.test(entry.filename));
      const htmlReportDownload = downloads.find((entry) => /report.*\.html$/i.test(entry.filename));
      const htmlSummaryDownload = downloads.find((entry) => /summary.*\.html$/i.test(entry.filename));
      const markdownDownload = downloads.find((entry) => /\.md$/i.test(entry.filename));
      const jsonDownload = downloads.find((entry) => /\.json$/i.test(entry.filename));
      const zipDownload = downloads.find((entry) => /\.zip$/i.test(entry.filename));

      assert.ok(pngDownload, "expected PNG download capture");
      assert.ok(jpgDownload, "expected JPG download capture");
      assert.ok(webpDownload, "expected WebP download capture");
      assert.ok(pdfDownload, "expected PDF download capture");
      assert.ok(htmlReportDownload, "expected HTML report download capture");
      assert.ok(htmlSummaryDownload, "expected HTML summary download capture");
      assert.ok(markdownDownload, "expected Markdown download capture");
      assert.ok(jsonDownload, "expected JSON download capture");
      assert.ok(zipDownload, "expected ZIP download capture");
      assert.ok(pngDownload.byteLength > 10, "PNG should contain bytes");
      assert.ok(jpgDownload.byteLength > 10, "JPG should contain bytes");
      assert.ok(webpDownload.byteLength > 10, "WebP should contain bytes");
      assert.ok(pdfDownload.byteLength > 10, "PDF should contain bytes");
      assert.ok(zipDownload.byteLength > 10, "ZIP should contain bytes");

      const pngBytes = Buffer.from(pngDownload.base64, "base64");
      assert.deepEqual([...pngBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

      const jpgBytes = Buffer.from(jpgDownload.base64, "base64");
      assert.deepEqual([...jpgBytes.subarray(0, 2)], [255, 216]);

      const webpBytes = Buffer.from(webpDownload.base64, "base64");
      assert.equal(webpBytes.subarray(0, 4).toString("ascii"), "RIFF");
      assert.equal(webpBytes.subarray(8, 12).toString("ascii"), "WEBP");

      const pdfBytes = Buffer.from(pdfDownload.base64, "base64");
      assert.equal(pdfBytes.subarray(0, 4).toString("ascii"), "%PDF");

      const markdownText = Buffer.from(markdownDownload.base64, "base64").toString("utf8");
      assert.match(markdownText, /# Olho Send View Report/);
      assert.match(markdownText, /Privacy note:/);

      const htmlSummaryText = Buffer.from(htmlSummaryDownload.base64, "base64").toString("utf8");
      assert.match(htmlSummaryText, /Olho Export Summary/);
      assert.equal(htmlSummaryText.includes("<script>alert(1)</script>"), false, "HTML summary must sanitize raw script tags");
      assert.match(htmlSummaryText, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

      const jsonText = Buffer.from(jsonDownload.base64, "base64").toString("utf8");
      const parsedJson = JSON.parse(jsonText);
      assert.equal(parsedJson.title, "Olho Send View Report");
      assert.equal(Array.isArray(parsedJson.items), true);

      const zipBytes = Buffer.from(zipDownload.base64, "base64");
      const zipPath = path.join(os.tmpdir(), `olho-e2e-export-${Date.now()}.zip`);
      await fs.writeFile(zipPath, zipBytes);

      const list = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
      assert.equal(list.status, 0, `zip listing failed: ${list.stderr || list.stdout}`);
      const entries = (list.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      assert.ok(entries.includes("report/report.pdf"), "zip should include report PDF");
      assert.ok(entries.includes("report/summary.html"), "zip should include HTML summary");
      assert.ok(entries.some((entry) => entry.startsWith("media/") && /\.png$/i.test(entry)), "zip should include media PNG payload");

      const detail = spawnSync("unzip", ["-l", zipPath], { encoding: "utf8" });
      assert.equal(detail.status, 0, `zip detail listing failed: ${detail.stderr || detail.stdout}`);
      assert.match(detail.stdout, /\s+media\/.*\.png\s*$/m);
      const fileEntries = entries.filter((entry) => !entry.endsWith("/"));
      assert.ok(fileEntries.length > 0, "zip should contain file entries");
      const emptyEntries = [];
      for (const entry of fileEntries) {
        const inflated = spawnSync("unzip", ["-p", zipPath, entry], { encoding: null });
        assert.equal(inflated.status, 0, `zip extraction failed for ${entry}`);
        const byteLength = Buffer.isBuffer(inflated.stdout) ? inflated.stdout.length : 0;
        if (byteLength <= 0) {
          emptyEntries.push(entry);
        }
      }
      assert.deepEqual(emptyEntries, [], `zip file entries must be non-empty: ${emptyEntries.join(", ")}`);

      const eventState = await report.page.evaluate(() => ({
        clipboard: window.__olhoClipboardWrites || { text: 0, binary: 0, lastText: "" },
        tabs: window.__olhoTabCreates || [],
        printCapture: window.__olhoPrintCapture || { opened: false, html: "" }
      }));

      assert.ok(eventState.clipboard.text >= 1, "copy markdown/html should write text at least once");
      assert.ok(eventState.clipboard.binary >= 1, "copy image should write binary clipboard payload");
      assert.ok(
        /# olho send view report/i.test(eventState.clipboard.lastText) || /<table/i.test(eventState.clipboard.lastText),
        "copied text should be markdown summary or html summary"
      );

      assert.ok(eventState.printCapture.opened, "print action should open print view");
      assert.match(eventState.printCapture.html, /Olho Export Print/);

      const tabUrls = eventState.tabs;
      assert.ok(tabUrls.some((url) => url.startsWith("mailto:")), "mailto draft should be generated");
      assert.ok(tabUrls.some((url) => /github\.com/i.test(url) && /title=/.test(url) && /body=/.test(url)), "GitHub draft URL should include title and body");
      assert.ok(tabUrls.some((url) => /CreateIssueDetails!init\.jspa/.test(url) && /summary=/.test(url) && /description=/.test(url)), "Jira draft URL should include summary and description");
      assert.equal(
        tabUrls.every((url) => {
          if (url.startsWith("mailto:")) return true;
          try {
            const parsed = new URL(url);
            return !/upload|attachments?|\/api\//i.test(parsed.pathname || "");
          } catch {
            return false;
          }
        }),
        true,
        "Draft URLs must not upload files"
      );

      await fs.rm(zipPath, { force: true });
      await updateCoreProof((current) => ({
        ...current,
        exportOutput: {
          ...(current.exportOutput || {}),
          pngHeaderValid: true,
          jpgHeaderValid: true,
          webpHeaderValid: true,
          pdfHeaderValid: true,
          zipHasEntries: true,
          zipEntriesNonEmpty: true,
          jsonParses: true,
          htmlSanitized: true,
          markdownContainsExpected: true
        }
      }));
      assertNoPageErrors(report.telemetry, "export-report");
    });
  }
);
