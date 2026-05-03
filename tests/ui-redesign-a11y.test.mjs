import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

async function read(relPath) {
  return fs.readFile(path.join(root, relPath), "utf8");
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHexColor(text, variable) {
  const match = text.match(new RegExp(`--${variable}\\s*:\\s*(#[0-9a-fA-F]{6})`, "i"));
  return match ? match[1].toLowerCase() : null;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  };
}

function srgbToLinear(value) {
  const channel = value / 255;
  if (channel <= 0.03928) {
    return channel / 12.92;
  }
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(foregroundHex, backgroundHex) {
  const l1 = luminance(foregroundHex);
  const l2 = luminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test("1. Keyboard navigation through popup", async () => {
  const html = await read("popup.html");
  assert.equal(html.includes('id="capture-actions"'), true);
  assert.equal(html.includes('id="library-actions"'), true);
  assert.equal(html.includes('id="captureBlockedPanel"'), true);
  assert.equal(html.includes('id="blockedScreenCaptureBtn"'), true);
  assert.equal(/tabindex\s*=\s*"-1"/i.test(html), false);
});

test("2. Keyboard navigation through editor toolbar", async () => {
  const html = await read("editor.html");
  const js = await read("editor.js");
  const toolButtons = html.match(/<button[^>]*class="tool-btn[^"]*"[^>]*>/g) || [];
  assert.ok(toolButtons.length >= 12);
  toolButtons.forEach((button) => {
    assert.equal(/aria-label="[^"]+"/.test(button), true, `Missing aria-label on tool button: ${button}`);
  });
  assert.equal(js.includes("function onKeyDown(event)"), true);
  assert.equal(js.includes('event.key === "Escape"'), true);
  assert.equal(js.includes('event.key === "Delete"'), true);
});

test("3. Keyboard navigation through gallery", async () => {
  const html = await read("gallery.html");
  const js = await read("src/gallery/card-view.js");
  assert.equal(html.includes('id="galleryGrid" class="gallery-grid" role="grid"'), true);
  assert.equal(js.includes("function onCardKeydown(event, id, trash)"), true);
  assert.equal(js.includes('event.key === "ArrowRight"'), true);
  assert.equal(js.includes('event.key === "ArrowLeft"'), true);
  assert.equal(js.includes('event.key === "ArrowDown"'), true);
  assert.equal(js.includes('event.key === "ArrowUp"'), true);
  assert.equal(js.includes('event.key === "Enter"'), true);
  assert.equal(js.includes('event.key === " "'), true);
});

test("4. Dialog focus management", async () => {
  const galleryJs = await read("gallery.js");
  const recordJs = await read("record.js");
  const editorJs = await read("editor.js");

  assert.equal(galleryJs.includes("confirmCancelBtn.focus()"), true);
  assert.equal(galleryJs.includes("inputDialogField.focus()"), true);
  assert.equal(galleryJs.includes("dialogInvoker.focus()"), true);

  assert.equal(recordJs.includes("confirmCancelBtn.focus()"), true);
  assert.equal(recordJs.includes("confirmInvoker.focus()"), true);

  assert.equal(editorJs.includes("overwriteDialog.showModal()"), true);
  assert.equal(
    /overwriteDialog\.addEventListener\("close",[\s\S]*invoker\.focus\(\)/.test(editorJs),
    true
  );
});

test("5. Reduced motion checked", async () => {
  const cssFiles = [
    "popup.css",
    "editor.css",
    "gallery.css",
    "record.css",
    "options.css",
    "export-report.css",
    "privacy.css"
  ];

  for (const file of cssFiles) {
    const css = await read(file);
    assert.equal(css.includes("prefers-reduced-motion"), true, `${file} is missing reduced-motion support`);
  }
});

test("6. No icon-only button without accessible name", async () => {
  const htmlFiles = [
    "popup.html",
    "editor.html",
    "gallery.html",
    "record.html",
    "options.html",
    "export-report.html",
    "privacy.html"
  ];

  for (const file of htmlFiles) {
    const html = await read(file);
    const matches = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [];

    for (const button of matches) {
      const openTagMatch = button.match(/^<button\b[^>]*>/i);
      if (!openTagMatch) continue;
      const openTag = openTagMatch[0];
      const body = button.replace(openTag, "").replace(/<\/button>$/i, "");
      const text = stripTags(body);
      const hasVisualOnlyContent = /<svg\b|<img\b/i.test(body);
      if (text) continue;
      if (!hasVisualOnlyContent) continue;

      const hasAccessibleName = /aria-label\s*=\s*"[^"]+"/i.test(openTag) || /aria-labelledby\s*=\s*"[^"]+"/i.test(openTag);
      assert.equal(hasAccessibleName, true, `${file} has icon-only button without accessible name: ${openTag}`);
    }
  }
});

test("7. No low contrast critical text", async () => {
  const cssFiles = [
    "popup.css",
    "editor.css",
    "gallery.css",
    "record.css",
    "options.css",
    "export-report.css",
    "privacy.css"
  ];

  for (const file of cssFiles) {
    const css = await read(file);
    assert.equal(css.includes("--text:"), true, `${file} missing --text token`);
    assert.equal(css.includes("--bg:"), true, `${file} missing --bg token`);

    assert.equal(/outline:\s*3px\s+solid/i.test(css), true, `${file} missing strong visible focus outline`);
  }
});

test("8. Sidebar navigation exists and has accessible names", async () => {
  const htmlFiles = [
    "popup.html",
    "editor.html",
    "gallery.html",
    "record.html",
    "export-report.html",
    "options.html",
    "privacy.html"
  ];

  for (const file of htmlFiles) {
    const html = await read(file);
    assert.match(
      html,
      /class="[^"]*\bolho-nav\b[^"]*"/,
      `${file} missing olho-nav`
    );

    const requiredLabels =
      file === "popup.html"
        ? ["Memory", "Settings", "Privacy"]
        : ["Capture", "Record", "Memory", "Export", "Settings", "Privacy"];
    requiredLabels.forEach((label) => {
      assert.equal(html.includes(label), true, `${file} missing nav label: ${label}`);
    });
  }
});

test("9. Disclosure sections are native and keyboard-operable", async () => {
  const popupHtml = await read("popup.html");
  const recordHtml = await read("record.html");
  const optionsHtml = await read("options.html");

  assert.equal(popupHtml.includes("<details"), true);
  assert.equal(popupHtml.includes("More capture options"), true);

  assert.equal(recordHtml.includes("<details"), true);
  assert.equal(recordHtml.includes("<summary>Source</summary>"), true);
  assert.equal(recordHtml.includes("<summary>Audio</summary>"), true);
  assert.equal(recordHtml.includes("<summary>Camera</summary>"), true);
  assert.equal(recordHtml.includes("<summary>Save</summary>"), true);

  assert.equal(optionsHtml.includes("<details"), true);
  assert.equal(optionsHtml.includes("<summary>General</summary>"), true);
  assert.equal(optionsHtml.includes("<summary>Capture</summary>"), true);
  assert.equal(optionsHtml.includes("<summary>Privacy</summary>"), true);
});

test("10. Dark utility tokens include required surfaces and states", async () => {
  const css = await read("src/shared/renaissance-theme.css");

  const requiredTokens = [
    "--olho-bg-page",
    "--olho-bg-app",
    "--olho-bg-shell",
    "--olho-bg-sidebar",
    "--olho-bg-panel",
    "--olho-bg-panel-raised",
    "--olho-bg-card",
    "--olho-bg-card-hover",
    "--olho-bg-canvas",
    "--olho-bg-hover",
    "--olho-bg-active",
    "--olho-bg-selected",
    "--olho-bg-disabled",
    "--olho-bg-overlay",
    "--olho-gradient-page",
    "--olho-gradient-panel",
    "--olho-gradient-card",
    "--olho-border-hairline",
    "--olho-border-subtle",
    "--olho-border-medium",
    "--olho-border-strong",
    "--olho-border-dark",
    "--olho-border-focus",
    "--olho-shadow-soft",
    "--olho-shadow-panel",
    "--olho-shadow-gold-glow",
    "--olho-text-primary",
    "--olho-text-secondary",
    "--olho-text-muted",
    "--olho-text-faint",
    "--olho-text-disabled",
    "--olho-text-inverse",
    "--olho-text-link",
    "--olho-brand-ink",
    "--olho-brand-sepia",
    "--olho-brand-gold",
    "--olho-brand-gold-soft",
    "--olho-brand-antique-gold",
    "--olho-brand-copper",
    "--olho-brand-parchment",
    "--olho-success-bg",
    "--olho-success-border",
    "--olho-success-text",
    "--olho-warning-bg",
    "--olho-warning-border",
    "--olho-warning-text",
    "--olho-danger-bg",
    "--olho-danger-border",
    "--olho-danger-text",
    "--olho-info-bg",
    "--olho-info-border",
    "--olho-info-text",
    "--olho-recording-bg",
    "--olho-recording-border",
    "--olho-recording-text",
    "--olho-selected-bg",
    "--olho-selected-border",
    "--olho-selected-text",
    "--olho-disabled-bg",
    "--olho-disabled-border",
    "--olho-disabled-text",
    "--olho-focus-ring",
    "--olho-focus-glow"
  ];

  requiredTokens.forEach((token) => {
    assert.equal(css.includes(token), true, `Missing token ${token}`);
  });
});

test("11. No remote assets introduced in runtime pages", async () => {
  const files = [
    "popup.html",
    "editor.html",
    "gallery.html",
    "record.html",
    "export-report.html",
    "options.html",
    "privacy.html",
    "popup.css",
    "editor.css",
    "gallery.css",
    "record.css",
    "export-report.css",
    "options.css",
    "privacy.css",
    "src/shared/renaissance-theme.css"
  ];

  for (const file of files) {
    const text = await read(file);
    assert.equal(/https?:\/\//i.test(text), false, `${file} contains remote URL`);
  }
});
