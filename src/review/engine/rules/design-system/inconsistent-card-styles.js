import { inconsistentSignaturePairs } from "../../../utils/component-signature.js";
import { createFinding, missingComponents } from "../rule-utils.js";

export const inconsistentCardStylesRule = {
  id: "design-system/inconsistent-card-styles",
  getSkipReason(context) {
    const cards = context.components.filter((component) => component.isCard);
    return cards.length < 3 ? "Card component metrics are unavailable." : "";
  },
  run(context) {
    const cards = context.components.filter((component) => component.isCard);
    if (missingComponents({ ...context, components: cards }, 3)) return null;
    const pairs = inconsistentSignaturePairs(cards, 3);
    if (!pairs.length) return null;

    // Similarity is a Gestalt principle: repeated containers should look related unless their roles differ.
    return createFinding(context, {
      ruleId: this.id,
      category: "design-system",
      severity: "medium",
      region: "Card system",
      element: pairs[0].first,
      selector: pairs[0].first.selector,
      issue: "Repeated cards use inconsistent visual treatment.",
      evidence: "Measured card-like components vary materially in radius, shadow, color, or border treatment.",
      impact: "Inconsistent cards reduce comparability and make the screen feel assembled rather than system-designed.",
      recommendation: "Normalize cards to shared container tokens and reserve distinct treatments for genuinely different states.",
      confidence: 0.75
    });
  }
};

export default inconsistentCardStylesRule;
