export const VISUAL_REVIEW_PROFILE = Object.freeze({
  engineVersion: "1.0.0-enterprise",
  thresholds: {
    minTouchTargetPx: 44,
    comfortableLineHeightRatio: 1.5,
    minBodyTextPx: 12,
    preferredLineLengthMin: 45,
    preferredLineLengthMax: 75,
    spacingScaleStep: 8,
    lowContrastNormalText: 4.5,
    lowContrastLargeText: 3,
    highDensityElementsPer100kPx: 14,
    excessiveDensityElementsPer100kPx: 22,
    maxPrimaryActionWeightRatio: 1.18,
    minHeadingBodyRatio: 1.35
  },
  principles: {
    hierarchy: "Nielsen Norman Group scanability guidance and visual hierarchy practice.",
    gestalt: "Gestalt proximity, similarity, continuity, and grouping principles.",
    fitts: "Fitts' Law and WCAG 2.2 target-size guidance.",
    hicks: "Hick's Law decision complexity guidance.",
    miller: "Miller's Law chunking and information grouping guidance.",
    wcag: "WCAG 2.2 visible contrast, focus, and target-size criteria.",
    enterpriseSystems: "Enterprise design-system consistency patterns from mature component libraries."
  }
});
