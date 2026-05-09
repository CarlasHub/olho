import { detectDesignSource } from "./design-source-detector.js";

export const DESIGN_IMPORT_ACCEPT = Object.freeze(["image/png", "image/jpeg", "image/webp"]);
export const DESIGN_IMPORT_MAX_BYTES = 30 * 1024 * 1024;

function extensionFromType(mimeType) {
  const type = String(mimeType || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return "png";
}

function titleFromFilename(filename) {
  return String(filename || "Design Screen")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function measureImageFile(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const dimensions = {
      width: bitmap.width,
      height: bitmap.height
    };
    bitmap.close?.();
    return dimensions;
  }

  return {
    width: 0,
    height: 0
  };
}

export function validateDesignImportFile(file) {
  if (!(file instanceof Blob)) {
    throw new Error("Choose a PNG, JPG, or WebP design screenshot.");
  }
  const mimeType = String(file.type || "").toLowerCase();
  if (!DESIGN_IMPORT_ACCEPT.includes(mimeType)) {
    throw new Error("Design Review supports PNG, JPG, or WebP imports.");
  }
  if (file.size > DESIGN_IMPORT_MAX_BYTES) {
    throw new Error("Design screenshot is too large. Use an image under 30 MB.");
  }
}

export async function buildDesignImportMetadata(file, options = {}) {
  validateDesignImportFile(file);
  const dimensions = await measureImageFile(file);
  const originalName = String(file.name || options.originalName || "Design Screen").trim();
  const detected = detectDesignSource({
    filename: originalName,
    metadata: {
      designReview: true,
      originalName,
      sourceUrl: options.sourceUrl || ""
    },
    media: {
      type: "image",
      mimeType: file.type
    }
  });

  return {
    title: options.title || titleFromFilename(originalName) || "Design Screen",
    tags: options.tags || ["design-review"],
    mimeType: file.type || "image/png",
    extension: extensionFromType(file.type),
    sizeBytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
    imported: true,
    importedForReview: true,
    designReview: true,
    isDesignScreen: true,
    reviewSourceType: detected.sourceType === "unknown" ? "design-import" : detected.sourceType,
    designPlatform: detected.platform || "",
    originalName,
    sourceUrl: options.sourceUrl || "",
    sourceType: "local-import",
    privacyLocalOnlyMode: true
  };
}

export async function importDesignScreenshotForReview({
  file,
  createItem,
  openReview,
  folderId = null,
  sourceUrl = ""
} = {}) {
  if (typeof createItem !== "function") {
    throw new Error("Design import requires a local save handler.");
  }
  if (typeof openReview !== "function") {
    throw new Error("Design import requires a Review Mode opener.");
  }

  const metadata = await buildDesignImportMetadata(file, { sourceUrl });
  const item = await createItem({
    type: "image",
    blob: file,
    folderId,
    metadata
  });
  await openReview(item);
  return item;
}
