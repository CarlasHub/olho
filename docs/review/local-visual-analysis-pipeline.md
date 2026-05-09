# Local Visual Analysis Pipeline

Olho Review uses a local visual analysis pipeline before optional Ollama reasoning.

## Product Explanation

This tool uses a local visual analysis pipeline. The visual layer extracts measurable facts from the design, such as colour, contrast, structure, spacing, and visual emphasis. Ollama then reasons over that structured evidence and turns it into clear design review feedback. It does not replace design expertise, but it sharpens the review process and makes feedback more consistent.

## Workflow

1. Capture or load a screenshot.
2. Preserve the original image without mutation.
3. Run local deterministic visual analysis against screenshot pixels.
4. Store the analysis as structured JSON in the review session/report metadata.
5. Run deterministic review rules.
6. If static design visual review is enabled, run one dedicated local vision interpretation pass against the selected screenshot/crop.
7. Mark any vision-model observations as `model_observation`.
8. Feed only the structured evidence package into Ollama’s review-reasoning passes.
9. Validate Ollama findings before rendering.
10. Export readable reports and structured JSON.

## Deterministic Visual Evidence

The local visual layer currently measures:

- dominant colours
- local foreground/background contrast pairs where pixel evidence is available
- possible low-contrast text-like regions
- approximate section boundaries
- focal point and competing emphasis risk
- dense/crowded regions
- coarse alignment risk
- repeated accent colour use
- CTA-like visual emphasis candidates
- OCR text regions when Chrome exposes a local `TextDetector` implementation
- OCR-aligned contrast measurements when local OCR text bounds overlap measured contrast tiles

This layer is deterministic and local. It does not use cloud APIs, telemetry, or paid services.

## OCR

OCR is optional and local. Olho calls the browser `TextDetector` API only when it exists in the current runtime. If unavailable, the pipeline continues with pixel-level text-like region detection and marks that limitation in structured JSON.

OCR results are stored as `ocrTextRegions` and treated as measured local evidence for text location. When OCR text bounds overlap local contrast tiles, Olho also records `ocrContrastResults`, including the measured contrast ratio, matched region, and local foreground/background evidence. OCR is not used as the only source of review findings.

## Local Vision Interpretation

Static design visual review uses a dedicated local vision interpretation pre-pass before Ollama’s design-reasoning passes. Olho supports two local interpretation routes:

1. A registered local Vision Transformer runtime exposed as `globalThis.OlhoVisionTransformerRuntime`.
2. A local Ollama vision-capable model as fallback when no ViT runtime is registered.

The repository does not bundle ViT model weights. A real ViT runtime must be supplied locally and must expose a local-only `analyze()` implementation. If no ViT runtime is present, Olho does not claim that a Vision Transformer ran.

The interpretation pass is constrained to extract structural facts only:

- interface type
- main visual regions
- likely reading path
- primary visual emphasis
- possible visual confusion areas
- ignored editor/browser/tooling areas

This pass does not produce recommendations, severity, or product critique. Its output is stored as `localVisionModel` in AI review metadata and its observations are merged into the structured visual evidence package as `model_observation`.

## Vision Transformer Runtime Contract

A real local ViT runtime must satisfy this contract:

```js
globalThis.OlhoVisionTransformerRuntime = {
  architecture: "vit",
  provider: "local-vit-runtime",
  model: "vit-base-local",
  localOnly: true,
  async analyze({
    imageDataUrl,
    imageBase64,
    mimeType,
    width,
    height,
    crop,
    compressedContext,
    contextPackage,
    signal
  }) {
    return {
      structuralSummary: {
        interfaceType: "string",
        mainRegions: ["string"],
        likelyReadingPath: "string",
        primaryVisualEmphasis: "string",
        possibleConfusionAreas: ["string"],
        ignoredAreas: ["string"]
      },
      modelObservations: [
        {
          region: "string",
          observation: "string",
          evidence: "string",
          bounds: null,
          confidence: 0.7
        }
      ],
      limitations: ["string"]
    };
  }
};
```

The runtime must be local-only. Olho rejects runtimes that identify as remote or do not expose a valid `analyze()` function.

## OpenCV Boundary

The runtime includes an OpenCV adapter boundary. If a local OpenCV.js runtime is present, the adapter can report availability for future local kernels. Olho does not bundle a native OpenCV dependency because the extension must remain portable and local-first; the Canvas/ImageData pipeline remains the default visual analyser.

## Evidence Types

Findings may include:

- `measured`: supported by deterministic visual analysis or reliable DOM/style metrics
- `inferred`: cautious design inference from structured evidence
- `model_observation`: based materially on optional local vision-model interpretation
- `human_review_needed`: requires designer confirmation before action

## Guardrails

- Do not claim WCAG failure unless contrast or relevant accessibility evidence was measured.
- Do not use OCR as the only source of evidence.
- Do not critique Zeplin/Figma editor chrome when design-area isolation is active.
- Do not upload screenshots silently.
- Do not make Ollama mandatory.
- Do not treat Ollama as the primary visual analyser.
- Preserve deterministic findings when Ollama fails.

## Ollama Role

Ollama receives a structured package containing:

- image metadata
- measured colour palette
- measured contrast pairs
- low-contrast text-like regions
- OCR-measured contrast results when local OCR is available
- OCR text regions when locally available
- layout regions
- spacing and density observations
- visual hierarchy observations
- deterministic findings
- optional model observations
- project review rules
- required output format

Ollama explains, prioritises, and turns the evidence into design-review feedback. It must not invent hidden functionality, backend behaviour, focus order, assistive technology behaviour, or WCAG failures.
