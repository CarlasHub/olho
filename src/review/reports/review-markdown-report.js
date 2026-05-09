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
    `- Marker type: ${finding.markerType || "Not specified"}`,
    `- Evidence: ${finding.evidence}`,
    `- Impact: ${finding.impact}`,
    `- Best practice: ${finding.bestPracticeReference || "Not specified"}`,
    `- Reviewer rationale: ${finding.reviewRationale || "Not specified"}`,
    `- Affected users: ${finding.affectedUsers || "Not specified"}`,
    `- Recommendation: ${finding.recommendation}`,
    `- Evidence type: ${finding.evidenceType || "Not specified"}`,
    `- Suggested priority: ${finding.suggestedPriority || "Not specified"}`,
    `- Confidence: ${finding.confidencePercent}%`,
    `- Source: ${finding.source}`,
    "",
    "#### Acceptance criteria",
    ...(finding.acceptanceCriteria?.length
      ? finding.acceptanceCriteria.map((item) => `- ${item}`)
      : ["- The affected region has been reviewed visually."]),
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
    `- Review mode: ${report.metadata.reviewMode}`,
    `- Review target: ${report.metadata.targetLabel || "Not specified"}`,
    `- Target type: ${report.metadata.targetType || "Not specified"}`,
    `- Design/editor utility UI excluded: ${report.metadata.designAreaIsolationUsed ? "Yes" : "No"}`,
    `- Review depth: ${report.metadata.reviewDepthLabel}`,
    `- Review focus: ${report.metadata.reviewFocus}`,
    `- Image dimensions: ${dimensions}`,
    `- Review engine version: ${report.metadata.reviewEngineVersion}`,
    `- AI used: ${report.metadata.aiUsed ? "Yes" : "No"}`,
    `- AI provider: ${report.metadata.aiProvider || "None"}`,
    `- AI mode: ${report.metadata.aiReviewMode || "None"}`,
    `- Ollama model: ${report.metadata.aiModel || "None"}`,
    `- Local visual analysis: ${report.metadata.localVisualAnalysisUsed ? "Yes" : "No"}`,
    `- Screenshot shared with AI: ${report.metadata.aiScreenshotShared ? "Yes" : "No"}`,
    `- Screenshot/crop used for AI: ${report.metadata.aiScreenshotCropUsed ? "Yes" : "No"}`,
    `- AI ignored areas: ${report.metadata.aiIgnoredAreas?.length ? report.metadata.aiIgnoredAreas.join(", ") : "None"}`,
    "",
    "## Executive Summary",
    "",
    report.executiveSummary.humanSummary,
    report.executiveSummary.synthesisSummary || "",
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
    "### Review Indicators",
    ...linesForCounts(report.executiveSummary.reviewIndicators || {}),
    "",
    "### Screen Comprehension",
    report.executiveSummary.screenComprehension
      ? [
          `- Screen type: ${report.executiveSummary.screenComprehension.screenType}`,
          `- Likely user goal: ${report.executiveSummary.screenComprehension.likelyUserGoal}`,
          `- Primary content: ${report.executiveSummary.screenComprehension.primaryContent}`,
          `- Primary action: ${report.executiveSummary.screenComprehension.primaryAction || "Not detected"}`
        ].join("\n")
      : "- Not available",
    "",
    "## Review Scope",
    ...report.reviewScope.map((item) => `- ${item}`),
    "",
    "## Evidence Note",
    report.evidenceNote,
    "",
    ...(report.sourceMetadata.visualAnalysis?.evidence
      ? [
          "## Local Visual Analysis",
          "",
          "This report includes local pixel-level analysis. The visual layer extracts measurable facts from the design, such as colour, contrast, structure, spacing, and visual emphasis. Ollama, when used, reasons over that structured evidence.",
          "",
          `- Dominant colours: ${
            report.sourceMetadata.visualAnalysis.evidence.colourPalette?.length
              ? report.sourceMetadata.visualAnalysis.evidence.colourPalette
                  .map((colour) => `${colour.hex} (${Math.round(colour.coverage * 100)}%)`)
                  .join(", ")
              : "Not measured"
          }`,
          `- Low-contrast text-like regions: ${
            report.sourceMetadata.visualAnalysis.evidence.lowContrastTextLikeRegions?.length || 0
          }`,
          `- OCR-measured contrast risks: ${
            (report.sourceMetadata.visualAnalysis.evidence.ocrContrastResults || []).filter(
              (region) => Number(region.contrastRatio || 0) < 4.5
            ).length
          }`,
          `- Local OCR: ${
            report.sourceMetadata.visualAnalysis.evidence.ocr?.available
              ? `${report.sourceMetadata.visualAnalysis.evidence.ocr.provider || "available"}; ${
                  report.sourceMetadata.visualAnalysis.evidence.ocr.textRegionCount || 0
                } text region(s)`
              : report.sourceMetadata.visualAnalysis.evidence.ocr?.reason || "Unavailable"
          }`,
          `- Primary action dominance: ${
            report.sourceMetadata.visualAnalysis.evidence.visualHierarchy?.primaryActionDominance || "unknown"
          }`,
          `- Competing focal point risk: ${
            report.sourceMetadata.visualAnalysis.evidence.visualHierarchy?.competingFocalPointRisk ? "Yes" : "No"
          }`,
          `- Dense cluster count: ${
            report.sourceMetadata.visualAnalysis.evidence.spacingDensity?.denseClusterCount || 0
          }`,
          ""
        ]
      : []),
    ...(report.sourceMetadata.aiStaticDesign
      ? [
          "## Ollama Static Design Review Details",
          "",
          "### Local Vision Model Interpretation",
          `- Vision Transformer runtime: ${
            report.sourceMetadata.aiStaticDesign.visionTransformerRuntime?.available
              ? `${report.sourceMetadata.aiStaticDesign.visionTransformerRuntime.model || "local ViT"} available`
              : report.sourceMetadata.aiStaticDesign.visionTransformerRuntime?.reason || "Not configured"
          }`,
          `- Status: ${
            report.sourceMetadata.aiStaticDesign.localVisionModel
              ? report.sourceMetadata.aiStaticDesign.localVisionModel.available
                ? "Available"
                : "Unavailable"
              : "Not run"
          }`,
          `- Provider/model: ${
            report.sourceMetadata.aiStaticDesign.localVisionModel
              ? `${report.sourceMetadata.aiStaticDesign.localVisionModel.provider || "ollama"} ${
                  report.sourceMetadata.aiStaticDesign.localVisionModel.model || ""
                }`.trim()
              : "None"
          }`,
          `- Architecture: ${report.sourceMetadata.aiStaticDesign.localVisionModel?.architecture || "unknown"}`,
          `- Model observations: ${report.sourceMetadata.aiStaticDesign.localVisionModel?.modelObservations?.length || 0}`,
          "```json",
          JSON.stringify(report.sourceMetadata.aiStaticDesign.localVisionModel?.structuralSummary || {}, null, 2),
          "```",
          "",
          "### Screen Understanding",
          "```json",
          JSON.stringify(report.sourceMetadata.aiStaticDesign.screenUnderstanding || {}, null, 2),
          "```",
          "",
          "### Final Synthesis",
          "```json",
          JSON.stringify(report.sourceMetadata.aiStaticDesign.finalSynthesis || {}, null, 2),
          "```",
          "",
          "### AI Findings Quality Validation",
          "```json",
          JSON.stringify(report.sourceMetadata.aiStaticDesign.qualityValidationSummary || [], null, 2),
          "```",
          "",
          "### AI Limitations",
          ...(report.sourceMetadata.aiStaticDesign.limitations || []).map((item) => `- ${item}`),
          ""
        ]
      : []),
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
