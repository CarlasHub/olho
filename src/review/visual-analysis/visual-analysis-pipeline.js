import { contrastRatio, relativeLuminance } from "../utils/colour-utils.js";
import { emptyVisualAnalysis, VISUAL_ANALYSIS_VERSION, VISUAL_EVIDENCE_TYPES } from "./visual-analysis-schema.js";
import { attachOcrEvidence, runOptionalLocalOcr } from "./local-ocr.js";
import { detectLocalOpenCvRuntime } from "./opencv-adapter.js";

const DEFAULT_GRID_COLUMNS = 12;
const DEFAULT_GRID_ROWS = 8;
const MAX_SAMPLE_PIXELS = 14000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function colourKey({ r, g, b }, bucket = 32) {
  return [r, g, b].map((channel) => clamp(Math.round(channel / bucket) * bucket, 0, 255)).join(",");
}

function parseColourKey(key) {
  const [r, g, b] = String(key).split(",").map(Number);
  return { r, g, b };
}

function luminanceForRgb(rgb) {
  return relativeLuminance(rgb) ?? 0;
}

function pixelAt(data, width, x, y) {
  const index = (y * width + x) * 4;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
    a: data[index + 3]
  };
}

function grey(pixel) {
  return Math.round(0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b);
}

function saturation(pixel) {
  const max = Math.max(pixel.r, pixel.g, pixel.b) / 255;
  const min = Math.min(pixel.r, pixel.g, pixel.b) / 255;
  if (max === 0) return 0;
  return (max - min) / max;
}

function boundsToPercent(bounds = {}, width = 1, height = 1) {
  return {
    x: round((Number(bounds.x || 0) / width) * 100, 3),
    y: round((Number(bounds.y || 0) / height) * 100, 3),
    width: round((Number(bounds.width || 0) / width) * 100, 3),
    height: round((Number(bounds.height || 0) / height) * 100, 3)
  };
}

function normalizeSource({ width, height, sourceType, target, crop }) {
  return {
    sourceType: String(sourceType || "unknown"),
    width,
    height,
    originalPreserved: true,
    cropUsed: Boolean(crop?.used),
    cropBounds: crop?.bounds || null,
    targetType: target?.type || "",
    targetConfidence: Number(target?.confidence || 0)
  };
}

function normalizeImageDataInput({ imageData, width, height } = {}) {
  const data = imageData?.data || imageData;
  const resolvedWidth = Number(width || imageData?.width || 0);
  const resolvedHeight = Number(height || imageData?.height || 0);
  if (!data || !resolvedWidth || !resolvedHeight) return null;
  return {
    data,
    width: resolvedWidth,
    height: resolvedHeight
  };
}

function cropImageData({ data, width, height }, cropBounds = null, viewport = null) {
  if (!cropBounds?.width || !cropBounds?.height) {
    return {
      data,
      width,
      height,
      crop: { used: false, reason: "Full image analysed.", bounds: null }
    };
  }

  const scaleX = viewport?.width ? width / Number(viewport.width) : 1;
  const scaleY = viewport?.height ? height / Number(viewport.height) : 1;
  const x = clamp(Math.round(Number(cropBounds.x || 0) * scaleX), 0, width - 1);
  const y = clamp(Math.round(Number(cropBounds.y || 0) * scaleY), 0, height - 1);
  const cropWidth = clamp(Math.round(Number(cropBounds.width || 0) * scaleX), 1, width - x);
  const cropHeight = clamp(Math.round(Number(cropBounds.height || 0) * scaleY), 1, height - y);
  const cropped = new Uint8ClampedArray(cropWidth * cropHeight * 4);

  for (let row = 0; row < cropHeight; row += 1) {
    const sourceStart = ((y + row) * width + x) * 4;
    const sourceEnd = sourceStart + cropWidth * 4;
    cropped.set(data.slice(sourceStart, sourceEnd), row * cropWidth * 4);
  }

  return {
    data: cropped,
    width: cropWidth,
    height: cropHeight,
    crop: {
      used: true,
      reason: "Analysed selected review target crop.",
      bounds: {
        x,
        y,
        width: cropWidth,
        height: cropHeight
      }
    }
  };
}

