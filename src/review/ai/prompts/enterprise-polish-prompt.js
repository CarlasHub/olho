import { buildReviewerPrompt } from "./system-reviewer-prompt.js";

export function buildEnterprisePolishPrompt(context) {
  return buildReviewerPrompt({
    passName: "Enterprise polish review",
    focus:
      "Evaluate whether the interface feels calm, trustworthy, coherent, and production-grade for enterprise product work. Focus on noisy composition, density, and low-trust visual treatment.",
    context
  });
}
