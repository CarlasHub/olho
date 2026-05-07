import { inconsistentSignaturePairs } from "../../../utils/component-signature.js";
import { createFinding, elementLabel, missingActions } from "../rule-utils.js";

export const inconsistentButtonStylesRule = {
  id: "design-system/inconsistent-button-styles",
  getSkipReason(context) {
    return missingActions(context, 3);
  },
  run(context) {
    const pairs = inconsistentSignaturePairs(context.actions, 3);
    if (!pairs.length) return null;
    const pair = pairs[0];

    // Mature enterprise systems distinguish button hierarchy without randomizing component construction.
    return createFinding(context, {
      ruleId: this.id,
      category: "design-system",
      severity: "medium",
      region: "Button system",
      element: pair.first,
      selector: pair.first.selector,
      issue: "Buttons use inconsistent visual treatments.",
      evidence: `"${elementLabel(pair.first)}" and "${elementLabel(pair.second)}" differ across several style attributes beyond normal hierarchy.`,
      impact: "Button inconsistency makes action priority harder to learn and weakens design-system trust.",
      recommendation: "Map buttons to a small set of approved variants and use hierarchy tokens consistently.",
      confidence: 0.78
    });
  }
};

export default inconsistentButtonStylesRule;
