import {
  AI_REVIEW_MODE_OPTIONS,
  getAiProviderSettings,
  normalizeAiReviewConfig,
  updateAiProviderSettings
} from "../ai/ai-review-config.js";
import { AI_REVIEW_MODES } from "../ai/ai-review-schema.js";

function defaultOllamaEndpoint() {
  return ["http:", "", "localhost:11434"].join("/");
}

function optionLabel(modeId) {
  return AI_REVIEW_MODE_OPTIONS.find((mode) => mode.id === modeId)?.label || modeId;
}

function setText(node, value) {
  if (node) node.textContent = value;
}

export function populateOllamaModeSelect(select) {
  if (!select || select.options.length) return;
  AI_REVIEW_MODE_OPTIONS.forEach((mode) => {
    const option = document.createElement("option");
    option.value = mode.id;
    option.textContent = mode.label;
    select.append(option);
  });
}

export function readOllamaConfigFromControls(elements = {}, currentConfig = normalizeAiReviewConfig()) {
  const base = normalizeAiReviewConfig({
    ...currentConfig,
    enabled: Boolean(elements.ollamaEnabledToggle?.checked),
    provider: "ollama",
    mode: elements.ollamaModeSelect?.value || AI_REVIEW_MODES.TEXT_REFINE,
    screenshotSharingEnabled: Boolean(elements.ollamaScreenshotToggle?.checked),
    screenshotConsentAcknowledged: Boolean(elements.ollamaScreenshotToggle?.checked)
  });
  const currentSettings = getAiProviderSettings(base, "ollama");

  return updateAiProviderSettings(base, "ollama", {
    endpoint: elements.ollamaEndpointInput?.value || defaultOllamaEndpoint(),
    model: elements.ollamaModelInput ? elements.ollamaModelInput.value : currentSettings.model || ""
  });
}

function renderCapability(elements = {}, capability = null) {
  if (!elements.ollamaCapability) return;
  const status = capability?.capability || "unknown";
  elements.ollamaCapability.dataset.capability = status;
  if (!capability) {
    elements.ollamaCapability.textContent = "Capability: not checked";
    return;
  }
  const installed = capability.modelInstalled ? "installed" : "not installed";
  const context = capability.contextWindow ? `, context ${capability.contextWindow}` : "";
  const note = capability.limitation ? ` ${capability.limitation}` : "";
  elements.ollamaCapability.textContent = `Capability: ${status}; model ${capability.model || "not selected"} ${installed}${context}.${note}`;
}

function renderAiMetadata(elements = {}, session = null) {
  const ai = session?.aiReview || null;
  const insights = ai?.staticDesignInsights || {};
  const understanding = insights.screenUnderstanding || ai?.staticDesignContext?.visualSummary || null;
  const synthesis = insights.finalSynthesis || null;
  if (elements.ollamaUnderstanding) {
    elements.ollamaUnderstanding.textContent = understanding
      ? JSON.stringify(understanding, null, 2)
      : "Run Ollama review to generate screen understanding.";
  }
  if (elements.ollamaSynthesis) {
    elements.ollamaSynthesis.textContent = synthesis
      ? JSON.stringify(synthesis, null, 2)
      : ai?.staticDesignInsights?.mainRisks?.length
        ? `Main risks: ${ai.staticDesignInsights.mainRisks.join("; ")}`
        : "Run Ollama review to generate final synthesis.";
  }
  if (elements.ollamaDetails) {
    elements.ollamaDetails.textContent = ai
      ? JSON.stringify(
          {
            provider: ai.providerLabel || ai.provider,
            mode: ai.mode,
            model: ai.capabilities?.model || "",
            capability: ai.capabilities?.capability || "",
            screenshotShared: ai.screenshotShared,
            cropUsed: ai.screenshotCropUsed,
            ignoredAreas: ai.staticDesignContext?.targetIsolation?.ignoredAreas || [],
            localVisionModel: ai.localVisionModel
              ? {
                  provider: ai.localVisionModel.provider,
                  model: ai.localVisionModel.model,
                  architecture: ai.localVisionModel.architecture,
                  observations: ai.localVisionModel.modelObservations?.length || 0
                }
              : null,
            visionTransformerRuntime: ai.visionTransformerRuntime || null,
            qualityValidationSummary: ai.qualityValidationSummary || []
          },
          null,
          2
        )
      : "No Ollama design review metadata yet.";
  }
}

export function renderOllamaControls(
  elements = {},
  config = normalizeAiReviewConfig(),
  { session = null, running = false, capability = null } = {}
) {
  const normalized = normalizeAiReviewConfig(config);
  const settings = getAiProviderSettings(normalized, "ollama");
  const enabled = Boolean(normalized.enabled && normalized.provider === "ollama");
  const fullVisual =
    normalized.mode === AI_REVIEW_MODES.FULL_VISUAL || normalized.mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL;
  const textOnly = capability?.capability === "text-only";

  if (elements.ollamaEnabledToggle) elements.ollamaEnabledToggle.checked = enabled;
  if (elements.ollamaModeSelect) {
    elements.ollamaModeSelect.value = normalized.mode;
    elements.ollamaModeSelect.disabled = !enabled || running;
  }
  if (elements.ollamaEndpointInput) {
    elements.ollamaEndpointInput.value = settings.endpoint || defaultOllamaEndpoint();
    elements.ollamaEndpointInput.disabled = !enabled || running;
  }
  if (elements.ollamaModelInput) {
    elements.ollamaModelInput.value = settings.model || "";
    elements.ollamaModelInput.disabled = !enabled || running;
  }
  if (elements.ollamaScreenshotToggle) {
    elements.ollamaScreenshotToggle.checked = Boolean(normalized.screenshotSharingEnabled);
    elements.ollamaScreenshotToggle.disabled = !enabled || !fullVisual || running || textOnly;
  }

  if (elements.runOllamaButton) elements.runOllamaButton.disabled = !enabled || running || !session;
  if (elements.testOllamaButton) elements.testOllamaButton.disabled = !enabled || running;
  if (elements.saveOllamaButton) elements.saveOllamaButton.disabled = running;
  if (elements.cancelOllamaButton) elements.cancelOllamaButton.disabled = !running;

  const screenshotText =
    fullVisual && normalized.screenshotSharingEnabled && !textOnly
      ? "local screenshot/crop review enabled"
      : textOnly
        ? "selected model appears text-only"
        : "no screenshot sharing";
  setText(
    elements.ollamaSummary,
    enabled
      ? `Ollama ${optionLabel(normalized.mode)} using ${settings.model || "no model selected"}; ${screenshotText}.`
      : "Ollama is off. Local deterministic review still runs without AI."
  );
  renderCapability(elements, capability);
  renderAiMetadata(elements, session);
}

export function setOllamaStatus(elements = {}, { message = "", tone = "neutral" } = {}) {
  if (!elements.ollamaStatusText) return;
  elements.ollamaStatusText.textContent = message;
  elements.ollamaStatusText.dataset.tone = tone;
}

export function renderOllamaPass(elements = {}, update = {}) {
  if (!elements.ollamaPassList || !update.message) return;
  const item = document.createElement("li");
  item.textContent = update.passId ? `${update.passId}: ${update.message}` : update.message;
  elements.ollamaPassList.append(item);
}

export async function imageElementFromDataUrl(dataUrl) {
  const image = new Image();
  image.decoding = "async";
  image.src = dataUrl;
  if (typeof image.decode === "function") {
    await image.decode();
  } else {
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("Review screenshot image failed to decode.")), { once: true });
    });
  }
  return image;
}
