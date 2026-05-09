export const REVIEW_DEPTHS = Object.freeze({
  quick: Object.freeze({
    id: "quick",
    label: "Quick review",
    description: "Top 3 to 5 high-confidence findings.",
    maxFindings: 5,
    maxSynthesisFindings: 1
  }),
  standard: Object.freeze({
    id: "standard",
    label: "Standard review",
    description: "Balanced 5 to 10 finding review.",
    maxFindings: 10,
    maxSynthesisFindings: 4
  }),
  deep: Object.freeze({
    id: "deep",
    label: "Deep review",
    description: "Broader 10 to 20 finding review when evidence supports it.",
    maxFindings: 20,
    maxSynthesisFindings: 8
  })
});

export function resolveReviewDepth(value = "standard") {
  const id = String(value || "standard").trim().toLowerCase();
  return REVIEW_DEPTHS[id] || REVIEW_DEPTHS.standard;
}

export function clampFindingsToDepth(findings = [], depth = REVIEW_DEPTHS.standard) {
  const limit = Number(depth?.maxFindings || REVIEW_DEPTHS.standard.maxFindings);
  const max = Math.max(1, limit);
  return findings.slice(0, max);
}
