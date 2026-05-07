import { buildReviewReport } from "./review-report-builder.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listItems(items) {
  if (!items.length) return "<li>None.</li>";
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function countCards(counts) {
  const entries = Object.entries(counts);
  if (!entries.length) return '<p class="muted">No findings.</p>';
  return entries
    .map(([label, value]) => `<div class="summary-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`)
    .join("");
}

function findingCard(finding, index) {
  return `
    <article class="finding-card">
      <header class="finding-card-header">
        <div>
          <p class="eyebrow">Finding ${index + 1}</p>
          <h3>${escapeHtml(finding.issue)}</h3>
        </div>
        <span class="severity severity-${escapeHtml(finding.severity)}">Severity: ${escapeHtml(finding.severity)}</span>
      </header>
      <dl class="finding-details">
        <div><dt>Category</dt><dd>${escapeHtml(finding.categoryLabel)}</dd></div>
        <div><dt>Region</dt><dd>${escapeHtml(finding.region)}</dd></div>
        <div><dt>Evidence</dt><dd>${escapeHtml(finding.evidence)}</dd></div>
        <div><dt>Impact</dt><dd>${escapeHtml(finding.impact)}</dd></div>
        <div><dt>Recommendation</dt><dd>${escapeHtml(finding.recommendation)}</dd></div>
        <div><dt>Confidence</dt><dd>${escapeHtml(finding.confidencePercent)}%</dd></div>
        <div><dt>Source</dt><dd>${escapeHtml(finding.source)}</dd></div>
      </dl>
      <section class="ticket-block">
        <h4>Ticket-ready version</h4>
        <p><strong>${escapeHtml(finding.ticket.title)}</strong></p>
        <ul>${listItems(finding.ticket.acceptanceCriteria)}</ul>
      </section>
    </article>
  `;
}

export function buildHtmlReviewReport(session = {}) {
  const report = buildReviewReport(session);
  const dimensions = `${report.metadata.imageDimensions.width || "unknown"} x ${
    report.metadata.imageDimensions.height || "unknown"
  }`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Olho Review Report</title>
  <style>
    :root { color-scheme: light; --text:#20242a; --muted:#667085; --line:#d9dee7; --panel:#fff; --bg:#f5f7fa; --accent:#1f6f68; --danger:#9a2f2f; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    header.report-header { display: grid; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 24px; }
    h1, h2, h3, h4, p { margin-top: 0; }
    h1 { font-size: 32px; line-height: 1.15; margin-bottom: 4px; }
    h2 { font-size: 20px; margin: 28px 0 12px; }
    h3 { font-size: 17px; margin-bottom: 0; }
    h4 { font-size: 15px; margin-bottom: 8px; }
    .eyebrow { color: var(--muted); text-transform: uppercase; font-size: 12px; font-weight: 700; letter-spacing: .04em; margin: 0; }
    .meta-grid, .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
    .meta-card, .summary-card, .section-card, .finding-card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
    .meta-card strong, .summary-card strong { display: block; font-size: 20px; color: var(--accent); }
    .meta-card span, .summary-card span, .muted { color: var(--muted); }
    .section-card { margin-bottom: 14px; }
    .finding-card { margin: 14px 0; }
    .finding-card-header { display: flex; justify-content: space-between; gap: 16px; align-items: start; border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 12px; }
    .severity { display: inline-flex; white-space: nowrap; border: 1px solid var(--line); border-radius: 999px; padding: 5px 9px; font-size: 13px; font-weight: 700; }
    .severity-critical, .severity-high { border-color: rgba(154,47,47,.42); color: var(--danger); }
    .severity-medium { border-color: rgba(157,101,20,.42); color: #8a5a12; }
    .severity-low { border-color: rgba(31,111,104,.34); color: var(--accent); }
    .finding-details { display: grid; gap: 10px; margin: 0; }
    .finding-details div { display: grid; gap: 3px; }
    dt { color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
    dd { margin: 0; }
    .ticket-block { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; }
    ul { padding-left: 20px; }
    .privacy-note { border-left: 4px solid var(--accent); background: #eef8f6; padding: 12px 14px; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <header class="report-header">
      <p class="eyebrow">${escapeHtml(report.metadata.productName)}</p>
      <h1>${escapeHtml(report.metadata.reportType)}</h1>
      <p>${escapeHtml(report.executiveSummary.humanSummary)}</p>
      <div class="meta-grid">
        <div class="meta-card"><strong>${escapeHtml(report.metadata.generatedAt)}</strong><span>Generated</span></div>
        <div class="meta-card"><strong>${escapeHtml(report.metadata.sourceType)}</strong><span>Source type</span></div>
        <div class="meta-card"><strong>${escapeHtml(dimensions)}</strong><span>Image dimensions</span></div>
        <div class="meta-card"><strong>${escapeHtml(report.metadata.reviewEngineVersion)}</strong><span>Engine version</span></div>
        <div class="meta-card"><strong>${report.metadata.aiUsed ? "Yes" : "No"}</strong><span>AI used</span></div>
        <div class="meta-card"><strong>${escapeHtml(report.metadata.aiProvider || "None")}</strong><span>AI provider</span></div>
        <div class="meta-card"><strong>${
          report.metadata.aiScreenshotShared ? "Yes" : "No"
        }</strong><span>Screenshot shared with AI</span></div>
      </div>
    </header>

    <section class="section-card">
      <h2>Executive Summary</h2>
      <div class="summary-grid">
        <div class="summary-card"><strong>${report.executiveSummary.totalFindings}</strong><span>Total findings</span></div>
        ${countCards(report.executiveSummary.bySeverity)}
      </div>
      <h3>Findings by Category</h3>
      <div class="summary-grid">${countCards(report.executiveSummary.byCategory)}</div>
    </section>

    <section class="section-card">
      <h2>Review Scope</h2>
      <ul>${listItems(report.reviewScope)}</ul>
    </section>

    <section class="privacy-note">
      <h2>Evidence and Privacy Note</h2>
      <p>${escapeHtml(report.evidenceNote)}</p>
    </section>

    <section>
      <h2>Findings</h2>
      ${
        report.findings.length
          ? report.findings.map((finding, index) => findingCard(finding, index)).join("")
          : '<article class="finding-card"><h3>No findings generated</h3><p class="muted">The deterministic local engine did not generate high-confidence findings from the available evidence.</p></article>'
      }
    </section>

    <section class="section-card">
      <h2>Limitations</h2>
      <ul>${listItems(report.limitations)}</ul>
    </section>
  </main>
</body>
</html>`;
}