function samplePixels(data, width, height, maxSamples = MAX_SAMPLE_PIXELS) {
  const totalPixels = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(totalPixels / maxSamples)));
  const samples = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const pixel = pixelAt(data, width, x, y);
      if (pixel.a < 16) continue;
      samples.push({
        ...pixel,
        x,
        y,
        grey: grey(pixel),
        luminance: luminanceForRgb(pixel),
        saturation: saturation(pixel)
      });
    }
  }
  return samples;
}

function dominantColours(samples = []) {
  const buckets = new Map();
  samples.forEach((pixel) => {
    const key = colourKey(pixel);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => {
      const rgb = parseColourKey(key);
      return {
        hex: rgbToHex(rgb),
        rgb,
        coverage: round(count / Math.max(1, samples.length), 4),
        evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
      };
    });
}

function buildTiles({ data, width, height, columns = DEFAULT_GRID_COLUMNS, rows = DEFAULT_GRID_ROWS }) {
  const tileWidth = Math.max(1, Math.floor(width / columns));
  const tileHeight = Math.max(1, Math.floor(height / rows));
  const tiles = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * tileWidth;
      const y = row * tileHeight;
      const w = column === columns - 1 ? width - x : tileWidth;
      const h = row === rows - 1 ? height - y : tileHeight;
      let count = 0;
      let greySum = 0;
      let greyMin = 255;
      let greyMax = 0;
      let saturationSum = 0;
      let edgeCount = 0;
      const colourBuckets = new Map();

      const sampleStep = Math.max(1, Math.floor(Math.sqrt((w * h) / 120)));
      for (let py = y; py < y + h; py += sampleStep) {
        for (let px = x; px < x + w; px += sampleStep) {
          const pixel = pixelAt(data, width, px, py);
          if (pixel.a < 16) continue;
          const pixelGrey = grey(pixel);
          const right = px + sampleStep < width ? grey(pixelAt(data, width, px + sampleStep, py)) : pixelGrey;
          const down = py + sampleStep < height ? grey(pixelAt(data, width, px, py + sampleStep)) : pixelGrey;
          if (Math.abs(pixelGrey - right) > 28 || Math.abs(pixelGrey - down) > 28) edgeCount += 1;
          greySum += pixelGrey;
          greyMin = Math.min(greyMin, pixelGrey);
          greyMax = Math.max(greyMax, pixelGrey);
          saturationSum += saturation(pixel);
          const key = colourKey(pixel);
          colourBuckets.set(key, (colourBuckets.get(key) || 0) + 1);
          count += 1;
        }
      }

      const sortedColours = [...colourBuckets.entries()].sort((a, b) => b[1] - a[1]);
      const light = sortedColours
        .map(([key]) => parseColourKey(key))
        .sort((a, b) => luminanceForRgb(b) - luminanceForRgb(a))[0] || { r: 255, g: 255, b: 255 };
      const dark = sortedColours
        .map(([key]) => parseColourKey(key))
        .sort((a, b) => luminanceForRgb(a) - luminanceForRgb(b))[0] || { r: 0, g: 0, b: 0 };
      const contrast = contrastRatio(dark, light) || 1;
      const edgeDensity = count ? edgeCount / count : 0;
      const greyRange = greyMax - greyMin;
      const averageSaturation = count ? saturationSum / count : 0;
      const salience = round(Math.min(1, edgeDensity * 1.6 + greyRange / 255 * 0.55 + averageSaturation * 0.32), 4);

      tiles.push({
        id: `tile-${row}-${column}`,
        row,
        column,
        bounds: { x, y, width: w, height: h },
        percentBounds: boundsToPercent({ x, y, width: w, height: h }, width, height),
        averageGrey: count ? greySum / count : 0,
        greyRange,
        edgeDensity: round(edgeDensity, 4),
        averageSaturation: round(averageSaturation, 4),
        dominantLight: rgbToHex(light),
        dominantDark: rgbToHex(dark),
        contrastRatio: round(contrast, 2),
        salience
      });
    }
  }

  return tiles;
}

