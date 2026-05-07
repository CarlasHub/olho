import { visualWeightRatio } from "../../../utils/visual-weight.js";
import { createFinding, elementLabel, firstSelector, missingActions } from "../rule-utils.js";

export const competingPrimaryActionsRule = {
  id: "visual-hierarchy/competing-primary-actions",
  getSkipReason(context) {
    return missingActions(context, 2);
  },
  run(context) {
    const actions = context.actions.filter((action) => action.bounds.width >= 64 && action.bounds.height >= 28);
    if (actions.length < 2) return null;
    const sorted = actions.slice().sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x).slice(0, 4);
    const [first, second] = sorted;
    const ratio = visualWeightRatio(first, second, context);

    // Nielsen Norman Group hierarchy guidance and Hick's Law both support one clearly dominant next action.
    if (!ratio || ratio > context.profile.thresholds.maxPrimaryActionWeightRatio) return null;

    return createFinding(context, {
      ruleId: this.id,
      category: "visual-hierarchy",
      severity: "medium",
      region: "Primary actions",
      element: first,
      selector: firstSelector([first, second]),
      issue: "Primary and secondary actions compete for attention.",
      evidence: `"${elementLabel(first)}" and "${elementLabel(second)}" have nearly identical visual weight, size, and placement.`,
      impact: "When the next action is not visually obvious, users spend more effort deciding what to do and task completion becomes less reliable.",
      recommendation: "Make the preferred action visibly dominant through stronger emphasis, clearer placement, or reduced secondary-button weight.",
      confidence: 0.78
    });
  }
};

export default competingPrimaryActionsRule;
