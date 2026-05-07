import { buildReviewerPrompt } from "./system-reviewer-prompt.js";

export function buildAccessibilityVisiblePrompt(context) {
  return buildReviewerPrompt({
    passName: "Accessibility-visible review",
    focus:
      "Evaluate visible accessibility risks including contrast, target size, focus visibility, error visibility, and status communication. Do not claim full WCAG conformance from a screenshot.",
    context
  });
}
