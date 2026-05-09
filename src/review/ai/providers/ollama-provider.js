import { defaultAiReviewConfig, getAiProviderSettings } from "../ai-review-config.js";
import { AI_REVIEW_JSON_SCHEMA } from "../ai-review-schema.js";
import {
  createProviderResult,
  providerJsonHeaders,
  readProviderJson,
  requireFetch,
  requireModel
} from "./provider-interface.js";

const PROVIDER_ID = "ollama";
const PROVIDER_LABEL = "Ollama local";

function endpointFromSettings(settings = {}) {
  const fallback = getAiProviderSettings(defaultAiReviewConfig(), PROVIDER_ID).endpoint;
  return String(settings.endpoint || fallback).trim();
}

function ollamaUrl(settings, pathParts) {
  const url = new URL(endpointFromSettings(settings));
  url.pathname = pathParts.join("/");
  return url;
}

function modelName(settings = {}) {
  return String(settings.model || "").trim();
}

function modelLooksVisionCapable(name = "", details = {}) {
  const haystack = [name, JSON.stringify(details || {})].join(" ").toLowerCase();
  return /\b(vision|llava|bakllava|moondream|minicpm-v|qwen2(?:\.5)?vl|qwen-vl|gemma3|llama3\.2-vision)\b/i.test(haystack);
}

function contextWindowFromDetails(details = {}) {
  const info = details.model_info || details.parameters || details.details || {};
  const candidates = [
    info["llama.context_length"],
    info["general.context_length"],
    info.context_length,
    details.context_length,
    details.contextWindow
  ];
  const value = candidates.map(Number).find((number) => Number.isFinite(number) && number > 0);
  return value || null;
}

async function fetchModelDetails({ fetcher, settings, model, signal }) {
  if (!model) return null;
  try {
    const response = await fetcher(ollamaUrl(settings, ["api", "show"]), {
      method: "POST",
      headers: providerJsonHeaders(),
      body: JSON.stringify({ model }),
      signal
    });
    return await readProviderJson(response, PROVIDER_LABEL);
  } catch {
    return null;
  }
}

function capabilitySummary({ model = "", models = [], details = null } = {}) {
  const modelInstalled = Boolean(model && models.some((entry) => entry.name === model || entry.name?.startsWith(`${model}:`)));
  const supportsVision = modelLooksVisionCapable(model, details);
  return {
    reachable: true,
    model,
    modelInstalled,
    capability: supportsVision ? "vision-capable" : modelInstalled ? "text-only" : "unknown",
    supportsVision,
    supportsText: true,
    contextWindow: contextWindowFromDetails(details),
    responseQuality: modelInstalled ? "metadata-ok" : "model-not-installed",
    recommendedForDesignReview: supportsVision,
    limitation: supportsVision
      ? ""
      : modelInstalled
        ? "Selected Ollama model appears text-only. Static design visual review is disabled; use text refine or static design synthesis without screenshot sharing."
        : "Selected Ollama model was not found in the local Ollama model list."
  };
}

export function createOllamaProvider() {
  return {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    supportsVision: true,
    localOnly: true,

    async testConnection({ settings = {}, fetchImpl, signal } = {}) {
      const fetcher = requireFetch(fetchImpl);
      const response = await fetcher(ollamaUrl(settings, ["api", "tags"]), {
        method: "GET",
        signal
      });
      const tags = await readProviderJson(response, PROVIDER_LABEL);
      const models = Array.isArray(tags?.models) ? tags.models : [];
      const selectedModel = modelName(settings);
      const details = await fetchModelDetails({ fetcher, settings, model: selectedModel, signal });
      const capabilities = capabilitySummary({
        model: selectedModel,
        models,
        details
      });
      return {
        ok: true,
        provider: PROVIDER_ID,
        message: "Ollama responded locally.",
        models: models.map((model) => model.name).filter(Boolean),
        capabilities
      };
    },

    async detectCapabilities({ settings = {}, fetchImpl, signal } = {}) {
      return this.testConnection({ settings, fetchImpl, signal });
    },

    async runPass({ prompt, passId, settings = {}, screenshotPayload = null, fetchImpl, signal } = {}) {
      const fetcher = requireFetch(fetchImpl);
      const model = requireModel(settings, PROVIDER_LABEL);
      const payload = {
        model,
        prompt: String(prompt || ""),
        stream: false,
        format: AI_REVIEW_JSON_SCHEMA,
        options: {
          temperature: 0.1,
          top_p: 0.85
        }
      };

      if (screenshotPayload?.dataBase64) {
        payload.images = [screenshotPayload.dataBase64];
      }

      const response = await fetcher(ollamaUrl(settings, ["api", "generate"]), {
        method: "POST",
        headers: providerJsonHeaders(),
        body: JSON.stringify(payload),
        signal
      });
      const json = await readProviderJson(response, PROVIDER_LABEL);
      return createProviderResult({
        providerId: PROVIDER_ID,
        passId,
        text: json?.response || "",
        raw: json
      });
    }
  };
}
