import { categoryLabel } from "../findings/category-registry.js";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];
const CATEGORY_ORDER = [
  "visual-hierarchy",
  "ux",
  "accessibility-visible",
  "design-system",
  "enterprise-polish",
  "responsive-layout"
];

function severityLabel(severity) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function countBy(findings, key) {
  return findings.reduce((counts, finding) => {
    counts[finding[key]] = (counts[finding[key]] || 0) + 1;
    return counts;
  }, {});
}

function filterFindings(findings, filters = {}) {
  return findings.filter((finding) => {
    const severityMatch = !filters.severity || filters.severity === "all" || finding.severity === filters.severity;
    const categoryMatch = !filters.category || filters.category === "all" || finding.category === filters.category;
    return severityMatch && categoryMatch;
  });
}

function createFilterButton({ label, count, active, disabled, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "finding-filter-button";
  button.setAttribute("aria-pressed", active ? "true" : "false");
  button.disabled = Boolean(disabled);
  button.addEventListener("click", onClick);

  const labelText = document.createElement("span");
  labelText.textContent = label;
  const countText = document.createElement("strong");
  countText.textContent = String(count);
  button.append(labelText, countText);
  return button;
}

function renderFilters({ container, findings, filters, onFilterChange }) {
  const severityCounts = countBy(findings, "severity");
  const categoryCounts = countBy(findings, "category");

  const controls = document.createElement("div");
  controls.className = "finding-review-controls";

  const severityGroup = document.createElement("section");
  severityGroup.className = "finding-filter-group";
  const severityTitle = document.createElement("h3");
  severityTitle.textContent = "Severity";
  const severityButtons = document.createElement("div");
  severityButtons.className = "finding-filter-grid";
  severityButtons.append(
    createFilterButton({
      label: "All",
      count: findings.length,
      active: !filters.severity || filters.severity === "all",
      onClick: () => onFilterChange?.({ severity: "all" })
    })
  );
  SEVERITY_ORDER.forEach((severity) => {
    const count = severityCounts[severity] || 0;
    severityButtons.append(
      createFilterButton({
        label: severityLabel(severity),
        count,
        active: filters.severity === severity,
        disabled: count === 0,
        onClick: () => onFilterChange?.({ severity })
      })
    );
  });
  severityGroup.append(severityTitle, severityButtons);

  const categoryGroup = document.createElement("section");
  categoryGroup.className = "finding-filter-group";
  const categoryTitle = document.createElement("h3");
  categoryTitle.textContent = "Categories";
  const categoryButtons = document.createElement("div");
  categoryButtons.className = "finding-category-grid";
  categoryButtons.append(
    createFilterButton({
      label: "All categories",
      count: findings.length,
      active: !filters.category || filters.category === "all",
      onClick: () => onFilterChange?.({ category: "all" })
    })
  );
  CATEGORY_ORDER.forEach((category) => {
    const count = categoryCounts[category] || 0;
    categoryButtons.append(
      createFilterButton({
        label: categoryLabel(category),
        count,
        active: filters.category === category,
        disabled: count === 0,
        onClick: () => onFilterChange?.({ category })
      })
    );
  });
  categoryGroup.append(categoryTitle, categoryButtons);

  controls.append(severityGroup, categoryGroup);
  container.append(controls);
}

export function visibleFindingsForFilters(findings, filters = {}) {
  return filterFindings(findings, filters);
}

export function renderFindingList({ container, findings, selectedFindingId, filters = {}, onFilterChange, onSelect }) {
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

  renderFilters({ container, findings, filters, onFilterChange });
  const visibleFindings = filterFindings(findings, filters);

  if (!visibleFindings.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No findings match the current review filters.";
    container.append(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "finding-listbox";

  visibleFindings.forEach((finding, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "finding-button";
    button.setAttribute("aria-current", finding.id === selectedFindingId ? "true" : "false");
    button.addEventListener("click", () => onSelect(finding.id));

    const marker = document.createElement("span");
    marker.className = `finding-number finding-number-${finding.severity}`;
    marker.textContent = String(index + 1);
    marker.setAttribute("aria-hidden", "true");

    const body = document.createElement("span");
    body.className = "finding-button-body";

    const title = document.createElement("span");
    title.className = "finding-button-title";
    title.textContent = finding.issue;

    const meta = document.createElement("span");
    meta.className = "finding-button-meta";

    const severity = document.createElement("span");
    severity.className = `finding-pill finding-pill-${finding.severity}`;
    severity.textContent = `${severityLabel(finding.severity)} severity`;

    const category = document.createElement("span");
    category.className = "finding-pill";
    category.textContent = categoryLabel(finding.category);

    const source = document.createElement("span");
    source.className = "finding-pill";
    source.textContent = `Source: ${finding.source}`;

    meta.append(severity, category, source);
    body.append(title, meta);
    button.append(marker, body);
    item.append(button);
    list.append(item);
  });

  container.append(list);
}
