export const DESIGN_REVIEW_LIMITATIONS = Object.freeze([
  "Design screenshot review is a visual review, not a live implementation audit.",
  "DOM inspection is unavailable for image-only design screens.",
  "Live keyboard navigation, focus order, and focus-state behavior cannot be confirmed from a static screenshot.",
  "Code-level accessibility validation and semantic role checks are unavailable without implementation metadata.",
  "Selector data is unavailable unless supplied by an external design or implementation metadata source.",
  "Contrast and touch target findings are limited unless reliable colour, bounds, or computed-style data is available.",
  "Static design screenshots may omit interaction states, responsive variants, hidden content, loading states, and error states."
]);

export function designReviewLimitationNote() {
  return DESIGN_REVIEW_LIMITATIONS.join(" ");
}
