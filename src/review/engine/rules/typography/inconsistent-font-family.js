import { createFinding, missingText } from "../rule-utils.js";

export const inconsistentFontFamilyRule = {
  id: "typography/inconsistent-font-family",
  getSkipReason(context) {
    return missingText(context, 4);
  },
  run(context) {
    const families = context.textBlocks
      .map((block) => block.style.fontFamily)
      .filter(Boolean)
      .map((family) => family.toLowerCase());
    const unique = [...new Set(families)];
    if (unique.length < 3) return null;

    // Enterprise design systems use tightly controlled type families to preserve consistency and trust.
    return createFinding(context, {
      ruleId: this.id,
      category: "design-system",
      severity: "low",
      region: "Typography system",
      issue: "Multiple font families weaken typographic consistency.",
      evidence: `Detected ${unique.length} font-family treatments across visible text.`,
      impact: "Uncontrolled font mixing makes the interface feel less governed and harder to maintain.",
      recommendation: "Consolidate visible text onto the approved product type families and reserve exceptions for explicit brand use.",
      confidence: 0.7
    });
  }
};

export default inconsistentFontFamilyRule;
