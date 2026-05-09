import { buildOllamaStaticDesignPrompt } from "./ollama-static-design-system-prompt.js";

export function buildOllamaScreenUnderstandingPrompt(context) {
  return buildOllamaStaticDesignPrompt({
    ...context,
    passName: "Screen understanding",
    passGoal:
      "Identify interface type, likely user goal, primary message, primary action, main regions, intended reading path, ignored areas, and limitations. If a screenshot was supplied for this pass, return structural observations in modelObservations with source model_observation. Return findings only when comprehension ambiguity is visible and high confidence."
  });
}
