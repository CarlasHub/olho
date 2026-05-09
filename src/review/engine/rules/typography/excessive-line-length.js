import { textLineLengthChars } from "../../../utils/typography-utils.js";
import { createFinding, elementLabel, missingText } from "../rule-utils.js";

function estimatedCharactersPerRenderedLine(block = {}) {
  const fontSize = Number(block.style?.fontSize || 0);
  const width = Number(block.bounds?.width || 0);
  if (!fontSize || !width) return textLineLengthChars(block.text);
  return Math.round(width / (fontSize * 0.55));
}

export const excessiveLineLengthRule = {
  id: "typography/excessive-line-length",
  getSkipReason(context) {
    return missingText(context, 1);
  },
  run(context) {
    const longLine = context.textBlocks.find((block) => {
      if (block.isHeading || block.type === "heading") return false;
      const textLength = textLineLengthChars(block.text);
      if (textLength <= 75) return false;
      if (Number(block.bounds?.height || 0) > Number(block.style?.lineHeightPx || 0) * 1.45) return false;
      return estimatedCharactersPerRenderedLine(block) > 75;
    });
    if (!longLine) return null;
    const length = estimatedCharactersPerRenderedLine(longLine);

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
