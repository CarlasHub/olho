import { parseAiJson } from "../ai/utils/ai-review-normalizer.js";
import {
  normalizeLocalVisionModelResponse,
  validateLocalVisionModelResult
} from "./local-vision-model-schema.js";

export const OLLAMA_LOCAL_VISION_MODEL_PASS_ID = "local-vision-model";

export function buildOllamaLocalVisionModelPrompt({ compressedContext = {}, contextPackage = {} } = {}) {
  return [
    "You are the local vision interpretation layer for Olho Review.",
    "Your job is to extract visual facts from the supplied screenshot/crop, not to produce design critique.",
    "Do not recommend changes. Do not praise the interface. Do not infer hidden functionality.",
    "Only describe visible structure, regions, hierarchy, objects, relationships, and possible visual confusion.",
    "Mark all observations as model_observation. Deterministic measured evidence remains stronger than your interpretation.",
    "Ignore Zeplin/Figma/browser/editor chrome when the context says design-area isolation is active.",
    "Return valid JSON only with this shape:",
    JSON.stringify(
      {
        structuralSummary: {
          interfaceType: "string",
          mainRegions: ["string"],
          likelyReadingPath: "string",
          primaryVisualEmphasis: "string",
          possibleConfusionAreas: ["string"],
          ignoredAreas: ["string"]
        },
        modelObservations: [
          {
            id: "string",
            region: "string",
            observation: "string",
            evidence: "string",
            bounds: null,
            confidence: 0.0,
            source: "model_observation",
            evidence_type: "model_observation"
          }
        ],
        limitations: ["string"]
      },
      null,
      2
    ),
    "",
    "Structured deterministic context:",
    JSON.stringify(compressedContext || contextPackage || {}, null, 2)
  ].join("\n");
}

export async function runOllamaLocalVisionModelInterpretation({
  provider,
  providerSettings,
  screenshotPayload,
  compressedContext,
  contextPackage,
  fetchImpl,
  signal
} = {}) {
  if (!provider || provider.id !== "ollama") {
    throw new Error("Local vision model interpretation currently requires the Ollama provider.");
  }
  if (!screenshotPayload?.shared || !screenshotPayload?.dataBase64) {
    throw new Error("Local vision model interpretation requires an explicitly shared local screenshot/crop.");
  }

  const prompt = buildOllamaLocalVisionModelPrompt({ compressedContext, contextPackage });
  const result = await provider.runPass({
    passId: OLLAMA_LOCAL_VISION_MODEL_PASS_ID,
    prompt,
    settings: providerSettings,
    screenshotPayload,
    fetchImpl,
    signal
  });
  const parsed = parseAiJson(result.text);
  const normalized = normalizeLocalVisionModelResponse(parsed, {
    provider: provider.id,
    model: providerSettings?.model || "",
    architecture: "vlm",
    passId: OLLAMA_LOCAL_VISION_MODEL_PASS_ID
  });
  const validation = validateLocalVisionModelResult(normalized);
  if (!validation.valid) {
    throw new Error(`Local vision model output failed validation: ${validation.errors.join(" ")}`);
  }
  return normalized;
}
