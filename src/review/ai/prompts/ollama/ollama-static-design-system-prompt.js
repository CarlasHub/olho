import { aiReviewJsonContractText } from "../../ai-review-schema.js";
import {
  ollamaDesignEvidenceOutputRulesText,
  ollamaDesignEvidenceWorkflowText,
  ollamaStructuredEvidenceReminderText
} from "./ollama-design-evidence-review-prompt.js";

export const OLLAMA_STATIC_DESIGN_PASSES = Object.freeze([
  { id: "ollama-screen-understanding", label: "Screen understanding" },
  { id: "ollama-region-review", label: "Region review" },
  { id: "ollama-ux-clarity", label: "UX clarity review" },
  { id: "ollama-accessibility-visible", label: "Accessibility-visible review" },
  { id: "ollama-design-system", label: "Design-system review" },
  { id: "ollama-enterprise-polish", label: "Enterprise polish review" },
  { id: "ollama-gap-analysis", label: "Gap analysis" },
  { id: "ollama-final-synthesis", label: "Final synthesis" }
]);

export function ollamaStaticDesignRoleText() {
  return [
    "You are Ollama running as an optional local design-review reasoning layer for Olho Review.",
    "You are not a chatbot and you are not the source of truth. Deterministic local findings remain primary.",
    "Your job is to explain, prioritise, and refine design-review feedback from structured local visual evidence.",
    "Do not praise the interface. Critically evaluate visible communication quality, usability clarity, hierarchy, accessibility-visible risk, consistency, and enterprise polish.",
    "Use only the supplied static design context package, deterministic findings, measured visual evidence, optional model observations, and visible evidence."
  ].join("\n");
}

export function ollamaStaticDesignGuardrailsText() {
  return [
    "Static design guardrails:",
    "- Review only the selected design/artboard area when target isolation is active.",
    "- Ignore Zeplin/Figma editor chrome, toolbars, side panels, specs/comments panels, browser chrome, and extension UI unless the user selected the entire visible screen.",
    "- Do not invent hidden workflows, code behavior, analytics, backend logic, keyboard order, focus states, or assistive technology behavior.",
    "- Do not claim WCAG failure unless measured contrast/focus data is explicitly supplied.",
    "- Treat local visual-analysis facts marked measured_evidence as stronger than model_observation or inferred evidence.",
    "- Treat model_observation as interpretation that needs grounding in visible or measured evidence.",
    "- Every finding must cite visible evidence and affected region.",
    "- Reject low-confidence observations instead of padding the review.",
    "- Prefer 5 to 12 prioritised findings after synthesis, not scanner spam."
  ].join("\n");
}

export function ollamaFindingRequirementsText() {
  return [
    "Every finding must include:",
    "- what is unclear, inconsistent, hard to read, hard to scan, or weakly polished",
    "- the visible evidence that supports the finding",
    "- the user/product/accessibility-visible impact",
    "- a specific recommendation",
    "- bestPracticeReference",
    "- acceptanceCriteria",
    "- affectedUsers",
    "- confidence",
    "- evidenceType using measured, inferred, model_observation, or human_review_needed",
    "- markerIntent or markerSummary indicating where a marker should land"
  ].join("\n");
}

export function buildOllamaStaticDesignPrompt({
  passName,
  passGoal,
  contextPackage,
  compressedContext,
  candidateFindings = [],
  staticInsights = {}
}) {
  return [
    ollamaStaticDesignRoleText(),
    "",
    ollamaDesignEvidenceWorkflowText(),
    "",
    `Pass: ${passName}`,
    `Pass goal: ${passGoal}`,
    "",
    ollamaStaticDesignGuardrailsText(),
    ollamaDesignEvidenceOutputRulesText(),
    ollamaStructuredEvidenceReminderText(),
    ollamaFindingRequirementsText(),
    aiReviewJsonContractText(),
    "",
    "Compressed static design context package:",
    JSON.stringify(compressedContext || contextPackage || {}, null, 2),
    "",
    "Candidate findings from previous Ollama passes:",
    JSON.stringify(candidateFindings || [], null, 2),
    "",
    "Structured model observations and synthesis gathered so far:",
    JSON.stringify(staticInsights || {}, null, 2)
  ].join("\n");
}
