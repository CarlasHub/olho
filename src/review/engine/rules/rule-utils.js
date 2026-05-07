import { elementRegionBounds, inferElementRegion } from "../../utils/review-regions.js";

function hashString(input) {
  const text = String(input || "");
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function missingElements(context, minimum = 1) {
  return context.elements.length < minimum ? "DOM and computed-style element metrics are unavailable." : "";
}

export function missingActions(context, minimum = 1) {
  return context.actions.length < minimum ? "Interactive action metrics are unavailable." : "";
}

export function missingText(context, minimum = 1) {
  return context.textBlocks.length < minimum ? "Text metrics are unavailable." : "";
}

export function missingComponents(context, minimum = 1) {
  return context.components.length < minimum ? "Component metrics are unavailable." : "";
}

export function createFinding(context, config) {
  const selector = String(config.selector || config.element?.selector || "").trim();
  const region = config.region || (config.element ? inferElementRegion(config.element, context) : "Screenshot");
  const regionBounds = config.regionBounds || (config.element ? elementRegionBounds(config.element, context) : null);
  const signature = [
    config.ruleId,
    config.category,
    region,
    selector,
    config.issue,
    config.evidence
  ].join("|");

  return {
    id: `${config.ruleId}:${hashString(signature)}`,
    category: config.category,
    severity: config.severity,
    region,
    issue: config.issue,
    evidence: config.evidence,
    impact: config.impact,
    recommendation: config.recommendation,
    confidence: Number(config.confidence),
    screenshotRef: context.screenshotRef,
    selector,
    source: "rule-engine",
    ...(regionBounds ? { regionBounds } : {})
  };
}

export function topElements(elements = [], count = 6) {
  return elements.slice().sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x).slice(0, count);
}

export function firstSelector(elements = []) {
  return elements.find((element) => element.selector)?.selector || "";
}

export function elementLabel(element) {
  return element?.text || element?.selector || element?.role || element?.tagName || "visible element";
}
