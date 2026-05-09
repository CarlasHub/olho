import { categoryLabel } from "../findings/category-registry.js";

const SEVERITIES = ["critical", "high", "medium", "low"];
const CATEGORIES = [
  "visual-hierarchy",
  "ux",
  "accessibility-visible",
  "design-system",
  "enterprise-polish",
  "responsive-layout"
];

function labelSeverity(severity = "") {
  return severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : "Unknown";
}

function focusLabel(category) {
  if (category === "all") return "All";
  if (category === "ux") return "UX clarity";
  if (category === "accessibility-visible") return "Accessibility-visible";
  return categoryLabel(category);
}

function countBy(findings, key) {
  return findings.reduce((counts, finding) => {
    counts[finding[key]] = (counts[finding[key]] || 0) + 1;
    return counts;
  }, {});
}

export function renderFindingSummary(container, findings = []) {
  if (!container) return;
  container.innerHTML = "";
  const severityCounts = countBy(findings, "severity");
  SEVERITIES.forEach((severity) => {
    const item = document.createElement("span");
    item.className = `sidepanel-summary-pill severity-${severity}`;
    item.textContent = `${labelSeverity(severity)} ${severityCounts[severity] || 0}`;
    container.append(item);
  });
}

export function renderCategoryFilters(container, { activeCategory = "all", findings = [], onChange } = {}) {
  if (!container) return;
  container.innerHTML = "";
  const counts = countBy(findings, "category");
  const all = document.createElement("button");
  all.type = "button";
  all.className = "sidepanel-chip";
  all.setAttribute("aria-pressed", activeCategory === "all" ? "true" : "false");
  all.textContent = `${focusLabel("all")} ${findings.length}`;
  all.addEventListener("click", () => onChange?.("all"));
  container.append(all);

  CATEGORIES.forEach((category) => {
    const count = counts[category] || 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sidepanel-chip";
    button.disabled = count === 0;
    button.setAttribute("aria-pressed", activeCategory === category ? "true" : "false");
    button.textContent = `${focusLabel(category)} ${count}`;
    button.addEventListener("click", () => onChange?.(category));
    container.append(button);
  });
}

export function renderSidepanelFindings({
  container,
  findings = [],
  selectedFindingId = "",
  activeCategory = "all",
  onSelect
} = {}) {
  if (!container) return;
  container.innerHTML = "";
  const visible =
    activeCategory === "all" ? findings : findings.filter((finding) => finding.category === activeCategory);

  if (!findings.length) {
    const empty = document.createElement("p");
    empty.className = "sidepanel-empty";
    empty.textContent =
      "No deterministic findings yet. Run Review Visible View to analyse the current interface locally.";
    container.append(empty);
    return;
  }

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "sidepanel-empty";
    empty.textContent = "No findings match this category filter.";
    container.append(empty);
    return;
  }

  const list = document.createElement("ol");
  list.className = "sidepanel-finding-list";
  visible.forEach((finding, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sidepanel-finding";
    button.setAttribute("aria-current", finding.id === selectedFindingId ? "true" : "false");
    button.addEventListener("click", () => onSelect?.(finding.id));

    const number = document.createElement("span");
    number.className = `sidepanel-finding-number severity-${finding.severity}`;
    number.textContent = String(index + 1);

    const body = document.createElement("span");
    body.className = "sidepanel-finding-body";
    const title = document.createElement("strong");
    title.textContent = finding.issue;
    const meta = document.createElement("span");
    meta.textContent = `${labelSeverity(finding.severity)} | ${focusLabel(finding.category)} | ${
      finding.markerSummary || finding.source
    }`;
    const rationale = document.createElement("span");
    rationale.className = "sidepanel-finding-rationale";
    rationale.textContent = finding.bestPracticeReference || finding.impact || "";
    body.append(title, meta);
    if (rationale.textContent) body.append(rationale);
    button.append(number, body);
    item.append(button);
    list.append(item);
  });
  container.append(list);
}
