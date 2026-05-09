# Benchmark Scoring

## Score Labels

Olho Review quality uses label-based scoring:

- `Strong`
- `Mostly strong`
- `Needs attention`
- `Weak`

The framework avoids fake numeric precision. Scores are review indicators, not absolute truth.

## Dimensions

### Relevance

Checks whether generated findings align with expected human-review findings for the benchmark.

### Depth

Checks whether findings include issue, visible evidence, impact, recommendation, best practice reference, review rationale, affected users, suggested priority, marker summary, and acceptance criteria.

### UX Reasoning

Checks whether findings explain user impact, cognitive load, scanability, task clarity, and decision effort where applicable.

### Accessibility-Visible Reasoning

Checks whether visible readability, contrast risk, target clarity, colour dependency, low-vision impact, motor impact, or cognitive load are handled without overclaiming full accessibility compliance.

### Design-System Reasoning

Checks whether repeated component drift, inconsistent button/card treatment, spacing rhythm, radius, shadow, icon handling, and typography scale are identified where relevant.

### Root-Cause Identification

Checks whether findings describe broader causes rather than only isolated symptoms.

### Noise Control

Checks for scanner-like wording, weak benchmark-specific findings, excessive duplicates, and low-value findings.

### Prioritisation Quality

Checks whether the first finding categories match the expected senior-review priority order.

### Human-Like Wording

Checks whether wording avoids robotic phrases, generic praise, vague opinions, and scanner-style output.

### Marker Accuracy

Checks whether marker rectangles overlap expected affected regions in benchmark geometry. This is stronger than a structural non-empty-rectangle check, but it is still fixture-level evidence rather than a browser screenshot pixel-diff.

### Zeplin/Figma Scoping Accuracy

Checks that design-area-only fixtures exclude editor chrome from review metrics and do not produce findings about side panels, toolbars, specs, comments, layers, or properties panels.

### Export/Report Usefulness

Checks whether exported report finding data includes ticket-ready output and acceptance criteria.

## Running Quality Tests

Run the dedicated quality tests:

```sh
node --test tests/review-quality/*.test.mjs
```

Run the full local unit suite:

```sh
npm test
```

Run the release gate:

```sh
npm run verify:release
```

## Interpreting Failures

A failing quality-framework test means the evaluator, schema, or benchmark contract is inconsistent.

A `Weak` or `Needs attention` quality score inside a passing test means the tool found a real review-quality gap. Those gaps should be addressed in engine calibration work, then compared against the same benchmark suite.

## Current Known Calibration Weaknesses

The calibrated marketing hero, dashboard, dense admin, pricing, typography, Zeplin artboard, Figma frame, and inconsistent design-system fixtures now lead with the expected human-priority categories.

Remaining deterministic calibration gaps include onboarding and mobile priority ordering. Marker pixel overlap is benchmarked from fixture geometry; browser screenshot pixel-diff proof remains separate e2e work.

Real Ollama mode comparisons are stored in `tests/review-benchmarks/evaluation-results/ollama-comparison-current.json` when `scripts/run-ollama-review-quality-comparison.mjs` can reach a local Ollama endpoint.
