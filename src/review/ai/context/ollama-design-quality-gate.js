const EXCLUDED_EDITOR_TERMS = Object.freeze([
  /\bzeplin (toolbar|sidebar|spec|comment|panel|zoom|utility)\b/i,
  /\bfigma (toolbar|layers|properties|comment|panel|utility)\b/i,
  /\bbrowser chrome\b/i,
  /\bextension ui\b/i
]);

const HALLUCINATION_PATTERNS = Object.freeze([
  /\bbackend\b/i,
  /\banalytics\b/i,
  /\bdatabase\b/i,
  /\bconversion rate\b/i,
  /\bapi\b/i,
  /\bwill fail wcag\b/i,
  /\bfails wcag\b/i,
  /\bwcag failure\b/i,
  /\bscreen reader\b/i
]);

function claimsWcagFailureWithoutMeasurement(finding = {}) {
  const combined = [finding.issue, finding.evidence, finding.impact, finding.recommendation].join(" ");
  if (!/\b(fails?|failure|violates?|violation)\s+wcag\b|\bwcag\s+(fails?|failure|violation)\b/i.test(combined)) {
    return false;
  }
  const measured = finding.evidenceType === "measured" || finding.evidence_type === "measured";
  return !(measured && /\b\d+(?:\.\d+)?:1\b|\bcontrast ratio\b/i.test(finding.evidence || ""));
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function includesAny(value, patterns) {
  const content = text(value);
  return patterns.some((pattern) => pattern.test(content));
}

function scoreFinding(finding = {}, contextPackage = {}) {
  const combined = [
    finding.region,
    finding.issue,
    finding.evidence,
    finding.impact,
    finding.recommendation,
    finding.bestPracticeReference,
    finding.reviewRationale
  ].join(" ");
  const acceptance = Array.isArray(finding.acceptanceCriteria) ? finding.acceptanceCriteria : [];
  const targetCorrect =
    !contextPackage?.targetIsolation?.ignoredAreas?.length || !includesAny(combined, EXCLUDED_EDITOR_TERMS);
  const noHallucination = !includesAny(combined, HALLUCINATION_PATTERNS);

  const checks = {
    specificity: text(finding.issue).length >= 32 && text(finding.region).length >= 3,
    evidence: text(finding.evidence).length >= 36,
    uxReasoning: text(finding.impact).length >= 36,
    accessibilityVisibleReasoning:
      finding.category !== "accessibility-visible" || /readability|contrast|low vision|motor|cognitive|target|colour|color|visual/i.test(combined),
    designPrinciple: text(finding.bestPracticeReference).length >= 32,
    actionability: text(finding.recommendation).length >= 36 && acceptance.length >= 3,
    targetCorrectness: targetCorrect,
    nonHallucination: noHallucination,
    evidenceType: ["measured", "inferred", "model_observation", "human_review_needed"].includes(
      finding.evidenceType || finding.evidence_type || ""
    ),
    wcagClaimGrounding: !claimsWcagFailureWithoutMeasurement(finding),
    confidence: Number(finding.confidence || 0) >= 0.45
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return {
    passed: failed.length === 0,
    checks,
    failed
  };
}

export function applyOllamaDesignQualityGate(findings = [], { contextPackage = {}, warnInvalid = true } = {}) {
  const accepted = [];
  const rejected = [];

  (Array.isArray(findings) ? findings : []).forEach((finding) => {
    const result = scoreFinding(finding, contextPackage);
    if (result.passed) {
      accepted.push({
        ...finding,
        qualityGate: {
          status: "passed",
          checks: result.checks
        }
      });
      return;
    }
    const rejection = {
      finding,
      errors: result.failed.map((name) => `Ollama design quality gate failed: ${name}.`),
      qualityGate: {
        status: "rejected",
        checks: result.checks
      }
    };
    rejected.push(rejection);
    if (warnInvalid) {
      console.warn("[Olho Review] Ollama design finding rejected.", finding.id || "unknown", rejection.errors);
    }
  });

  return {
    acceptedFindings: accepted,
    rejectedFindings: rejected,
    summary: {
      evaluated: (Array.isArray(findings) ? findings : []).length,
      accepted: accepted.length,
      rejected: rejected.length
    }
  };
}
