export function professionalFindingCopy({ issue, evidence, impact, recommendation }) {
  return {
    issue: String(issue || "").trim(),
    evidence: String(evidence || "").trim(),
    impact: String(impact || "").trim(),
    recommendation: String(recommendation || "").trim()
  };
}
