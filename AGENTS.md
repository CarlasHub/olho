# Playwright debugging rule

When debugging Playwright, do not run large headed test suites on my active desktop.

Follow this order:

1. Run the failing test headless first with trace, screenshot, video, console logs, and page errors enabled.
2. Inspect the trace/video output before opening a browser.
3. If headed mode is still required, run only the single failing test.
4. Use --workers=1.
5. Use a temporary browser profile.
6. Do not use my personal Chrome profile.
7. Do not run the full suite headed.
8. Do not maximise the browser.
9. After the isolated headed debug run, switch back to headless verification.

Required headed debug command shape:

`npx playwright test path/to/file.spec.js -g "exact failing test name" --headed --workers=1`

Normal verification must remain headless:

`npm run test:release-gate`  
`npm run verify:release`

If a test genuinely requires headed mode, document why and isolate it in a separate debug-only command.

# Browser test architecture rule

Do not claim Playwright webServer or sandbox port-binding blocks Olho tests unless Playwright has actually been added to the repository.

Olho’s default browser tests use Node test + Puppeteer.

The canonical verification command is:

`npm run verify:release`
