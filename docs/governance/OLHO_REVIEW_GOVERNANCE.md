# Olho Review Governance

## Purpose
Olho Review is a local-first visual UI/UX and accessibility review workspace for screenshots, webpages, and design screens. It is built on top of an existing screenshot, recording, annotation, storage, and export extension whose current production-critical behavior must remain stable.

This document defines the governance baseline for review functionality before implementation begins. It is binding for architecture, planning, implementation, testing, documentation, and release decisions.

## Product Direction
Olho Review exists to provide professional visual review of captured evidence. The primary artifact is the screenshot or design image. Findings must be anchored to visible evidence and must help a reviewer understand what is wrong, where it appears, why it matters, and how to verify it.

Olho Review is:
- Local-first.
- Privacy-friendly.
- Modular.
- Evidence-driven.
- Screenshot-centric.
- Visually focused.

Olho Review is not:
- A chatbot.
- An SEO scanner.
- An analytics platform.
- A Lighthouse clone.
- A cloud SaaS platform.
- A telemetry or benchmarking system.
- A replacement for manual accessibility review.

## Protected Core Systems
The existing screenshot and annotation extension remains the foundation of the product. These systems are protected and must not be casually modified:

- `capture/`
- `editor/`
- `recording/`
- `memory/`
- `storage/`
- `export/`
- `settings/`
- `annotations/`

In the current repository, those product areas map to files and folders such as:
- `src/background/capture.js`
- `service_worker.js`
- `editor.js`
- `editor.html`
- `editor.css`
- `src/editor/`
- `record.js`
- `record.html`
- `src/background/recorder.js`
- `gallery.js`
- `gallery.html`
- `src/gallery/`
- `src/storage/`
- `storage/`
- `export-report.js`
- `export-report.html`
- `options.js`
- `options.html`
- `src/editor/annotation-model.js`

Any future review implementation must integrate through explicit adapters, contracts, or handoff points. Direct rewrites of protected systems are prohibited unless an approved feature contract proves the change is necessary, scoped, tested, and reversible.

## Governance Principles
1. Preserve production-critical capture behavior.
2. Keep review functionality modular and isolated.
3. Treat screenshots and visual evidence as the source of truth.
4. Do not infer more certainty than the evidence supports.
5. Keep local-first behavior as a product guarantee, not a preference.
6. Keep AI optional, isolated, inspectable, and provider-agnostic.
7. Do not introduce remote services, telemetry, analytics, accounts, or cloud storage.
8. Maintain documentation, tests, schemas, UI, exports, and release gates together.
9. Make failure states explicit to users and release reviewers.
10. Do not ship review claims without evidence and verification.

## Primary Architecture Rule
Olho Review must be added as a separate review layer on top of the existing screenshot tool.

Existing capture, editor, memory, recording, storage, settings, annotation, and export workflows must remain stable.

## Proposed Review-Only Project Structure
The following structure is proposed for future review functionality only. It is not implemented by this governance change and must not be treated as existing code.

```text
src/review/
  engine/
  findings/
  overlays/
  prompts/
  ai/
    providers/
      openai-provider.js
      gemini-provider.js
      groq-provider.js
      ollama-provider.js
      openrouter-provider.js
  reports/
  store/
  ui/
  utils/

docs/review/
  review-engine.md
  review-finding-schema.md
  manual-review-guidance.md
```

This structure establishes a separate review domain. Review code may consume existing captures through read-only adapters. It must not become a replacement implementation for capture, editor, annotation, storage, or export systems.

The required root is `src/review/`. Do not create nested duplicate review roots.

## Separation Of Concerns
### Capture Layer
The capture layer is responsible for:
- Tab capture.
- Full-page capture.
- Screen and window capture.
- Element capture.
- Local image import.
- Recording capture.

The capture layer must not contain review logic.

### Editor Layer
The editor layer is responsible for:
- Annotation editing.
- Drawing tools.
- Cropping.
- Resizing.
- Image editing.
- Export from editor.

The editor layer must not contain review decision logic.

### Review Layer
The review layer is responsible for:
- Visual analysis.
- Review findings.
- Region detection.
- Overlay markers.
- Review reports.
- AI-enhanced commentary when explicitly enabled.

The review layer must not mutate original captures during review and must not couple findings to editor history.

### AI Layer
The AI layer is responsible for:
- Optional reviewer commentary.
- Optional structured finding refinement.
- Optional recommendation wording.

AI must not be required for core review functionality.

## Modular Review Architecture
Review functionality must be organized into independent layers:

- Source adapters: read screenshots, webpages, or design images into a review-safe source model.
- Evidence store: tracks screenshots, crops, coordinates, DOM excerpts where available, and reviewer notes.
- Review engine: orchestrates review modules and normalizes findings.
- Review modules: produce category-specific findings from evidence.
- AI provider layer: optional analysis provider boundary, isolated from product logic.
- Review UI: displays findings, evidence anchors, confidence, and verification status.
- Review storage/export: persists and exports review sessions without changing existing media storage semantics.

No module may bypass the engine and write directly into protected core storage or editor state.

## AI Provider Isolation
Provider logic must be isolated under `src/review/ai/providers/`.

