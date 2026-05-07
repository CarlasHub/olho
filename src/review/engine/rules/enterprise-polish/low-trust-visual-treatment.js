import { createFinding, missingElements } from "../rule-utils.js";

export const lowTrustVisualTreatmentRule = {
  id: "enterprise-polish/low-trust-visual-treatment",
  getSkipReason(context) {
    return missingElements(context, 5);
  },
  run(context) {
    const loudElements = context.elements.filter((element) => {
      const radius = Number(element.style.borderRadius || 0);
      const shadow = String(element.style.boxShadow || "");
      const largeShadow = /(\d{2,})px/.test(shadow);
      return radius > 24 || largeShadow;
    });
    if (loudElements.length < 4) return null;

    // Enterprise product polish usually favors restrained styling, stable hierarchy, and low visual theatrics.
    return createFinding(context, {
      ruleId: this.id,
      category: "enterprise-polish",
      severity: "low",
      region: "Visual treatment",
      element: loudElements[0],
      selector: loudElements[0].selector,
      issue: "The visual treatment may undermine enterprise trust.",
      evidence: `${loudElements.length} visible elements use unusually strong radius or shadow treatments.`,
      impact: "Overly decorative treatment can make operational software feel less mature and less dependable.",
      recommendation: "Reduce decorative effects and use restrained elevation, radius, and contrast to support the task hierarchy.",
      confidence: 0.64
    });
  }
};

export default lowTrustVisualTreatmentRule;
