import { rankByVisualWeight } from "../../../utils/visual-weight.js";
import { createFinding, elementLabel, missingElements } from "../rule-utils.js";

export const unclearFocalPointRule = {
  id: "visual-hierarchy/unclear-focal-point",
  getSkipReason(context) {
    return missingElements(context, 5);
  },
  run(context) {
    const ranked = rankByVisualWeight(context.elements, context).slice(0, 5);
    if (ranked.length < 3) return null;
    const [first, second, third] = ranked;
    const spread = first.weight - third.weight;

    // Good screen composition gives users a focal point; Gestalt figure-ground clarity reduces visual search effort.
    if (spread > 0.16 || first.weight > second.weight * 1.35) return null;

    return createFinding(context, {
      ruleId: this.id,
      category: "visual-hierarchy",
      severity: "medium",
      region: "Above-fold composition",
      element: first.element,
      selector: first.element.selector,
      issue: "The screen lacks a clear visual focal point.",
      evidence: `The strongest visible elements, including "${elementLabel(first.element)}" and "${elementLabel(second.element)}", have similar visual weight.`,
      impact: "Without a clear focal point, users must visually parse more of the screen before understanding what matters most.",
      recommendation: "Choose one primary anchor and reduce competing emphasis around it through size, contrast, spacing, or grouping.",
      confidence: 0.7
    });
  }
};

export default unclearFocalPointRule;
