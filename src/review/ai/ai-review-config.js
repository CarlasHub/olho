import { AI_REVIEW_MODES, isAiReviewMode } from "./ai-review-schema.js";

export const AI_REVIEW_CONFIG_STORAGE_KEY = "olho.review.ai.config.v1";

export const AI_PROVIDER_OPTIONS = Object.freeze([
  {
    id: "ollama",
    label: "Ollama local",
    requiresApiKey: false,
    requiresEndpoint: true,
    supportsVision: true,
    localOnly: true,
    defaultModel: "llama3.2"
  },
  {
    id: "gemini",
    label: "Gemini vision",
    requiresApiKey: true,
    requiresEndpoint: false,
    supportsVision: true,
    localOnly: false,
    defaultModel: "gemini-1.5-flash"
  },
  {
    id: "groq",
    label: "Groq",
    requiresApiKey: true,
    requiresEndpoint: false,
    supportsVision: false,
    localOnly: false,
    defaultModel: "llama-3.3-70b-versatile"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    requiresApiKey: true,
    requiresEndpoint: false,
    supportsVision: true,
    localOnly: false,
    defaultModel: ""
  }
]);

export const AI_REVIEW_MODE_OPTIONS = Object.freeze([
  {
    id: AI_REVIEW_MODES.TEXT_REFINE,
    label: "Text refine",
    description: "Refines deterministic findings without sending a screenshot."
  },
  {
    id: AI_REVIEW_MODES.FULL_VISUAL,
    label: "Full visual review",
    description: "May send the screenshot only when screenshot sharing is enabled."
  }
]);

function defaultOllamaEndpoint() {
  return ["http:", "", "localhost:11434"].join("/");
}

function providerOption(providerId) {
  return AI_PROVIDER_OPTIONS.find((provider) => provider.id === providerId) || AI_PROVIDER_OPTIONS[0];
}

function providerDefaults(providerId) {
  const option = providerOption(providerId);
  return {
    endpoint: option.id === "ollama" ? defaultOllamaEndpoint() : "",
    model: option.defaultModel || "",
    apiKey: ""
  };
}

function defaultProviderSettings() {
  return Object.fromEntries(AI_PROVIDER_OPTIONS.map((provider) => [provider.id, providerDefaults(provider.id)]));
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function normalizeProviderSettings(input = {}) {
  const defaults = defaultProviderSettings();
  const normalized = {};

  AI_PROVIDER_OPTIONS.forEach((provider) => {
    const current = input[provider.id] || {};
    normalized[provider.id] = {
      endpoint: String(current.endpoint || defaults[provider.id].endpoint || "").trim(),
      model: String(current.model || defaults[provider.id].model || "").trim(),
      apiKey: String(current.apiKey || "").trim()
    };
  });

  return normalized;
}

export function defaultAiReviewConfig() {
  return {
    enabled: false,
    provider: "ollama",
    mode: AI_REVIEW_MODES.TEXT_REFINE,
    screenshotSharingEnabled: false,
    screenshotConsentAcknowledged: false,
    providerSettings: defaultProviderSettings()
  };
}

export function normalizeAiReviewConfig(input = {}) {
  const defaults = defaultAiReviewConfig();
  const provider = AI_PROVIDER_OPTIONS.some((option) => option.id === input.provider) ? input.provider : defaults.provider;
  const mode = isAiReviewMode(input.mode) && input.mode !== AI_REVIEW_MODES.OFF ? input.mode : defaults.mode;

  return {
    enabled: Boolean(input.enabled),
    provider,
    mode,
    screenshotSharingEnabled: Boolean(input.screenshotSharingEnabled),
    screenshotConsentAcknowledged: Boolean(input.screenshotConsentAcknowledged),
    providerSettings: normalizeProviderSettings(input.providerSettings)
  };
}

export async function loadAiReviewConfig({ storage } = {}) {
  const target = safeStorage(storage);
  if (!target?.getItem) return defaultAiReviewConfig();

  try {
    const raw = target.getItem(AI_REVIEW_CONFIG_STORAGE_KEY);
    return normalizeAiReviewConfig(raw ? JSON.parse(raw) : {});
  } catch (error) {
    console.warn("AI review settings could not be read. Defaults were used.", error);
    return defaultAiReviewConfig();
  }
}

export async function saveAiReviewConfig(config, { storage } = {}) {
  const normalized = normalizeAiReviewConfig(config);
  const target = safeStorage(storage);
  if (!target?.setItem) return normalized;

  try {
    target.setItem(AI_REVIEW_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn("AI review settings could not be saved.", error);
  }

  return normalized;
}

export async function clearAiReviewConfig({ storage } = {}) {
  const target = safeStorage(storage);
  if (target?.removeItem) {
    try {
      target.removeItem(AI_REVIEW_CONFIG_STORAGE_KEY);
    } catch (error) {
      console.warn("AI review settings could not be cleared.", error);
    }
  }
  return defaultAiReviewConfig();
}

export function getAiProviderOption(providerId) {
  return providerOption(providerId);
}

export function getAiProviderSettings(config = {}, providerId = config.provider) {
  const normalized = normalizeAiReviewConfig(config);
  return normalized.providerSettings[providerId] || providerDefaults(providerId);
}

export function updateAiProviderSettings(config = {}, providerId, patch = {}) {
  const normalized = normalizeAiReviewConfig(config);
  normalized.providerSettings[providerId] = {
    ...getAiProviderSettings(normalized, providerId),
    ...patch
  };
  return normalizeAiReviewConfig(normalized);
}

export function aiProviderRequiresApiKey(providerId) {
  return providerOption(providerId).requiresApiKey;
}

export function aiProviderRequiresEndpoint(providerId) {
  return providerOption(providerId).requiresEndpoint;
}
