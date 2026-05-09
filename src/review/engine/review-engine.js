import { createReviewContext } from "./review-context.js";
import { REVIEW_RULES } from "./rules/index.js";
import { dedupeFindings } from "../findings/finding-dedupe.js";
import { sortReviewFindings } from "../findings/finding-sort.js";
import { severityRank } from "../findings/finding-severity.js";
import { filterValidReviewFindings } from "../findings/finding-validator.js";
import { VISUAL_REVIEW_PROFILE } from "./visual-review-profile.js";
import { clampFindingsToDepth, resolveReviewDepth } from "./review-depth.js";
import {
  buildReviewIndicators,
  buildScreenComprehension,
  synthesizeReviewFindings
} from "./review-synthesis.js";

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
  const reviewDepth = resolveReviewDepth(input.reviewDepth || input.reviewOptions?.reviewDepth || context.raw?.reviewDepth);
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

  const validRuleFindings = filterValidReviewFindings(rawFindings, {
    warnInvalid: true,
    context: "Review engine"
  });
  const synthesis = synthesizeReviewFindings(context, validRuleFindings, reviewDepth);
  const validSynthesisFindings = filterValidReviewFindings(synthesis.findings, {
    warnInvalid: true,
    context: "Review engine synthesis"
  });
  const findings = clampFindingsToDepth(
    sortReviewFindings(dedupeFindings([...validSynthesisFindings, ...validRuleFindings])),
    reviewDepth
  );
  const visualScore = scoreFromFindings(context, findings);
  const screenComprehension = buildScreenComprehension(context);
  const reviewIndicators = buildReviewIndicators(findings);

  return {
    findings,
    skippedRules,
    metadata: {
      engineVersion: VISUAL_REVIEW_PROFILE.engineVersion,
      sourceType: context.sourceType,
      hasDomMetrics: context.hasDomMetrics,
      hasComputedStyles: context.hasComputedStyles,
      hasTextMetrics: context.hasTextMetrics,
      hasInteractiveElements: context.hasInteractiveElements,
      hasDesignMetadata: context.hasDesignMetadata,
      hasLocalVisualAnalysis: context.hasLocalVisualAnalysis,
      isImageOnly: context.isImageOnly,
      isDesignScreen: context.isDesignScreen,
      visualAnalysis: context.visualAnalysis || null,
      reviewDepth: reviewDepth.id,
      reviewDepthLabel: reviewDepth.label,
      reviewDepthDescription: reviewDepth.description,
      screenComprehension,
      reviewIndicators,
      reviewPasses: synthesis.passes,
      synthesisSummary: synthesis.summary,
      ruleCount: REVIEW_RULES.length,
      findingCount: findings.length,
      executionTimeMs: Math.round(nowMs() - started),
      visualScore
    }
  };
}
