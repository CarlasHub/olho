import {
  createProviderResult,
  providerJsonHeaders,
  readProviderJson,
  requireApiKey,
  requireFetch,
  requireModel
} from "./provider-interface.js";

const PROVIDER_ID = "openrouter";
const PROVIDER_LABEL = "OpenRouter";

function chatUrl() {
  const url = new URL(["https:", "", "openrouter.ai"].join("/"));
  url.pathname = ["", "api", "v1", "chat", "completions"].join("/");
  return url;
}

function responseText(json = {}) {
  return String(json.choices?.[0]?.message?.content || "");
}

export function createOpenRouterProvider() {
  return {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    supportsVision: true,
    localOnly: false,

    async testConnection({ settings = {}, fetchImpl, signal } = {}) {
      const fetcher = requireFetch(fetchImpl);
      const model = requireModel(settings, PROVIDER_LABEL);
      const apiKey = requireApiKey(settings, PROVIDER_LABEL);
      const response = await fetcher(chatUrl(), {
        method: "POST",
        headers: providerJsonHeaders({ Authorization: `Bearer ${apiKey}` }),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Return JSON only: {\"findings\":[]}" }],
          temperature: 0,
          response_format: { type: "json_object" }
        }),
        signal
      });
      await readProviderJson(response, PROVIDER_LABEL);
      return {
        ok: true,
        provider: PROVIDER_ID,
        message: "Provider connection succeeded."
      };
    },

    async runPass({ prompt, passId, settings = {}, screenshotPayload = null, fetchImpl, signal } = {}) {
      const fetcher = requireFetch(fetchImpl);
      const model = requireModel(settings, PROVIDER_LABEL);
      const apiKey = requireApiKey(settings, PROVIDER_LABEL);
      const content = screenshotPayload?.dataUrl
        ? [
            { type: "text", text: String(prompt || "") },
            { type: "image_url", image_url: { url: screenshotPayload.dataUrl } }
          ]
        : String(prompt || "");
      const response = await fetcher(chatUrl(), {
        method: "POST",
        headers: providerJsonHeaders({ Authorization: `Bearer ${apiKey}` }),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
        signal
      });
      const json = await readProviderJson(response, PROVIDER_LABEL);
      return createProviderResult({
        providerId: PROVIDER_ID,
        passId,
        text: responseText(json),
        raw: json
      });
    }
  };
}
