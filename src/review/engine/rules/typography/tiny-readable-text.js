import { createFinding, elementLabel, missingText } from "../rule-utils.js";

export const tinyReadableTextRule = {
  id: "typography/tiny-readable-text",
  getSkipReason(context) {
    return missingText(context, 1);
  },
  run(context) {
    const tiny = context.textBlocks.find((block) => block.style.fontSize > 0 && block.style.fontSize < 12 && block.text.length > 8);
    if (!tiny) return null;

    // WCAG readability guidance and enterprise accessibility practice treat very small text as a visible access risk.
    return createFinding(context, {
      ruleId: this.id,
      category: "accessibility-visible",
      severity: "medium",
      region: "Typography",
      element: tiny,
      selector: tiny.selector,
      issue: "Readable text appears too small.",
      evidence: `"${elementLabel(tiny)}" is rendered at approximately ${tiny.style.fontSize}px.`,
      impact: "Small text can exclude users with low vision and increases reading effort in operational workflows.",
      recommendation: "Raise body and supporting text to a comfortable minimum size and reserve tiny text for nonessential metadata only.",
      confidence: 0.82
    });
  }
};

export default tinyReadableTextRule;
