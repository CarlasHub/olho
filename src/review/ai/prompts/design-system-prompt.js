import { buildReviewerPrompt } from "./system-reviewer-prompt.js";

export function buildDesignSystemPrompt(context) {
  return buildReviewerPrompt({
    passName: "Design-system review",
    focus:
      "Evaluate component consistency, button hierarchy, cards, icons, radius, shadow, spacing tokens, and whether local variations look intentional or accidental.",
    context
  });
}
