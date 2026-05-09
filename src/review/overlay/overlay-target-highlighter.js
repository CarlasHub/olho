(function installOlhoTargetHighlighter() {
  if (window.__olhoOverlayTargetHighlighter) return;

  const TARGET_ID = "olho-live-review-target-highlight";

  function clearHighlight() {
    document.getElementById(TARGET_ID)?.remove();
  }

  function highlightTarget(target = {}) {
    clearHighlight();
    if (!target?.bounds) return;
    const node = document.createElement("div");
    node.id = TARGET_ID;
    node.className = "olho-live-target-highlight";
    node.style.left = `${Number(target.bounds.x || 0)}px`;
    node.style.top = `${Number(target.bounds.y || 0)}px`;
    node.style.width = `${Math.max(1, Number(target.bounds.width || 0))}px`;
    node.style.height = `${Math.max(1, Number(target.bounds.height || 0))}px`;
    node.setAttribute("aria-hidden", "true");
    document.documentElement.append(node);
  }

  window.__olhoOverlayTargetHighlighter = {
    highlightTarget,
    clearHighlight
  };
})();
