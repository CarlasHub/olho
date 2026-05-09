import { VISUAL_EVIDENCE_TYPES } from "./visual-analysis-schema.js";

function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

function boundsToPercent(bounds = {}, width = 1, height = 1) {
  return {
    x: round((Number(bounds.x || 0) / Math.max(1, width)) * 100),
    y: round((Number(bounds.y || 0) / Math.max(1, height)) * 100),
    width: round((Number(bounds.width || 0) / Math.max(1, width)) * 100),
    height: round((Number(bounds.height || 0) / Math.max(1, height)) * 100)
  };
}

function normalizeBounds(input = {}) {
  const box = input.boundingBox || input.bounds || input;
  const x = Number(box.x ?? box.left ?? 0);
  const y = Number(box.y ?? box.top ?? 0);
  const width = Number(box.width ?? (Number(box.right) - x) ?? 0);
  const height = Number(box.height ?? (Number(box.bottom) - y) ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function rectOverlapRatio(a = {}, b = {}) {
  const left = Math.max(Number(a.x || 0), Number(b.x || 0));
  const top = Math.max(Number(a.y || 0), Number(b.y || 0));
  const right = Math.min(Number(a.x || 0) + Number(a.width || 0), Number(b.x || 0) + Number(b.width || 0));
  const bottom = Math.min(Number(a.y || 0) + Number(a.height || 0), Number(b.y || 0) + Number(b.height || 0));
  const overlapWidth = Math.max(0, right - left);
  const overlapHeight = Math.max(0, bottom - top);
  const overlapArea = overlapWidth * overlapHeight;
  const aArea = Math.max(1, Number(a.width || 0) * Number(a.height || 0));
  return overlapArea / aArea;
}

function wcagAAResult(contrastRatio) {
  const ratio = Number(contrastRatio || 0);
  if (ratio >= 4.5) return "pass";
  if (ratio >= 3) return "large-text-risk";
  return "risk";
}

function contrastResultForTextRegion(region = {}, contrastRegions = []) {
  const candidates = contrastRegions
    .map((candidate) => ({
      candidate,
      overlap: rectOverlapRatio(region.percentBounds, candidate.bounds)
    }))
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || Number(a.candidate.contrastRatio || 0) - Number(b.candidate.contrastRatio || 0));
  const best = candidates[0]?.candidate;
  if (!best) return null;
  const ratio = Number(best.contrastRatio || 0);
  return {
    id: `ocr-contrast-${region.id}`,
    text: region.text,
    textRegionId: region.id,
    region: region.text ? `"${region.text.slice(0, 80)}"` : region.id,
    bounds: region.percentBounds,
    matchedRegion: best.region || "",
    foreground: best.foreground || "",
    background: best.background || "",
    contrastRatio: round(ratio, 2),
    wcagAAResult: wcagAAResult(ratio),
    evidence:
      `Local OCR detected text in this region and local pixel analysis measured approximately ${round(ratio, 2)}:1 foreground/background contrast.`,
    evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
  };
}

function ocrContrastResults(textRegions = [], analysis = {}) {
  const evidence = analysis.evidence || {};
  const contrastRegions = [
    ...(Array.isArray(evidence.localContrastGrid) ? evidence.localContrastGrid : []),
    ...(Array.isArray(evidence.contrastPairs) ? evidence.contrastPairs : [])
  ].filter((region) => region?.bounds && Number.isFinite(Number(region.contrastRatio)));

  if (!textRegions.length || !contrastRegions.length) return [];
  const seen = new Set();
  return textRegions
    .map((region) => contrastResultForTextRegion(region, contrastRegions))
    .filter(Boolean)
    .filter((result) => {
      const key = `${result.textRegionId}:${result.matchedRegion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}

export function normalizeOcrDetections(detections = [], { width = 0, height = 0 } = {}) {
  return (Array.isArray(detections) ? detections : [])
    .map((detection, index) => {
      const bounds = normalizeBounds(detection);
      const text = String(detection.rawValue || detection.text || detection.value || "").replace(/\s+/g, " ").trim();
      if (!bounds || !text) return null;
      return {
        id: `ocr-text-${index + 1}`,
        text: text.slice(0, 180),
        bounds,
        percentBounds: boundsToPercent(bounds, width, height),
        confidence: Number.isFinite(Number(detection.confidence)) ? Number(detection.confidence) : null,
        evidence_type: VISUAL_EVIDENCE_TYPES.MEASURED
      };
    })
    .filter(Boolean)
    .slice(0, 80);
}

export async function runOptionalLocalOcr({
  imageSource,
  width = 0,
  height = 0,
  textDetectorFactory = null
} = {}) {
  const Factory = textDetectorFactory || globalThis.TextDetector;
  if (typeof Factory !== "function") {
    return {
      available: false,
      provider: "",
      textRegions: [],
      reason: "Browser TextDetector OCR is unavailable in this runtime."
    };
  }

  try {
    const detector = new Factory();
    const detections = await detector.detect(imageSource);
    return {
      available: true,
      provider: "browser-textdetector",
      textRegions: normalizeOcrDetections(detections, { width, height }),
      reason: ""
    };
  } catch (error) {
    return {
      available: false,
      provider: "browser-textdetector",
      textRegions: [],
      reason: `Local OCR failed: ${String(error?.message || error)}`
    };
  }
}

export function attachOcrEvidence(analysis = {}, ocrResult = {}) {
  const textRegions = Array.isArray(ocrResult.textRegions) ? ocrResult.textRegions : [];
  const contrastResults = ocrContrastResults(textRegions, analysis);
  const lowContrastOcrRegions = contrastResults
    .filter((result) => Number(result.contrastRatio || 0) > 0 && Number(result.contrastRatio || 0) < 4.5)
    .map((result) => ({
      ...result,
      issue: "Measured low-contrast OCR text region detected from local pixel analysis."
    }));
  const limitations = (analysis.limitations || []).filter(
    (limitation) => !String(limitation).includes("Text-like regions are inferred")
  );
  if (!ocrResult.available) {
    limitations.push(ocrResult.reason || "Local OCR was unavailable; text-like regions remain pixel-inferred.");
  }

  return {
    ...analysis,
    evidence: {
      ...(analysis.evidence || {}),
      ocr: {
        available: Boolean(ocrResult.available),
        provider: ocrResult.provider || "",
        textRegionCount: textRegions.length,
        contrastMeasuredCount: contrastResults.length,
        lowContrastCount: lowContrastOcrRegions.length,
        reason: ocrResult.reason || ""
      },
      ocrTextRegions: textRegions,
      ocrContrastResults: contrastResults,
      lowContrastTextLikeRegions: [
        ...lowContrastOcrRegions,
        ...((analysis.evidence || {}).lowContrastTextLikeRegions || [])
      ].slice(0, 16)
    },
    limitations
  };
}
