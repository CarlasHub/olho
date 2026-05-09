import { buildOllamaStaticDesignPrompt } from "./ollama-static-design-system-prompt.js";

export function buildOllamaUxClarityPrompt(context) {
  return buildOllamaStaticDesignPrompt({
    ...context,
    passName: "UX clarity review",
    passGoal:
      "Assess cognitive load, decision clarity, scanability, discoverability, action clarity, and whether visible content supports the likely user task without inventing hidden workflows."
  });
}
