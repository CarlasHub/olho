const ISSUE_REWRITES = [
  {
    match: /text contrast appears below accessible readability thresholds/i,
    issue: "This text is difficult to read against the current background.",
    impact:
      "Weak visible contrast can reduce readability for users with low vision, tired eyes, or bright viewing conditions."
  },
  {
    match: /buttons use inconsistent visual treatments/i,
    issue: "Similar actions use different button treatments.",
    impact:
      "Inconsistent button treatment weakens component consistency and makes the interface feel less deliberate."
  },
  {
    match: /heading does not create a strong scanning anchor/i,
    issue: "The heading does not visually anchor this section strongly enough.",
    impact:
      "Users may need to scan longer to understand where the main content begins and what deserves attention first."
  },
  {
    match: /primary and secondary actions compete for attention/i,
    issue: "The primary and secondary actions compete visually.",
    impact:
      "When action priority is unclear, users spend more effort deciding what to do next and task completion becomes less reliable."
  },
  {
    match: /vertical spacing rhythm is inconsistent/i,
    issue: "The spacing rhythm between related content blocks feels inconsistent.",
    impact:
      "Irregular spacing weakens visual grouping and makes the screen feel less calm and less system-designed."
  },
  {
    match: /visible region is overcrowded/i,
    issue: "The reviewed area feels overcrowded.",
    impact:
      "High visual density increases search effort and makes repeated product workflows feel slower and more error-prone."
  },
  {
    match: /screen lacks a clear visual focal point/i,
    issue: "The screen does not establish a clear visual focal point.",
    impact:
      "Without an obvious anchor, users must parse more of the interface before understanding what matters most."
  },
  {
    match: /layout weakly groups related elements/i,
    issue: "Related elements are not grouped strongly enough.",
    impact:
      "Weak grouping forces users to infer relationships manually, increasing comprehension effort on dense product screens."
  }
];

function sentence(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function rewriteIssue(issue) {
  const text = String(issue || "").trim();
  const rewrite = ISSUE_REWRITES.find((entry) => entry.match.test(text));
  return rewrite?.issue || text;
}

function rewriteImpact(issue, impact) {
  const text = String(issue || "").trim();
  const rewrite = ISSUE_REWRITES.find((entry) => entry.match.test(text));
  return rewrite?.impact || String(impact || "").trim();
}

function regionPrefix(region) {
  const value = String(region || "").trim();
  if (!value || value === "Screenshot") return "";
  return `In ${value.toLowerCase()}, `;
}

export function professionalFindingCopy({ issue, evidence, impact, recommendation, region }) {
  const nextIssue = rewriteIssue(issue);
  const prefix = regionPrefix(region);
  const issueWithRegion = prefix ? `${prefix}${nextIssue.charAt(0).toLowerCase()}${nextIssue.slice(1)}` : nextIssue;
  return {
    issue: sentence(issueWithRegion),
    evidence: sentence(evidence),
    impact: sentence(rewriteImpact(issue, impact)),
    recommendation: sentence(recommendation)
  };
}
