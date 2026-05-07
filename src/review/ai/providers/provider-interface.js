import { AiProviderConfigurationError, AiProviderRequestError } from "../ai-review-errors.js";

export function requireFetch(fetchImpl) {
  const resolved = fetchImpl || globalThis.fetch;
  if (typeof resolved !== "function") {
    throw new AiProviderConfigurationError("This AI provider requires fetch support in the current runtime.");
  }
  return resolved;
}

export function requireModel(settings = {}, providerLabel = "AI provider") {
  const model = String(settings.model || "").trim();
  if (!model) {
    throw new AiProviderConfigurationError(`${providerLabel} requires a model before AI review can run.`);
  }
  return model;
}

export function requireApiKey(settings = {}, providerLabel = "AI provider") {
  const apiKey = String(settings.apiKey || "").trim();
  if (!apiKey) {
    throw new AiProviderConfigurationError(`${providerLabel} requires an API key before AI review can run.`);
  }
  return apiKey;
}

export function providerJsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    ...extra
  };
}

export async function readProviderJson(response, providerLabel) {
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const detail = json?.error?.message || json?.message || text || `${providerLabel} request failed.`;
    throw new AiProviderRequestError(`${providerLabel} request failed: ${detail}`, {
      details: {
        status: response.status,
        statusText: response.statusText
      }
    });
  }

  return json;
}

export function createProviderResult({ text, raw = null, providerId, passId }) {
  return {
    providerId,
    passId,
    text: String(text || ""),
    raw
  };
}

export function assertProviderShape(provider) {
  if (!provider || typeof provider !== "object") {
    throw new AiProviderConfigurationError("AI provider registry returned an invalid provider.");
  }
  ["id", "label", "supportsVision", "runPass", "testConnection"].forEach((field) => {
    if (!(field in provider)) {
      throw new AiProviderConfigurationError(`AI provider is missing required field: ${field}.`);
    }
  });
  return provider;
}
