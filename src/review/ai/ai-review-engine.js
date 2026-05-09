import { normalizeAiReviewConfig, getAiProviderSettings } from "./ai-review-config.js";
import { AiProviderConfigurationError, AiReviewDisabledError, toAiReviewError } from "./ai-review-errors.js";
import { AI_REVIEW_MODES, AI_REVIEW_PASSES, aiReviewPassLabel } from "./ai-review-schema.js";
import {
  completeAiReviewSession,
  createAiReviewSession,
  recordAiReviewPass
} from "./ai-review-session.js";
import { mergeAiReviewFindings } from "./ai-review-merge.js";
import { getAiProvider } from "./providers/provider-registry.js";
import { buildAccessibilityVisiblePrompt } from "./prompts/accessibility-visible-prompt.js";
import { buildDesignSystemPrompt } from "./prompts/design-system-prompt.js";
import { buildEnterprisePolishPrompt } from "./prompts/enterprise-polish-prompt.js";
import { buildMergeFindingsPrompt } from "./prompts/merge-findings-prompt.js";
import { buildScreenUnderstandingPrompt } from "./prompts/screen-understanding-prompt.js";
import { buildUxReviewPrompt } from "./prompts/ux-review-prompt.js";
import { buildVisualHierarchyPrompt } from "./prompts/visual-hierarchy-prompt.js";
import { buildOllamaAccessibilityVisiblePrompt } from "./prompts/ollama/ollama-accessibility-visible-prompt.js";
import { buildOllamaDesignSystemPrompt } from "./prompts/ollama/ollama-design-system-prompt.js";
import { buildOllamaEnterprisePolishPrompt } from "./prompts/ollama/ollama-enterprise-polish-prompt.js";
import { buildOllamaFinalSynthesisPrompt } from "./prompts/ollama/ollama-final-synthesis-prompt.js";
import { buildOllamaGapAnalysisPrompt } from "./prompts/ollama/ollama-gap-analysis-prompt.js";
import { buildOllamaJsonRepairPrompt } from "./prompts/ollama/ollama-json-repair-prompt.js";
import { buildOllamaRegionReviewPrompt } from "./prompts/ollama/ollama-region-review-prompt.js";
import { buildOllamaScreenUnderstandingPrompt } from "./prompts/ollama/ollama-screen-understanding-prompt.js";
import { OLLAMA_STATIC_DESIGN_PASSES } from "./prompts/ollama/ollama-static-design-system-prompt.js";
import { buildOllamaUxClarityPrompt } from "./prompts/ollama/ollama-ux-clarity-prompt.js";
import {
  attachLocalVisionModelResult,
  buildStaticDesignContextPackage,
  markStaticContextCropUsed
} from "./context/static-design-context-package.js";
import { compressOllamaDesignContext } from "./context/ollama-design-context-compressor.js";
import { applyOllamaDesignQualityGate } from "./context/ollama-design-quality-gate.js";
import { buildAiPromptContext } from "./utils/prompt-context-builder.js";
import { createScreenshotPayload } from "./utils/screenshot-payload.js";
import { normalizeAiReviewResponse } from "./utils/ai-review-normalizer.js";
import { filterValidAiReviewFindings } from "./ai-review-validator.js";
import {
  OLLAMA_LOCAL_VISION_MODEL_PASS_ID,
  runOllamaLocalVisionModelInterpretation
} from "../vision/ollama-local-vision-model.js";
import { emptyLocalVisionModelResult } from "../vision/local-vision-model-schema.js";
import {
  detectVisionTransformerRuntime,
  runVisionTransformerRuntime,
  VIT_RUNTIME_PASS_ID
} from "../vision/vit-runtime-adapter.js";

const PROMPT_BUILDERS = Object.freeze({
  "screen-understanding": buildScreenUnderstandingPrompt,
  "visual-hierarchy": buildVisualHierarchyPrompt,
  "ux-review": buildUxReviewPrompt,
  "accessibility-visible": buildAccessibilityVisiblePrompt,
  "design-system": buildDesignSystemPrompt,
  "enterprise-polish": buildEnterprisePolishPrompt,
  "merge-findings": buildMergeFindingsPrompt
});

