import { normalizeReviewMetrics } from "../utils/metrics-normalizer.js";
import { VISUAL_REVIEW_PROFILE } from "./visual-review-profile.js";
import { detectDesignSource } from "../design/design-source-detector.js";

function initialVisualScore(metrics) {
  if (!metrics.elements.length) return 100;
  const densityPenalty = Math.min(25, Math.max(0, metrics.densityMetrics.elementDensity - 12) * 1.4);
  const typePenalty = metrics.typeScaleStats.minFontSize && metrics.typeScaleStats.minFontSize < 12 ? 8 : 0;
  return Math.max(0, Math.round(100 - densityPenalty - typePenalty));
}

function normalizeInputSourceType(value, detectedSource, hasDomMetrics) {
  const sourceType = String(value || "").trim();
  if (sourceType === "dom-metrics") return "webpage-capture";
  if (sourceType === "image-only") return detectedSource.sourceType || "static-design";
  return sourceType || detectedSource.sourceType || (hasDomMetrics ? "webpage-capture" : "static-design");
}

export function createReviewContext(input = {}) {
  const metrics = normalizeReviewMetrics(input);
  const hasDomMetrics = metrics.elements.length > 0;
  const detectedSource = detectDesignSource({
    ...input,
    hasDomMetrics
  });
  const sourceType = normalizeInputSourceType(input.sourceType, detectedSource, hasDomMetrics);
  const screenshotRef = String(input.screenshotRef || input.session?.screenshotRef || input.itemId || "screenshot").trim();
  const hasTextMetrics = metrics.textBlocks.length > 0;
  const hasInteractiveElements = metrics.actions.length > 0 || metrics.elements.some((element) => element.isInteractive);
  const hasComputedStyles = metrics.elements.some((element) => Boolean(element.style));
  const hasDesignMetadata = Boolean(
    input.hasDesignMetadata ||
      input.media?.metadata?.designReview ||
      input.media?.metadata?.isDesignScreen ||
      input.media?.metadata?.reviewSourceType
  );
  const isImageOnly = !hasDomMetrics;
  const isDesignScreen = Boolean(detectedSource.isDesignScreen || hasDesignMetadata);
  const visualAnalysis = input.visualAnalysis || input.domMetrics?.visualAnalysis || input.media?.metadata?.visualAnalysis || null;

  return {
    engineVersion: VISUAL_REVIEW_PROFILE.engineVersion,
    profile: VISUAL_REVIEW_PROFILE,
    itemId: input.itemId || input.session?.itemId || input.media?.id || "",
    screenshotRef,
    sourceType,
    hasDomMetrics,
    hasComputedStyles,
    hasTextMetrics,
    hasInteractiveElements,
    hasDesignMetadata,
    isImageOnly,
    isDesignScreen,
    designSource: detectedSource,
    media: input.media || null,
    raw: input,
    image: metrics.image,
    viewport: metrics.viewport,
    elements: metrics.elements,
    textBlocks: metrics.textBlocks,
    actions: metrics.actions,
    headings: metrics.headings,
    components: metrics.components,
    densityMetrics: input.densityMetrics || metrics.densityMetrics,
    typeScaleStats: input.typeScaleStats || metrics.typeScaleStats,
    detectedRegions: input.detectedRegions || metrics.detectedRegions,
    visualAnalysis,
    hasLocalVisualAnalysis: Boolean(visualAnalysis?.evidence),
    overallVisualScore: Number.isFinite(Number(input.overallVisualScore))
      ? Number(input.overallVisualScore)
      : initialVisualScore(metrics)
  };
}
