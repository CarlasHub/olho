import test from "node:test";
import assert from "node:assert/strict";

import { evaluateBenchmark, runBenchmark } from "./quality-harness.mjs";

test("Zeplin and Figma benchmark fixtures scope metrics to the design surface", () => {
  ["zeplin-artboard", "figma-frame"].forEach((id) => {
    const run = runBenchmark(id);

    assert.ok(run.input.rawElements.length > run.input.elements.length, `${id} should remove editor chrome from metrics`);
    assert.ok(run.input.reviewTarget?.excludesPageChrome, `${id} should mark page chrome as excluded`);
    run.input.elements.forEach((element) => {
      assert.ok(!/toolbar|panel|layers|properties|spec/i.test(element.selector), `${id} leaked editor UI: ${element.selector}`);
    });
  });
});

test("Zeplin/Figma review findings do not critique editor chrome in design-area-only mode", () => {
  ["zeplin-artboard", "figma-frame"].forEach((id) => {
    const evaluation = evaluateBenchmark(id);
    const combined = evaluation.findings
      .map((finding) => [finding.region, finding.issue, finding.evidence, finding.recommendation].join(" "))
      .join(" ")
      .toLowerCase();

    ["toolbar", "side panel", "spec panel", "comments panel", "layers panel", "properties panel"].forEach((forbidden) => {
      assert.ok(!combined.includes(forbidden), `${id} should not critique ${forbidden}`);
    });
  });
});
