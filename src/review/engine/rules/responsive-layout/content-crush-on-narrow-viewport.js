import { createFinding, missingElements } from "../rule-utils.js";

export const contentCrushOnNarrowViewportRule = {
  id: "responsive-layout/content-crush-on-narrow-viewport",
  getSkipReason(context) {
    return missingElements(context, 8);
  },
  run(context) {
    const width = context.viewport.width || context.image.width;
    if (!width || width > 640) return null;
    const narrowControls = context.actions.filter((action) => action.bounds.width < 72);
    const density = context.densityMetrics.elementDensity;
    if (narrowControls.length < 4 && density < context.profile.thresholds.highDensityElementsPer100kPx) return null;

    // Responsive layout quality depends on preserving readable targets and hierarchy under narrow constraints.
    return createFinding(context, {
      ruleId: this.id,
      category: "responsive-layout",
      severity: "medium",
      region: "Narrow viewport layout",
      issue: "Content appears crushed in the narrow viewport.",
      evidence: `Viewport width is ${Math.round(width)}px with ${narrowControls.length} narrow controls and density ${density.toFixed(1)} per 100k pixels.`,
      impact: "Crushed layouts reduce readability and make touch or keyboard workflows less reliable on smaller screens.",
      recommendation: "Introduce responsive stacking, reduce simultaneous controls, and protect minimum target sizes at narrow widths.",
      confidence: 0.76
    });
  }
};

export default contentCrushOnNarrowViewportRule;
