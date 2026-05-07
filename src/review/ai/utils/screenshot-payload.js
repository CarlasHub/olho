import { AI_REVIEW_MODES } from "../ai-review-schema.js";

function canvasSize(width, height, maxDimension) {
  const largest = Math.max(width, height);
  if (!largest || largest <= maxDimension) return { width, height };
  const scale = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export async function createScreenshotPayload({
  imageElement,
  enabled = false,
  mode = AI_REVIEW_MODES.TEXT_REFINE,
  provider = null,
  maxDimension = 1600
} = {}) {
  if (!enabled) {
    return {
      shared: false,
      reason: "Screenshot sharing is disabled."
    };
  }

  if (mode !== AI_REVIEW_MODES.FULL_VISUAL) {
    return {
      shared: false,
      reason: "Review mode does not require screenshot sharing."
    };
  }

  if (!provider?.supportsVision) {
    return {
      shared: false,
      reason: "Selected provider does not support screenshot review."
    };
  }

  if (!imageElement?.naturalWidth || !imageElement?.naturalHeight) {
    return {
      shared: false,
      reason: "Screenshot image is not ready."
    };
  }

  const ownerDocument = imageElement.ownerDocument || globalThis.document;
  const canvas = ownerDocument.createElement("canvas");
  const size = canvasSize(imageElement.naturalWidth, imageElement.naturalHeight, maxDimension);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(imageElement, 0, 0, size.width, size.height);
  const mimeType = "image/png";
  const dataUrl = canvas.toDataURL(mimeType);
  const commaIndex = dataUrl.indexOf(",");

  return {
    shared: true,
    reason: "Screenshot payload prepared after explicit user action.",
    mimeType,
    dataUrl,
    dataBase64: commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : "",
    width: size.width,
    height: size.height,
    originalWidth: imageElement.naturalWidth,
    originalHeight: imageElement.naturalHeight
  };
}
