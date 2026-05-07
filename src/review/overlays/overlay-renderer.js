import { clampRect } from "../utils/geometry.js";

function getBounds(finding) {
  const bounds = finding?.regionBounds;
  if (!bounds || typeof bounds !== "object") return null;
  const rect = clampRect(bounds);
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

export function renderOverlayMarkers({ container, findings, selectedFindingId, onSelect }) {
  if (!container) return;
  container.innerHTML = "";

  findings.forEach((finding) => {
    const bounds = getBounds(finding);
    if (!bounds) return;

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "overlay-marker";
    marker.style.left = `${bounds.x}%`;
    marker.style.top = `${bounds.y}%`;
    marker.style.width = `${bounds.width}%`;
    marker.style.height = `${bounds.height}%`;
    marker.setAttribute("aria-label", `Select finding: ${finding.issue}`);
    marker.setAttribute("aria-current", finding.id === selectedFindingId ? "true" : "false");
    marker.addEventListener("click", () => onSelect(finding.id));
    container.append(marker);
  });
}
