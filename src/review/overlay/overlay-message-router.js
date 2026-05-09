(function installOlhoOverlayMessageRouter() {
  if (window.__olhoOverlayMessageRouter) return;

  function route(message, _sender, sendResponse) {
    if (!message || message.source !== "olho-live-review") return;
    const type = message.type;
    const payload = message.payload || {};
    if (type === "olho_live_review_render_markers") {
      window.__olhoOverlayMarkerLayer?.renderMarkers(payload.markers || []);
      window.__olhoOverlayTargetHighlighter?.clearHighlight();
      sendResponse?.({ ok: true });
      return true;
    }
    if (type === "olho_live_review_clear_markers") {
      window.__olhoOverlayMarkerLayer?.clearMarkers();
      window.__olhoOverlayTargetHighlighter?.clearHighlight();
      sendResponse?.({ ok: true });
      return true;
    }
    if (type === "olho_live_review_select_marker") {
      window.__olhoOverlayMarkerLayer?.selectMarker(payload.findingId || "");
      sendResponse?.({ ok: true });
      return true;
    }
    if (type === "olho_live_review_highlight_target") {
      window.__olhoOverlayTargetHighlighter?.highlightTarget(payload.target);
      sendResponse?.({ ok: true });
      return true;
    }
    if (type === "olho_live_review_clear_highlight") {
      window.__olhoOverlayTargetHighlighter?.clearHighlight();
      sendResponse?.({ ok: true });
      return true;
    }
  }

  chrome.runtime.onMessage.addListener(route);
  window.__olhoOverlayMessageRouter = { installed: true };
})();
