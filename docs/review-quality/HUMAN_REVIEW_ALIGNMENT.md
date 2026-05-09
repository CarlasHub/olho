# Human Review Alignment

## Review Standard

Olho Review should behave like a senior product designer, UX reviewer, accessibility-visible reviewer, and design systems reviewer examining a visible interface before release.

The review should prioritise:

- visual hierarchy
- UX clarity
- accessibility-visible risk
- design-system consistency
- enterprise polish
- root-cause design problems
- actionability

It should not prioritise:

- generic scanner messages
- isolated cosmetic nits
- duplicate symptoms
- vague opinions
- findings without visible evidence
- claims about invisible behaviour

## Human Reviewer Expectations

Each benchmark expectation file defines:

- the intended user goal
- expected strong findings
- weak findings to avoid
- root-cause observations
- merge guidance
- scanner-spam examples

The expected findings are not scripts for exact copy matching. They are calibration targets for whether the tool finds the same class of issue a strong reviewer would identify.

## Root Cause Preference

The benchmark favours broad, actionable root-cause findings over fragmented symptoms.

Prefer:

```txt
The hero area lacks a clear reading path because the image, heading, and action group compete for attention.
```

Avoid splitting the same issue into low-value fragments:

```txt
Heading weak.
CTA issue.
Image issue.
Spacing issue.
```

Fragmented output increases cognitive load for the user and makes the tool feel like a scanner rather than a professional reviewer.

## False Positive Criteria

A finding is treated as a likely false positive when it is:

- vague
- scanner-like
- contradicted by the benchmark intent
- a nitpick a senior reviewer would ignore
- a duplicate of a stronger finding
- based on editor chrome that should have been excluded
- framed as certainty without enough evidence

## Missed Issue Criteria

A missed issue is recorded when the review fails to identify a benchmarked human-review concern, especially:

- broad hierarchy problems
- weak reading path
- CTA ambiguity
- dense or overwhelming composition
- readability risk
- design-system drift
- enterprise-polish weakness
- Zeplin/Figma artboard scoping issues

## Ollama Evaluation Modes

The quality framework is prepared to compare:

- deterministic only
- deterministic plus Ollama text refinement
- deterministic plus Ollama synthesis
- deterministic plus local vision runtime plus Ollama synthesis

Current tests focus on deterministic benchmark output and the shared report/marker quality contract. Future runs should store mode-specific results under `tests/review-benchmarks/evaluation-results/`.

The local comparison runner is:

```sh
OLLAMA_ENDPOINT=<local-ollama-endpoint> node scripts/run-ollama-review-quality-comparison.mjs
```

The runner records deterministic-only results and local Ollama deltas. A negative Ollama delta is a useful calibration signal: it means the deterministic review or AI validation layer is currently preserving stronger human-review alignment than the raw model output.

## Review Output Acceptance

A benchmark review is moving toward human alignment when:

- top findings match the user goal and risk level
- findings include visible evidence
- recommendations are specific and actionable
- root causes are merged cleanly
- weak findings are suppressed
- editor chrome is excluded in design-area mode
- exports read like a professional review document
