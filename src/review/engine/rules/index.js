import competingPrimaryActionsRule from "./visual-hierarchy/competing-primary-actions.js";
import weakHeadingEmphasisRule from "./visual-hierarchy/weak-heading-emphasis.js";
import unclearFocalPointRule from "./visual-hierarchy/unclear-focal-point.js";
import poorSectionPriorityRule from "./visual-hierarchy/poor-section-priority.js";
import insufficientAboveFoldHierarchyRule from "./visual-hierarchy/insufficient-above-fold-hierarchy.js";
import inconsistentSpacingRhythmRule from "./layout-spacing/inconsistent-spacing-rhythm.js";
import overcrowdedRegionRule from "./layout-spacing/overcrowded-region.js";
import poorAlignmentConsistencyRule from "./layout-spacing/poor-alignment-consistency.js";
import weakVisualGroupingRule from "./layout-spacing/weak-visual-grouping.js";
import brokenEightPointSpacingScaleRule from "./layout-spacing/broken-8pt-spacing-scale.js";
import tinyReadableTextRule from "./typography/tiny-readable-text.js";
import weakTypeScaleRule from "./typography/weak-type-scale.js";
import excessiveLineLengthRule from "./typography/excessive-line-length.js";
import poorLineHeightRule from "./typography/poor-line-height.js";
import inconsistentFontFamilyRule from "./typography/inconsistent-font-family.js";
import lowContrastRiskRule from "./accessibility-visible/low-contrast-risk.js";
import smallTouchTargetsRule from "./accessibility-visible/small-touch-targets.js";
import colourOnlyStatusRiskRule from "./accessibility-visible/colour-only-status-risk.js";
import weakFocusVisibilityRiskRule from "./accessibility-visible/weak-focus-visibility-risk.js";
import poorErrorVisibilityRule from "./accessibility-visible/poor-error-visibility.js";
import inconsistentButtonStylesRule from "./design-system/inconsistent-button-styles.js";
import inconsistentCardStylesRule from "./design-system/inconsistent-card-styles.js";
import inconsistentRadiusShadowRule from "./design-system/inconsistent-radius-shadow.js";
import inconsistentIconTreatmentRule from "./design-system/inconsistent-icon-treatment.js";
import noisyBorderShadowUseRule from "./enterprise-polish/noisy-border-shadow-use.js";
import excessiveDensityRule from "./enterprise-polish/excessive-density.js";
import fragmentedCompositionRule from "./enterprise-polish/fragmented-composition.js";
import lowTrustVisualTreatmentRule from "./enterprise-polish/low-trust-visual-treatment.js";
import missingElevationSystemRule from "./enterprise-polish/missing-elevation-system.js";
import contentCrushOnNarrowViewportRule from "./responsive-layout/content-crush-on-narrow-viewport.js";

export const REVIEW_RULES = Object.freeze([
  competingPrimaryActionsRule,
  weakHeadingEmphasisRule,
  unclearFocalPointRule,
  poorSectionPriorityRule,
  insufficientAboveFoldHierarchyRule,
  inconsistentSpacingRhythmRule,
  overcrowdedRegionRule,
  poorAlignmentConsistencyRule,
  weakVisualGroupingRule,
  brokenEightPointSpacingScaleRule,
  tinyReadableTextRule,
  weakTypeScaleRule,
  excessiveLineLengthRule,
  poorLineHeightRule,
  inconsistentFontFamilyRule,
  lowContrastRiskRule,
  smallTouchTargetsRule,
  colourOnlyStatusRiskRule,
  weakFocusVisibilityRiskRule,
  poorErrorVisibilityRule,
  inconsistentButtonStylesRule,
  inconsistentCardStylesRule,
  inconsistentRadiusShadowRule,
  inconsistentIconTreatmentRule,
  noisyBorderShadowUseRule,
  excessiveDensityRule,
  fragmentedCompositionRule,
  lowTrustVisualTreatmentRule,
  missingElevationSystemRule,
  contentCrushOnNarrowViewportRule
]);
