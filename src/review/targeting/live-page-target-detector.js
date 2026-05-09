import { createReviewTarget, REVIEW_TARGET_SOURCES, REVIEW_TARGET_TYPES } from "./target-region-model.js";

export function detectLivePageTarget({ viewport = {} } = {}) {
  return createReviewTarget({
    id: "visible-page",
    type: REVIEW_TARGET_TYPES.FULL_VISIBLE_PAGE,
    label: "Visible page",
    bounds: {
      x: 0,
      y: 0,
      width: viewport.width || 1,
      height: viewport.height || 1
    },
    viewport,
    source: REVIEW_TARGET_SOURCES.LIVE_DOM,
    confidence: 1,
    limitations: []
  });
}
