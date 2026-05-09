import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildOverlayMarkers, findingBoundsToPageRect } from "../src/review/capture/review-screenshot-coordinates.js";
import { buildReviewReport } from "../src/review/reports/review-report-builder.js";
import { detectReviewTarget } from "../src/review/targeting/review-target-detector.js";
import { filterElementsForTarget } from "../src/review/targeting/target-region-model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

async function read(relPath) {
  return fs.readFile(path.join(root, relPath), "utf8");
}

test("side panel review surfaces are included in manifest and build copy list", async () => {
  const manifest = JSON.parse(await read("manifest.json"));
  const build = await read("scripts/build.mjs");
  const html = await read("sidepanel.html");
  const js = await read("sidepanel.js");
  const controller = await read("src/review/sidepanel/sidepanel-controller.js");

  assert.equal(manifest.side_panel.default_path, "sidepanel.html");
  assert.equal(manifest.permissions.includes("sidePanel"), true);
  assert.equal(build.includes('"sidepanel.html"'), true);
  assert.equal(build.includes('"sidepanel.js"'), true);
  assert.equal(build.includes('"sidepanel.css"'), true);
  assert.equal(html.includes("Review Visible View"), true);
  assert.equal(html.includes("Review Design Area Only"), true);
  assert.equal(html.includes("Review Full Page"), true);
  assert.equal(html.includes("Export HTML"), true);
  assert.equal(html.includes("Export Markdown"), true);
  assert.equal(html.includes("Export JSON"), true);
  assert.equal(html.includes('id="selectReviewAreaBtn" type="button" hidden'), true);
  assert.equal(html.includes("Local AI Reviewer"), true);
  assert.equal(html.includes("Run Ollama Review"), true);
  assert.equal(html.includes("Capability: not checked"), true);
  assert.equal(html.includes("Understanding"), true);
  assert.equal(html.includes("Synthesis"), true);
  assert.equal(js.includes("createSidepanelController"), true);
  assert.equal(controller.includes("ensureInstalledOllamaModel"), true);
  assert.equal(controller.includes("Selected installed model"), true);
  assert.equal(controller.includes("Select an installed Ollama model before running review"), true);
  assert.equal(controller.includes("Could not detect installed Ollama models"), true);
  assert.equal(controller.includes(".catch(() => ({ config, capability: aiCapability }))"), false);
});

test("Zeplin and Figma tabs default to central design-area review targets", () => {
  const viewport = { width: 1440, height: 900, scrollX: 0, scrollY: 0 };
  const elements = [
    { selector: ".left-toolbar", bounds: { x: 0, y: 0, width: 220, height: 900 } },
    { selector: ".right-specs", bounds: { x: 1180, y: 0, width: 260, height: 900 } },
    { selector: ".screen-artboard", type: "frame", bounds: { x: 340, y: 120, width: 700, height: 620 } }
  ];

  const zeplin = detectReviewTarget({
    tab: { url: "https://app.zeplin.io/project/screen", title: "Checkout - Zeplin" },
    metrics: { viewport, elements },
    mode: "visible-view"
  });
  const figma = detectReviewTarget({
    tab: { url: "https://www.figma.com/file/example", title: "Checkout - Figma" },
    metrics: { viewport, elements },
    mode: "visible-view"
  });

  assert.equal(zeplin.source.sourceType, "zeplin-capture");
  assert.equal(zeplin.target.type, "central-design-artboard");
  assert.equal(zeplin.target.excludesPageChrome, true);
  assert.equal(figma.source.sourceType, "figma-capture");
  assert.equal(figma.target.type, "central-design-artboard");
  assert.equal(figma.target.excludesPageChrome, true);
});

