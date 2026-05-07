import { AI_REVIEW_MODES } from "./ai-review-schema.js";

function nowIso() {
  return new Date().toISOString();
}

export function createAiReviewSession({ config = {}, provider = null, screenshotShared = false } = {}) {
  return {
    id: `ai-review-${Date.now().toString(36)}`,
    startedAt: nowIso(),
    completedAt: "",
    provider: provider?.id || config.provider || "unknown",
    providerLabel: provider?.label || config.provider || "Unknown provider",
    mode: config.mode || AI_REVIEW_MODES.OFF,
    screenshotShared: Boolean(screenshotShared),
    status: "running",
    passes: [],
    limitations: [
      "AI review is optional and may miss visible issues.",
      "AI output is schema-validated before it can appear in Review Mode.",
      "Static screenshots cannot confirm dynamic behavior, keyboard flow, hidden states, or backend logic."
    ]
  };
}

export function recordAiReviewPass(aiSession, pass) {
  aiSession.passes.push({
    passId: pass.passId,
    label: pass.label,
    status: pass.status,
    findingCount: Number(pass.findingCount || 0),
    rejectedCount: Number(pass.rejectedCount || 0),
    error: pass.error || ""
  });
}

export function completeAiReviewSession(aiSession, fields = {}) {
  return {
    ...aiSession,
    ...fields,
    completedAt: nowIso(),
    status: fields.status || "complete"
  };
}
