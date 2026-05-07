import { textLineLengthChars } from "../../../utils/typography-utils.js";
import { createFinding, elementLabel, missingText } from "../rule-utils.js";

export const excessiveLineLengthRule = {
  id: "typography/excessive-line-length",
  getSkipReason(context) {
    return missingText(context, 1);
  },
  run(context) {
    const longLine = context.textBlocks.find((block) => textLineLengthChars(block.text) > 75);
    if (!longLine) return null;
    const length = textLineLengthChars(longLine.text);

    // Readability research commonly recommends roughly 45-75 characters per line for comfortable reading.
    return createFinding(context, {
      ruleId: this.id,
      category: "ux",
      severity: "low",
      region: "Text readability",
      element: longLine,
      selector: longLine.selector,
      issue: "A text line is too long for comfortable reading.",
      evidence: `"${elementLabel(longLine).slice(0, 90)}" reaches approximately ${length} characters on one line.`,
      impact: "Long lines make it harder to track from one line to the next and reduce comprehension speed.",
      recommendation: "Constrain paragraph width or split long explanatory content into shorter blocks.",
      confidence: 0.76
    });
  }
};

export default excessiveLineLengthRule;
