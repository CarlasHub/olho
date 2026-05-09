import { buildOllamaStaticDesignPrompt } from "./ollama-static-design-system-prompt.js";

export function buildOllamaRegionReviewPrompt(context) {
  return buildOllamaStaticDesignPrompt({
    ...context,
    passName: "Region review",
    passGoal:
      "Review each major region for structural clarity, visual hierarchy problems, spacing/density issues, CTA clarity, and accessibility-visible risks. Tie every finding to a named region."
  });
}
