# Olho Capture/Recording Capability Matrix

Status legend:
- `working`: implemented and tested
- `working_with_limitation`: implemented and usable with explicit browser/OS limits
- `not-implemented`: unavailable
- `disabled`: hidden/disabled until implementation is complete

## Screenshot Modes

| Feature | Mature utility capability | Olho status | Zero-cost local | Local-first implementation path | User label | Permissions | Files | Required tests | Release status |
|---|---|---|---|---|---|---|---|---|---|
| Capture tab | Capture active webpage viewport | working | yes | `chrome.tabs.captureVisibleTab` via background capture flow, save Blob in IndexedDB | Capture Tab | `activeTab`,`tabs`,`scripting`,`storage` | `popup.js`,`service_worker.js`,`src/background/capture.js`,`src/storage/storage.js` | Browser e2e capture + persistence | working |
| Full page | Scroll/stitch long pages | working | yes | Content-script measurement + incremental scroll capture + local stitch + scroll restore | Full Page | `activeTab`,`tabs`,`scripting`,`storage` | `src/background/capture.js`,`service_worker.js` | Long-page and sticky-page tests | working |
| Select area in tab | Region selection in current tab | working | yes | Injected overlay selection + local crop + save Blob | Select Area | `activeTab`,`tabs`,`scripting`,`storage` | `src/background/capture.js`,`service_worker.js` | Overlay appear/cancel/cleanup tests | working |
| Capture screen/monitor | Picker-based monitor screenshot | working | yes | `getDisplayMedia` still-frame extraction in extension page, preview then save | Capture Screen/Window | `desktopCapture`,`storage`,`downloads` | `popup.js`,`src/storage/storage.js` | Browser e2e picker-path mocked stream + preview/save + track stop | working |
| Capture app/window | Picker-based application/window screenshot | working | yes | Same picker path; classify `displaySurface=window` in metadata | Capture Screen/Window | `desktopCapture`,`storage`,`downloads` | `popup.js`,`src/storage/storage.js` | Browser e2e metadata assertion | working |
| Capture browser tab via picker | Picker-selected browser tab screenshot | working_with_limitation | yes | Same picker path when browser exposes tab option (`displaySurface=browser`) | Capture Screen/Window | `desktopCapture`,`storage`,`downloads` | `popup.js` | Manual picker verification | working_with_limitation |
| Capture extension panel via picker | Screenshot including extension UI via browser/window/screen picker | working_with_limitation | yes | User chooses browser window/screen in picker; no silent privileged capture | Capture Screen/Window | `desktopCapture`,`storage`,`downloads` | `popup.js` | Manual device capture checklist | working_with_limitation |
| Select area from screen/window frame | Crop a selected region from picker still frame | working | yes | Capture still frame, open editor crop flow, save cropped copy | Select Area (Screen/Window) | `desktopCapture`,`storage`,`downloads` | `popup.js`,`editor.js` | Browser e2e preview + open editor hint path | working |
| Focus element | Element-specific capture in tab | working_with_limitation | yes | Overlay hit target + crop visible bounds | Focus Element | `activeTab`,`tabs`,`scripting`,`storage` | `src/background/capture.js` | Element capture tests | working_with_limitation |
| Restricted page fallback | Protected pages guide users to picker mode | working | yes | Friendly protected-page message with picker fallback action | Capture blocked fallback | `activeTab`,`tabs` | `src/background/capture.js`,`popup.js` | Browser e2e protected-page message | working |

## Recording Modes

| Feature | Mature utility capability | Olho status | Zero-cost local | Local-first implementation path | User label | Permissions | Files | Required tests | Release status |
|---|---|---|---|---|---|---|---|---|---|
| Record screen/monitor | Record selected monitor via picker | working | yes | `getDisplayMedia` + `MediaRecorder`, save WebM Blob in IndexedDB | Entire Screen | `desktopCapture`,`storage` | `record.js`,`src/background/recorder.js` | Browser e2e mocked display stream + save | working |
| Record window/application | Record selected app/browser window | working | yes | Same display pipeline with `displaySurface=window` | Window | `desktopCapture`,`storage` | `record.js`,`src/background/recorder.js` | Browser e2e source-mode wiring + metadata | working |
| Record browser tab | Record tab through picker | working | yes | Display pipeline with tab mode + browser picker selection | Current Tab | `desktopCapture`,`storage` | `record.js`,`src/background/recorder.js` | Browser e2e start/stop/save | working |
| Record camera-only | Webcam-only recording | working_with_limitation | yes | `getUserMedia(video)` + local `MediaRecorder` | Camera Only | `storage` | `record.js`,`src/background/recorder.js` | Integration tests + manual camera device verification | working_with_limitation |
| Record with microphone | Mix microphone track | working | yes | Acquire mic stream and include in composed stream | Include microphone | `storage` | `record.js`,`src/background/recorder.js` | Recorder integration/e2e tests | working |
| Record with system/tab audio | Include display audio track when browser provides it | working_with_limitation | yes | Use display audio track only when present; never fake | Include system audio | `desktopCapture`,`storage` | `record.js`,`src/background/recorder.js` | Recorder tests + manual OS/browser check | working_with_limitation |
| Webcam overlay in final video | Overlay appears in exported/saved recording | working | yes | Canvas composition pipeline and `canvas.captureStream()` | Webcam overlay in final video | `storage` | `record.js`,`src/background/recorder.js` | E2E draw-path assertion + manual final-video check | working |
| Countdown/timer/pause/resume/stop/discard | Full recording controls | working | yes | Recorder state machine + UI state updates + confirmation dialog | Record controls | `storage` | `record.js`,`src/background/recorder.js` | Recorder flow e2e tests | working |
| Preview before save | Playable review panel before save | working | yes | Local Blob preview via object URL then save/download/discard | Review and Save | `storage`,`downloads` | `record.js`,`popup.js` | Browser e2e preview checks | working |
| Save to Memory | Persist recording in local library | working | yes | Save recording Blob to IndexedDB + poster thumbnail | Save to Memory | `storage`,`offscreen` | `record.js`,`src/background/recorder.js`,`offscreen.js` | Persistence e2e tests | working |
| Download WebM | Local recording export | working | yes | Local download of Blob | Download WebM | `downloads` | `record.js` | Browser e2e download path | working |
| MP4 export | Guaranteed local MP4 conversion | not-implemented | no | Not claimed; WebM is baseline | MP4 export (unavailable) | n/a | n/a | Ensure UI does not promise guaranteed MP4 | disabled |

## Manual verification required

These behaviors require manual verification due picker/OS/browser constraints:
- Selecting specific connected displays/monitors in picker
- Capturing extension UI through selected browser window/screen
- Browser-specific availability of tab/system audio in picker
- Final-video visual confirmation for webcam overlay on real devices

See `MANUAL_DEVICE_CAPTURE_QA.md`.
