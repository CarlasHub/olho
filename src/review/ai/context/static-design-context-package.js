import { viewportRectToPercentBounds } from "../../targeting/target-region-model.js";
import { buildStaticDesignRegions } from "./static-design-region-builder.js";
import { buildStaticDesignSummary } from "./static-design-summary-builder.js";

function bool(value) {
  return Boolean(value);
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

function ignoredAreasForTarget(target = null, sourceType = "") {
  const ignored = [];
  if (target?.excludesPageChrome || /zeplin|figma/i.test(sourceType)) {
    ignored.push("browser chrome");
    ignored.push("extension UI");
  }
  if (/zeplin/i.test(sourceType)) {
    ignored.push("Zeplin toolbar");
    ignored.push("Zeplin side panels");
    ignored.push("Zeplin specs/comments/utility panels");
    ignored.push("Zeplin zoom/status controls");
  }
  if (/figma/i.test(sourceType)) {
    ignored.push("Figma toolbar");
    ignored.push("Figma layers panel");
    ignored.push("Figma properties panel");
    ignored.push("Figma comments and utility panels");
  }
  return ignored;
}

function limitationsForContext(context = {}, target = null) {
  const limitations = [
    "Static design review cannot confirm dynamic behavior, keyboard order, hidden states, backend logic, or assistive technology semantics.",
    "Visible accessibility review must not claim WCAG failure unless reliable measured data is available."
  ];
  if (context.isImageOnly || !context.hasDomMetrics) {
    limitations.push("DOM metrics are unavailable or limited; selectors, focus states, and code-level accessibility cannot be verified.");
  }
  if (target?.confidence < 0.6) {
    limitations.push("Review target isolation confidence is low; findings should avoid precise claims outside the selected visible area.");
  }
  return limitations;
}

function markerRegionsFromFindings(findings = []) {
  return (Array.isArray(findings) ? findings : [])
    .filter((finding) => finding.regionBounds)
    .slice(0, 20)
    .map((finding) => ({
      findingId: finding.id,
      category: finding.category,
      severity: finding.severity,
      region: finding.region,
      markerType: finding.markerType || "",
      percentBounds: finding.regionBounds
    }));
}

function compactVisualAnalysis(visualAnalysis = null) {
  if (!visualAnalysis?.evidence) return null;
  const evidence = visualAnalysis.evidence;
  return {
    version: visualAnalysis.version || "",
    source: visualAnalysis.source || {},
    imageMetadata: evidence.imageMetadata || {},
    colourPalette: (evidence.colourPalette || []).slice(0, 8),
    measuredContrastPairs: (evidence.contrastPairs || []).slice(0, 10),
    lowContrastTextLikeRegions: (evidence.lowContrastTextLikeRegions || []).slice(0, 8),
    ocr: evidence.ocr || null,
    ocrTextRegions: (evidence.ocrTextRegions || []).slice(0, 12),
    ocrContrastResults: (evidence.ocrContrastResults || []).slice(0, 12),
    layoutRegions: (evidence.layoutRegions || []).slice(0, 8),
    visualHierarchy: evidence.visualHierarchy || {},
    spacingDensity: evidence.spacingDensity || {},
    alignment: evidence.alignment || {},
    repeatedColourUse: evidence.repeatedColourUse || {},
    ctaCandidates: (evidence.ctaCandidates || []).slice(0, 8),
    modelObservations: visualAnalysis.modelObservations || [],
    processing: visualAnalysis.processing || null,
    limitations: visualAnalysis.limitations || []
  };
}

function reviewTargetType(target = null) {
  if (!target?.type) return "unknown";
  if (target.type === "central-design-artboard") return "design-artboard";
  if (target.type === "design-canvas") return "design-canvas";
  if (target.type === "selected-element" || target.type === "webpage-region") return "selected-region";
  return target.type;
}

export function buildStaticDesignContextPackage({
  session = {},
  reviewContext = {},
  deterministicFindings = [],
  target = session.reviewTarget || session.designReview?.target || null
} = {}) {
  const context = reviewContext || {};
  const viewport = context.viewport || {
    width: session.media?.width || 0,
    height: session.media?.height || 0,
    scrollX: 0,
    scrollY: 0
  };
  const sourceType = context.sourceType || session.engineMetadata?.sourceType || session.reviewSourceType || "unknown";
  const targetBounds = target?.bounds || null;
  const targetPercentBounds = targetBounds ? viewportRectToPercentBounds(targetBounds, viewport) : null;
  const elements = Array.isArray(context.elements) ? context.elements : [];
  const regions = buildStaticDesignRegions({ elements, target, viewport });
  const summary = buildStaticDesignSummary({ context, regions, sourceType });
  const ignoredAreas = ignoredAreasForTarget(target, sourceType);
  const cropRecommended = bool(targetBounds && target?.excludesPageChrome);
  const visualAnalysis = compactVisualAnalysis(context.visualAnalysis || session.visualAnalysis || session.engineMetadata?.visualAnalysis || null);

  return {
    packageVersion: "1.0.0",
    reviewTargetType: reviewTargetType(target),
    sourceType,
    designAreaBounds: compactBounds(targetBounds),
    designAreaPercentBounds: targetPercentBounds,
    screenshotDimensions: {
      width: Number(context.image?.width || session.media?.width || viewport.width || 0),
      height: Number(context.image?.height || session.media?.height || viewport.height || 0)
    },
    targetIsolation: {
      confidence: Number(target?.confidence || 0),
      cropRecommended,
      cropRequiredForVisualReview: bool(cropRecommended && /zeplin|figma/i.test(sourceType)),
      cropUsed: false,
      ignoredAreas
    },
    sourceFlags: {
      isZeplin: /zeplin/i.test(sourceType),
      isFigma: /figma/i.test(sourceType),
      isDesignImport: /design|static/i.test(sourceType),
      isImageOnly: bool(context.isImageOnly || session.designReview?.isImageOnly),
      isDesignScreen: bool(context.isDesignScreen || session.designReview?.isDesignScreen || /zeplin|figma|design|static/i.test(sourceType))
    },
    instruction:
      "Review only the selected design/artboard area. Ignore editor chrome, side panels, toolbars, comments, specs, browser chrome, and extension UI unless the user explicitly selected the entire visible screen.",
    majorRegions: regions,
    visualSummary: summary,
    localVisualAnalysis: visualAnalysis,
    deterministicFindings: (Array.isArray(deterministicFindings) ? deterministicFindings : []).slice(0, 20).map((finding) => ({
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      region: finding.region,
      issue: finding.issue,
      evidence: finding.evidence,
      impact: finding.impact,
      recommendation: finding.recommendation,
      confidence: finding.confidence,
      regionBounds: finding.regionBounds || null,
      markerType: finding.markerType || ""
    })),
    markerRegions: markerRegionsFromFindings(deterministicFindings),
    limitations: limitationsForContext(context, target)
  };
}

export function markStaticContextCropUsed(contextPackage = {}, crop = {}) {
  return {
    ...contextPackage,
    targetIsolation: {
      ...(contextPackage.targetIsolation || {}),
      cropUsed: Boolean(crop.used),
      cropReason: crop.reason || "",
      cropBounds: crop.bounds || null,
      cropDimensions: crop.width && crop.height ? { width: crop.width, height: crop.height } : null
    }
  };
}

export function attachLocalVisionModelResult(contextPackage = {}, visionResult = null) {
  if (!visionResult) return contextPackage;
  const observations = Array.isArray(visionResult.modelObservations) ? visionResult.modelObservations : [];
  const localVisualAnalysis = contextPackage.localVisualAnalysis || {
    modelObservations: [],
    limitations: []
  };
  return {
    ...contextPackage,
    localVisionModel: visionResult,
    localVisualAnalysis: {
      ...localVisualAnalysis,
      modelObservations: [...(localVisualAnalysis.modelObservations || []), ...observations],
      limitations: [...(localVisualAnalysis.limitations || []), ...(visionResult.limitations || [])]
    }
  };
}
