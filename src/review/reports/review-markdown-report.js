import { buildReviewReport } from "./review-report-builder.js";

function linesForCounts(counts) {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([label, total]) => `- ${label}: ${total}`) : ["- None"];
}

function findingMarkdown(finding, index) {
  return [
    `### ${index + 1}. [${finding.severity}] ${finding.issue}`,
    "",
    `- Category: ${finding.categoryLabel}`,
    `- Region: ${finding.region}`,
    `- Evidence: ${finding.evidence}`,
    `- Impact: ${finding.impact}`,
    `- Recommendation: ${finding.recommendation}`,
    `- Confidence: ${finding.confidencePercent}%`,
    `- Source: ${finding.source}`,
    "",
    "#### Ticket-ready",
    "",
    finding.ticket.body
  ].join("\n");
}

export function buildMarkdownReviewReport(session = {}) {
  const report = buildReviewReport(session);
  const dimensions = `${report.metadata.imageDimensions.width || "unknown"} x ${
    report.metadata.imageDimensions.height || "unknown"
  }`;

  return [
    "# Olho Review: Visual UI/UX and Accessibility Review",
    "",
    `- Generated: ${report.metadata.generatedAt}`,
    `- Source type: ${report.metadata.sourceType}`,
    `- Image dimensions: ${dimensions}`,
    `- Review engine version: ${report.metadata.reviewEngineVersion}`,
    `- AI used: ${report.metadata.aiUsed ? "Yes" : "No"}`,
    `- AI provider: ${report.metadata.aiProvider || "None"}`,
    `- Screenshot shared with AI: ${report.metadata.aiScreenshotShared ? "Yes" : "No"}`,
    "",
    "## Executive Summary",
    "",
    report.executiveSummary.humanSummary,
    "",
    `- Total findings: ${report.executiveSummary.totalFindings}`,
    "",
    "### Findings by Severity",
    ...linesForCounts(report.executiveSummary.bySeverity),
    "",
    "### Findings by Category",
    ...linesForCounts(report.executiveSummary.byCategory),
    "",
    "### Highest Priority Issues",
    ...(report.executiveSummary.highestPriorityIssues.length
      ? report.executiveSummary.highestPriorityIssues.map(
          (finding) => `- [${finding.severity}] ${finding.category}: ${finding.issue} (${finding.region})`
        )
      : ["- No high-confidence findings generated."]),
    "",
    "## Review Scope",
    ...report.reviewScope.map((item) => `- ${item}`),
    "",
    "## Evidence Note",
    report.evidenceNote,
    "",
    "## Findings",
    report.findings.length
      ? report.findings.map((finding, index) => findingMarkdown(finding, index)).join("\n\n")
      : "No findings were generated from the available deterministic evidence.",
    "",
    "## Limitations",
    ...report.limitations.map((item) => `- ${item}`),
    ""
  ].join("\n");
}