Required provider boundary pattern:

```text
src/review/ai/providers/
  openai-provider.js
  gemini-provider.js
  groq-provider.js
  ollama-provider.js
  openrouter-provider.js
```

No provider-specific logic may be placed in:
- Capture modules.
- Editor modules.
- Export core.
- UI components outside review.
- Finding schema definitions.

Provider files listed here are an approved future boundary, not implemented files.

## Review Finding Schema Baseline
Every review finding must contain:

- Stable finding ID.
- Review session ID.
- Source ID.
- Category.
- Severity.
- Confidence.
- Status.
- Title.
- Evidence summary.
- Visual anchor with screenshot coordinates or region reference.
- Rationale.
- Recommendation.
- Verification method.
- Review type: confirmed, review issue, or manual check.
- Created and updated timestamps.

Accessibility findings must distinguish confirmed issues from guided manual checks. Heuristics must not be presented as final accessibility verdicts.

## Review Categories
The initial governed category set is:

- `visual-hierarchy`
- `layout-composition`
- `alignment-spacing`
- `typography-readability`
- `color-contrast`
- `affordance-interaction`
- `responsive-behavior`
- `accessibility-keyboard`
- `accessibility-semantics`
- `accessibility-forms-labels`
- `content-clarity`
- `design-system-consistency`
- `visual-privacy-risk`

New categories require a feature contract, evidence rules, tests, and documentation.

## Mandatory Evidence Rules
No review finding may be emitted without evidence. At minimum, a finding must include:

- The reviewed source.
- A visual anchor or explicit reason why a visual anchor is not applicable.
- The rule, heuristic, or reviewer method used.
- A confidence value.
- A verification method.
- A clear distinction between confirmed issue, review issue, and manual check.

Claims must be falsifiable. If a reviewer cannot inspect the evidence and understand the basis of the finding, the finding is invalid.

## Local-First Guarantees
Review functionality must preserve these guarantees:

- The application works without a backend server.
- The application works without a database server.
- The application works without cloud storage.
- The application works without mandatory AI API access.
- The application works without remote telemetry.
- No backend service dependency.
- No default remote AI provider.
- No bundled API keys.
- No telemetry, analytics, or behavioral tracking.
- No account requirement.
- No automatic upload of screenshots, DOM, metadata, or review output.
- Review sessions and exports remain local unless the user explicitly exports or shares files.
- Any future remote provider must be opt-in, user-configured, clearly disclosed, and isolated behind the AI provider boundary.

Allowed local storage:
- IndexedDB.
- `chrome.storage.local`.
- Local file export.

## Review Mode Entry Points
Review Mode may be opened from:
- Capture preview.
- Memory item.
- Imported image.
- Editor export handoff.
- Zeplin or design screenshot import in later phases.

Review Mode must not replace Editor Mode.

## Review Data Flow
Recommended review flow:

```text
Capture or import image
  -> Create review session
  -> Analyse screenshot and metadata locally
  -> Generate deterministic findings
  -> Optionally enhance with AI
  -> Render findings and overlays
  -> Export review report
```

## Forbidden Architecture Patterns
Do not:
- Mix AI provider logic into UI components.
- Add mandatory backend calls.
- Upload screenshots silently.
- Mutate original captures during review.
- Couple review findings to editor history.
- Replace existing export logic without approval.
- Store secrets in client-visible source code.
- Add telemetry without explicit product approval.

## Performance Rules
Review processing must:
- Avoid blocking the UI thread where possible.
- Handle large screenshots gracefully.
- Use batching for expensive operations.
- Avoid repeated full-image processing unnecessarily.
- Preserve original image quality.

## Review Mode Accessibility Rules
Review Mode UI must support:
- Keyboard navigation.
- Visible focus indicators.
- Meaningful button labels.
- Screen reader understandable controls.
- No color-only status communication.

## Change Classification
All review work must be classified before implementation:

- Governance-only: documentation, contracts, standards, and gates.
- Review-only: implementation under the review domain that does not modify protected systems.
- Adapter integration: narrow read-only or handoff integration with protected systems.
- Protected core change: any modification to protected systems.

Protected core changes require a feature contract, risk assessment, tests proving preserved behavior, and explicit release gate evidence.

## Definition Of Done For Review Features
A review feature is not done until:

- The exact runtime path is implemented.
- The feature contract is complete.
- Finding schema changes are documented and tested.
- Review categories are registered and documented.
- Privacy and local-first behavior are verified.
- Tests cover success, failure, and unsupported evidence cases.
- UI labels and keyboard behavior are reviewed when UI changes exist.
- Exports include the same evidence and uncertainty shown in the UI.
- `npm run verify:release` is run or a documented blocker is recorded.

## Governance Rationale
The project already has stable capture, recording, editor, storage, and export systems. The highest architectural risk is turning review functionality into a cross-cutting rewrite of those systems. This governance baseline prevents that by making review a separate domain with explicit adapters, evidence contracts, and release gates.

The second major risk is overclaiming automated review results. Olho Review must remain disciplined: visual review findings must be anchored to evidence, accessibility findings must distinguish automated and manual certainty, and AI must not become an unbounded product surface.
