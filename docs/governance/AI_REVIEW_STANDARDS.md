# AI Review Standards

## Purpose

This document defines how AI may be used in Olho Review.

AI is allowed only as an optional enhancement layer for professional reviewer commentary, structured critique, and recommendation refinement.

AI must not be required for core review functionality.

## AI Role

AI may help with:

- Reviewer-style explanations
- UX impact wording
- Recommendation refinement
- Finding deduplication
- Report summarisation
- Optional screenshot interpretation where enabled

AI must not be the only source of truth.

## Required AI Behaviour

AI must behave like:

- Senior UI/UX reviewer
- Accessibility-visible reviewer
- Design-system reviewer
- Enterprise product quality reviewer

AI must focus on:

- Visual hierarchy
- Spacing
- Typography
- Layout clarity
- CTA clarity
- Component consistency
- Visible accessibility risks
- Interaction clarity
- Product polish

## Forbidden AI Behaviour

AI must not:

- Give generic praise
- Invent invisible functionality
- Assume backend behaviour
- Produce vague opinions
- Create findings without evidence
- Upload screenshots without consent
- Change protected systems
- Override rule-engine findings silently

## Required Output Schema

AI findings must match this structure:

```ts
type ReviewFinding = {
  id: string;
  category:
    | "visual-hierarchy"
    | "ux"
    | "accessibility-visible"
    | "design-system"
    | "enterprise-polish"
    | "responsive-layout";
  severity:
    | "low"
    | "medium"
    | "high"
    | "critical";
  region: string;
  issue: string;
  evidence: string;
  impact: string;
  recommendation: string;
  confidence: number;
  screenshotRef?: string;
  selector?: string;
  source: "ai-review";
};
```

## Schema Enforcement

AI output is a candidate result until validated by the review engine.

Required validation:
- `category` must match the schema exactly.
- `severity` must match the schema exactly.
- `region` must identify a visible region, component, or reviewable screenshot area.
- `issue` must describe a specific review problem.
- `evidence` must identify what is visible or otherwise available in the approved evidence package.
- `impact` must describe user, accessibility, usability, or product-quality consequence.
- `recommendation` must be concrete and actionable.
- `confidence` must be a number from `0` to `1`.
- `source` must be `ai-review`.

Invalid AI output must be rejected, not repaired silently.

## Provider Isolation

All AI integration must be contained within the review AI boundary:

```text
src/review/ai/
  provider-interface.js
  provider-registry.js
  providers/
    openai-provider.js
    gemini-provider.js
    groq-provider.js
    ollama-provider.js
    openrouter-provider.js
  prompts/
  evidence-redaction.js
  response-normalizer.js
```

Provider files listed here are approved future boundaries. They are not implemented by governance documentation and must not be referenced as runtime files until created by an approved feature contract.

No provider-specific logic may be placed in:
- Capture modules
- Editor modules
- Export core
- UI components outside review
- Finding schema definitions
- Protected storage internals

## Provider Modes

Allowed provider modes:
- None: deterministic and manual review only.
- Local: local model or local deterministic analysis with no network dependency.
- User-configured remote: explicit opt-in provider configured by the user.

Prohibited provider modes:
- Bundled cloud provider.
- Hidden remote provider.
- Provider enabled by default.
- Provider requiring an Olho account.
- Provider with hardcoded credentials.
- Provider that sends screenshots, DOM, metadata, or review output automatically.

## Consent And Privacy

AI workflows must preserve local-first guarantees:
- No automatic upload.
- No hidden telemetry.
- No remote logging.
- No account requirement.
- No bundled API keys.
- No hidden provider calls.
- User can disable the AI provider.
- User can delete local review data.
- Remote provider use requires explicit user action and configuration.
- Remote provider use must disclose what data will leave the device before processing.

API keys, if supported later, may only be stored in approved local extension storage.

## Evidence Package Rules

An AI provider may only receive an evidence package assembled by the review engine.

The package must declare:
- Source type.
- Image dimensions.
- Visual region or full screenshot reference.
- Optional selector only when explicitly captured for webpage review.
- Optional DOM excerpt only when explicitly captured for webpage review.
- Review categories requested.
- Redaction or minimisation status.
- User consent status when remote.

The package must not include:
- Full local library contents.
- Unrelated screenshots.
- Hidden settings.
- Credentials.
- Browser cookies.
- Extension internals.
- User identity data unless the user explicitly included it in the reviewed visual source.

## Rule-Engine Relationship

AI may refine, explain, deduplicate, or summarise findings.

AI must not:
- Replace deterministic review modules.
- Delete rule-engine findings.
- Lower rule-engine severity silently.
- Rewrite evidence.
- Convert unsupported speculation into a confirmed issue.
- Present itself as the only source of truth.

When AI adds a finding, `source` must be `ai-review`.

## Accessibility Standards

AI must not present visible accessibility heuristics as complete accessibility audits.

AI may identify visible accessibility risks such as:
- Low visible contrast risk.
- Unclear visible focus state.
- Small or dense interactive targets.
- Form labels that appear missing or unclear.
- Status communicated by color alone.
- Reading order concerns visible in the screenshot.

AI must not claim:
- Keyboard inaccessibility from a screenshot alone.
- Missing semantic HTML from a screenshot alone.
- Incorrect focus order without keyboard or DOM evidence.
- Screen reader behaviour without assistive technology or semantic evidence.

AI may suggest these as manual checks when the limitation is explicit.

## Confidence Rules

Confidence must reflect evidence quality, not language certainty.

Confidence must be reduced when:
- The finding is based only on a screenshot.
- DOM evidence is unavailable.
- Text is small or partially obscured.
- The visual state may be transient.
- The issue depends on interaction behaviour.
- The provider response lacks a precise region or component.

Low-confidence AI output must remain a candidate or manual review prompt until validated.

## Prompt And Response Governance

Prompt contracts must:
- Specify allowed categories.
- Require the `ReviewFinding` schema.
- Require evidence references.
- Require confidence.
- Prohibit unsupported claims.
- Prohibit generic praise.
- Prohibit hidden chain-of-thought disclosure in user-facing output.
- Require concise, professional recommendations.

Response normalizers must:
- Reject invalid categories.
- Reject missing evidence.
- Reject unsupported severity values.
- Reject missing or vague regions.
- Clamp confidence to the valid range only when the provider returned a numeric value.
- Preserve uncertainty and limitations.

## UI Requirements

AI-assisted findings must display:
- Region or component.
- Category.
- Severity.
- Confidence.
- Evidence.
- Impact.
- Recommendation.
- Source as `ai-review`.

The UI must not present AI as a conversational authority. The screenshot, evidence, and findings remain the primary workflow.

## Export Requirements

Exports must preserve:
- Region or component.
- Category.
- Severity.
- Confidence.
- Evidence.
- Impact.
- Recommendation.
- Screenshot reference where available.
- Selector where available.
- Source as `ai-review`.

Exports must not remove uncertainty labels.

## Testing Requirements

AI-related implementation requires tests for:
- AI disabled state.
- Local-only default behavior.
- Missing provider configuration.
- User-disabled provider state.
- Invalid provider output rejection.
- Missing evidence rejection.
- Unsupported category rejection.
- Invalid source rejection.
- Remote provider consent gating when applicable.
- Privacy scan coverage.
- Export preservation of source, confidence, and evidence.

Mocked provider tests prove contract handling only. They do not prove real provider correctness.
