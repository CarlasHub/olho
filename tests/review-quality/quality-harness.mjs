import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runReviewEngine } from "../../src/review/engine/review-engine.js";
import {
  buildOverlayMarkers,
  findingBoundsToPageRect
} from "../../src/review/capture/review-screenshot-coordinates.js";
import { buildReviewReport } from "../../src/review/reports/review-report-builder.js";
import { filterElementsForTarget, normalizeBounds } from "../../src/review/targeting/target-region-model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "..");
const expectedDir = path.join(root, "tests/review-benchmarks/expected-findings");
const prioritiesPath = path.join(root, "tests/review-benchmarks/expected-priorities/all-priorities.json");

export const SCORE_LABELS = Object.freeze(["Strong", "Mostly strong", "Needs attention", "Weak"]);

export const BENCHMARK_IDS = Object.freeze([
  "marketing-hero",
  "saas-dashboard",
  "dense-admin-panel",
  "onboarding-form",
  "pricing-page",
  "mobile-app-mockup",
  "zeplin-artboard",
  "figma-frame",
  "typography-editorial",
  "cluttered-anti-pattern",
  "accessibility-visible-failure",
  "inconsistent-design-system"
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadExpectedFindings(id) {
  return readJson(path.join(expectedDir, `${id}.json`));
}

export function loadExpectedPriorities() {
  return readJson(prioritiesPath);
}

function style(input = {}) {
  return {
    fontSize: input.fontSize ?? 14,
    lineHeight: input.lineHeight ?? Math.round((input.fontSize ?? 14) * 1.45),
    fontWeight: input.fontWeight ?? 400,
    color: input.color || "#1f2937",
    backgroundColor: input.backgroundColor || "#ffffff",
    borderRadius: input.borderRadius ?? 8,
    boxShadow: input.boxShadow || "none",
    fontFamily: input.fontFamily || "Inter",
    outline: input.outline || "none"
  };
}

function element(input = {}) {
  return {
    selector: input.selector,
    role: input.role || "",
    tagName: input.tagName || "div",
    text: input.text || "",
    bounds: input.bounds,
    computedStyle: style(input),
    type: input.type || "",
    state: input.state || {}
  };
}

function metricCard(index, overrides = {}) {
  return element({
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
    boxShadow: index % 3 === 0 ? "0 12px 28px rgba(0,0,0,0.18)" : "0 2px 4px rgba(0,0,0,0.08)",
    ...overrides
  });
}

function benchmarkBase(id, overrides = {}) {
  return {
    itemId: `benchmark-${id}`,
    screenshotRef: `benchmark:${id}`,
    sourceType: "dom-metrics",
    viewport: { width: 1280, height: 900, scrollX: 0, scrollY: 0 },
    imageMetrics: { width: 1280, height: 900, sizeBytes: 420000, mimeType: "image/png" },
    reviewDepth: overrides.reviewDepth || "deep",
    elements: [],
    ...overrides
  };
}

function marketingHero() {
  return benchmarkBase("marketing-hero", {
    elements: [
      element({ selector: ".hero-title", tagName: "h1", role: "heading", text: "Operate every launch from one connected workspace", bounds: { x: 92, y: 182, width: 510, height: 92 }, fontSize: 42, lineHeight: 46, fontWeight: 800 }),
      element({ selector: ".hero-copy", tagName: "p", text: "Plan releases, review design quality, align stakeholders, track risks, and prepare teams.", bounds: { x: 92, y: 298, width: 540, height: 56 }, fontSize: 16, lineHeight: 21, color: "#6f7d84", backgroundColor: "#eef7f4" }),
      element({ selector: ".primary-cta", tagName: "button", role: "button", text: "Start review", bounds: { x: 92, y: 390, width: 132, height: 44 }, fontSize: 15, fontWeight: 800, color: "#ffffff", backgroundColor: "#d8293f", borderRadius: 999 }),
      element({ selector: ".secondary-cta", tagName: "button", role: "button", text: "Explore workflow", bounds: { x: 238, y: 390, width: 166, height: 44 }, fontSize: 15, fontWeight: 800, color: "#17202a", backgroundColor: "#dfe8ea", borderRadius: 999, boxShadow: "0 10px 30px rgba(0,0,0,.14)" }),
      element({ selector: ".hero-visual", type: "media", bounds: { x: 680, y: 130, width: 500, height: 460 }, backgroundColor: "#0d5572", borderRadius: 36, boxShadow: "0 24px 60px rgba(16,74,72,.18)" })
    ]
  });
}

function saasDashboard() {
  return benchmarkBase("saas-dashboard", {
    viewport: { width: 1200, height: 800, scrollX: 0, scrollY: 0 },
    imageMetrics: { width: 1200, height: 800, sizeBytes: 420000, mimeType: "image/png" },
    elements: [
      element({ selector: ".page-title", tagName: "h1", role: "heading", text: "Pipeline Review Dashboard", bounds: { x: 48, y: 42, width: 360, height: 30 }, fontSize: 18, lineHeight: 24, fontWeight: 600 }),
      element({ selector: ".intro-copy", tagName: "p", text: "Review weekly pipeline changes, stuck deals, forecast movements, customer risk indicators, renewal exposure, and operational follow-up tasks across the global revenue organisation.", bounds: { x: 48, y: 86, width: 860, height: 42 }, fontSize: 14, lineHeight: 16 }),
      element({ selector: ".primary-action", tagName: "button", role: "button", text: "Approve forecast", bounds: { x: 920, y: 46, width: 136, height: 38 }, fontSize: 14, fontWeight: 600, backgroundColor: "#f8fafc", boxShadow: "0 8px 18px rgba(0,0,0,0.12)" }),
      element({ selector: ".secondary-action", tagName: "button", role: "button", text: "Request changes", bounds: { x: 1068, y: 46, width: 136, height: 38 }, fontSize: 14, fontWeight: 600, backgroundColor: "#f8fafc", boxShadow: "0 8px 18px rgba(0,0,0,0.12)" }),
      ...Array.from({ length: 28 }, (_, index) => metricCard(index))
    ]
  });
}

function denseAdminPanel() {
  return benchmarkBase("dense-admin-panel", {
    viewport: { width: 1440, height: 900, scrollX: 0, scrollY: 0 },
    imageMetrics: { width: 1440, height: 900, sizeBytes: 520000, mimeType: "image/png" },
    elements: [
      element({ selector: ".left-nav", type: "region", text: "Users Roles Policies Integrations Billing Logs Alerts", bounds: { x: 0, y: 0, width: 230, height: 900 }, fontSize: 12 }),
      element({ selector: ".admin-title", tagName: "h1", role: "heading", text: "Workspace Administration", bounds: { x: 252, y: 18, width: 340, height: 24 }, fontSize: 16, lineHeight: 20, fontWeight: 700 }),
      ...Array.from({ length: 6 }, (_, index) => element({ selector: `.filter-${index}`, role: index > 2 ? "button" : "", tagName: index > 2 ? "button" : "input", text: index > 2 ? ["Apply", "Reset", "Export"][index - 3] : "", bounds: { x: 252 + index * 142, y: 54, width: 132, height: 28 }, fontSize: 12 })),
      ...Array.from({ length: 20 }, (_, index) => element({ selector: `.admin-tile-${index}`, type: "card", text: `Administrative metric ${index}`, bounds: { x: 252 + (index % 5) * 174 + (index % 2 ? 5 : 0), y: 104 + Math.floor(index / 5) * 96, width: 160, height: 84 }, fontSize: 12, lineHeight: 14, borderRadius: index % 3 === 0 ? 4 : 12, boxShadow: "0 2px 8px rgba(0,0,0,.08)" })),
      element({ selector: ".right-activity", type: "region", text: "Recent activity compact rows", bounds: { x: 1160, y: 0, width: 280, height: 900 }, fontSize: 12 })
    ]
  });
}

function onboardingForm() {
  return benchmarkBase("onboarding-form", {
    elements: [
      element({ selector: ".form-title", tagName: "h1", role: "heading", text: "Set up your workspace", bounds: { x: 260, y: 80, width: 420, height: 40 }, fontSize: 28, fontWeight: 800 }),
      ...["Company name", "Team size", "Primary workflow"].map((label, index) => element({ selector: `.field-${index}`, tagName: "input", text: label, bounds: { x: 260, y: 178 + index * 78, width: 560, height: 36 }, fontSize: 14 })),
      element({ selector: ".error", type: "error", text: "Required", bounds: { x: 260, y: 218, width: 78, height: 16 }, fontSize: 12, color: "#d65f5f", backgroundColor: "#ffffff" }),
      element({ selector: ".skip", tagName: "button", role: "button", text: "Skip for now", bounds: { x: 260, y: 454, width: 128, height: 38 }, fontSize: 14, fontWeight: 700, backgroundColor: "#ffffff" }),
      element({ selector: ".continue", tagName: "button", role: "button", text: "Continue", bounds: { x: 692, y: 454, width: 128, height: 38 }, fontSize: 14, fontWeight: 700, backgroundColor: "#ffffff" })
    ]
  });
}

function pricingPage() {
  const cards = [0, 1, 2].flatMap((index) => {
    const x = 90 + index * 370;
    return [
      element({ selector: `.plan-${index}`, type: "card", text: ["Starter", "Growth", "Enterprise"][index], bounds: { x, y: 160, width: 330, height: 390 }, fontSize: 16, borderRadius: index === 1 ? 28 : 10, boxShadow: index === 1 ? "0 22px 70px rgba(34,95,170,.24)" : "0 12px 36px rgba(0,0,0,.10)" }),
      element({ selector: `.plan-${index}-button`, tagName: "button", role: "button", text: index === 2 ? "Contact sales" : "Start trial", bounds: { x: x + 24, y: 468, width: 282, height: 42 }, fontSize: 15, fontWeight: 800, borderRadius: index === 1 ? 999 : 8, backgroundColor: index === 1 ? "#245cc7" : "#ffffff", color: index === 1 ? "#ffffff" : "#1f2937" })
    ];
  });
  return benchmarkBase("pricing-page", {
    elements: [
      element({ selector: ".pricing-title", tagName: "h1", role: "heading", text: "Choose the plan for your review team", bounds: { x: 320, y: 70, width: 640, height: 44 }, fontSize: 36, fontWeight: 800 }),
      ...cards
    ]
  });
}

function mobileAppMockup() {
  return benchmarkBase("mobile-app-mockup", {
    viewport: { width: 390, height: 780, scrollX: 0, scrollY: 0 },
    imageMetrics: { width: 390, height: 780, sizeBytes: 320000, mimeType: "image/png" },
    elements: [
      element({ selector: ".mobile-title", tagName: "h1", role: "heading", text: "Today", bounds: { x: 22, y: 50, width: 110, height: 32 }, fontSize: 24, fontWeight: 800 }),
      element({ selector: ".mobile-hero", type: "media", bounds: { x: 22, y: 122, width: 346, height: 210 }, backgroundColor: "#0d5d74", borderRadius: 28 }),
      ...Array.from({ length: 4 }, (_, index) => element({ selector: `.mobile-stat-${index}`, type: "card", text: `Mobile stat ${index}`, bounds: { x: 22 + (index % 2) * 177, y: 348 + Math.floor(index / 2) * 86, width: 168, height: 78 }, fontSize: 13, borderRadius: 22, boxShadow: "0 8px 24px rgba(0,0,0,.1)" })),
      ...Array.from({ length: 4 }, (_, index) => element({ selector: `.mobile-nav-${index}`, tagName: "button", role: "button", bounds: { x: 58 + index * 76, y: 706, width: 28, height: 28 }, backgroundColor: "#dce3ed", borderRadius: 999 }))
    ]
  });
}

function zeplinArtboard() {
  const viewport = { width: 1440, height: 900, scrollX: 0, scrollY: 0 };
  const rawElements = [
    element({ selector: ".zeplin-toolbar", type: "region", text: "Zeplin toolbar Versions Comments", bounds: { x: 0, y: 0, width: 260, height: 900 }, backgroundColor: "#2b4049" }),
    element({ selector: ".central-artboard", type: "frame", text: "Client design artboard", bounds: { x: 330, y: 80, width: 860, height: 720 }, backgroundColor: "#eaf4f2", borderRadius: 10 }),
    element({ selector: ".artboard-title", tagName: "h1", role: "heading", text: "Vakgebieden", bounds: { x: 382, y: 210, width: 320, height: 54 }, fontSize: 38, fontWeight: 800, color: "#ffffff", backgroundColor: "#0d5572" }),
    element({ selector: ".artboard-cta", tagName: "button", role: "button", text: "Find jobs", bounds: { x: 382, y: 310, width: 138, height: 44 }, fontSize: 15, fontWeight: 800, color: "#ffffff", backgroundColor: "#d8233b", borderRadius: 999 }),
    element({ selector: ".testimonial-quote", type: "quote", text: "Great place to work", bounds: { x: 440, y: 540, width: 600, height: 120 }, fontSize: 18, color: "#52636b", backgroundColor: "#eaf4f2" }),
    element({ selector: ".zeplin-spec-panel", type: "region", text: "Specs Assets Annotations", bounds: { x: 1140, y: 0, width: 300, height: 900 }, backgroundColor: "#2b4049" })
  ];
  const target = { type: "central-design-artboard", label: "Zeplin central artboard", bounds: { x: 330, y: 80, width: 860, height: 720 }, excludesPageChrome: true, confidence: 0.9 };
  return benchmarkBase("zeplin-artboard", {
    sourceType: "zeplin-capture",
    viewport,
    imageMetrics: { width: 1440, height: 900, sizeBytes: 480000, mimeType: "image/png" },
    reviewTarget: target,
    rawElements,
    elements: filterElementsForTarget(rawElements, target)
  });
}

function figmaFrame() {
  const viewport = { width: 1440, height: 900, scrollX: 0, scrollY: 0 };
  const rawElements = [
    element({ selector: ".figma-layers", type: "region", text: "Layers", bounds: { x: 0, y: 0, width: 240, height: 900 } }),
    element({ selector: ".figma-frame", type: "frame", text: "Design frame", bounds: { x: 340, y: 130, width: 760, height: 620 }, backgroundColor: "#fff7ed" }),
    element({ selector: ".frame-title", tagName: "h1", role: "heading", text: "Bring design review into the release workflow", bounds: { x: 384, y: 174, width: 520, height: 76 }, fontSize: 34, fontWeight: 800 }),
    ...[0, 1, 2].map((index) => element({ selector: `.frame-card-${index}`, type: "card", text: ["Capture", "Review", "Export"][index], bounds: { x: 384 + index * 220, y: 360, width: 190, height: 150 }, fontSize: 18, fontWeight: 700, borderRadius: index === 1 ? 24 : 8, boxShadow: "0 12px 36px rgba(0,0,0,.14)" })),
    element({ selector: ".figma-properties", type: "region", text: "Design Prototype Inspect", bounds: { x: 1160, y: 0, width: 280, height: 900 } })
  ];
  const target = { type: "central-design-artboard", label: "Figma frame", bounds: { x: 340, y: 130, width: 760, height: 620 }, excludesPageChrome: true, confidence: 0.9 };
  return benchmarkBase("figma-frame", {
    sourceType: "figma-capture",
    viewport,
    imageMetrics: { width: 1440, height: 900, sizeBytes: 460000, mimeType: "image/png" },
    reviewTarget: target,
    rawElements,
    elements: filterElementsForTarget(rawElements, target)
  });
}

function typographyEditorial() {
  return benchmarkBase("typography-editorial", {
    elements: [
      element({ selector: ".editorial-title", tagName: "h1", role: "heading", text: "Enterprise design quality depends on how quickly reviewers can understand visual evidence", bounds: { x: 80, y: 70, width: 760, height: 74 }, fontSize: 32, lineHeight: 34, fontWeight: 600 }),
      element({ selector: ".body-copy", tagName: "p", text: "Design review tools often fail because they treat screenshots as raw artefacts rather than communication surfaces. A professional reviewer needs structure, rhythm, evidence, and prioritisation.", bounds: { x: 80, y: 184, width: 920, height: 96 }, fontSize: 13, lineHeight: 16, fontFamily: "Georgia" }),
      element({ selector: ".aside-note", tagName: "aside", text: "Related notes context audit details status metadata review version ownership historical decisions", bounds: { x: 1030, y: 184, width: 220, height: 180 }, fontSize: 12, lineHeight: 15, color: "#89919c", backgroundColor: "#fbfaf7" })
    ]
  });
}

function clutteredAntiPattern() {
  return benchmarkBase("cluttered-anti-pattern", {
    elements: [
      element({ selector: ".noisy-hero", type: "region", text: "Everything your team needs right now", bounds: { x: 24, y: 24, width: 1232, height: 210 }, fontSize: 18, color: "#ffffff", backgroundColor: "#8338ec", borderRadius: 22, boxShadow: "0 18px 50px rgba(131,56,236,.35)" }),
      ...Array.from({ length: 4 }, (_, index) => element({ selector: `.hero-action-${index}`, tagName: "button", role: "button", text: ["Start", "Learn", "Compare", "Export"][index], bounds: { x: 48 + index * 120, y: 170, width: 100, height: 40 }, fontSize: 14, fontWeight: 800, color: "#111827", backgroundColor: "#ffbe0b", borderRadius: 4 })),
      ...Array.from({ length: 8 }, (_, index) => element({ selector: `.fragment-${index}`, type: "card", text: `Fragment ${index}`, bounds: { x: 24 + (index % 4) * 306, y: 260 + Math.floor(index / 4) * 156, width: 286, height: 130 }, fontSize: 14, borderRadius: [4, 18, 30, 8][index % 4], boxShadow: "0 12px 0 #f15bb5" }))
    ]
  });
}

function accessibilityVisibleFailure() {
  return benchmarkBase("accessibility-visible-failure", {
    elements: [
      element({ selector: ".a11y-title", tagName: "h1", role: "heading", text: "Account verification", bounds: { x: 96, y: 84, width: 420, height: 38 }, fontSize: 28, fontWeight: 800 }),
      element({ selector: ".muted-copy", tagName: "p", text: "Several items need your attention before this workspace can be activated.", bounds: { x: 96, y: 142, width: 540, height: 32 }, fontSize: 12, lineHeight: 16, color: "#c0c8d2", backgroundColor: "#f8fafc" }),
      element({ selector: ".status-dot", type: "status", bounds: { x: 96, y: 202, width: 12, height: 12 }, backgroundColor: "#e11d48" }),
      element({ selector: ".status-label", tagName: "span", text: "Status is shown by colour alone", bounds: { x: 118, y: 196, width: 240, height: 22 }, fontSize: 14 }),
      element({ selector: ".tiny-info", tagName: "button", role: "button", text: "i", bounds: { x: 96, y: 244, width: 28, height: 28 }, fontSize: 11, backgroundColor: "#e5e7eb", borderRadius: 999 }),
      element({ selector: ".soft-error", type: "error", text: "Required field missing", bounds: { x: 96, y: 292, width: 160, height: 16 }, fontSize: 12, color: "#d4a3a3", backgroundColor: "#f8fafc" })
    ],
    visualAnalysis: {
      evidence: {
        ocrContrastResults: [
          {
            id: "ocr-contrast-muted-copy",
            text: "Several items need your attention",
            textRegionId: "ocr-text-1",
            region: "Muted copy",
            bounds: { x: 7.5, y: 15.8, width: 42, height: 4 },
            contrastRatio: 2.38,
            evidence: "Local OCR detected text in this region and local pixel analysis measured approximately 2.38:1 foreground/background contrast.",
            evidence_type: "measured_evidence"
          }
        ],
        lowContrastTextLikeRegions: [],
        contrastPairs: [],
        colourPalette: []
      }
    }
  });
}

function inconsistentDesignSystem() {
  return benchmarkBase("inconsistent-design-system", {
    elements: [
      element({ selector: ".system-title", tagName: "h1", role: "heading", text: "Component library preview", bounds: { x: 80, y: 72, width: 440, height: 36 }, fontSize: 30, fontWeight: 800 }),
      ...[0, 1, 2].map((index) => element({ selector: `.button-${index}`, tagName: "button", role: "button", text: ["Save", "Publish", "Archive"][index], bounds: { x: 80 + index * 132, y: 142, width: 118, height: 40 }, fontSize: 14, fontWeight: 800, borderRadius: [4, 18, 0][index], backgroundColor: ["#0f766e", "#ffffff", "#edf2f7"][index], color: index === 0 ? "#ffffff" : "#1f2937", boxShadow: index === 1 ? "0 8px 20px rgba(0,0,0,.12)" : "none" })),
      ...[0, 1, 2].map((index) => element({ selector: `.system-card-${index}`, type: "card", text: ["User card", "Role card", "Policy card"][index], bounds: { x: 80 + index * 340, y: 230, width: 300, height: 190 }, fontSize: 16, borderRadius: [4, 18, 30][index], boxShadow: ["none", "0 20px 40px rgba(0,0,0,.16)", "0 4px 8px rgba(0,0,0,.08)"][index] }))
    ]
  });
}

function cleanGoodBaseline() {
  return benchmarkBase("clean-good-baseline", {
    reviewDepth: "standard",
    elements: [
      element({ selector: ".page-title", tagName: "h1", role: "heading", text: "Run operational reviews with calm, structured confidence.", bounds: { x: 88, y: 156, width: 620, height: 104 }, fontSize: 48, lineHeight: 52, fontWeight: 800, color: "#111827" }),
      element({ selector: ".lede", tagName: "p", text: "A focused workspace for readable status and clear next actions.", bounds: { x: 88, y: 282, width: 600, height: 56 }, fontSize: 18, lineHeight: 28, color: "#4b5c6b" }),
      element({ selector: ".primary", tagName: "a", role: "link", text: "Start review", bounds: { x: 88, y: 366, width: 128, height: 46 }, fontSize: 16, lineHeight: 22, fontWeight: 800, color: "#ffffff", backgroundColor: "#0f766e", borderRadius: 10 }),
      element({ selector: ".secondary", tagName: "a", role: "link", text: "View workflow", bounds: { x: 228, y: 366, width: 142, height: 46 }, fontSize: 16, lineHeight: 22, fontWeight: 800, color: "#243241", backgroundColor: "#ffffff", borderRadius: 10 }),
      ...[0, 1, 2].map((index) => element({ selector: `.card-${index}`, type: "card", text: ["Readable by default", "Consistent components", "Action-led review"][index], bounds: { x: 88 + index * 276, y: 560, width: 252, height: 168 }, fontSize: 18, lineHeight: 26, fontWeight: 700, color: "#17212b", backgroundColor: "#ffffff", borderRadius: 16 }))
    ]
  });
}

const BUILDERS = Object.freeze({
  "marketing-hero": marketingHero,
  "saas-dashboard": saasDashboard,
  "dense-admin-panel": denseAdminPanel,
  "onboarding-form": onboardingForm,
  "pricing-page": pricingPage,
  "mobile-app-mockup": mobileAppMockup,
  "zeplin-artboard": zeplinArtboard,
  "figma-frame": figmaFrame,
  "typography-editorial": typographyEditorial,
  "cluttered-anti-pattern": clutteredAntiPattern,
  "accessibility-visible-failure": accessibilityVisibleFailure,
  "inconsistent-design-system": inconsistentDesignSystem,
  "clean-good-baseline": cleanGoodBaseline
});

export function benchmarkInput(id) {
  const builder = BUILDERS[id];
  if (!builder) throw new Error(`Unknown benchmark fixture: ${id}`);
  return builder();
}

function textOf(finding = {}) {
  return [
    finding.category,
    finding.severity,
    finding.region,
    finding.issue,
    finding.evidence,
    finding.impact,
    finding.recommendation,
    finding.bestPracticeReference,
    finding.reviewRationale,
    finding.markerSummary
  ].join(" ").toLowerCase();
}

function keywordMatch(finding, expected) {
  const haystack = textOf(finding);
  const keywords = expected.evidenceKeywords || [];
  return keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

function matchingFinding(findings, expected) {
  return findings.find((finding) => finding.category === expected.category && keywordMatch(finding, expected)) || null;
}

function labelFromRatio(ratio) {
  if (ratio >= 0.78) return "Strong";
  if (ratio >= 0.58) return "Mostly strong";
  if (ratio >= 0.34) return "Needs attention";
  return "Weak";
}

function hasDepth(finding = {}) {
  return Boolean(
    finding.issue?.length > 30 &&
      finding.evidence?.length > 30 &&
      finding.impact?.length > 30 &&
      finding.recommendation?.length > 30 &&
      finding.bestPracticeReference?.length > 20 &&
      Array.isArray(finding.acceptanceCriteria) &&
      finding.acceptanceCriteria.length >= 3
  );
}

function scannerSpam(findings = [], expected = {}) {
  const forbidden = [
    "detected",
    "looks modern",
    "looks good",
    "make it modern",
    "could be better",
    ...(expected.weakFindingsToAvoid || []),
    ...(expected.scannerSpamToAvoid || [])
  ];
  return findings.filter((finding) => {
    const text = textOf(finding);
    return forbidden.some((pattern) => text.includes(String(pattern).toLowerCase()));
  });
}

function duplicateCount(findings = []) {
  const buckets = new Map();
  findings.forEach((finding) => {
    const key = `${finding.category}:${String(finding.region || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  return [...buckets.values()].filter((count) => count > 2).reduce((sum, count) => sum + count - 2, 0);
}

function boundsToPageRect(bounds = {}, viewport = {}) {
  const scrollX = Number(viewport.scrollX || 0);
  const scrollY = Number(viewport.scrollY || 0);
  const rect = normalizeBounds(bounds, {
    width: Math.max(Number(viewport.width || 0), Number(bounds.x || 0) + Number(bounds.width || 0)),
    height: Math.max(Number(viewport.height || 0), Number(bounds.y || 0) + Number(bounds.height || 0))
  });
  if (!rect) return null;
  return {
    x: rect.x + scrollX,
    y: rect.y + scrollY,
    width: rect.width,
    height: rect.height,
    right: rect.x + scrollX + rect.width,
    bottom: rect.y + scrollY + rect.height
  };
}

function intersectRects(a, b) {
  if (!a || !b) return a || null;
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top, right, bottom };
}

function rectArea(rect = {}) {
  return Math.max(0, Number(rect.width || 0)) * Math.max(0, Number(rect.height || 0));
}

function rectOverlapRatio(a = {}, b = {}) {
  const intersection = intersectRects(a, b);
  const denominator = Math.min(rectArea(a), rectArea(b));
  return denominator > 0 ? rectArea(intersection) / denominator : 0;
}

function elementRectForFinding(finding = {}, elements = [], viewport = {}) {
  const selector = String(finding.selector || "").trim();
  if (!selector) return null;
  const element = elements.find((item) => String(item.selector || "").trim() === selector);
  return element?.bounds ? boundsToPageRect(element.bounds, viewport) : null;
}

function targetRect(target = null, viewport = {}) {
  return target?.bounds ? boundsToPageRect(target.bounds, viewport) : null;
}

function expectedRectForFinding(finding = {}, input = {}) {
  const viewport = input.viewport || { width: 1280, height: 900, scrollX: 0, scrollY: 0 };
  const preferred = elementRectForFinding(finding, input.elements || [], viewport) || findingBoundsToPageRect(finding, viewport);
  if (!preferred) return null;
  const target = targetRect(input.reviewTarget, viewport);
  if (!target || !input.reviewTarget?.excludesPageChrome) return preferred;
  return intersectRects(preferred, target);
}

function markerPixelAccuracy({ input = {}, findings = [], markers = [] } = {}) {
  const markerById = new Map(markers.map((marker) => [marker.id, marker]));
  const measurements = findings
    .map((finding) => {
      const marker = markerById.get(finding.id);
      const expectedRect = expectedRectForFinding(finding, input);
      if (!marker?.rect || !expectedRect) return null;
      const overlapRatio = rectOverlapRatio(marker.rect, expectedRect);
      return {
        findingId: finding.id,
        category: finding.category,
        severity: finding.severity,
        region: finding.region,
        markerType: finding.markerType || "",
        overlapRatio
      };
    })
    .filter(Boolean);
  const averageOverlapRatio = measurements.length
    ? measurements.reduce((sum, item) => sum + item.overlapRatio, 0) / measurements.length
    : 1;
  return {
    markerCount: markers.length,
    measuredCount: measurements.length,
    averageOverlapRatio,
    lowOverlapMarkers: measurements.filter((item) => item.overlapRatio < 0.55)
  };
}

export function runBenchmark(id, options = {}) {
  const input = { ...benchmarkInput(id), ...options };
  const result = runReviewEngine(input);
  const report = buildReviewReport({
    itemId: input.itemId,
    title: id,
    screenshotRef: input.screenshotRef,
    media: input.imageMetrics,
    engineMetadata: result.metadata,
    skippedRules: result.skippedRules,
    findings: result.findings,
    reviewTarget: input.reviewTarget || null,
    reviewMode: input.reviewTarget ? "side-panel-live-review" : "benchmark-review"
  });
  const markers = buildOverlayMarkers(result.findings, input.viewport || { width: 1280, height: 900, scrollX: 0, scrollY: 0 }, {
    elements: input.elements,
    target: input.reviewTarget || null
  });
  return { input, result, report, markers };
}

export function evaluateBenchmark(id) {
  const expected = loadExpectedFindings(id);
  const priorities = loadExpectedPriorities()[id] || { priorityOrder: [] };
  const run = runBenchmark(id);
  const findings = run.result.findings;
  const markerAccuracy = markerPixelAccuracy({
    input: run.input,
    findings,
    markers: run.markers
  });
  const matches = expected.strongFindings.map((item) => ({
    expected: item,
    finding: matchingFinding(findings, item)
  }));
  const missed = matches.filter((match) => !match.finding).map((match) => match.expected);
  const matched = matches.filter((match) => match.finding);
  const depthRatio = findings.length ? findings.filter(hasDepth).length / findings.length : 1;
  const spam = scannerSpam(findings, expected);
  const duplicates = duplicateCount(findings);
  const firstMeaningful = findings[0] || null;
  const topCategory = firstMeaningful?.category || "";
  const priorityHit = priorities.priorityOrder?.slice(0, 2).includes(topCategory) || findings.length === 0;
  const rootCauseHits = findings.filter((finding) => {
    const text = textOf(finding);
    return expected.rootCauseObservations?.some((observation) => {
      const tokens = String(observation).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 5);
      return tokens.some((token) => text.includes(token));
    });
  });
  const relevanceRatio = expected.strongFindings.length ? matched.length / expected.strongFindings.length : 1;
  const noiseRatio = findings.length ? Math.max(0, 1 - (spam.length + duplicates) / findings.length) : 1;
  const synthesisRatio = rootCauseHits.length || findings.some((finding) => finding.isSynthesisFinding) ? 0.7 : 0.3;

  return {
    id,
    expected,
    priorities,
    findings,
    report: run.report,
    markers: run.markers,
    markerPixelAccuracy: markerAccuracy,
    matched,
    missed,
    falsePositives: spam,
    duplicateCount: duplicates,
    scores: {
      relevance: labelFromRatio(relevanceRatio),
      depth: labelFromRatio(depthRatio),
      uxReasoning: labelFromRatio(findings.some((finding) => finding.category === "ux") ? 0.72 : 0.38),
      accessibilityVisibleReasoning: labelFromRatio(findings.some((finding) => finding.category === "accessibility-visible") ? 0.72 : 0.42),
      designSystemReasoning: labelFromRatio(findings.some((finding) => finding.category === "design-system") ? 0.72 : 0.42),
      rootCauseIdentification: labelFromRatio(synthesisRatio),
      noiseControl: labelFromRatio(noiseRatio),
      prioritisationQuality: priorityHit ? "Mostly strong" : "Needs attention",
      humanLikeWording: spam.length ? "Needs attention" : "Mostly strong",
      markerAccuracy: markerAccuracy.lowOverlapMarkers.length === 0 && markerAccuracy.averageOverlapRatio >= 0.82
        ? "Strong"
        : markerAccuracy.averageOverlapRatio >= 0.62
          ? "Mostly strong"
          : "Needs attention",
      exportReportUsefulness: run.report.findings.every((finding) => finding.ticket && finding.acceptanceCriteria?.length) ? "Mostly strong" : "Needs attention"
    }
  };
}

export function evaluateAllBenchmarks() {
  return BENCHMARK_IDS.map(evaluateBenchmark);
}

export function cleanBaselineEvaluation() {
  return runBenchmark("clean-good-baseline");
}
