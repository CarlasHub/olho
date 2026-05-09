import { proximityGroups } from "../utils/gestalt-utils.js";
import { visualWeight } from "../utils/visual-weight.js";
import { createFinding } from "./rules/rule-utils.js";

const PASS_IDS = Object.freeze([
  "screen-comprehension",
  "visual-hierarchy",
  "layout-composition",
  "ux-clarity",
  "accessibility-visible",
  "design-system",
  "enterprise-polish",
  "synthesis"
]);

function sentence(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function titleFromText(value, fallback = "visible interface") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 90) : fallback;
}

function targetBoundsPercent(context) {
  const target = context.raw?.reviewTarget;
  const viewport = context.viewport || {};
  if (!target?.bounds || !viewport.width || !viewport.height) return null;
  return {
    x: (Number(target.bounds.x || 0) / viewport.width) * 100,
    y: (Number(target.bounds.y || 0) / viewport.height) * 100,
    width: (Number(target.bounds.width || 0) / viewport.width) * 100,
    height: (Number(target.bounds.height || 0) / viewport.height) * 100
  };
}

function broadBounds(context, fallback = { x: 6, y: 8, width: 88, height: 72 }) {
  return targetBoundsPercent(context) || fallback;
}

function upperBounds(context) {
  const target = targetBoundsPercent(context);
  if (!target) return { x: 6, y: 6, width: 88, height: 42 };
  return {
    x: target.x,
    y: target.y,
    width: target.width,
    height: Math.max(22, target.height * 0.48)
  };
}

function textBounds(context) {
  const blocks = context.textBlocks.slice(0, 8);
  if (!blocks.length || !context.viewport.width || !context.viewport.height) {
    return broadBounds(context, { x: 8, y: 14, width: 84, height: 44 });
  }
  const left = Math.min(...blocks.map((element) => element.bounds.x));
  const top = Math.min(...blocks.map((element) => element.bounds.y));
  const right = Math.max(...blocks.map((element) => element.bounds.right));
  const bottom = Math.max(...blocks.map((element) => element.bounds.bottom));
  return {
    x: (left / context.viewport.width) * 100,
    y: (top / context.viewport.height) * 100,
    width: ((right - left) / context.viewport.width) * 100,
    height: ((bottom - top) / context.viewport.height) * 100
  };
}

function screenType(context) {
  if (context.sourceType === "zeplin-capture") return "Zeplin design screen";
  if (context.sourceType === "figma-capture") return "Figma design frame";
  if (context.isDesignScreen) return "Static design screen";
  if (context.actions.length >= 6 && context.components.length >= 10) return "Product dashboard or operational workspace";
  if (context.actions.length >= 2 && context.headings.length >= 1) return "Task-led webpage or product screen";
  if (context.textBlocks.length >= 8) return "Content-heavy webpage";
  return "Visible webpage";
}

function strongestAction(context) {
  return context.actions
    .slice()
    .sort((a, b) => visualWeight(b, context) - visualWeight(a, context))[0] || null;
}

function primaryHeading(context) {
  return context.headings.slice().sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)[0] || null;
}

function likelyUserGoal(context) {
  const action = strongestAction(context);
  const heading = primaryHeading(context);
  if (action?.text) return `Understand the screen and decide whether to use "${titleFromText(action.text)}".`;
  if (heading?.text) return `Understand "${titleFromText(heading.text)}" and identify the next relevant content or action.`;
  return "Understand the visible interface and identify the next meaningful action.";
}

function byCategory(findings, category) {
  return findings.filter((finding) => finding.category === category);
}

function hasRule(findings, fragment) {
  return findings.some((finding) => String(finding.id || "").includes(fragment));
}

function countContrastRisks(findings) {
  return findings.filter((finding) => /contrast|readability|read/i.test(`${finding.id} ${finding.issue}`)).length;
}

function radiusVariants(elements) {
  return new Set(
    elements
      .map((element) => Math.round(Number(element.style?.borderRadius || 0)))
      .filter((value) => value > 0)
  ).size;
}

