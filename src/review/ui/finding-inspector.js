import { categoryLabel } from "../findings/category-registry.js";

function appendMetaRow(list, label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value || "-";
  row.append(term, detail);
  list.append(row);
}

function appendReviewSection(container, label, value) {
  const section = document.createElement("section");
  section.className = "inspector-review-section";
  const heading = document.createElement("h4");
  heading.textContent = label;
  const body = document.createElement("p");
  body.textContent = value || "-";
  section.append(heading, body);
  container.append(section);
}

function appendReviewList(container, label, items = []) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  const section = document.createElement("section");
  section.className = "inspector-review-section";
  const heading = document.createElement("h4");
  heading.textContent = label;
  const list = document.createElement("ul");
  values.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });
  if (!values.length) {
    const li = document.createElement("li");
    li.textContent = "-";
    list.append(li);
  }
  section.append(heading, list);
  container.append(section);
}

function severityLabel(severity) {
  const value = String(severity || "");
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "-";
}

export function renderFindingInspector({ container, findings, selectedFindingId, onCopyTicket }) {
  if (!container) return;
  container.innerHTML = "";

  if (!findings.length) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent =
      "No findings have been generated yet. Deterministic local review runs first; optional AI review is disabled by default.";
    container.append(empty);
    return;
  }

  const selected = findings.find((finding) => finding.id === selectedFindingId);
  if (!selected) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent = "Select a finding to inspect evidence, impact, and recommendation.";
    container.append(empty);
    return;
  }

  const detail = document.createElement("section");
  detail.className = "inspector-detail";

  const header = document.createElement("div");
  header.className = "inspector-finding-header";

  const badges = document.createElement("div");
  badges.className = "inspector-badges";
  const severity = document.createElement("span");
  severity.className = `inspector-badge inspector-badge-${selected.severity}`;
  severity.textContent = `${severityLabel(selected.severity)} severity`;
  const category = document.createElement("span");
  category.className = "inspector-badge";
  category.textContent = categoryLabel(selected.category);
  badges.append(severity, category);

  const title = document.createElement("h3");
  title.textContent = selected.issue;
  header.append(badges, title);

  const actions = document.createElement("div");
  actions.className = "inspector-actions";
  const copyTicketButton = document.createElement("button");
  copyTicketButton.type = "button";
  copyTicketButton.className = "ghost";
  copyTicketButton.textContent = "Copy finding ticket";
  copyTicketButton.addEventListener("click", () => onCopyTicket?.(selected));
  actions.append(copyTicketButton);

  const meta = document.createElement("dl");
  meta.className = "inspector-meta";

  appendMetaRow(meta, "Region", selected.region);
  appendMetaRow(meta, "Confidence", `${Math.round(Number(selected.confidence) * 100)}%`);
  appendMetaRow(meta, "Evidence type", selected.evidenceType || selected.evidence_type || "Not specified");
  appendMetaRow(meta, "Source", selected.source);

  const reviewBody = document.createElement("div");
  reviewBody.className = "inspector-review-body";
  appendReviewSection(reviewBody, "Evidence", selected.evidence);
  appendReviewSection(reviewBody, "Impact", selected.impact);
  appendReviewSection(reviewBody, "Best practice", selected.bestPracticeReference);
  appendReviewSection(reviewBody, "Reviewer rationale", selected.reviewRationale);
  appendReviewSection(reviewBody, "Recommendation", selected.recommendation);
  appendReviewList(reviewBody, "Acceptance criteria", selected.acceptanceCriteria);
  appendReviewSection(reviewBody, "Affected users", selected.affectedUsers);
  appendReviewSection(reviewBody, "Suggested priority", selected.suggestedPriority);

  const technicalDetails = document.createElement("details");
  technicalDetails.className = "inspector-technical-details";
  const summary = document.createElement("summary");
  summary.textContent = "Reference details";
  const references = document.createElement("dl");
  references.className = "inspector-meta";
  appendMetaRow(references, "Screenshot reference", selected.screenshotRef);
  appendMetaRow(references, "Selector", selected.selector || "-");
  technicalDetails.append(summary, references);

  if (selected.aiReviewSupport?.evidence) {
    appendReviewSection(reviewBody, "AI reviewer evidence note", selected.aiReviewSupport.evidence);
  }
  if (selected.aiReviewSupport?.recommendation) {
    appendReviewSection(reviewBody, "AI reviewer recommendation note", selected.aiReviewSupport.recommendation);
  }

  detail.append(header, actions, meta, reviewBody, technicalDetails);
  container.append(detail);
}
