import { validateReviewFinding } from "../findings/finding-validator.js";
import { AI_REVIEW_SOURCE } from "./ai-review-schema.js";

const FORBIDDEN_VAGUE_PATTERNS = Object.freeze([
  /\blooks modern\b/i,
  /\bui is nice\b/i,
  /\bdesign is clean\b/i,
  /\blooks clean\b/i,
  /\blooks good\b/i,
  /\bgood design\b/i,
  /\bnice design\b/i,
  /\blooks professional\b/i,
  /\bimprove the design\b/i,
  /\bmake it modern\b/i,
  /^button inconsistency detected\.?$/i,
  /\bcould be better\b/i
]);

function meaningfulText(value, minLength) {
  return String(value || "").trim().length >= minLength;
}

function containsVagueOutput(finding = {}) {
  const text = [finding.issue, finding.evidence, finding.impact, finding.recommendation].join(" ");
  return FORBIDDEN_VAGUE_PATTERNS.some((pattern) => pattern.test(text));
}

function claimsWcagFailureWithoutMeasurement(finding = {}) {
  const text = [finding.issue, finding.evidence, finding.impact, finding.recommendation].join(" ");
  if (!/\b(fails?|failure|violates?|violation)\s+wcag\b|\bwcag\s+(fails?|failure|violation)\b/i.test(text)) {
    return false;
  }
  const measured = finding.evidenceType === "measured" || finding.evidence_type === "measured";
  const hasRatio = /\b\d+(?:\.\d+)?:1\b|\bcontrast ratio\b/i.test(finding.evidence || "");
  return !(measured && hasRatio);
}

export function validateAiReviewFinding(finding) {
  const base = validateReviewFinding(finding);
  const errors = [...base.errors];

  if (finding?.source !== AI_REVIEW_SOURCE) {
    errors.push(`AI finding source must be ${AI_REVIEW_SOURCE}.`);
  }

  if (containsVagueOutput(finding)) {
    errors.push("AI finding uses forbidden vague review wording.");
  }

  if (claimsWcagFailureWithoutMeasurement(finding)) {
    errors.push("AI finding claims WCAG failure without measured contrast/accessibility evidence.");
  }

  if (!meaningfulText(finding?.issue, 24)) {
    errors.push("AI finding issue must be specific professional critique.");
  }

  if (!meaningfulText(finding?.evidence, 30)) {
    errors.push("AI finding evidence must cite visible evidence or supplied metrics.");
  }

  if (!meaningfulText(finding?.impact, 30)) {
    errors.push("AI finding impact must connect the issue to user or product outcomes.");
  }

  if (!meaningfulText(finding?.recommendation, 30)) {
    errors.push("AI finding recommendation must be actionable and specific.");
  }

  if (Number(finding?.confidence) < 0.35) {
    errors.push("AI finding confidence is below the minimum rendering threshold.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function filterValidAiReviewFindings(
  findings,
  { warnInvalid = true, context = "AI review validation" } = {}
) {
  if (!Array.isArray(findings)) {
    if (warnInvalid) console.warn(`${context}: expected findings to be an array.`);
    return {
      validFindings: [],
      rejectedFindings: []
    };
  }

  const validFindings = [];
  const rejectedFindings = [];
  findings.forEach((finding) => {
    const result = validateAiReviewFinding(finding);
    if (result.valid) {
      validFindings.push(finding);
      return;
    }

    rejectedFindings.push({
      finding,
      errors: result.errors
    });

    if (warnInvalid) {
      const id = typeof finding?.id === "string" ? finding.id : "unknown";
      console.warn(`${context}: invalid AI finding skipped (${id}).`, result.errors);
    }
  });

  return {
    validFindings,
    rejectedFindings
  };
}
