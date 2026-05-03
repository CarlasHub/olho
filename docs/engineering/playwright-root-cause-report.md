# Playwright Port-Binding Root-Cause Report

Date: 2026-05-03

## Summary
The current Olho test harness is **not Playwright-based**. It uses Node's built-in test runner plus Puppeteer (`puppeteer-core`) and runs without elevated permissions in this workspace.

Because there is no Playwright web server configuration in this repository, status messages saying "Playwright is blocked by sandbox port-binding" are not accurate for Olho's normal test path.

## Mandatory Repository Facts
1. Olho currently has **no** `playwright.config.*` file.
2. Olho currently has **no** Playwright dependency in `package.json`.
3. Olho real browser tests use **Node test + Puppeteer**.
4. `npm run verify:release` is the canonical release verification command.
5. Playwright `webServer` configuration is not applicable unless Playwright is introduced later.
6. If Playwright is introduced later, explicit config, dependency, scripts, and documentation must be added in the same change.
7. Until Playwright is intentionally introduced, do not request elevated execution for Playwright port-binding/server issues.
8. Do not report Playwright as a blocker for this repository.

## Evidence Collected

1. No Playwright configuration file is present.
   - Command: `find . -maxdepth 3 -iname "playwright.config.*" -o -iname "*playwright*"`
   - Result: no config files found.

2. No Playwright dependency is declared in `package.json`.
   - `package.json` defines Node test scripts and Puppeteer-based real-browser e2e.
   - No `@playwright/test` package is declared.

3. Normal real-browser e2e runs successfully without elevation.
   - Command: `node --test --test-concurrency=1 tests/e2e-real-extension-smoke.test.mjs`
   - Result: pass.

4. Full release gate runs and passes in this environment using the existing harness.
   - Command: `npm run verify:release`
   - Result: pass.

## Root Cause
There is no Playwright `webServer` configuration to fix in this codebase because Playwright is not the active test runner for Olho.

Any "sandbox port-binding" failure observed while running ad-hoc Playwright commands is external to Olho's configured test architecture and does not block the repository's normal validation path.

## What Is Possible vs Impossible Here

- Possible in-repo:
  - Keep normal tests on the existing Puppeteer harness.
  - Ensure normal validation commands run without elevation.
  - Keep headed debug isolated and optional.

- Impossible to "fix" as a repository setting:
  - Eliminating all sandbox-level port-binding restrictions for arbitrary external Playwright runs when no Playwright server is configured by Olho.

## Operational Decision
Use the existing default commands for normal verification:
- `npm run test:e2e`
- `npm run verify:release`

If Playwright is introduced in future, add an explicit `playwright.config.*` with no `webServer` section (or `reuseExistingServer` behavior) and dedicated debug-only scripts.
