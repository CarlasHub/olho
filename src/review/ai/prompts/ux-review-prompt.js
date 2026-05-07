import { buildReviewerPrompt } from "./system-reviewer-prompt.js";

export function buildUxReviewPrompt(context) {
  return buildReviewerPrompt({
    passName: "UX review",
    focus:
      "Evaluate task clarity, cognitive load, discoverability, information grouping, decision effort, and visible interaction affordance without inventing hidden workflows.",
    context
  });
}
