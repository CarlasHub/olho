import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAiReviewConfig, saveAiReviewConfig, loadAiReviewConfig } from "../src/review/ai/ai-review-config.js";
import { detectAiReviewCapabilities, runAiReview } from "../src/review/ai/ai-review-engine.js";
import { AiReviewDisabledError } from "../src/review/ai/ai-review-errors.js";
import { mergeAiReviewFindings } from "../src/review/ai/ai-review-merge.js";
import { AI_REVIEW_MODES } from "../src/review/ai/ai-review-schema.js";
import { filterValidAiReviewFindings } from "../src/review/ai/ai-review-validator.js";
import { buildAiPromptContext } from "../src/review/ai/utils/prompt-context-builder.js";
import { createScreenshotPayload } from "../src/review/ai/utils/screenshot-payload.js";
import { createOllamaProvider } from "../src/review/ai/providers/ollama-provider.js";
import { buildVisualHierarchyPrompt } from "../src/review/ai/prompts/visual-hierarchy-prompt.js";
import { buildStaticDesignContextPackage } from "../src/review/ai/context/static-design-context-package.js";
import { compressOllamaDesignContext } from "../src/review/ai/context/ollama-design-context-compressor.js";
import {
  detectVisionTransformerRuntime,
  runVisionTransformerRuntime,
  VIT_RUNTIME_GLOBAL
} from "../src/review/vision/vit-runtime-adapter.js";
import { readOllamaConfigFromControls } from "../src/review/sidepanel/sidepanel-ai.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

function chromeLikeStorage() {
  const data = new Map();
  return {
    async get(key) {
      return { [key]: data.has(key) ? data.get(key) : undefined };
    },
    async set(values) {
      Object.entries(values || {}).forEach(([key, value]) => data.set(key, value));
    },
    async remove(key) {
      data.delete(key);
    }
  };
}

function deterministicFinding() {
  return {
    id: "rule-primary-actions",
    category: "visual-hierarchy",
    severity: "medium",
    region: "Header actions",
    issue: "Primary and secondary header actions compete for attention.",
    evidence: "The two header actions have similar placement, size, color, and elevation treatment.",
    impact: "Users may need extra time to identify the intended next action.",
    recommendation: "Increase the primary action weight and reduce the secondary action treatment.",
    confidence: 0.78,
    screenshotRef: "media:sample",
    selector: ".primary-action",
    source: "rule-engine"
  };
}

function aiFinding(overrides = {}) {
  return {
    id: "ai-density-review",
    category: "enterprise-polish",
    severity: "medium",
    region: "Dashboard summary region",
    issue: "The summary region uses dense competing cards that weaken initial scan confidence.",
    evidence: "Multiple adjacent cards use similar visual weight and compact spacing, creating a crowded first impression.",
    impact: "Decision-makers may need extra effort to separate priority information from supporting details.",
    recommendation: "Create clearer grouping and reduce secondary card weight so the most important metric reads first.",
    bestPracticeReference: "Enterprise product UI should make priority information easier to separate from supporting detail.",
    reviewRationale: "The finding is based on visible card density and repeated visual weight.",
    affectedUsers: "Decision-makers and users scanning dashboard information under time pressure.",
    suggestedPriority: "Review before release if this dashboard supports operational decisions.",
    markerSummary: "Dense summary cards",
    markerIntent: "Place marker on the dashboard summary card group.",
    acceptanceCriteria: [
      "The lead metric is visually easier to identify.",
      "Secondary cards are visibly subordinate.",
      "Related cards have clearer grouping.",
      "The summary region remains consistent with the product system."
    ],
    markerType: "component-group",
    confidence: 0.74,
    screenshotRef: "media:sample",
    selector: ".summary-grid",
    limitations: [],
    source: "ai-review",
    ...overrides
  };
}

