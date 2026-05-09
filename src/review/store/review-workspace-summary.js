const SEVERITIES = ["critical", "high", "medium", "low"];
const CATEGORIES = [
  "visual-hierarchy",
  "ux",
  "accessibility-visible",
  "design-system",
  "enterprise-polish",
  "responsive-layout"
];

function emptyCounts(keys) {
  return keys.reduce((counts, key) => {
    counts[key] = 0;
    return counts;
  }, {});
}

function increment(counts, key) {
  if (!key) return;
  counts[key] = (counts[key] || 0) + 1;
}

function highestSeverity(severityCounts) {
  return SEVERITIES.find((severity) => Number(severityCounts?.[severity] || 0) > 0) || "";
}

export function summarizeReviewFindings(findings = []) {
  const severityCounts = emptyCounts(SEVERITIES);
  const categoryCounts = emptyCounts(CATEGORIES);
  const sourceCounts = {};

  findings.forEach((finding) => {
    increment(severityCounts, finding.severity);
    increment(categoryCounts, finding.category);
    increment(sourceCounts, finding.source);
  });

  return {
    findingCount: findings.length,
    severityCounts,
    categoryCounts,
    sourceCounts,
    highestSeverity: highestSeverity(severityCounts)
  };
}

export function buildReviewWorkspaceMetadata({
  findings = [],
  reviewContext,
  engineMetadata,
  aiReview,
  reportStatus,
  reportExportedAt
} = {}) {
  const summary = summarizeReviewFindings(findings);
  return {
    reviewWorkspace: true,
    reviewStatus: "reviewed",
    reviewedAt: new Date().toISOString(),
    reviewSourceType: reviewContext?.sourceType || engineMetadata?.sourceType || "unknown",
    reviewSummary: {
      ...summary,
      engineVersion: engineMetadata?.engineVersion || "",
      hasDomMetrics: Boolean(reviewContext?.hasDomMetrics || engineMetadata?.hasDomMetrics),
      isImageOnly: Boolean(reviewContext?.isImageOnly || engineMetadata?.isImageOnly),
      isDesignScreen: Boolean(reviewContext?.isDesignScreen || engineMetadata?.isDesignScreen),
      aiUsed: Boolean(aiReview)
    },
    reviewReportStatus: reportStatus || "not-exported",
    reviewReportExportedAt: reportExportedAt || "",
    privacyLocalOnlyMode: true
  };
}
