import { adjacentVerticalGaps, coefficientOfVariation } from "../../../utils/spacing-utils.js";
import { createFinding, missingElements } from "../rule-utils.js";

export const inconsistentSpacingRhythmRule = {
  id: "layout-spacing/inconsistent-spacing-rhythm",
  getSkipReason(context) {
    return missingElements(context, 6);
  },
  run(context) {
    const gaps = adjacentVerticalGaps(context.elements).filter((gap) => gap <= 72);
    if (gaps.length < 5) return null;
    const variation = coefficientOfVariation(gaps);

    // Gestalt proximity depends on predictable spacing rhythm to show what belongs together.
    if (variation < 1.05) return null;

    return createFinding(context, {
      ruleId: this.id,
      category: "design-system",
      severity: "medium",
      region: "Layout rhythm",
      issue: "Vertical spacing rhythm is inconsistent across adjacent content.",
      evidence: `Measured ${gaps.length} adjacent vertical gaps with high variation (${variation.toFixed(2)} coefficient of variation).`,
      impact: "Inconsistent spacing makes related content harder to group and reduces the screen's perceived product quality.",
      recommendation: "Normalize vertical spacing around sections and component groups using a small, repeatable spacing scale.",
      confidence: 0.73
    });
  }
};

export default inconsistentSpacingRhythmRule;
