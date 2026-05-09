import { categoryLabel } from "../findings/category-registry.js";
import { buildTicketMarkdown } from "../reports/ticket-builder.js";

function severityLabel(severity = "") {
  return severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : "Unknown";
}

function addSection(parent, title, text) {
  const section = document.createElement("section");
  section.className = "sidepanel-inspector-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = text || "No detail available.";
  section.append(heading, paragraph);
  parent.append(section);
}

function addListSection(parent, title, items = []) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  const section = document.createElement("section");
  section.className = "sidepanel-inspector-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  list.className = "sidepanel-inspector-list";
  if (values.length) {
    values.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = "No acceptance criteria available.";
    list.append(li);
  }
  section.append(heading, list);
  parent.append(section);
}

export function renderSidepanelInspector({ container, finding, onCopyTicket } = {}) {
  if (!container) return;
  container.innerHTML = "";

  if (!finding) {
    const empty = document.createElement("p");
    empty.className = "sidepanel-empty";
    empty.textContent = "Select a marker or finding to see the reviewer note.";
    container.append(empty);
    return;
  }

  const header = document.createElement("div");
  header.className = "sidepanel-inspector-header";
  const title = document.createElement("h2");
  title.textContent = finding.issue;
  const meta = document.createElement("p");
  meta.textContent = `${severityLabel(finding.severity)} severity | ${categoryLabel(finding.category)} | ${Math.round(
    Number(finding.confidence || 0) * 100
  )}% confidence`;
  header.append(title, meta);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "secondary-action";
  copy.textContent = "Copy ticket";
  copy.addEventListener("click", () => onCopyTicket?.(buildTicketMarkdown(finding)));

  container.append(header, copy);
  addSection(container, "Impact / why this matters", finding.impact);
  addSection(container, "Visible evidence", finding.evidence);
  addSection(container, "Best practice", finding.bestPracticeReference);
  addSection(container, "Reviewer rationale", finding.reviewRationale);
  addSection(container, "Recommendation", finding.recommendation);
  addListSection(container, "Acceptance criteria", finding.acceptanceCriteria);
  addSection(container, "Affected users", finding.affectedUsers);
  addSection(container, "Suggested priority", finding.suggestedPriority);
  addSection(container, "Target area", finding.region || "Visible interface");
  addSection(container, "Evidence type", finding.evidenceType || finding.evidence_type || "Not specified");
  addSection(container, "Source", finding.source || "rule-engine");
}