const OLLAMA_STATIC_PROMPT_BUILDERS = Object.freeze({
  "ollama-screen-understanding": buildOllamaScreenUnderstandingPrompt,
  "ollama-region-review": buildOllamaRegionReviewPrompt,
  "ollama-ux-clarity": buildOllamaUxClarityPrompt,
  "ollama-accessibility-visible": buildOllamaAccessibilityVisiblePrompt,
  "ollama-design-system": buildOllamaDesignSystemPrompt,
  "ollama-enterprise-polish": buildOllamaEnterprisePolishPrompt,
  "ollama-gap-analysis": buildOllamaGapAnalysisPrompt,
  "ollama-final-synthesis": buildOllamaFinalSynthesisPrompt
});

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function progress(onProgress, payload) {
  if (typeof onProgress === "function") onProgress(payload);
}

export async function testAiReviewConnection({ config, fetchImpl, signal } = {}) {
  const normalized = normalizeAiReviewConfig(config);
  const provider = getAiProvider(normalized.provider);
  const settings = getAiProviderSettings(normalized, provider.id);
  return provider.testConnection({ settings, fetchImpl, signal });
}

export async function detectAiReviewCapabilities({ config, fetchImpl, signal } = {}) {
  const normalized = normalizeAiReviewConfig(config);
  const provider = getAiProvider(normalized.provider);
  const settings = getAiProviderSettings(normalized, provider.id);
  if (typeof provider.detectCapabilities === "function") {
    return provider.detectCapabilities({ settings, fetchImpl, signal });
  }
  const result = await provider.testConnection({ settings, fetchImpl, signal });
  return {
    ...result,
    capabilities: {
      reachable: true,
      model: settings.model || "",
      modelInstalled: true,
      capability: provider.supportsVision ? "vision-capable" : "text-only",
      supportsVision: Boolean(provider.supportsVision),
      supportsText: true,
      contextWindow: null,
      responseQuality: "metadata-ok",
      recommendedForDesignReview: Boolean(provider.supportsVision),
      limitation: provider.supportsVision ? "" : "Selected provider does not support screenshot review."
    }
  };
}

function isOllamaStaticDesignMode(provider, mode) {
  return (
    provider?.id === "ollama" &&
    (mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL || mode === AI_REVIEW_MODES.STATIC_DESIGN_SYNTHESIS)
  );
}

function modeMayUseScreenshot(mode) {
  return (
    mode === AI_REVIEW_MODES.FULL_VISUAL ||
    mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL
  );
}

function targetCropBoundsForMode({ mode, staticContextPackage }) {
  if (!staticContextPackage?.targetIsolation?.cropRecommended) return null;
  if (mode !== AI_REVIEW_MODES.STATIC_DESIGN_VISUAL) return null;
  if (staticContextPackage.targetIsolation.confidence < 0.6) return null;
  return staticContextPackage.designAreaBounds || null;
}

function staticDesignPassesForMode(mode) {
  if (mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL || mode === AI_REVIEW_MODES.STATIC_DESIGN_SYNTHESIS) {
    return OLLAMA_STATIC_DESIGN_PASSES;
  }
  return AI_REVIEW_PASSES;
}

function promptBuilderForPass({ provider, passId, staticMode }) {
  if (provider?.id === "ollama" && staticMode) return OLLAMA_STATIC_PROMPT_BUILDERS[passId];
  return PROMPT_BUILDERS[passId];
}

