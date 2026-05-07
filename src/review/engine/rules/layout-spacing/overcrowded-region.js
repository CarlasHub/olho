import { createFinding, missingElements } from "../rule-utils.js";

export const overcrowdedRegionRule = {
  id: "layout-spacing/overcrowded-region",
  getSkipReason(context) {
    return missingElements(context, 10);
  },
  run(context) {
    const density = context.densityMetrics.elementDensity;
    if (density < context.profile.thresholds.excessiveDensityElementsPer100kPx) return null;

    // Hick's Law and Miller's Law both caution against excessive simultaneous choices and poor chunking.
    return createFinding(context, {
      ruleId: this.id,
      category: "ux",
      severity: "high",
      region: "Overall layout",
      issue: "The visible region is overcrowded.",
      evidence: `The screenshot contains ${context.densityMetrics.elementCount} measured elements, roughly ${density.toFixed(1)} elements per 100k pixels.`,
      impact: "High density increases visual search cost and makes repeated enterprise workflows feel slower and more error-prone.",
      recommendation: "Group related controls, reduce simultaneous options, and introduce clearer whitespace around the highest-priority task path.",
      confidence: 0.82
    });
  }
};

export default overcrowdedRegionRule;
