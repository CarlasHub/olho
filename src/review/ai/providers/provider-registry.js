import { assertProviderShape } from "./provider-interface.js";
import { createGeminiProvider } from "./gemini-provider.js";
import { createGroqProvider } from "./groq-provider.js";
import { createOllamaProvider } from "./ollama-provider.js";
import { createOpenRouterProvider } from "./openrouter-provider.js";

const PROVIDERS = Object.freeze({
  ollama: createOllamaProvider(),
  gemini: createGeminiProvider(),
  groq: createGroqProvider(),
  openrouter: createOpenRouterProvider()
});

export function getAiProvider(providerId) {
  return assertProviderShape(PROVIDERS[providerId] || PROVIDERS.ollama);
}

export function listAiProviders() {
  return Object.values(PROVIDERS).map((provider) => assertProviderShape(provider));
}