function shadowVariants(elements) {
  return new Set(
    elements
      .map((element) => String(element.style?.boxShadow || "none").trim().toLowerCase())
      .filter(Boolean)
  ).size;
}

function cardElements(context) {
  return context.components.filter((component) => component.isCard);
}

function largeVisualElements(context) {
  const viewportArea = Number(context.viewport?.width || 0) * Number(context.viewport?.height || 0);
  if (!viewportArea) return [];
  return context.elements.filter((element) => {
    const text = `${element.type} ${element.selector} ${element.tagName}`.toLowerCase();
    const areaRatio = Number(element.area || 0) / viewportArea;
    return areaRatio >= 0.12 && /media|image|hero|visual|frame|artboard|card|panel/.test(text);
  });
}

function hasHeroLikeComposition(context) {
  return Boolean(primaryHeading(context) && context.actions.length >= 1 && largeVisualElements(context).length >= 1);
}

function similarActionSizes(actions = []) {
  if (actions.length < 2) return false;
  const sorted = actions.slice().sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x).slice(0, 4);
  return sorted.some((first, index) => {
    return sorted.slice(index + 1).some((second) => {
      const widthRatio = Math.min(first.bounds.width, second.bounds.width) / Math.max(first.bounds.width, second.bounds.width);
      const heightRatio = Math.min(first.bounds.height, second.bounds.height) / Math.max(first.bounds.height, second.bounds.height);
      const firstCenterY = Number(first.bounds.centerY ?? first.bounds.y + first.bounds.height / 2);
      const secondCenterY = Number(second.bounds.centerY ?? second.bounds.y + second.bounds.height / 2);
      const verticalDelta = Math.abs(firstCenterY - secondCenterY);
      return widthRatio >= 0.72 && heightRatio >= 0.82 && verticalDelta <= Math.max(first.bounds.height, second.bounds.height) * 1.2;
    });
  });
}

function hasRepeatedComparisonCards(context) {
  const cards = cardElements(context);
  if (cards.length < 3) return false;
  const buttons = context.actions.length;
  const planLanguage = context.elements.some((element) => /plan|pricing|starter|growth|enterprise|trial|sales/i.test(`${element.selector} ${element.text}`));
  return buttons >= 2 || planLanguage;
}

function isTypographyHeavy(context) {
  return Boolean(context.headings.length >= 1 && context.textBlocks.length >= 2 && context.actions.length === 0);
}

function quotedOrTestimonialElements(context) {
  return context.elements.filter((element) => /quote|testimonial|customer/i.test(`${element.selector} ${element.type}`));
}

function isAdminWorkspace(context) {
  return context.elements.some((element) =>
    /admin|administration|workspace|roles|policies|integrations|billing|logs|alerts/i.test(
      `${element.selector} ${element.text} ${element.type}`
    )
  );
}

function isComponentSystemScreen(context) {
  return context.elements.some((element) =>
    /component library|component preview|design system|system-card|button-\d|component/i.test(
      `${element.selector} ${element.text} ${element.type}`
    )
  );
}

function createSynthesisFinding(context, config) {
  return createFinding(context, {
    ...config,
    ruleId: `synthesis/${config.reviewPass}`,
    source: "rule-engine",
    selector: "",
    synthesisType: config.reviewPass,
    isSynthesisFinding: true
  });
}

