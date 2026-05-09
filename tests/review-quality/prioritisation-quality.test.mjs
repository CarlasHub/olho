import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAllBenchmarks } from "./quality-harness.mjs";

test("prioritisation evaluation compares first findings against human priority guidance", () => {
  const evaluations = evaluateAllBenchmarks();

  evaluations.forEach((evaluation) => {
    assert.ok(Array.isArray(evaluation.priorities.priorityOrder), `${evaluation.id} must define a priority order`);
    assert.ok(
      ["Strong", "Mostly strong", "Needs attention", "Weak"].includes(evaluation.scores.prioritisationQuality),
      `${evaluation.id} has invalid prioritisation score`
    );
  });
});

test("calibrated priority fixtures lead with human-priority categories", () => {
  const evaluations = evaluateAllBenchmarks();
  const expectedTopCategories = new Map([
    ["marketing-hero", "visual-hierarchy"],
    ["saas-dashboard", "enterprise-polish"],
    ["dense-admin-panel", "ux"],
    ["pricing-page", "visual-hierarchy"],
    ["zeplin-artboard", "visual-hierarchy"],
    ["figma-frame", "design-system"],
    ["typography-editorial", "accessibility-visible"],
    ["inconsistent-design-system", "design-system"]
  ]);

  expectedTopCategories.forEach((category, id) => {
    const evaluation = evaluations.find((item) => item.id === id);
    assert.ok(evaluation, `${id} evaluation must exist`);
    assert.equal(evaluation.findings[0]?.category, category, `${id} should lead with ${category}`);
  });
});
