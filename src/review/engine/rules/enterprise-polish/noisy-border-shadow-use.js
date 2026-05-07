import { createFinding, missingComponents } from "../rule-utils.js";

export const noisyBorderShadowUseRule = {
  id: "enterprise-polish/noisy-border-shadow-use",
  getSkipReason(context) {
    return missingComponents(context, 5);
  },
  run(context) {
    const decorated = context.components.filter((component) => {
      const hasShadow = component.style.boxShadow && component.style.boxShadow !== "none";
      const hasBorder = component.style.border || component.style.borderColor;
      return hasShadow && hasBorder;
    });
    if (decorated.length < 5) return null;

    // Enterprise polish relies on restrained elevation; excessive border plus shadow treatment creates visual noise.
    return createFinding(context, {
      ruleId: this.id,
      category: "enterprise-polish",
      severity: "medium",
      region: "Surface polish",
      element: decorated[0],
      selector: decorated[0].selector,
      issue: "Border and shadow usage creates unnecessary visual noise.",
      evidence: `${decorated.length} visible components combine border and shadow treatments.`,
      impact: "Noisy surfaces compete with content and make enterprise workflows feel heavier than necessary.",
      recommendation: "Use either border or elevation intentionally, and reserve stronger elevation for overlays or high-priority surfaces.",
      confidence: 0.72
    });
  }
};

export default noisyBorderShadowUseRule;
