# Architecture Rules

## Scope
These rules govern future Olho Review implementation. They do not implement review features. They define the boundaries that review code must follow when development begins.

## Architectural Objective
Review functionality must be added as a separate domain beside the existing screenshot, annotation, recording, storage, and export systems. The review domain may read from protected systems through explicit adapters. It must not own, rewrite, or silently change protected core behavior.

## Primary Architecture Rule
Olho Review must be added as a separate review layer on top of the existing screenshot tool.

Existing capture, editor, memory, recording, storage, settings, annotation, and export workflows must remain stable.

## Required Review Structure
All new review functionality should live under `src/review/`.

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
```

The review root is `src/review/`. Do not create nested duplicate review roots.

## Boundary Model
```text
Protected core systems
  capture, editor, recording, memory, storage, export, settings, annotations
        |
        | read-only adapters and explicit handoff contracts
        v
Review source model
        |
        v
Evidence store -> Review engine -> Review modules -> Normalized findings
        |              |                |
        |              |                v
        |              |          Optional AI provider boundary
        v              v
Review UI <------ Review session storage ------> Review export
```

The review engine must depend on contracts, not protected internals.

## Separation Of Concerns
### Capture Layer
Responsible for:
- Tab capture.
- Full-page capture.
- Screen and window capture.
- Element capture.
- Local image import.
- Recording capture.

The capture layer must not contain review logic.

### Editor Layer
Responsible for:
- Annotation editing.
- Drawing tools.
- Cropping.
- Resizing.
- Image editing.
- Export from editor.

The editor layer must not contain review decision logic.

### Review Layer
Responsible for:
- Visual analysis.
- Review findings.
- Region detection.
- Overlay markers.
- Review reports.
- AI-enhanced commentary.

The review layer must not mutate original captures during review.

### AI Layer
Responsible for:
- Optional reviewer commentary.
- Optional structured finding refinement.
- Optional recommendation wording.

AI must not be required for core review functionality.

## Layer Rules
### Source Adapters
Source adapters convert existing artifacts into review-safe inputs.

Allowed:
- Read screenshot metadata.
- Read local image Blob data through approved media APIs.
- Read user-provided webpage metadata when available.
- Read design screen imports when implemented through a review contract.

Prohibited:
- Starting captures directly.
- Mutating editor state.
- Changing annotation model behavior.
- Writing to core media records without an approved storage contract.
- Inferring unavailable DOM facts from screenshots alone.

### Evidence Store
The evidence store records the basis for review findings.

Required:
- Source reference.
- Image dimensions.
- Region coordinates when applicable.
- Crop references when generated.
- DOM excerpts only when webpage review explicitly captured them.
- Manual reviewer notes when used.
- Tool or module that produced the evidence.

The evidence store must be local. It must not upload source material.

### Review Engine
The engine orchestrates review modules and normalizes output.

Required responsibilities:
- Validate source input.
- Run selected review modules.
- Enforce finding schema.
- Enforce category registry.
- Enforce mandatory evidence.
- Normalize severity, confidence, and review type.
- Preserve unsupported or inconclusive states.

Prohibited responsibilities:
- Capturing screenshots.
- Editing screenshots.
- Persisting media outside review repositories.
- Calling AI providers directly from review modules.
- Producing user-facing claims that skip schema validation.

### Review Modules
Review modules are category-specific analyzers.

Each module must define:
- Supported source types.
- Input evidence requirements.
- Output finding categories.
- Failure modes.
- Deterministic checks where available.
- Manual-review limitations.
- Tests for valid, invalid, and insufficient evidence.

Modules must not call remote services, access credentials, or mutate protected core systems.

### Review UI
The review UI displays review sessions and findings.

Required:
- Show visual evidence anchors.
- Show severity, confidence, and review type.
- Distinguish confirmed issues, review issues, and manual checks.
- Preserve keyboard access and focus order.
- Avoid presenting AI output as final authority.
- Keep source images central to the workflow.

Prohibited:
- Chat-first interaction as the primary product surface.
- Hidden review state that cannot be exported.
- UI claims that are not present in the review data model.

### Review Storage And Export
Review storage and export must keep review data separate from core media data unless an approved contract says otherwise.

Required:
- Local persistence.
- Explicit review session records.
- Exportable evidence.
- Stable schema versioning.
- Migration plan for schema changes.

Prohibited:
- Silent upload.
- Cloud backup.
- Telemetry.
- Unversioned schema changes.
- Exporting claims without evidence references.

## AI Provider Isolation
AI support, if implemented later, must be isolated behind `src/review/ai/`.

Required provider boundary:

```text
src/review/ai/providers/
  openai-provider.js
  gemini-provider.js
  groq-provider.js
  ollama-provider.js
  openrouter-provider.js
```

Rules:
- No provider-specific logic may be placed in capture modules.
- No provider-specific logic may be placed in editor modules.
- No provider-specific logic may be placed in export core.
- No provider-specific logic may be placed in UI components outside review.
- No provider-specific logic may be placed in finding schema definitions.
- No review module may call a provider directly.
- No provider may be enabled by default if it sends data outside the device.
- No bundled provider credentials are allowed.
- Provider input must be constructed from an explicit evidence package.
- Provider output must be normalized and validated before becoming a finding.
- Provider output must include uncertainty and cannot bypass evidence rules.
- Remote provider use must be opt-in, user-configured, and clearly disclosed.
- Local deterministic checks must remain usable without AI.

AI is an implementation detail, not the product identity.

## Local-First Requirement
The application must work without:
- Backend server.
- Database server.
- Cloud storage.
- Mandatory AI API.
- Remote telemetry.

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

## Accessibility Rules
Review Mode UI must support:
- Keyboard navigation.
- Visible focus indicators.
- Meaningful button labels.
- Screen reader understandable controls.
- No color-only status communication.

## Review Finding Schema Requirements
Every finding must include:

```text
id
schemaVersion
sessionId
sourceId
category
severity
confidence
reviewType
status
title
description
evidence
visualAnchor
rationale
recommendation
verification
createdAt
updatedAt
```

Valid severity values:
- `critical`
- `high`
- `medium`
- `low`
- `info`

Valid review type values:
- `confirmed`
- `review-issue`
- `manual-check`

Valid status values:
- `open`
- `accepted`
- `dismissed`
- `resolved`
- `needs-more-evidence`

## Category Governance
Categories are controlled by a registry. A category must not be introduced only as display text.

Each category requires:
- Stable ID.
- Human-readable label.
- Scope.
- Out-of-scope examples.
- Evidence requirements.
- Severity guidance.
- Accessibility certainty rules where relevant.
- Tests.
- Documentation.

## Dependency Rules
Review functionality may add dependencies only when:
- The dependency is local-first compatible.
- It does not introduce telemetry or remote calls.
- It is needed by implemented runtime code.
- It is covered by privacy and release scans.
- It does not duplicate protected core capabilities without justification.

## Integration Rules
Review code may integrate with protected systems only through:
- Read-only media adapters.
- Explicit source handoff payloads.
- Documented review session references.
- Export adapters that preserve existing export behavior.

Any deeper integration is a protected core change and must follow `PROTECTED_CORE_SYSTEMS.md`.

## Documentation Rules
Architecture, schemas, tests, UI behavior, and release gates must remain aligned. Do not document a review command, provider, category, export, or UI state unless it is actually implemented or explicitly labeled as proposed.