test("design-area target filtering excludes editor sidebars and keeps central artboard metrics", () => {
  const viewport = { width: 1440, height: 900, scrollX: 0, scrollY: 0 };
  const elements = [
    { selector: ".zeplin-sidebar", bounds: { x: 0, y: 0, width: 240, height: 900 } },
    { selector: ".client-design-frame", type: "frame", bounds: { x: 360, y: 120, width: 680, height: 620 } },
    { selector: ".zeplin-spec-panel", bounds: { x: 1160, y: 0, width: 280, height: 900 } }
  ];
  const { target } = detectReviewTarget({
    tab: { url: "https://app.zeplin.io/project/screen", title: "Zeplin screen" },
    metrics: { viewport, elements },
    mode: "design-area-only"
  });
  const filtered = filterElementsForTarget(elements, target);

  assert.deepEqual(filtered.map((element) => element.selector), [".client-design-frame"]);
});

test("coordinate mapping converts finding percent bounds into page overlay rectangles", () => {
  const viewport = { width: 1000, height: 800, scrollX: 0, scrollY: 320 };
  const finding = {
    id: "finding-1",
    severity: "high",
    category: "visual-hierarchy",
    issue: "Primary action is unclear.",
    evidence: "Two actions share visual weight.",
    regionBounds: { x: 10, y: 20, width: 30, height: 10 }
  };

  const rect = findingBoundsToPageRect(finding, viewport);
  assert.deepEqual(
    {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    { x: 100, y: 480, width: 300, height: 80 }
  );

  const markers = buildOverlayMarkers([finding], viewport);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].rect.y, 480);
  assert.deepEqual(markers[0].anchor, { x: 250, y: 520 });
  assert.match(markers[0].label, /high visual-hierarchy/i);
  assert.equal(markers[0].markerType, "component-group");
});

test("overlay markers prefer concrete selector bounds over broad finding regions", () => {
  const viewport = { width: 1000, height: 800, scrollX: 0, scrollY: 120 };
  const finding = {
    id: "finding-selector",
    severity: "medium",
    category: "ux",
    selector: ".primary-cta",
    issue: "The action path is unclear.",
    evidence: "The primary action competes with adjacent content.",
    regionBounds: { x: 0, y: 0, width: 100, height: 100 }
  };
  const elements = [
    {
      selector: ".primary-cta",
      bounds: { x: 420, y: 220, width: 120, height: 44 }
    }
  ];

  const [marker] = buildOverlayMarkers([finding], viewport, { elements });

  assert.deepEqual(
    {
      x: marker.rect.x,
      y: marker.rect.y,
      width: marker.rect.width,
      height: marker.rect.height
    },
    { x: 420, y: 340, width: 120, height: 44 }
  );
  assert.deepEqual(marker.anchor, { x: 480, y: 362 });
});

test("design-area markers are clamped to the selected artboard and never land in editor chrome", () => {
  const viewport = { width: 1440, height: 900, scrollX: 0, scrollY: 0 };
  const target = {
    type: "central-design-artboard",
    excludesPageChrome: true,
    bounds: { x: 340, y: 120, width: 760, height: 620 }
  };
  const finding = {
    id: "finding-artboard",
    severity: "high",
    category: "visual-hierarchy",
    issue: "The artboard hierarchy is unclear.",
    evidence: "The main content competes with the action area.",
    regionBounds: { x: 0, y: 0, width: 100, height: 100 }
  };

  const [marker] = buildOverlayMarkers([finding], viewport, { target });

  assert.ok(marker.rect.x >= target.bounds.x);
  assert.ok(marker.rect.y >= target.bounds.y);
  assert.ok(marker.rect.x + marker.rect.width <= target.bounds.x + target.bounds.width);
  assert.ok(marker.rect.y + marker.rect.height <= target.bounds.y + target.bounds.height);
  assert.ok(marker.anchor.x >= target.bounds.x);
  assert.ok(marker.anchor.x <= target.bounds.x + target.bounds.width);
});

test("overlapping marker payloads receive distinct anchors", () => {
  const viewport = { width: 1000, height: 800, scrollX: 0, scrollY: 0 };
  const findings = [1, 2, 3].map((number) => ({
    id: `finding-${number}`,
    severity: "medium",
    category: "ux",
    issue: `Issue ${number}`,
    evidence: "Shared region evidence.",
    regionBounds: { x: 20, y: 20, width: 40, height: 20 }
  }));

  const markers = buildOverlayMarkers(findings, viewport);
  const anchors = markers.map((marker) => `${Math.round(marker.anchor.x)}:${Math.round(marker.anchor.y)}`);

  assert.equal(new Set(anchors).size, 3);
});

