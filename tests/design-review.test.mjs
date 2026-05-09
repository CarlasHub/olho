import test from "node:test";
import assert from "node:assert/strict";

import { buildDesignImportMetadata } from "../src/review/design/design-import-controller.js";
import {
  detectCentralDesignArea,
  elementCenterWithinArea,
  filterMetricsForDesignArea
} from "../src/review/design/design-area-detector.js";
import { designReviewGuidanceForSource, designReviewNotice } from "../src/review/design/design-review-guidance.js";
import { DESIGN_REVIEW_LIMITATIONS } from "../src/review/design/design-review-limitations.js";
import { reviewModeBadge } from "../src/review/design/design-review-mode.js";
import { detectDesignSource } from "../src/review/design/design-source-detector.js";
import { createReviewContext } from "../src/review/engine/review-context.js";
import { runReviewEngine } from "../src/review/engine/review-engine.js";
import { buildReviewReport } from "../src/review/reports/review-report-builder.js";

function designFile(name = "checkout-figma-frame.png") {
  return new File(["design-bytes"], name, { type: "image/png" });
}

test("design source detector identifies Zeplin, Figma, imported design, and static design sources conservatively", () => {
  assert.equal(
    detectDesignSource({ metadata: { sourceUrl: "app.zeplin.io/project/screen" } }).sourceType,
    "zeplin-capture"
  );
  assert.equal(
    detectDesignSource({ metadata: { sourceUrl: "https://zeplin.io/project/screen" } }).sourceType,
    "zeplin-capture"
  );
  assert.equal(detectDesignSource({ metadata: { sourceUrl: "figma.com/file/frame" } }).sourceType, "figma-capture");
  assert.equal(detectDesignSource({ filename: "checkout-zeplin-export.png" }).sourceType, "design-import");
  assert.equal(
    detectDesignSource({
      media: { type: "image", mimeType: "image/png", metadata: { title: "Plain mockup" } },
      hasDomMetrics: false
    }).sourceType,
    "static-design"
  );
});

test("design import metadata stays local and marks the image for review without schema changes", async () => {
  const metadata = await buildDesignImportMetadata(designFile());

  assert.equal(metadata.designReview, true);
  assert.equal(metadata.isDesignScreen, true);
  assert.equal(metadata.importedForReview, true);
  assert.equal(metadata.reviewSourceType, "design-import");
  assert.equal(metadata.designPlatform, "figma");
  assert.equal(metadata.sourceType, "local-import");
  assert.deepEqual(metadata.tags, ["design-review"]);
});

test("review context exposes design and image-only metadata flags", () => {
  const context = createReviewContext({
    itemId: "design-screen",
    media: {
      type: "image",
      metadata: {
        title: "Imported design",
        reviewSourceType: "design-import",
        designReview: true
      }
    },
    imageMetrics: { width: 1440, height: 900, mimeType: "image/png" }
  });

  assert.equal(context.sourceType, "design-import");
  assert.equal(context.isDesignScreen, true);
  assert.equal(context.isImageOnly, true);
  assert.equal(context.hasDomMetrics, false);
  assert.equal(context.hasComputedStyles, false);
  assert.equal(context.hasTextMetrics, false);
  assert.equal(context.hasInteractiveElements, false);
  assert.equal(context.hasDesignMetadata, true);
});

test("deterministic engine skips DOM-only rules safely for design imports", () => {
  const result = runReviewEngine({
    itemId: "design-screen",
    sourceType: "design-import",
    media: {
      type: "image",
      metadata: {
        reviewSourceType: "design-import",
        designReview: true
      }
    },
    imageMetrics: { width: 1440, height: 900, mimeType: "image/png" }
  });

  assert.equal(result.findings.length, 0);
  assert.equal(result.metadata.sourceType, "design-import");
  assert.equal(result.metadata.isDesignScreen, true);
  assert.equal(result.metadata.isImageOnly, true);
  assert.equal(result.skippedRules.length, 30);
});

test("design guidance and badges are source-specific", () => {
  assert.equal(reviewModeBadge("figma-capture").label, "Figma frame review");
  assert.equal(reviewModeBadge("zeplin-capture").label, "Zeplin screen review");
  assert.equal(designReviewNotice("design-import").includes("visible interface only"), true);
  assert.equal(designReviewGuidanceForSource("figma-capture").some((line) => line.includes("Export the full Figma frame")), true);
  assert.equal(designReviewGuidanceForSource("zeplin-capture").some((line) => line.includes("Zeplin screen")), true);
});

test("reports include design review limitations for design screenshots", () => {
  const report = buildReviewReport({
    itemId: "design-report",
    title: "Checkout design",
    screenshotRef: "media:design-report",
    readOnly: true,
    media: { width: 1440, height: 900, mimeType: "image/png" },
    engineMetadata: {
      engineVersion: "1.0.0-enterprise",
      sourceType: "design-import",
      hasDomMetrics: false,
      isImageOnly: true,
      isDesignScreen: true
    },
    designReview: {
      sourceType: "design-import",
      isDesignScreen: true,
      isImageOnly: true
    },
    findings: []
  });

  assert.equal(report.metadata.isDesignReview, true);
  assert.equal(report.metadata.reviewMode, "Fallback design screenshot review");
  assert.equal(report.limitations.some((line) => line.includes("visual review, not a live implementation audit")), true);
  assert.equal(DESIGN_REVIEW_LIMITATIONS.length > 0, true);
});

test("central design area detection focuses Zeplin/Figma review on the canvas region", () => {
  const viewport = { width: 1440, height: 900 };
  const elements = [
    { selector: ".figma-left-panel", bounds: { x: 0, y: 0, width: 220, height: 900 } },
    { selector: ".figma-properties-panel", bounds: { x: 1180, y: 0, width: 260, height: 900 } },
    { selector: ".figma-canvas-frame", type: "frame", bounds: { x: 320, y: 110, width: 720, height: 620 } }
  ];
  const area = detectCentralDesignArea({
    sourceType: "figma-capture",
    elements,
    viewport,
    image: viewport
  });

  assert.equal(area.reason.includes("central") || area.reason.includes("artboard"), true);
  assert.equal(elementCenterWithinArea(elements[2], area.bounds, viewport), true);
  assert.equal(elementCenterWithinArea(elements[0], area.bounds, viewport), false);

  const filtered = filterMetricsForDesignArea({ elements, viewport, image: viewport }, area);
  assert.equal(filtered.elements.length, 1);
  assert.equal(filtered.elements[0].selector, ".figma-canvas-frame");
});

test("Zeplin design-area detection rejects oversized editor-stage containers", () => {
  const viewport = { width: 2106, height: 1118 };
  const elements = [
    { selector: ".zeplin-left-utility", bounds: { x: 0, y: 0, width: 420, height: 1118 } },
    { selector: ".zeplin-stage-shell", type: "canvas", bounds: { x: 490, y: 250, width: 1420, height: 720 } },
    { selector: ".client-artboard", type: "frame", bounds: { x: 635, y: 295, width: 885, height: 790 } },
    { selector: ".zeplin-right-specs", bounds: { x: 1765, y: 230, width: 320, height: 840 } }
  ];

  const area = detectCentralDesignArea({
    sourceType: "zeplin-capture",
    elements,
    viewport,
    image: viewport
  });

  assert.equal(elementCenterWithinArea(elements[2], area.bounds, viewport), true);
  assert.equal(elementCenterWithinArea(elements[3], area.bounds, viewport), false);
  assert.equal(area.bounds.x > 20, true);
  assert.equal(area.bounds.x + area.bounds.width < 82, true);
});
