export function ollamaDesignEvidenceWorkflowText() {
  return [
    "Olho Review visual-analysis workflow:",
    "1. The original screenshot is preserved locally.",
    "2. Local deterministic visual analysis extracts measured facts: colour palette, contrast pairs, section-like regions, spacing/density, focal emphasis, alignment, and CTA-like visual emphasis.",
    "3. A local vision-capable model may optionally add structural interpretation, but those observations must be treated as model_observation rather than measured evidence.",
    "4. Ollama must reason over the structured evidence package and turn it into prioritised design-review feedback.",
    "5. Ollama is a reasoning and refinement layer. It is not the primary visual analyser and it must not invent facts."
  ].join("\n");
}

export function ollamaDesignEvidenceOutputRulesText() {
  return [
    "Evidence typing rules:",
    "- Use evidenceType: measured only when deterministic local visual analysis or DOM/style metrics directly support the finding.",
    "- Use evidenceType: model_observation only when the finding relies materially on local vision-model interpretation.",
    "- Use evidenceType: inferred when the finding is a cautious design inference from measured structure, density, or visual emphasis.",
    "- Use evidenceType: human_review_needed when the issue requires designer confirmation before action.",
    "- Do not say fails WCAG unless contrastRatio or other reliable accessibility measurement is supplied.",
    "- Use potential issue wording when evidence is inferred.",
    "- Every recommendation must be actionable and tied to the visible affected region."
  ].join("\n");
}

export function ollamaStructuredEvidenceReminderText() {
  return [
    "Structured evidence package fields to prioritise:",
    "- localVisualAnalysis.colourPalette for dominant/repeated colours",
    "- localVisualAnalysis.measuredContrastPairs for contrast ratios",
    "- localVisualAnalysis.lowContrastTextLikeRegions for measured readability risks",
    "- localVisualAnalysis.ocrTextRegions for locally detected text regions when browser OCR is available",
    "- localVisualAnalysis.layoutRegions for approximate section boundaries",
    "- localVisualAnalysis.visualHierarchy for focal points and primary-action dominance",
    "- localVisualAnalysis.spacingDensity for crowded regions and dense clusters",
    "- localVisualAnalysis.alignment for coarse alignment risks",
    "- localVisualAnalysis.ctaCandidates for visually emphatic action-like regions",
    "- deterministicFindings for rule-engine findings that must be preserved"
  ].join("\n");
}