function contrastPairsFromTiles(tiles = []) {
  const candidates = tiles
    .filter((tile) => tile.greyRange >= 18 && tile.edgeDensity >= 0.025)
    .sort((a, b) => a.contrastRatio - b.contrastRatio || b.edgeDensity - a.edgeDensity);
  const selected = new Map();
  [...candidates.slice(0, 8), ...candidates.slice().sort((a, b) => b.contrastRatio - a.contrastRatio).slice(0, 4)].forEach((tile) => {
    selected.set(tile.id, tile);
  });
  return [...selected.values()].slice(0, 12).map((tile) => ({
      region: tile.id,
      foreground: tile.dominantDark,
      background: tile.dominantLight,
      contrastRatio: tile.contrastRatio,
      wcagAAResult: tile.contrastRatio >= 4.5 ? "pass" : tile.contrastRatio >= 3 ? "large-text-risk" : "risk",
      bounds: tile.percentBounds,
      evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
    }));
}

function localContrastGridFromTiles(tiles = []) {
  return tiles.map((tile) => ({
    region: tile.id,
    bounds: tile.percentBounds,
    foreground: tile.dominantDark,
    background: tile.dominantLight,
    contrastRatio: tile.contrastRatio,
    edgeDensity: tile.edgeDensity,
    greyRange: tile.greyRange,
    salience: tile.salience,
    wcagAAResult: tile.contrastRatio >= 4.5 ? "pass" : tile.contrastRatio >= 3 ? "large-text-risk" : "risk",
    evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
  }));
}

function lowContrastTextLikeRegions(tiles = []) {
  return tiles
    .filter((tile) => {
      const textLikeEdges = tile.edgeDensity >= 0.035 && tile.edgeDensity <= 0.55;
      const enoughDetail = tile.greyRange >= 16;
      return textLikeEdges && enoughDetail && tile.contrastRatio < 4.5;
    })
    .sort((a, b) => a.contrastRatio - b.contrastRatio)
    .slice(0, 8)
    .map((tile) => ({
      region: tile.id,
      bounds: tile.percentBounds,
      contrastRatio: tile.contrastRatio,
      issue: "Potential low-contrast text-like detail detected from local pixel analysis.",
      evidence:
        `The region has text-like edge density (${round(tile.edgeDensity, 3)}) but measured local foreground/background contrast is approximately ${tile.contrastRatio}:1.`,
      evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
    }));
}

function layoutRegionsFromTiles(tiles = [], width, height) {
  const rows = new Map();
  tiles.forEach((tile) => {
    const current = rows.get(tile.row) || {
      row: tile.row,
      salience: 0,
      edgeDensity: 0,
      count: 0
    };
    current.salience += tile.salience;
    current.edgeDensity += tile.edgeDensity;
    current.count += 1;
    rows.set(tile.row, current);
  });

  const rowSummaries = [...rows.values()].map((row) => ({
    ...row,
    salience: row.salience / Math.max(1, row.count),
    edgeDensity: row.edgeDensity / Math.max(1, row.count)
  }));
  const activeRows = rowSummaries.filter((row) => row.salience > 0.18 || row.edgeDensity > 0.07);
  const regions = [];
  let current = null;

  activeRows.forEach((row) => {
    if (!current || row.row > current.endRow + 1) {
      current = {
        startRow: row.row,
        endRow: row.row,
        salience: row.salience,
        edgeDensity: row.edgeDensity,
        count: 1
      };
      regions.push(current);
      return;
    }
    current.endRow = row.row;
    current.salience += row.salience;
    current.edgeDensity += row.edgeDensity;
    current.count += 1;
  });

  return regions.slice(0, 8).map((region, index) => {
    const y = (region.startRow / DEFAULT_GRID_ROWS) * height;
    const h = ((region.endRow - region.startRow + 1) / DEFAULT_GRID_ROWS) * height;
    return {
      id: `visual-region-${index + 1}`,
      type: index === 0 ? "top content band" : "content band",
      bounds: boundsToPercent({ x: 0, y, width, height: h }, width, height),
      averageSalience: round(region.salience / Math.max(1, region.count), 3),
      averageEdgeDensity: round(region.edgeDensity / Math.max(1, region.count), 3),
      evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
    };
  });
}

