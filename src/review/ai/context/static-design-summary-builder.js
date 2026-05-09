function text(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function sortedByWeight(items = []) {
  return (Array.isArray(items) ? items : [])
    .slice()
    .sort((a, b) => Number(b.visualWeight || 0) - Number(a.visualWeight || 0));
}

function compactElement(element = {}) {
  return {
    text: text(element.text).slice(0, 120),
    selector: element.selector || "",
    type: element.type || element.tagName || "",
    bounds: element.bounds || null,
    fontSize: element.fontSize || element.computedStyle?.fontSize || "",
    visualWeight: Number(element.visualWeight || 0)
  };
}

function likelyPrimaryMessage({ headings = [], textBlocks = [], sourceType = "" } = {}) {
  const strongestHeading = sortedByWeight(headings)[0] || headings[0];
  if (strongestHeading?.text) return text(strongestHeading.text).slice(0, 160);
  const firstText = textBlocks.find((element) => text(element.text).length > 8);
  if (firstText?.text) return text(firstText.text).slice(0, 160);
  if (/zeplin|figma|design|static/i.test(sourceType)) return "Primary message not reliably available from image-only design context.";
  return "Primary message not detected from available metadata.";
}

function likelyPrimaryAction(actions = []) {
  const ranked = sortedByWeight(actions);
  const action = ranked.find((item) => text(item.text).length) || ranked[0];
  return action ? compactElement(action) : null;
}

function readingPathSummary(regions = []) {
  if (!regions.length) return "Reading path could not be inferred confidently from available metadata.";
  return regions
    .slice(0, 6)
    .map((region) => region.type || region.label)
    .join(" -> ");
}

function densitySummary(metrics = {}) {
  const density = metrics.densityMetrics || {};
  const value = Number(density.elementsPerViewport || density.elementDensity || density.totalElements || 0);
  if (value > 80) return "High visible density; user scan effort may be elevated.";
  if (value > 35) return "Moderate visible density; grouping and hierarchy should be checked carefully.";
  return "Density appears low to moderate from available metrics.";
}

function typographySummary(context = {}) {
  const stats = context.typeScaleStats || {};
  const fontSizes = Array.isArray(stats.fontSizes) ? stats.fontSizes : [];
  if (fontSizes.length) {
    return `Detected type sizes include ${fontSizes.slice(0, 6).join(", ")}; check scale separation and body readability.`;
  }
  return context.hasTextMetrics
    ? "Text metrics are available; check heading/body separation and readable line rhythm."
    : "Text metrics are limited; typography review must remain visual and conservative.";
}

function spacingSummary(context = {}) {
  const spacing = context.spacingMetrics || context.densityMetrics?.spacing || {};
  if (spacing.scaleFit) return `Spacing appears ${spacing.scaleFit} against the detected spacing rhythm.`;
  return "Spacing rhythm should be reviewed visually against region grouping and repeated components.";
}

function colourSummary(context = {}) {
  const visualAnalysis = context.visualAnalysis?.evidence;
  const measuredLowContrast = visualAnalysis?.lowContrastTextLikeRegions || [];
  const measuredPairs = visualAnalysis?.contrastPairs || [];
  if (measuredLowContrast.length || measuredPairs.length) {
    return `${measuredPairs.length} local contrast pair(s) and ${measuredLowContrast.length} low-contrast text-like region(s) were measured from screenshot pixels.`;
  }
  const contrastRisks = context.colourMetrics?.contrastRisks || context.contrastRisks || [];
  if (Array.isArray(contrastRisks) && contrastRisks.length) {
    return `${contrastRisks.length} possible contrast/readability risk(s) were detected where colour metrics were available.`;
  }
  return context.hasComputedStyles
    ? "Computed colour data is partially available; avoid overclaiming WCAG unless measurements are reliable."
    : "Colour and contrast review is visual only; do not claim exact WCAG failure.";
}

function componentSummary(context = {}) {
  const components = Array.isArray(context.components) ? context.components : [];
  const actionCount = Array.isArray(context.actions) ? context.actions.length : 0;
  if (components.length || actionCount) {
    return `${components.length} component-like region(s) and ${actionCount} action/control candidate(s) are available for consistency review.`;
  }
  return "Component metadata is limited; use visible repetition, shape, colour, and layout treatment conservatively.";
}

function visualAnalysisSummary(context = {}) {
  const evidence = context.visualAnalysis?.evidence;
  if (!evidence) return "Local pixel-level visual analysis is unavailable.";
  const paletteCount = evidence.colourPalette?.length || 0;
  const regionCount = evidence.layoutRegions?.length || 0;
  const focalCount = evidence.visualHierarchy?.focalPoints?.length || 0;
  const denseCount = evidence.spacingDensity?.denseClusterCount || 0;
  return `Local pixel analysis measured ${paletteCount} dominant colour(s), ${regionCount} section-like region(s), ${focalCount} focal region(s), and ${denseCount} dense cluster(s).`;
}

export function buildStaticDesignSummary({ context = {}, regions = [], sourceType = "" } = {}) {
  const headings = Array.isArray(context.headings) ? context.headings : [];
  const actions = Array.isArray(context.actions) ? context.actions : [];
  const textBlocks = Array.isArray(context.textBlocks) ? context.textBlocks : [];
  const primaryAction = likelyPrimaryAction(actions);

  return {
    interfaceType: context.screenComprehension?.screenType || (/dashboard/i.test(sourceType) ? "dashboard" : "static interface design"),
    likelyPrimaryMessage: likelyPrimaryMessage({ headings, textBlocks, sourceType }),
    likelyPrimaryAction: primaryAction,
    likelyReadingPath: readingPathSummary(regions),
    visualDensitySummary: densitySummary(context),
    typographySummary: typographySummary(context),
    spacingRhythmSummary: spacingSummary(context),
    colourContrastRiskSummary: colourSummary(context),
    componentConsistencySummary: componentSummary(context),
    localVisualAnalysisSummary: visualAnalysisSummary(context),
    visibleTextHierarchy: headings.slice(0, 8).map(compactElement),
    visibleActions: actions.slice(0, 10).map(compactElement)
  };
}
