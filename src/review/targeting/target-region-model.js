export const REVIEW_TARGET_TYPES = Object.freeze({
  FULL_VISIBLE_PAGE: "full-visible-page",
  CENTRAL_DESIGN_ARTBOARD: "central-design-artboard",
  SELECTED_ELEMENT: "selected-element",
  DESIGN_CANVAS: "design-canvas",
  WEBPAGE_REGION: "webpage-region",
  UNKNOWN: "unknown"
});

export const REVIEW_TARGET_SOURCES = Object.freeze({
  LIVE_DOM: "live-dom",
  SCREENSHOT: "screenshot",
  DESIGN_TOOL: "design-tool"
});

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeViewport(viewport = {}) {
  return {
    width: Math.max(0, numberOrNull(viewport.width) || 0),
    height: Math.max(0, numberOrNull(viewport.height) || 0),
    scrollX: numberOrNull(viewport.scrollX) || 0,
    scrollY: numberOrNull(viewport.scrollY) || 0
  };
}

export function normalizeBounds(bounds = {}, viewport = {}) {
  const size = normalizeViewport(viewport);
  const x = numberOrNull(bounds.x ?? bounds.left);
  const y = numberOrNull(bounds.y ?? bounds.top);
  const width = numberOrNull(bounds.width);
  const height = numberOrNull(bounds.height);
  if ([x, y, width, height].some((value) => value === null) || width <= 0 || height <= 0) return null;
  const maxWidth = size.width || x + width;
  const maxHeight = size.height || y + height;
  const safeX = Math.max(0, Math.min(x, maxWidth));
  const safeY = Math.max(0, Math.min(y, maxHeight));
  const safeWidth = Math.max(1, Math.min(width, maxWidth - safeX || width));
  const safeHeight = Math.max(1, Math.min(height, maxHeight - safeY || height));
  return {
    x: safeX,
    y: safeY,
    width: safeWidth,
    height: safeHeight,
    right: safeX + safeWidth,
    bottom: safeY + safeHeight,
    centerX: safeX + safeWidth / 2,
    centerY: safeY + safeHeight / 2
  };
}

export function percentBoundsToViewportRect(percent = {}, viewport = {}) {
  const size = normalizeViewport(viewport);
  if (!size.width || !size.height) return null;
  return normalizeBounds(
    {
      x: (Number(percent.x || 0) / 100) * size.width,
      y: (Number(percent.y || 0) / 100) * size.height,
      width: (Number(percent.width || 0) / 100) * size.width,
      height: (Number(percent.height || 0) / 100) * size.height
    },
    size
  );
}

export function viewportRectToPercentBounds(bounds = {}, viewport = {}) {
  const rect = normalizeBounds(bounds, viewport);
  const size = normalizeViewport(viewport);
  if (!rect || !size.width || !size.height) return null;
  return {
    x: (rect.x / size.width) * 100,
    y: (rect.y / size.height) * 100,
    width: (rect.width / size.width) * 100,
    height: (rect.height / size.height) * 100
  };
}

export function createReviewTarget({
  id = "visible-page",
  type = REVIEW_TARGET_TYPES.FULL_VISIBLE_PAGE,
  label = "Visible page",
  bounds = null,
  viewport = {},
  source = REVIEW_TARGET_SOURCES.LIVE_DOM,
  confidence = 1,
  limitations = [],
  excludesPageChrome = false
} = {}) {
  const size = normalizeViewport(viewport);
  const normalizedBounds =
    normalizeBounds(bounds, size) ||
    normalizeBounds({ x: 0, y: 0, width: size.width || 1, height: size.height || 1 }, size);
  return {
    id,
    type,
    label,
    bounds: normalizedBounds,
    source,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    limitations: Array.isArray(limitations) ? limitations.filter(Boolean) : [],
    excludesPageChrome: Boolean(excludesPageChrome)
  };
}

export function elementCenterWithinTarget(element = {}, target = null) {
  if (!target?.bounds) return true;
  const raw = element.bounds || element.rect || element.boundingBox || element;
  const x = numberOrNull(raw.x ?? raw.left);
  const y = numberOrNull(raw.y ?? raw.top);
  const width = numberOrNull(raw.width);
  const height = numberOrNull(raw.height);
  if ([x, y, width, height].some((value) => value === null) || width <= 0 || height <= 0) return false;
  const targetX = numberOrNull(target.bounds.x ?? target.bounds.left) || 0;
  const targetY = numberOrNull(target.bounds.y ?? target.bounds.top) || 0;
  const targetWidth = numberOrNull(target.bounds.width) || 0;
  const targetHeight = numberOrNull(target.bounds.height) || 0;
  const targetRight = numberOrNull(target.bounds.right) ?? targetX + targetWidth;
  const targetBottom = numberOrNull(target.bounds.bottom) ?? targetY + targetHeight;
  if (!targetWidth || !targetHeight || targetRight <= targetX || targetBottom <= targetY) return false;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  return (
    centerX >= targetX &&
    centerX <= targetRight &&
    centerY >= targetY &&
    centerY <= targetBottom
  );
}

export function filterElementsForTarget(elements = [], target = null) {
  if (!target?.bounds || target.type === REVIEW_TARGET_TYPES.FULL_VISIBLE_PAGE) {
    return Array.isArray(elements) ? elements : [];
  }
  return (Array.isArray(elements) ? elements : []).filter((element) => elementCenterWithinTarget(element, target));
}
