import { categoryLabel } from "../../findings/category-registry.js";
import { visualWeight } from "../../utils/visual-weight.js";

const MAX_CONTEXT_FINDINGS = 20;
const MAX_CONTEXT_ELEMENTS = 30;
const MAX_CONTEXT_REGIONS = 12;

function truncate(value, max = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function compactBounds(bounds = {}) {
  if (!bounds) return null;
  return {
    x: Math.round(Number(bounds.x || 0)),
    y: Math.round(Number(bounds.y || 0)),
    width: Math.round(Number(bounds.width || 0)),
    height: Math.round(Number(bounds.height || 0))
  };
}

function summarizeElement(element, context) {
  return {
    selector: element.selector || "",
    role: element.role || "",
    tagName: element.tagName || "",
    type: element.type || "",
    text: truncate(element.text, 140),
    bounds: compactBounds(element.bounds),
    fontSize: element.style?.fontSize || 0,
    contrast: element.style?.contrast ? Math.round(element.style.contrast * 100) / 100 : null,
    visualWeight: Math.round(visualWeight(element, context) * 100) / 100
  };
}

function summarizeFinding(finding = {}) {
  return {
    id: finding.id || "",
    category: finding.category || "",
    categoryLabel: categoryLabel(finding.category || ""),
    severity: finding.severity || "",
    region: truncate(finding.region, 120),
    issue: truncate(finding.issue, 220),
    evidence: truncate(finding.evidence, 260),
    impact: truncate(finding.impact, 220),
    recommendation: truncate(finding.recommendation, 240),
    confidence: Number(finding.confidence || 0),
    source: finding.source || "",
    selector: finding.selector || ""
  };
}

function topElements(elements = [], context, predicate) {
  return elements
    .filter(predicate)
    .slice()
    .sort((a, b) => visualWeight(b, context) - visualWeight(a, context))
    .slice(0, MAX_CONTEXT_ELEMENTS)
    .map((element) => summarizeElement(element, context));
}

export function buildAiPromptContext({ session = {}, reviewContext = {}, deterministicFindings = [], candidateAiFindings = [] } = {}) {
  const context = reviewContext || {};
  const findings = deterministicFindings.length ? deterministicFindings : session.findings || [];
  const image = context.image || {};
  const viewport = context.viewport || {};

  return {
    product: "Olho Review",
    reviewType: "Optional professional AI visual UI/UX and accessibility review",
    reviewerStandard: {
      role: "Senior enterprise UI/UX reviewer, accessibility-visible reviewer, and product design critic",
      stance: "Critical professional release audit, not praise or generic commentary",
      evaluate: [
        "visual hierarchy",
        "spacing rhythm",
        "typography quality",
        "CTA clarity",
        "layout composition",
        "cognitive load",
        "discoverability",
        "component consistency",
        "accessibility-visible risk",
        "enterprise polish"
      ],
      findingRequirements: [
        "reference visible evidence",
        "explain why the issue matters",
        "describe UX or accessibility-visible impact",
        "provide actionable recommendations",
        "prioritize severity realistically"
      ]
    },
    sourceType: context.sourceType || session.engineMetadata?.sourceType || "image-only",
    screenshotRef: session.screenshotRef || context.screenshotRef || "",
    image: {
      width: image.width || session.media?.width || 0,
      height: image.height || session.media?.height || 0,
      aspectRatio: image.aspectRatio || null,
      mimeType: image.mimeType || session.media?.mimeType || ""
    },
    viewport: {
      width: viewport.width || image.width || session.media?.width || 0,
      height: viewport.height || image.height || session.media?.height || 0,
      aspectRatio: viewport.aspectRatio || null
    },
    metadataAvailability: {
      hasDomMetrics: Boolean(context.hasDomMetrics || session.engineMetadata?.hasDomMetrics),
      hasComputedStyles: Boolean(context.hasComputedStyles || context.elements?.some((element) => element.style)),
      hasTextMetrics: Boolean(context.hasTextMetrics),
      hasInteractiveElements: Boolean(context.hasInteractiveElements),
      hasDesignMetadata: Boolean(context.hasDesignMetadata),
      isImageOnly: Boolean(context.isImageOnly),
      isDesignScreen: Boolean(context.isDesignScreen),
      hasScreenshot: true,
      screenshotMayBeSharedOnlyWithExplicitConsent: true
    },
    designReview: {
      isDesignScreen: Boolean(context.isDesignScreen),
      sourceType: context.sourceType || session.engineMetadata?.sourceType || "unknown",
      platform: context.designSource?.platform || session.designReview?.platform || "",
      visibleOnly: true,
      instruction:
        "This may be a static design screenshot. DOM, code, focus states, and live interaction data may be unavailable. Do not claim WCAG failures without reliable data."
    },
    visualMetrics: {
      overallVisualScore: context.overallVisualScore ?? session.engineMetadata?.visualScore ?? null,
      densityMetrics: context.densityMetrics || {},
      typeScaleStats: context.typeScaleStats || {}
    },
    detectedRegions: (context.detectedRegions || []).slice(0, MAX_CONTEXT_REGIONS).map((region) => ({
      name: region.name || region.label || "Region",
      bounds: compactBounds(region.bounds),
      elementCount: Number(region.elementCount || region.elements?.length || 0)
    })),
    headings: topElements(context.headings || [], context, () => true),
    actions: topElements(context.actions || [], context, () => true),
    textBlocks: topElements(context.textBlocks || [], context, (element) => String(element.text || "").length > 0),
    components: topElements(context.components || [], context, () => true),
    deterministicFindings: findings.slice(0, MAX_CONTEXT_FINDINGS).map(summarizeFinding),
    candidateAiFindings: candidateAiFindings.slice(0, MAX_CONTEXT_FINDINGS).map(summarizeFinding),
    reviewCategories: [
      "visual hierarchy",
      "UX clarity",
      "accessibility-visible risks",
      "design-system consistency",
      "enterprise polish",
      "responsive and layout risk"
    ],
    visibleOnlyInstruction:
      "Use only visible screenshot evidence, supplied metrics, and deterministic findings. Do not invent hidden workflows or system behavior."
  };
}
