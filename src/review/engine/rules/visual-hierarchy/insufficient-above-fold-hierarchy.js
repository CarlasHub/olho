import { aboveFoldElements } from "../../../utils/review-regions.js";
import { rankByVisualWeight } from "../../../utils/visual-weight.js";
import { createFinding, missingElements } from "../rule-utils.js";

export const insufficientAboveFoldHierarchyRule = {
  id: "visual-hierarchy/insufficient-above-fold-hierarchy",
  getSkipReason(context) {
    return missingElements(context, 5);
  },
  run(context) {
    const aboveFold = aboveFoldElements(context);
    const headings = aboveFold.filter((element) => element.isHeading);
    const actions = aboveFold.filter((element) => element.isButton);
    if (aboveFold.length < 5 || headings.length === 0 || actions.length === 0) return null;
    const leadingHeading = headings.slice().sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)[0];
    if (leadingHeading && Number(leadingHeading.style?.fontSize || 0) >= 32) return null;
    const ranked = rankByVisualWeight(aboveFold, context);
    const topIsHeadingOrAction = ranked[0]?.element?.isHeading || ranked[0]?.element?.isButton;

    // Enterprise screens need immediate orientation above the fold; this follows scanability and task-entry guidance.
    if (topIsHeadingOrAction) return null;

    return createFinding(context, {
      ruleId: this.id,
      category: "visual-hierarchy",
      severity: "medium",
      region: "Above-fold hierarchy",
      element: ranked[0].element,
      selector: ranked[0].element.selector,
      issue: "The above-fold area does not clearly prioritize orientation or action.",
      evidence: "The visually strongest above-fold element is neither a heading nor a primary action.",
      impact: "Users may need extra time to understand the page purpose before they can act confidently.",
      recommendation: "Promote the primary heading or task action above decorative or secondary elements in the above-fold area.",
      confidence: 0.69
    });
  }
};

export default insufficientAboveFoldHierarchyRule;
