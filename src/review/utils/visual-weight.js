import { contrastRatio } from "./colour-utils.js";

function elevationScore(style = {}) {
  const shadow = String(style.boxShadow || "").toLowerCase();
  if (!shadow || shadow === "none") return 0;
  const blurMatches = Array.from(shadow.matchAll(/(-?\d+(\.\d+)?)px/g)).map((match) => Number(match[1]));
  const blur = blurMatches.length ? Math.max(...blurMatches) : 0;
  return Math.min(1, blur / 32);
}

function areaScore(element, viewport) {
  if (!element?.bounds || !viewport?.width || !viewport?.height) return 0;
  const viewportArea = viewport.width * viewport.height;
  return Math.min(1, (element.bounds.width * element.bounds.height) / Math.max(1, viewportArea) * 12);
}

function contrastScore(element) {
  const ratio =
    element?.style?.contrast ??
    contrastRatio(element?.style?.color || "", element?.style?.backgroundColor || "");
  if (!ratio) return 0.2;
  return Math.min(1, ratio / 7);
}

function positionScore(element, viewport) {
  if (!element?.bounds || !viewport?.height) return 0.5;
  const centerY = element.bounds.y + element.bounds.height / 2;
  return Math.max(0.2, 1 - centerY / Math.max(1, viewport.height) * 0.55);
}

function typeScore(element) {
  const fontSize = Number(element?.style?.fontSize || 0);
  const weight = Number(element?.style?.fontWeight || 400);
  return Math.min(1, fontSize / 28) * 0.7 + Math.min(1, weight / 800) * 0.3;
}

export function visualWeight(element, context = {}) {
  const viewport = context.viewport || {};
  const score =
    areaScore(element, viewport) * 0.28 +
    contrastScore(element) * 0.22 +
    typeScore(element) * 0.18 +
    elevationScore(element?.style) * 0.16 +
    positionScore(element, viewport) * 0.16;
  return Number(score.toFixed(4));
}

export function rankByVisualWeight(elements = [], context = {}) {
  return elements
    .map((element) => ({
      element,
      weight: visualWeight(element, context)
    }))
    .sort((a, b) => b.weight - a.weight);
}

export function visualWeightRatio(a, b, context = {}) {
  const first = visualWeight(a, context);
  const second = visualWeight(b, context);
  if (!first || !second) return 0;
  return Math.max(first, second) / Math.min(first, second);
}
