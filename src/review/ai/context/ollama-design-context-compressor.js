const MAX_FINDINGS = 14;
const MAX_REGIONS = 10;
const MAX_TEXT_ITEMS = 8;

function truncate(value, max = 280) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function compactFinding(finding = {}) {
  return {
    id: finding.id,
    category: finding.category,
    severity: finding.severity,
    region: truncate(finding.region, 90),
    issue: truncate(finding.issue, 180),
    evidence: truncate(finding.evidence, 220),
    impact: truncate(finding.impact, 180),
    recommendation: truncate(finding.recommendation, 180),
    confidence: finding.confidence,
    regionBounds: finding.regionBounds || null,
    markerType: finding.markerType || ""
  };
}

function compactRegion(region = {}) {
  return {
    id: region.id,
    type: region.type,
    label: region.label,
    bounds: region.bounds,
    percentBounds: region.percentBounds,
    elementCount: region.elementCount,
    representativeText: truncate(region.representativeText, 180),
    confidence: region.confidence
  };
}

export function compressOllamaDesignContext(contextPackage = {}) {
  const visual = contextPackage.visualSummary || {};
  return {
    packageVersion: contextPackage.packageVersion,
    reviewTargetType: contextPackage.reviewTargetType,
    sourceType: contextPackage.sourceType,
    designAreaBounds: contextPackage.designAreaBounds,
    screenshotDimensions: contextPackage.screenshotDimensions,
    targetIsolation: contextPackage.targetIsolation,
    sourceFlags: contextPackage.sourceFlags,
    instruction: contextPackage.instruction,
    ignoredAreas: contextPackage.targetIsolation?.ignoredAreas || [],
    limitations: contextPackage.limitations || [],
    screenUnderstandingSeed: {
      interfaceType: visual.interfaceType,
      likelyPrimaryMessage: truncate(visual.likelyPrimaryMessage, 220),
      likelyPrimaryAction: visual.likelyPrimaryAction || null,
      likelyReadingPath: truncate(visual.likelyReadingPath, 220)
    },
    visualSummaries: {
      visualDensitySummary: truncate(visual.visualDensitySummary, 220),
      typographySummary: truncate(visual.typographySummary, 220),
      spacingRhythmSummary: truncate(visual.spacingRhythmSummary, 220),
      colourContrastRiskSummary: truncate(visual.colourContrastRiskSummary, 220),
      componentConsistencySummary: truncate(visual.componentConsistencySummary, 220),
      localVisualAnalysisSummary: truncate(visual.localVisualAnalysisSummary, 260)
    },
    localVisualAnalysis: contextPackage.localVisualAnalysis
      ? {
          imageMetadata: contextPackage.localVisualAnalysis.imageMetadata,
          colourPalette: (contextPackage.localVisualAnalysis.colourPalette || []).slice(0, 8),
          measuredContrastPairs: (contextPackage.localVisualAnalysis.measuredContrastPairs || []).slice(0, 8),
          lowContrastTextLikeRegions: (contextPackage.localVisualAnalysis.lowContrastTextLikeRegions || []).slice(0, 6),
          ocr: contextPackage.localVisualAnalysis.ocr || null,
          ocrTextRegions: (contextPackage.localVisualAnalysis.ocrTextRegions || []).slice(0, 10),
          ocrContrastResults: (contextPackage.localVisualAnalysis.ocrContrastResults || []).slice(0, 8),
          layoutRegions: (contextPackage.localVisualAnalysis.layoutRegions || []).slice(0, 8),
          visualHierarchy: contextPackage.localVisualAnalysis.visualHierarchy,
          spacingDensity: contextPackage.localVisualAnalysis.spacingDensity,
          alignment: contextPackage.localVisualAnalysis.alignment,
          repeatedColourUse: contextPackage.localVisualAnalysis.repeatedColourUse,
          ctaCandidates: (contextPackage.localVisualAnalysis.ctaCandidates || []).slice(0, 6),
          modelObservations: (contextPackage.localVisualAnalysis.modelObservations || []).slice(0, 8),
          processing: contextPackage.localVisualAnalysis.processing || null,
          limitations: contextPackage.localVisualAnalysis.limitations || []
        }
      : null,
    localVisionModel: contextPackage.localVisionModel
      ? {
          available: Boolean(contextPackage.localVisionModel.available),
          source: contextPackage.localVisionModel.source || "",
          provider: contextPackage.localVisionModel.provider || "",
          model: contextPackage.localVisionModel.model || "",
          structuralSummary: contextPackage.localVisionModel.structuralSummary || {},
          modelObservations: (contextPackage.localVisionModel.modelObservations || []).slice(0, 8),
          limitations: contextPackage.localVisionModel.limitations || []
        }
      : null,
    visibleTextHierarchy: (visual.visibleTextHierarchy || []).slice(0, MAX_TEXT_ITEMS),
    visibleActions: (visual.visibleActions || []).slice(0, MAX_TEXT_ITEMS),
    majorRegions: (contextPackage.majorRegions || []).slice(0, MAX_REGIONS).map(compactRegion),
    deterministicFindings: (contextPackage.deterministicFindings || []).slice(0, MAX_FINDINGS).map(compactFinding),
    markerRegions: (contextPackage.markerRegions || []).slice(0, MAX_FINDINGS)
  };
}
