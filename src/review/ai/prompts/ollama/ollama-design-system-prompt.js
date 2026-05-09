import { buildOllamaStaticDesignPrompt } from "./ollama-static-design-system-prompt.js";

export function buildOllamaDesignSystemPrompt(context) {
  return buildOllamaStaticDesignPrompt({
    ...context,
    passName: "Design-system review",
    passGoal:
      "Assess button consistency, card treatment, spacing scale, radius/shadow usage, icon treatment, typography scale, repeated component quality, and visible drift from a coherent product system."
  });
}
