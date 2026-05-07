import { createFinding, missingComponents } from "../rule-utils.js";

export const missingElevationSystemRule = {
  id: "enterprise-polish/missing-elevation-system",
  getSkipReason(context) {
    return missingComponents(context, 4);
  },
  run(context) {
    const surfaces = context.components.filter((component) => component.isCard || /modal|menu|popover|panel/i.test(component.selector));
    if (surfaces.length < 4) return null;
    const shadowValues = surfaces.map((surface) => String(surface.style.boxShadow || "none").toLowerCase());
    const unique = new Set(shadowValues).size;
    if (unique > 1 && unique <= 3) return null;

    // Elevation should communicate surface hierarchy consistently, as in mature enterprise design systems.
    return createFinding(context, {
      ruleId: this.id,
      category: "enterprise-polish",
      severity: "low",
      region: "Elevation system",
      element: surfaces[0],
      selector: surfaces[0].selector,
      issue: "Surface elevation does not appear to follow a clear system.",
      evidence: `${surfaces.length} surface-like components use ${unique} elevation treatments.`,
      impact: "Unclear elevation makes it harder to distinguish base content, raised panels, menus, and overlays.",
      recommendation: "Define a small elevation scale and apply it consistently by surface role.",
      confidence: 0.66
    });
  }
};

export default missingElevationSystemRule;
