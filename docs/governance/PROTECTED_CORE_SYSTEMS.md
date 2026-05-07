# Protected Core Systems

## Purpose

This document defines the existing Olho systems that must be protected while building Olho Review.

The screenshot tool already contains valuable working functionality. Review Mode must be added without destabilising it.

## Protected Systems

The following systems are protected:

```txt
capture/
editor/
recording/
memory/
storage/
export/
settings/
annotations/
```

These names represent product ownership areas. The current repository may not use these exact top-level folders for every area, so protected status applies to the runtime responsibility, not only the path name.

## Current Repository Mapping
### Capture
Representative files:
- `src/background/capture.js`
- `service_worker.js`
- `popup.js`
- `popup.html`
- `popup.css`
- `offscreen.js`
- `offscreen.html`

Protected behavior:
- Visible capture.
- Region capture.
- Full-page capture.
- Element capture.
- Capture handoff destinations.
- Clipboard fallback handling.
- Offscreen local processing.

### Editor
Representative files:
- `editor.js`
- `editor.html`
- `editor.css`
- `src/editor/crop.js`
- `src/editor/resize.js`
- `src/editor/viewport.js`

Protected behavior:
- Loading pending and existing captures.
- Base image transforms.
- Tool state.
- Undo and redo.
- Save, overwrite, copy, and download flows.
- Keyboard interaction.

### Recording
Representative files:
- `record.js`
- `record.html`
- `record.css`
- `src/background/recorder.js`

Protected behavior:
- Display, tab, window, screen, camera, microphone, and system-audio flows.
- Countdown, pause, resume, stop, cancel.
- Webcam overlay composition.
- Draft restore.
- Local recording save.

### Memory
Representative files:
- `gallery.js`
- `gallery.html`
- `gallery.css`
- `src/gallery/`

Protected behavior:
- Local media library views.
- Search, folders, tags, favorites, trash.
- Bulk actions.
- Preview, duplicate, restore, delete.
- Storage usage display.

### Storage
Representative files:
- `src/storage/storage.js`
- `storage/db.js`
- `storage/models.js`
- `storage/migrations.js`
- `extension/models.js`

Protected behavior:
- IndexedDB schema.
- Blob persistence.
- Migration from legacy stores.
- MediaRepository contracts.
- Draft recording persistence.
- Settings persistence.
- Trash and restore semantics.

### Export
Representative files:
- `export-report.js`
- `export-report.html`
- `export-report.css`
- `scripts/package.mjs`
- `scripts/package-source.mjs`

Protected behavior:
- Local file export.
- Report generation.
- ZIP export.
- Clipboard helpers and download fallbacks.
- Package output.

### Settings
Representative files:
- `options.js`
- `options.html`
- `options.css`
- `privacy.js`
- `privacy.html`
- `PRIVACY.md`
- `PERMISSIONS.md`

Protected behavior:
- Permission explanations.
- Privacy controls.
- Local-only settings.
- User preferences.
- Documentation parity.

### Annotations
Representative files:
- `src/editor/annotation-model.js`
- `editor.js`
- `editor.html`
- `editor.css`
- `tests/annotation-model.unit.test.mjs`

Protected behavior:
- Annotation model shape.
- Tool semantics.
- Hit testing.
- Selection and movement.
- Flattened export behavior.
- Redaction safety expectations.

## Protection Levels
### Level 1: Read-Only Integration
Review code reads stable public outputs from protected systems through approved adapters.

Allowed without protected core modification:
- Reading local media metadata through existing public APIs.
- Reading image Blob data through approved repository methods.
- Receiving explicit source handoff payloads.
- Referencing existing item IDs in review sessions.

### Level 2: Adapter Or Handoff Addition
A narrow integration point is added to expose stable review input.

Required:
- Feature contract.
- Exact protected file list.
- Compatibility explanation.
- Tests proving existing behavior is unchanged.
- Documentation update.

### Level 3: Protected Behavior Change
Existing protected behavior changes.

Required:
- Approved feature contract.
- Architecture review.
- Regression tests.
- Real browser verification.
- Manual QA when browser permissions or hardware are involved.
- Rollback plan.
- `npm run verify:release`.

## Prohibited Changes Without Approval
- Rewriting capture flows for review needs.
- Changing editor annotation semantics to support review findings.
- Replacing storage schema without migration plan.
- Adding remote services to protected systems.
- Adding telemetry or analytics.
- Changing export formats without compatibility handling.
- Moving review state into core media records without schema approval.
- Changing settings defaults in ways that weaken privacy.
- Removing existing screenshot, recording, annotation, storage, or export behavior.

## Allowed Review Integration Patterns
Preferred:
- `src/review/adapters/core-media-read-adapter.js` reads existing media through stable APIs.
- `src/review/contracts/` defines review source payloads.
- Review sessions store references to core media IDs without mutating the media item.
- Review exports build from review session data and local source references.

Acceptable with approval:
- Adding a read-only handoff from editor to review workspace.
- Adding a user-triggered "review this screenshot" entry point.
- Adding review metadata references if schema versioning and migration are complete.

Not acceptable:
- Review modules importing editor internals.
- Review modules invoking capture.
- AI providers reading directly from storage.
- Review UI writing annotation state directly.

## Required Regression Evidence By Protected Area
Capture changes:
- Capture unit or integration tests.
- Real browser capture flow when user-facing.
- Manual browser permission check when required.

Editor changes:
- Editor workflow tests.
- Annotation model tests when annotations are touched.
- Keyboard and export checks when relevant.

Recording changes:
- Recording system tests.
- Draft restore checks.
- Manual picker or hardware checks when required.

Memory and storage changes:
- MediaRepository tests.
- Migration tests.
- Persistence and restore tests.

Export changes:
- Export-sharing tests.
- Output validation audit.
- Manual file inspection when visual output changes.

Settings changes:
- Settings unit tests.
- Privacy gate.
- Permission documentation parity.

Annotations changes:
- Annotation unit tests.
- Editor interaction tests.
- Flattened export verification when redaction or masking is involved.

## Protected Core Change Request Requirements
A protected core change request must include:
- Reason review-only architecture is insufficient.
- Exact files, functions, handlers, registries, renderers, tests, and docs involved.
- Before and after behavior.
- Backward compatibility impact.
- Data migration impact.
- Privacy impact.
- Test plan.
- Manual verification plan.
- Rollback plan.

If these details are not known, implementation must not begin.
