import { categoryLabel } from "../findings/category-registry.js";
import { buildFindingTicket } from "./ticket-builder.js";

const REVIEW_SCOPE = Object.freeze([
  "Visual hierarchy",
  "UX clarity",
  "Accessibility-visible risks",
  "Design-system consistency",
  "Enterprise polish",
  "Responsive and layout risks where detectable"
]);

const LIMITATIONS = Object.freeze([
  "This is a static visual review and cannot confirm dynamic behavior, backend state, or end-to-end workflow correctness.",
  "DOM metadata improves precision; image-only screenshots limit rules that require element bounds, computed styles, focus state, or semantic roles.",
  "Focus-state findings are only possible when focused-state metrics are supplied or separately tested.",
  "Design screenshots and flat images may not expose interaction states, hidden content, responsive breakpoints, or assistive technology semantics."
]);

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function severityRank(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity] || 0;
}

function highestPriorityFindings(findings) {
  return findings
    .slice()
    .sort((a, b) => {
      const severityDelta = severityRank(b.severity) - severityRank(a.severity);
      if (severityDelta !== 0) return severityDelta;
      return Number(b.confidence || 0) - Number(a.confidence || 0);
    })
    .slice(0, 5);
}

function readableSummary({ findings, sourceType, hasDomMetrics }) {
  if (!findings.length) {
    return hasDomMetrics
      ? "No high-confidence deterministic findings were generated from the available review metadata."
      : "No findings were generated because the source is image-only and no DOM or computed-style metadata was available for deterministic visual rules.";
  }

  const highPriority = highestPriorityFindings(findings)[0];
  const severityCounts = countBy(findings, "severity");
  const topSeverity = ["critical", "high", "medium", "low"].find((severity) => severityCounts[severity]) || "low";
  return `The review found ${findings.length} evidence-based issue${
    findings.length === 1 ? "" : "s"
  }, with the highest current priority at ${topSeverity}. The leading concern is: ${highPriority.issue}`;
}

function normalizeMetadata(session = {}) {
  const engine = session.engineMetadata || {};
  const media = session.media || {};
  const aiReview = session.aiReview || {};
  const aiUsed = Boolean(aiReview.status === "complete" || (session.findings || []).some((finding) => finding.source === "ai-review"));
  return {
    productName: "Olho Review",
    reportType: "Visual UI/UX and Accessibility Review",
    generatedAt: new Date().toISOString(),
    sourceType: engine.sourceType || "image-only",
    imageDimensions: {
      width: Number(media.width || 0),
      height: Number(media.height || 0)
    },
    reviewEngineVersion: engine.engineVersion || "unknown",
    aiUsed,
    aiProvider: aiReview.providerLabel || aiReview.provider || "",
    aiReviewMode: aiReview.mode || "",
    aiScreenshotShared: Boolean(aiReview.screenshotShared),
    screenshotRef: session.screenshotRef || "",
    itemId: session.itemId || "",
    title: session.title || "Untitled screenshot"
  };
}

function evidenceNote(metadata) {
  if (!metadata.aiUsed) {
    return [
      "Findings are based on local deterministic visual analysis.",
      "No screenshots were uploaded.",
      "No AI was used.",
      "Image-only limitations apply where DOM metadata is unavailable."
    ].join(" ");
  }

  return [
    "Findings combine local deterministic visual analysis with optional AI review.",
    metadata.aiScreenshotShared
      ? "A screenshot was shared only after explicit user action and consent for AI review."
      : "No screenshot was shared with the AI provider.",
    "AI output was schema-validated before inclusion.",
    "Image-only limitations apply where DOM metadata is unavailable."
  ].join(" ");
}

export function buildReviewReport(session = {}) {
  const findings = Array.isArray(session.findings) ? session.findings : [];
  const metadata = normalizeMetadata(session);
  const summary = {
    totalFindings: findings.length,
    bySeverity: countBy(findings, "severity"),
    byCategory: Object.fromEntries(
      Object.entries(countBy(findings, "category")).map(([category, total]) => [categoryLabel(category), total])
    ),
    highestPriorityIssues: highestPriorityFindings(findings).map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      category: categoryLabel(finding.category),
      issue: finding.issue,
      region: finding.region
    })),
    humanSummary: readableSummary({
      findings,
      sourceType: metadata.sourceType,
      hasDomMetrics: Boolean(session.engineMetadata?.hasDomMetrics)
    })
  };

  return {
    metadata,
    executiveSummary: summary,
    reviewScope: REVIEW_SCOPE,
    evidenceNote: evidenceNote(metadata),
    findings: findings.map((finding) => ({
      ...finding,
      categoryLabel: categoryLabel(finding.category),
      confidencePercent: Math.round(Number(finding.confidence || 0) * 100),
      ticket: buildFindingTicket(finding)
    })),
    limitations: [...LIMITATIONS],
    sourceMetadata: {
      engineMetadata: session.engineMetadata || {},
      skippedRules: session.skippedRules || [],
      aiReview: session.aiReview || null,
      readOnly: Boolean(session.readOnly),
      screenshotRef: session.screenshotRef || ""
    }
  };
}

export function buildReviewSummaryMarkdown(session = {}) {
  const report = buildReviewReport(session);
  const severityLines = Object.entries(report.executiveSummary.bySeverity).map(([severity, total]) => `- ${severity}: ${total}`);
  const categoryLines = Object.entries(report.executiveSummary.byCategory).map(([category, total]) => `- ${category}: ${total}`);
  const priorityLines = report.executiveSummary.highestPriorityIssues.length
    ? report.executiveSummary.highestPriorityIssues.map(
        (finding) => `- [${finding.severity}] ${finding.category}: ${finding.issue} (${finding.region})`
      )
    : ["- No high-confidence findings generated."];

  return [
    "# Olho Review Summary",
    "",
    `Generated: ${report.metadata.generatedAt}`,
    `Source type: ${report.metadata.sourceType}`,
    `AI used: ${report.metadata.aiUsed ? "Yes" : "No"}`,
    "",
    "## Executive Summary",
    report.executiveSummary.humanSummary,
    "",
    "## Findings by Severity",
    ...severityLines,
    "",
    "## Findings by Category",
    ...categoryLines,
    "",
    "## Highest Priority Issues",
    ...priorityLines,
    "",
    "## Evidence Note",
    report.evidenceNote
  ].join("\n");
}
