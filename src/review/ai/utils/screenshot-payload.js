import { AI_REVIEW_MODES } from "../ai-review-schema.js";

const SCREENSHOT_REVIEW_MODES = new Set([
  AI_REVIEW_MODES.FULL_VISUAL,
  AI_REVIEW_MODES.STATIC_DESIGN_VISUAL
]);

function canvasSize(width, height, maxDimension) {
  const largest = Math.max(width, height);
  if (!largest || largest <= maxDimension) return { width, height };
  const scale = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function scaledCropRect({ cropBounds = null, viewport = {}, imageElement }) {
  if (!cropBounds || !viewport?.width || !viewport?.height) return null;
  const scaleX = imageElement.naturalWidth / Number(viewport.width || imageElement.naturalWidth);
  const scaleY = imageElement.naturalHeight / Number(viewport.height || imageElement.naturalHeight);
  const x = Math.max(0, Math.round(Number(cropBounds.x || 0) * scaleX));
  const y = Math.max(0, Math.round(Number(cropBounds.y || 0) * scaleY));
  const width = Math.max(1, Math.round(Number(cropBounds.width || 0) * scaleX));
  const height = Math.max(1, Math.round(Number(cropBounds.height || 0) * scaleY));
  if (width <= 1 || height <= 1) return null;
  return {
    x,
    y,
    width: Math.min(width, imageElement.naturalWidth - x),
    height: Math.min(height, imageElement.naturalHeight - y)
  };
}

export async function createScreenshotPayload({
  imageElement,
  enabled = false,
  mode = AI_REVIEW_MODES.TEXT_REFINE,
  provider = null,
  maxDimension = 1600,
  cropBounds = null,
  viewport = null
} = {}) {
  if (!enabled) {
    return {
      shared: false,
      reason: "Screenshot sharing is disabled."
    };
  }

  if (!SCREENSHOT_REVIEW_MODES.has(mode)) {
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
  const crop = scaledCropRect({ cropBounds, viewport, imageElement });
  const sourceWidth = crop?.width || imageElement.naturalWidth;
  const sourceHeight = crop?.height || imageElement.naturalHeight;
  const size = canvasSize(sourceWidth, sourceHeight, maxDimension);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (crop) {
    context.drawImage(imageElement, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
  } else {
    context.drawImage(imageElement, 0, 0, size.width, size.height);
  }
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
    originalHeight: imageElement.naturalHeight,
    crop: {
      used: Boolean(crop),
      reason: crop ? "Screenshot cropped to selected review target before AI review." : "Full screenshot used for AI review.",
      bounds: crop
    }
  };
}
