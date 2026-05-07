import { categoryLabel } from "../findings/category-registry.js";

function titleCase(value) {
  return String(value || "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function shortIssue(issue) {
  const text = String(issue || "Review finding").trim();
  if (text.length <= 96) return text;
  return `${text.slice(0, 93).trim()}...`;
}

export function buildFindingTicket(finding = {}) {
  const severity = titleCase(finding.severity || "unknown");
  const category = categoryLabel(finding.category || "review");
  const title = `[${severity}] [${category}] ${shortIssue(finding.issue)}`;

  const body = [
    `## ${title}`,
    "",
    `- Region/component: ${finding.region || "Not specified"}`,
    `- Issue: ${finding.issue || "Not specified"}`,
    `- Evidence: ${finding.evidence || "Not specified"}`,
    `- User impact: ${finding.impact || "Not specified"}`,
    `- Recommendation: ${finding.recommendation || "Not specified"}`,
    `- Confidence: ${Math.round(Number(finding.confidence || 0) * 100)}%`,
    `- Source: ${finding.source || "rule-engine"}`,
    `- Screenshot/reference note: ${finding.screenshotRef || "Review screenshot reference unavailable"}${
      finding.selector ? `; selector ${finding.selector}` : ""
    }`,
    "",
    "### Acceptance Criteria",
    "- The affected region has been reviewed visually.",
    "- The issue has been corrected or intentionally accepted.",
    "- The change has been checked for keyboard and readability impact where relevant.",
    "- The UI remains visually consistent with surrounding components."
  ].join("\n");

  return {
    title,
    body,
    acceptanceCriteria: [
      "The affected region has been reviewed visually.",
      "The issue has been corrected or intentionally accepted.",
      "The change has been checked for keyboard and readability impact where relevant.",
      "The UI remains visually consistent with surrounding components."
    ]
  };
}

export function buildTicketMarkdown(finding = {}) {
  return buildFindingTicket(finding).body;
}
