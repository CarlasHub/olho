import { detectCentralDesignArea } from "../design/design-area-detector.js";
import {
  createReviewTarget,
  percentBoundsToViewportRect,
  REVIEW_TARGET_SOURCES,
  REVIEW_TARGET_TYPES
} from "./target-region-model.js";

export function detectDesignAreaTarget({ sourceType, metrics = {}, viewport = {}, label = "Design area" } = {}) {
  const area = detectCentralDesignArea({
    sourceType,
    elements: metrics.elements || [],
    viewport,
    image: metrics.image || metrics.imageMetrics || viewport
  });
  const bounds = percentBoundsToViewportRect(area.bounds, viewport);
  const confidence = Number(area.confidence || 0);
  const limitations = [];
  if (confidence < 0.62) {
    limitations.push("Automatic design-area isolation has low confidence. Select review area manually if markers look misaligned.");
  }
  return createReviewTarget({
    id: `${sourceType || "design"}-central-artboard`,
    type: REVIEW_TARGET_TYPES.CENTRAL_DESIGN_ARTBOARD,
    label,
    bounds,
    viewport,
    source: REVIEW_TARGET_SOURCES.DESIGN_TOOL,
    confidence,
    limitations,
    excludesPageChrome: true
  });
}
