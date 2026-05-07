import { defaultAiReviewConfig, getAiProviderSettings } from "../ai-review-config.js";
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
      await readProviderJson(response, PROVIDER_LABEL);
      return {
        ok: true,
        provider: PROVIDER_ID,
        message: "Ollama responded locally."
      };
    },

    async runPass({ prompt, passId, settings = {}, screenshotPayload = null, fetchImpl, signal } = {}) {
      const fetcher = requireFetch(fetchImpl);
      const model = requireModel(settings, PROVIDER_LABEL);
      const payload = {
        model,
        prompt: String(prompt || ""),
        stream: false,
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
