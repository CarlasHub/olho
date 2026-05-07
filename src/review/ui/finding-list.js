import { categoryLabel } from "../findings/category-registry.js";

function severityLabel(severity) {
  return `Severity: ${severity}`;
}

export function renderFindingList({ container, findings, selectedFindingId, onSelect }) {
  if (!container) return;
  container.innerHTML = "";

  if (!findings.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent =
      "No findings have been generated yet. Deterministic local review runs first; optional AI review is disabled by default.";
    container.append(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "finding-listbox";

  findings.forEach((finding) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "finding-button";
    button.setAttribute("aria-current", finding.id === selectedFindingId ? "true" : "false");
    button.addEventListener("click", () => onSelect(finding.id));

    const title = document.createElement("span");
    title.className = "finding-button-title";
    title.textContent = finding.issue;

    const meta = document.createElement("span");
    meta.className = "finding-button-meta";

    const severity = document.createElement("span");
    severity.className = "finding-pill";
    severity.textContent = severityLabel(finding.severity);

    const category = document.createElement("span");
    category.className = "finding-pill";
    category.textContent = categoryLabel(finding.category);

    const source = document.createElement("span");
    source.className = "finding-pill";
    source.textContent = `Source: ${finding.source}`;

    meta.append(severity, category, source);
    button.append(title, meta);
    item.append(button);
    list.append(item);
  });

  container.append(list);
}
