export function setStatus(elements, { message = "", tone = "neutral" } = {}) {
  if (!elements.statusText) return;
  elements.statusText.textContent = message;
  elements.statusText.dataset.tone = tone;
}

export function setTargetSummary(elements, { tab, target, source } = {}) {
  if (elements.targetLabel) {
    elements.targetLabel.textContent = target?.label || tab?.title || "No target selected";
  }
  if (elements.reviewTypeBadge) {
    const sourceType = source?.sourceType || "webpage-capture";
    const label =
      sourceType === "figma-capture"
        ? "Figma design review"
        : sourceType === "zeplin-capture"
          ? "Zeplin design review"
          : "Live webpage review";
    elements.reviewTypeBadge.textContent = label;
  }
  if (elements.targetMeta) {
    const confidence = target ? `${Math.round((target.confidence || 0) * 100)}% target confidence` : "";
    const scope = target?.type || "not reviewed";
    elements.targetMeta.textContent = [scope, confidence].filter(Boolean).join(" | ");
  }
}
