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
    defaultModel: ""
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
  },
  {
    id: AI_REVIEW_MODES.STATIC_DESIGN_VISUAL,
    label: "Static design visual review",
    description: "Uses the isolated design screenshot/crop plus structured context. Requires a vision-capable Ollama model."
  },
  {
    id: AI_REVIEW_MODES.STATIC_DESIGN_SYNTHESIS,
    label: "Static design synthesis",
    description: "Combines deterministic findings, local visual-analysis evidence, and region summaries into broader design critique without sending a screenshot."
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

function chromeLocalStorage() {
  try {
    return globalThis.chrome?.storage?.local || null;
  } catch {
    return null;
  }
}

function safeStorage(storage) {
  if (storage) return storage;
  const chromeStorage = chromeLocalStorage();
  if (chromeStorage) return chromeStorage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

async function readStorageValue(target, key) {
  if (!target) return null;
  if (typeof target.getItem === "function") return target.getItem(key);
  if (typeof target.get === "function") {
    const result = await target.get(key);
    return result?.[key] || null;
  }
  return null;
}

async function writeStorageValue(target, key, value) {
  if (!target) return;
  if (typeof target.setItem === "function") {
    target.setItem(key, value);
    return;
  }
  if (typeof target.set === "function") {
    await target.set({ [key]: value });
  }
}

async function removeStorageValue(target, key) {
  if (!target) return;
  if (typeof target.removeItem === "function") {
    target.removeItem(key);
    return;
  }
  if (typeof target.remove === "function") {
    await target.remove(key);
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
  if (!target) return defaultAiReviewConfig();

  try {
    const raw = await readStorageValue(target, AI_REVIEW_CONFIG_STORAGE_KEY);
    return normalizeAiReviewConfig(raw ? JSON.parse(raw) : {});
  } catch (error) {
    console.warn("AI review settings could not be read. Defaults were used.", error);
    return defaultAiReviewConfig();
  }
}

export async function saveAiReviewConfig(config, { storage } = {}) {
  const normalized = normalizeAiReviewConfig(config);
  const target = safeStorage(storage);
  if (!target) return normalized;

  try {
    await writeStorageValue(target, AI_REVIEW_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn("AI review settings could not be saved.", error);
  }

  return normalized;
}

export async function clearAiReviewConfig({ storage } = {}) {
  const target = safeStorage(storage);
  if (target) {
    try {
      await removeStorageValue(target, AI_REVIEW_CONFIG_STORAGE_KEY);
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
