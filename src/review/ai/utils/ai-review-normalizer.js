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
  const id = String(finding.id || `ai:${passId}:${slug(issue)}:${index + 1}`).trim();
  return {
    id,
    category: String(finding.category || "").trim(),
    severity: String(finding.severity || "").trim().toLowerCase(),
    region: String(finding.region || finding.component || "").trim(),
    issue,
    evidence: String(finding.evidence || "").trim(),
    impact: String(finding.impact || "").trim(),
    recommendation: String(finding.recommendation || "").trim(),
    confidence: clampConfidence(finding.confidence),
    screenshotRef: String(finding.screenshotRef || screenshotRef || "").trim(),
    selector: String(finding.selector || "").trim(),
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