function collectStaticInsights(insights, rawJson = {}, passId = "") {
  if (!rawJson || typeof rawJson !== "object") return;
  if (rawJson.screenUnderstanding) insights.screenUnderstanding = rawJson.screenUnderstanding;
  if (rawJson.finalSynthesis) insights.finalSynthesis = rawJson.finalSynthesis;
  if (rawJson.qualityIndicators) insights.qualityIndicators = rawJson.qualityIndicators;
  if (Array.isArray(rawJson.mainRisks)) insights.mainRisks = rawJson.mainRisks;
  if (Array.isArray(rawJson.recommendedNextActions)) insights.recommendedNextActions = rawJson.recommendedNextActions;
  if (Array.isArray(rawJson.modelObservations)) {
    insights.modelObservations = [
      ...(insights.modelObservations || []),
      ...rawJson.modelObservations.map((observation) => ({
        ...observation,
        source: "model_observation",
        passId
      }))
    ];
  }
  if (!insights.passMetadata) insights.passMetadata = [];
  insights.passMetadata.push({
    passId,
    hasScreenUnderstanding: Boolean(rawJson.screenUnderstanding),
    hasFinalSynthesis: Boolean(rawJson.finalSynthesis),
    findingCount: Array.isArray(rawJson.findings) ? rawJson.findings.length : 0
  });
}

function shouldShareScreenshotForStaticPass({ mode, passId, screenshotPayload }) {
  if (!screenshotPayload?.shared) return false;
  if (mode !== AI_REVIEW_MODES.STATIC_DESIGN_VISUAL) return false;
  return false;
}

function matchRegionForFinding(finding = {}, contextPackage = {}) {
  const regions = contextPackage.majorRegions || [];
  const haystack = [finding.region, finding.markerIntent, finding.markerSummary, finding.issue].join(" ").toLowerCase();
  return (
    regions.find((region) => haystack.includes(String(region.label || "").toLowerCase())) ||
    regions.find((region) => haystack.includes(String(region.type || "").toLowerCase())) ||
    regions.find((region) => region.type !== "unknown region") ||
    regions[0] ||
    null
  );
}

function mapAiFindingsToStaticRegions(findings = [], contextPackage = {}) {
  return findings.map((finding) => {
    if (finding.regionBounds) return finding;
    const region = matchRegionForFinding(finding, contextPackage);
    if (!region?.percentBounds) return finding;
    return {
      ...finding,
      regionBounds: region.percentBounds,
      markerSummary: finding.markerSummary || region.label,
      markerIntent: finding.markerIntent || `Place marker on ${region.label || region.type}.`
    };
  });
}

async function normalizeProviderResponseWithRepair({
  provider,
  providerResult,
  pass,
  providerSettings,
  screenshotRef,
  fetchImpl,
  signal
}) {
  try {
    return {
      repaired: false,
      normalizedResponse: normalizeAiReviewResponse(providerResult.text, {
        passId: pass.id,
        screenshotRef
      })
    };
  } catch (error) {
    if (provider?.id !== "ollama") throw error;
    const repairPrompt = buildOllamaJsonRepairPrompt({
      invalidText: providerResult.text,
      parseError: String(error?.message || error),
      passId: pass.id
    });
    const repairResult = await provider.runPass({
      passId: `${pass.id}:json-repair`,
      prompt: repairPrompt,
      settings: providerSettings,
      screenshotPayload: null,
      fetchImpl,
      signal
    });
    return {
      repaired: true,
      normalizedResponse: normalizeAiReviewResponse(repairResult.text, {
        passId: pass.id,
        screenshotRef
      })
    };
  }
}

