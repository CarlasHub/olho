# MANUAL_QA_CHECKLIST

Use this checklist against the built extension loaded from `dist/build`.

## Session metadata
- Date/time: 2026-04-29 13:44:23 BST
- Browser: Google Chrome 145.0.7632.46
- OS: macOS 26.3 (Build 25D125)
- Extension under test: `dist/build`
- Package: `dist/olho-extension.zip`
- Environment note: This execution used agent-driven local automation; physical picker/hardware scenarios are documented as manual-required.

## Results

## 1) Capture browser UI using Capture screen/window
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Notes: Requires selecting browser window in native picker with visible browser chrome.

## 2) Capture extension panel using Capture screen/window
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Notes: Requires visible extension popup in selected window/screen.

## 3) Capture a normal website tab
- Pass/Fail: **PASS (Automated evidence)**
- Notes: Capture-tab flow and persistence path validated in automated real-extension coverage and workflow audit.

## 4) Capture a protected browser page using screen/window fallback
- Pass/Fail: **PASS (Automated evidence)**
- Notes: `real capture flow on protected page returns explicit local error` passed; fallback messaging verified.

## 5) Record screen with microphone
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Notes: Real microphone input verification requires physical audio device and manual listening.

## 6) Record browser window
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Notes: Requires manual native picker selection.

## 7) Record with webcam overlay and confirm overlay appears in final video
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Notes: Final video visual confirmation with physical webcam is manual-only.

## 8) Confirm system audio availability by OS/browser
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Notes: System audio availability depends on OS/browser picker options and cannot be asserted by agent-only automation.

## 9) Confirm copied image pastes into Teams/Slack/email where browser allows
- Pass/Fail: **FAIL (Manual hardware verification required)**
- Notes: External app paste validation requires user environment; copy success/fallback behavior is automated-tested.

## 10) Confirm downloaded files open locally
- Pass/Fail: **PASS (Automated evidence)**
- Notes: Local export generation and file signatures validated (PNG/JPG/WebP/PDF/ZIP/WebM paths covered by tests).

## Evidence references
- `npm run test:operability` (PASS)
- `npm run verify:release` (PASS)
- `test-results/operability-workflows-audit.json`
- `test-results/full-ui-operability-audit.json`
- `test-results/release-candidate-report.md`