test("AI review config defaults to off and persists only in provided local storage", async () => {
  const storage = memoryStorage();
  const defaults = normalizeAiReviewConfig();

  assert.equal(defaults.enabled, false);
  assert.equal(defaults.provider, "ollama");
  assert.equal(defaults.screenshotSharingEnabled, false);

  await saveAiReviewConfig(
    {
      enabled: true,
      provider: "ollama",
      mode: AI_REVIEW_MODES.TEXT_REFINE,
      providerSettings: {
        ollama: {
          endpoint: "http://127.0.0.1:11434",
          model: "local-review-model"
        }
      }
    },
    { storage }
  );
  const reloaded = await loadAiReviewConfig({ storage });
  assert.equal(reloaded.enabled, true);
  assert.equal(reloaded.providerSettings.ollama.model, "local-review-model");
});

test("AI review config also persists through chrome.storage.local-style async storage", async () => {
  const storage = chromeLikeStorage();

  await saveAiReviewConfig(
    {
      enabled: true,
      provider: "ollama",
      mode: AI_REVIEW_MODES.TEXT_REFINE,
      providerSettings: {
        ollama: {
          endpoint: "local-ollama-endpoint",
          model: "a11y-cat-assistant:latest"
        }
      }
    },
    { storage }
  );

  const reloaded = await loadAiReviewConfig({ storage });
  assert.equal(reloaded.enabled, true);
  assert.equal(reloaded.provider, "ollama");
  assert.equal(reloaded.providerSettings.ollama.model, "a11y-cat-assistant:latest");
});

test("side panel Ollama controls preserve an intentionally empty model for auto-detection", () => {
  const currentConfig = normalizeAiReviewConfig({
    enabled: true,
    provider: "ollama",
    mode: AI_REVIEW_MODES.TEXT_REFINE,
    providerSettings: {
      ollama: {
        endpoint: "http://localhost:11434",
        model: "stale-model:latest"
      }
    }
  });
  const nextConfig = readOllamaConfigFromControls(
    {
      ollamaEnabledToggle: { checked: true },
      ollamaModeSelect: { value: AI_REVIEW_MODES.TEXT_REFINE },
      ollamaScreenshotToggle: { checked: false },
      ollamaEndpointInput: { value: "http://localhost:11434" },
      ollamaModelInput: { value: "" }
    },
    currentConfig
  );

  assert.equal(nextConfig.providerSettings.ollama.model, "");
});

test("AI validator rejects vague or malformed AI findings", () => {
  const valid = filterValidAiReviewFindings([aiFinding()], { warnInvalid: false });
  assert.equal(valid.validFindings.length, 1);

  const rejected = filterValidAiReviewFindings(
    [
      aiFinding({
        issue: "This UI is nice.",
        evidence: "Looks good.",
        recommendation: "Make it modern."
      })
    ],
    { warnInvalid: false }
  );
  assert.equal(rejected.validFindings.length, 0);
  assert.equal(rejected.rejectedFindings.length, 1);

  const praiseRejected = filterValidAiReviewFindings(
    [
      aiFinding({
        issue: "This is good design and looks professional.",
        evidence: "The interface looks clean and works well.",
        recommendation: "Keep the good design direction."
      })
    ],
    { warnInvalid: false }
  );
  assert.equal(praiseRejected.validFindings.length, 0);
  assert.equal(praiseRejected.rejectedFindings.length, 1);
});

test("AI normalizer preserves measured evidence type for Ollama findings", () => {
  const result = filterValidAiReviewFindings(
    [
      aiFinding({
        evidenceType: "measured",
        evidence_type: "measured",
        evidence:
          "Local visual analysis measured a contrast ratio of 2.8:1 for text-like detail in the hero copy region.",
        issue: "Hero copy may be difficult to read against the current background treatment.",
        recommendation:
          "Increase text/background separation in the hero copy area and re-check the measured contrast ratio before release."
      })
    ],
    { warnInvalid: false }
  );

  assert.equal(result.validFindings.length, 1);
  assert.equal(result.validFindings[0].evidenceType, "measured");
});

