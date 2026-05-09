export const LOCAL_VISION_MODEL_VERSION = "1.0.0-local";
export const LOCAL_VISION_MODEL_SOURCE = "local-vision-model";
export const LOCAL_VISION_MODEL_ARCHITECTURES = Object.freeze(["vlm", "vit", "unknown"]);

function text(value, max = 260) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3).trim()}...` : normalized;
}

function confidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.6;
  return Math.max(0, Math.min(1, number));
}

function normalizeObservation(observation = {}, index = 0) {
  return {
    id: text(observation.id || `vision-observation-${index + 1}`, 80),
    region: text(observation.region || observation.area || "Visible design area", 120),
    observation: text(observation.observation || observation.description || "", 360),
    evidence: text(observation.evidence || observation.observation || "", 360),
    bounds: observation.bounds || observation.percentBounds || null,
    confidence: confidence(observation.confidence),
    source: "model_observation",
    evidence_type: "model_observation"
  };
}

export function normalizeLocalVisionModelResponse(raw = {}, metadata = {}) {
  const json = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const observations = (Array.isArray(json.modelObservations) ? json.modelObservations : [])
    .map(normalizeObservation)
    .filter((observation) => observation.observation && observation.evidence)
    .slice(0, 12);

  return {
    version: LOCAL_VISION_MODEL_VERSION,
    source: LOCAL_VISION_MODEL_SOURCE,
    provider: metadata.provider || "ollama",
    model: metadata.model || "",
    architecture: LOCAL_VISION_MODEL_ARCHITECTURES.includes(metadata.architecture) ? metadata.architecture : "unknown",
    passId: metadata.passId || "local-vision-model",
    available: true,
    structuralSummary: json.structuralSummary || json.screenUnderstanding || {},
    modelObservations: observations,
    limitations: Array.isArray(json.limitations)
      ? json.limitations.map((item) => text(item, 220)).filter(Boolean).slice(0, 6)
      : [],
    rawJson: json
  };
}

export function emptyLocalVisionModelResult(reason = "Local vision model interpretation was unavailable.") {
  return {
    version: LOCAL_VISION_MODEL_VERSION,
    source: LOCAL_VISION_MODEL_SOURCE,
    provider: "ollama",
    model: "",
    architecture: "unknown",
    passId: "local-vision-model",
    available: false,
    structuralSummary: {},
    modelObservations: [],
    limitations: [reason],
    rawJson: null
  };
}

export function validateLocalVisionModelResult(result = {}) {
  const errors = [];
  if (result.version !== LOCAL_VISION_MODEL_VERSION) errors.push("Unsupported local vision model result version.");
  if (result.source !== LOCAL_VISION_MODEL_SOURCE) errors.push("Unexpected local vision model result source.");
  if (!Array.isArray(result.modelObservations)) errors.push("modelObservations must be an array.");
  if (!Array.isArray(result.limitations)) errors.push("limitations must be an array.");
  result.modelObservations?.forEach?.((observation, index) => {
    if (observation.source !== "model_observation") errors.push(`Observation ${index + 1} must be marked model_observation.`);
    if (!observation.region) errors.push(`Observation ${index + 1} must include a region.`);
    if (!observation.observation) errors.push(`Observation ${index + 1} must include an observation.`);
  });
  return {
    valid: errors.length === 0,
    errors
  };
}
