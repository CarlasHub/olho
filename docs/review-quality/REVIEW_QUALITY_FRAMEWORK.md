# Review Quality Framework

## Purpose

Olho Review quality is evaluated against human-review alignment, not finding count.

The benchmark framework checks whether deterministic review, optional local vision interpretation, and Ollama synthesis produce feedback that a senior UI/UX and accessibility-visible reviewer would consider relevant, useful, and appropriately prioritised.

## Quality Questions

The framework answers:

- Are findings relevant to the visible interface?
- Are findings useful to a designer, PM, or accessibility reviewer?
- Are findings too shallow or scanner-like?
- Are findings redundant?
- Are broader design problems missed?
- Does the review identify root causes rather than isolated symptoms?
- Does the wording feel professional and human-reviewed?
- Are findings prioritised in the order a senior reviewer would expect?
- Are markers tied to meaningful affected regions?
- Are Zeplin and Figma editor chrome excluded when design-area review is active?
- Do exports communicate the review as a professional design deliverable?

## Benchmark Structure

Benchmark assets live under:

```txt
tests/review-benchmarks/
  benchmark-pages/
  expected-findings/
  expected-priorities/
  evaluation-results/
```

The benchmark pages are self-contained HTML screens with deliberate design issues. They represent realistic interface patterns, including marketing pages, dashboards, forms, pricing, mobile mockups, design-tool shells, typography-heavy content, accessibility-visible failures, and design-system drift.

Expected findings are stored as JSON. They define what a human reviewer would likely prioritise, what weak findings should be avoided, root-cause observations, merge guidance, and scanner-spam patterns.

## Evaluation Harness

The shared harness is:

```txt
tests/review-quality/quality-harness.mjs
```

It runs benchmark fixtures through the real review engine and evaluates:

- matched expected findings
- missed expected findings
- false-positive candidates
- duplicate finding clusters
- prioritisation alignment
- expanded finding schema depth
- marker pixel-overlap quality
- export/report usefulness

The harness records quality gaps explicitly so future engine changes can be measured against the same human-review expectations. Calibrated benchmark fixtures now act as acceptance checks for priority ordering, root-cause synthesis, design-tool scoping, and marker placement.

## Test Coverage

Quality tests live under:

```txt
tests/review-quality/
  finding-relevance.test.mjs
  finding-depth.test.mjs
  synthesis-quality.test.mjs
  false-positive-rate.test.mjs
  missed-issue-rate.test.mjs
  prioritisation-quality.test.mjs
  zeplin-scoping-quality.test.mjs
  marker-pixel-accuracy.test.mjs
```

These tests verify that the benchmark framework runs, that findings preserve professional review fields, that clean interfaces avoid high-severity scanner noise, that calibrated fixtures do not miss expected root findings, that Zeplin/Figma design-area scoping excludes editor UI, and that marker rectangles overlap the affected benchmark regions.

## What The Tests Prove

The tests prove that Olho Review has a repeatable quality evaluation framework and that the current review output can be compared against human-review expectations.

They do not prove that the review engine is equivalent to a senior human reviewer. Current benchmark results still expose calibration work, especially for onboarding and mobile priority ordering and for browser-level visual overlap proof beyond fixture geometry.

## Manual Review Use

For each benchmark, reviewers should inspect:

- generated findings
- matched versus missed expected findings
- false-positive candidates
- first finding priority
- marker placement
- exported report structure

Quality improvements should reduce missed root-cause findings and false positives without increasing low-value scanner output.

## Ollama Comparison Runs

Real local Ollama comparisons are generated with:

```sh
OLLAMA_ENDPOINT=<local-ollama-endpoint> node scripts/run-ollama-review-quality-comparison.mjs
```

The script writes `tests/review-benchmarks/evaluation-results/ollama-comparison-current.json`. It compares deterministic-only results against local Ollama text-refine and synthesis modes for the calibrated marketing hero, Zeplin artboard, and Figma frame fixtures by default. Broader runs can be requested with `OLLAMA_BENCHMARK_IDS`.
