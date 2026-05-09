import {
  normalizeLocalVisionModelResponse,
  validateLocalVisionModelResult
} from "./local-vision-model-schema.js";

export const VIT_RUNTIME_PASS_ID = "local-vit-runtime";
export const VIT_RUNTIME_GLOBAL = "OlhoVisionTransformerRuntime";

function runtimeFromGlobal() {
  try {
    return globalThis[VIT_RUNTIME_GLOBAL] || null;
  } catch {
    return null;
  }
}

function hasAnalyze(runtime) {
  return Boolean(runtime && typeof runtime.analyze === "function");
}

function isVitRuntime(runtime) {
  const architecture = String(runtime?.architecture || runtime?.type || "").toLowerCase();
  return architecture === "vit" || architecture === "vision-transformer";
}

export function detectVisionTransformerRuntime({ runtime = runtimeFromGlobal() } = {}) {
  if (!runtime) {
    return {
      available: false,
      provider: "local-vit-runtime",
      architecture: "vit",
      model: "",
      reason:
        "No local Vision Transformer runtime is registered. Provide globalThis.OlhoVisionTransformerRuntime with a local analyze() implementation."
    };
  }

  if (!isVitRuntime(runtime)) {
    return {
      available: false,
      provider: runtime.provider || "local-vit-runtime",
      architecture: String(runtime.architecture || runtime.type || "unknown"),
      model: runtime.model || runtime.modelName || "",
      reason: "Registered local vision runtime is not identified as a Vision Transformer architecture."
    };
  }

  if (!hasAnalyze(runtime)) {
    return {
      available: false,
      provider: runtime.provider || "local-vit-runtime",
      architecture: "vit",
      model: runtime.model || runtime.modelName || "",
      reason: "Registered Vision Transformer runtime does not expose analyze()."
    };
  }

  if (runtime.localOnly === false) {
    return {
      available: false,
      provider: runtime.provider || "local-vit-runtime",
      architecture: "vit",
      model: runtime.model || runtime.modelName || "",
      reason: "Vision Transformer runtime must be local-only."
    };
  }

  return {
    available: true,
    provider: runtime.provider || "local-vit-runtime",
    architecture: "vit",
    model: runtime.model || runtime.modelName || "local-vit",
    reason: ""
  };
}

export async function runVisionTransformerRuntime({
  runtime = runtimeFromGlobal(),
  screenshotPayload,
  compressedContext,
  contextPackage,
  signal
} = {}) {
  const status = detectVisionTransformerRuntime({ runtime });
  if (!status.available) {
    throw new Error(status.reason || "Local Vision Transformer runtime is unavailable.");
  }
  if (!screenshotPayload?.shared || !screenshotPayload?.dataUrl) {
    throw new Error("Local Vision Transformer runtime requires an explicitly prepared local screenshot/crop.");
  }

  const raw = await runtime.analyze({
    imageDataUrl: screenshotPayload.dataUrl,
    imageBase64: screenshotPayload.dataBase64,
    mimeType: screenshotPayload.mimeType,
    width: screenshotPayload.width,
    height: screenshotPayload.height,
    crop: screenshotPayload.crop || null,
    compressedContext,
    contextPackage,
    signal
  });
  const normalized = normalizeLocalVisionModelResponse(raw, {
    provider: status.provider,
    model: status.model,
    architecture: "vit",
    passId: VIT_RUNTIME_PASS_ID
  });
  const validation = validateLocalVisionModelResult(normalized);
  if (!validation.valid) {
    throw new Error(`Local Vision Transformer runtime output failed validation: ${validation.errors.join(" ")}`);
  }
  return normalized;
}