function synthesizeHierarchy(context, findings) {
  const hierarchyFindings = byCategory(findings, "visual-hierarchy");
  const heading = primaryHeading(context);
  const action = strongestAction(context);
  const heroLike = hasHeroLikeComposition(context);
  const designArtboard = Boolean(context.raw?.reviewTarget?.excludesPageChrome && (heading || action || largeVisualElements(context).length));
  const evidence = [];
  if (heading?.text) evidence.push(`the leading heading is "${titleFromText(heading.text)}"`);
  if (action?.text) evidence.push(`the strongest visible action appears to be "${titleFromText(action.text)}"`);
  if (heroLike) evidence.push("the hero visual area, heading, and CTA/action group share the opening scan path");
  if (designArtboard) evidence.push("the central design area contains the main artboard hierarchy rather than editor chrome");
  if (hierarchyFindings.length) evidence.push(`${hierarchyFindings.length} hierarchy rule finding(s) also crossed threshold`);
  if (hierarchyFindings.length < 2 && !hasRule(findings, "competing-primary-actions") && !heroLike && !designArtboard) return null;

  return createSynthesisFinding(context, {
    reviewPass: "visual-hierarchy",
    category: "visual-hierarchy",
    severity: heroLike && !context.raw?.reviewTarget?.excludesPageChrome
      ? "high"
      : designArtboard && !action
        ? "low"
        : hierarchyFindings.some((finding) => ["critical", "high"].includes(finding.severity))
          ? "high"
          : "medium",
    region: context.raw?.reviewTarget?.excludesPageChrome ? "Central artboard hierarchy" : "Primary reading path",
    regionBounds: upperBounds(context),
    markerType: "section",
    issue: "The primary reading path is not strong enough to make priority immediately clear.",
    evidence: evidence.join("; ") || "Multiple measured elements compete for early attention.",
    impact:
      "Users may need to inspect more of the screen before understanding the main message, priority action, or intended order of attention.",
    recommendation:
      "Strengthen the hierarchy from primary message to supporting detail to action, and reduce competing emphasis around secondary content.",
    bestPracticeReference:
      "Visual hierarchy should guide attention from primary message to supporting detail to action with minimal ambiguity.",
    reviewRationale:
      "This synthesis groups hierarchy signals from headings, actions, and rule findings into a page-level reviewer observation.",
    affectedUsers:
      "Users scanning quickly, first-time users, decision makers, and users with cognitive fatigue.",
    suggestedPriority: "Address before release if this screen drives conversion, onboarding, or task completion.",
    markerSummary: "Primary reading path",
    acceptanceCriteria: [
      "The primary message is visually strongest in the marked region.",
      "The preferred next action is visually distinct from secondary actions.",
      "Supporting content no longer competes with the main hierarchy.",
      "The screen can be understood during a short scan."
    ],
    confidence: Math.min(0.88, 0.68 + hierarchyFindings.length * 0.06)
  });
}

function synthesizeComparisonHierarchy(context, findings) {
  if (!hasRepeatedComparisonCards(context)) return null;
  return createSynthesisFinding(context, {
    reviewPass: "visual-hierarchy",
    category: "visual-hierarchy",
    severity: "medium",
    region: "Pricing cards",
    regionBounds: broadBounds(context, { x: 7, y: 15, width: 86, height: 54 }),
    markerType: "component-group",
    issue: "The comparison area does not create a clean plan priority.",
    evidence: `${cardElements(context).length} plan/card surfaces and ${context.actions.length} action(s) share the comparison region, so card emphasis and button treatment need to make priority clear.`,
    impact:
      "Users comparing options may spend longer deciding which plan matters most because the comparison hierarchy is not sufficiently directed.",
    recommendation:
      "Clarify the recommended or primary plan, keep secondary cards quieter, and align CTA emphasis with the intended comparison priority.",
    bestPracticeReference:
      "Comparison layouts should make the recommended option and primary decision path visually clear without requiring detailed reading.",
    reviewRationale:
      "This synthesis turns repeated plan/card and action evidence into a comparison-priority finding rather than isolated card styling notes.",
    affectedUsers: "Buyers comparing plans, PMs reviewing conversion paths, and users deciding under time pressure.",
    suggestedPriority: "Address before release when the screen affects plan selection, conversion, or sales qualification.",
    markerSummary: "Plan comparison priority",
    acceptanceCriteria: [
      "The recommended or primary plan is visually identifiable during a short scan.",
      "Card emphasis supports comparison rather than decorative difference.",
      "CTA treatment follows the intended decision path.",
      "Repeated pricing components remain visibly part of the same system."
    ],
    confidence: findings.some((finding) => finding.category === "design-system") ? 0.78 : 0.7
  });
}

