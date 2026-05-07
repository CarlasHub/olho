import { createFinding, missingElements } from "../rule-utils.js";

export const excessiveDensityRule = {
  id: "enterprise-polish/excessive-density",
  getSkipReason(context) {
    return missingElements(context, 12);
  },
  run(context) {
    const density = context.densityMetrics.elementDensity;
    const interactive = context.densityMetrics.interactiveCount;
    if (density < context.profile.thresholds.highDensityElementsPer100kPx || interactive < 8) return null;

    // Hick's Law and Miller's Law support reducing simultaneous options and chunking dense enterprise screens.
    return createFinding(context, {
      ruleId: this.id,
      category: "enterprise-polish",
      severity: "medium",
      region: "Screen density",
      issue: "The screen feels excessively dense for repeated product use.",
      evidence: `The visible area contains ${context.densityMetrics.elementCount} measured elements and ${interactive} interactive targets.`,
      impact: "Excessive density increases scanning effort and reduces perceived quality in enterprise workflows.",
      recommendation: "Prioritize the primary workflow, collapse secondary controls, and group related options into clearer task areas.",
      confidence: 0.76
    });
  }
};

export default excessiveDensityRule;
