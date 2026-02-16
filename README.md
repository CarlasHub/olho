# Olho

## Project Overview
Olho is a Chrome Extension (Manifest V3) for capturing screenshots, recording the screen, and managing a local library of media. The extension is designed as a local-first tool that stores all data on-device, with no external backend.

## Features
- Screenshot capture (visible, region, full page).
- Screen recording with optional microphone.
- Local gallery with folders, renaming, deletion, and downloads.
- Annotation workspace with drawing, shapes, blur, text, and undo/redo.
- Local-only storage using `chrome.storage.local` and IndexedDB modules.

## Architecture
- **Popup UI** triggers actions and dispatches typed messages to the service worker.
- **Background service worker** coordinates capture and recording.
- **Content scripts** handle page-specific overlays (selection, cropping, annotation hints).
- **Editor/Gallery** pages read from local storage and render previews.
- **Storage** is local-first using IndexedDB and `chrome.storage.local` modules.

See `architecture.md` for details.

## Installation
1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the project root folder.

## Local Development
- Make changes in source files under `src` or root extension pages.
- Reload the extension from `chrome://extensions` after changes.
- Open the service worker console from the extension card for logs.

## Packaging
1. Ensure all assets (icons, pages, scripts) are included.
2. Remove any local-only test pages if not intended for release.
3. In `chrome://extensions`, click **Pack extension** and choose the project root.

## Publishing Notes
- Manifest V3 requires a service worker for background tasks.
- Use minimal permissions and document their purpose.
- Provide clear privacy statements since media capture is sensitive.

## Limitations
- Full-page capture depends on scrolling and can be slow on very long pages.
- Client-side MP4 conversion is not guaranteed; WebM is the default.
- Clipboard copy requires permissions and may fail on some platforms.

## Future Roadmap
- Region capture with in-page crop overlay.
- Thumbnail generation and caching.
- Advanced export workflows (PDF, GIF).
- Cloud sync as an optional feature.
- Team sharing and collaborative annotations.
