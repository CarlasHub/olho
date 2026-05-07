import { createFinding } from "../rule-utils.js";

export const inconsistentIconTreatmentRule = {
  id: "design-system/inconsistent-icon-treatment",
  getSkipReason(context) {
    const icons = context.components.filter((component) => component.isIcon);
    return icons.length < 3 ? "Icon component metrics are unavailable." : "";
  },
  run(context) {
    const icons = context.components.filter((component) => component.isIcon);
    const sizes = icons.map((icon) => Math.round(Math.max(icon.bounds.width, icon.bounds.height))).filter((size) => size > 0);
    const colors = icons.map((icon) => String(icon.style.color || icon.style.backgroundColor || "").toLowerCase()).filter(Boolean);
    const sizeSpread = sizes.length ? Math.max(...sizes) - Math.min(...sizes) : 0;
    const colorCount = new Set(colors).size;
    if (sizeSpread <= 8 && colorCount <= 3) return null;

    // Icon consistency supports rapid recognition through Gestalt similarity.
    return createFinding(context, {
      ruleId: this.id,
      category: "design-system",
      severity: "low",
      region: "Icon system",
      element: icons[0],
      selector: icons[0].selector,
      issue: "Icon treatment is inconsistent across the interface.",
      evidence: `Measured icons vary by ${sizeSpread}px in size and use ${colorCount} visible colour treatments.`,
      impact: "Inconsistent icons reduce recognition speed and make the product feel less governed.",
      recommendation: "Standardize icon size, stroke/fill style, and colour roles across repeated controls.",
      confidence: 0.68
    });
  }
};

export default inconsistentIconTreatmentRule;
