export const LIVE_REVIEW_MESSAGES = Object.freeze({
  OVERLAY_READY: "olho_live_review_overlay_ready",
  RENDER_MARKERS: "olho_live_review_render_markers",
  CLEAR_MARKERS: "olho_live_review_clear_markers",
  SELECT_MARKER: "olho_live_review_select_marker",
  MARKER_SELECTED: "olho_live_review_marker_selected",
  HIGHLIGHT_TARGET: "olho_live_review_highlight_target",
  CLEAR_HIGHLIGHT: "olho_live_review_clear_highlight"
});

export function liveReviewMessage(type, payload = {}) {
  return {
    type,
    payload,
    source: "olho-live-review",
    ts: Date.now()
  };
}
