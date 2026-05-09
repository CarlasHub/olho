import { isDesignReviewSourceType } from "./design-review-mode.js";
import { FIGMA_REVIEW_GUIDANCE } from "./templates/figma-guidance.js";
import { STATIC_DESIGN_REVIEW_GUIDANCE } from "./templates/static-design-guidance.js";
import { ZEPLIN_REVIEW_GUIDANCE } from "./templates/zeplin-guidance.js";

export function designReviewGuidanceForSource(sourceType, platform = "") {
  const platformName = String(platform || "").toLowerCase();
  if (sourceType === "zeplin-capture" || platformName === "zeplin") return [...ZEPLIN_REVIEW_GUIDANCE];
  if (sourceType === "figma-capture" || platformName === "figma") return [...FIGMA_REVIEW_GUIDANCE];
  if (isDesignReviewSourceType(sourceType)) return [...STATIC_DESIGN_REVIEW_GUIDANCE];
  return [];
}

export function designReviewNotice(sourceType) {
  if (!isDesignReviewSourceType(sourceType)) return "";
  return "This review analyses the visible interface only. DOM, focus states, and live interaction data are unavailable.";
}
