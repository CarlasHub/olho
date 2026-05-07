import { createFinding, elementLabel, missingActions } from "../rule-utils.js";

export const smallTouchTargetsRule = {
  id: "accessibility-visible/small-touch-targets",
  getSkipReason(context) {
    return missingActions(context, 1);
  },
  run(context) {
    const target = context.actions.find(
      (action) =>
        action.bounds.width > 0 &&
        action.bounds.height > 0 &&
        (action.bounds.width < context.profile.thresholds.minTouchTargetPx ||
          action.bounds.height < context.profile.thresholds.minTouchTargetPx)
    );
    if (!target) return null;

    // Fitts' Law and WCAG 2.2 target-size guidance support a practical 44px minimum for reliable activation.
    return createFinding(context, {
      ruleId: this.id,
      category: "accessibility-visible",
      severity: "medium",
      region: "Interactive target size",
      element: target,
      selector: target.selector,
      issue: "An interactive target appears too small.",
      evidence: `"${elementLabel(target)}" measures roughly ${Math.round(target.bounds.width)} x ${Math.round(target.bounds.height)}px.`,
      impact: "Small controls are harder to acquire with touch, trackpads, tremor, or motor constraints.",
      recommendation: "Increase the control's interactive hit area to at least 44 x 44px or add equivalent padding around it.",
      confidence: 0.84
    });
  }
};

export default smallTouchTargetsRule;
