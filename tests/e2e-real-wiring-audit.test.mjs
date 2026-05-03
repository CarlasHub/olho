import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { launchExtension, screenshotOnFailure } from "./e2e-real-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "test-results");

const PAGE_PATHS = [
  "popup.html",
  "editor.html",
  "gallery.html",
  "record.html",
  "export-report.html",
  "options.html",
  "privacy.html"
];

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

test(
  "real extension wiring audit generates control-level pass/fail report",
  { timeout: 180_000 },
  async () => {
    await fs.mkdir(reportDir, { recursive: true });

    const session = await launchExtension("real-wiring-audit");
    const controls = [];

    try {
      for (const relPath of PAGE_PATHS) {
        const page = await session.browser.newPage();
        const pageConsoleErrors = [];
        const pageErrors = [];

        page.on("console", (message) => {
          if (message.type() === "error") {
            pageConsoleErrors.push(message.text());
          }
        });
        page.on("pageerror", (error) => {
          pageErrors.push(String(error?.stack || error?.message || error));
        });

        await page.evaluateOnNewDocument(() => {
          const nativeAddEventListener = EventTarget.prototype.addEventListener;
          const records = [];
          const seen = new Set();
          window.__olhoListenerAudit = records;

          EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
            try {
              const target = this;
              const id = target?.id || "";
              const tag = target?.tagName || target?.nodeName || target?.constructor?.name || "";
              const dataAction = target?.getAttribute?.("data-action") || "";
              const className = typeof target?.className === "string" ? target.className : "";
              const key = `${String(type)}::${String(id)}::${String(tag)}::${String(dataAction)}::${String(className)}`;
              if (!seen.has(key)) {
                seen.add(key);
                records.push({
                  type: String(type),
                  id: String(id),
                  tag: String(tag),
                  dataAction: String(dataAction),
                  className: String(className)
                });
              }
            } catch {
              // best effort instrumentation
            }
            return nativeAddEventListener.call(this, type, listener, options);
          };
        });

        await page.goto(`chrome-extension://${session.extensionId}/${relPath}`, {
          waitUntil: "load",
          timeout: 20_000
        });
        await page.waitForFunction(() => document.readyState === "complete", { timeout: 15_000 });
        await new Promise((resolve) => setTimeout(resolve, 250));

        const pageControls = await page.evaluate((currentPath) => {
          const listenerRecords = Array.isArray(window.__olhoListenerAudit) ? window.__olhoListenerAudit : [];

          function byAriaLabelledBy(node) {
            const value = node.getAttribute("aria-labelledby") || "";
            if (!value.trim()) return "";
            return value
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent || "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
          }

          function accessibleName(node) {
            const explicitLabel = (() => {
              if (!node.id) return "";
              const direct = document.querySelector(`label[for=\"${CSS.escape(node.id)}\"]`);
              if (direct) {
                return (direct.textContent || "").replace(/\\s+/g, " ").trim();
              }
              return "";
            })();
            const wrappingLabel = (() => {
              const label = node.closest("label");
              if (!label) return "";
              return (label.textContent || "").replace(/\\s+/g, " ").trim();
            })();

            return (
              node.getAttribute("aria-label") ||
              byAriaLabelledBy(node) ||
              explicitLabel ||
              wrappingLabel ||
              node.getAttribute("title") ||
              node.textContent ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim();
          }

          const selector =
            'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="menuitem"], summary';
          const nodes = Array.from(document.querySelectorAll(selector));

          return nodes
            .map((node, index) => {
              const style = getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
              if (!visible) return null;

              const name = accessibleName(node);
              const isButton = node.tagName.toLowerCase() === "button" || node.getAttribute("role") === "button";
              const isLink = node.tagName.toLowerCase() === "a";
              const disabled =
                Boolean(node.disabled) ||
                node.getAttribute("aria-disabled") === "true" ||
                node.hasAttribute("disabled");

              const id = node.id || "";
              const dataAction = node.getAttribute("data-action") || "";
              const className = typeof node.className === "string" ? node.className : "";

              const hasDirectClickListener = listenerRecords.some((entry) => {
                if (entry.type !== "click") return false;
                if (id && entry.id === id) return true;
                if (dataAction && entry.dataAction === dataAction) return true;
                if (className && entry.className === className) return true;
                return false;
              });

              const hasInlineHandler = node.hasAttribute("onclick");
              const hasHref = isLink ? Boolean(node.getAttribute("href")) : null;

              let expected = "interactive control";
              if (isButton) expected = "button action";
              if (isLink) expected = "navigation";

              const issues = [];
              if (!name) {
                issues.push("missing accessible name");
              }
              if (isLink && !hasHref) {
                issues.push("link missing href");
              }
              const warnings = [];
              if (isButton && !disabled && !hasInlineHandler && !hasDirectClickListener && node.type !== "submit" && node.type !== "reset") {
                warnings.push("no direct click handler detected");
              }

              return {
                page: currentPath,
                selector: `${node.tagName.toLowerCase()}${id ? `#${id}` : ""}${dataAction ? `[data-action=\"${dataAction}\"]` : ""}`,
                index,
                tagName: node.tagName.toLowerCase(),
                visibleText: (node.textContent || "").replace(/\s+/g, " ").trim(),
                accessibleName: name,
                role: node.getAttribute("role") || "",
                disabled,
                ariaExpanded: node.getAttribute("aria-expanded") || "",
                href: isLink ? node.getAttribute("href") || "" : "",
                dataAction,
                keyboardFocusable: node.tabIndex >= 0,
                expectedBehaviour: expected,
                actualBehaviour: issues.length ? "potential issue" : "control appears wired",
                pass: issues.length === 0,
                notes: issues.join("; "),
                warnings
              };
            })
            .filter(Boolean);
        }, relPath);

        controls.push(...pageControls);

        await page.close();
        assert.deepEqual(pageConsoleErrors, [], `${relPath} has console errors`);
        assert.deepEqual(pageErrors, [], `${relPath} has page errors`);
      }

      const failed = controls.filter((row) => !row.pass);
      const warnings = controls.flatMap((row) =>
        Array.isArray(row.warnings) && row.warnings.length
          ? row.warnings.map((warning) => ({ page: row.page, selector: row.selector, warning }))
          : []
      );

      const summary = {
        generatedAt: new Date().toISOString(),
        totalControls: controls.length,
        passed: controls.length - failed.length,
        failed: failed.length,
        warnings,
        failures: failed,
        controls
      };

      await fs.writeFile(path.join(reportDir, "wiring-audit.json"), JSON.stringify(summary, null, 2));

      const lines = [
        "# Wiring Audit",
        "",
        `- Generated: ${summary.generatedAt}`,
        `- Total controls: ${summary.totalControls}`,
        `- Passed: ${summary.passed}`,
        `- Failed: ${summary.failed}`,
        `- Warnings: ${warnings.length}`,
        "",
        "| Page | Selector | Tag | Accessible Name | Disabled | Result | Notes |",
        "|---|---|---|---|---|---|---|"
      ];

      controls.forEach((row) => {
        lines.push(
          `| ${escapeMarkdown(row.page)} | ${escapeMarkdown(row.selector)} | ${escapeMarkdown(row.tagName)} | ${escapeMarkdown(row.accessibleName)} | ${row.disabled ? "yes" : "no"} | ${row.pass ? "pass" : "fail"} | ${escapeMarkdown(row.notes)} |`
        );
      });

      await fs.writeFile(path.join(reportDir, "wiring-audit.md"), `${lines.join("\n")}\n`, "utf8");

      assert.equal(summary.totalControls > 0, true, "expected interactive controls to audit");
      assert.deepEqual(
        failed,
        [],
        `wiring audit found issues:\n${failed
          .slice(0, 25)
          .map((row) => `${row.page} ${row.selector}: ${row.notes}`)
          .join("\n")}`
      );
    } catch (error) {
      const artifactDir = await screenshotOnFailure(session, error);
      throw new Error(`${String(error?.message || error)}\nFailure artifacts: ${artifactDir}`);
    } finally {
      await session.close();
    }
  }
);
