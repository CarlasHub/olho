import { createFinding, elementLabel, missingText } from "../rule-utils.js";

export const weakHeadingEmphasisRule = {
  id: "visual-hierarchy/weak-heading-emphasis",
  getSkipReason(context) {
    return context.headings.length < 1 || missingText(context, 2) ? "Heading and body text metrics are unavailable." : "";
  },
  run(context) {
    const heading = context.headings.slice().sort((a, b) => a.bounds.y - b.bounds.y)[0];
    const body = context.textBlocks
      .filter((block) => block !== heading && block.style.fontSize > 0)
      .sort((a, b) => b.text.length - a.text.length)[0];
    if (!heading || !body || !heading.style.fontSize || !body.style.fontSize) return null;
    const ratio = heading.style.fontSize / body.style.fontSize;

    // Visual hierarchy research emphasizes headings as scanning anchors; weak scale makes pages harder to skim.
    if (ratio >= context.profile.thresholds.minHeadingBodyRatio) return null;

    return createFinding(context, {
      ruleId: this.id,
      category: "visual-hierarchy",
      severity: "medium",
      region: "Heading hierarchy",
      element: heading,
      selector: heading.selector,
      issue: "The heading does not create a strong scanning anchor.",
      evidence: `"${elementLabel(heading)}" is only ${ratio.toFixed(1)}x the body text size, so the section entry point is visually weak.`,
      impact: "Weak heading emphasis slows scanning and makes it harder for users to understand page priority quickly.",
      recommendation: "Increase heading contrast through type size, weight, spacing, or placement so it clearly leads the section.",
      confidence: 0.74
    });
  }
};

export default weakHeadingEmphasisRule;
