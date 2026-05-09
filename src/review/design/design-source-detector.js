import { isDesignReviewSourceType, normalizeReviewSourceType } from "./design-review-mode.js";

function textFromValues(values) {
  return values
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function metadataValue(metadata = {}, keys = []) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function hasDomainHint(text, domain) {
  return text.includes(domain);
}

function hasWordHint(text, word) {
  return new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, "i").test(text);
}

function sourceTypeFromCaptureSource(sourceType) {
  const normalized = String(sourceType || "").trim();
  if (["visible", "region", "fullPage", "element"].includes(normalized)) return "webpage-capture";
  if (["screenRecording", "windowRecording", "tabRecording"].includes(normalized)) return "screen-capture";
  return "";
}

export function detectDesignSource(input = {}) {
  const media = input.media || {};
  const metadata = {
    ...(media.metadata || {}),
    ...(input.metadata || {})
  };
  const suppliedSourceType = normalizeReviewSourceType(
    metadata.reviewSourceType || metadata.designReviewSourceType || input.sourceType,
    ""
  );
  if (suppliedSourceType && suppliedSourceType !== "unknown") {
    return {
      sourceType: suppliedSourceType,
      isDesignScreen: isDesignReviewSourceType(suppliedSourceType),
      platform: metadata.designPlatform || "",
      confidence: 0.95,
      reason: "Explicit review source metadata."
    };
  }

  const sourceUrl = metadataValue(metadata, ["sourceUrl", "captureUrl", "url", "originUrl"]);
  const filename = metadataValue(metadata, ["originalName", "filename", "fileName", "title"]);
  const text = textFromValues([sourceUrl, filename, metadata.sourceLabel, metadata.note, input.filename, input.sourceUrl]);

  const hasZeplinDomain = hasDomainHint(text, "app.zeplin.io") || hasDomainHint(text, "zeplin.io");
  if (hasZeplinDomain || hasWordHint(text, "zeplin")) {
    return {
      sourceType: sourceUrl && hasZeplinDomain ? "zeplin-capture" : "design-import",
      isDesignScreen: true,
      platform: "zeplin",
      confidence: sourceUrl ? 0.9 : 0.75,
      reason: "Zeplin source hint."
    };
  }

  if (hasDomainHint(text, "figma.com") || hasWordHint(text, "figma")) {
    return {
      sourceType: sourceUrl && hasDomainHint(text, "figma.com") ? "figma-capture" : "design-import",
      isDesignScreen: true,
      platform: "figma",
      confidence: sourceUrl ? 0.9 : 0.75,
      reason: "Figma source hint."
    };
  }

  if (metadata.designReview || metadata.isDesignScreen || metadata.importedForReview) {
    return {
      sourceType: "design-import",
      isDesignScreen: true,
      platform: metadata.designPlatform || "",
      confidence: 0.8,
      reason: "Design review import metadata."
    };
  }

  const captureSourceType = sourceTypeFromCaptureSource(metadata.sourceType || media.sourceType);
  if (captureSourceType) {
    return {
      sourceType: captureSourceType,
      isDesignScreen: false,
      platform: "",
      confidence: 0.7,
      reason: "Capture source metadata."
    };
  }

  const mimeType = String(metadata.mimeType || media.mimeType || media.blob?.type || "").toLowerCase();
  const isStaticImage = media.type === "image" || /^image\/(png|jpe?g|webp)$/.test(mimeType);
  const hasDomMetrics = Boolean(input.hasDomMetrics || metadata.reviewMetrics?.elements?.length || metadata.domMetrics?.elements?.length);

  if (isStaticImage && !hasDomMetrics) {
    return {
      sourceType: "static-design",
      isDesignScreen: true,
      platform: "",
      confidence: 0.55,
      reason: "Static image without DOM metadata."
    };
  }

  return {
    sourceType: "unknown",
    isDesignScreen: false,
    platform: "",
    confidence: 0.2,
    reason: "Insufficient source evidence."
  };
}
