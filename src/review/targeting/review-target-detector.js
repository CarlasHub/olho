import { detectDesignSource } from "../design/design-source-detector.js";
import { detectFigmaTarget, isFigmaTab } from "./figma-target-detector.js";
import { detectLivePageTarget } from "./live-page-target-detector.js";
import { REVIEW_TARGET_TYPES } from "./target-region-model.js";
import { detectZeplinTarget, isZeplinTab } from "./zeplin-target-detector.js";

export function detectReviewSourceForTab(tab = {}) {
  const detected = detectDesignSource({
    metadata: {
      sourceUrl: tab.url || tab.pendingUrl || "",
      title: tab.title || ""
    }
  });
  if (detected.sourceType && detected.sourceType !== "unknown") return detected;
  return {
    sourceType: "webpage-capture",
    isDesignScreen: false,
    platform: "",
    confidence: 0.7,
    reason: "Current visible webpage."
  };
}

export function detectReviewTarget({ tab, metrics = {}, mode = "visible-view" } = {}) {
  const viewport = metrics.viewport || metrics.image || {};
  const source = detectReviewSourceForTab(tab);
  const wantsDesignArea = mode === "design-area-only" || (mode === "visible-view" && (isZeplinTab(tab) || isFigmaTab(tab)));

  if (wantsDesignArea) {
    const designTarget =
      detectZeplinTarget({ tab, metrics, viewport, mode: "design-area-only" }) ||
      detectFigmaTarget({ tab, metrics, viewport, mode: "design-area-only" });
    if (designTarget) {
      return {
        source,
        target: designTarget,
        requiresManualSelection: designTarget.confidence < 0.5
      };
    }
  }

  const target = detectLivePageTarget({ viewport });
  return {
    source,
    target: {
      ...target,
      type: mode === "selected-region" ? REVIEW_TARGET_TYPES.WEBPAGE_REGION : target.type
    },
    requiresManualSelection: false
  };
}
