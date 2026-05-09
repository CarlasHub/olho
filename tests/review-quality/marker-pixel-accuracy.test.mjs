import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAllBenchmarks, runBenchmark } from "./quality-harness.mjs";

test("marker quality evaluates pixel overlap with expected affected regions", () => {
  const evaluations = evaluateAllBenchmarks();

  evaluations.forEach((evaluation) => {
    const accuracy = evaluation.markerPixelAccuracy;
    assert.equal(typeof accuracy.markerCount, "number", `${evaluation.id} must expose marker count`);
    assert.equal(typeof accuracy.measuredCount, "number", `${evaluation.id} must expose measured marker count`);
    assert.equal(typeof accuracy.averageOverlapRatio, "number", `${evaluation.id} must expose average overlap ratio`);
    assert.ok(Array.isArray(accuracy.lowOverlapMarkers), `${evaluation.id} must expose low-overlap markers`);
    assert.equal(
      accuracy.lowOverlapMarkers.length,
      0,
      `${evaluation.id} has marker(s) with weak pixel overlap: ${accuracy.lowOverlapMarkers.map((item) => item.findingId).join(", ")}`
    );
    assert.ok(
      accuracy.averageOverlapRatio >= 0.82,
      `${evaluation.id} marker average overlap should remain strong, got ${accuracy.averageOverlapRatio.toFixed(2)}`
    );
  });
});

test("Zeplin and Figma marker measurements stay inside isolated design targets", () => {
  const evaluations = evaluateAllBenchmarks().filter((evaluation) =>
    ["zeplin-artboard", "figma-frame"].includes(evaluation.id)
  );

  evaluations.forEach((evaluation) => {
    const run = runBenchmark(evaluation.id);
    assert.equal(run.input.reviewTarget?.excludesPageChrome, true, `${evaluation.id} must exclude editor chrome`);
    run.markers.forEach((marker) => {
      const target = run.input.reviewTarget.bounds;
      assert.ok(marker.rect.x >= target.x, `${evaluation.id} marker leaked left of the artboard`);
      assert.ok(marker.rect.y >= target.y, `${evaluation.id} marker leaked above the artboard`);
      assert.ok(marker.rect.x + marker.rect.width <= target.x + target.width, `${evaluation.id} marker leaked right of the artboard`);
      assert.ok(marker.rect.y + marker.rect.height <= target.y + target.height, `${evaluation.id} marker leaked below the artboard`);
    });
  });
});
