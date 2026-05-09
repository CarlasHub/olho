import { elementRegionBounds, inferElementRegion } from "../../utils/review-regions.js";
import { professionalFindingCopy } from "../../findings/finding-copy.js";

const MARKER_TYPES = Object.freeze({
  "visual-hierarchy": "section",
  ux: "component-group",
  "accessibility-visible": "accessibility-risk",
  "design-system": "component-group",
  "enterprise-polish": "composition",
  "responsive-layout": "section"
});

const REVIEW_PASSES = Object.freeze({
  "visual-hierarchy": "visual-hierarchy",
  ux: "ux-clarity",
  "accessibility-visible": "accessibility-visible",
  "design-system": "design-system",
  "enterprise-polish": "enterprise-polish",
  "responsive-layout": "layout-composition"
});

const BEST_PRACTICES = Object.freeze({
  "visual-hierarchy": "Visual hierarchy should guide attention from primary message to supporting detail to action.",
  ux: "Related controls and content should make the intended task path clear with minimal decision effort.",
  "accessibility-visible": "Important content and controls should remain readable, recognisable, and usable without relying on colour alone.",
  "design-system": "Repeated components should use consistent spacing, sizing, radius, elevation, and visual treatment.",
  "enterprise-polish": "Enterprise product UI should feel deliberate, restrained, trustworthy, and consistent across repeated surfaces.",
  "responsive-layout": "Layouts should preserve hierarchy, readability, and action clarity at the captured viewport size."
});

const AFFECTED_USERS = Object.freeze({
  "visual-hierarchy": "Users scanning quickly, first-time users, and users trying to understand what matters first.",
  ux: "Users completing the visible task, users under time pressure, and users comparing available actions.",
  "accessibility-visible": "Users with low vision, motor needs, cognitive fatigue, or bright viewing conditions.",
  "design-system": "Users relying on pattern recognition and teams maintaining repeated product components.",
  "enterprise-polish": "Enterprise users, stakeholders, and reviewers judging product quality and trust.",
  "responsive-layout": "Users on narrower or constrained viewports."
});

function percentRectFromElements(elements = [], context = {}) {
  const viewport = context.viewport || {};
  if (!viewport.width || !viewport.height) return null;
  const boxes = elements.map((element) => element.bounds).filter(Boolean);
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.right ?? box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.bottom ?? box.y + box.height));
  return {
    x: Math.max(0, (left / viewport.width) * 100),
    y: Math.max(0, (top / viewport.height) * 100),
    width: Math.min(100, ((right - left) / viewport.width) * 100),
    height: Math.min(100, ((bottom - top) / viewport.height) * 100)
  };
}

function detectedRegionBounds(region, context = {}) {
  const normalized = String(region || "").toLowerCase();
  const match = (context.detectedRegions || []).find((entry) => normalized.includes(String(entry.label || "").toLowerCase()));
  return match?.bounds || null;
}

function fallbackRegionBounds(region, context = {}) {
  const normalized = String(region || "").toLowerCase();
  const matchedRegion = detectedRegionBounds(region, context);
  if (matchedRegion) return matchedRegion;

  if (normalized.includes("type")) {
    return percentRectFromElements(context.textBlocks?.slice?.(0, 8) || [], context) || { x: 8, y: 12, width: 84, height: 48 };
  }

  if (normalized.includes("above") || normalized.includes("opening") || normalized.includes("header")) {
    return { x: 6, y: 6, width: 88, height: 42 };
  }

  if (normalized.includes("composition") || normalized.includes("layout") || normalized.includes("screenshot")) {
    return { x: 6, y: 8, width: 88, height: 84 };
  }

  return { x: 10, y: 14, width: 80, height: 64 };
}

function hashString(input) {
  const text = String(input || "");
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function sentence(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function arrayOfStrings(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const text = String(value || "").trim();
  return text ? [text] : [];
}

function suggestedPriority(severity) {
  if (severity === "critical") return "Block release until reviewed or intentionally accepted.";
  if (severity === "high") return "Prioritise before release for primary workflows or stakeholder-facing screens.";
  if (severity === "medium") return "Plan into the next design or implementation quality pass.";
  return "Address when touching this surface or when similar issues repeat.";
}

function defaultAcceptanceCriteria(config, copy) {
  return [
    "The affected region has been reviewed visually.",
    copy.recommendation || config.recommendation || "The recommendation has been considered.",
    "The change has been checked for readability, keyboard impact, and surrounding component consistency where relevant.",
    "The UI remains visually consistent with adjacent content and controls."
  ].filter(Boolean);
}

function markerSummary(issue) {
  const text = String(issue || "Review finding").replace(/\s+/g, " ").trim();
  if (text.length <= 52) return text;
  return `${text.slice(0, 49).trim()}...`;
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
  const regionBounds =
    config.regionBounds ||
    (config.element ? elementRegionBounds(config.element, context) : null) ||
    fallbackRegionBounds(region, context);
  const copy = professionalFindingCopy({
    issue: config.issue,
    evidence: config.evidence,
    impact: config.impact,
    recommendation: config.recommendation,
    region
  });
  const signature = [
    config.ruleId,
    config.category,
    region,
    selector,
    copy.issue,
    copy.evidence
  ].join("|");
  const category = config.category;
  const severity = config.severity;
  const bestPracticeReference = sentence(config.bestPracticeReference || BEST_PRACTICES[category]);
  const reviewRationale = sentence(
    config.reviewRationale ||
      `This reviewer note is based on visible evidence in ${region.toLowerCase()}: ${copy.evidence}`
  );
  const acceptanceCriteria = arrayOfStrings(config.acceptanceCriteria);

  return {
    id: `${config.ruleId}:${hashString(signature)}`,
    category,
    severity,
    region,
    issue: copy.issue,
    evidence: copy.evidence,
    impact: copy.impact,
    recommendation: copy.recommendation,
    bestPracticeReference,
    reviewRationale,
    affectedUsers: sentence(config.affectedUsers || AFFECTED_USERS[category]),
    suggestedPriority: sentence(config.suggestedPriority || suggestedPriority(severity)),
    markerSummary: sentence(config.markerSummary || markerSummary(copy.issue)),
    acceptanceCriteria: acceptanceCriteria.length ? acceptanceCriteria : defaultAcceptanceCriteria(config, copy),
    markerType: config.markerType || MARKER_TYPES[category] || "component-group",
    reviewPass: config.reviewPass || REVIEW_PASSES[category] || "synthesis",
    isSynthesisFinding: Boolean(config.isSynthesisFinding),
    synthesisType: config.synthesisType || "",
    confidence: Number(config.confidence),
    screenshotRef: context.screenshotRef,
    selector,
    source: config.source || "rule-engine",
    ...(config.evidenceType || config.evidence_type
      ? {
          evidenceType: config.evidenceType || config.evidence_type,
          evidence_type: config.evidence_type || config.evidenceType
        }
      : {}),
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