test("grouped marker payloads preserve professional reviewer fields", () => {
  const viewport = { width: 1200, height: 900, scrollX: 0, scrollY: 0 };
  const finding = {
    id: "synthesis/layout-composition:abc",
    severity: "medium",
    category: "ux",
    region: "Screen composition",
    issue: "The composition relies on too many competing groups.",
    evidence: "Several proximity groups were detected.",
    impact: "Users may need longer to scan the screen.",
    recommendation: "Consolidate related content into clearer regions.",
    confidence: 0.76,
    source: "rule-engine",
    markerType: "composition",
    markerSummary: "Composition rhythm",
    regionBounds: { x: 8, y: 10, width: 82, height: 70 }
  };

  const [marker] = buildOverlayMarkers([finding], viewport);

  assert.equal(marker.markerType, "composition");
  assert.equal(marker.markerSummary, "Composition rhythm");
  assert.equal(marker.impact, finding.impact);
  assert.equal(marker.recommendation, finding.recommendation);
});

test("live overlay content supports marker rendering, selection, clearing, and marker-selected routing", async () => {
  const markerLayer = await read("src/review/overlay/overlay-marker-layer.js");
  const router = await read("src/review/overlay/overlay-message-router.js");
  const content = await read("src/review/overlay/live-overlay-content.js");
  const actions = await read("src/review/sidepanel/sidepanel-actions.js");
  const styles = await read("src/review/overlay/overlay-styles.css");

  assert.equal(markerLayer.includes("olho-live-marker"), true);
  assert.equal(markerLayer.includes("coordinateSpace"), true);
  assert.equal(markerLayer.includes("toViewportPoint"), true);
  assert.equal(markerLayer.includes("positionPopoverNearMarker"), true);
  assert.equal(markerLayer.includes("getBoundingClientRect"), true);
  assert.equal(markerLayer.includes("renderSelectedRegion"), true);
  assert.equal(markerLayer.includes("return [pin];"), true);
  assert.equal(styles.includes("position: fixed"), true);
  assert.equal(styles.includes("inset: 0"), true);
  assert.equal(markerLayer.includes("olho_live_review_marker_selected"), true);
  assert.equal(router.includes("olho_live_review_render_markers"), true);
  assert.equal(router.includes("olho_live_review_clear_markers"), true);
  assert.equal(router.includes("clearHighlight()"), true);
  const renderBranch = router.slice(
    router.indexOf('type === "olho_live_review_render_markers"'),
    router.indexOf('type === "olho_live_review_clear_markers"')
  );
  assert.equal(renderBranch.includes("highlightTarget(payload.target)"), false);
  assert.equal(router.includes("olho_live_review_select_marker"), true);
  assert.equal(content.includes("olho_live_review_overlay_ready"), true);
  assert.equal(actions.includes("openFallbackReviewTab"), true);
  assert.equal(actions.includes("src/review/overlay/live-overlay-content.js"), true);
});

test("reports preserve side-panel target metadata", () => {
  const report = buildReviewReport({
    itemId: "live:1",
    title: "Live review",
    reviewMode: "side-panel-live-review",
    reviewTarget: {
      type: "central-design-artboard",
      label: "Zeplin design area",
      bounds: { x: 240, y: 80, width: 900, height: 700 },
      excludesPageChrome: true
    },
    media: { width: 1440, height: 900 },
    engineMetadata: { sourceType: "zeplin-capture", engineVersion: "1.0.0-enterprise" },
    findings: []
  });

  assert.equal(report.metadata.reviewMode, "Side panel live visual review");
  assert.equal(report.metadata.targetType, "central-design-artboard");
  assert.equal(report.metadata.targetLabel, "Zeplin design area");
  assert.equal(report.metadata.designAreaIsolationUsed, true);
  assert.equal(report.sourceMetadata.reviewTarget.excludesPageChrome, true);
});
