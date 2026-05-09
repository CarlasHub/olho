import test from "node:test";
import assert from "node:assert/strict";
import { buildHtmlReviewReport } from "../src/review/reports/review-html-report.js";
import { buildJsonReviewReport } from "../src/review/reports/review-json-report.js";
import { buildMarkdownReviewReport } from "../src/review/reports/review-markdown-report.js";
import { buildReviewReport, buildReviewSummaryMarkdown } from "../src/review/reports/review-report-builder.js";
import { buildFindingTicket, buildTicketMarkdown } from "../src/review/reports/ticket-builder.js";
import { reviewReportFilename } from "../src/review/reports/report-download.js";

function sampleSession() {
  return {
    itemId: "review-sample",
    title: "Checkout dashboard",
    screenshotRef: "media:review-sample",
    readOnly: true,
    media: {
      width: 1440,
      height: 900,
      sizeBytes: 345678,
      mimeType: "image/png",
      createdAt: "2026-05-07T10:20:00.000Z"
    },
    engineMetadata: {
      engineVersion: "1.0.0-enterprise",
      sourceType: "dom-metrics",
      hasDomMetrics: true,
      reviewDepth: "standard",
      reviewDepthLabel: "Standard review",
      synthesisSummary: "Synthesised reviewer observations from deterministic rule evidence.",
      reviewIndicators: {
        visualHierarchy: "Needs attention",
        uxClarity: "Mostly strong",
        accessibilityVisibleRisk: "Needs attention",
        designSystemConsistency: "Strong",
        enterprisePolish: "Mostly strong"
      },
      screenComprehension: {
        screenType: "Task-led webpage or product screen",
        likelyUserGoal: "Choose the correct checkout action.",
        primaryContent: "Checkout dashboard",
        primaryAction: "Continue",
        mainVisualRegions: ["Header", "Main content"],
        dominantCompositionPattern: "Standard visible page",
        confidence: 0.78
      },
      ruleCount: 30,
      findingCount: 2,
      executionTimeMs: 12,
      visualScore: 82,
      visualAnalysis: {
        version: "1.0.0-local",
        source: {
          sourceType: "dom-metrics",
          width: 1440,
          height: 900,
          originalPreserved: true,
          cropUsed: false,
          cropBounds: null
        },
        evidence: {
          imageMetadata: { width: 1440, height: 900, analysedWidth: 1440, analysedHeight: 900, sampleCount: 1000 },
          colourPalette: [{ hex: "#ffffff", coverage: 0.72, evidence_type: "measured_evidence" }],
          contrastPairs: [{ region: "tile-0-0", foreground: "#111827", background: "#ffffff", contrastRatio: 17.74 }],
          lowContrastTextLikeRegions: [{ region: "tile-1-1", contrastRatio: 3.2 }],
          layoutRegions: [{ id: "visual-region-1", type: "top content band" }],
          visualHierarchy: { focalPoints: [], competingFocalPointRisk: false, primaryActionDominance: "dominant" },
          spacingDensity: { crowdedRegions: [], denseClusterCount: 0, weakSpacingRisk: false },
          alignment: { inconsistentAlignmentRisk: false, observations: [] },
          repeatedColourUse: { accentColours: [], observations: [] },
          ctaCandidates: []
        },
        modelObservations: [],
        limitations: []
      }
    },
    skippedRules: [{ ruleId: "typography/poor-line-height", reason: "Evidence threshold not met." }],
    findings: [
      {
        id: "visual-hierarchy/competing-primary-actions:abc",
        category: "visual-hierarchy",
        categoryLabel: "Visual hierarchy",
        severity: "medium",
        region: "Header actions",
        issue: "Primary and secondary actions compete for attention.",
        evidence: "The two header actions have nearly identical visual weight and placement.",
        impact: "Users may need extra time to identify the intended next action.",
        recommendation: "Make the preferred action visually dominant and reduce the secondary action weight.",
        bestPracticeReference: "Primary actions should be visually distinct from secondary actions.",
        reviewRationale: "The finding combines visible action placement, size, and contrast.",
        affectedUsers: "Users deciding how to proceed.",
        suggestedPriority: "Address before release for task-led screens.",
        markerSummary: "Action priority",
        markerType: "action",
        acceptanceCriteria: [
          "The primary action is visually dominant.",
          "Secondary actions are visibly subordinate.",
          "The action group follows the reading path.",
          "The pattern remains consistent with nearby controls."
        ],
        confidence: 0.78,
        screenshotRef: "media:review-sample",
        selector: ".primary-action",
        source: "rule-engine"
      },
      {
        id: "accessibility-visible/low-contrast-risk:def",
        category: "accessibility-visible",
        categoryLabel: "Visible accessibility",
        severity: "high",
        region: "Status text",
        issue: "Text contrast appears below accessible readability thresholds.",
        evidence: "Status copy has an estimated contrast ratio below 4.5:1.",
        impact: "Low-vision users may miss important state information.",
        recommendation: "Increase foreground/background contrast for the status copy.",
        confidence: 0.86,
        screenshotRef: "media:review-sample",
        selector: ".status-copy",
        source: "rule-engine"
      }
    ]
  };
}

