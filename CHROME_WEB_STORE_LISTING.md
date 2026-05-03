# Olho Chrome Web Store Listing Copy

## Short Description
Local-first capture and recording for Chrome with annotation, Memory library, and Send View exports.

## Long Description
Olho is a local-first Chrome extension for screenshots and screen recording.

Use Olho to capture what your eye sees, mark important details, store files in a local Memory library, and export share-ready bundles without cloud upload.

Olho is built for privacy and control:
- No accounts
- No telemetry
- No analytics
- No hosted share links
- No remote media processing

Everything runs locally in the extension and browser context. Exported files stay under user control.

## Feature List
- Capture View (visible viewport)
- Focus Area (selection capture)
- Scan Page (full-page capture with local stitching)
- Focus Element capture
- Mark View editor with annotation, blur/pixelate, redaction block, crop, resize, rotate, undo/redo
- Record View with screen/window/tab picker support, microphone toggle, webcam overlay, pause/resume, countdown, and timer
- Local Memory library with folders, tags, favourites, search, filters, sorting, bulk actions, and Out of Sight restore/delete
- Send View exports: PNG, JPG, WebP, PDF, WebM, HTML report, Markdown, JSON metadata, ZIP bundle
- User-initiated helpers for Jira/GitHub/Trello/mail drafts with manual file attachment

## Privacy-First Explanation
Olho stores screenshots and recordings locally in the browser profile.
Olho does not upload media, create accounts, track browsing history, use analytics, or sell data.

## Permission Explanations
- `activeTab`: capture only when user starts a capture action
- `tabs`: active-tab lookup and opening Olho pages
- `scripting`: temporary local overlays for capture flows
- `clipboardWrite`: copy actions triggered by user
- `storage`: local settings and media metadata/blob persistence
- `desktopCapture`: browser picker for recording sources
- `downloads`: user-initiated exports
- `offscreen`: local offscreen thumbnail generation

## Limitations
- WebM is the guaranteed recording export format.
- MP4/GIF conversion is not guaranteed as a universal local pipeline.
- Clipboard write may be blocked by browser or OS policy in locked-down environments; Olho shows explicit fallback.

## Support Information
Support channel: open an issue in the project repository or contact the maintainers through the published support email in store metadata.
