import { createReviewSession } from "../contracts/review-session.js";

export function createLiveReviewSession({
  tab,
  capture,
  target,
  reviewContext,
  engineResult,
  findings,
  visualAnalysis = null
} = {}) {
  const now = new Date().toISOString();
  const title = tab?.title || "Visible view review";
  const media = {
    id: `live:${tab?.id || "tab"}:${Date.now()}`,
    type: "image",
    kind: "screenshot",
    width: capture?.image?.width || capture?.viewport?.width || 0,
    height: capture?.image?.height || capture?.viewport?.height || 0,
    sizeBytes: capture?.blob?.size || 0,
    mimeType: capture?.blob?.type || "image/png",
    createdAt: now,
    metadata: {
      title,
      width: capture?.image?.width || capture?.viewport?.width || 0,
      height: capture?.image?.height || capture?.viewport?.height || 0,
      sizeBytes: capture?.blob?.size || 0,
      mimeType: capture?.blob?.type || "image/png",
      sourceType: "visible",
      reviewEntryPoint: "side-panel",
      reviewMode: "side-panel-live-review",
      reviewSourceType: reviewContext?.sourceType || "webpage-capture",
      sourceUrl: tab?.url || "",
      sourcePageTitle: tab?.title || "",
      privacyLocalOnlyMode: true
    }
  };

  const session = createReviewSession({
    itemId: media.id,
    media,
    imageUrl: capture?.dataUrl || ""
  });

  return {
    ...session,
    title,
    createdAt: now,
    reviewMode: "side-panel-live-review",
    reviewTarget: target,
    reviewSourceType: reviewContext?.sourceType || "webpage-capture",
    findings: findings || engineResult?.findings || [],
    deterministicFindings: findings || engineResult?.findings || [],
    engineMetadata: engineResult?.metadata || {},
    skippedRules: engineResult?.skippedRules || [],
    reviewDepth: engineResult?.metadata?.reviewDepth || "standard",
    reviewDepthLabel: engineResult?.metadata?.reviewDepthLabel || "Standard review",
    reviewFocus: reviewContext?.raw?.reviewFocus || "all",
    screenComprehension: engineResult?.metadata?.screenComprehension || null,
    reviewIndicators: engineResult?.metadata?.reviewIndicators || null,
    synthesisSummary: engineResult?.metadata?.synthesisSummary || "",
    visualAnalysis: visualAnalysis || engineResult?.metadata?.visualAnalysis || null,
    designReview: {
      sourceType: reviewContext?.sourceType || "webpage-capture",
      isDesignScreen: Boolean(reviewContext?.isDesignScreen),
      isImageOnly: Boolean(reviewContext?.isImageOnly),
      reviewScope: target?.type || "full-visible-page",
      target
    }
  };
}
