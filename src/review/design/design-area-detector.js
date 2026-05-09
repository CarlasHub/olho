import { isDesignReviewSourceType } from "./design-review-mode.js";

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function viewportSize(input = {}) {
  const viewport = input.viewport || {};
  const image = input.image || {};
  const width = numberOrNull(viewport.width) || numberOrNull(image.width) || 0;
  const height = numberOrNull(viewport.height) || numberOrNull(image.height) || 0;
  return { width, height };
}

function normalizeBounds(bounds = {}, viewport = {}) {
  const x = numberOrNull(bounds.x ?? bounds.left);
  const y = numberOrNull(bounds.y ?? bounds.top);
  const width = numberOrNull(bounds.width);
  const height = numberOrNull(bounds.height);
  if ([x, y, width, height].some((value) => value === null) || width <= 0 || height <= 0) return null;
  const right = x + width;
  const bottom = y + height;
  return {
    x,
    y,
    width,
    height,
    right,
    bottom,
    area: width * height,
    centerX: x + width / 2,
    centerY: y + height / 2,
    percent: {
      x: viewport.width ? (x / viewport.width) * 100 : 0,
      y: viewport.height ? (y / viewport.height) * 100 : 0,
      width: viewport.width ? (width / viewport.width) * 100 : 100,
      height: viewport.height ? (height / viewport.height) * 100 : 100
    }
  };
}

function isArtboardLike(element = {}) {
  const text = [
    element.selector,
    element.id,
    element.role,
    element.tagName,
    element.type,
    element.text,
    element.accessibleName,
    element.label
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return /\b(canvas|artboard|frame|prototype|viewer|viewport|screen|board|page)\b/.test(text);
}

function candidateScore(candidate, viewport = {}) {
  if (!viewport.width || !viewport.height) return 0;
  const viewportArea = viewport.width * viewport.height;
  const areaRatio = candidate.area / viewportArea;
  const centerDistance =
    Math.abs(candidate.centerX - viewport.width / 2) / viewport.width +
    Math.abs(candidate.centerY - viewport.height / 2) / viewport.height;
  const sizeScore = Math.min(1, areaRatio / 0.42);
  const centerScore = Math.max(0, 1 - centerDistance);
  const artboardBonus = candidate.artboardLike ? 0.35 : 0;
  const chromePenalty = candidate.percent.x < 5 || candidate.percent.width > 92 ? 0.24 : 0;
  return sizeScore * 0.58 + centerScore * 0.42 + artboardBonus - chromePenalty;
}

function sourceSpecificCandidateAllowed(candidate, sourceType) {
  if (sourceType === "zeplin-capture") {
    if (candidate.percent.width > 58) return false;
    if (candidate.percent.x < 20) return false;
  }
  if (sourceType === "figma-capture") {
    if (candidate.percent.width > 68) return false;
    if (candidate.percent.x < 14) return false;
  }
  return true;
}

function heuristicAreaForSource(sourceType) {
  if (sourceType === "figma-capture") {
    return {
      x: 20,
      y: 9,
      width: 58,
      height: 84,
      confidence: 0.52,
      reason: "Figma canvas heuristic excludes common side panels and top toolbar."
    };
  }

  if (sourceType === "zeplin-capture") {
    return {
      x: 26,
      y: 18,
      width: 52,
      height: 80,
      confidence: 0.52,
      reason: "Zeplin canvas heuristic excludes common side panels and top toolbar."
    };
  }

  return {
    x: 8,
    y: 6,
    width: 84,
    height: 88,
    confidence: 0.42,
    reason: "Central design-area heuristic for image-only design review."
  };
}

export function detectCentralDesignArea(input = {}) {
  const sourceType = String(input.sourceType || "").trim();
  const viewport = viewportSize(input);
  const isDesignSource = isDesignReviewSourceType(sourceType);

  if (!isDesignSource) {
    return {
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      confidence: 1,
      reason: "Visible screen review uses the full captured interface."
    };
  }

  const rawElements = Array.isArray(input.elements) ? input.elements : [];
  const candidates = rawElements
    .map((element) => {
      const bounds = normalizeBounds(element.bounds || element.rect || element.boundingBox || element, viewport);
      if (!bounds || !viewport.width || !viewport.height) return null;
      const areaRatio = bounds.area / (viewport.width * viewport.height);
      const centralEnough = bounds.centerX > viewport.width * 0.18 && bounds.centerX < viewport.width * 0.82;
      const largeEnough = areaRatio >= 0.18 || (bounds.percent.width >= 32 && bounds.percent.height >= 36);
      if (!largeEnough || !centralEnough) return null;
      if (!sourceSpecificCandidateAllowed(bounds, sourceType)) return null;
      return {
        ...bounds,
        artboardLike: isArtboardLike(element)
      };
    })
    .filter(Boolean)
    .sort((a, b) => candidateScore(b, viewport) - candidateScore(a, viewport));

  const best = candidates[0];
  if (best && candidateScore(best, viewport) >= 0.52) {
    const paddingX = Math.min(3, best.percent.width * 0.04);
    const paddingY = Math.min(3, best.percent.height * 0.04);
    return {
      bounds: {
        x: Math.max(0, best.percent.x - paddingX),
        y: Math.max(0, best.percent.y - paddingY),
        width: Math.min(100, best.percent.width + paddingX * 2),
        height: Math.min(100, best.percent.height + paddingY * 2)
      },
      confidence: best.artboardLike ? 0.74 : 0.62,
      reason: best.artboardLike
        ? "Detected a central artboard-like canvas element."
        : "Detected the largest meaningful central visual canvas region."
    };
  }

  const heuristic = heuristicAreaForSource(sourceType);
  return {
    bounds: {
      x: heuristic.x,
      y: heuristic.y,
      width: heuristic.width,
      height: heuristic.height
    },
    confidence: heuristic.confidence,
    reason: heuristic.reason
  };
}

export function elementCenterWithinArea(element = {}, areaBounds = null, viewport = {}) {
  if (!areaBounds || !viewport.width || !viewport.height) return true;
  const bounds = normalizeBounds(element.bounds || element.rect || element.boundingBox || element, viewport);
  if (!bounds) return false;
  const left = (areaBounds.x / 100) * viewport.width;
  const top = (areaBounds.y / 100) * viewport.height;
  const right = ((areaBounds.x + areaBounds.width) / 100) * viewport.width;
  const bottom = ((areaBounds.y + areaBounds.height) / 100) * viewport.height;
  return bounds.centerX >= left && bounds.centerX <= right && bounds.centerY >= top && bounds.centerY <= bottom;
}

export function filterMetricsForDesignArea(metrics = {}, area = null) {
  if (!area?.bounds) return metrics;
  const viewport = viewportSize(metrics);
  if (!viewport.width || !viewport.height) return metrics;
  const elements = Array.isArray(metrics.elements)
    ? metrics.elements.filter((element) => elementCenterWithinArea(element, area.bounds, viewport))
    : [];
  return {
    ...metrics,
    elements,
    designArea: area
  };
}

export function findingWithinDesignArea(finding = {}, area = null) {
  if (!area?.bounds || !finding.regionBounds) return true;
  const bounds = finding.regionBounds;
  const centerX = Number(bounds.x || 0) + Number(bounds.width || 0) / 2;
  const centerY = Number(bounds.y || 0) + Number(bounds.height || 0) / 2;
  return (
    centerX >= area.bounds.x &&
    centerX <= area.bounds.x + area.bounds.width &&
    centerY >= area.bounds.y &&
    centerY <= area.bounds.y + area.bounds.height
  );
}
