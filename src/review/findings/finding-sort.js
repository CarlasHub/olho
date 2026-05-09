import { severityRank } from "./finding-severity.js";

const CATEGORY_PRIORITY = Object.freeze({
  "visual-hierarchy": 72,
  ux: 68,
  "design-system": 64,
  "enterprise-polish": 62,
  "accessibility-visible": 56,
  "responsive-layout": 44
});

function topPosition(finding) {
  const y = Number(finding?.regionBounds?.y);
  return Number.isFinite(y) ? y : 1000;
}

function priorityScore(finding = {}) {
  const severityScore = severityRank(finding.severity) * 18;
  const categoryScore = CATEGORY_PRIORITY[finding.category] || 40;
  const synthesisScore = finding.isSynthesisFinding ? 10 : 0;
  const confidenceScore = Math.round(Number(finding.confidence || 0) * 8);
  const topScore = Math.max(0, 8 - Math.min(8, topPosition(finding) / 12));
  return severityScore + categoryScore + synthesisScore + confidenceScore + topScore;
}

export function sortReviewFindings(findings = []) {
  return findings.slice().sort((a, b) => {
    const scoreDelta = priorityScore(b) - priorityScore(a);
    if (Math.abs(scoreDelta) > 0.01) return scoreDelta;
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    if (severityDelta !== 0) return severityDelta;
    const confidenceDelta = Number(b.confidence || 0) - Number(a.confidence || 0);
    if (Math.abs(confidenceDelta) > 0.001) return confidenceDelta;
    return topPosition(a) - topPosition(b);
  });
}
