# Engineering Workflow

## Objective
Ship only behaviour that is proven in the built extension, with explicit evidence for UI, output, and release gates.

## Implementation Flow
1. Reproduce issue in `dist/build` extension context.
2. Identify exact runtime files and handlers involved.
3. Apply targeted code changes.
4. Update tests that prove the changed behaviour.
5. Regenerate audit artifacts under `test-results/`.
6. Run release verification commands.
7. Record command outputs and remaining manual-only checks.

## Evidence Ladder
1. Source evidence: implementation exists in runtime code path.
2. Behaviour evidence: built extension produces expected result in real browser context.
3. Command evidence: gate scripts/tests execute and pass.
4. Manual evidence: hardware/browser-limited flows are documented with explicit checklist items.

## Release Rules
- Do not mark a claim proven if evidence is only static, seeded, or mocked.
- Keep mocked tests for guardrails, but never use them as sole release proof.
- Treat unverified behaviour as not verified.
- Keep manual hardware limitations explicit in release reports.
- Keep browser test architecture claims aligned with `docs/testing/browser-test-architecture.md`.
