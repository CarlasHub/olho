import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAllBenchmarks } from "./quality-harness.mjs";

test("missed-issue analysis records expected human findings and calibrated fixtures have no misses", () => {
  const evaluations = evaluateAllBenchmarks();
  const missed = evaluations.flatMap((evaluation) =>
    evaluation.missed.map((expected) => ({ benchmarkId: evaluation.id, expected }))
  );

  missed.forEach((item) => {
    assert.equal(typeof item.benchmarkId, "string");
    assert.equal(typeof item.expected.id, "string");
    assert.equal(typeof item.expected.rootCause, "string");
    assert.ok(Array.isArray(item.expected.evidenceKeywords));
  });

  const calibratedFixtures = new Set([
    "marketing-hero",
    "saas-dashboard",
    "dense-admin-panel",
    "pricing-page",
    "zeplin-artboard",
    "figma-frame",
    "typography-editorial"
  ]);
  evaluations
    .filter((evaluation) => calibratedFixtures.has(evaluation.id))
    .forEach((evaluation) => {
      assert.equal(evaluation.missed.length, 0, `${evaluation.id} should not miss calibrated human-review expectations`);
    });
});

test("every expected finding is either matched or explicitly missed", () => {
  const evaluations = evaluateAllBenchmarks();

  evaluations.forEach((evaluation) => {
    assert.equal(
      evaluation.matched.length + evaluation.missed.length,
      evaluation.expected.strongFindings.length,
      `${evaluation.id} must account for every expected strong finding`
    );
  });
});