function synthesizeTypeScaleHierarchy(context) {
  if (!isTypographyHeavy(context)) return null;
  const heading = primaryHeading(context);
  const body = context.textBlocks.find((element) => !element.isHeading && element.text.length > 80) || context.textBlocks.find((element) => !element.isHeading);
  if (!heading || !body) return null;
  const headingSize = Number(heading.style?.fontSize || 0);
  const bodySize = Number(body.style?.fontSize || 0);
  const ratio = headingSize && bodySize ? headingSize / bodySize : 0;
  const bodyLineHeight = Number(body.style?.lineHeightRatio || 0);
  const sustainedReadingRisk =
    bodyLineHeight > 0 && bodyLineHeight < 1.35 || Number(context.typeScaleStats.averageLineLength || 0) > 75;
  if (ratio >= 2.2 && context.typeScaleStats.uniqueFontSizes.length >= 3 && !sustainedReadingRisk) return null;

  return createSynthesisFinding(context, {
    reviewPass: "visual-hierarchy",
    category: "visual-hierarchy",
    severity: "low",
    region: "Editorial section",
    regionBounds: textBounds(context),
    markerType: "text-region",
    issue: "The type scale does not create enough editorial rhythm between heading and body copy.",
    evidence: `The heading/body type scale needs editorial tuning for a typography-heavy section; heading size is ${headingSize || "unknown"}px, body size is ${bodySize || "unknown"}px, and body line-height is ${bodyLineHeight ? bodyLineHeight.toFixed(2) : "unknown"}.`,
    impact:
      "Readers may have to work harder to separate the main idea from supporting detail, especially in longer text blocks.",
    recommendation:
      "Increase hierarchy between heading, body, and supporting aside content, and tune body line-height for sustained reading comfort.",
    bestPracticeReference:
      "Readable editorial layouts should use type scale, line-height, and spacing to separate headline, body, and supporting content.",
    reviewRationale:
      "This synthesis treats typography rhythm as a hierarchy issue, not just an isolated font-size check.",
    affectedUsers: "Readers scanning long-form content, users with cognitive fatigue, and users reviewing documentation under time pressure.",
    suggestedPriority: "Address when the section carries product explanation, legal guidance, onboarding, or review documentation.",
    markerSummary: "Heading/body type scale",
    acceptanceCriteria: [
      "The heading is clearly stronger than the body copy.",
      "Body copy remains comfortable for sustained reading.",
      "Supporting text is visually subordinate without becoming too soft.",
      "The section can be scanned before reading in detail."
    ],
    confidence: 0.7
  });
}

function synthesizeLayout(context, findings) {
  const layoutSignals = [
    ...byCategory(findings, "ux"),
    ...findings.filter((finding) => /spacing|group|density|fragment|alignment|composition/i.test(finding.issue))
  ];
  const groups = context.elements.length >= 8 ? proximityGroups(context.elements, 24) : [];
  const dense = context.densityMetrics.elementDensity >= context.profile.thresholds.highDensityElementsPer100kPx;
  const denseCardWorkspace = isAdminWorkspace(context) && cardElements(context).length >= 8;
  if (layoutSignals.length < 2 && !dense && !denseCardWorkspace) return null;

  return createSynthesisFinding(context, {
    reviewPass: "layout-composition",
    category: "ux",
    severity: (dense && layoutSignals.length >= 2) || denseCardWorkspace ? "high" : "medium",
    region: context.raw?.reviewTarget?.excludesPageChrome ? "Central artboard composition" : "Screen composition",
    regionBounds: broadBounds(context),
    markerType: "composition",
    issue: "The composition relies on too many competing groups and spacing decisions.",
    evidence: [
      groups.length ? `${groups.length} proximity groups were measured` : "",
      dense ? `element density is ${context.densityMetrics.elementDensity.toFixed(1)} per 100k pixels` : "",
      denseCardWorkspace ? `${cardElements(context).length} dense card or tile surfaces compete with controls in the admin workspace` : "",
      layoutSignals.length ? `${layoutSignals.length} layout, spacing, or grouping signal(s) crossed threshold` : "",
      context.actions.length ? `${context.actions.length} visible control(s) contribute to scan and decision load` : ""
    ]
      .filter(Boolean)
      .join("; "),
    impact:
      "The interface can feel dense or crowded, increasing cognitive load and slowing scanning before users understand which controls or content groups matter most.",
    recommendation:
      "Consolidate related content into clearer groups, make spacing rhythm more predictable, and use alignment to create a stronger section structure.",
    bestPracticeReference:
      "Gestalt proximity and continuity principles say related information should appear grouped, aligned, and visually distinct from unrelated content.",
    reviewRationale:
      "This synthesis combines measured proximity, density, and spacing findings into a broader composition critique.",
    affectedUsers: "Users comparing information, scanning under time pressure, and users sensitive to cognitive load.",
    suggestedPriority: "Prioritise when the screen is used repeatedly or contains decision-critical information.",
    markerSummary: "Composition rhythm",
    acceptanceCriteria: [
      "Related blocks are visibly grouped and separated from unrelated blocks.",
      "Spacing uses a consistent rhythm across repeated sections.",
      "The marked area feels calmer without reducing necessary information.",
      "A reviewer can explain the section structure without relying on labels alone."
    ],
    confidence: Math.min(0.86, 0.64 + Math.min(layoutSignals.length, 4) * 0.05)
  });
}