test("AI validator rejects WCAG failure claims without measured evidence", () => {
  const result = filterValidAiReviewFindings(
    [
      aiFinding({
        evidenceType: "inferred",
        issue: "The body copy fails WCAG contrast requirements.",
        evidence: "The text appears visually soft against the background.",
        recommendation: "Increase contrast because this fails WCAG."
      })
    ],
    { warnInvalid: false }
  );

  assert.equal(result.validFindings.length, 0);
  assert.equal(
    result.rejectedFindings[0].errors.some((error) => error.includes("WCAG failure")),
    true
  );
});

test("AI merge preserves deterministic findings and accepts non-overlapping AI findings", () => {
  const deterministic = deterministicFinding();
  const duplicate = aiFinding({
    id: "ai-duplicate",
    category: "visual-hierarchy",
    region: "Header actions",
    issue: "Primary and secondary header actions compete due to similar visual weight.",
    evidence: "Both controls are in the header and use similar size, contrast, and spacing.",
    recommendation: "Clarify the preferred action through stronger hierarchy."
  });
  const unique = aiFinding();

  const merged = mergeAiReviewFindings({
    deterministicFindings: [deterministic],
    aiFindings: [duplicate, unique],
    warnInvalid: false
  });

  assert.equal(merged.findings.some((finding) => finding.id === deterministic.id), true);
  assert.equal(merged.findings.some((finding) => finding.id === unique.id), true);
  assert.equal(merged.findings.some((finding) => finding.id === duplicate.id), false);
  assert.equal(merged.duplicateAiFindings.length, 1);
});

test("screenshot payload remains disabled unless full visual sharing is explicitly enabled", async () => {
  const disabled = await createScreenshotPayload({
    enabled: false,
    mode: AI_REVIEW_MODES.FULL_VISUAL,
    provider: { supportsVision: true }
  });
  assert.equal(disabled.shared, false);

  const textOnly = await createScreenshotPayload({
    enabled: true,
    mode: AI_REVIEW_MODES.TEXT_REFINE,
    provider: { supportsVision: true }
  });
  assert.equal(textOnly.shared, false);

  const staticSynthesis = await createScreenshotPayload({
    enabled: true,
    mode: AI_REVIEW_MODES.STATIC_DESIGN_SYNTHESIS,
    provider: { supportsVision: true }
  });
  assert.equal(staticSynthesis.shared, false);
  assert.equal(staticSynthesis.reason.includes("does not require screenshot"), true);
});

test("prompt context includes deterministic findings and visible-only constraints", () => {
  const context = buildAiPromptContext({
    session: {
      screenshotRef: "media:sample",
      media: { width: 1200, height: 800, mimeType: "image/png" }
    },
    reviewContext: {
      sourceType: "dom-metrics",
      hasDomMetrics: true,
      image: { width: 1200, height: 800, mimeType: "image/png" },
      viewport: { width: 1200, height: 800 },
      elements: [],
      headings: [],
      actions: [],
      textBlocks: [],
      components: [],
      detectedRegions: []
    },
    deterministicFindings: [deterministicFinding()]
  });

  assert.equal(context.metadataAvailability.hasDomMetrics, true);
  assert.equal(context.deterministicFindings.length, 1);
  assert.equal(context.reviewerStandard.role.includes("Senior enterprise UI/UX reviewer"), true);
  assert.equal(context.reviewerStandard.stance.includes("Critical professional release audit"), true);
  assert.equal(context.reviewerStandard.findingRequirements.includes("reference visible evidence"), true);
  assert.equal(context.visibleOnlyInstruction.includes("Do not invent"), true);
});

