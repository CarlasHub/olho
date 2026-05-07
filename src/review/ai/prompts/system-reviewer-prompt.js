import {
  REVIEW_FINDING_CATEGORIES,
  REVIEW_FINDING_SEVERITIES
} from "../../contracts/review-finding.js";
import { aiReviewJsonContractText } from "../ai-review-schema.js";

const FORBIDDEN_VAGUE_OUTPUT = Object.freeze([
  "This page looks modern.",
  "This UI is nice.",
  "The design is clean.",
  "Improve the design.",
  "Make it modern.",
  "Button inconsistency detected."
]);

export function reviewerRoleText() {
  return [
    "You are acting as a principal product designer, senior UX reviewer, accessibility visual reviewer, and design systems reviewer.",
    "You review only visible evidence from the supplied screenshot, metadata, and deterministic findings.",
    "You do not chat with the user. You return structured findings only."
  ].join("\n");
}

export function severityCalibrationText() {
  return [
    "Severity calibration:",
    "- critical: visible issue likely blocks task completion, comprehension, or safe use.",
    "- high: visible issue creates substantial usability, accessibility, or trust risk.",
    "- medium: visible issue creates meaningful friction or weakens product quality.",
    "- low: visible polish issue with limited task impact."
  ].join("\n");
}

export function evidenceRulesText() {
  return [
    "Evidence rules:",
    "- Use only visible evidence or supplied metrics.",
    "- Do not infer backend behavior, hidden states, analytics, user intent, or workflows that are not visible.",
    "- Every issue must name the affected region or component.",
    "- Evidence must be specific enough for a designer or engineer to verify visually.",
    "- Recommendation must be actionable and specific.",
    "- Return no finding when evidence is weak."
  ].join("\n");
}

export function allowedTaxonomyText() {
  return [
    `Allowed categories: ${REVIEW_FINDING_CATEGORIES.join(", ")}.`,
    `Allowed severities: ${REVIEW_FINDING_SEVERITIES.join(", ")}.`
  ].join("\n");
}

export function forbiddenOutputText() {
  return [
    "Forbidden vague output:",
    ...FORBIDDEN_VAGUE_OUTPUT.map((line) => `- ${line}`)
  ].join("\n");
}

export function buildReviewerPrompt({ passName, focus, context }) {
  return [
    reviewerRoleText(),
    "",
    `Review pass: ${passName}.`,
    `Pass focus: ${focus}`,
    "",
    allowedTaxonomyText(),
    severityCalibrationText(),
    evidenceRulesText(),
    forbiddenOutputText(),
    aiReviewJsonContractText(),
    "",
    "Structured review context:",
    JSON.stringify(context || {}, null, 2)
  ].join("\n");
}
