import { contrastRatio } from "./colour-utils.js";
import { inferReviewRegions } from "./review-regions.js";
import { parseCssLength, textLineLengthChars } from "./typography-utils.js";

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeBounds(input = {}) {
  const bounds = input.bounds || input.rect || input.boundingBox || input;
  const x = numberOrNull(bounds.x ?? bounds.left);
  const y = numberOrNull(bounds.y ?? bounds.top);
  const width = numberOrNull(bounds.width ?? (numberOrNull(bounds.right) !== null && x !== null ? Number(bounds.right) - x : null));
  const height = numberOrNull(bounds.height ?? (numberOrNull(bounds.bottom) !== null && y !== null ? Number(bounds.bottom) - y : null));
  if ([x, y, width, height].some((value) => value === null)) return null;
  return {
    x,
    y,
    width: Math.max(0, width),
    height: Math.max(0, height),
    right: x + Math.max(0, width),
    bottom: y + Math.max(0, height)
  };
}

function normalizeStyle(input = {}) {
  const style = input.computedStyle || input.style || {};
  const fontSize = parseCssLength(style.fontSize ?? input.fontSize);
  const lineHeightPx = parseCssLength(style.lineHeight ?? input.lineHeight);
  const backgroundColor = style.backgroundColor || style.background || input.backgroundColor || "";
  const color = style.color || input.color || "";
  const borderRadius = parseCssLength(style.borderRadius ?? input.borderRadius);
  const boxShadow = String(style.boxShadow || input.boxShadow || "");
  const fontFamily = String(style.fontFamily || input.fontFamily || "").trim();
  return {
    ...style,
    color,
    backgroundColor,
    fontFamily,
    fontSize,
    lineHeightPx,
    lineHeightRatio: fontSize > 0 && lineHeightPx > 0 ? lineHeightPx / fontSize : null,
    borderRadius,
    boxShadow,
    contrast: color && backgroundColor ? contrastRatio(color, backgroundColor) : null
  };
}

function normalizeElement(input = {}, index = 0) {
  const bounds = normalizeBounds(input);
  const style = normalizeStyle(input);
  const text = String(input.text || input.innerText || input.accessibleName || input.label || "").trim();
  const role = String(input.role || "").toLowerCase();
  const tagName = String(input.tagName || input.tag || "").toLowerCase();
  const type = String(input.type || input.componentType || "").toLowerCase();
  const selector = String(input.selector || input.cssSelector || "").trim();
  const area = bounds ? bounds.width * bounds.height : 0;
  const isButton =
    type === "button" ||
    role === "button" ||
    tagName === "button" ||
    /\b(button|btn|cta|submit|cancel|save|continue|next|apply)\b/i.test(selector);
  const isHeading =
    /^h[1-6]$/.test(tagName) ||
    role === "heading" ||
    type === "heading" ||
    Number(input.level || input.headingLevel || 0) > 0;
  const isCard = type === "card" || /\b(card|tile|panel)\b/i.test(selector);
  const isIcon = type === "icon" || /\b(icon|svg)\b/i.test(selector) || tagName === "svg";
  const isStatus = type === "status" || role === "status" || /\b(status|badge|pill|tag|alert|error)\b/i.test(selector);

  return {
    ...input,
    id: String(input.id || selector || `element-${index}`),
    index,
    selector,
    role,
    tagName,
    type,
    text,
    bounds,
    area,
    style,
    state: input.state || {},
    level: Number(input.level || input.headingLevel || 0) || null,
    isButton,
    isHeading,
    isCard,
    isIcon,
    isStatus,
    isInteractive: Boolean(isButton || input.interactive || role === "link" || tagName === "a")
  };
}

function normalizeViewport(input = {}, image = {}) {
  const viewport = input.viewport || input.window || {};
  const width = numberOrNull(viewport.width) ?? numberOrNull(image.width) ?? 0;
  const height = numberOrNull(viewport.height) ?? numberOrNull(image.height) ?? 0;
  return {
    width,
    height,
    aspectRatio: width > 0 && height > 0 ? width / height : null
  };
}

function normalizeImage(input = {}) {
  const image = input.image || input.imageMetrics || {};
  const media = input.media || {};
  const metadata = media.metadata || {};
  const width = numberOrNull(image.width ?? image.naturalWidth ?? metadata.width);
  const height = numberOrNull(image.height ?? image.naturalHeight ?? metadata.height);
  return {
    width: width || 0,
    height: height || 0,
    aspectRatio: width && height ? width / height : null,
    sizeBytes: numberOrNull(image.sizeBytes ?? metadata.sizeBytes) || 0,
    mimeType: image.mimeType || metadata.mimeType || ""
  };
}

function densityMetrics(elements, viewport) {
  if (!viewport.width || !viewport.height) {
    return {
      elementCount: elements.length,
      elementDensity: 0,
      occupiedRatio: 0,
      interactiveCount: elements.filter((element) => element.isInteractive).length
    };
  }

  const viewportArea = viewport.width * viewport.height;
  const occupiedArea = elements.reduce((sum, element) => sum + Math.min(element.area || 0, viewportArea), 0);
  return {
    elementCount: elements.length,
    elementDensity: elements.length / (viewportArea / 100000),
    occupiedRatio: Math.min(1, occupiedArea / viewportArea),
    interactiveCount: elements.filter((element) => element.isInteractive).length
  };
}

function typeScaleStats(textBlocks) {
  const sizes = textBlocks.map((element) => element.style.fontSize).filter((value) => value > 0);
  const families = textBlocks.map((element) => element.style.fontFamily).filter(Boolean);
  const uniqueSizes = [...new Set(sizes.map((value) => Math.round(value)))].sort((a, b) => a - b);
  const uniqueFamilies = [...new Set(families.map((value) => value.toLowerCase()))];
  const lineLengths = textBlocks.map((element) => textLineLengthChars(element.text)).filter((value) => value > 0);
  return {
    minFontSize: sizes.length ? Math.min(...sizes) : 0,
    maxFontSize: sizes.length ? Math.max(...sizes) : 0,
    uniqueFontSizes: uniqueSizes,
    uniqueFontFamilyCount: uniqueFamilies.length,
    averageLineLength: lineLengths.length
      ? lineLengths.reduce((sum, value) => sum + value, 0) / lineLengths.length
      : 0
  };
}

export function normalizeReviewMetrics(input = {}) {
  const image = normalizeImage(input);
  const viewport = normalizeViewport(input, image);
  const rawElements = Array.isArray(input.elements)
    ? input.elements
    : Array.isArray(input.domMetrics?.elements)
      ? input.domMetrics.elements
      : [];
  const elements = rawElements.map(normalizeElement).filter((element) => element.bounds);
  const textBlocks = elements.filter((element) => element.text);
  const actions = elements.filter((element) => element.isButton);
  const headings = elements.filter((element) => element.isHeading);
  const components = elements.filter((element) => element.isButton || element.isCard || element.isIcon || element.isStatus);
  const detectedRegions = inferReviewRegions({ elements, viewport, image });

  return {
    image,
    viewport,
    elements,
    textBlocks,
    actions,
    headings,
    components,
    densityMetrics: densityMetrics(elements, viewport),
    typeScaleStats: typeScaleStats(textBlocks),
    detectedRegions
  };
}
