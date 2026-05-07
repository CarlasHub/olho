export function createReviewSession({
  itemId,
  media,
  imageUrl,
  findings = [],
  createdAt = new Date().toISOString()
} = {}) {
  const safeItemId = String(itemId || "").trim();
  if (!safeItemId) {
    throw new Error("Review session requires a media item id.");
  }

  return {
    id: `review-session:${safeItemId}`,
    itemId: safeItemId,
    screenshotRef: `media:${safeItemId}`,
    title: String(media?.metadata?.title || "Untitled screenshot"),
    imageUrl,
    createdAt,
    readOnly: true,
    media: {
      type: media?.type || "image",
      mimeType: media?.metadata?.mimeType || "",
      width: Number(media?.metadata?.width || 0),
      height: Number(media?.metadata?.height || 0),
      sizeBytes: Number(media?.metadata?.sizeBytes || 0),
      createdAt: media?.createdAt || ""
    },
    findings
  };
}
