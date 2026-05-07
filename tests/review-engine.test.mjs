import test from "node:test";
import assert from "node:assert/strict";
import { runReviewEngine } from "../src/review/engine/review-engine.js";
import { REVIEW_RULES } from "../src/review/engine/rules/index.js";
import { contrastRatio } from "../src/review/utils/colour-utils.js";
import { visualWeight } from "../src/review/utils/visual-weight.js";
import { dedupeFindings } from "../src/review/findings/finding-dedupe.js";
import { sortReviewFindings } from "../src/review/findings/finding-sort.js";

function element(input) {
  return {
    selector: input.selector,
    role: input.role || "",
    tagName: input.tagName || "div",
    text: input.text || "",
    bounds: input.bounds,
    computedStyle: {
      fontSize: input.fontSize || 14,
      lineHeight: input.lineHeight || 21,
      fontWeight: input.fontWeight || 400,
      color: input.color || "#1f2933",
      backgroundColor: input.backgroundColor || "#ffffff",
      borderRadius: input.borderRadius || 4,
      boxShadow: input.boxShadow || "none",
      fontFamily: input.fontFamily || "Inter"
    },
    type: input.type,
    state: input.state
  };
}

function dashboardFixture() {
  return {
    itemId: "fixture-dashboard",
    screenshotRef: "media:fixture-dashboard",
    sourceType: "dom-metrics",
    viewport: { width: 1200, height: 800 },
    imageMetrics: { width: 1200, height: 800, sizeBytes: 420000, mimeType: "image/png" },
    elements: [
      element({
        selector: ".page-title",
        tagName: "h1",
        role: "heading",
        text: "Pipeline Review Dashboard",
        bounds: { x: 48, y: 42, width: 360, height: 30 },
        fontSize: 18,
        lineHeight: 24,
        fontWeight: 600
      }),
      element({
        selector: ".intro-copy",
        text: "Review weekly pipeline changes, stuck deals, forecast movements, customer risk indicators, renewal exposure, and operational follow-up tasks across the global revenue organisation in one dense workspace.",
        bounds: { x: 48, y: 86, width: 860, height: 42 },
        fontSize: 14,
        lineHeight: 16
      }),
      element({
        selector: ".primary-action",
        tagName: "button",
        role: "button",
        text: "Approve forecast",
        bounds: { x: 920, y: 46, width: 136, height: 38 },
        fontSize: 14,
        fontWeight: 600,
        backgroundColor: "#f8fafc",
        color: "#1f2933",
        borderRadius: 8,
        boxShadow: "0 8px 18px rgba(0,0,0,0.12)"
      }),
      element({
        selector: ".secondary-action",
        tagName: "button",
        role: "button",
        text: "Request changes",
        bounds: { x: 1068, y: 46, width: 136, height: 38 },
        fontSize: 14,
        fontWeight: 600,
        backgroundColor: "#f8fafc",
        color: "#1f2933",
        borderRadius: 8,
        boxShadow: "0 8px 18px rgba(0,0,0,0.12)"
      }),
      element({
        selector: ".tiny-link",
        tagName: "button",
        role: "button",
        text: "More",
        bounds: { x: 1140, y: 108, width: 34, height: 28 },
        fontSize: 11,
        backgroundColor: "#ffffff",
        color: "#687385"
      }),
      element({
        selector: ".low-contrast-note",
        text: "Updated just now",
        bounds: { x: 48, y: 138, width: 160, height: 18 },
        fontSize: 12,
        lineHeight: 16,
        color: "#b8c0cc",
        backgroundColor: "#ffffff"
      }),
      ...Array.from({ length: 28 }, (_, index) =>
        element({
          selector: `.metric-card-${index}`,
          type: "card",
          text: `Metric ${index + 1}`,
          bounds: {
            x: 48 + (index % 4) * 274 + (index % 3 === 0 ? 7 : 0),
            y: 190 + Math.floor(index / 4) * 72 + (index % 2 === 0 ? 3 : 0),
            width: 248,
            height: 58
          },
          fontSize: 13,
          lineHeight: 15,
          borderRadius: index % 4 === 0 ? 2 : index % 4 === 1 ? 8 : 18,
          boxShadow: index % 3 === 0 ? "0 12px 28px rgba(0,0,0,0.18)" : "0 2px 4px rgba(0,0,0,0.08)"
        })
      )
    ]
  };
}

