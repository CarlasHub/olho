import { severityRank } from "./finding-severity.js";

function overlapRatio(a = {}, b = {}) {
  if (!a || !b) return 0;
  const ax2 = Number(a.x || 0) + Number(a.width || 0);
  const ay2 = Number(a.y || 0) + Number(a.height || 0);
  const bx2 = Number(b.x || 0) + Number(b.width || 0);
  const by2 = Number(b.y || 0) + Number(b.height || 0);
  const xOverlap = Math.max(0, Math.min(ax2, bx2) - Math.max(Number(a.x || 0), Number(b.x || 0)));
  const yOverlap = Math.max(0, Math.min(ay2, by2) - Math.max(Number(a.y || 0), Number(b.y || 0)));
  const intersection = xOverlap * yOverlap;
  const minArea = Math.min(Number(a.width || 0) * Number(a.height || 0), Number(b.width || 0) * Number(b.height || 0));
  return minArea > 0 ? intersection / minArea : 0;
}

function similarIssue(a, b) {
  const first = `${a.category} ${a.region} ${a.selector}`.toLowerCase();
  const second = `${b.category} ${b.region} ${b.selector}`.toLowerCase();
  if (first === second) return true;
  const densityTerms = /density|overcrowd|crowded|fragmented/i;
  return densityTerms.test(a.issue) && densityTerms.test(b.issue) && overlapRatio(a.regionBounds, b.regionBounds) > 0.4;
}

function betterFinding(a, b) {
  const severityDelta = severityRank(a.severity) - severityRank(b.severity);
  if (severityDelta !== 0) return severityDelta > 0 ? a : b;
  return Number(a.confidence || 0) >= Number(b.confidence || 0) ? a : b;
}

export function dedupeFindings(findings = []) {
  const output = [];
  findings.forEach((finding) => {
    const matchIndex = output.findIndex(
      (existing) =>
        similarIssue(existing, finding) ||
        (existing.category === finding.category && overlapRatio(existing.regionBounds, finding.regionBounds) > 0.65)
    );
    if (matchIndex === -1) {
      output.push(finding);
      return;
    }
    output[matchIndex] = betterFinding(output[matchIndex], finding);
  });
  return output;
}
