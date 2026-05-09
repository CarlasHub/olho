import { buildOllamaStaticDesignPrompt } from "./ollama-static-design-system-prompt.js";

export function buildOllamaFinalSynthesisPrompt(context) {
  return buildOllamaStaticDesignPrompt({
    ...context,
    passName: "Final synthesis",
    passGoal:
      "Return the final 5 to 12 prioritised findings that best represent real user impact. Merge overlapping observations, preserve strongest visible evidence, reject weak issues, and make recommendations release-actionable."
  });
}