function highSalienceComponents(tiles = []) {
  return tiles
    .filter((tile) => tile.salience > 0.42)
    .sort((a, b) => b.salience - a.salience)
    .slice(0, 10);
}

function visualHierarchy(tiles = []) {
  const focalTiles = highSalienceComponents(tiles);
  const strongest = focalTiles[0];
  const second = focalTiles[1];
  const competing =
    focalTiles.length >= 4 ||
    Boolean(strongest && second && strongest.salience < second.salience * 1.22);
  return {
    focalPoints: focalTiles.slice(0, 6).map((tile) => ({
      region: tile.id,
      bounds: tile.percentBounds,
      salience: tile.salience,
      contrastRatio: tile.contrastRatio,
      evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
    })),
    competingFocalPointRisk: competing,
    primaryActionDominance:
      strongest && second ? (strongest.salience >= second.salience * 1.25 ? "dominant" : "competing") : "unknown",
    observations: competing
      ? [
          {
            issue: "Multiple high-salience areas may compete for initial attention.",
            evidence: `${focalTiles.length} high-salience region(s) were detected with similar local contrast/detail strength.`,
            evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
          }
        ]
      : []
  };
}

function spacingDensity(tiles = []) {
  const crowded = tiles
    .filter((tile) => tile.edgeDensity > 0.19 && tile.salience > 0.34)
    .sort((a, b) => b.edgeDensity - a.edgeDensity)
    .slice(0, 8)
    .map((tile) => ({
      region: tile.id,
      bounds: tile.percentBounds,
      edgeDensity: tile.edgeDensity,
      salience: tile.salience,
      evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
    }));
  return {
    crowdedRegions: crowded,
    denseClusterCount: crowded.length,
    weakSpacingRisk: crowded.length >= 3,
    observations: crowded.length >= 3
      ? [
          {
            issue: "Several regions show dense local detail and edge activity.",
            evidence: `${crowded.length} tile region(s) crossed the crowded-detail threshold.`,
            evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
          }
        ]
      : []
  };
}

function alignment(tiles = []) {
  const salient = highSalienceComponents(tiles);
  const columns = salient.map((tile) => tile.column);
  const uniqueColumns = new Set(columns);
  const inconsistent = salient.length >= 5 && uniqueColumns.size >= Math.min(5, salient.length);
  return {
    inconsistentAlignmentRisk: inconsistent,
    observations: inconsistent
      ? [
          {
            issue: "High-emphasis areas appear distributed across many grid columns.",
            evidence: `${salient.length} salient regions span ${uniqueColumns.size} coarse columns, which can indicate weak alignment rhythm.`,
            evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
          }
        ]
      : []
  };
}

function repeatedColourUse(palette = []) {
  const accentColours = palette.filter((colour) => {
    const { r, g, b } = colour.rgb || {};
    const sat = saturation({ r, g, b });
    return sat > 0.34 && colour.coverage > 0.015;
  });
  return {
    accentColours: accentColours.slice(0, 6),
    observations: accentColours.length > 4
      ? [
          {
            issue: "Several accent colours appear with meaningful coverage.",
            evidence: `${accentColours.length} saturated colours appear in the local palette, which may create competing emphasis if all are action/status colours.`,
            evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
          }
        ]
      : []
  };
}

