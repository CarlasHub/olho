(function installOlhoLiveOverlayContent() {
  if (window.__olhoLiveOverlayContent) return;
  window.__olhoLiveOverlayContent = {
    installed: true,
    installedAt: new Date().toISOString()
  };
  try {
    chrome.runtime.sendMessage({
      type: "olho_live_review_overlay_ready",
      source: "olho-live-review-overlay",
      payload: {
        href: location.href,
        title: document.title
      }
    });
  } catch {
    // Side panel may not be open yet.
  }
})();
