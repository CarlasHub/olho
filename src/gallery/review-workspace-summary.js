import { reviewModeBadge } from "../review/design/design-review-mode.js";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

function metadataFor(item = {}) {
  return item.metadata && typeof item.metadata === "object" ? item.metadata : {};
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceTypeFor(item = {}) {
  const metadata = metadataFor(item);
  const explicit = metadata.reviewSourceType || metadata.designReviewSourceType;
  if (explicit) return String(explicit);
  const sourceType = String(metadata.sourceType || item.sourceType || "").trim();
  if (["visible", "region", "fullPage", "element"].includes(sourceType)) return "webpage-capture";
  if (sourceType === "local-import" && (metadata.designReview || metadata.importedForReview)) return "design-import";
  if (sourceType === "local-import") return "static-design";
  return sourceType || "memory-image";
}

function severityCountsFor(metadata = {}) {
  const summary = metadata.reviewSummary || metadata.reportSummary || metadata.reviewReport?.summary || {};
  const candidates = [
    metadata.reviewSeverityCounts,
    metadata.severityCounts,
    summary.severityCounts,
    summary.findingsBySeverity
  ].filter(Boolean);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  const candidate = candidates[0] || {};
  SEVERITY_ORDER.forEach((severity) => {
    counts[severity] = Number(candidate[severity] || 0);
  });
  return counts;
}

function findingsArrayFor(metadata = {}) {
  if (Array.isArray(metadata.findings)) return metadata.findings;
  if (Array.isArray(metadata.reviewFindings)) return metadata.reviewFindings;
  if (Array.isArray(metadata.reviewReport?.findings)) return metadata.reviewReport.findings;
  return [];
}

function findingCountFor(metadata = {}) {
  const summary = metadata.reviewSummary || metadata.reportSummary || metadata.reviewReport?.summary || {};
  const direct = [
    metadata.reviewFindingCount,
    metadata.findingCount,
    summary.findingCount,
    summary.totalFindings
  ]
    .map(numberOrNull)
    .find((value) => value !== null);
  if (direct !== undefined) return direct;
  const findings = findingsArrayFor(metadata);
  return findings.length ? findings.length : null;
}

function severityText(counts = {}) {
  const parts = SEVERITY_ORDER
    .filter((severity) => Number(counts[severity] || 0) > 0)
    .map((severity) => `${severity.charAt(0).toUpperCase()}: ${counts[severity]}`);
  return parts.length ? parts.join(" · ") : "No severity summary";
}

function reportStatusFor(metadata = {}, hasFindingCount) {
  const explicit = String(metadata.reviewReportStatus || metadata.reportStatus || "").trim();
  if (explicit === "exported" || metadata.reviewReportExportedAt || metadata.reportExportedAt) return "Report exported";
  if (explicit === "ready") return "Report ready";
  if (explicit === "not-exported") return "Report not exported";
  if (hasFindingCount) return "Report ready";
  return "Report not generated";
}

function sourceLabel(sourceType) {
  if (sourceType === "webpage-capture") return "Live webpage";
  if (sourceType === "figma-capture") return "Figma";
  if (sourceType === "zeplin-capture") return "Zeplin";
  if (sourceType === "design-import") return "Imported design";
  if (sourceType === "static-design") return "Static design";
  if (sourceType === "screen-capture") return "Screen capture";
  return "Local image";
}

export function isReviewWorkspaceItem(item = {}) {
  return item.type === "image";
}

export function reviewWorkspaceSummaryForItem(item = {}) {
  const metadata = metadataFor(item);
  const sourceType = sourceTypeFor(item);
  const badge = reviewModeBadge(sourceType);
  const findingCount = findingCountFor(metadata);
  const hasFindingCount = findingCount !== null;
  const severityCounts = severityCountsFor(metadata);
  const reviewed = Boolean(metadata.reviewWorkspace || metadata.reviewStatus === "reviewed" || hasFindingCount);

  return {
    isReviewable: item.type === "image",
    reviewed,
    reviewType: badge.label,
    sourceType,
    sourceLabel: sourceLabel(sourceType),
    findingCount,
    findingCountLabel: hasFindingCount ? `${findingCount} finding${findingCount === 1 ? "" : "s"}` : "Findings not generated",
    severityCounts,
    severityText: severityText(severityCounts),
    reportStatus: reportStatusFor(metadata, hasFindingCount),
    statusLabel: reviewed ? "Reviewed" : "Ready for review"
  };
}

export function reviewWorkspaceStats(items = []) {
  const reviewableItems = items.filter(isReviewWorkspaceItem);
  const reviewedItems = reviewableItems.filter((item) => reviewWorkspaceSummaryForItem(item).reviewed);
  const severityTotals = { critical: 0, high: 0, medium: 0, low: 0 };
  let findingTotal = 0;
  let exportedReports = 0;

  reviewableItems.forEach((item) => {
    const summary = reviewWorkspaceSummaryForItem(item);
    if (summary.findingCount !== null) findingTotal += summary.findingCount;
    SEVERITY_ORDER.forEach((severity) => {
      severityTotals[severity] += Number(summary.severityCounts[severity] || 0);
    });
    if (summary.reportStatus === "Report exported") exportedReports += 1;
  });

  return {
    reviewableCount: reviewableItems.length,
    reviewedCount: reviewedItems.length,
    findingTotal,
    severityTotals,
    exportedReports
  };
}
