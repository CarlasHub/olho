export const VISUAL_ANALYSIS_VERSION = "1.0.0-local";

export const VISUAL_EVIDENCE_TYPES = Object.freeze({
  MEASURED: "measured_evidence",
  MODEL_OBSERVATION: "model_observation",
  INFERRED: "inferred",
  HUMAN_REVIEW_NEEDED: "human_review_needed"
});

export const REVIEW_FINDING_EVIDENCE_TYPES = Object.freeze([
  "measured",
  "inferred",
  "model_observation",
  "human_review_needed"
]);

export function emptyVisualAnalysis({
  sourceType = "unknown",
  width = 0,
  height = 0,
  reason = "No image pixels were available for local visual analysis."
} = {}) {
  return {
    version: VISUAL_ANALYSIS_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      sourceType,
      width: Number(width || 0),
      height: Number(height || 0),
      originalPreserved: true,
      cropUsed: false,
      cropBounds: null
    },
    evidence: {
      imageMetadata: {
        width: Number(width || 0),
        height: Number(height || 0),
        analysedWidth: Number(width || 0),
        analysedHeight: Number(height || 0),
        sampleCount: 0
      },
      colourPalette: [],
      contrastPairs: [],
      localContrastGrid: [],
      lowContrastTextLikeRegions: [],
      ocr: {
        available: false,
        provider: "",
        textRegionCount: 0,
        reason: ""
      },
      ocrTextRegions: [],
      ocrContrastResults: [],
      layoutRegions: [],
      visualHierarchy: {
        focalPoints: [],
        competingFocalPointRisk: false,
        primaryActionDominance: "unknown",
        observations: []
      },
      spacingDensity: {
        crowdedRegions: [],
        denseClusterCount: 0,
        weakSpacingRisk: false,
        observations: []
      },
      alignment: {
        inconsistentAlignmentRisk: false,
        observations: []
      },
      repeatedColourUse: {
        accentColours: [],
        observations: []
      },
      ctaCandidates: []
    },
    processing: {
      canvasPipeline: true,
      openCv: {
        available: false,
        provider: "",
        reason: "OpenCV runtime was not used."
      }
    },
    modelObservations: [],
    limitations: [reason]
  };
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateVisualAnalysisPackage(packageValue) {
  const errors = [];
  if (!isObject(packageValue)) {
    return {
      valid: false,
      errors: ["Visual analysis package must be an object."]
    };
  }
  if (packageValue.version !== VISUAL_ANALYSIS_VERSION) {
    errors.push("Unsupported visual analysis package version.");
  }
  if (!isObject(packageValue.source)) {
    errors.push("Visual analysis package must include source metadata.");
  }
  if (!isObject(packageValue.evidence)) {
    errors.push("Visual analysis package must include evidence.");
  }
  if (!Array.isArray(packageValue.evidence?.colourPalette)) {
    errors.push("Visual analysis colourPalette must be an array.");
  }
  if (!Array.isArray(packageValue.evidence?.contrastPairs)) {
    errors.push("Visual analysis contrastPairs must be an array.");
  }
  if (!Array.isArray(packageValue.evidence?.localContrastGrid)) {
    errors.push("Visual analysis localContrastGrid must be an array.");
  }
  if (!Array.isArray(packageValue.evidence?.ocrContrastResults)) {
    errors.push("Visual analysis ocrContrastResults must be an array.");
  }
  if (!Array.isArray(packageValue.evidence?.layoutRegions)) {
    errors.push("Visual analysis layoutRegions must be an array.");
  }
  if (!Array.isArray(packageValue.evidence?.ocrTextRegions)) {
    errors.push("Visual analysis ocrTextRegions must be an array.");
  }
  if (!Array.isArray(packageValue.modelObservations)) {
    errors.push("Visual analysis modelObservations must be an array.");
  }
  if (!Array.isArray(packageValue.limitations)) {
    errors.push("Visual analysis limitations must be an array.");
  }
  return {
    valid: errors.length === 0,
    errors
  };
}