function synthesizeUxClarity(context, findings) {
  const actionSignals = findings.filter((finding) => /action|button|cta|decision|target/i.test(`${finding.id} ${finding.issue}`));
  const similarActions = similarActionSizes(context.actions);
  if (context.actions.length < 2 || (actionSignals.length < 1 && !similarActions)) return null;
  const actionLabels = context.actions.slice(0, 4).map((action) => `"${titleFromText(action.text || action.selector)}"`);

  return createSynthesisFinding(context, {
    reviewPass: "ux-clarity",
    category: "ux",
    severity: actionSignals.some((finding) => ["critical", "high"].includes(finding.severity)) ? "high" : "medium",
    region: context.raw?.reviewTarget?.excludesPageChrome ? "Artboard action area" : "Action path",
    regionBounds: upperBounds(context),
    markerType: "action",
    issue: "The intended next action is not communicated with enough certainty.",
    evidence: `Visible primary and secondary actions include ${actionLabels.join(", ")}; their size, placement, and visual weight are close enough to increase decision effort.`,
    impact:
      "When users cannot quickly distinguish the preferred action from supporting actions, decision effort increases and completion confidence drops.",
    recommendation:
      "Make the primary action visually dominant, connect it more clearly to the headline or task context, and reduce secondary action emphasis.",
    bestPracticeReference:
      "Primary actions should be visually distinct from secondary actions and aligned with the user’s likely task flow.",
    reviewRationale:
      "This synthesis groups action-priority and affordance signals into a user-goal critique rather than a component-only warning.",
    affectedUsers: "New users, low-confidence users, keyboard users moving through actions, and users completing time-sensitive tasks.",
    suggestedPriority: "High when this screen has a conversion, approval, checkout, or submission goal.",
    markerSummary: "Action clarity",
    acceptanceCriteria: [
      "The primary action is identifiable without reading every control.",
      "Secondary actions are visibly subordinate.",
      "Action placement follows the visible reading path.",
      "The action group remains clear at the captured viewport size."
    ],
    confidence: Math.min(0.86, 0.7 + actionSignals.length * 0.04)
  });
}