test("AI prompts enforce senior enterprise reviewer critique rather than praise", () => {
  const prompt = buildVisualHierarchyPrompt({
    reviewerStandard: {
      role: "Senior enterprise UI/UX reviewer"
    }
  });

  assert.equal(prompt.includes("senior enterprise UI/UX reviewer"), true);
  assert.equal(prompt.includes("Your role is not to praise the interface"), true);
  assert.equal(prompt.includes("visual communication quality"), true);
  assert.equal(prompt.includes("spacing rhythm"), true);
  assert.equal(prompt.includes("CTA clarity"), true);
  assert.equal(prompt.includes("Do not produce generic praise"), true);
  assert.equal(prompt.includes("reference concrete visible evidence"), true);
  assert.equal(prompt.includes("Prioritize fewer high-signal findings"), true);
});

test("static design context package prepares isolated design review context", () => {
  const contextPackage = buildStaticDesignContextPackage({
    session: {
      reviewTarget: {
        type: "central-design-artboard",
        label: "Zeplin design area",
        confidence: 0.82,
        excludesPageChrome: true,
        bounds: { x: 260, y: 90, width: 820, height: 640, right: 1080, bottom: 730 }
      },
      engineMetadata: { sourceType: "zeplin-capture" },
      media: { width: 1440, height: 900 }
    },
    reviewContext: {
      sourceType: "zeplin-capture",
      hasDomMetrics: false,
      isImageOnly: true,
      isDesignScreen: true,
      image: { width: 1440, height: 900 },
      viewport: { width: 1440, height: 900, scrollX: 0, scrollY: 0 },
      elements: []
    },
    deterministicFindings: [deterministicFinding()]
  });
  const compressed = compressOllamaDesignContext(contextPackage);

  assert.equal(contextPackage.reviewTargetType, "design-artboard");
  assert.equal(contextPackage.targetIsolation.cropRequiredForVisualReview, true);
  assert.equal(contextPackage.targetIsolation.ignoredAreas.includes("Zeplin toolbar"), true);
  assert.equal(contextPackage.limitations.some((item) => item.includes("DOM metrics")), true);
  assert.equal(compressed.ignoredAreas.includes("Zeplin side panels"), true);
  assert.equal(compressed.deterministicFindings.length, 1);
});

