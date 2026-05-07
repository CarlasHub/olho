import { rankByVisualWeight } from "../../../utils/visual-weight.js";
import { createFinding, elementLabel, missingElements } from "../rule-utils.js";

export const poorSectionPriorityRule = {
  id: "visual-hierarchy/poor-section-priority",
  getSkipReason(context) {
    return missingElements(context, 6);
  },
  run(context) {
    const topHalf = context.elements.filter((element) => element.bounds.y < context.viewport.height * 0.5);
    const lowerHalf = context.elements.filter((element) => element.bounds.y >= context.viewport.height * 0.5);
    if (topHalf.length < 3 || lowerHalf.length < 3) return null;
    const topWeight = rankByVisualWeight(topHalf, context)[0];
    const lowerWeight = rankByVisualWeight(lowerHalf, context)[0];
    if (!topWeight || !lowerWeight || topWeight.weight >= lowerWeight.weight * 0.9) return null;

    // Nielsen Norman Group scanning research supports placing high-priority information early in the visual path.
    return createFinding(context, {
      ruleId: this.id,
      category: "visual-hierarchy",
      severity: "medium",
      region: "Section priority",
      element: lowerWeight.element,
      selector: lowerWeight.element.selector,
      issue: "Lower-page content visually outweighs the opening section.",
      evidence: `"${elementLabel(lowerWeight.element)}" carries more visual weight than the strongest element in the upper half of the screenshot.`,
      impact: "Users may miss the intended first message or action because the visual priority is pulled away from the opening context.",
      recommendation: "Rebalance the opening section so the most important message or action appears earlier and with stronger emphasis.",
      confidence: 0.72
    });
  }
};

export default poorSectionPriorityRule;
