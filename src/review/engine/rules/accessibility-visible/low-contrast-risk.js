import { isLowContrastRisk } from "../../../utils/colour-utils.js";
import { createFinding, elementLabel, missingText } from "../rule-utils.js";

export const lowContrastRiskRule = {
  id: "accessibility-visible/low-contrast-risk",
  getSkipReason(context) {
    return missingText(context, 1);
  },
  run(context) {
    const lowContrast = context.textBlocks.find((block) =>
      isLowContrastRisk({
        color: block.style.color,
        backgroundColor: block.style.backgroundColor,
        fontSize: block.style.fontSize,
        fontWeight: block.style.fontWeight
      })
    );
    if (!lowContrast) return null;

    // WCAG 2.2 contrast thresholds are visible accessibility guardrails, not style preferences.
    return createFinding(context, {
      ruleId: this.id,
      category: "accessibility-visible",
      severity: "high",
      region: "Text contrast",
      element: lowContrast,
      selector: lowContrast.selector,
      issue: "Text contrast appears below accessible readability thresholds.",
      evidence: `"${elementLabel(lowContrast).slice(0, 90)}" has an estimated contrast ratio of ${lowContrast.style.contrast?.toFixed?.(2) || "below threshold"}.`,
      impact: "Low contrast can prevent users with low vision or glare-heavy environments from reading important information.",
      recommendation: "Increase foreground/background contrast to meet WCAG contrast expectations for the text size.",
      confidence: 0.86
    });
  }
};

export default lowContrastRiskRule;
