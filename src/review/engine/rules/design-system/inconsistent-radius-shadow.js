import { createFinding, missingComponents } from "../rule-utils.js";

export const inconsistentRadiusShadowRule = {
  id: "design-system/inconsistent-radius-shadow",
  getSkipReason(context) {
    return missingComponents(context, 4);
  },
  run(context) {
    const radii = context.components.map((component) => Math.round(component.style.borderRadius || 0));
    const shadows = context.components.map((component) => String(component.style.boxShadow || "none").toLowerCase());
    const radiusSet = new Set(radii.filter((value) => value > 0));
    const shadowSet = new Set(shadows.filter((value) => value && value !== "none"));
    if (radiusSet.size < 4 && shadowSet.size < 4) return null;

    // Enterprise design systems use elevation and radius as semantic tokens, not decorative one-offs.
    return createFinding(context, {
      ruleId: this.id,
      category: "design-system",
      severity: "low",
      region: "Surface treatment",
      issue: "Radius and shadow treatments appear ungoverned.",
      evidence: `Detected ${radiusSet.size} radius values and ${shadowSet.size} shadow treatments across components.`,
      impact: "Ungoverned surface treatment weakens hierarchy and makes components harder to classify at a glance.",
      recommendation: "Reduce radius and shadow usage to a small semantic token set for cards, modals, menus, and controls.",
      confidence: 0.7
    });
  }
};

export default inconsistentRadiusShadowRule;
