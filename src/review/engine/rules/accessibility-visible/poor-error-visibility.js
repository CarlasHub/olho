import { createFinding, elementLabel, missingComponents } from "../rule-utils.js";

export const poorErrorVisibilityRule = {
  id: "accessibility-visible/poor-error-visibility",
  getSkipReason(context) {
    return missingComponents(context, 1);
  },
  run(context) {
    const error = context.components.find((component) => /error|invalid|required/i.test(`${component.text} ${component.selector}`));
    if (!error) return null;
    const lowEmphasis = error.style.fontSize > 0 && error.style.fontSize < 12 && (!error.style.contrast || error.style.contrast < 4.5);
    if (!lowEmphasis) return null;

    // Visible error recovery is core usability guidance: errors need proximity, clarity, and sufficient emphasis.
    return createFinding(context, {
      ruleId: this.id,
      category: "accessibility-visible",
      severity: "high",
      region: "Error state",
      element: error,
      selector: error.selector,
      issue: "Error messaging is visually under-emphasized.",
      evidence: `"${elementLabel(error)}" appears small and low-contrast for an error or required-state message.`,
      impact: "Users may miss the problem state, fail to recover, or submit the same error repeatedly.",
      recommendation: "Increase error text visibility and place the message close to the field or control it explains.",
      confidence: 0.78
    });
  }
};

export default poorErrorVisibilityRule;