export async function runAiReview({
  config,
  session = {},
  reviewContext = {},
  deterministicFindings = [],
  imageElement = null,
  fetchImpl,
  signal,
  onProgress
} = {}) {
  const started = nowMs();
  const normalized = normalizeAiReviewConfig(config);
  if (!normalized.enabled) {
    throw new AiReviewDisabledError();
  }

  const provider = getAiProvider(normalized.provider);
  const providerSettings = getAiProviderSettings(normalized, provider.id);
  const staticMode = isOllamaStaticDesignMode(provider, normalized.mode);
  const capabilityResult = provider.id === "ollama" && staticMode
    ? await detectAiReviewCapabilities({ config: normalized, fetchImpl, signal }).catch((error) => ({
        ok: false,
        capabilities: {
          reachable: false,
          model: providerSettings.model || "",
          modelInstalled: false,
          capability: "unknown",
          supportsVision: false,
          supportsText: true,
          limitation: String(error?.message || error)
        }
      }))
    : null;
  const capabilities = capabilityResult?.capabilities || null;
  const visionTransformerRuntime =
    staticMode && normalized.mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL ? detectVisionTransformerRuntime() : null;
  if (
    normalized.mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL &&
    capabilities &&
    !capabilities.supportsVision &&
    !visionTransformerRuntime?.available
  ) {
    throw new AiProviderConfigurationError(
      capabilities.limitation ||
        "Static design visual review requires either a local Vision Transformer runtime or a vision-capable Ollama model."
    );
  }
  if (normalized.mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL && !normalized.screenshotSharingEnabled) {
    throw new AiProviderConfigurationError(
      "Static design visual review requires explicit local screenshot sharing. Use Static design synthesis for text-only context review."
    );
  }

  const deterministic = deterministicFindings.length
    ? deterministicFindings
    : (session.findings || []).filter((finding) => finding.source === "rule-engine");
  let staticContextPackage = staticMode
    ? buildStaticDesignContextPackage({
        session,
        reviewContext,
        deterministicFindings: deterministic,
        target: session.reviewTarget || session.designReview?.target || reviewContext?.raw?.reviewTarget || null
      })
    : null;
  const cropBounds = targetCropBoundsForMode({
    mode: normalized.mode,
    staticContextPackage
  });
  const screenshotPayload = await createScreenshotPayload({
    imageElement,
    enabled: Boolean(normalized.screenshotSharingEnabled && modeMayUseScreenshot(normalized.mode)),
    mode: normalized.mode,
    provider: {
      ...provider,
      supportsVision: capabilities ? Boolean(capabilities.supportsVision || visionTransformerRuntime?.available) : provider.supportsVision
    },
    cropBounds,
    viewport: reviewContext?.viewport || null
  });
  if (normalized.mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL && !screenshotPayload.shared) {
    throw new AiProviderConfigurationError(screenshotPayload.reason || "Static design visual review could not prepare the screenshot crop.");
  }
  if (staticContextPackage) {
    staticContextPackage = markStaticContextCropUsed(staticContextPackage, screenshotPayload.crop || {});
  }
  let compressedStaticContext = staticContextPackage ? compressOllamaDesignContext(staticContextPackage) : null;
  const aiSession = createAiReviewSession({
    config: normalized,
    provider,
    screenshotShared: Boolean(screenshotPayload.shared)
  });
  aiSession.capabilities = capabilities || null;
  aiSession.staticDesignContext = staticContextPackage;
  aiSession.compressedStaticDesignContext = compressedStaticContext;
  const candidateFindings = [];
  const rejectedFindings = [];
  const qualityGateSummaries = [];
  const staticInsights = {};

  if (staticMode && normalized.mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL && provider.id === "ollama" && screenshotPayload.shared) {
    const vitRuntimeStatus = visionTransformerRuntime || detectVisionTransformerRuntime();
    aiSession.visionTransformerRuntime = vitRuntimeStatus;
    progress(onProgress, {
      status: "running",
      passId: vitRuntimeStatus.available ? VIT_RUNTIME_PASS_ID : OLLAMA_LOCAL_VISION_MODEL_PASS_ID,
      message: vitRuntimeStatus.available
        ? "Running local Vision Transformer interpretation."
        : "Running local vision model interpretation.",
      provider: provider.label,
      screenshotShared: true
    });

    let localVisionModelResult = null;
    try {
      localVisionModelResult = vitRuntimeStatus.available
        ? await runVisionTransformerRuntime({
            screenshotPayload,
            compressedContext: compressedStaticContext,
            contextPackage: staticContextPackage,
            signal
          })
        : capabilities?.supportsVision
          ? await runOllamaLocalVisionModelInterpretation({
              provider,
              providerSettings,
              screenshotPayload,
              compressedContext: compressedStaticContext,
              contextPackage: staticContextPackage,
              fetchImpl,
              signal
            })
          : emptyLocalVisionModelResult("No local Vision Transformer runtime or vision-capable Ollama model was available.");
      recordAiReviewPass(aiSession, {
        passId: localVisionModelResult.passId || OLLAMA_LOCAL_VISION_MODEL_PASS_ID,
        label: localVisionModelResult.architecture === "vit"
          ? "Local Vision Transformer interpretation"
          : "Local vision model interpretation",
        status: "complete",
        findingCount: localVisionModelResult.modelObservations.length,
        rejectedCount: 0
      });
    } catch (error) {
      localVisionModelResult = emptyLocalVisionModelResult(
        `Local vision model interpretation failed: ${String(error?.message || error)}`
      );
      recordAiReviewPass(aiSession, {
        passId: OLLAMA_LOCAL_VISION_MODEL_PASS_ID,
        label: "Local vision model interpretation",
        status: "failed",
        findingCount: 0,
        rejectedCount: 0,
        error: String(error?.message || error)
      });
    }

    staticContextPackage = attachLocalVisionModelResult(staticContextPackage, localVisionModelResult);
    compressedStaticContext = compressOllamaDesignContext(staticContextPackage);
    aiSession.staticDesignContext = staticContextPackage;
    aiSession.compressedStaticDesignContext = compressedStaticContext;
    aiSession.localVisionModel = localVisionModelResult;
    staticInsights.localVisionModel = localVisionModelResult;
    if (localVisionModelResult.modelObservations.length) {
      staticInsights.modelObservations = [
        ...(staticInsights.modelObservations || []),
        ...localVisionModelResult.modelObservations.map((observation) => ({
          ...observation,
          passId: OLLAMA_LOCAL_VISION_MODEL_PASS_ID
        }))
      ];
    }
  }

  progress(onProgress, {
    status: "running",
    message: `Running AI review with ${provider.label}.`,
    provider: provider.label,
    screenshotShared: Boolean(screenshotPayload.shared)
  });

  try {
    const reviewPasses = staticDesignPassesForMode(normalized.mode);
    for (const pass of reviewPasses) {
      if (signal?.aborted) {
        throw new DOMException("AI review was cancelled.", "AbortError");
      }

      const context = staticMode
        ? {
            contextPackage: staticContextPackage,
            compressedContext: compressedStaticContext,
            candidateFindings,
            aiReviewMode: normalized.mode,
            currentPass: pass.id,
            screenshotShared: Boolean(screenshotPayload.shared),
            screenshotSharingReason: screenshotPayload.reason,
            capabilities,
            staticInsights
          }
        : buildAiPromptContext({
            session,
            reviewContext,
            deterministicFindings: deterministic,
            candidateAiFindings: candidateFindings
          });
      context.aiReviewMode = normalized.mode;
      context.currentPass = pass.id;
      context.screenshotShared = Boolean(screenshotPayload.shared);
      context.screenshotSharingReason = screenshotPayload.reason;

      const promptBuilder = promptBuilderForPass({ provider, passId: pass.id, staticMode });
      const prompt = promptBuilder(context);
      progress(onProgress, {
        status: "running",
        passId: pass.id,
        message: pass.label || aiReviewPassLabel(pass.id)
      });

      const providerResult = await provider.runPass({
        passId: pass.id,
        prompt,
        settings: providerSettings,
        screenshotPayload: staticMode
          ? shouldShareScreenshotForStaticPass({
              mode: normalized.mode,
              passId: pass.id,
              screenshotPayload
            })
            ? screenshotPayload
            : null
          : screenshotPayload.shared
            ? screenshotPayload
            : null,
        fetchImpl,
        signal
      });
      const normalizedResult = await normalizeProviderResponseWithRepair({
        provider,
        providerResult,
        pass,
        providerSettings,
        screenshotRef: session.screenshotRef || reviewContext.screenshotRef || "",
        fetchImpl,
        signal
      });
      collectStaticInsights(staticInsights, normalizedResult.normalizedResponse.rawJson, pass.id);

      const mappedFindings = staticMode
        ? mapAiFindingsToStaticRegions(normalizedResult.normalizedResponse.findings, staticContextPackage)
        : normalizedResult.normalizedResponse.findings;
      const validation = filterValidAiReviewFindings(mappedFindings, {
        warnInvalid: true,
        context: `AI review pass ${pass.id}`
      });
      const qualityGate = staticMode
        ? applyOllamaDesignQualityGate(validation.validFindings, {
            contextPackage: staticContextPackage,
            warnInvalid: true
          })
        : {
            acceptedFindings: validation.validFindings,
            rejectedFindings: [],
            summary: {
              evaluated: validation.validFindings.length,
              accepted: validation.validFindings.length,
              rejected: 0
            }
          };
      qualityGateSummaries.push({
        passId: pass.id,
        ...qualityGate.summary,
        repaired: Boolean(normalizedResult.repaired)
      });

      if (pass.id === "merge-findings") {
        if (qualityGate.acceptedFindings.length) {
          candidateFindings.splice(0, candidateFindings.length, ...qualityGate.acceptedFindings);
        }
      } else if (staticMode || normalized.mode === AI_REVIEW_MODES.TEXT_REFINE || normalized.mode === AI_REVIEW_MODES.FULL_VISUAL) {
        candidateFindings.push(...qualityGate.acceptedFindings);
      }

      rejectedFindings.push(...validation.rejectedFindings, ...qualityGate.rejectedFindings);
      recordAiReviewPass(aiSession, {
        passId: pass.id,
        label: pass.label,
        status: "complete",
        findingCount: qualityGate.acceptedFindings.length,
        rejectedCount: validation.rejectedFindings.length + qualityGate.rejectedFindings.length
      });
    }

    const merged = mergeAiReviewFindings({
      deterministicFindings: deterministic,
      aiFindings: candidateFindings,
      warnInvalid: true
    });
    const completedSession = completeAiReviewSession(aiSession, {
      status: "complete",
      findingCount: merged.findings.length,
      acceptedAiFindingCount: merged.acceptedAiFindings.length,
      duplicateAiFindingCount: merged.duplicateAiFindings.length,
      rejectedAiFindingCount: rejectedFindings.length + merged.rejectedAiFindings.length,
      executionTimeMs: Math.round(nowMs() - started),
      capabilities,
      staticDesignContext: staticContextPackage,
      compressedStaticDesignContext: compressedStaticContext,
      staticDesignInsights: staticInsights,
      localVisionModel: staticInsights.localVisionModel || aiSession.localVisionModel || null,
      visionTransformerRuntime: aiSession.visionTransformerRuntime || visionTransformerRuntime || null,
      qualityValidationSummary: qualityGateSummaries,
      screenshotCropUsed: Boolean(screenshotPayload.crop?.used),
      screenshotCrop: screenshotPayload.crop || null
    });

    progress(onProgress, {
      status: "complete",
      message: `AI review complete: ${merged.acceptedAiFindings.length} AI finding${
        merged.acceptedAiFindings.length === 1 ? "" : "s"
      } accepted.`,
      provider: provider.label,
      screenshotShared: Boolean(screenshotPayload.shared)
    });

    return {
      findings: merged.findings,
      aiFindings: candidateFindings,
      acceptedAiFindings: merged.acceptedAiFindings,
      duplicateAiFindings: merged.duplicateAiFindings,
      rejectedAiFindings: [...rejectedFindings, ...merged.rejectedAiFindings],
      metadata: completedSession
    };
  } catch (error) {
    const aiError = toAiReviewError(error);
    recordAiReviewPass(aiSession, {
      passId: "ai-review",
      label: "AI review",
      status: "failed",
      error: aiError.message
    });
    progress(onProgress, {
      status: "failed",
      message: aiError.message,
      provider: provider.label,
      screenshotShared: Boolean(screenshotPayload.shared)
    });
    throw aiError;
  }
}
