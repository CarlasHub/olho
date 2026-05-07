import { createProviderResult, readProviderJson, requireApiKey, requireFetch, requireModel } from "./provider-interface.js";

const PROVIDER_ID = "gemini";
const PROVIDER_LABEL = "Gemini vision";

function generateUrl({ model, apiKey }) {
  const url = new URL(["https:", "", "generativelanguage.googleapis.com"].join("/"));
  url.pathname = ["", "v1beta", "models", `${model}:generateContent`].join("/");
  url.searchParams.set("key", apiKey);
  return url;
}

function responseText(json = {}) {
  return String(
    json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .filter(Boolean)
      .join("\n") || ""
  );
}

export function createGeminiProvider() {
  return {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    supportsVision: true,
    localOnly: false,

    async testConnection({ settings = {}, fetchImpl, signal } = {}) {
      const fetcher = requireFetch(fetchImpl);
      const model = requireModel(settings, PROVIDER_LABEL);
      const apiKey = requireApiKey(settings, PROVIDER_LABEL);
      const response = await fetcher(generateUrl({ model, apiKey }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Return JSON only: {\"findings\":[]}" }]
            }
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json"
          }
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
      const parts = [{ text: String(prompt || "") }];

      if (screenshotPayload?.dataBase64 && screenshotPayload?.mimeType) {
        parts.push({
          inline_data: {
            mime_type: screenshotPayload.mimeType,
            data: screenshotPayload.dataBase64
          }
        });
      }

      const response = await fetcher(generateUrl({ model, apiKey }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
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
