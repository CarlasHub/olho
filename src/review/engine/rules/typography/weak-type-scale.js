import { fontSizeSpread } from "../../../utils/typography-utils.js";
import { createFinding, missingText } from "../rule-utils.js";

export const weakTypeScaleRule = {
  id: "typography/weak-type-scale",
  getSkipReason(context) {
    return missingText(context, 4);
  },
  run(context) {
    const spread = fontSizeSpread(context.textBlocks);
    if (spread.unique.length < 3 || spread.ratio >= 1.45) return null;

    // Type scale creates scannable hierarchy; weak scale flattens content priority.
    return createFinding(context, {
      ruleId: this.id,
      category: "visual-hierarchy",
      severity: "medium",
      region: "Type hierarchy",
      issue: "The type scale is too compressed to support quick scanning.",
      evidence: `Measured text ranges from ${Math.round(spread.min)}px to ${Math.round(spread.max)}px, a ${spread.ratio.toFixed(1)}x spread.`,
      impact: "A compressed type scale makes headings, labels, and body content feel equally important.",
      recommendation: "Strengthen the type scale with clearer differences between headings, section labels, body copy, and metadata.",
      confidence: 0.74
    });
  }
};

export default weakTypeScaleRule;
