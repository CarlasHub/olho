export const REVIEW_SOURCE_TYPES = Object.freeze([
  "memory-image",
  "webpage-capture",
  "screen-capture",
  "design-import",
  "zeplin-capture",
  "figma-capture",
  "static-design",
  "unknown"
]);

const REVIEW_MODE_LABELS = Object.freeze({
  "memory-image": "Image-only review",
  "webpage-capture": "Live webpage review",
  "screen-capture": "Screen capture review",
  "design-import": "Fallback design screenshot review",
  "zeplin-capture": "Zeplin screen review",
  "figma-capture": "Figma frame review",
  "static-design": "Image-only design review",
  unknown: "Image-only review"
});

const REVIEW_MODE_DESCRIPTIONS = Object.freeze({
  "memory-image": "Saved local image review.",
  "webpage-capture": "Live interface capture reviewed visually for UI quality, UX clarity, accessibility-visible risk, and enterprise polish.",
  "screen-capture": "Screenshot captured from a selected screen, window, or tab.",
  "design-import": "Fallback offline review of an imported design screenshot.",
  "zeplin-capture": "Visible Zeplin design screen reviewed as a design artefact.",
  "figma-capture": "Visible Figma frame or design canvas reviewed as a design artefact.",
  "static-design": "Static image-only design review.",
  unknown: "Source details are limited."
});

const DESIGN_SOURCE_TYPES = new Set(["design-import", "zeplin-capture", "figma-capture", "static-design"]);

export function isKnownReviewSourceType(value) {
  return REVIEW_SOURCE_TYPES.includes(value);
}

export function isDesignReviewSourceType(value) {
  return DESIGN_SOURCE_TYPES.has(value);
}

export function reviewModeLabel(sourceType) {
  return REVIEW_MODE_LABELS[sourceType] || REVIEW_MODE_LABELS.unknown;
}

export function reviewModeDescription(sourceType) {
  return REVIEW_MODE_DESCRIPTIONS[sourceType] || REVIEW_MODE_DESCRIPTIONS.unknown;
}

export function normalizeReviewSourceType(value, fallback = "unknown") {
  const sourceType = String(value || "").trim();
  if (isKnownReviewSourceType(sourceType)) return sourceType;
  return isKnownReviewSourceType(fallback) ? fallback : "unknown";
}

export function reviewModeBadge(sourceType) {
  const normalized = normalizeReviewSourceType(sourceType);
  return {
    sourceType: normalized,
    label: reviewModeLabel(normalized),
    description: reviewModeDescription(normalized),
    isDesignScreen: isDesignReviewSourceType(normalized)
  };
}
