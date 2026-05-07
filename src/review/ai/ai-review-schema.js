import {
  REVIEW_FINDING_CATEGORIES,
  REVIEW_FINDING_SEVERITIES
} from "../contracts/review-finding.js";

export const AI_REVIEW_SOURCE = "ai-review";

export const AI_REVIEW_MODES = Object.freeze({
  OFF: "off",
  TEXT_REFINE: "text-refine",
  FULL_VISUAL: "full-visual"
});

export const AI_REVIEW_PASSES = Object.freeze([
  {
    id: "screen-understanding",
    label: "Screen understanding"
  },
  {
    id: "visual-hierarchy",
    label: "Visual hierarchy review"
  },
  {
    id: "ux-review",
    label: "UX review"
  },
  {
    id: "accessibility-visible",
    label: "Accessibility-visible review"
  },
  {
    id: "design-system",
    label: "Design-system review"
  },
  {
    id: "enterprise-polish",
    label: "Enterprise polish review"
  },
  {
    id: "merge-findings",
    label: "Merge and dedupe findings"
  }
]);

export const AI_REVIEW_RESPONSE_SHAPE = Object.freeze({
  findings: [
    {
      id: "string",
      category: REVIEW_FINDING_CATEGORIES.join(" | "),
      severity: REVIEW_FINDING_SEVERITIES.join(" | "),
      region: "string",
      issue: "string",
      evidence: "string",
      impact: "string",
      recommendation: "string",
      confidence: "number from 0.0 to 1.0",
      source: AI_REVIEW_SOURCE,
      screenshotRef: "string",
      selector: "string"
    }
  ]
});

export function aiReviewJsonContractText() {
  return [
    "Return valid JSON only. Do not wrap it in Markdown.",
    "The JSON object must use this shape:",
    JSON.stringify(AI_REVIEW_RESPONSE_SHAPE, null, 2),
    "Use only the allowed categories and severities.",
    `Every finding must set source to ${AI_REVIEW_SOURCE}.`,
    "Return an empty findings array when evidence is insufficient."
  ].join("\n");
}

export function isAiReviewMode(value) {
  return Object.values(AI_REVIEW_MODES).includes(value);
}

export function aiReviewPassLabel(passId) {
  return AI_REVIEW_PASSES.find((pass) => pass.id === passId)?.label || passId;
}
