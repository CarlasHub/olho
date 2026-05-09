import test from "node:test";
import assert from "node:assert/strict";

import { cleanBaselineEvaluation, evaluateAllBenchmarks } from "./quality-harness.mjs";

test("clean-good baseline does not produce high-severity scanner noise", () => {
  const baseline = cleanBaselineEvaluation();
  const severeFindings = baseline.result.findings.filter((finding) => ["critical", "high"].includes(finding.severity));

  assert.equal(severeFindings.length, 0, "Clean-good baseline should not produce high or critical findings");
  assert.ok(baseline.result.findings.length <= 5, "Clean-good baseline should produce few findings");
});

test("false-positive analysis captures vague, duplicate, or scanner-like output", () => {
  const evaluations = evaluateAllBenchmarks();

  evaluations.forEach((evaluation) => {
    assert.ok(Array.isArray(evaluation.falsePositives), `${evaluation.id} must expose false-positive candidates`);
    assert.equal(typeof evaluation.duplicateCount, "number", `${evaluation.id} must expose duplicate count`);
    assert.ok(
      ["Strong", "Mostly strong", "Needs attention", "Weak"].includes(evaluation.scores.noiseControl),
      `${evaluation.id} has invalid noise-control score`
    );
  });

  evaluations.forEach((evaluation) => {
    assert.ok(
      evaluation.falsePositives.length <= 1,
      `${evaluation.id} should not produce scanner-like false-positive noise`
    );
    assert.ok(evaluation.duplicateCount <= 1, `${evaluation.id} should not produce duplicate symptom spam`);
  });
});
