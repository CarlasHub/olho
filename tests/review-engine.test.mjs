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

function cleanFixture() {
  return {
    itemId: "fixture-clean",
    screenshotRef: "media:fixture-clean",
    sourceType: "dom-metrics",
    viewport: { width: 1280, height: 900 },
    imageMetrics: { width: 1280, height: 900, sizeBytes: 380000, mimeType: "image/png" },
    elements: [
      element({
        selector: ".page-title",
        tagName: "h1",
        role: "heading",
        text: "Run operational reviews with calm, structured confidence.",
        bounds: { x: 88, y: 156, width: 620, height: 104 },
        fontSize: 48,
        lineHeight: 52,
        fontWeight: 800,
        color: "#111827",
        backgroundColor: "#ffffff",
        borderRadius: 0
      }),
      element({
        selector: ".lede",
        tagName: "p",
        text: "A focused workspace for teams that need traceable decisions, readable status, and clear next actions without dashboard noise.",
        bounds: { x: 88, y: 282, width: 600, height: 56 },
        fontSize: 18,
        lineHeight: 28,
        color: "#4b5c6b",
        backgroundColor: "#ffffff",
        borderRadius: 0
      }),
      element({
        selector: ".primary",
        tagName: "a",
        role: "link",
        text: "Start review",
        bounds: { x: 88, y: 366, width: 128, height: 46 },
        fontSize: 16,
        lineHeight: 22,
        fontWeight: 800,
        color: "#ffffff",
        backgroundColor: "#0f766e",
        borderRadius: 10
      }),
      element({
        selector: ".secondary",
        tagName: "a",
        role: "link",
        text: "View workflow",
        bounds: { x: 228, y: 366, width: 142, height: 46 },
        fontSize: 16,
        lineHeight: 22,
        fontWeight: 800,
        color: "#243241",
        backgroundColor: "#ffffff",
        borderRadius: 10
      }),
      ...[0, 1, 2].map((index) =>
        element({
          selector: `.card-${index}`,
          type: "card",
          text: ["Readable by default", "Consistent components", "Action-led review"][index],
          bounds: { x: 88 + index * 276, y: 560, width: 252, height: 168 },
          fontSize: 18,
          lineHeight: 26,
          fontWeight: 700,
          color: "#17212b",
          backgroundColor: "#ffffff",
          borderRadius: 16,
          boxShadow: "none"
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

test("engine uses measured local OCR contrast evidence for image-only accessibility-visible findings", () => {
  const result = runReviewEngine({
    itemId: "image-only-contrast",
    screenshotRef: "media:image-only-contrast",
    sourceType: "static-design",
    imageMetrics: { width: 960, height: 540, sizeBytes: 512000, mimeType: "image/png" },
    visualAnalysis: {
      evidence: {
        ocrContrastResults: [
          {
            id: "ocr-contrast-1",
            text: "Muted hero copy",
            textRegionId: "ocr-text-1",
            region: '"Muted hero copy"',
            bounds: { x: 12, y: 18, width: 42, height: 8 },
            contrastRatio: 2.72,
            evidence:
              "Local OCR detected text in this region and local pixel analysis measured approximately 2.72:1 foreground/background contrast.",
            evidence_type: "measured_evidence"
          }
        ],
        lowContrastTextLikeRegions: [],
        contrastPairs: [],
        colourPalette: []
      }
    }
  });
  const lowContrast = result.findings.find((finding) => finding.id.startsWith("accessibility-visible/low-contrast-risk"));

  assert.equal(result.metadata.hasLocalVisualAnalysis, true);
  assert.equal(Boolean(lowContrast), true);
  assert.equal(lowContrast.evidenceType, "measured");
  assert.equal(lowContrast.markerType, "accessibility-risk");
  assert.equal(lowContrast.regionBounds.x, 12);
  assert.equal(lowContrast.issue.includes("difficult to read"), true);
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
    assert.equal(typeof finding.bestPracticeReference, "string");
    assert.equal(finding.bestPracticeReference.length > 20, true);
    assert.equal(typeof finding.reviewRationale, "string");
    assert.equal(typeof finding.affectedUsers, "string");
    assert.equal(typeof finding.suggestedPriority, "string");
    assert.equal(typeof finding.markerSummary, "string");
    assert.equal(Array.isArray(finding.acceptanceCriteria), true);
    assert.equal(finding.acceptanceCriteria.length >= 3, true);
    assert.equal(
      ["section", "component-group", "text-region", "action", "accessibility-risk", "composition"].includes(
        finding.markerType
      ),
      true
    );
    assert.equal(finding.confidence >= 0 && finding.confidence <= 1, true);
    assert.equal(typeof finding.regionBounds?.x, "number");
    assert.equal(typeof finding.regionBounds?.y, "number");
    assert.equal(finding.regionBounds.width > 0, true);
    assert.equal(finding.regionBounds.height > 0, true);
  });
  assert.equal(result.metadata.reviewDepth, "standard");
  assert.equal(result.metadata.reviewIndicators.visualHierarchy.length > 0, true);
  assert.equal(result.metadata.screenComprehension.screenType.length > 0, true);
  assert.equal(result.metadata.synthesisSummary.includes("Synthesised"), true);
  assert.equal(result.findings.some((finding) => finding.isSynthesisFinding), true);
});

test("clean baseline remains conservative with no high-severity findings", () => {
  const result = runReviewEngine(cleanFixture());

  assert.equal(result.findings.length <= 5, true);
  assert.equal(result.findings.some((finding) => ["critical", "high"].includes(finding.severity)), false);
});

test("review depth controls finding count without fabricating unsupported findings", () => {
  const quick = runReviewEngine({ ...dashboardFixture(), reviewDepth: "quick" });
  const standard = runReviewEngine({ ...dashboardFixture(), reviewDepth: "standard" });
  const deep = runReviewEngine({ ...dashboardFixture(), reviewDepth: "deep" });

  assert.equal(quick.metadata.reviewDepth, "quick");
  assert.equal(quick.findings.length <= 5, true);
  assert.equal(standard.findings.length <= 10, true);
  assert.equal(deep.findings.length <= 20, true);
  assert.equal(deep.findings.length >= standard.findings.length, true);
  assert.equal(quick.findings.every((finding) => finding.source === "rule-engine"), true);
});

test("synthesis creates broad section-level reviewer findings when evidence supports it", () => {
  const result = runReviewEngine({ ...dashboardFixture(), reviewDepth: "deep" });
  const synthesis = result.findings.filter((finding) => finding.isSynthesisFinding);

  assert.equal(synthesis.length > 0, true);
  assert.equal(synthesis.some((finding) => finding.markerType === "section" || finding.markerType === "composition"), true);
  assert.equal(synthesis.some((finding) => finding.bestPracticeReference.includes("Visual hierarchy")), true);
  assert.equal(result.metadata.reviewPasses.some((pass) => pass.passId === "synthesis" && pass.status === "completed"), true);
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
  assert.equal(sortReviewFindings(deduped)[0].id, "later");
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