test("report builder creates professional summary metadata and counts", () => {
  const report = buildReviewReport(sampleSession());

  assert.equal(report.metadata.productName, "Olho Review");
  assert.equal(report.metadata.reportType, "Visual UI/UX and Accessibility Review");
  assert.equal(report.metadata.aiUsed, false);
  assert.equal(report.metadata.aiStatus, "AI not used");
  assert.equal(report.executiveSummary.totalFindings, 2);
  assert.equal(report.executiveSummary.bySeverity.high, 1);
  assert.equal(report.executiveSummary.bySeverity.medium, 1);
  assert.equal(report.executiveSummary.byCategory["Visual hierarchy"], 1);
  assert.equal(report.metadata.reviewDepthLabel, "Standard review");
  assert.equal(report.metadata.localVisualAnalysisUsed, true);
  assert.equal(report.executiveSummary.synthesisSummary.includes("Synthesised"), true);
  assert.equal(report.executiveSummary.reviewIndicators.visualHierarchy, "Needs attention");
  assert.equal(report.reviewScope.includes("UX clarity"), true);
  assert.equal(report.evidenceNote.includes("No screenshots were uploaded"), true);
  assert.equal(report.limitations.some((line) => line.includes("image-only")), true);
});

test("HTML report is self-contained and presents findings professionally", () => {
  const html = buildHtmlReviewReport(sampleSession());

  assert.equal(html.includes("<!doctype html>"), true);
  assert.equal(html.includes("Olho Review"), true);
  assert.equal(html.includes("Visual UI/UX and Accessibility Review"), true);
  assert.equal(html.includes("AI used"), true);
  assert.equal(html.includes("Best practice"), true);
  assert.equal(html.includes("Review Indicators"), true);
  assert.equal(html.includes("Severity: high"), true);
  assert.equal(html.includes("Ticket-ready version"), true);
  assert.equal(html.includes("Local Visual Analysis"), true);
  assert.equal(html.includes("Acceptance criteria"), true);
  assert.equal(/https?:\/\//i.test(html), false);
  assert.equal(/<script/i.test(html), false);
});

test("Markdown report is paste-ready and includes ticket blocks", () => {
  const markdown = buildMarkdownReviewReport(sampleSession());

  assert.equal(markdown.includes("# Olho Review: Visual UI/UX and Accessibility Review"), true);
  assert.equal(markdown.includes("## Executive Summary"), true);
  assert.equal(markdown.includes("#### Ticket-ready"), true);
  assert.equal(markdown.includes("- Best practice:"), true);
  assert.equal(markdown.includes("### Review Indicators"), true);
  assert.equal(markdown.includes("### Acceptance Criteria"), true);
  assert.equal(markdown.includes("- AI used: No"), true);
  assert.equal(markdown.includes("## Local Visual Analysis"), true);
});

test("JSON report preserves structured findings and source metadata", () => {
  const parsed = JSON.parse(buildJsonReviewReport(sampleSession()));

  assert.equal(parsed.metadata.reviewEngineVersion, "1.0.0-enterprise");
  assert.equal(parsed.metadata.aiStatus, "AI not used");
  assert.equal(parsed.metadata.reviewDepth, "standard");
  assert.equal(parsed.findings.length, 2);
  assert.equal(parsed.findings[0].ticket.acceptanceCriteria.length, 4);
  assert.equal(parsed.findings[0].bestPracticeReference.includes("Primary actions"), true);
  assert.equal(parsed.executiveSummary.screenComprehension.screenType.includes("Task-led"), true);
  assert.equal(parsed.sourceMetadata.skippedRules.length, 1);
  assert.equal(parsed.sourceMetadata.visualAnalysis.evidence.colourPalette[0].hex, "#ffffff");
  assert.equal(parsed.findings[0].evidence_type, "measured");
});

test("ticket builder creates Jira/GitHub-ready Markdown", () => {
  const finding = sampleSession().findings[0];
  const ticket = buildFindingTicket(finding);
  const markdown = buildTicketMarkdown(finding);

  assert.equal(ticket.title.startsWith("[Medium] [Visual hierarchy]"), true);
  assert.equal(markdown.includes("- Region/component: Header actions"), true);
  assert.equal(markdown.includes("- Best practice: Primary actions should be visually distinct from secondary actions."), true);
  assert.equal(markdown.includes("- Screenshot/reference note: media:review-sample; selector .primary-action"), true);
  assert.equal(markdown.includes("- The pattern remains consistent with nearby controls."), true);
});

test("summary Markdown and filenames are safe for local export", () => {
  const summary = buildReviewSummaryMarkdown(sampleSession());
  const filename = reviewReportFilename({ title: "Checkout / Dashboard: Review" }, "md");

  assert.equal(summary.includes("## Evidence Note"), true);
  assert.equal(filename.endsWith(".md"), true);
  assert.equal(/[/:]/.test(filename), false);
});

test("reports disclose optional AI usage when AI findings are present", () => {
  const session = sampleSession();
  session.aiReview = {
    status: "complete",
    provider: "ollama",
    providerLabel: "Ollama local",
    mode: "static-design-synthesis",
    screenshotShared: false,
    screenshotCropUsed: true,
    capabilities: {
      model: "llama3.2-vision:latest",
      capability: "vision-capable"
    },
    staticDesignContext: {
      targetIsolation: {
        ignoredAreas: ["Zeplin toolbar", "Zeplin side panels"]
      },
      limitations: ["Static design review cannot confirm dynamic behavior."]
    },
    staticDesignInsights: {
      screenUnderstanding: {
        interfaceType: "Careers landing page"
      },
      finalSynthesis: {
        executiveSummary: "Hierarchy and CTA clarity need review."
      }
    },
    qualityValidationSummary: [{ passId: "ollama-final-synthesis", evaluated: 1, accepted: 1, rejected: 0 }]
  };
  session.findings.push({
    id: "ai-enterprise-polish",
    category: "enterprise-polish",
    severity: "medium",
    region: "Dashboard summary",
    issue: "The summary cards create a dense first impression that weakens executive scan confidence.",
    evidence: "Several adjacent cards carry similar visual weight and compact spacing in the first viewport.",
    impact: "Leaders may spend extra time separating priority information from supporting metrics.",
    recommendation: "Reduce secondary card weight and create a clearer priority group for the lead metric.",
    confidence: 0.72,
    screenshotRef: "media:review-sample",
    selector: ".summary-grid",
    source: "ai-review"
  });

  const report = buildReviewReport(session);
  const markdown = buildMarkdownReviewReport(session);
  const html = buildHtmlReviewReport(session);

  assert.equal(report.metadata.aiUsed, true);
  assert.equal(report.metadata.aiProvider, "Ollama local");
  assert.equal(report.metadata.aiModel, "llama3.2-vision:latest");
  assert.equal(report.metadata.aiScreenshotCropUsed, true);
  assert.equal(report.sourceMetadata.aiStaticDesign.ignoredAreas.includes("Zeplin toolbar"), true);
  assert.equal(report.metadata.aiScreenshotShared, false);
  assert.equal(report.evidenceNote.includes("No screenshot was shared with the AI provider."), true);
  assert.equal(markdown.includes("- AI used: Yes"), true);
  assert.equal(markdown.includes("- AI provider: Ollama local"), true);
  assert.equal(markdown.includes("Ollama Static Design Review Details"), true);
  assert.equal(markdown.includes("llama3.2-vision:latest"), true);
  assert.equal(html.includes("<strong>Yes</strong><span>AI used</span>"), true);
  assert.equal(html.includes("Ollama Static Design Review Details"), true);
});
