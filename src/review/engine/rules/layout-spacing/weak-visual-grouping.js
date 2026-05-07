import { proximityGroups } from "../../../utils/gestalt-utils.js";
import { createFinding, missingElements } from "../rule-utils.js";

export const weakVisualGroupingRule = {
  id: "layout-spacing/weak-visual-grouping",
  getSkipReason(context) {
    return missingElements(context, 8);
  },
  run(context) {
    const groups = proximityGroups(context.elements, 20);
    const singletonCount = groups.filter((group) => group.length === 1).length;
    if (groups.length < 5 || singletonCount / groups.length < 0.45) return null;

    // Gestalt proximity says related elements should be spatially grouped; excessive singleton groups fragment meaning.
    return createFinding(context, {
      ruleId: this.id,
      category: "ux",
      severity: "medium",
      region: "Visual grouping",
      issue: "The layout weakly groups related elements.",
      evidence: `${singletonCount} of ${groups.length} proximity groups contain only one measured element.`,
      impact: "Users must infer relationships manually, which increases comprehension effort on dense product screens.",
      recommendation: "Cluster labels, values, controls, and supporting copy into clearer groups with shared spacing and container logic.",
      confidence: 0.71
    });
  }
};

export default weakVisualGroupingRule;
