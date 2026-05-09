import { AI_REVIEW_SOURCE } from "../ai-review-schema.js";

function slug(value) {
  return String(value || "finding")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.65;
  return Math.max(0, Math.min(1, number));
}

function defaultBestPractice(category) {
  if (category === "visual-hierarchy") {
    return "Visual hierarchy should guide attention from primary message to supporting detail to action.";
  }
  if (category === "accessibility-visible") {
    return "Important content and controls should remain readable, recognisable, and usable without relying on colour alone.";
  }
  if (category === "design-system") {
    return "Repeated components should use consistent spacing, sizing, radius, elevation, and visual treatment.";
  }
  if (category === "enterprise-polish") {
    return "Enterprise product UI should feel deliberate, restrained, trustworthy, and consistent across repeated surfaces.";
  }
  return "The visible interface should make the intended task path clear with minimal decision effort.";
}

function defaultMarkerType(category) {
  if (category === "visual-hierarchy") return "section";
  if (category === "accessibility-visible") return "accessibility-risk";
  if (category === "design-system") return "component-group";
  if (category === "enterprise-polish") return "composition";
  return "component-group";
}

function acceptanceCriteria(finding = {}) {
  if (Array.isArray(finding.acceptanceCriteria)) {
    const values = finding.acceptanceCriteria.map((item) => String(item || "").trim()).filter(Boolean);
    if (values.length) return values;
  }
  return [
    "The affected region has been reviewed visually.",
    "The issue has been corrected or intentionally accepted.",
    "The recommendation has been checked for readability and keyboard impact where relevant.",
    "The UI remains visually consistent with surrounding components."
  ];
}

function limitations(finding = {}) {
  if (Array.isArray(finding.limitations)) {
    return finding.limitations.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
  }
  return [];
}

function evidenceType(finding = {}) {
  const value = String(finding.evidenceType || finding.evidence_type || "").trim();
  if (["measured", "inferred", "model_observation", "human_review_needed"].includes(value)) return value;
  return "inferred";
}

export function parseAiJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return { findings: [] };
  const unfenced = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error("AI response did not contain valid JSON.");
  }
}

export function normalizeAiReviewFinding(finding = {}, { passId = "ai-review", index = 0, screenshotRef = "" } = {}) {
  const issue = String(finding.issue || finding.title || "").trim();
  const category = String(finding.category || "").trim();
  const id = String(finding.id || `ai:${passId}:${slug(issue)}:${index + 1}`).trim();
  return {
    id,
    category,
    severity: String(finding.severity || "").trim().toLowerCase(),
    region: String(finding.region || finding.component || "").trim(),
    issue,
    evidence: String(finding.evidence || "").trim(),
    impact: String(finding.impact || "").trim(),
    recommendation: String(finding.recommendation || "").trim(),
    bestPracticeReference: String(finding.bestPracticeReference || defaultBestPractice(category)).trim(),
    reviewRationale: String(
      finding.reviewRationale || "The finding is based on visible evidence from the supplied review context."
    ).trim(),
    affectedUsers: String(finding.affectedUsers || "Users scanning or completing the visible task.").trim(),
    suggestedPriority: String(finding.suggestedPriority || "Review before release if this affects a primary workflow.").trim(),
    markerSummary: String(finding.markerSummary || issue).trim().slice(0, 90),
    markerIntent: String(finding.markerIntent || finding.markerSummary || finding.region || issue).trim().slice(0, 140),
    acceptanceCriteria: acceptanceCriteria(finding),
    markerType: String(finding.markerType || defaultMarkerType(category)).trim(),
    priority: Number.isFinite(Number(finding.priority)) ? Number(finding.priority) : null,
    evidenceType: evidenceType(finding),
    evidence_type: evidenceType(finding),
    reviewPass: passId,
    confidence: clampConfidence(finding.confidence),
    screenshotRef: String(finding.screenshotRef || screenshotRef || "").trim(),
    selector: String(finding.selector || "").trim(),
    limitations: limitations(finding),
    source: AI_REVIEW_SOURCE
  };
}

export function normalizeAiReviewResponse(text, { passId = "ai-review", screenshotRef = "" } = {}) {
  const json = parseAiJson(text);
  const findings = Array.isArray(json) ? json : Array.isArray(json.findings) ? json.findings : [];
  return {
    rawJson: json,
    findings: findings.map((finding, index) =>
      normalizeAiReviewFinding(finding, {
        passId,
        index,
        screenshotRef
      })
    )
  };
}