test("Ollama capability detection distinguishes text-only and vision-capable models", async () => {
  const vision = await detectAiReviewCapabilities({
    config: normalizeAiReviewConfig({
      enabled: true,
      provider: "ollama",
      providerSettings: {
        ollama: {
          endpoint: "http://127.0.0.1:11434",
          model: "llama3.2-vision:latest"
        }
      }
    }),
    async fetchImpl(url) {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/api/tags")) {
        return new Response(
          JSON.stringify({ models: [{ name: "llama3.2-vision:latest" }, { name: "llama3.1:8b" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ model_info: { "llama.context_length": 8192 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const textOnly = await detectAiReviewCapabilities({
    config: normalizeAiReviewConfig({
      enabled: true,
      provider: "ollama",
      providerSettings: {
        ollama: {
          endpoint: "http://127.0.0.1:11434",
          model: "llama3.1:8b"
        }
      }
    }),
    async fetchImpl(url) {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "llama3.1:8b" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ model_info: { "llama.context_length": 8192 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(vision.capabilities.supportsVision, true);
  assert.equal(vision.capabilities.contextWindow, 8192);
  assert.equal(textOnly.capabilities.capability, "text-only");
  assert.equal(textOnly.capabilities.recommendedForDesignReview, false);
});

test("AI review run is disabled by default and makes no provider request", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runAiReview({
        config: normalizeAiReviewConfig(),
        session: { findings: [deterministicFinding()] },
        fetchImpl() {
          calls += 1;
        }
      }),
    AiReviewDisabledError
  );
  assert.equal(calls, 0);
});

test("AI review uses explicit provider requests and preserves local deterministic findings", async () => {
  const config = normalizeAiReviewConfig({
    enabled: true,
    provider: "ollama",
    mode: AI_REVIEW_MODES.TEXT_REFINE,
    providerSettings: {
      ollama: {
        endpoint: "http://127.0.0.1:11434",
        model: "local-review-model"
      }
    }
  });
  const requests = [];

  const result = await runAiReview({
    config,
    session: {
      screenshotRef: "media:sample",
      media: { width: 1200, height: 800, mimeType: "image/png" },
      findings: [deterministicFinding()]
    },
    reviewContext: {
      sourceType: "dom-metrics",
      hasDomMetrics: true,
      image: { width: 1200, height: 800, mimeType: "image/png" },
      viewport: { width: 1200, height: 800 },
      elements: [],
      headings: [],
      actions: [],
      textBlocks: [],
      components: [],
      detectedRegions: []
    },
    deterministicFindings: [deterministicFinding()],
    async fetchImpl(url, options) {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      return new Response(
        JSON.stringify({
          response: JSON.stringify({
            findings: requests.length === 7 ? [aiFinding()] : []
          })
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  });

  assert.equal(requests.length, 7);
  assert.equal(requests.some((request) => Array.isArray(request.body.images)), false);
  assert.equal(result.findings.some((finding) => finding.source === "rule-engine"), true);
  assert.equal(result.findings.some((finding) => finding.source === "ai-review"), true);
  assert.equal(result.metadata.screenshotShared, false);
});

test("static design visual mode rejects text-only Ollama models before screenshot review", async () => {
  const config = normalizeAiReviewConfig({
    enabled: true,
    provider: "ollama",
    mode: AI_REVIEW_MODES.STATIC_DESIGN_VISUAL,
    screenshotSharingEnabled: true,
    providerSettings: {
      ollama: {
        endpoint: "http://127.0.0.1:11434",
        model: "llama3.1:8b"
      }
    }
  });

  await assert.rejects(
    () =>
      runAiReview({
        config,
        session: {
          screenshotRef: "media:sample",
          media: { width: 1200, height: 800, mimeType: "image/png" },
          findings: [deterministicFinding()]
        },
        reviewContext: {
          sourceType: "static-design",
          isDesignScreen: true,
          isImageOnly: true,
          image: { width: 1200, height: 800 },
          viewport: { width: 1200, height: 800 },
          elements: []
        },
        deterministicFindings: [deterministicFinding()],
        async fetchImpl(url) {
          const path = new URL(String(url)).pathname;
          if (path.endsWith("/api/tags")) {
            return new Response(JSON.stringify({ models: [{ name: "llama3.1:8b" }] }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          }
          return new Response(JSON.stringify({ model_info: { "llama.context_length": 8192 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
      }),
    /text-only|vision-capable|Static design visual review/
  );
});

test("static design visual mode sends screenshot only to the local vision interpretation pass", async () => {
  const config = normalizeAiReviewConfig({
    enabled: true,
    provider: "ollama",
    mode: AI_REVIEW_MODES.STATIC_DESIGN_VISUAL,
    screenshotSharingEnabled: true,
    providerSettings: {
      ollama: {
        endpoint: "http://127.0.0.1:11434",
        model: "llama3.2-vision:latest"
      }
    }
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        drawImage() {}
      };
    },
    toDataURL() {
      return "data:image/png;base64,ZmFrZS1sb2NhbC1pbWFnZQ==";
    }
  };
  const imageElement = {
    naturalWidth: 1200,
    naturalHeight: 800,
    ownerDocument: {
      createElement() {
        return canvas;
      }
    }
  };
  const generateRequests = [];

  const result = await runAiReview({
    config,
    imageElement,
    session: {
      screenshotRef: "media:sample",
      media: { width: 1200, height: 800, mimeType: "image/png" },
      reviewTarget: {
        type: "central-design-artboard",
        label: "Static design artboard",
        confidence: 0.9,
        excludesPageChrome: true,
        bounds: { x: 100, y: 80, width: 900, height: 620, right: 1000, bottom: 700 }
      },
      findings: [deterministicFinding()]
    },
    reviewContext: {
      sourceType: "static-design",
      isDesignScreen: true,
      isImageOnly: true,
      image: { width: 1200, height: 800 },
      viewport: { width: 1200, height: 800, scrollX: 0, scrollY: 0 },
      elements: []
    },
    deterministicFindings: [deterministicFinding()],
    async fetchImpl(url, options = {}) {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2-vision:latest" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (path.endsWith("/api/show")) {
        return new Response(
          JSON.stringify({ model_info: { "llama.context_length": 131072, "general.architecture": "vision" } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      const body = JSON.parse(options.body);
      generateRequests.push(body);
      if (body.prompt.includes("local vision interpretation layer")) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              structuralSummary: {
                interfaceType: "Static landing design",
                mainRegions: ["Hero", "CTA group"],
                likelyReadingPath: "Hero message to CTA group",
                primaryVisualEmphasis: "Hero image and CTA group",
                possibleConfusionAreas: ["Hero visual band"],
                ignoredAreas: []
              },
              modelObservations: [
                {
                  id: "vision-hero-band",
                  region: "Hero design area",
                  observation: "A large hero image and call-to-action group occupy the same visual band.",
                  evidence: "The crop shows hero imagery and an action group sharing the same primary horizontal visual band.",
                  confidence: 0.74
                }
              ],
              limitations: []
            })
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      if (body.prompt.includes("Pass: Final synthesis")) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              findings: [
                aiFinding({
                  id: "ai-vision-hero-hierarchy",
                  evidenceType: "model_observation",
                  evidence_type: "model_observation",
                  region: "Hero design area",
                  issue: "The hero image and action group compete for initial attention in the selected design area.",
                  evidence:
                    "The local vision observation identified the hero image and CTA group occupying the same visual band, while deterministic context marked this as the selected artboard.",
                  recommendation:
                    "Clarify the hero reading path by reducing image emphasis around the action group and increasing the heading-to-action relationship."
                })
              ],
              finalSynthesis: {
                executiveSummary: "The selected static design area needs clearer hierarchy around the hero action path."
              }
            })
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      return new Response(JSON.stringify({ response: JSON.stringify({ findings: [] }) }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(result.metadata.screenshotShared, true);
  assert.equal(generateRequests.length, 9);
  assert.equal(generateRequests.filter((request) => Array.isArray(request.images)).length, 1);
  assert.equal(generateRequests[0].images.length, 1);
  assert.equal(generateRequests[0].prompt.includes("local vision interpretation layer"), true);
  assert.equal(result.metadata.localVisionModel.available, true);
  assert.equal(result.metadata.localVisionModel.modelObservations.length, 1);
  assert.equal(result.metadata.staticDesignInsights.modelObservations.length, 1);
  assert.equal(result.acceptedAiFindings.some((finding) => finding.id === "ai-vision-hero-hierarchy"), true);
});

test("local Vision Transformer runtime adapter detects real runtime contract and normalizes observations", async () => {
  const runtime = {
    architecture: "vit",
    provider: "mock-vit",
    model: "vit-base-local",
    localOnly: true,
    async analyze({ imageDataUrl }) {
      assert.equal(imageDataUrl.startsWith("data:image/png;base64,"), true);
      return {
        structuralSummary: {
          interfaceType: "Static dashboard",
          mainRegions: ["Header", "Cards"]
        },
        modelObservations: [
          {
            id: "vit-observation-1",
            region: "Card grid",
            observation: "Several similarly weighted cards occupy the same visual band.",
            evidence: "The local ViT runtime identified repeated card-like regions with comparable visual emphasis.",
            confidence: 0.72
          }
        ],
        limitations: ["Mock runtime only."]
      };
    }
  };

  assert.equal(detectVisionTransformerRuntime({ runtime }).available, true);
  const result = await runVisionTransformerRuntime({
    runtime,
    screenshotPayload: {
      shared: true,
      dataUrl: "data:image/png;base64,ZmFrZQ==",
      dataBase64: "ZmFrZQ==",
      mimeType: "image/png",
      width: 100,
      height: 80
    }
  });

  assert.equal(result.architecture, "vit");
  assert.equal(result.provider, "mock-vit");
  assert.equal(result.modelObservations.length, 1);
  assert.equal(result.modelObservations[0].source, "model_observation");
});

test("static design visual mode can use a registered local ViT runtime before Ollama text reasoning", async () => {
  const previousRuntime = globalThis[VIT_RUNTIME_GLOBAL];
  globalThis[VIT_RUNTIME_GLOBAL] = {
    architecture: "vit",
    provider: "mock-vit",
    model: "vit-base-local",
    localOnly: true,
    async analyze({ imageDataUrl }) {
      assert.equal(imageDataUrl.startsWith("data:image/png;base64,"), true);
      return {
        structuralSummary: {
          interfaceType: "Static design",
          mainRegions: ["Hero", "CTA group"],
          likelyReadingPath: "Hero to CTA"
        },
        modelObservations: [
          {
            region: "Hero design area",
            observation: "The hero image and action group share the same primary visual band.",
            evidence: "The local ViT runtime detected hero imagery and action-like shapes in the same band.",
            confidence: 0.73
          }
        ],
        limitations: []
      };
    }
  };

  try {
    const config = normalizeAiReviewConfig({
      enabled: true,
      provider: "ollama",
      mode: AI_REVIEW_MODES.STATIC_DESIGN_VISUAL,
      screenshotSharingEnabled: true,
      providerSettings: {
        ollama: {
          endpoint: "http://127.0.0.1:11434",
          model: "llama3.1:8b"
        }
      }
    });
    const canvas = {
      width: 0,
      height: 0,
      getContext() {
        return {
          drawImage() {}
        };
      },
      toDataURL() {
        return "data:image/png;base64,ZmFrZS12aXQtaW1hZ2U=";
      }
    };
    const imageElement = {
      naturalWidth: 1200,
      naturalHeight: 800,
      ownerDocument: {
        createElement() {
          return canvas;
        }
      }
    };
    const generateRequests = [];
    const result = await runAiReview({
      config,
      imageElement,
      session: {
        screenshotRef: "media:sample",
        media: { width: 1200, height: 800, mimeType: "image/png" },
        reviewTarget: {
          type: "central-design-artboard",
          label: "Static design artboard",
          confidence: 0.9,
          excludesPageChrome: true,
          bounds: { x: 100, y: 80, width: 900, height: 620, right: 1000, bottom: 700 }
        },
        findings: [deterministicFinding()]
      },
      reviewContext: {
        sourceType: "static-design",
        isDesignScreen: true,
        isImageOnly: true,
        image: { width: 1200, height: 800 },
        viewport: { width: 1200, height: 800, scrollX: 0, scrollY: 0 },
        elements: []
      },
      deterministicFindings: [deterministicFinding()],
      async fetchImpl(url, options = {}) {
        const path = new URL(String(url)).pathname;
        if (path.endsWith("/api/tags")) {
          return new Response(JSON.stringify({ models: [{ name: "llama3.1:8b" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (path.endsWith("/api/show")) {
          return new Response(JSON.stringify({ model_info: { "llama.context_length": 8192 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        const body = JSON.parse(options.body);
        generateRequests.push(body);
        if (body.prompt.includes("Pass: Final synthesis")) {
          return new Response(
            JSON.stringify({
              response: JSON.stringify({
                findings: [
                  aiFinding({
                    id: "ai-vit-supported-hierarchy",
                    evidenceType: "model_observation",
                    evidence_type: "model_observation",
                    region: "Hero design area",
                    issue: "The hero image and action group compete for initial attention in the selected design area.",
                    evidence:
                      "The local ViT observation identified hero imagery and action-like shapes occupying the same primary visual band.",
                    recommendation:
                      "Clarify the hero reading path by reducing image emphasis around the action group and strengthening the heading-to-action relationship."
                  })
                ],
                finalSynthesis: {
                  executiveSummary: "The selected static design area needs clearer hierarchy around the hero action path."
                }
              })
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );
        }
        return new Response(JSON.stringify({ response: JSON.stringify({ findings: [] }) }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    });

    assert.equal(result.metadata.localVisionModel.architecture, "vit");
    assert.equal(result.metadata.visionTransformerRuntime.available, true);
    assert.equal(generateRequests.length, 8);
    assert.equal(generateRequests.some((request) => Array.isArray(request.images)), false);
    assert.equal(result.acceptedAiFindings.some((finding) => finding.id === "ai-vit-supported-hierarchy"), true);
  } finally {
    if (previousRuntime === undefined) {
      delete globalThis[VIT_RUNTIME_GLOBAL];
    } else {
      globalThis[VIT_RUNTIME_GLOBAL] = previousRuntime;
    }
  }
});

test("static design synthesis builds context, repairs invalid Ollama JSON once, and preserves deterministic findings", async () => {
  const config = normalizeAiReviewConfig({
    enabled: true,
    provider: "ollama",
    mode: AI_REVIEW_MODES.STATIC_DESIGN_SYNTHESIS,
    screenshotSharingEnabled: false,
    providerSettings: {
      ollama: {
        endpoint: "http://127.0.0.1:11434",
        model: "llama3.1:8b"
      }
    }
  });
  const requests = [];

  const result = await runAiReview({
    config,
    session: {
      screenshotRef: "media:sample",
      media: { width: 1200, height: 800, mimeType: "image/png" },
      reviewTarget: {
        type: "central-design-artboard",
        label: "Static design artboard",
        confidence: 0.8,
        excludesPageChrome: true,
        bounds: { x: 100, y: 80, width: 900, height: 620, right: 1000, bottom: 700 }
      },
      findings: [deterministicFinding()]
    },
    reviewContext: {
      sourceType: "static-design",
      isDesignScreen: true,
      isImageOnly: true,
      image: { width: 1200, height: 800 },
      viewport: { width: 1200, height: 800, scrollX: 0, scrollY: 0 },
      elements: []
    },
    deterministicFindings: [deterministicFinding()],
    async fetchImpl(url, options = {}) {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "llama3.1:8b" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (path.endsWith("/api/show")) {
        return new Response(JSON.stringify({ model_info: { "llama.context_length": 8192 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      const body = JSON.parse(options.body);
      requests.push(body);
      if (body.prompt.includes("Repair the following Ollama review response")) {
        return new Response(JSON.stringify({ response: JSON.stringify({ findings: [aiFinding()] }) }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (body.prompt.includes("Pass: Screen understanding")) {
        return new Response(JSON.stringify({ response: "not valid json" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(
        JSON.stringify({
          response: JSON.stringify({
            findings: [],
            finalSynthesis: {
              executiveSummary: "The static design needs clearer hierarchy before release."
            }
          })
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  });

  assert.equal(result.findings.some((finding) => finding.source === "rule-engine"), true);
  assert.equal(result.findings.some((finding) => finding.source === "ai-review"), true);
  assert.equal(result.metadata.staticDesignContext.reviewTargetType, "design-artboard");
  assert.equal(result.metadata.qualityValidationSummary.some((entry) => entry.repaired), true);
  assert.equal(result.metadata.screenshotShared, false);
  assert.equal(requests.some((request) => Array.isArray(request.images)), false);
});

test("Ollama provider sends structured local JSON schema requests", async () => {
  const provider = createOllamaProvider();
  const requests = [];

  await provider.runPass({
    passId: "visual-hierarchy",
    prompt: "Return structured findings.",
    settings: {
      endpoint: ["http:", "", "127.0.0.1:11434"].join("/"),
      model: "local-review-model"
    },
    async fetchImpl(url, options) {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ response: JSON.stringify({ findings: [] }) }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.model, "local-review-model");
  assert.equal(requests[0].body.stream, false);
  assert.equal(requests[0].body.format.type, "object");
  assert.equal(requests[0].body.format.properties.findings.type, "array");
  assert.equal(Array.isArray(requests[0].body.images), false);
});
