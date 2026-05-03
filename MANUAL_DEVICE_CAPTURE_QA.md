# Manual Device Capture QA (Olho)

## Session metadata
- Date/time: 2026-04-29 13:44:23 BST
- Browser: Google Chrome 145.0.7632.46
- OS: macOS 26.3 (Build 25D125)
- Device setup used in this run: Headless/automated local agent session; native picker UI, external monitor routing, physical webcam, microphone, and OS permission dialogs are not physically operable by this agent.
- Extension under test: `dist/build` (unpacked)
- Package validated: `dist/olho-extension.zip`

Status legend used below:
- `PASS (Automated evidence)`: Verified in real built extension runs (`npm run test:e2e`, `npm run test:operability`, `npm run verify:release`).
- `FAIL (Manual hardware verification required)`: Not executable to completion in this agent-only environment; requires human hardware/picker interaction.

## Results

### 1. Capture built-in laptop screen
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not physically executed from native picker.
- Evidence note: Picker-dependent; automation validates screen/window capture pipeline and preview/save, but not human picker choice of built-in panel.
- Screenshot/file: `test-results/operability-workflows-audit.json` (`capture-screen-window-preview-save-editor-download` pass)
- Bug reference: N/A (hardware/manual-only)

### 2. Capture external monitor
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not executed (no external display selection possible in this session).
- Evidence note: Must be done with real second display.
- Screenshot/file: `MANUAL_QA_CHECKLIST.md` item remains manual.
- Bug reference: N/A (hardware/manual-only)

### 3. Capture each connected display one at a time
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not executed.
- Evidence note: Requires multiple physical displays attached.
- Screenshot/file: N/A
- Bug reference: N/A (hardware/manual-only)

### 4. Capture browser window
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not physically selected from native picker.
- Evidence note: Pipeline proved by e2e, picker source choice still manual.
- Screenshot/file: `tests/e2e-real-capture-recorder.test.mjs` pass output.
- Bug reference: N/A (hardware/manual-only)

### 5. Capture extension panel via browser window/screen picker
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not executed with visible extension panel in picker capture.
- Evidence note: Requires human-controlled picker and visible popup.
- Screenshot/file: N/A
- Bug reference: N/A (hardware/manual-only)

### 6. Capture another application window
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not executed.
- Evidence note: Requires real non-browser app window in picker.
- Screenshot/file: N/A
- Bug reference: N/A (hardware/manual-only)

### 7. Record entire screen
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not physically executed through native picker.
- Evidence note: Recording pipeline passes with mocked real-extension tests.
- Screenshot/file: `tests/e2e-real-capture-recorder.test.mjs` pass output.
- Bug reference: N/A (hardware/manual-only)

### 8. Record external monitor
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not executed.
- Evidence note: Needs connected external display.
- Screenshot/file: N/A
- Bug reference: N/A (hardware/manual-only)

### 9. Record browser window
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not physically executed via picker.
- Evidence note: Requires manual picker target selection.
- Screenshot/file: N/A
- Bug reference: N/A (hardware/manual-only)

### 10. Record browser tab
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not physically executed via picker.
- Evidence note: Requires manual picker target selection.
- Screenshot/file: N/A
- Bug reference: N/A (hardware/manual-only)

### 11. Record with microphone
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not executed with real microphone input.
- Evidence note: Mic inclusion path tested in automation; live audio capture requires physical device.
- Screenshot/file: `tests/recording-system.test.mjs` and real e2e recorder wiring pass output.
- Bug reference: N/A (hardware/manual-only)

### 12. Record with system/tab audio when offered
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not executed with real OS/browser-provided audio tracks.
- Evidence note: Availability depends on OS/browser and picker checkbox.
- Screenshot/file: N/A
- Bug reference: N/A (hardware/manual-only)

### 13. Record with webcam overlay and verify final video
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Actual result: Not executed with physical webcam and final downloaded playback verification.
- Evidence note: Composition pipeline is tested; final visual hardware confirmation remains manual.
- Screenshot/file: `tests/recording-system.test.mjs` webcam composition test pass output.
- Bug reference: N/A (hardware/manual-only)

### 14. Cancel picker and verify friendly message
- Pass/Fail: **PASS (Automated evidence)**
- Actual result: Friendly cancellation message verified.
- Evidence note: `real popup screen/window still capture shows explicit cancellation message` passed.
- Screenshot/file: `npm run verify:release` output (`test:e2e` section)
- Bug reference: N/A

### 15. Deny permission and verify friendly message
- Pass/Fail: **PASS (Automated evidence)**
- Actual result: Permission-denied path returns explicit message.
- Evidence note: `permission denied shows explicit error` passed.
- Screenshot/file: `npm run verify:release` output (`test` section)
- Bug reference: N/A

### 16. Stop recording and verify streams stop
- Pass/Fail: **PASS (Automated evidence)**
- Actual result: Stream stop behavior verified in recorder tests.
- Evidence note: `real popup screen/window still capture flow ... stops stream tracks` and recorder stop flow passes.
- Screenshot/file: `npm run verify:release` output (`test:e2e` and `test` sections)
- Bug reference: N/A

### 17. Save and reopen from Memory
- Pass/Fail: **PASS (Automated evidence)**
- Actual result: Persistence and reopen flows verified.
- Evidence note: `real extension persistence: save screenshot Blob ... reopen after reload` passed.
- Screenshot/file: `npm run verify:release` output (`test:e2e` section)
- Bug reference: N/A
