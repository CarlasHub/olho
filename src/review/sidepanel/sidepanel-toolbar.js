export function setToolbarBusy(elements, busy) {
  [
    elements.reviewVisibleButton,
    elements.reviewDesignButton,
    elements.reviewFullButton,
    elements.reviewDepthSelect,
    elements.clearMarkersButton,
    elements.copySummaryButton,
    elements.exportHtmlButton,
    elements.exportMarkdownButton,
    elements.exportJsonButton,
    elements.fallbackButton
  ].forEach((button) => {
    if (button) button.disabled = Boolean(busy);
  });
  if (elements.progress) {
    elements.progress.hidden = !busy;
  }
}

export function setExportAvailable(elements, available) {
  [
    elements.copySummaryButton,
    elements.exportHtmlButton,
    elements.exportMarkdownButton,
    elements.exportJsonButton
  ].forEach((button) => {
    if (button) button.disabled = !available;
  });
}
