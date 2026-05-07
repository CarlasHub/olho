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

  const title = document.createElement("h3");
  title.textContent = selected.issue;

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

  appendMetaRow(meta, "Category", categoryLabel(selected.category));
  appendMetaRow(meta, "Severity", selected.severity);
  appendMetaRow(meta, "Region", selected.region);
  appendMetaRow(meta, "Evidence", selected.evidence);
  appendMetaRow(meta, "Impact", selected.impact);
  appendMetaRow(meta, "Recommendation", selected.recommendation);
  appendMetaRow(meta, "Confidence", `${Math.round(Number(selected.confidence) * 100)}%`);
  appendMetaRow(meta, "Screenshot reference", selected.screenshotRef);
  appendMetaRow(meta, "Selector", selected.selector || "-");
  appendMetaRow(meta, "Source", selected.source);
  if (selected.aiReviewSupport?.evidence) {
    appendMetaRow(meta, "AI reviewer evidence note", selected.aiReviewSupport.evidence);
  }
  if (selected.aiReviewSupport?.recommendation) {
    appendMetaRow(meta, "AI reviewer recommendation note", selected.aiReviewSupport.recommendation);
  }

  detail.append(title, actions, meta);
  container.append(detail);
}
