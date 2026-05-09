import { buildOllamaStaticDesignPrompt } from "./ollama-static-design-system-prompt.js";

export function buildOllamaGapAnalysisPrompt(context) {
  return buildOllamaStaticDesignPrompt({
    ...context,
    passName: "Gap analysis",
    passGoal:
      "Compare deterministic findings and candidate AI findings. Identify whether deterministic findings are too narrow, which broader issues are missing, what should be merged, and what should be rejected as low confidence. Return only additive high-confidence findings."
  });
}
