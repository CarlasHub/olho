import { detectDesignAreaTarget } from "./design-area-detector.js";

export function isFigmaTab(tab = {}) {
  const text = `${tab.url || ""} ${tab.pendingUrl || ""} ${tab.title || ""}`.toLowerCase();
  return text.includes("figma.com");
}

export function detectFigmaTarget({ tab, metrics = {}, viewport = {}, mode = "design-area-only" } = {}) {
  if (!isFigmaTab(tab)) return null;
  if (mode === "entire-visible-screen") {
    return null;
  }
  return detectDesignAreaTarget({
    sourceType: "figma-capture",
    metrics,
    viewport,
    label: "Figma canvas area"
  });
}
