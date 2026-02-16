# Olho Extension Architecture

## Extension Structure
- `manifest.json`: MV3 configuration, permissions, action popup, options, and service worker entry.
- `background/`: Service worker for capture/record orchestration, messaging, and long-running tasks.
- `content/`: Content scripts for page DOM access, region selection, and in-page overlays.
- `popup/`: Action UI for capture and navigation.
- `editor/`: Library UI and annotation workspace.
- `storage/`: IndexedDB access layer, models, migrations.
- `utils/`: Shared helpers (messaging, ids, time, media helpers).
- `styles/`: Shared design tokens and base styles.

## Data Flow
- UI sends typed requests over `chrome.runtime.sendMessage`.
- Service worker validates request, dispatches to capture/record/storage modules.
- Results are stored in IndexedDB and returned via response message.
- Editor reads from storage and renders list and detail views.

## Storage Model
- IndexedDB database `snaplib`.
- Stores:
  - `folders`: `folderId` (PK), `name`, `createdAt`, `updatedAt`.
  - `items`: `itemId` (PK), `type`, `folderId`, `title`, `tags[]`, `createdAt`, `updatedAt`, `width`, `height`, `durationMs`, `mimeType`, `sizeBytes`.
  - `blobs`: `itemId` (PK), `blob`.
- Default folder `Unsorted` created on first run.

## Screenshot Pipeline
- Popup sends capture intent.
- Service worker identifies active tab.
- Capture module uses `chrome.tabs.captureVisibleTab` for visible shots.
- Full-page capture uses content script to scroll/segment then stitches in worker.
- Region capture uses content script crop overlay, returns bounds.
- Captured bitmap is converted to blob and stored as item + blob.

## Recording Pipeline
- Popup sends start recording.
- Service worker requests tab capture via `chrome.tabCapture` or `getDisplayMedia`.
- Recorder module streams to MediaRecorder.
- Chunks are buffered and finalized to a Blob on stop.
- Result is stored as a video item + blob.

## Annotation Engine Design
- Editor loads media into a canvas overlay.
- Annotation engine manages layers: base media, vector annotations, and text.
- Tools: pen, rectangle, arrow, text, highlight, crop.
- Operations are recorded as JSON actions for undo/redo.
- Export pipeline re-renders layers to a single bitmap for saving.

## Folder CRUD Logic
- Create: generate `folderId`, insert row.
- List: read all folders sorted by name.
- Rename: update `name`, bump `updatedAt`.
- Delete: reassign items to `Unsorted`, then remove folder.

## State Management Approach
- UI uses local in-memory state per view with explicit refresh on mutations.
- Storage module is the single source of truth for persisted data.
- Background worker is stateless across restarts; critical data lives in IndexedDB.

## Security Considerations
- Minimal permissions; only request `tabs`, `storage`, and capture-specific permissions.
- Validate message types and payloads in service worker.
- Avoid executing arbitrary page scripts; content scripts only read DOM and draw overlays.
- Sanitize user-provided titles and tags before rendering.

## Performance Considerations
- Use indexedDB transactions with batched writes.
- Store large binaries in `blobs` store to avoid bloating metadata.
- Defer thumbnail generation to idle time.
- Use lazy rendering in library list for large datasets.
- Release media streams immediately after capture/recording.