function synthesizeAccessibilityVisible(context, findings) {
  const accessibilityFindings = byCategory(findings, "accessibility-visible");
  const contrastRisks = countContrastRisks(accessibilityFindings);
  const smallText = context.typeScaleStats.minFontSize > 0 && context.typeScaleStats.minFontSize < 13;
  if (!accessibilityFindings.length && !smallText) return null;

  return createSynthesisFinding(context, {
    reviewPass: "accessibility-visible",
    category: "accessibility-visible",
    severity: contrastRisks >= 2 || accessibilityFindings.some((finding) => finding.severity === "high" && /contrast|read/i.test(`${finding.id} ${finding.issue}`)) ? "high" : "medium",
    region: context.raw?.reviewTarget?.excludesPageChrome ? "Artboard readability" : "Readable content",
    regionBounds: textBounds(context),
    markerType: "accessibility-risk",
    issue: "Some content may be visually harder to read or activate than it should be.",
    evidence: [
      contrastRisks ? `${contrastRisks} readability or contrast risk signal(s)` : "",
      smallText ? `minimum measured text size is ${context.typeScaleStats.minFontSize}px` : "",
      `${accessibilityFindings.length} accessibility-visible finding(s) were generated`
    ]
      .filter(Boolean)
      .join("; "),
    impact:
      "Soft text, small targets, or unclear visual states can reduce confidence for users with low vision, motor needs, glare, or cognitive fatigue.",
    recommendation:
      "Increase text clarity, preserve comfortable hit areas, and ensure important states are communicated with more than colour alone.",
    bestPracticeReference:
      "Text intended for reading should maintain sufficient size, contrast, spacing, and non-colour cues for visible states.",
    reviewRationale:
      "This synthesis frames visible accessibility risks as practical readability and activation concerns without claiming full WCAG certification.",
    affectedUsers: "Low-vision users, motor-impaired users, users in bright environments, and users with cognitive fatigue.",
    suggestedPriority: "Address before release for primary content, controls, error states, or dense workflows.",
    markerSummary: "Readability risk",
    acceptanceCriteria: [
      "Important text remains readable at the captured viewport size.",
      "Meaningful actions have clear affordance and comfortable hit area.",
      "Status or error meaning is not communicated by colour alone.",
      "The marked region has been checked manually for keyboard and focus impact where relevant."
    ],
    confidence: Math.min(0.88, 0.66 + accessibilityFindings.length * 0.05)
  });
}

function synthesizeDesignSystem(context, findings) {
  const designFindings = byCategory(findings, "design-system");
  const components = context.components.filter((component) => component.bounds.width >= 16 && component.bounds.height >= 16);
  const radiusCount = radiusVariants(components);
  const shadowCount = shadowVariants(components);
  const cards = cardElements(context);
  if (!designFindings.length && cards.length < 3) return null;
  const isFrame = context.sourceType === "figma-capture" || context.sourceType === "zeplin-capture";
  const componentSystemScreen = isComponentSystemScreen(context);
  const evidenceParts = [
    designFindings.length ? `${designFindings.length} design-system rule finding(s)` : "",
    isFrame && cards.length ? `${cards.length} frame card component(s)` : "",
    radiusCount >= (isFrame ? 2 : 4) ? `${radiusCount} rounded-corner treatments` : "",
    shadowCount >= (isFrame ? 1 : 4) ? `${shadowCount} elevation/shadow treatments` : ""
  ].filter(Boolean);
  if (!evidenceParts.length) return null;

  return createSynthesisFinding(context, {
    reviewPass: "design-system",
    category: "design-system",
    severity: componentSystemScreen && designFindings.length >= 1
      ? "high"
      : isFrame && cards.length >= 3
        ? "medium"
        : designFindings.length >= 2 || radiusCount >= 5
        ? "medium"
        : "low",
    region: context.sourceType === "figma-capture" ? "Figma frame cards" : context.raw?.reviewTarget?.excludesPageChrome ? "Artboard component system" : "Component treatment",
    regionBounds: broadBounds(context, { x: 8, y: 12, width: 84, height: 70 }),
    markerType: "component-group",
    issue: "Repeated components do not feel governed by one consistent system.",
    evidence: evidenceParts.join("; "),
    impact:
      "Visual drift across repeated components makes the product feel less mature and can make similar controls appear to behave differently.",
    recommendation:
      "Standardise repeated component states, radius, elevation, spacing, and icon treatment through a smaller set of reusable patterns.",
    bestPracticeReference:
      "Repeated components should use consistent spacing, sizing, radius, elevation, and visual treatment to reduce interpretation cost.",
    reviewRationale:
      "This synthesis groups component-level inconsistencies into a design-system maturity observation.",
    affectedUsers: "Users relying on pattern recognition, product teams maintaining the UI, and stakeholders judging product quality.",
    suggestedPriority: "Medium unless the inconsistent components are primary actions or core workflow elements.",
    markerSummary: "Component consistency",
    acceptanceCriteria: [
      "Repeated components use consistent radius, spacing, and elevation rules.",
      "Similar actions use similar visual treatment.",
      "Intentional variants are documented or visibly purposeful.",
      "The marked component group feels like part of the same product system."
    ],
    confidence: Math.min(0.82, 0.62 + designFindings.length * 0.06)
  });
}

