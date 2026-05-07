import { severityRank } from "./finding-severity.js";

function topPosition(finding) {
  const y = Number(finding?.regionBounds?.y);
  return Number.isFinite(y) ? y : 1000;
}

export function sortReviewFindings(findings = []) {
  return findings.slice().sort((a, b) => {
    const topDelta = topPosition(a) - topPosition(b);
    if (Math.abs(topDelta) > 3) return topDelta;
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    if (severityDelta !== 0) return severityDelta;
    return Number(b.confidence || 0) - Number(a.confidence || 0);
  });
}