function ctaCandidates(tiles = []) {
  return tiles
    .filter((tile) => tile.averageSaturation > 0.22 && tile.contrastRatio >= 2.4 && tile.salience > 0.25)
    .sort((a, b) => b.salience - a.salience)
    .slice(0, 6)
    .map((tile, index) => ({
      id: `cta-like-${index + 1}`,
      region: tile.id,
      bounds: tile.percentBounds,
      confidence: round(Math.min(0.88, tile.salience * 0.82 + tile.averageSaturation * 0.4), 2),
      evidence: "Saturated, locally contrasted rectangular tile that may represent a visually emphatic action or status region.",
      evidence_type: VISUAL_EVIDENCE_TYPES.INFERRED
    }));
}

export function runLocalVisualAnalysis({
  imageData,
  width,
  height,
  sourceType = "unknown",
  target = null,
  cropBounds = null,
  viewport = null,
  maxSamplePixels = MAX_SAMPLE_PIXELS
} = {}) {
  const normalized = normalizeImageDataInput({ imageData, width, height });
  if (!normalized) {
    return emptyVisualAnalysis({ sourceType, width, height });
  }

  const cropped = cropImageData(normalized, cropBounds, viewport);
  const samples = samplePixels(cropped.data, cropped.width, cropped.height, maxSamplePixels);
  if (!samples.length) {
    return emptyVisualAnalysis({
      sourceType,
      width: normalized.width,
      height: normalized.height,
      reason: "No opaque pixels were available for local visual analysis."
    });
  }

  const palette = dominantColours(samples);
  const tiles = buildTiles(cropped);
  const contrastPairs = contrastPairsFromTiles(tiles);
  const localContrastGrid = localContrastGridFromTiles(tiles);
  const lowContrastRegions = lowContrastTextLikeRegions(tiles);
  const layoutRegions = layoutRegionsFromTiles(tiles, cropped.width, cropped.height);
  const hierarchy = visualHierarchy(tiles);
  const density = spacingDensity(tiles);
  const alignmentEvidence = alignment(tiles);
  const repeated = repeatedColourUse(palette);
  const ctas = ctaCandidates(tiles);

  return {
    version: VISUAL_ANALYSIS_VERSION,
    generatedAt: new Date().toISOString(),
    source: normalizeSource({
      sourceType,
      width: normalized.width,
      height: normalized.height,
      target,
      crop: cropped.crop
    }),
    evidence: {
      imageMetadata: {
        width: normalized.width,
        height: normalized.height,
        analysedWidth: cropped.width,
        analysedHeight: cropped.height,
        sampleCount: samples.length
      },
      colourPalette: palette,
      contrastPairs,
      localContrastGrid,
      lowContrastTextLikeRegions: lowContrastRegions,
      ocr: {
        available: false,
        provider: "",
        textRegionCount: 0,
        reason: "OCR was not requested for this synchronous analysis run."
      },
      ocrTextRegions: [],
      ocrContrastResults: [],
      layoutRegions,
      visualHierarchy: hierarchy,
      spacingDensity: density,
      alignment: alignmentEvidence,
      repeatedColourUse: repeated,
      ctaCandidates: ctas
    },
    processing: {
      canvasPipeline: true,
      openCv: detectLocalOpenCvRuntime()
    },
    modelObservations: [],
    limitations: [
      "Pixel analysis is local and deterministic, but it cannot identify DOM semantics, true text content, keyboard behavior, or hidden interaction states.",
      "Text-like regions are inferred from local edge/detail patterns unless OCR metadata is available.",
      "WCAG failure language is allowed only for measured contrast pairs, not for visual guesses."
    ]
  };
}

