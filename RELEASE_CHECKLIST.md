# Olho Release Checklist

## Pre-Release Gates
1. Run `npm install`.
2. Run `npm run lint`.
3. Run `npm run typecheck`.
4. Run `npm run test`.
5. Run `npm run test:accessibility`.
6. Run `npm run test:privacy`.
7. Run `npm run test:no-remote-services`.
8. Run `npm run test:no-competitor-references`.
9. Run `npm run build`.
10. Run `npm run test:e2e`.
11. Run `npm run package`.
12. Run `npm run verify:release`.
13. Confirm `RELEASE_CHECK.md` is generated and reflects the current run.

## Manual Verification
1. Load `dist/build` via `chrome://extensions`.
2. Verify popup actions:
   - capture visible
   - capture region
   - capture full page
   - start recording
3. Verify editor:
   - annotate
   - crop
   - resize
   - undo/redo
   - copy/download/save
4. Verify recorder:
   - start, pause, resume, stop
   - timer updates
   - saved recording appears in gallery
5. Verify gallery:
   - search/filter/sort
   - folder CRUD
   - rename/move/delete item
6. Verify export report page:
   - copy Markdown
   - copy HTML
   - download HTML
   - download ZIP bundle
   - Jira/GitHub/mailto helpers open prefilled drafts
7. Verify settings:
   - permission explanations visible
   - storage usage refresh works
   - delete-all-local-data works after confirmation

## Compliance Checks
1. Confirm no competitor name appears in source/docs/tests/build output.
2. Confirm no remote service URLs are hardcoded in runtime source.
3. Confirm no `eval` or `Function` constructor usage.
4. Confirm no core feature is marked as implemented if not functional.
5. Confirm package zip contains `manifest.json` at root.
6. Confirm package zip excludes tests, `node_modules`, `.env` files, source maps, and secrets.
7. Confirm manifest permissions match implemented features only.
