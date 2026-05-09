import { alignmentSpread } from "../../../utils/gestalt-utils.js";
import { createFinding, missingElements, topElements } from "../rule-utils.js";

export const poorAlignmentConsistencyRule = {
  id: "layout-spacing/poor-alignment-consistency",
  getSkipReason(context) {
    return missingElements(context, 5);
  },
  run(context) {
    const comparableElements = context.elements.filter(
      (element) =>
        !element.isInteractive &&
        element.type !== "region" &&
        !["nav", "header", "footer", "main", "section", "article", "aside"].includes(element.tagName)
    );
    const firstElements = topElements(comparableElements, 10);
    const anchorTop = firstElements[0]?.bounds?.y ?? 0;
    const candidates = firstElements.filter((element) => Math.abs(Number(element.bounds?.y || 0) - anchorTop) <= 84);
    const spread = alignmentSpread(candidates, "x");
    if (candidates.length < 3 || spread <= 18) return null;

    // Gestalt continuity and alignment make interfaces faster to scan and compare.
    return createFinding(context, {
      ruleId: this.id,
      category: "design-system",
      severity: "medium",
      region: "Content alignment",
      element: candidates[0],
      selector: candidates[0].selector,
      issue: "Related content does not share a consistent left alignment.",
      evidence: `The first visible content group has a left-edge spread of ${Math.round(spread)}px across related elements.`,
      impact: "Misalignment reduces scanability and makes the interface feel less deliberate.",
      recommendation: "Align related headings, controls, and content blocks to a shared grid or container edge.",
      confidence: 0.72
    });
  }
};

export default poorAlignmentConsistencyRule;
