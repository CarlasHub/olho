import test from "node:test";
import assert from "node:assert/strict";

import { runLocalVisualAnalysis } from "../src/review/visual-analysis/visual-analysis-pipeline.js";
import { validateVisualAnalysisPackage } from "../src/review/visual-analysis/visual-analysis-schema.js";
import { attachOcrEvidence, runOptionalLocalOcr } from "../src/review/visual-analysis/local-ocr.js";
import { createOpenCvAdapter, detectLocalOpenCvRuntime } from "../src/review/visual-analysis/opencv-adapter.js";
import { buildStaticDesignContextPackage } from "../src/review/ai/context/static-design-context-package.js";
import { compressOllamaDesignContext } from "../src/review/ai/context/ollama-design-context-compressor.js";
import { buildOllamaFinalSynthesisPrompt } from "../src/review/ai/prompts/ollama/ollama-final-synthesis-prompt.js";

function createPixels(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = fill(x, y);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }
  return {
    data,
    width,
    height
  };
}

test("local visual analysis extracts dominant colours from screenshot pixels", () => {
  const imageData = createPixels(100, 100, (x) => (x < 70 ? [255, 0, 0] : [0, 0, 255]));
  const analysis = runLocalVisualAnalysis({
    imageData,
    sourceType: "static-design"
  });

  assert.equal(validateVisualAnalysisPackage(analysis).valid, true);
  assert.equal(analysis.source.originalPreserved, true);
  assert.equal(analysis.evidence.colourPalette[0].hex, "#ff0000");
  assert.equal(analysis.evidence.colourPalette[0].coverage > 0.6, true);
  assert.equal(analysis.evidence.colourPalette.some((colour) => colour.hex === "#0000ff"), true);
});

test("local visual analysis records measured contrast pairs and low-contrast text-like regions", () => {
  const imageData = createPixels(96, 96, (x, y) => {
    if (x < 48 && y < 48) return x % 4 < 2 ? [0, 0, 0] : [255, 255, 255];
    if (x >= 48 && y < 48) return x % 4 < 2 ? [170, 170, 170] : [255, 255, 255];
    return [248, 250, 252];
  });
  const analysis = runLocalVisualAnalysis({
    imageData,
    sourceType: "static-design"
  });

  assert.equal(analysis.evidence.contrastPairs.some((pair) => pair.contrastRatio >= 20), true);
  assert.equal(analysis.evidence.localContrastGrid.length, 96);
  assert.equal(analysis.evidence.lowContrastTextLikeRegions.length > 0, true);
  assert.equal(
    analysis.evidence.lowContrastTextLikeRegions.every((region) => region.evidence_type === "measured_evidence"),
    true
  );
});

test("local visual analysis detects hierarchy, density, layout, and CTA-like evidence as structured JSON", () => {
  const imageData = createPixels(160, 120, (x, y) => {
    if (y < 38 && x > 18 && x < 142) return [17, 24, 39];
    if (y > 68 && y < 92 && x > 96 && x < 150) return [220, 38, 38];
    if (x % 8 < 3 && y % 8 < 3) return [80, 90, 110];
    return [245, 247, 250];
  });
  const analysis = runLocalVisualAnalysis({
    imageData,
    sourceType: "figma-capture"
  });

  assert.equal(analysis.evidence.layoutRegions.length > 0, true);
  assert.equal(Array.isArray(analysis.evidence.visualHierarchy.focalPoints), true);
  assert.equal(Array.isArray(analysis.evidence.ctaCandidates), true);
  assert.equal(typeof analysis.evidence.spacingDensity.denseClusterCount, "number");
});

