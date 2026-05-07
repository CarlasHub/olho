import { createFinding, elementLabel, missingActions } from "../rule-utils.js";

export const weakFocusVisibilityRiskRule = {
  id: "accessibility-visible/weak-focus-visibility-risk",
  getSkipReason(context) {
    return missingActions(context, 1);
  },
  run(context) {
    const weak = context.actions.find((action) => {
      const outline = String(action.style.outline || action.style.focusOutline || "").toLowerCase();
      const boxShadow = String(action.style.focusBoxShadow || action.style.boxShadow || "").toLowerCase();
      return action.state?.focused && (!outline || outline === "none") && (!boxShadow || boxShadow === "none");
    });
    if (!weak) return null;

    // WCAG 2.2 visible focus requirements support a clear keyboard focus indicator.
    return createFinding(context, {
      ruleId: this.id,
      category: "accessibility-visible",
      severity: "high",
      region: "Keyboard focus",
      element: weak,
      selector: weak.selector,
      issue: "Keyboard focus visibility appears weak.",
      evidence: `"${elementLabel(weak)}" is marked focused but has no visible outline or focus shadow in the supplied style metrics.`,
      impact: "Keyboard users can lose their place and may be unable to operate the workflow confidently.",
      recommendation: "Provide a visible focus indicator with sufficient contrast and area around all interactive controls.",
      confidence: 0.8
    });
  }
};

export default weakFocusVisibilityRiskRule;
