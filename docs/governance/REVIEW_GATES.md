# Review Gates

Every implementation must pass these gates before being considered complete.

## Gate 1: Protected Core Stability

Verify that existing Olho functionality still works.

Required checks:

- Capture current tab
- Select area in tab
- Full-page capture
- Capture screen/window
- Record screen
- Import local image
- Open capture in editor
- Save to Memory
- Download PNG
- Export from editor

Failure condition:

Any regression in existing screenshot, recording, editor, memory, or export functionality blocks release.

## Gate 2: Review Mode Stability

Required checks:

- Review Mode opens from capture preview
- Review Mode opens from Memory item where supported
- Screenshot appears correctly in Review Mode
- Findings list renders
- Finding selection works
- Overlay marker appears on screenshot
- Inspector shows finding details
- Review session can be closed without corrupting the image

## Gate 3: Finding Quality

Every generated finding must include:

- Category
- Severity
- Region or component
- Issue
- Evidence
- Impact
- Recommendation
- Confidence
- Source

Blocked examples:

- "This looks bad."
- "Improve the design."
- "The UI could be better."
- "Make it modern."

Acceptable example:

"The primary and secondary CTAs use nearly identical visual weight, making the intended next action unclear and increasing decision effort."

## Gate 4: Privacy

Required checks:

- No screenshots uploaded by default
- No hidden telemetry
- No remote logging
- No provider API call unless user enabled AI
- API keys are stored only in approved local extension storage
- User can disable AI provider
- User can delete local review data

## Gate 5: Performance

Required checks:

- Large screenshots do not freeze the UI indefinitely
- Review processing has clear loading state
- User can cancel or leave Review Mode
- Original image is not corrupted
- Memory usage remains reasonable
- Repeated review does not duplicate large blobs unnecessarily

## Gate 6: Accessibility

Required checks:

- Review Mode can be navigated with keyboard
- Findings list has visible focus
- Buttons have accessible names
- Severity is not communicated by colour alone
- Overlay markers are represented in the findings list
- Inspector content is readable and structured
- Dialogs and panels do not trap focus incorrectly

## Gate 7: Export

Required checks:

- HTML review report exports correctly
- Markdown review report exports correctly
- JSON review data exports correctly
- Existing image export still works
- Report includes screenshot reference or embedded image where supported
- Report includes all required finding fields

## Gate 8: AI Safety

Required checks if AI is used:

- AI is optional
- AI provider can be disabled
- User is informed before external processing
- AI output follows schema
- Invalid AI output is rejected
- AI does not overwrite rule-engine findings silently
- AI findings identify source as `ai-review`

## Gate 9: Documentation

Required checks:

- Feature contract completed
- Architecture impact documented
- Privacy impact documented
- New settings documented
- Review categories documented
- Export changes documented

## Release Rule

A feature is not complete if any gate fails.
