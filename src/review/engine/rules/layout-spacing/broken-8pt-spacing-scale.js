import { adjacentVerticalGaps, isOnSpacingScale } from "../../../utils/spacing-utils.js";
import { createFinding, missingElements } from "../rule-utils.js";

export const brokenEightPointSpacingScaleRule = {
  id: "layout-spacing/broken-8pt-spacing-scale",
  getSkipReason(context) {
    return missingElements(context, 6);
  },
  run(context) {
    const gaps = adjacentVerticalGaps(context.elements).filter((gap) => gap >= 4 && gap <= 96);
    if (gaps.length < 6) return null;
    const offScale = gaps.filter((gap) => !isOnSpacingScale(gap, { step: 8, tolerance: 2 }));
    if (offScale.length / gaps.length < 0.55) return null;

    // Mature enterprise systems commonly use 4/8pt spacing tokens to create predictable rhythm and implementation consistency.
    return createFinding(context, {
      ruleId: this.id,
      category: "design-system",
      severity: "low",
      region: "Spacing system",
      issue: "Spacing does not appear to follow a stable 8-point rhythm.",
      evidence: `${offScale.length} of ${gaps.length} measured adjacent gaps fall outside a tolerant 8-point spacing scale.`,
      impact: "Off-scale spacing makes the UI harder to maintain and weakens the sense of system-level polish.",
      recommendation: "Map recurring vertical and horizontal gaps to a defined spacing token set, preferably a 4/8pt scale.",
      confidence: 0.68
    });
  }
};

export default brokenEightPointSpacingScaleRule;
