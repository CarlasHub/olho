# UI Structure Review Contract

## Scope
Review rendered structure for:
- popup
- capture preview
- editor
- memory
- export
- recorder
- settings
- privacy

## Required Evidence
1. Real extension render on current build.
2. Desktop and narrow-screen screenshots for each surface.
3. Empty/error/loading/long-content coverage where applicable.
4. Keyboard focus trail evidence.
5. Overflow and clipping checks.
6. Console/page error checks.

## Defect Classification
- Objective breakage: measurable structural failures (overlap, clipped controls, hidden-state failure, dead controls).
- Usability risk: task ambiguity, weak hierarchy, unclear actions.
- Style suggestion: non-blocking visual preference.

## Pass Criteria
- No objective structural blockers.
- Distinct primary and destructive actions are visible.
- Hidden controls are not rendered when hidden.
- No console/page errors during walkthrough.
- Responsive layouts preserve task meaning.

## Status Vocabulary
- verified
- partially verified
- not verified
- blocked
