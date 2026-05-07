import { buildReviewerPrompt } from "./system-reviewer-prompt.js";

export function buildVisualHierarchyPrompt(context) {
  return buildReviewerPrompt({
    passName: "Visual hierarchy review",
    focus:
      "Evaluate primary action clarity, heading emphasis, focal point strength, above-fold priority, and whether competing elements dilute the intended scan order.",
    context
  });
}