function synthesizeEnterprisePolish(context, findings) {
  const polishFindings = byCategory(findings, "enterprise-polish");
  const noisy = hasRule(findings, "noisy-border-shadow-use") || hasRule(findings, "fragmented-composition");
  const cards = cardElements(context);
  const denseCards = cards.length >= 8;
  if (polishFindings.length < 1 && !noisy && !denseCards) return null;

  return createSynthesisFinding(context, {
    reviewPass: "enterprise-polish",
    category: "enterprise-polish",
    severity: polishFindings.length >= 3 || denseCards ? "high" : "medium",
    region: denseCards ? "Summary cards" : context.raw?.reviewTarget?.excludesPageChrome ? "Artboard polish" : "Overall visual polish",
    regionBounds: broadBounds(context),
    markerType: "composition",
    issue: denseCards
      ? "Too many similarly weighted summary cards compete for first attention."
      : "The visual treatment does not yet feel as deliberate as an enterprise release surface should.",
    evidence: denseCards
      ? `${cards.length} dense card surfaces appear in the summary area, making scan priority less clear.`
      : `${polishFindings.length} enterprise-polish signal(s) crossed threshold${noisy ? ", including noisy elevation or fragmented composition" : ""}.`,
    impact:
      "Inconsistent polish can weaken trust, make the product feel less stable, and distract from the actual task the screen is meant to support.",
    recommendation:
      "Reduce decorative competition, align elevation and borders to a clear system, and make the composition support task comprehension first.",
    bestPracticeReference:
      "Enterprise product UI should use restrained visual treatment, consistent component systems, and composition that supports trust and clarity.",
    reviewRationale:
      "This synthesis converts multiple polish signals into a release-quality reviewer note focused on trust and maturity.",
    affectedUsers: "Enterprise buyers, internal operators, accessibility reviewers, and users who depend on predictable product surfaces.",
    suggestedPriority: "Medium for general polish; high when this is a sales, onboarding, checkout, or executive-facing surface.",
    markerSummary: "Enterprise polish",
    acceptanceCriteria: [
      "Decorative treatments support the content instead of competing with it.",
      "Elevation, borders, and shadows follow a consistent visual system.",
      "The marked area reads as intentional and production-ready.",
      "The composition prioritises task clarity over visual novelty."
    ],
    confidence: Math.min(0.84, 0.64 + polishFindings.length * 0.05)
  });
}

function synthesizeDesignScreenPolish(context) {
  if (!context.raw?.reviewTarget?.excludesPageChrome) return null;
  const testimonial = quotedOrTestimonialElements(context)[0];
  if (!testimonial) return null;
  return createSynthesisFinding(context, {
    reviewPass: "enterprise-polish",
    category: "enterprise-polish",
    severity: "medium",
    region: "Testimonial block",
    regionBounds: textBounds(context),
    markerType: "composition",
    issue: "The testimonial treatment may compete with the credibility of the quote.",
    evidence: "Within the central artboard, the testimonial/quote area is visually prominent enough to affect polish and trust.",
    impact:
      "If decorative quote treatment competes with the actual testimonial text or attribution, the section can feel less credible and less editorially mature.",
    recommendation:
      "Make the quote text and attribution the clearest elements, then reduce any decorative treatment that competes with readability.",
    bestPracticeReference:
      "Trust-building content should use restrained visual treatment so evidence, attribution, and message remain credible.",
    reviewRationale:
      "This synthesis reviews only the isolated design artboard and ignores the surrounding Zeplin/Figma editor interface.",
    affectedUsers: "Design reviewers, stakeholders assessing trust, and users relying on social proof.",
    suggestedPriority: "Review before release if the testimonial is meant to build confidence or conversion intent.",
    markerSummary: "Testimonial polish",
    acceptanceCriteria: [
      "The quote text is easier to read than decorative quote treatment.",
      "Attribution is clearly connected to the testimonial.",
      "The testimonial block feels credible and restrained.",
      "No Zeplin or Figma editor chrome is included in this finding."
    ],
    confidence: 0.72
  });
}

