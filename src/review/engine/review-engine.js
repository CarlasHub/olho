import { createReviewContext } from "./review-context.js";
import { REVIEW_RULES } from "./rules/index.js";
import { dedupeFindings } from "../findings/finding-dedupe.js";
import { sortReviewFindings } from "../findings/finding-sort.js";
import { severityRank } from "../findings/finding-severity.js";
import { filterValidReviewFindings } from "../findings/finding-validator.js";
import { VISUAL_REVIEW_PROFILE } from "./visual-review-profile.js";

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function scoreFromFindings(context, findings) {
  const penalty = findings.reduce((sum, finding) => {
    return sum + severityRank(finding.severity) * 4 * Number(finding.confidence || 0.7);
  }, 0);
  return Math.max(0, Math.round((context.overallVisualScore ?? 100) - penalty));
}

export function runReviewEngine(input = {}) {
  const started = nowMs();
  const context = createReviewContext(input);
  const skippedRules = [];
  const rawFindings = [];

  for (const rule of REVIEW_RULES) {
    const skipReason = typeof rule.getSkipReason === "function" ? rule.getSkipReason(context) : "";
    if (skipReason) {
      skippedRules.push({ ruleId: rule.id, reason: skipReason });
      continue;
    }

    const result = rule.run(context);
    if (Array.isArray(result)) {
      rawFindings.push(...result.filter(Boolean));
      if (!result.filter(Boolean).length) {
        skippedRules.push({ ruleId: rule.id, reason: "Evidence threshold not met." });
      }
      continue;
    }

    if (result) {
      rawFindings.push(result);
    } else {
      skippedRules.push({ ruleId: rule.id, reason: "Evidence threshold not met." });
    }
  }

  const valid = filterValidReviewFindings(rawFindings, {
    warnInvalid: true,
    context: "Review engine"
  });
  const findings = sortReviewFindings(dedupeFindings(valid));
  const visualScore = scoreFromFindings(context, findings);

  return {
    findings,
    skippedRules,
    metadata: {
      engineVersion: VISUAL_REVIEW_PROFILE.engineVersion,
      sourceType: context.sourceType,
      hasDomMetrics: context.hasDomMetrics,
      ruleCount: REVIEW_RULES.length,
      findingCount: findings.length,
      executionTimeMs: Math.round(nowMs() - started),
      visualScore
    }
  };
}
