import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAllBenchmarks } from "./quality-harness.mjs";

const REQUIRED_DEEP_FIELDS = [
  "issue",
  "evidence",
  "impact",
  "recommendation",
  "bestPracticeReference",
  "reviewRationale",
  "affectedUsers",
  "suggestedPriority",
  "markerSummary",
  "acceptanceCriteria"
];

test("generated benchmark findings keep the expanded professional review schema", () => {
  const evaluations = evaluateAllBenchmarks();
  const findings = evaluations.flatMap((evaluation) => evaluation.findings);

  assert.ok(findings.length > 0, "Benchmark suite must generate findings to evaluate depth");

  findings.forEach((finding) => {
    REQUIRED_DEEP_FIELDS.forEach((field) => {
      assert.ok(field in finding, `${finding.id || finding.issue} is missing ${field}`);
    });
    assert.ok(Array.isArray(finding.acceptanceCriteria), "acceptanceCriteria must remain a structured list");
    assert.ok(finding.acceptanceCriteria.length >= 3, "acceptanceCriteria should be useful enough for ticket handoff");
  });
});

test("depth scoring flags shallow output without blocking benchmark execution", () => {
  const evaluations = evaluateAllBenchmarks();

  evaluations.forEach((evaluation) => {
    assert.ok(["Strong", "Mostly strong", "Needs attention", "Weak"].includes(evaluation.scores.depth));
  });

  assert.ok(
    evaluations.some((evaluation) => ["Strong", "Mostly strong"].includes(evaluation.scores.depth)),
    "At least one benchmark should demonstrate deep professional finding structure"
  );
});
