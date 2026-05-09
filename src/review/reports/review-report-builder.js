import { categoryLabel } from "../findings/category-registry.js";
import { buildFindingTicket } from "./ticket-builder.js";
import { DESIGN_REVIEW_LIMITATIONS } from "../design/design-review-limitations.js";
import { isDesignReviewSourceType, reviewModeLabel } from "../design/design-review-mode.js";

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
  const sourceType = engine.sourceType || session.reviewSourceType || session.designReview?.sourceType || "static-design";
  return {
    productName: "Olho Review",
    reportType: "Visual UI/UX and Accessibility Review",
    generatedAt: new Date().toISOString(),
    sourceType,
    reviewMode: session.reviewMode === "side-panel-live-review" ? "Side panel live visual review" : reviewModeLabel(sourceType),
    targetType: session.reviewTarget?.type || session.designReview?.target?.type || "",
    targetLabel: session.reviewTarget?.label || session.designReview?.target?.label || "",
    targetBounds: session.reviewTarget?.bounds || session.designReview?.target?.bounds || null,
    designAreaIsolationUsed: Boolean(
      session.reviewTarget?.excludesPageChrome || session.designReview?.target?.excludesPageChrome
    ),
    isDesignReview: Boolean(session.designReview?.isDesignScreen || isDesignReviewSourceType(sourceType)),
    imageDimensions: {
      width: Number(media.width || 0),
      height: Number(media.height || 0)
    },
    reviewEngineVersion: engine.engineVersion || "unknown",
    reviewDepth: session.reviewDepth || engine.reviewDepth || "standard",
    reviewDepthLabel: session.reviewDepthLabel || engine.reviewDepthLabel || "Standard review",
    reviewFocus: session.reviewFocus || "all",
    aiUsed,
    aiStatus: aiUsed ? "AI used" : "AI not used",
    aiProvider: aiReview.providerLabel || aiReview.provider || "",
    aiReviewMode: aiReview.mode || "",
    aiModel: aiReview.capabilities?.model || "",
    aiScreenshotShared: Boolean(aiReview.screenshotShared),
    aiScreenshotCropUsed: Boolean(aiReview.screenshotCropUsed),
    aiIgnoredAreas: aiReview.staticDesignContext?.targetIsolation?.ignoredAreas || [],
    localVisualAnalysisUsed: Boolean(session.visualAnalysis || engine.visualAnalysis),
    screenshotRef: session.screenshotRef || "",
    itemId: session.itemId || "",
    title: session.title || "Untitled screenshot"
  };
}

function evidenceNote(metadata) {
  const visualAnalysisNote = metadata.localVisualAnalysisUsed
    ? "A local visual analysis layer measured colour, contrast, structure, density, and visual emphasis from screenshot pixels."
    : "No local pixel-level visual analysis was available for this report.";
  if (!metadata.aiUsed) {
    return [
      "Findings are based on local deterministic visual analysis.",
      visualAnalysisNote,
      "No screenshots were uploaded.",
      "No AI was used.",
      "Image-only limitations apply where DOM metadata is unavailable."
    ].join(" ");
  }

  return [
    "Findings combine local deterministic visual analysis with optional AI review.",
    visualAnalysisNote,
    metadata.aiScreenshotShared
      ? "A screenshot was shared only after explicit user action and consent for AI review."
      : "No screenshot was shared with the AI provider.",
    "AI output was schema-validated before inclusion.",
    "Image-only limitations apply where DOM metadata is unavailable."
  ].join(" ");
}

function limitationsForMetadata(metadata) {
  const limitations = [...LIMITATIONS];
  if (metadata.isDesignReview) {
    DESIGN_REVIEW_LIMITATIONS.forEach((limitation) => {
      if (!limitations.includes(limitation)) limitations.push(limitation);
    });
  }
  return limitations;
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
    }),
    synthesisSummary: session.synthesisSummary || session.engineMetadata?.synthesisSummary || "",
    reviewIndicators: session.reviewIndicators || session.engineMetadata?.reviewIndicators || {},
    screenComprehension: session.screenComprehension || session.engineMetadata?.screenComprehension || null
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
      bestPracticeReference: finding.bestPracticeReference || "",
      reviewRationale: finding.reviewRationale || "",
      affectedUsers: finding.affectedUsers || "",
      suggestedPriority: finding.suggestedPriority || "",
      markerSummary: finding.markerSummary || "",
      priority: Number.isFinite(Number(finding.priority)) ? Number(finding.priority) : null,
      evidenceType: finding.evidenceType || finding.evidence_type || (finding.source === "rule-engine" ? "measured" : "inferred"),
      evidence_type: finding.evidence_type || finding.evidenceType || (finding.source === "rule-engine" ? "measured" : "inferred"),
      acceptanceCriteria: Array.isArray(finding.acceptanceCriteria) ? finding.acceptanceCriteria : [],
      markerType: finding.markerType || "",
      reviewPass: finding.reviewPass || "",
      ticket: buildFindingTicket(finding)
    })),
    limitations: limitationsForMetadata(metadata),
    sourceMetadata: {
      engineMetadata: session.engineMetadata || {},
      skippedRules: session.skippedRules || [],
      reviewPasses: session.engineMetadata?.reviewPasses || [],
      aiReview: session.aiReview || null,
      aiStaticDesign: session.aiReview
        ? {
            model: session.aiReview.capabilities?.model || "",
            capability: session.aiReview.capabilities?.capability || "",
            screenshotCropUsed: Boolean(session.aiReview.screenshotCropUsed),
            screenshotCrop: session.aiReview.screenshotCrop || null,
            ignoredAreas: session.aiReview.staticDesignContext?.targetIsolation?.ignoredAreas || [],
            localVisionModel:
              session.aiReview.localVisionModel ||
              session.aiReview.staticDesignInsights?.localVisionModel ||
              session.aiReview.staticDesignContext?.localVisionModel ||
              null,
            visionTransformerRuntime: session.aiReview.visionTransformerRuntime || null,
            screenUnderstanding: session.aiReview.staticDesignInsights?.screenUnderstanding || null,
            finalSynthesis: session.aiReview.staticDesignInsights?.finalSynthesis || null,
            qualityValidationSummary: session.aiReview.qualityValidationSummary || [],
            limitations: session.aiReview.staticDesignContext?.limitations || []
          }
        : null,
      visualAnalysis: session.visualAnalysis || session.engineMetadata?.visualAnalysis || null,
      designReview: session.designReview || null,
      reviewTarget: session.reviewTarget || session.designReview?.target || null,
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
    `Review depth: ${report.metadata.reviewDepthLabel}`,
    `AI used: ${report.metadata.aiUsed ? "Yes" : "No"}`,
    "",
    "## Executive Summary",
    report.executiveSummary.humanSummary,
    report.executiveSummary.synthesisSummary || "",
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
