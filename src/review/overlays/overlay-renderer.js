import { categoryLabel } from "../findings/category-registry.js";
import { clampRect } from "../utils/geometry.js";

function getBounds(finding) {
  const bounds = finding?.regionBounds;
  if (!bounds || typeof bounds !== "object") return null;
  const rect = clampRect(bounds);
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

function severityLabel(severity) {
  const value = String(severity || "");
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
}

function confidenceLabel(confidence) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return "Confidence unknown";
  return `${Math.round(value * 100)}% confidence`;
}

function markerType(finding, bounds) {
  if (bounds.width <= 5 && bounds.height <= 5) return "point";
  if (finding.category === "design-system" || finding.category === "enterprise-polish") return "group";
  return "region";
}

function pinPosition(bounds) {
  return {
    x: Math.min(96, Math.max(4, bounds.x + Math.min(bounds.width / 2, 10))),
    y: Math.min(96, Math.max(4, bounds.y + Math.min(bounds.height / 2, 10)))
  };
}

function distributedPinPosition(bounds, usedPins) {
  const base = pinPosition(bounds);
  const key = `${Math.round(base.x / 3)}:${Math.round(base.y / 3)}`;
  const collisionIndex = Number(usedPins.get(key) || 0);
  usedPins.set(key, collisionIndex + 1);
  if (!collisionIndex) return base;
  const offsets = [
    [0, 0],
    [-3.4, -3.4],
    [3.4, -3.4],
    [-3.4, 3.4],
    [3.4, 3.4],
    [0, -5.2],
    [0, 5.2],
    [-5.2, 0],
    [5.2, 0]
  ];
  const [xOffset, yOffset] = offsets[collisionIndex % offsets.length];
  return {
    x: Math.min(96, Math.max(4, base.x + xOffset)),
    y: Math.min(96, Math.max(4, base.y + yOffset))
  };
}

function popoverPosition(bounds) {
  const placeRight = bounds.x + bounds.width <= 64;
  return {
    left: placeRight ? Math.min(76, bounds.x + bounds.width + 1.5) : Math.max(2, bounds.x - 1.5),
    top: Math.min(76, Math.max(3, bounds.y)),
    placement: placeRight ? "right" : "left"
  };
}

function appendPopoverSection(container, label, text) {
  const section = document.createElement("section");
  section.className = "overlay-popover-section";
  const title = document.createElement("strong");
  title.textContent = label;
  const body = document.createElement("p");
  body.textContent = text || "-";
  section.append(title, body);
  container.append(section);
}

function renderPopover({ container, finding, index, bounds, markerPosition, onSelect, onOpenInspector }) {
  const position = popoverPosition({
    x: markerPosition?.x ?? bounds.x,
    y: markerPosition?.y ?? bounds.y,
    width: 2,
    height: 2
  });
  const popover = document.createElement("section");
  popover.className = `overlay-popover place-${position.placement}`;
  popover.tabIndex = -1;
  popover.style.left = `${position.left}%`;
  popover.style.top = `${position.top}%`;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `Finding ${index + 1} reviewer note`);
  popover.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onSelect("");
    }
  });

  const header = document.createElement("div");
  header.className = "overlay-popover-header";
  const label = document.createElement("span");
  label.className = "overlay-marker-label";
  label.textContent = String(index + 1);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ghost";
  close.textContent = "Close";
  close.addEventListener("click", () => onSelect(""));
  header.append(label, close);

  const meta = document.createElement("div");
  meta.className = "overlay-popover-meta";
  [severityLabel(finding.severity), categoryLabel(finding.category), confidenceLabel(finding.confidence), `Source: ${finding.source}`].forEach(
    (value) => {
      const pill = document.createElement("span");
      pill.className = "overlay-popover-pill";
      pill.textContent = value;
      meta.append(pill);
    }
  );

  const title = document.createElement("h3");
  title.textContent = finding.issue;

  appendPopoverSection(popover, "Evidence", finding.evidence);
  appendPopoverSection(popover, "Impact", finding.impact);
  appendPopoverSection(popover, "Recommendation", finding.recommendation);

  const actions = document.createElement("div");
  actions.className = "overlay-popover-actions";
  const fullDetails = document.createElement("button");
  fullDetails.type = "button";
  fullDetails.className = "ghost";
  fullDetails.textContent = "Open full details";
  fullDetails.addEventListener("click", () => onOpenInspector?.(finding.id));
  actions.append(fullDetails);

  popover.prepend(header, meta, title);
  popover.append(actions);
  container.append(popover);
  requestAnimationFrame(() => popover.focus());
}

export function renderOverlayMarkers({
  container,
  findings,
  selectedFindingId,
  onSelect,
  onOpenInspector
}) {
  if (!container) return;
  container.innerHTML = "";
  const usedPins = new Map();

  findings.forEach((finding, index) => {
    const bounds = getBounds(finding);
    if (!bounds) return;
    const type = markerType(finding, bounds);
    const selected = finding.id === selectedFindingId;

    if (selected) {
      const highlight = document.createElement("div");
      highlight.className = `overlay-region-highlight region-${type} is-selected`;
      highlight.style.left = `${bounds.x}%`;
      highlight.style.top = `${bounds.y}%`;
      highlight.style.width = `${bounds.width}%`;
      highlight.style.height = `${bounds.height}%`;
      highlight.setAttribute("aria-hidden", "true");
      container.append(highlight);
    }

    const pin = distributedPinPosition(bounds, usedPins);
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "overlay-marker-pin";
    marker.dataset.overlayMarkerId = finding.id;
    marker.dataset.severity = finding.severity;
    marker.style.left = `${pin.x}%`;
    marker.style.top = `${pin.y}%`;
    marker.textContent = String(index + 1);
    marker.setAttribute(
      "aria-label",
      `Finding ${index + 1}: ${severityLabel(finding.severity)} severity ${categoryLabel(finding.category)} issue. ${finding.issue}`
    );
    marker.setAttribute("aria-current", selected ? "true" : "false");
    marker.addEventListener("click", () => onSelect(finding.id));
    marker.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && selected) {
        event.preventDefault();
        onSelect("");
      }
    });
    container.append(marker);

    if (selected) {
      renderPopover({ container, finding, index, bounds, markerPosition: pin, onSelect, onOpenInspector });
    }
  });
}
