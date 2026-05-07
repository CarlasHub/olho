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
      ruleCount: 30,
      findingCount: 2,
      executionTimeMs: 12,
      visualScore: 82
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
  assert.equal(report.executiveSummary.totalFindings, 2);
  assert.equal(report.executiveSummary.bySeverity.high, 1);
  assert.equal(report.executiveSummary.bySeverity.medium, 1);
  assert.equal(report.executiveSummary.byCategory["Visual hierarchy"], 1);
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
  assert.equal(html.includes("Severity: high"), true);
  assert.equal(html.includes("Ticket-ready version"), true);
  assert.equal(/https?:\/\//i.test(html), false);
  assert.equal(/<script/i.test(html), false);
});

test("Markdown report is paste-ready and includes ticket blocks", () => {
  const markdown = buildMarkdownReviewReport(sampleSession());

  assert.equal(markdown.includes("# Olho Review: Visual UI/UX and Accessibility Review"), true);
  assert.equal(markdown.includes("## Executive Summary"), true);
  assert.equal(markdown.includes("#### Ticket-ready"), true);
  assert.equal(markdown.includes("### Acceptance Criteria"), true);
  assert.equal(markdown.includes("- AI used: No"), true);
});

test("JSON report preserves structured findings and source metadata", () => {
  const parsed = JSON.parse(buildJsonReviewReport(sampleSession()));

  assert.equal(parsed.metadata.reviewEngineVersion, "1.0.0-enterprise");
  assert.equal(parsed.findings.length, 2);
  assert.equal(parsed.findings[0].ticket.acceptanceCriteria.length, 4);
  assert.equal(parsed.sourceMetadata.skippedRules.length, 1);
});

test("ticket builder creates Jira/GitHub-ready Markdown", () => {
  const finding = sampleSession().findings[0];
  const ticket = buildFindingTicket(finding);
  const markdown = buildTicketMarkdown(finding);

  assert.equal(ticket.title.startsWith("[Medium] [Visual hierarchy]"), true);
  assert.equal(markdown.includes("- Region/component: Header actions"), true);
  assert.equal(markdown.includes("- Screenshot/reference note: media:review-sample; selector .primary-action"), true);
  assert.equal(markdown.includes("- The UI remains visually consistent with surrounding components."), true);
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
    mode: "text-refine",
    screenshotShared: false
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
  assert.equal(report.metadata.aiScreenshotShared, false);
  assert.equal(report.evidenceNote.includes("No screenshot was shared with the AI provider."), true);
  assert.equal(markdown.includes("- AI used: Yes"), true);
  assert.equal(markdown.includes("- AI provider: Ollama local"), true);
  assert.equal(html.includes("<strong>Yes</strong><span>AI used</span>"), true);
});
