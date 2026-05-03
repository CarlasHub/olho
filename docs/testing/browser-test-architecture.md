# Browser Test Architecture

## Default Path (Current Repository)
- Olho does not use Playwright as its default browser test runner.
- Olho has no `playwright.config.*` file.
- Olho has no Playwright dependency in `package.json`.
- Real browser tests run through Node test + Puppeteer utilities in `tests/e2e-real-utils.mjs`.
- Canonical release verification command: `npm run verify:release`.

## Policy
1. Do not report Playwright `webServer` sandbox/port-binding issues as blockers for normal Olho tests.
2. Do not request elevation for Playwright-related port-binding issues unless Playwright is intentionally introduced and configured in-repo.
3. Keep normal verification on:
   - `npm run test:e2e`
   - `npm run verify:release`
4. Treat Playwright as out-of-scope for default validation until explicitly added.

## If Playwright Is Introduced Later
Playwright adoption is only valid when all items below are included in the same change:
1. Add explicit Playwright dependency in `package.json`.
2. Add explicit `playwright.config.*`.
3. Add npm scripts for Playwright runs.
4. Document whether a `webServer` is used, including port strategy and sandbox expectations.
5. Update release documentation and gate behavior accordingly.

Without those changes, Playwright is not part of the default test path and must not be used as a failure status for Olho.
