import {
  REVIEW_FINDING_DEEP_FIELDS,
  REVIEW_FINDING_REQUIRED_FIELDS,
  isReviewFindingCategory,
  isReviewFindingEvidenceType,
  isReviewFindingMarkerType,
  isReviewFindingSeverity,
  isReviewFindingSource
} from "../contracts/review-finding.js";

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateReviewFinding(finding) {
  const errors = [];

  if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
    return {
      valid: false,
      errors: ["Finding must be an object."]
    };
  }

  REVIEW_FINDING_REQUIRED_FIELDS.forEach((field) => {
    if (!hasOwn(finding, field)) {
      errors.push(`Missing required field: ${field}.`);
    }
  });

  ["id", "region", "issue", "evidence", "impact", "recommendation", "screenshotRef", "source"].forEach((field) => {
    if (hasOwn(finding, field) && !isNonEmptyString(finding[field])) {
      errors.push(`${field} must be a non-empty string.`);
    }
  });

  if (hasOwn(finding, "selector") && typeof finding.selector !== "string") {
    errors.push("selector must be a string.");
  }

  if (hasOwn(finding, "category") && !isReviewFindingCategory(finding.category)) {
    errors.push(`Unsupported category: ${String(finding.category)}.`);
  }

  if (hasOwn(finding, "severity") && !isReviewFindingSeverity(finding.severity)) {
    errors.push(`Unsupported severity: ${String(finding.severity)}.`);
  }

  if (hasOwn(finding, "source") && !isReviewFindingSource(finding.source)) {
    errors.push(`Unsupported source: ${String(finding.source)}.`);
  }

  if (hasOwn(finding, "confidence")) {
    const confidence = Number(finding.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      errors.push("confidence must be a number between 0 and 1.");
    }
  }

  REVIEW_FINDING_DEEP_FIELDS.filter((field) => field !== "acceptanceCriteria").forEach((field) => {
    if (hasOwn(finding, field) && !isNonEmptyString(finding[field])) {
      errors.push(`${field} must be a non-empty string when provided.`);
    }
  });

  if (hasOwn(finding, "acceptanceCriteria")) {
    if (
      !Array.isArray(finding.acceptanceCriteria) ||
      !finding.acceptanceCriteria.length ||
      finding.acceptanceCriteria.some((item) => !isNonEmptyString(item))
    ) {
      errors.push("acceptanceCriteria must be a non-empty array of strings when provided.");
    }
  }

  if (hasOwn(finding, "markerType") && !isReviewFindingMarkerType(finding.markerType)) {
    errors.push(`Unsupported markerType: ${String(finding.markerType)}.`);
  }

  if (hasOwn(finding, "evidenceType") && !isReviewFindingEvidenceType(finding.evidenceType)) {
    errors.push(`Unsupported evidenceType: ${String(finding.evidenceType)}.`);
  }

  if (hasOwn(finding, "evidence_type") && !isReviewFindingEvidenceType(finding.evidence_type)) {
    errors.push(`Unsupported evidence_type: ${String(finding.evidence_type)}.`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function filterValidReviewFindings(findings, { warnInvalid = true, context = "Review finding validation" } = {}) {
  if (!Array.isArray(findings)) {
    if (warnInvalid) {
      console.warn(`${context}: expected findings to be an array.`);
    }
    return [];
  }

  return findings.filter((finding) => {
    const result = validateReviewFinding(finding);
    if (!result.valid && warnInvalid) {
      const id = typeof finding?.id === "string" ? finding.id : "unknown";
      console.warn(`${context}: invalid finding skipped (${id}).`, result.errors);
    }
    return result.valid;
  });
}
