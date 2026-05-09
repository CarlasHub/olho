import { normalizeBounds, percentBoundsToViewportRect } from "../targeting/target-region-model.js";

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function viewportDocumentSize(viewport = {}) {
  const scrollX = numberOrZero(viewport.scrollX);
  const scrollY = numberOrZero(viewport.scrollY);
  const width = Math.max(numberOrZero(viewport.width), scrollX + numberOrZero(viewport.width));
  const height = Math.max(numberOrZero(viewport.height), scrollY + numberOrZero(viewport.height));
  return { width, height, scrollX, scrollY };
}

export function findingBoundsToPageRect(finding = {}, viewport = {}) {
  if (!finding.regionBounds) return null;
  const viewportRect = percentBoundsToViewportRect(finding.regionBounds, viewport);
  if (!viewportRect) return null;
  const scrollX = numberOrZero(viewport.scrollX);
  const scrollY = numberOrZero(viewport.scrollY);
  return normalizeBounds(
    {
      x: viewportRect.x + scrollX,
      y: viewportRect.y + scrollY,
      width: viewportRect.width,
      height: viewportRect.height
    },
    {
      width: Math.max(viewport.width || 0, scrollX + viewportRect.x + viewportRect.width),
      height: Math.max(viewport.height || 0, scrollY + viewportRect.y + viewportRect.height)
    }
  );
}

function boundsToPageRect(bounds = {}, viewport = {}) {
  const size = viewportDocumentSize(viewport);
  const rect = normalizeBounds(bounds, {
    width: Math.max(numberOrZero(viewport.width), numberOrZero(bounds.x) + numberOrZero(bounds.width)),
    height: Math.max(numberOrZero(viewport.height), numberOrZero(bounds.y) + numberOrZero(bounds.height))
  });
  if (!rect) return null;
  return normalizeBounds(
    {
      x: rect.x + size.scrollX,
      y: rect.y + size.scrollY,
      width: rect.width,
      height: rect.height
    },
    size
  );
}

function targetToPageRect(target = null, viewport = {}) {
  if (!target?.bounds) return null;
  return boundsToPageRect(target.bounds, viewport);
}

function intersectRects(a, b) {
  if (!a || !b) return a || null;
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
    centerX: left + (right - left) / 2,
    centerY: top + (bottom - top) / 2
  };
}

function selectorMatches(element = {}, selector = "") {
  const expected = String(selector || "").trim();
  if (!expected) return false;
  return String(element.selector || "").trim() === expected;
}

function elementRectForFinding(finding = {}, elements = [], viewport = {}) {
  const selector = String(finding.selector || "").trim();
  if (!selector) return null;
  const element = (Array.isArray(elements) ? elements : []).find((item) => selectorMatches(item, selector));
  if (!element?.bounds) return null;
  return boundsToPageRect(element.bounds, viewport);
}

function rectForFinding(finding = {}, viewport = {}, options = {}) {
  const elementRect = elementRectForFinding(finding, options.elements || [], viewport);
  const regionRect = findingBoundsToPageRect(finding, viewport);
  const targetRect = targetToPageRect(options.target, viewport);
  const preferredRect = elementRect || regionRect;
  if (!preferredRect) return null;
  if (!targetRect || !options.target?.excludesPageChrome) return preferredRect;
  return intersectRects(preferredRect, targetRect);
}

function rectCenter(rect = {}) {
  return {
    x: Number(rect.x || 0) + Number(rect.width || 0) / 2,
    y: Number(rect.y || 0) + Number(rect.height || 0) / 2
  };
}

function anchorForCollision(rect = {}, collisionIndex = 0) {
  const width = Math.max(24, Number(rect.width || 0));
  const height = Math.max(24, Number(rect.height || 0));
  const positions = [
    [0.5, 0.5],
    [0.28, 0.32],
    [0.72, 0.32],
    [0.28, 0.7],
    [0.72, 0.7],
    [0.5, 0.24],
    [0.5, 0.78],
    [0.18, 0.52],
    [0.82, 0.52]
  ];
  const [xRatio, yRatio] = positions[collisionIndex % positions.length];
  return {
    x: Number(rect.x || 0) + width * xRatio,
    y: Number(rect.y || 0) + height * yRatio
  };
}

function anchorForMarker(marker = {}, collisionIndex = 0) {
  if (marker.anchorHint) return marker.anchorHint;
  if (collisionIndex) return anchorForCollision(marker.rect, collisionIndex);
  return rectCenter(marker.rect);
}

function addMarkerAnchors(markers = []) {
  const centerCounts = new Map();
  return markers.map((marker) => {
    const defaultAnchor = rectCenter(marker.rect);
    const centerKey = `${Math.round(defaultAnchor.x / 52)}:${Math.round(defaultAnchor.y / 52)}`;
    const collisionIndex = Number(centerCounts.get(centerKey) || 0);
    centerCounts.set(centerKey, collisionIndex + 1);
    const anchor = anchorForMarker(marker, collisionIndex);
    return {
      ...marker,
      anchor
    };
  });
}

export function buildOverlayMarkers(findings = [], viewport = {}, options = {}) {
  const markers = findings
    .map((finding, index) => {
      const rect = rectForFinding(finding, viewport, options);
      if (!rect) return null;
      return {
        id: finding.id,
        number: index + 1,
        severity: finding.severity,
        category: finding.category,
        markerType: finding.markerType || "component-group",
        label: `${index + 1}. ${finding.severity} ${finding.category}: ${finding.markerSummary || finding.issue}`,
        rect,
        coordinateSpace: "page",
        capturedScroll: {
          x: Number(viewport.scrollX || 0),
          y: Number(viewport.scrollY || 0)
        },
        issue: finding.issue,
        evidence: finding.evidence,
        impact: finding.impact,
        recommendation: finding.recommendation,
        confidence: finding.confidence,
        source: finding.source,
        markerSummary: finding.markerSummary
      };
    })
    .filter(Boolean);
  return addMarkerAnchors(markers);
}
