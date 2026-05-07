import { buildReviewerPrompt } from "./system-reviewer-prompt.js";

export function buildMergeFindingsPrompt(context) {
  return buildReviewerPrompt({
    passName: "Merge and dedupe findings",
    focus:
      "Review candidate AI findings against deterministic findings. Return only high-signal, non-repetitive AI findings that add evidence or nuance. Preserve deterministic findings conceptually and do not restate them verbatim.",
    context
  });
}