function statusForCategory(findings, category) {
  const categoryFindings = byCategory(findings, category);
  if (!categoryFindings.length) return "Strong";
  if (categoryFindings.some((finding) => finding.severity === "critical") || categoryFindings.length >= 4) return "Weak";
  if (categoryFindings.some((finding) => ["high", "medium"].includes(finding.severity))) return "Needs attention";
  return "Mostly strong";
}

export function buildScreenComprehension(context) {
  const heading = primaryHeading(context);
  const action = strongestAction(context);
  return {
    screenType: screenType(context),
    likelyUserGoal: likelyUserGoal(context),
    primaryContent: titleFromText(heading?.text || context.textBlocks[0]?.text || context.raw?.media?.metadata?.sourcePageTitle),
    primaryAction: action ? titleFromText(action.text || action.selector, "visible action") : "",
    mainVisualRegions: (context.detectedRegions || []).slice(0, 5).map((region) => region.label).filter(Boolean),
    dominantCompositionPattern:
      context.densityMetrics.elementDensity >= context.profile.thresholds.highDensityElementsPer100kPx
        ? "Dense information workspace"
        : context.isDesignScreen
          ? "Design/artboard surface"
          : "Standard visible page",
    confidence: context.hasDomMetrics ? 0.78 : 0.35
  };
}

export function buildReviewIndicators(findings = []) {
  return {
    visualHierarchy: statusForCategory(findings, "visual-hierarchy"),
    uxClarity: statusForCategory(findings, "ux"),
    accessibilityVisibleRisk: statusForCategory(findings, "accessibility-visible"),
    designSystemConsistency: statusForCategory(findings, "design-system"),
    enterprisePolish: statusForCategory(findings, "enterprise-polish")
  };
}

export function synthesizeReviewFindings(context, ruleFindings = [], depth) {
  if (!context.hasDomMetrics || !context.elements.length) {
    return {
      findings: [],
      summary: context.isImageOnly
        ? "Synthesis skipped because image-only deterministic review has no reliable element, text, or component metrics."
        : "Synthesis skipped because insufficient deterministic evidence was available.",
      passes: PASS_IDS.map((passId) => ({
        passId,
        status: passId === "screen-comprehension" ? "completed" : "skipped"
      }))
    };
  }

  const candidates = [
    synthesizeHierarchy(context, ruleFindings),
    synthesizeComparisonHierarchy(context, ruleFindings),
    synthesizeTypeScaleHierarchy(context),
    synthesizeLayout(context, ruleFindings),
    synthesizeUxClarity(context, ruleFindings),
    synthesizeAccessibilityVisible(context, ruleFindings),
    synthesizeDesignSystem(context, ruleFindings),
    synthesizeEnterprisePolish(context, ruleFindings),
    synthesizeDesignScreenPolish(context)
  ].filter(Boolean);
  const limit = Number(depth?.maxSynthesisFindings || 4);
  const findings = candidates.slice(0, limit);

  return {
    findings,
    summary: findings.length
      ? `Synthesised ${findings.length} broader reviewer observation(s) from deterministic rule evidence.`
      : "No broader synthesis findings crossed the evidence threshold.",
    passes: PASS_IDS.map((passId) => ({
      passId,
      status: passId === "screen-comprehension" || passId === "synthesis" || findings.some((finding) => finding.reviewPass === passId)
        ? "completed"
        : "skipped"
    }))
  };
}
