import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAiReviewConfig, saveAiReviewConfig, loadAiReviewConfig } from "../src/review/ai/ai-review-config.js";
import { runAiReview } from "../src/review/ai/ai-review-engine.js";
import { AiReviewDisabledError } from "../src/review/ai/ai-review-errors.js";
import { mergeAiReviewFindings } from "../src/review/ai/ai-review-merge.js";
import { AI_REVIEW_MODES } from "../src/review/ai/ai-review-schema.js";
import { filterValidAiReviewFindings } from "../src/review/ai/ai-review-validator.js";
import { buildAiPromptContext } from "../src/review/ai/utils/prompt-context-builder.js";
import { createScreenshotPayload } from "../src/review/ai/utils/screenshot-payload.js";

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
    confidence: 0.74,
    screenshotRef: "media:sample",
    selector: ".summary-grid",
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
  assert.equal(context.visibleOnlyInstruction.includes("Do not invent"), true);
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
