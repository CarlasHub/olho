import { normalizeReviewMetrics } from "../utils/metrics-normalizer.js";
import { VISUAL_REVIEW_PROFILE } from "./visual-review-profile.js";

function initialVisualScore(metrics) {
  if (!metrics.elements.length) return 100;
  const densityPenalty = Math.min(25, Math.max(0, metrics.densityMetrics.elementDensity - 12) * 1.4);
  const typePenalty = metrics.typeScaleStats.minFontSize && metrics.typeScaleStats.minFontSize < 12 ? 8 : 0;
  return Math.max(0, Math.round(100 - densityPenalty - typePenalty));
}

export function createReviewContext(input = {}) {
  const metrics = normalizeReviewMetrics(input);
  const hasDomMetrics = metrics.elements.length > 0;
  const sourceType = input.sourceType || (hasDomMetrics ? "dom-metrics" : "image-only");
  const screenshotRef = String(input.screenshotRef || input.session?.screenshotRef || input.itemId || "screenshot").trim();

  return {
    engineVersion: VISUAL_REVIEW_PROFILE.engineVersion,
    profile: VISUAL_REVIEW_PROFILE,
    itemId: input.itemId || input.session?.itemId || input.media?.id || "",
    screenshotRef,
    sourceType,
    hasDomMetrics,
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
    overallVisualScore: Number.isFinite(Number(input.overallVisualScore))
      ? Number(input.overallVisualScore)
      : initialVisualScore(metrics)
  };
}
