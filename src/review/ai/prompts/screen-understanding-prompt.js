import { buildReviewerPrompt } from "./system-reviewer-prompt.js";

export function buildScreenUnderstandingPrompt(context) {
  return buildReviewerPrompt({
    passName: "Screen understanding",
    focus:
      "Identify the visible screen type, primary regions, scan path, and immediately visible ambiguity. Generate findings only when the visible structure creates a high-confidence review issue.",
    context
  });
}
