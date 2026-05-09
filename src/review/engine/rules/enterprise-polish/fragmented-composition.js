import { proximityGroups } from "../../../utils/gestalt-utils.js";
import { createFinding, missingElements } from "../rule-utils.js";

export const fragmentedCompositionRule = {
  id: "enterprise-polish/fragmented-composition",
  getSkipReason(context) {
    return missingElements(context, 10);
  },
  run(context) {
    const groups = proximityGroups(context.elements, 28);
    if (groups.length < 8) return null;

    // Gestalt grouping and continuity help complex screens feel coherent rather than assembled from fragments.
    return createFinding(context, {
      ruleId: this.id,
      category: "enterprise-polish",
      severity: "medium",
      region: "Overall composition",
      issue: "The composition feels fragmented across too many small groups.",
      evidence: `Measured ${groups.length} separate proximity groups in the visible screenshot.`,
      impact: "Fragmentation makes the screen feel less calm and increases the effort required to understand relationships.",
      recommendation: "Consolidate related content into fewer, clearer regions with stronger grouping and alignment.",
      confidence: 0.72
    });
  }
};

export default fragmentedCompositionRule;
