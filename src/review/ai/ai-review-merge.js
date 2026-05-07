import { sortReviewFindings } from "../findings/finding-sort.js";
import { filterValidReviewFindings } from "../findings/finding-validator.js";
import { AI_REVIEW_SOURCE } from "./ai-review-schema.js";
import { filterValidAiReviewFindings } from "./ai-review-validator.js";

function words(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
  );
}

function overlapScore(a, b) {
  const first = words(a);
  const second = words(b);
  if (!first.size || !second.size) return 0;
  let shared = 0;
  first.forEach((word) => {
    if (second.has(word)) shared += 1;
  });
  return shared / Math.min(first.size, second.size);
}

function similarFinding(a = {}, b = {}) {
  if (a.category === b.category && a.selector && b.selector && a.selector === b.selector) return true;
  if (a.category === b.category && overlapScore(a.region, b.region) >= 0.5) return true;
  if (a.category === b.category && overlapScore(`${a.issue} ${a.evidence}`, `${b.issue} ${b.evidence}`) >= 0.42) {
    return true;
  }
  return overlapScore(a.issue, b.issue) >= 0.55;
}

function strongestEvidence(existing = "", candidate = "") {
  return String(candidate || "").length > String(existing || "").length ? candidate : existing;
}

function attachAiSupport(deterministicFinding, aiMatches) {
  if (!aiMatches.length) return deterministicFinding;
  const strongest = aiMatches.reduce(
    (best, match) => ({
      evidence: strongestEvidence(best.evidence, match.evidence),
      recommendation: strongestEvidence(best.recommendation, match.recommendation),
      issue: strongestEvidence(best.issue, match.issue)
    }),
    {
      evidence: "",
      recommendation: "",
      issue: ""
    }
  );

  return {
    ...deterministicFinding,
    aiReviewSupport: {
      evidence: strongest.evidence,
      recommendation: strongest.recommendation,
      issue: strongest.issue,
      source: AI_REVIEW_SOURCE
    }
  };
}

export function mergeAiReviewFindings({ deterministicFindings = [], aiFindings = [], warnInvalid = true } = {}) {
  const deterministic = filterValidReviewFindings(deterministicFindings, {
    warnInvalid,
    context: "AI merge deterministic findings"
  }).filter((finding) => finding.source !== AI_REVIEW_SOURCE);
  const aiValidation = filterValidAiReviewFindings(aiFindings, {
    warnInvalid,
    context: "AI merge findings"
  });

  const acceptedAi = [];
  const duplicateAi = [];

  aiValidation.validFindings.forEach((aiFinding) => {
    const deterministicMatch = deterministic.find((finding) => similarFinding(finding, aiFinding));
    if (deterministicMatch) {
      duplicateAi.push({
        finding: aiFinding,
        matchedFindingId: deterministicMatch.id,
        reason: "Overlaps deterministic finding."
      });
      return;
    }

    const acceptedMatch = acceptedAi.find((finding) => similarFinding(finding, aiFinding));
    if (acceptedMatch) {
      duplicateAi.push({
        finding: aiFinding,
        matchedFindingId: acceptedMatch.id,
        reason: "Overlaps another AI finding."
      });
      return;
    }

    acceptedAi.push(aiFinding);
  });

  const deterministicWithSupport = deterministic.map((finding) =>
    attachAiSupport(
      finding,
      duplicateAi.filter((duplicate) => duplicate.matchedFindingId === finding.id).map((duplicate) => duplicate.finding)
    )
  );

  return {
    findings: sortReviewFindings([...deterministicWithSupport, ...acceptedAi]),
    acceptedAiFindings: acceptedAi,
    duplicateAiFindings: duplicateAi,
    rejectedAiFindings: aiValidation.rejectedFindings
  };
}
