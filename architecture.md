# Olho Architecture

## 1. Extension Topology
- `manifest.json`: MV3 manifest, permissions, popup, options, background worker.
- `service_worker.js`: runtime message router for capture, recording, and navigation actions.
- `offscreen.html` + `offscreen.js`: MV3 offscreen DOM processor for local video thumbnail extraction.
- `src/background/capture.js`: visible, region, full-page, and element screenshot flows with local stitching/cropping.
- `src/background/recorder.js`: recording lifecycle using `getDisplayMedia` + `MediaRecorder`.
- `src/storage/storage.js`: `MediaRepository` facade, migration layer, and compatibility adapters.
- `storage/db.js`: IndexedDB Blob data layer for local library CRUD, thumbnails, trash, settings, and usage metrics.
- UI pages:
  - `popup.html`
  - `editor.html`
  - `record.html`
  - `gallery.html`
  - `options.html`
  - `privacy.html`
  - `export-report.html`

## 2. Storage Architecture
### Source of truth
IndexedDB (`olho_local_library`) is the primary media persistence layer:
- `media`: metadata + Blob records (`id`, `kind`, `title`, `mimeType`, `sizeBytes`, dimensions, duration, source type, folder, tags, favourite, `blob`, `thumbnailId`, `metadata`)
- `thumbnails`: generated thumbnail/poster blobs
- `folders`: folder metadata
- `tags`: normalized tag index with usage count
- `settings`: local preferences (default save, ask before deleting, thumbnail size, export format, local-only privacy lock)
- `trash`: soft-deleted media snapshots for restore
- `recording_drafts`: unsaved recording preview blobs and metadata for crash-safe restore

### Small settings
`chrome.storage.local` stores only lightweight migration state. App settings and share-helper defaults are persisted in IndexedDB `settings`.

`chrome.storage.session` is used for transient editor drafts and pending capture handoff.

### Legacy migration
`src/storage/storage.js` performs idempotent migration from:
- legacy `chrome.storage.local` `snaplib_storage`
- legacy IndexedDB `snaplib`

Legacy sources are preserved; migration records broken legacy items in migration metadata instead of silently dropping them.

## 3. Capture Pipeline
1. Popup sends typed capture message.
2. Service worker resolves active tab and dispatches capture flow.
3. Capture module:
   - visible: direct `tabs.captureVisibleTab`
   - region: injected drag selector + crop
   - full page: scroll grid stitch with sticky/fixed hiding, lazy-content trigger, and canvas safety checks
   - element: hover outline, click select, viewport crop or full-page fallback crop
4. Captures are persisted in local IndexedDB via `saveMedia`, then routed to editor/library/download by service worker destination handling.
5. Clipboard destination is fulfilled in Olho extension pages (popup/editor) using direct user click clipboard writes; if blocked, Olho falls back to PNG download and an editor copy handoff.

## 4. Editor Pipeline
1. Editor loads pending capture or existing item by ID.
2. Annotation model stays separate from the base image until export/save flattening.
3. Tools write structured action objects (select/move/resize, draw, highlight, line, arrow, rectangle, rounded rectangle, ellipse, text, numbered marker, callout, blur, pixelate, redaction block).
4. Undo/redo snapshots cover annotation and base transforms (crop, resize, rotate).
5. Export paths are local-only: PNG/JPG/WebP/PDF download, PNG clipboard copy, Markdown/HTML snippet copy, annotation/project JSON export.
6. Save default behavior creates a new edited copy in IndexedDB. Overwrite is explicit and confirmation-gated.
7. Project metadata (`olhoProject`) can be reopened for further local editing.

## 5. Recording Pipeline
1. Popup opens `record.html` with source/audio/webcam presets.
2. Recorder setup page handles mode selection (`tab`, `window`, `screen`, `camera`), microphone toggle, system-audio toggle, webcam overlay controls, countdown, and folder/tag defaults.
3. Recorder requests browser media streams (`getDisplayMedia` and/or `getUserMedia`) based on setup choices.
4. Video is composited locally on canvas so webcam overlay is embedded into the final file (corner position, shape, size).
5. Audio tracks (system audio and microphone where selected/available) are mixed locally in-browser.
6. `MediaRecorder` stores chunk buffers locally; pause/resume/stop/cancel are handled through keyboard and overlay controls.
7. On stop, Olho creates a local preview Blob and persists an unsaved draft in IndexedDB for restore across page close/reopen/browser restart.
8. Recorder preview supports explicit “Save Progress” updates (title/folder/tags) into the local draft entry.
9. Save writes through MediaRepository (`saveMedia`) into IndexedDB Blob storage and removes the draft entry; quota failures surface explicit local fallback guidance.

## 6. Gallery And Reporting
- Gallery is a local media library backed by MediaRepository (`listItems`, `listFolders`, `listTags`, `listTrash`, `getStorageUsage`).
- Supports view modes (`all`, `screenshots`, `recordings`, `favourites`, `recent`, `folders`, `tags`, `trash`, `storage`, `exports`).
- Item cards expose open, rename, duplicate, edit screenshot, preview recording, download, copy image, PDF export, folder move, tag updates, favourite toggle, and trash.
- Bulk actions support select-all visible, move folder, tag apply, favourite/unfavourite, trash, restore, permanent delete, ZIP export, and metadata JSON export.
- Storage panel shows counts, byte usage, largest files, metadata export before delete, and strong-confirmation delete-all-local-data flow.
- Export report page generates:
  - Markdown summary
  - plain-text summary
  - HTML summary/report
  - PDF report with embedded local media previews (generated fully in-browser, no remote renderers)
  - JSON report metadata
  - local ZIP bundle with report + media
  - Jira/GitHub/Trello/mailto prefilled helper links (user initiated)
  - per-item file copy attempts with local download fallback when clipboard file copy is blocked
  - per-item `Set Source URL` control for older captures that predate `storeSourceUrl`

## 7. Security And Privacy Controls
- No remote scripts.
- No backend endpoints.
- No telemetry.
- No eval/Function constructor.
- Minimal permission model with explicit in-product explanations.
- Sensitive media is handled as local data only.
- Offscreen processing is local-only and runs inside extension context.

## 8. Accessibility Baseline
- Native buttons/inputs for interactive controls.
- Keyboard shortcuts for editor/recorder actions.
- ARIA live regions for status updates.
- Visible focus styles in all primary pages.
- Reduced-motion CSS fallbacks where UI transitions exist.

## 9. Packaging
- `npm run build` copies runtime files into `dist/build`.
- `npm run package` zips `dist/build` into `dist/olho-extension.zip`.
- Package validation checks that `manifest.json` is at zip root.
- `npm run verify:release` (`npm run release:gate`) runs strict release verification:
  - lint
  - typecheck (or JS-only pass-through if TypeScript is not present)
  - unit/integration tests
  - accessibility tests
  - privacy tests
  - no-remote-services static scan tests
  - no-competitor-references scan tests
  - build
  - real-browser e2e tests against unpacked `dist/build` extension pages (popup, editor, gallery, persistence, export, and interaction checks)
  - package
  - dependency scans, source scans, permissions/doc parity checks, and package content checks
- On successful verification, `RELEASE_CHECK.md` is generated with version/date/commit, feature matrix, test gates, known limitations, permissions, privacy statement, package path, and manual smoke checklist.
