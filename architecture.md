# Olho Extension Architecture

## Extension Structure
- `manifest.json`: MV3 configuration, permissions, popup, options, and service worker.
- `service_worker.js`: message routing and orchestration.
- `src/background/`: capture and recording modules.
- `src/popup/`: popup UI and actions.
- `editor.html` + `editor.js`: annotation editor UI.
- `gallery.html` + `gallery.js`: local gallery UI.
- `src/storage/`: local storage model for folders and items.

## Data Flow
- Popup sends typed messages with `chrome.runtime.sendMessage`.
- Service worker validates message type and executes capture/record flows.
- Captures are sent to the editor via runtime message and cached in session storage.
- Editor renders the image and saves outputs to local storage.
- Gallery reads local storage and exposes CRUD actions.

## Storage Model
Primary storage uses `chrome.storage.local` with the following model:
- `folders`: `{ id, name, createdAt }`
- `items`: `{ id, folderId, type, blobUrl, createdAt, metadata }`

Notes:
- `blobUrl` is session-scoped; persistent binaries should be stored in IndexedDB.
- IndexedDB modules exist for future blob persistence.

## Screenshot Pipeline
- Popup sends `capture_visible` or `capture_full`.
- Service worker identifies the active tab and calls capture module.
- Full-page capture scrolls and stitches via `chrome.scripting` + `tabs.captureVisibleTab`.
- Result is stored in session storage and opened in the editor.

## Recording Pipeline
- Popup sends `record_start`.
- Service worker opens `record.html`, which requests `getDisplayMedia`.
- MediaRecorder collects chunks and saves a WebM blob.
- Result is saved to local storage and surfaced in the gallery.

## Annotation Engine Design
- Single canvas with a base image and an action list.
- Tools: pen, highlight, shapes, arrow, line, text, blur, eraser, crop, resize.
- Undo/redo stack for actions and destructive operations (crop/resize).
- Export merges base image and annotations into a single bitmap.

## Folder CRUD Logic
- Create: insert folder entry.
- Rename: update folder name.
- Delete: remove folder, orphaned items remain unassigned.
- Gallery exposes move/rename/delete for items.

## State Management Approach
- Editor keeps in-memory state and re-renders from action list.
- Gallery reads from storage on load and on mutations.
- Service worker is stateless; critical data lives in storage.

## Security Considerations
- Minimal permissions and explicit capture flows.
- Message validation in the service worker.
- No network calls; all data remains local.
- Editor input sanitized before rendering as text.

## Performance Considerations
- Use batched operations for storage updates.
- Limit re-render cost with action-based rendering.
- Avoid storing large binaries in storage; prefer IndexedDB for blobs.