async function withOptionalOcr(
  analysis,
  imageSource,
  { enableOcr = true, textDetectorFactory = null, ocrWidth = null, ocrHeight = null } = {}
) {
  if (!enableOcr) return analysis;
  const metadata = analysis.evidence?.imageMetadata || {};
  const ocrResult = await runOptionalLocalOcr({
    imageSource,
    width: ocrWidth || metadata.analysedWidth || metadata.width || 0,
    height: ocrHeight || metadata.analysedHeight || metadata.height || 0,
    textDetectorFactory
  });
  return attachOcrEvidence(analysis, ocrResult);
}

function canvasForSize(width, height) {
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function imageDataFromDrawable(drawable, width, height) {
  const canvas = canvasForSize(width, height);
  const context = canvas?.getContext?.("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(drawable, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function scaledCropForDrawable(width, height, cropBounds = null, viewport = null) {
  if (!cropBounds?.width || !cropBounds?.height) return null;
  const scaleX = viewport?.width ? width / Number(viewport.width) : 1;
  const scaleY = viewport?.height ? height / Number(viewport.height) : 1;
  const x = clamp(Math.round(Number(cropBounds.x || 0) * scaleX), 0, width - 1);
  const y = clamp(Math.round(Number(cropBounds.y || 0) * scaleY), 0, height - 1);
  return {
    x,
    y,
    width: clamp(Math.round(Number(cropBounds.width || 0) * scaleX), 1, width - x),
    height: clamp(Math.round(Number(cropBounds.height || 0) * scaleY), 1, height - y)
  };
}

function ocrSourceFromDrawable(drawable, width, height, options = {}) {
  const crop = scaledCropForDrawable(width, height, options.cropBounds, options.viewport);
  if (!crop) return { imageSource: drawable, width, height };
  const canvas = canvasForSize(crop.width, crop.height);
  const context = canvas?.getContext?.("2d", { willReadFrequently: true });
  if (!context) return { imageSource: drawable, width, height };
  context.drawImage(drawable, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return {
    imageSource: canvas,
    width: crop.width,
    height: crop.height
  };
}

export async function runLocalVisualAnalysisFromBlob(blob, options = {}) {
  if (!blob) return emptyVisualAnalysis(options);
  if (typeof createImageBitmap !== "function") {
    return emptyVisualAnalysis({
      ...options,
      reason: "Browser image decoding APIs were unavailable for local visual analysis."
    });
  }
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
    const imageData = imageDataFromDrawable(bitmap, bitmap.width, bitmap.height);
    const analysis = runLocalVisualAnalysis({
      ...options,
      imageData,
      width: bitmap.width,
      height: bitmap.height
    });
    const ocrSource = ocrSourceFromDrawable(bitmap, bitmap.width, bitmap.height, options);
    return withOptionalOcr(analysis, ocrSource.imageSource, {
      ...options,
      ocrWidth: ocrSource.width,
      ocrHeight: ocrSource.height
    });
  } catch (error) {
    return emptyVisualAnalysis({
      ...options,
      reason: `Local visual analysis could not read screenshot pixels: ${String(error?.message || error)}`
    });
  } finally {
    bitmap?.close?.();
  }
}

export async function runLocalVisualAnalysisFromImageElement(imageElement, options = {}) {
  const width = Number(imageElement?.naturalWidth || imageElement?.width || 0);
  const height = Number(imageElement?.naturalHeight || imageElement?.height || 0);
  if (!imageElement || !width || !height) {
    return emptyVisualAnalysis(options);
  }
  try {
    const imageData = imageDataFromDrawable(imageElement, width, height);
    const analysis = runLocalVisualAnalysis({
      ...options,
      imageData,
      width,
      height
    });
    const ocrSource = ocrSourceFromDrawable(imageElement, width, height, options);
    return withOptionalOcr(analysis, ocrSource.imageSource, {
      ...options,
      ocrWidth: ocrSource.width,
      ocrHeight: ocrSource.height
    });
  } catch (error) {
    return emptyVisualAnalysis({
      ...options,
      width,
      height,
      reason: `Local visual analysis could not read screenshot pixels: ${String(error?.message || error)}`
    });
  }
}
