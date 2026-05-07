export const REVIEW_FINDING_CATEGORIES = Object.freeze([
  "visual-hierarchy",
  "ux",
  "accessibility-visible",
  "design-system",
  "enterprise-polish",
  "responsive-layout"
]);

export const REVIEW_FINDING_SEVERITIES = Object.freeze([
  "critical",
  "high",
  "medium",
  "low"
]);

export const REVIEW_FINDING_SOURCES = Object.freeze([
  "rule-engine",
  "ai-review",
  "manual-review"
]);

export const REVIEW_FINDING_REQUIRED_FIELDS = Object.freeze([
  "id",
  "category",
  "severity",
  "region",
  "issue",
  "evidence",
  "impact",
  "recommendation",
  "confidence",
  "screenshotRef",
  "selector",
  "source"
]);

export function isReviewFindingCategory(value) {
  return REVIEW_FINDING_CATEGORIES.includes(value);
}

export function isReviewFindingSeverity(value) {
  return REVIEW_FINDING_SEVERITIES.includes(value);
}

export function isReviewFindingSource(value) {
  return REVIEW_FINDING_SOURCES.includes(value);
}
