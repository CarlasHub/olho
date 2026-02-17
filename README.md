# Olho

## Project Overview
Olho is a Chrome Extension (Manifest V3) for capturing screenshots, recording the screen, and managing a local media library. The extension is local-first and stores data on-device without a backend.

## Features
- Screenshot capture: visible area, region (planned), full page.
- Screen recording with optional microphone.
- Minimal editor with annotations, crop, resize, and export.
- Local gallery with folders, rename, delete, download, copy.
- Local storage via `chrome.storage.local` for items and folders.

## Architecture
- **Popup UI** dispatches typed messages to the service worker.
- **Background service worker** runs capture/record workflows.
- **Editor** renders the current capture and applies annotations.
- **Gallery** renders local items and supports CRUD operations.
- **Storage** uses `chrome.storage.local` for item metadata and blob URLs.

See `architecture.md` for details.

## Installation
1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the project folder.

## Local Development
- Edit files in the project folder.
- Reload the extension from `chrome://extensions` after changes.
- Open the service worker console from the extension card for logs.

## Packaging
1. Ensure all assets are included.
2. Remove test-only pages if not intended for release.
3. In `chrome://extensions`, click **Pack extension** and choose the project folder.

## Publishing Notes
- Manifest V3 requires a service worker for background tasks.
- Use minimal permissions and document their purpose.
- Provide clear privacy statements since media capture is sensitive.

## Limitations
- Full-page capture depends on scrolling and can be slow on long pages.
- MP4 output is not guaranteed; WebM is the default.
- `blob:` URLs are session-scoped; persistent storage should use IndexedDB blobs.

## Future Roadmap
- Region capture with on-page crop overlay.
- Thumbnail generation and caching.
- Persisted binary storage via IndexedDB.
- Advanced export workflows (PDF, GIF).
- Optional sync and sharing.
