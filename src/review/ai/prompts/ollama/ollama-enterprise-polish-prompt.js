import { buildOllamaStaticDesignPrompt } from "./ollama-static-design-system-prompt.js";

export function buildOllamaEnterprisePolishPrompt(context) {
  return buildOllamaStaticDesignPrompt({
    ...context,
    passName: "Enterprise polish review",
    passGoal:
      "Assess visual maturity, trust, compositional refinement, over-decoration, fragmented layout, density balance, product coherence, and perceived release quality."
  });
}
