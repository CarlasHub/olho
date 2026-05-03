import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { launchExtension, screenshotOnFailure } from "./e2e-real-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const reportPath = path.join(root, "test-results", "accessibility-audit.md");

const PAGES = [
  "popup.html",
  "editor.html",
  "gallery.html",
  "record.html",
  "export-report.html",
  "options.html",
  "privacy.html"
];

test(
  "real extension accessibility audit generates markdown report",
  { timeout: 150_000 },
  async () => {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });

    const session = await launchExtension("real-accessibility-audit-report");
    const findings = [];

    try {
      for (const relPath of PAGES) {
        const opened = await session.openExtensionPage(relPath, `a11y-${relPath}`);
        const page = opened.page;

        await page.focus("body");
        for (let i = 0; i < 6; i += 1) {
          await page.keyboard.press("Tab");
        }

        const focusState = await page.evaluate(() => {
          const active = document.activeElement;
          return {
            tag: active?.tagName || "",
            id: active?.id || "",
            className: typeof active?.className === "string" ? active.className : ""
          };
        });

        if (!focusState.tag || focusState.tag === "BODY") {
          findings.push(`${relPath}: keyboard tab sequence did not move focus to an interactive control.`);
        }

        const missingIconNames = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("button"))
            .filter((button) => {
              const text = (button.textContent || "").replace(/\s+/g, "").trim();
              if (text) return false;
              if (!button.querySelector("svg, img")) return false;
              const label = button.getAttribute("aria-label");
              const labelledby = button.getAttribute("aria-labelledby");
              return !label && !labelledby;
            })
            .map((button) => button.id || button.outerHTML.slice(0, 120));
        });

        if (missingIconNames.length) {
          findings.push(`${relPath}: icon-only buttons missing accessible name -> ${missingIconNames.join(", ")}`);
        }

        const linksWithoutNames = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("a[href]"))
            .filter((link) => !(link.textContent || "").replace(/\s+/g, " ").trim() && !link.getAttribute("aria-label"))
            .map((link) => link.outerHTML.slice(0, 120));
        });

        if (linksWithoutNames.length) {
          findings.push(`${relPath}: links missing readable names -> ${linksWithoutNames.length}`);
        }
      }

      const cssFiles = [
        "src/shared/renaissance-theme.css",
        "popup.css",
        "editor.css",
        "gallery.css",
        "record.css",
        "export-report.css",
        "options.css",
        "privacy.css"
      ];

      let combinedCss = "";
      for (const cssFile of cssFiles) {
        combinedCss += `\n${await fs.readFile(path.join(root, cssFile), "utf8")}`;
      }

      if (!/prefers-reduced-motion\s*:\s*reduce/i.test(combinedCss)) {
        findings.push("global: missing prefers-reduced-motion handling in UI CSS.");
      }
      if (!/:focus-visible/.test(combinedCss)) {
        findings.push("global: missing :focus-visible styles.");
      }

      const output = [
        "# Accessibility Audit",
        "",
        `- Generated: ${new Date().toISOString()}`,
        `- Pages checked: ${PAGES.length}`,
        `- Findings: ${findings.length}`,
        "",
        findings.length ? "## Findings" : "## Findings\nNone.",
        ...(findings.length ? findings.map((item) => `- ${item}`) : [])
      ].join("\n");

      await fs.writeFile(reportPath, `${output}\n`, "utf8");
      assert.deepEqual(findings, []);
    } catch (error) {
      const artifactDir = await screenshotOnFailure(session, error);
      throw new Error(`${String(error?.message || error)}\nFailure artifacts: ${artifactDir}`);
    } finally {
      await session.close();
    }
  }
);
