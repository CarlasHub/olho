import test from "node:test";
import assert from "node:assert/strict";

import { BENCHMARK_IDS, SCORE_LABELS, evaluateAllBenchmarks } from "./quality-harness.mjs";

test("review quality benchmarks produce relevance assessments for every curated screen", () => {
  const evaluations = evaluateAllBenchmarks();

  assert.equal(evaluations.length, BENCHMARK_IDS.length);

  evaluations.forEach((evaluation) => {
    assert.ok(BENCHMARK_IDS.includes(evaluation.id), `Unexpected benchmark id: ${evaluation.id}`);
    assert.ok(SCORE_LABELS.includes(evaluation.scores.relevance), `${evaluation.id} has invalid relevance score`);
    assert.ok(Array.isArray(evaluation.matched), `${evaluation.id} must expose matched expected findings`);
    assert.ok(Array.isArray(evaluation.missed), `${evaluation.id} must expose missed expected findings`);
    assert.ok(Array.isArray(evaluation.findings), `${evaluation.id} must expose generated findings`);
  });
});

test("calibrated benchmarks match expected human-review findings for priority fixtures", () => {
  const evaluations = evaluateAllBenchmarks();
  const priorityFixtures = new Set([
    "marketing-hero",
    "saas-dashboard",
    "dense-admin-panel",
    "pricing-page",
    "zeplin-artboard",
    "figma-frame",
    "typography-editorial"
  ]);

  evaluations
    .filter((evaluation) => priorityFixtures.has(evaluation.id))
    .forEach((evaluation) => {
      assert.ok(
        ["Strong", "Mostly strong"].includes(evaluation.scores.relevance),
        `${evaluation.id} should align with expected senior-reviewer findings`
      );
      assert.equal(evaluation.missed.length, 0, `${evaluation.id} should not miss expected root findings`);
    });
});
