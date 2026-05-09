import { isLowContrastRisk } from "../../../utils/colour-utils.js";
import { createFinding, elementLabel } from "../rule-utils.js";

const AGGREGATE_TEXT_TAGS = new Set(["main", "article", "section", "nav", "header", "footer", "aside", "form", "fieldset"]);

function isConcreteTextBlock(block = {}) {
  if (!block.text || block.text.length < 2) return false;
  if (AGGREGATE_TEXT_TAGS.has(block.tagName) && block.text.length > 80) return false;
  if (block.type === "region" && block.text.length > 80) return false;
  return true;
}

function visualContrastCandidates(context = {}) {
  const evidence = context.visualAnalysis?.evidence || {};
  return [
    ...(Array.isArray(evidence.ocrContrastResults) ? evidence.ocrContrastResults : []),
    ...(Array.isArray(evidence.lowContrastTextLikeRegions) ? evidence.lowContrastTextLikeRegions : [])
  ]
    .filter((region) => Number(region.contrastRatio || 0) > 0 && Number(region.contrastRatio || 0) < 4.5)
    .sort((a, b) => Number(a.contrastRatio || 0) - Number(b.contrastRatio || 0));
}

function hasMeasuredVisualContrastEvidence(context = {}) {
  return visualContrastCandidates(context).length > 0;
}

export const lowContrastRiskRule = {
  id: "accessibility-visible/low-contrast-risk",
  getSkipReason(context) {
    if (context.textBlocks.length >= 1 || hasMeasuredVisualContrastEvidence(context)) return "";
    return "Text metrics and measured local contrast evidence are unavailable.";
  },
  run(context) {
    const lowContrast = context.textBlocks.filter(isConcreteTextBlock).find((block) => {
      if (!block.style.color || !block.style.backgroundColor) return false;
      return isLowContrastRisk({
        color: block.style.color,
        backgroundColor: block.style.backgroundColor,
        fontSize: block.style.fontSize,
        fontWeight: block.style.fontWeight
      });
    });
    if (lowContrast) {
      const ratio = Number(lowContrast.style.contrast || 0);
      const severity = ratio > 0 && ratio < 3 ? "high" : "medium";

      // WCAG 2.2 contrast thresholds are visible accessibility guardrails, not style preferences.
      return createFinding(context, {
        ruleId: this.id,
        category: "accessibility-visible",
        severity,
        region: "Text contrast",
        element: lowContrast,
        selector: lowContrast.selector,
        issue: "Some text appears visually soft against its background.",
        evidence: `"${elementLabel(lowContrast).slice(0, 90)}" has an estimated contrast ratio of ${lowContrast.style.contrast?.toFixed?.(2) || "below threshold"}.`,
        impact: "Users with low vision, glare-heavy viewing conditions, or cognitive fatigue may need more effort to read this content.",
        recommendation: "Increase the foreground/background separation for this text, especially if it carries navigation, instructions, status, or decision-critical content.",
        confidence: 0.86,
        evidenceType: "measured"
      });
    }

    const visualRisk = visualContrastCandidates(context)[0];
    if (!visualRisk) return null;
    const visualRatio = Number(visualRisk.contrastRatio || 0);
    const visualSeverity = visualRatio > 0 && visualRatio < 3 ? "high" : "medium";
    const hasOcrText = Boolean(visualRisk.text || visualRisk.textRegionId);
    const region = hasOcrText ? `OCR text region ${visualRisk.region || ""}`.trim() : "Measured text-like region";

    return createFinding(context, {
      ruleId: this.id,
      category: "accessibility-visible",
      severity: visualSeverity,
      region,
      regionBounds: visualRisk.bounds || null,
      issue: hasOcrText
        ? "Some visible text may be difficult to read against its background."
        : "Some text-like content may have weak foreground/background separation.",
      evidence: visualRisk.evidence ||
        `Local pixel analysis measured approximately ${visualRatio.toFixed(2)}:1 foreground/background contrast in a text-like region.`,
      impact:
        "Users with low vision, glare-heavy viewing conditions, or cognitive fatigue may need more effort to read this content.",
      recommendation:
        "Increase the foreground/background contrast for this region and re-check the measured contrast before treating it as release-ready.",
      bestPracticeReference:
        "Text intended for reading should maintain sufficient foreground/background separation, size, and spacing for comfortable scanning.",
      acceptanceCriteria: [
        "The affected text or text-like region has been reviewed visually.",
        "Foreground/background separation has been increased or intentionally accepted.",
        "The region remains readable in normal and bright viewing conditions.",
        "Any contrast claim is based on measured local evidence rather than visual guesswork."
      ],
      markerType: "accessibility-risk",
      evidenceType: "measured",
      confidence: hasOcrText ? 0.78 : 0.68
    });
  }
};

export default lowContrastRiskRule;
