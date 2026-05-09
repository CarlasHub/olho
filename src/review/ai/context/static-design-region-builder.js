import { viewportRectToPercentBounds } from "../../targeting/target-region-model.js";

const REGION_KEYWORDS = Object.freeze([
  ["hero", /\b(hero|headline|masthead|banner|above[-\s]?fold)\b/i],
  ["navigation", /\b(nav|navigation|menu|header|topbar|toolbar)\b/i],
  ["content block", /\b(content|section|article|body|copy|text)\b/i],
  ["CTA group", /\b(cta|button|action|submit|search|start|continue|apply)\b/i],
  ["form", /\b(form|input|field|label|select|textarea|search)\b/i],
  ["testimonial", /\b(testimonial|quote|review|story)\b/i],
  ["card group", /\b(card|tile|panel|summary|metric|item)\b/i],
  ["pricing/table", /\b(pricing|table|grid|plan|comparison|row|column)\b/i],
  ["footer", /\b(footer|legal|copyright)\b/i]
]);

function compactBounds(bounds = {}) {
  if (!bounds) return null;
  return {
    x: Math.round(Number(bounds.x || 0)),
    y: Math.round(Number(bounds.y || 0)),
    width: Math.round(Number(bounds.width || 0)),
    height: Math.round(Number(bounds.height || 0))
  };
}

function textForElement(element = {}) {
  return [element.selector, element.role, element.type, element.tagName, element.text]
    .map((value) => String(value || ""))
    .join(" ")
    .trim();
}

function regionTypeForElement(element = {}) {
  const text = textForElement(element);
  const matched = REGION_KEYWORDS.find(([, pattern]) => pattern.test(text));
  if (matched) return matched[0];
  if (element.headingLevel || element.type === "heading") return "content block";
  if (element.interactive || element.type === "button" || element.type === "link") return "CTA group";
  return "unknown region";
}

function regionLabel(type, index) {
  const clean = String(type || "unknown region").trim();
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)} ${index + 1}`;
}

function elementWithinTarget(element = {}, target = null) {
  if (!target?.bounds || !element?.bounds) return true;
  const bounds = element.bounds;
  const centerX = Number(bounds.x || 0) + Number(bounds.width || 0) / 2;
  const centerY = Number(bounds.y || 0) + Number(bounds.height || 0) / 2;
  return (
    centerX >= target.bounds.x &&
    centerX <= target.bounds.right &&
    centerY >= target.bounds.y &&
    centerY <= target.bounds.bottom
  );
}

function syntheticRegionForTarget(target = null, viewport = {}) {
  const bounds = target?.bounds || { x: 0, y: 0, width: viewport.width || 1, height: viewport.height || 1 };
  return {
    id: "region-target",
    type: target?.type === "central-design-artboard" ? "design artboard" : "visible screen",
    label: target?.label || "Review target",
    bounds: compactBounds(bounds),
    percentBounds: viewportRectToPercentBounds(bounds, viewport),
    elementCount: 0,
    representativeText: "",
    source: target?.source || "screenshot",
    confidence: Number(target?.confidence || 0.65)
  };
}

export function buildStaticDesignRegions({ elements = [], target = null, viewport = {} } = {}) {
  const scoped = (Array.isArray(elements) ? elements : []).filter((element) => elementWithinTarget(element, target));
  const grouped = new Map();

  scoped.forEach((element) => {
    const type = regionTypeForElement(element);
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(element);
  });

  const regions = Array.from(grouped.entries())
    .map(([type, group], index) => {
      const bounds = group
        .map((element) => element.bounds)
        .filter(Boolean)
        .reduce(
          (acc, bounds) => ({
            x: Math.min(acc.x, Number(bounds.x || 0)),
            y: Math.min(acc.y, Number(bounds.y || 0)),
            right: Math.max(acc.right, Number(bounds.x || 0) + Number(bounds.width || 0)),
            bottom: Math.max(acc.bottom, Number(bounds.y || 0) + Number(bounds.height || 0))
          }),
          { x: Infinity, y: Infinity, right: 0, bottom: 0 }
        );
      const rect = Number.isFinite(bounds.x)
        ? {
            x: bounds.x,
            y: bounds.y,
            width: Math.max(1, bounds.right - bounds.x),
            height: Math.max(1, bounds.bottom - bounds.y)
          }
        : null;
      return {
        id: `region-${type.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${index + 1}`,
        type,
        label: regionLabel(type, index),
        bounds: compactBounds(rect),
        percentBounds: rect ? viewportRectToPercentBounds(rect, viewport) : null,
        elementCount: group.length,
        representativeText: group
          .map((element) => String(element.text || "").trim())
          .filter(Boolean)
          .slice(0, 4)
          .join(" | ")
          .slice(0, 260),
        source: "dom-metrics",
        confidence: type === "unknown region" ? 0.45 : 0.72
      };
    })
    .filter((region) => region.bounds && region.percentBounds)
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
    .slice(0, 12);

  if (!regions.length) {
    return [syntheticRegionForTarget(target, viewport)];
  }

  return regions;
}
