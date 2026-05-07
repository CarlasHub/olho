export function parseCssLength(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const input = String(value || "").trim();
  const match = input.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function textLineLengthChars(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return 0;
  return Math.max(...lines.map((line) => line.length));
}

export function readableLineLengthRisk(text) {
  const length = textLineLengthChars(text);
  return length > 75 || (length > 0 && length < 20);
}

export function lineHeightRatio(element) {
  const fontSize = Number(element?.style?.fontSize || 0);
  const lineHeight = Number(element?.style?.lineHeightPx || 0);
  if (fontSize <= 0 || lineHeight <= 0) return null;
  return lineHeight / fontSize;
}

export function fontSizeSpread(textBlocks = []) {
  const sizes = textBlocks.map((element) => Number(element?.style?.fontSize || 0)).filter((value) => value > 0);
  if (!sizes.length) return { min: 0, max: 0, ratio: 0, unique: [] };
  const unique = [...new Set(sizes.map((value) => Math.round(value)))].sort((a, b) => a - b);
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  return {
    min,
    max,
    ratio: min > 0 ? max / min : 0,
    unique
  };
}
