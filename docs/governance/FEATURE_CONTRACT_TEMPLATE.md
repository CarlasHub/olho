# Feature Contract Template

Every new Olho Review feature must complete this contract before implementation.

## Feature Name
Write the feature name here.

## Feature Purpose
Describe what the feature does and why it exists.

## Product Alignment
Explain how this feature supports the product mission:

```txt
Local-first visual UI/UX and accessibility review workspace.
```

Required answers:
- Which professional visual review workflow does this support?
- How is this screenshot-centric?
- How is this evidence-driven?
- How is this local-first?
- Why is this not a chatbot, SEO scanner, analytics feature, Lighthouse clone, or cloud SaaS capability?

## Status And Ownership
- Status: Proposed | Approved | Implemented | Removed
- Owner:
- Date:
- Related issue or decision record:

## Scope
### In Scope
- TBD

### Out Of Scope
- TBD

### Explicit Non-Goals
- TBD

## Protected Core Impact
Protected systems touched:
- `capture/`: No | Yes, details:
- `editor/`: No | Yes, details:
- `recording/`: No | Yes, details:
- `memory/`: No | Yes, details:
- `storage/`: No | Yes, details:
- `export/`: No | Yes, details:
- `settings/`: No | Yes, details:
- `annotations/`: No | Yes, details:

If any answer is yes, include:
- Exact files and functions:
- Why a review-only adapter is insufficient:
- Behavior preservation plan:
- Backward compatibility plan:
- Rollback plan:
- Tests proving existing behavior is preserved:

## Architecture Placement
- Proposed files:
- Existing files read:
- Existing files modified:
- Review module:
- Review category IDs:
- Source adapter:
- Evidence store changes:
- Review UI changes:
- Review export changes:
- Settings changes:

## Data Contracts
### Inputs
- Source type:
- Required metadata:
- Required visual evidence:
- Optional DOM evidence:
- Unsupported inputs:

### Outputs
- Finding schema fields used:
- Review session schema changes:
- Export schema changes:
- Migration required: No | Yes, details:

## Evidence Rules
For each emitted finding, define:
- Visual anchor requirement:
- Evidence summary requirement:
- Rule, heuristic, or review method:
- Confidence calculation:
- Verification method:
- Manual-review limitation:

No finding may be emitted when these evidence rules are not satisfied.

## Accessibility Rules
If accessibility is involved:
- Is the issue confirmed, a review issue, or a manual check?
- What evidence supports the classification?
- What cannot be determined from the available evidence?
- Keyboard access considered: No | Yes, details:
- Labeling considered: No | Yes, details:
- Focus order considered: No | Yes, details:
- Semantic HTML considered: No | Yes, details:

## AI Provider Use
- AI used: No | Yes
- Provider type: None | Local | User-configured remote
- Provider boundary file:
- Data sent to provider:
- Redaction or minimization:
- User consent required:
- Fallback when AI is unavailable:
- Tests proving no provider bypass:

AI output must not become a finding until normalized, schema-valid, evidence-backed, and uncertainty-labeled.

## Privacy And Local-First Guarantees
- Stores data locally only:
- No telemetry:
- No account requirement:
- No bundled API keys:
- No automatic remote calls:
- User-controlled export only:
- Privacy test updates required:

## UI And Workflow
- Entry point:
- Primary user workflow:
- Empty state:
- Loading state:
- Error state:
- Keyboard path:
- Screen reader labels:
- Evidence display:
- Dismiss or resolution flow:

## Tests
Required automated tests:
- Contract tests:
- Unit tests:
- Integration tests:
- Real browser tests:
- Accessibility tests:
- Privacy tests:
- Regression tests for protected systems:

Failure cases:
- Missing evidence:
- Unsupported source:
- Invalid schema:
- Provider unavailable:
- Storage failure:
- Export failure:

## Documentation
Docs to update:
- Governance:
- Architecture:
- User-facing docs:
- Release checklist:
- Manual QA:
- Schema docs:

Do not document unsupported commands or features.

## Release Gates
Commands to run:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:accessibility`
- `npm run test:privacy`
- `npm run test:no-remote-services`
- `npm run build`
- `npm run test:e2e`
- `npm run verify:release`

If a command is not run, document:
- Command:
- Reason:
- Risk:
- Replacement evidence, if any:

## Acceptance Criteria
- TBD

## Remaining Limitations
- TBD

## Approval Checklist
- Product direction preserved.
- Protected core impact reviewed.
- Review architecture boundary respected.
- Evidence rules complete.
- Local-first guarantees preserved.
- AI isolated or not used.
- Tests identified.
- Documentation identified.
- Release gates identified.