test("review rule registry contains the enterprise milestone rule set", () => {
  assert.equal(REVIEW_RULES.length, 30);
  assert.equal(REVIEW_RULES.some((rule) => rule.id === "visual-hierarchy/competing-primary-actions"), true);
  assert.equal(REVIEW_RULES.some((rule) => rule.id === "responsive-layout/content-crush-on-narrow-viewport"), true);
});

test("colour contrast utility follows WCAG relative luminance expectations", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(contrastRatio("#b8c0cc", "#ffffff") < 4.5, true);
});

test("visual weight accounts for size, contrast, elevation, and position", () => {
  const context = { viewport: { width: 1200, height: 800 } };
  const strong = element({
    selector: ".strong",
    bounds: { x: 40, y: 40, width: 220, height: 64 },
    fontSize: 22,
    fontWeight: 700,
    color: "#000000",
    backgroundColor: "#ffffff",
    boxShadow: "0 16px 32px rgba(0,0,0,0.22)"
  });
  const weak = element({
    selector: ".weak",
    bounds: { x: 40, y: 620, width: 90, height: 24 },
    fontSize: 12,
    color: "#667085",
    backgroundColor: "#ffffff"
  });
  assert.equal(visualWeight(strong, context) > visualWeight(weak, context), true);
});

test("engine returns conservative image-only output without invented findings", () => {
  const result = runReviewEngine({
    itemId: "image-only",
    screenshotRef: "media:image-only",
    sourceType: "image-only",
    imageMetrics: { width: 1440, height: 900, sizeBytes: 512000, mimeType: "image/png" }
  });

  assert.equal(result.findings.length, 0);
  assert.equal(result.metadata.engineVersion, "1.0.0-enterprise");
  assert.equal(result.metadata.hasDomMetrics, false);
  assert.equal(result.metadata.ruleCount, 30);
  assert.equal(result.skippedRules.length, 30);
});

test("engine produces evidence-based findings with rich DOM metrics", () => {
  const result = runReviewEngine(dashboardFixture());
  const ids = result.findings.map((finding) => finding.id);

  assert.equal(result.metadata.hasDomMetrics, true);
  assert.equal(result.metadata.findingCount > 0, true);
  assert.equal(ids.some((id) => id.startsWith("visual-hierarchy/competing-primary-actions")), true);
  assert.equal(ids.some((id) => id.startsWith("accessibility-visible/low-contrast-risk")), true);
  assert.equal(ids.some((id) => id.startsWith("accessibility-visible/small-touch-targets")), true);

  result.findings.forEach((finding) => {
    assert.equal(finding.source, "rule-engine");
    assert.equal(typeof finding.evidence, "string");
    assert.equal(finding.evidence.length > 20, true);
    assert.equal(finding.confidence >= 0 && finding.confidence <= 1, true);
  });
});

test("finding dedupe and sort keep higher-signal overlapping findings", () => {
  const low = {
    id: "low",
    category: "ux",
    severity: "low",
    confidence: 0.7,
    region: "A",
    issue: "Overcrowded region.",
    selector: ".a",
    regionBounds: { x: 0, y: 10, width: 40, height: 20 }
  };
  const high = {
    ...low,
    id: "high",
    severity: "high",
    confidence: 0.8,
    regionBounds: { x: 2, y: 11, width: 38, height: 18 }
  };
  const later = {
    ...low,
    id: "later",
    category: "visual-hierarchy",
    severity: "critical",
    regionBounds: { x: 0, y: 90, width: 40, height: 20 }
  };

  const deduped = dedupeFindings([low, high, later]);
  assert.equal(deduped.some((finding) => finding.id === "high"), true);
  assert.equal(deduped.some((finding) => finding.id === "low"), false);
  assert.equal(sortReviewFindings(deduped)[0].id, "high");
});

test("engine stays within the local performance budget for dashboard metrics", () => {
  const runs = 30;
  const started = performance.now();
  for (let index = 0; index < runs; index += 1) {
    runReviewEngine(dashboardFixture());
  }
  const averageMs = (performance.now() - started) / runs;
  assert.equal(averageMs < 800, true);
});
