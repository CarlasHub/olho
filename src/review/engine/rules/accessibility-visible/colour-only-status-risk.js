import { createFinding, elementLabel, missingComponents } from "../rule-utils.js";

export const colourOnlyStatusRiskRule = {
  id: "accessibility-visible/colour-only-status-risk",
  getSkipReason(context) {
    return missingComponents(context, 1);
  },
  run(context) {
    const status = context.components.find((component) => {
      if (!component.isStatus) return false;
      const text = component.text.trim();
      const hasIconSignal = /icon|check|warning|error|success/i.test(component.selector || component.type || "");
      return text.length <= 2 && !hasIconSignal;
    });
    if (!status) return null;

    // WCAG guidance prohibits conveying status by colour alone because colour perception varies by user and context.
    return createFinding(context, {
      ruleId: this.id,
      category: "accessibility-visible",
      severity: "medium",
      region: "Status communication",
      element: status,
      selector: status.selector,
      issue: "Status may be communicated by colour alone.",
      evidence: `"${elementLabel(status)}" appears to be a status indicator with little or no text or icon differentiation.`,
      impact: "Users who cannot distinguish the colour state may miss important status or error information.",
      recommendation: "Pair colour state with text, icon shape, or explicit status wording.",
      confidence: 0.68
    });
  }
};

export default colourOnlyStatusRiskRule;
