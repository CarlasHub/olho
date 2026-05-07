const NAMED_COLOURS = Object.freeze({
  black: "#000000",
  white: "#ffffff",
  transparent: "rgba(255, 255, 255, 0)"
});

function clampChannel(value) {
  return Math.min(255, Math.max(0, Number(value) || 0));
}

export function parseColour(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  const named = NAMED_COLOURS[value] || value;

  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(named)) {
    const hex = named.slice(1);
    const full = hex.length === 3 ? hex.split("").map((char) => `${char}${char}`).join("") : hex;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1
    };
  }

  const match = named.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(",").map((part) => part.trim());
  if (parts.length < 3) return null;
  return {
    r: clampChannel(parts[0]),
    g: clampChannel(parts[1]),
    b: clampChannel(parts[2]),
    a: parts[3] === undefined ? 1 : Math.min(1, Math.max(0, Number(parts[3]) || 0))
  };
}

function srgbToLinear(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(colour) {
  const parsed = typeof colour === "string" ? parseColour(colour) : colour;
  if (!parsed) return null;
  return 0.2126 * srgbToLinear(parsed.r) + 0.7152 * srgbToLinear(parsed.g) + 0.0722 * srgbToLinear(parsed.b);
}

export function contrastRatio(foreground, background) {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  if (fg === null || bg === null) return null;
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function colourDistance(a, b) {
  const first = parseColour(a);
  const second = parseColour(b);
  if (!first || !second) return null;
  return Math.sqrt((first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.b - second.b) ** 2);
}

export function isLowContrastRisk({ color, backgroundColor, fontSize = 16, fontWeight = "" } = {}) {
  const ratio = contrastRatio(color, backgroundColor);
  if (ratio === null) return false;
  const largeText = Number(fontSize) >= 24 || (Number(fontSize) >= 18.66 && Number(fontWeight) >= 700);
  return largeText ? ratio < 3 : ratio < 4.5;
}
