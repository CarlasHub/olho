import { aiReviewJsonContractText } from "../../ai-review-schema.js";

export function buildOllamaJsonRepairPrompt({ invalidText = "", parseError = "", passId = "" } = {}) {
  return [
    "Repair the following Ollama review response into valid JSON only.",
    "Do not add new findings. Preserve only findings that already appear in the invalid response.",
    "If no valid finding can be recovered, return {\"findings\":[]}.",
    `Original pass: ${passId || "unknown"}`,
    `Parse error: ${parseError || "unknown"}`,
    aiReviewJsonContractText(),
    "",
    "Invalid response:",
    String(invalidText || "").slice(0, 12000)
  ].join("\n");
}
