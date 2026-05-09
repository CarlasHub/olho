# Olho Permission Explanations

Olho requests only permissions required for implemented local-first features.

## `activeTab`
Used only when you start a capture action, so Olho can capture the current tab view.

## `tabs`
Used to:
- resolve the active tab for capture actions
- open Olho pages (`editor.html`, `gallery.html`, `record.html`, `export-report.html`, `privacy.html`)

## `scripting`
Used to inject temporary local overlays/scripts for:
- focus area selection
- full-page capture progress and stitching helpers
- focus element selection

## Host permissions (`<all_urls>`)
Used only for local in-browser capture reliability on regular web pages so Olho can:
- inject capture scripts consistently for full-page/region/element capture
- call `tabs.captureVisibleTab()` reliably in popup-tab/debug flows where one-time `activeTab`
  grants are not available
- capture and stitch long pages without relying on one-time activeTab grant edge cases

## `clipboardWrite`
Used when you explicitly click copy actions in Olho pages.

## `storage`
Used for local persistence:
- IndexedDB media library and thumbnails
- settings/preferences
- small migration/session state in extension storage

## `sidePanel`
Used to open the local Olho Review side panel beside the current page after explicit user action.
The side panel runs local visual review controls and does not upload screenshots.

## `desktopCapture`
Used to start browser-native screen, window, or tab recording after user action.

## `downloads`
Used only when you explicitly export/download files.

## `offscreen`
Used for local offscreen document processing to generate video poster thumbnails.

## Not Requested
Olho does not request:
- identity/account permissions
- background network permissions
