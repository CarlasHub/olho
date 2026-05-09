import {
  REVIEW_FINDING_CATEGORIES,
  REVIEW_FINDING_SEVERITIES
} from "../contracts/review-finding.js";

export const AI_REVIEW_SOURCE = "ai-review";

export const AI_REVIEW_MODES = Object.freeze({
  OFF: "off",
  TEXT_REFINE: "text-refine",
  FULL_VISUAL: "full-visual",
  STATIC_DESIGN_VISUAL: "static-design-visual",
  STATIC_DESIGN_SYNTHESIS: "static-design-synthesis"
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
      bestPracticeReference: "string",
      reviewRationale: "string",
      affectedUsers: "string",
      suggestedPriority: "string",
      markerSummary: "string",
      markerIntent: "string",
      acceptanceCriteria: ["string"],
      markerType: "section | component-group | text-region | action | accessibility-risk | composition",
      priority: "number from 1 to 12",
      evidenceType: "measured | inferred | model_observation | human_review_needed",
      confidence: "number from 0.0 to 1.0",
      source: AI_REVIEW_SOURCE,
      screenshotRef: "string",
      selector: "string",
      limitations: ["string"]
    }
  ]
});

export const AI_REVIEW_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "category",
          "severity",
          "region",
          "issue",
          "evidence",
          "impact",
          "recommendation",
          "bestPracticeReference",
          "reviewRationale",
          "affectedUsers",
          "suggestedPriority",
          "markerSummary",
          "markerIntent",
          "acceptanceCriteria",
          "markerType",
          "confidence",
          "source",
          "screenshotRef",
          "selector",
          "limitations"
        ],
        properties: {
          id: { type: "string" },
          category: { type: "string", enum: REVIEW_FINDING_CATEGORIES },
          severity: { type: "string", enum: REVIEW_FINDING_SEVERITIES },
          region: { type: "string" },
          issue: { type: "string" },
          evidence: { type: "string" },
          impact: { type: "string" },
          recommendation: { type: "string" },
          bestPracticeReference: { type: "string" },
          reviewRationale: { type: "string" },
          affectedUsers: { type: "string" },
          suggestedPriority: { type: "string" },
          markerSummary: { type: "string" },
          markerIntent: { type: "string" },
          acceptanceCriteria: {
            type: "array",
            minItems: 3,
            maxItems: 6,
            items: { type: "string" }
          },
          markerType: {
            type: "string",
            enum: ["section", "component-group", "text-region", "action", "accessibility-risk", "composition"]
          },
          priority: { type: "number", minimum: 1, maximum: 12 },
          evidenceType: {
            type: "string",
            enum: ["measured", "inferred", "model_observation", "human_review_needed"]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source: { type: "string", enum: [AI_REVIEW_SOURCE] },
          screenshotRef: { type: "string" },
          selector: { type: "string" },
          limitations: {
            type: "array",
            maxItems: 4,
            items: { type: "string" }
          }
        }
      }
    },
    screenUnderstanding: {
      type: "object",
      additionalProperties: true
    },
    finalSynthesis: {
      type: "object",
      additionalProperties: true
    },
    qualityIndicators: {
      type: "object",
      additionalProperties: true
    },
    mainRisks: {
      type: "array",
      items: { type: "string" }
    },
    recommendedNextActions: {
      type: "array",
      items: { type: "string" }
    },
    modelObservations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true
      }
    }
  }
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
