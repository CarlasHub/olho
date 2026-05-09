import { detectDesignAreaTarget } from "./design-area-detector.js";

export function isZeplinTab(tab = {}) {
  const text = `${tab.url || ""} ${tab.pendingUrl || ""} ${tab.title || ""}`.toLowerCase();
  return text.includes("zeplin.io");
}

export function detectZeplinTarget({ tab, metrics = {}, viewport = {}, mode = "design-area-only" } = {}) {
  if (!isZeplinTab(tab)) return null;
  if (mode === "entire-visible-screen") {
    return null;
  }
  return detectDesignAreaTarget({
    sourceType: "zeplin-capture",
    metrics,
    viewport,
    label: "Zeplin design area"
  });
}
