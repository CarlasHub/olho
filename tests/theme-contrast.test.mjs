import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function parseHexToken(css, tokenName) {
  const pattern = new RegExp(`${tokenName}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`);
  const match = css.match(pattern);
  return match ? match[1].toLowerCase() : null;
}

function srgbToLinear(channel) {
  const value = channel / 255;
  if (value <= 0.03928) return value / 12.92;
  return ((value + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function contrastRatio(foreground, background) {
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test("balanced dark utility contrast pairs meet required thresholds", async () => {
  const css = await fs.readFile(path.join(root, "src/shared/renaissance-theme.css"), "utf8");

  const tokens = {
    bgApp: parseHexToken(css, "--olho-bg-app"),
    bgPanel: parseHexToken(css, "--olho-bg-panel"),
    bgCard: parseHexToken(css, "--olho-bg-card"),
    textPrimary: parseHexToken(css, "--olho-text-primary"),
    textSecondary: parseHexToken(css, "--olho-text-secondary"),
    textMuted: parseHexToken(css, "--olho-text-muted"),
    textLink: parseHexToken(css, "--olho-text-link"),
    accentPrimary: parseHexToken(css, "--olho-accent-primary"),
    textInverse: parseHexToken(css, "--olho-text-inverse"),
    selectedText: parseHexToken(css, "--olho-selected-text"),
    selectedBg: parseHexToken(css, "--olho-selected-bg"),
    successText: parseHexToken(css, "--olho-success-text"),
    successBg: parseHexToken(css, "--olho-success-bg"),
    warningText: parseHexToken(css, "--olho-warning-text"),
    warningBg: parseHexToken(css, "--olho-warning-bg"),
    dangerText: parseHexToken(css, "--olho-danger-text"),
    dangerBg: parseHexToken(css, "--olho-danger-bg"),
    infoText: parseHexToken(css, "--olho-info-text"),
    infoBg: parseHexToken(css, "--olho-info-bg"),
    recordingText: parseHexToken(css, "--olho-recording-text"),
    recordingBg: parseHexToken(css, "--olho-recording-bg"),
    disabledText: parseHexToken(css, "--olho-disabled-text"),
    disabledBg: parseHexToken(css, "--olho-disabled-bg"),
    focusRing: parseHexToken(css, "--olho-focus-ring"),
    borderMedium: parseHexToken(css, "--olho-border-medium")
  };

  for (const [name, value] of Object.entries(tokens)) {
    assert.ok(value, `Missing token value for ${name}`);
  }

  const pairs = [
    { label: "Primary text on app", ratio: contrastRatio(tokens.textPrimary, tokens.bgApp), min: 4.5 },
    { label: "Primary text on panel", ratio: contrastRatio(tokens.textPrimary, tokens.bgPanel), min: 4.5 },
    { label: "Secondary text on panel", ratio: contrastRatio(tokens.textSecondary, tokens.bgPanel), min: 4.5 },
    { label: "Muted text on panel", ratio: contrastRatio(tokens.textMuted, tokens.bgPanel), min: 4.5 },
    { label: "Link text on panel", ratio: contrastRatio(tokens.textLink, tokens.bgPanel), min: 4.5 },
    { label: "Card text on card background", ratio: contrastRatio(tokens.textPrimary, tokens.bgCard), min: 4.5 },
    { label: "Selected text on selected bg", ratio: contrastRatio(tokens.selectedText, tokens.selectedBg), min: 4.5 },
    { label: "Success text on success bg", ratio: contrastRatio(tokens.successText, tokens.successBg), min: 4.5 },
    { label: "Warning text on warning bg", ratio: contrastRatio(tokens.warningText, tokens.warningBg), min: 4.5 },
    { label: "Danger text on danger bg", ratio: contrastRatio(tokens.dangerText, tokens.dangerBg), min: 4.5 },
    { label: "Info text on info bg", ratio: contrastRatio(tokens.infoText, tokens.infoBg), min: 4.5 },
    { label: "Recording text on recording bg", ratio: contrastRatio(tokens.recordingText, tokens.recordingBg), min: 4.5 },
    { label: "Disabled text on disabled bg", ratio: contrastRatio(tokens.disabledText, tokens.disabledBg), min: 3.0 },
    { label: "Focus ring on panel", ratio: contrastRatio(tokens.focusRing, tokens.bgPanel), min: 3.0 },
    { label: "Border medium on panel", ratio: contrastRatio(tokens.borderMedium, tokens.bgPanel), min: 3.0 },
    {
      label: "Primary button text/background",
      ratio: contrastRatio(tokens.textInverse, tokens.accentPrimary),
      min: 4.5
    },
    {
      label: "Secondary button text/background",
      ratio: contrastRatio(tokens.textPrimary, tokens.bgCard),
      min: 4.5
    },
    {
      label: "Ghost button text/background",
      ratio: contrastRatio(tokens.textPrimary, tokens.bgPanel),
      min: 4.5
    }
  ];

  pairs.forEach((pair) => {
    assert.ok(pair.ratio >= pair.min, `${pair.label} is ${pair.ratio.toFixed(2)} below ${pair.min}`);
  });
});

test("violet remains accent, not default surface color family", async () => {
  const css = await fs.readFile(path.join(root, "src/shared/renaissance-theme.css"), "utf8");
  const bgPanel = parseHexToken(css, "--olho-bg-panel");
  const bgCard = parseHexToken(css, "--olho-bg-card");
  const bgSidebar = parseHexToken(css, "--olho-bg-sidebar");
  const accentPrimary = parseHexToken(css, "--olho-accent-primary");

  assert.ok(bgPanel && bgCard && bgSidebar && accentPrimary, "Missing key palette tokens");
  assert.notEqual(bgPanel, accentPrimary, "Panel surface must not be accent violet");
  assert.notEqual(bgCard, accentPrimary, "Card surface must not be accent violet");
  assert.notEqual(bgSidebar, accentPrimary, "Sidebar surface must not be accent violet");

  const oldPurpleSurfaceValues = new Set(["#12112b", "#141330", "#0d0c22"]);
  assert.equal(oldPurpleSurfaceValues.has(bgPanel), false, "Panel still uses old purple-heavy surface");
  assert.equal(oldPurpleSurfaceValues.has(bgCard), false, "Card still uses old purple-heavy surface");
  assert.equal(oldPurpleSurfaceValues.has(bgSidebar), false, "Sidebar still uses old purple-heavy surface");
});
