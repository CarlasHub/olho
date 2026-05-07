import { coefficientOfVariation } from "./spacing-utils.js";

export function alignmentSpread(elements = [], axis = "x") {
  const values = elements
    .map((element) => element.bounds?.[axis])
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number);
  if (values.length < 2) return 0;
  return Math.max(...values) - Math.min(...values);
}

export function proximityGroups(elements = [], maxGap = 24) {
  const sorted = elements
    .filter((element) => element.bounds)
    .slice()
    .sort((a, b) => a.bounds.y - b.bounds.y);
  const groups = [];
  let current = [];
  sorted.forEach((element) => {
    const previous = current[current.length - 1];
    if (!previous || element.bounds.y - previous.bounds.bottom <= maxGap) {
      current.push(element);
      return;
    }
    groups.push(current);
    current = [element];
  });
  if (current.length) groups.push(current);
  return groups;
}

export function rhythmInstability(gaps = []) {
  return coefficientOfVariation(gaps);
}
