import { getMedia } from "../../storage/storage.js";

export async function loadReviewImageSource(itemId) {
  const safeItemId = String(itemId || "").trim();
  if (!safeItemId) {
    throw new Error("Review Mode requires a saved Memory image item.");
  }

  const media = await getMedia(safeItemId, { includeBlob: true });
  if (!media) {
    throw new Error("The selected Memory item could not be found.");
  }

  if (media.type !== "image") {
    throw new Error("Review Mode supports saved image items only.");
  }

  if (!(media.blob instanceof Blob)) {
    throw new Error("The selected Memory image has no local source file.");
  }

  const objectUrl = URL.createObjectURL(media.blob);
  return {
    media,
    objectUrl,
    revoke() {
      URL.revokeObjectURL(objectUrl);
    }
  };
}