test("Ollama static design context includes local visual-analysis evidence", () => {
  const imageData = createPixels(80, 60, (x) => (x < 50 ? [255, 255, 255] : [15, 118, 110]));
  const visualAnalysis = runLocalVisualAnalysis({
    imageData,
    sourceType: "zeplin-capture"
  });
  const contextPackage = buildStaticDesignContextPackage({
    session: {
      screenshotRef: "media:test",
      media: { width: 80, height: 60 },
      reviewTarget: {
        type: "central-design-artboard",
        label: "Central artboard",
        bounds: { x: 0, y: 0, width: 80, height: 60 },
        confidence: 0.9,
        excludesPageChrome: true
      }
    },
    reviewContext: {
      sourceType: "zeplin-capture",
      viewport: { width: 80, height: 60 },
      image: { width: 80, height: 60 },
      elements: [],
      visualAnalysis
    },
    deterministicFindings: []
  });
  const compressed = compressOllamaDesignContext(contextPackage);
  const prompt = buildOllamaFinalSynthesisPrompt({
    compressedContext: compressed,
    candidateFindings: []
  });

  assert.equal(Boolean(contextPackage.localVisualAnalysis), true);
  assert.equal(compressed.localVisualAnalysis.colourPalette.length > 0, true);
  assert.equal(prompt.includes("localVisualAnalysis"), true);
  assert.equal(prompt.includes("measured"), true);
  assert.equal(prompt.includes("Ollama must reason over the structured evidence package"), true);
});

test("optional local OCR attaches measured text regions when browser OCR is available", async () => {
  class FakeTextDetector {
    async detect() {
      return [
        {
          rawValue: "Primary CTA",
          boundingBox: { x: 12, y: 20, width: 80, height: 18 },
          confidence: 0.91
        }
      ];
    }
  }

  const ocr = await runOptionalLocalOcr({
    imageSource: {},
    width: 200,
    height: 100,
    textDetectorFactory: FakeTextDetector
  });
  const analysis = runLocalVisualAnalysis({
    imageData: createPixels(200, 100, () => [255, 255, 255]),
    sourceType: "static-design"
  });
  const withOcr = attachOcrEvidence(analysis, ocr);

  assert.equal(ocr.available, true);
  assert.equal(withOcr.evidence.ocr.provider, "browser-textdetector");
  assert.equal(withOcr.evidence.ocrTextRegions[0].text, "Primary CTA");
  assert.equal(withOcr.evidence.ocrTextRegions[0].evidence_type, "measured_evidence");
  assert.equal(validateVisualAnalysisPackage(withOcr).valid, true);
});

test("optional local OCR attaches measured contrast evidence to detected text regions", async () => {
  class FakeTextDetector {
    async detect() {
      return [
        {
          rawValue: "Muted hero copy",
          boundingBox: { x: 4, y: 4, width: 40, height: 28 },
          confidence: 0.88
        }
      ];
    }
  }

  const imageData = createPixels(96, 96, (x, y) => {
    if (x < 48 && y < 48) return x % 4 < 2 ? [170, 170, 170] : [255, 255, 255];
    return [248, 250, 252];
  });
  const analysis = runLocalVisualAnalysis({
    imageData,
    sourceType: "static-design"
  });
  const ocr = await runOptionalLocalOcr({
    imageSource: {},
    width: 96,
    height: 96,
    textDetectorFactory: FakeTextDetector
  });
  const withOcr = attachOcrEvidence(analysis, ocr);

  assert.equal(withOcr.evidence.ocrContrastResults.length > 0, true);
  assert.equal(withOcr.evidence.ocrContrastResults[0].evidence_type, "measured_evidence");
  assert.equal(withOcr.evidence.ocrContrastResults[0].contrastRatio < 4.5, true);
  assert.equal(withOcr.evidence.ocr.lowContrastCount >= 1, true);
  assert.equal(
    withOcr.evidence.lowContrastTextLikeRegions.some((region) => region.textRegionId === "ocr-text-1"),
    true
  );
  assert.equal(validateVisualAnalysisPackage(withOcr).valid, true);
});

test("OpenCV adapter reports local runtime availability without adding a mandatory dependency", () => {
  const unavailable = detectLocalOpenCvRuntime(null);
  const available = createOpenCvAdapter({ Mat: function Mat() {} }).analyse();

  assert.equal(unavailable.available, false);
  assert.equal(unavailable.reason.includes("Canvas/ImageData"), true);
  assert.equal(available.available, true);
  assert.equal(available.provider, "opencv-js-local");
});
