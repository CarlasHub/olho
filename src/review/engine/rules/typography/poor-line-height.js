import { lineHeightRatio } from "../../../utils/typography-utils.js";
import { createFinding, elementLabel, missingText } from "../rule-utils.js";

export const poorLineHeightRule = {
  id: "typography/poor-line-height",
  getSkipReason(context) {
    return missingText(context, 1);
  },
  run(context) {
    const cramped = context.textBlocks.find((block) => {
      const ratio = lineHeightRatio(block);
      if (block.isHeading || block.type === "heading") return false;
      return ratio !== null && ratio < 1.25 && block.text.length > 80;
    });
    if (!cramped) return null;
    const ratio = lineHeightRatio(cramped);

    // Comfortable text rhythm supports scanability and reduces reading fatigue.
    return createFinding(context, {
      ruleId: this.id,
      category: "ux",
      severity: "low",
      region: "Text readability",
      element: cramped,
      selector: cramped.selector,
      issue: "Line height is cramped for readable text.",
      evidence: `"${elementLabel(cramped).slice(0, 90)}" has a line-height ratio near ${ratio.toFixed(2)}.`,
      impact: "Cramped line height makes dense content harder to read and increases fatigue in review-heavy screens.",
      recommendation: "Increase paragraph line height toward 1.5 for body text and long-form supporting copy.",
      confidence: 0.74
    });
  }
};

export default poorLineHeightRule;
