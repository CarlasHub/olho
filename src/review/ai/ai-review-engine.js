import { normalizeAiReviewConfig, getAiProviderSettings } from "./ai-review-config.js";
import { AiReviewDisabledError, toAiReviewError } from "./ai-review-errors.js";
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
import { buildAiPromptContext } from "./utils/prompt-context-builder.js";
import { createScreenshotPayload } from "./utils/screenshot-payload.js";
import { normalizeAiReviewResponse } from "./utils/ai-review-normalizer.js";
import { filterValidAiReviewFindings } from "./ai-review-validator.js";

const PROMPT_BUILDERS = Object.freeze({
  "screen-understanding": buildScreenUnderstandingPrompt,
  "visual-hierarchy": buildVisualHierarchyPrompt,
  "ux-review": buildUxReviewPrompt,
  "accessibility-visible": buildAccessibilityVisiblePrompt,
  "design-system": buildDesignSystemPrompt,
  "enterprise-polish": buildEnterprisePolishPrompt,
  "merge-findings": buildMergeFindingsPrompt
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
  const screenshotPayload = await createScreenshotPayload({
    imageElement,
    enabled: Boolean(normalized.screenshotSharingEnabled),
    mode: normalized.mode,
    provider
  });
  const aiSession = createAiReviewSession({
    config: normalized,
    provider,
    screenshotShared: Boolean(screenshotPayload.shared)
  });
  const deterministic = deterministicFindings.length
    ? deterministicFindings
    : (session.findings || []).filter((finding) => finding.source === "rule-engine");
  const candidateFindings = [];
  const rejectedFindings = [];

  progress(onProgress, {
    status: "running",
    message: `Running AI review with ${provider.label}.`,
    provider: provider.label,
    screenshotShared: Boolean(screenshotPayload.shared)
  });

  try {
    for (const pass of AI_REVIEW_PASSES) {
      if (signal?.aborted) {
        throw new DOMException("AI review was cancelled.", "AbortError");
      }

      const context = buildAiPromptContext({
        session,
        reviewContext,
        deterministicFindings: deterministic,
        candidateAiFindings: candidateFindings
      });
      context.aiReviewMode = normalized.mode;
      context.currentPass = pass.id;
      context.screenshotShared = Boolean(screenshotPayload.shared);
      context.screenshotSharingReason = screenshotPayload.reason;

      const prompt = PROMPT_BUILDERS[pass.id](context);
      progress(onProgress, {
        status: "running",
        passId: pass.id,
        message: aiReviewPassLabel(pass.id)
      });

      const providerResult = await provider.runPass({
        passId: pass.id,
        prompt,
        settings: providerSettings,
        screenshotPayload: screenshotPayload.shared ? screenshotPayload : null,
        fetchImpl,
        signal
      });
      const normalizedResponse = normalizeAiReviewResponse(providerResult.text, {
        passId: pass.id,
        screenshotRef: session.screenshotRef || reviewContext.screenshotRef || ""
      });
      const validation = filterValidAiReviewFindings(normalizedResponse.findings, {
        warnInvalid: true,
        context: `AI review pass ${pass.id}`
      });

      if (pass.id === "merge-findings") {
        if (validation.validFindings.length) {
          candidateFindings.splice(0, candidateFindings.length, ...validation.validFindings);
        }
      } else if (normalized.mode === AI_REVIEW_MODES.TEXT_REFINE || normalized.mode === AI_REVIEW_MODES.FULL_VISUAL) {
        candidateFindings.push(...validation.validFindings);
      }

      rejectedFindings.push(...validation.rejectedFindings);
      recordAiReviewPass(aiSession, {
        passId: pass.id,
        label: pass.label,
        status: "complete",
        findingCount: validation.validFindings.length,
        rejectedCount: validation.rejectedFindings.length
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
      executionTimeMs: Math.round(nowMs() - started)
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
