import { buildOllamaStaticDesignPrompt } from "./ollama-static-design-system-prompt.js";

export function buildOllamaAccessibilityVisiblePrompt(context) {
  return buildOllamaStaticDesignPrompt({
    ...context,
    passName: "Accessibility-visible review",
    passGoal:
      "Assess visible readability, contrast risk, type size, visual affordance, target clarity, colour-only communication, and cognitive load. Do not claim code-level accessibility or WCAG failure without reliable measured data."
  });
}
