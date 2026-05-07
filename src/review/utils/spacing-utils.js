export function gapBetween(a, b) {
  if (!a?.bounds || !b?.bounds) return null;
  const horizontalGap = Math.max(0, Math.max(a.bounds.x, b.bounds.x) - Math.min(a.bounds.right, b.bounds.right));
  const verticalGap = Math.max(0, Math.max(a.bounds.y, b.bounds.y) - Math.min(a.bounds.bottom, b.bounds.bottom));
  return Math.max(horizontalGap, verticalGap);
}

export function nearestSpacingToken(value, step = 8) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number / step) * step;
}

export function spacingScaleDeviation(value, step = 8) {
  const nearest = nearestSpacingToken(value, step);
  if (nearest === null) return null;
  return Math.abs(Number(value) - nearest);
}

export function isOnSpacingScale(value, { step = 8, tolerance = 2 } = {}) {
  const deviation = spacingScaleDeviation(value, step);
  return deviation !== null && deviation <= tolerance;
}

export function coefficientOfVariation(values = []) {
  const usable = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (usable.length < 2) return 0;
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const variance = usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / usable.length;
  return Math.sqrt(variance) / mean;
}

export function adjacentVerticalGaps(elements = []) {
  const sorted = elements
    .filter((element) => element.bounds)
    .slice()
    .sort((a, b) => a.bounds.y - b.bounds.y);
  const gaps = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index].bounds.y - sorted[index - 1].bounds.bottom;
    if (gap > 0 && gap < 160) gaps.push(gap);
  }
  return gaps;
}
