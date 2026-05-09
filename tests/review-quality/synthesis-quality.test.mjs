import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAllBenchmarks, loadExpectedFindings } from "./quality-harness.mjs";

test("synthesis evaluation checks root-cause alignment rather than only symptom count", () => {
  const evaluations = evaluateAllBenchmarks();

  evaluations.forEach((evaluation) => {
    const expected = loadExpectedFindings(evaluation.id);
    assert.ok(Array.isArray(expected.rootCauseObservations), `${evaluation.id} must define human root-cause expectations`);
    assert.ok(
      ["Strong", "Mostly strong", "Needs attention", "Weak"].includes(evaluation.scores.rootCauseIdentification),
      `${evaluation.id} has invalid root-cause score`
    );
  });
});

test("synthesis covers calibrated root-cause observations for priority fixtures", () => {
  const evaluations = evaluateAllBenchmarks();
  const priorityFixtureIds = new Set(["marketing-hero", "saas-dashboard", "dense-admin-panel", "pricing-page", "figma-frame"]);

  evaluations
    .filter((evaluation) => priorityFixtureIds.has(evaluation.id))
    .forEach((evaluation) => {
      assert.ok(
        ["Strong", "Mostly strong"].includes(evaluation.scores.rootCauseIdentification),
        `${evaluation.id} should synthesize root-cause findings instead of fragmented symptoms`
      );
      assert.ok(
        evaluation.findings.some((finding) => finding.isSynthesisFinding),
        `${evaluation.id} should include at least one synthesis finding`
      );
    });
});
