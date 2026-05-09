import { createReviewSession } from "../contracts/review-session.js";
import {
  AI_PROVIDER_OPTIONS,
  AI_REVIEW_MODE_OPTIONS,
  aiProviderRequiresApiKey,
  aiProviderRequiresEndpoint,
  clearAiReviewConfig,
  getAiProviderOption,
  getAiProviderSettings,
  loadAiReviewConfig,
  normalizeAiReviewConfig,
  saveAiReviewConfig
} from "../ai/ai-review-config.js";
import { runAiReview, testAiReviewConnection } from "../ai/ai-review-engine.js";
import { AI_REVIEW_MODES } from "../ai/ai-review-schema.js";
import { aiReviewErrorMessage } from "../ai/ai-review-errors.js";
import { runReviewEngine } from "../engine/review-engine.js";
import { createReviewContext } from "../engine/review-context.js";
import { designReviewGuidanceForSource } from "../design/design-review-guidance.js";
import {
  detectCentralDesignArea,
  filterMetricsForDesignArea,
  findingWithinDesignArea
} from "../design/design-area-detector.js";
import { detectDesignSource } from "../design/design-source-detector.js";
import { isDesignReviewSourceType, reviewModeBadge } from "../design/design-review-mode.js";
import { filterValidReviewFindings } from "../findings/finding-validator.js";
import { renderFindingInspector } from "./finding-inspector.js";
import { renderFindingList, visibleFindingsForFilters } from "./finding-list.js";
import { renderOverlayMarkers } from "../overlays/overlay-renderer.js";
import { buildHtmlReviewReport } from "../reports/review-html-report.js";
import { buildJsonReviewReport } from "../reports/review-json-report.js";
import { buildMarkdownReviewReport } from "../reports/review-markdown-report.js";
import { buildReviewSummaryMarkdown } from "../reports/review-report-builder.js";
import { buildTicketMarkdown } from "../reports/ticket-builder.js";
import { downloadTextReport, reviewReportFilename } from "../reports/report-download.js";
import { createVolatileReviewSessionStore } from "../store/review-session-store.js";
import { buildReviewWorkspaceMetadata } from "../store/review-workspace-summary.js";
import { loadReviewImageSource } from "../utils/image-source.js";
import { runLocalVisualAnalysisFromImageElement } from "../visual-analysis/visual-analysis-pipeline.js";
import { updateMediaMetadata } from "../../storage/storage.js";

const ENABLE_REVIEW_DEV_FINDINGS = false;

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function developmentSampleFindings(session) {
  if (!ENABLE_REVIEW_DEV_FINDINGS) return [];

  return [
    {
      id: "development-sample-visual-hierarchy",
      category: "visual-hierarchy",
      severity: "low",
      region: "Development sample region",
      issue: "Development sample data: visual hierarchy review item.",
      evidence: "Development sample data only. This is not generated from the screenshot.",
      impact: "Development sample data only. Do not treat this as production review output.",
      recommendation: "Disable development sample findings before validating production review behavior.",
      confidence: 0.1,
      screenshotRef: session.screenshotRef,
      selector: "",
      source: "manual-review"
    }
  ];
}

export function createReviewController({ document, window, location }) {
  const store = createVolatileReviewSessionStore();
  const elements = {
    layout: document.querySelector(".review-layout"),
    backButton: document.getElementById("backToMemoryBtn"),
    aiSettingsButton: document.getElementById("aiSettingsBtn"),
    aiSettingsDialog: document.getElementById("aiSettingsDialog"),
    aiSettingsCloseButton: document.getElementById("aiSettingsCloseBtn"),
    copySummaryButton: document.getElementById("copySummaryBtn"),
    exportHtmlButton: document.getElementById("exportHtmlBtn"),
    exportMarkdownButton: document.getElementById("exportMarkdownBtn"),
    exportJsonButton: document.getElementById("exportJsonBtn"),
    aiEnabledToggle: document.getElementById("aiEnabledToggle"),
    aiProviderSelect: document.getElementById("aiProviderSelect"),
    aiReviewModeSelect: document.getElementById("aiReviewModeSelect"),
    aiModelInput: document.getElementById("aiModelInput"),
    aiEndpointRow: document.getElementById("aiEndpointRow"),
    aiEndpointInput: document.getElementById("aiEndpointInput"),
    aiApiKeyRow: document.getElementById("aiApiKeyRow"),
    aiApiKeyInput: document.getElementById("aiApiKeyInput"),
    aiScreenshotSharingToggle: document.getElementById("aiScreenshotSharingToggle"),
    aiProviderSummary: document.getElementById("aiProviderSummary"),
    aiStatusPill: document.getElementById("aiStatusPill"),
    aiStatusText: document.getElementById("aiStatusText"),
    aiPassList: document.getElementById("aiPassList"),
    runAiReviewButton: document.getElementById("runAiReviewBtn"),
    cancelAiReviewButton: document.getElementById("cancelAiReviewBtn"),
    testAiConnectionButton: document.getElementById("testAiConnectionBtn"),
    clearAiSettingsButton: document.getElementById("clearAiSettingsBtn"),
    reviewModeBadge: document.getElementById("reviewModeBadge"),
    sourceNotice: document.getElementById("sourceNotice"),
    sourceNoticeTitle: document.getElementById("sourceNoticeTitle"),
    sourceNoticeText: document.getElementById("sourceNoticeText"),
    reviewBoundaryText: document.getElementById("reviewBoundaryText"),
    sourceReviewTypeValue: document.getElementById("sourceReviewTypeValue"),
    sourceTypeValue: document.getElementById("sourceTypeValue"),
    sourceDimensionsValue: document.getElementById("sourceDimensionsValue"),
    sourceAiStatusValue: document.getElementById("sourceAiStatusValue"),
    sourceMetadataValue: document.getElementById("sourceMetadataValue"),
    reviewScopeControls: document.getElementById("reviewScopeControls"),
    reviewVisibleScreenButton: document.getElementById("reviewVisibleScreenBtn"),
    reviewDesignAreaButton: document.getElementById("reviewDesignAreaBtn"),
    designGuidancePanel: document.getElementById("designGuidancePanel"),
    designGuidanceList: document.getElementById("designGuidanceList"),
    title: document.getElementById("reviewTitle"),
    meta: document.getElementById("reviewMeta"),
    findingsCount: document.getElementById("findingsCount"),
    findingsList: document.getElementById("findingsList"),
    inspectorPanel: document.getElementById("inspectorPanel"),
    inspector: document.getElementById("findingInspector"),
    loadingState: document.getElementById("loadingState"),
    progressText: document.getElementById("progressText"),
    errorState: document.getElementById("errorState"),
    screenshotFrame: document.getElementById("screenshotFrame"),
    screenshotImage: document.getElementById("screenshotImage"),
    overlayLayer: document.getElementById("overlayLayer"),
    liveStatus: document.getElementById("reviewLiveStatus"),
    copyFallbackDialog: document.getElementById("copyFallbackDialog"),
    copyFallbackText: document.getElementById("copyFallbackText"),
    copyFallbackCloseButton: document.getElementById("copyFallbackCloseBtn")
  };

  let imageSource = null;
  let session = null;
  let baseReviewSession = null;
  let reviewContext = null;
  let designSource = null;
  let designArea = null;
  let rawReviewMetrics = {};
  let visualAnalysis = null;
  let reviewScope = "visible-screen";
  let deterministicFindings = [];
  let aiConfig = normalizeAiReviewConfig();
  let aiAbortController = null;
  let aiRunning = false;
  let selectedFindingId = "";
  let findingFilters = { severity: "all", category: "all" };
  let statusTimer = null;

  function itemIdFromUrl() {
    const params = new URLSearchParams(location.search);
    return String(params.get("itemId") || "").trim();
  }

  function backToMemory() {
    const memoryUrl = chrome.runtime.getURL("gallery.html");
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = memoryUrl;
  }

  function setLoading(loading) {
    if (elements.loadingState) elements.loadingState.hidden = !loading;
    if (elements.errorState) elements.errorState.hidden = true;
    if (elements.screenshotFrame) elements.screenshotFrame.hidden = loading;
  }

  function setProgress(message) {
    if (elements.progressText) {
      elements.progressText.textContent = message;
    }
  }

  function setReportActionsEnabled(enabled) {
    [
      elements.copySummaryButton,
      elements.exportHtmlButton,
      elements.exportMarkdownButton,
      elements.exportJsonButton
    ].forEach((button) => {
      if (button) button.disabled = !enabled;
    });
  }

  function populateAiSelects() {
    if (elements.aiProviderSelect && !elements.aiProviderSelect.options.length) {
      AI_PROVIDER_OPTIONS.forEach((provider) => {
        const option = document.createElement("option");
        option.value = provider.id;
        option.textContent = provider.label;
        elements.aiProviderSelect.append(option);
      });
    }

    if (elements.aiReviewModeSelect && !elements.aiReviewModeSelect.options.length) {
      AI_REVIEW_MODE_OPTIONS.forEach((mode) => {
        const option = document.createElement("option");
        option.value = mode.id;
        option.textContent = mode.label;
        elements.aiReviewModeSelect.append(option);
      });
    }
  }

  function setAiStatus({ text, pill = "Off", active = false, error = false } = {}) {
    if (elements.aiStatusText && text) elements.aiStatusText.textContent = text;
    if (elements.sourceAiStatusValue) {
      elements.sourceAiStatusValue.textContent = pill === "Off" ? "AI Off" : `AI ${pill}`;
    }
    if (elements.aiStatusPill) {
      elements.aiStatusPill.textContent = pill === "Off" ? "AI Off" : `AI ${pill}`;
      elements.aiStatusPill.classList.toggle("active", active);
      elements.aiStatusPill.classList.toggle("error", error);
    }
  }

  function renderAiPass(pass) {
    if (!elements.aiPassList || !pass?.message) return;
    const item = document.createElement("li");
    item.textContent = pass.message;
    elements.aiPassList.append(item);
  }

  function readAiConfigFromControls() {
    const provider = elements.aiProviderSelect?.value || aiConfig.provider;
    const currentSettings = getAiProviderSettings(aiConfig, provider);
    const nextConfig = normalizeAiReviewConfig({
      ...aiConfig,
      enabled: Boolean(elements.aiEnabledToggle?.checked),
      provider,
      mode: elements.aiReviewModeSelect?.value || aiConfig.mode,
      screenshotSharingEnabled: Boolean(elements.aiScreenshotSharingToggle?.checked)
    });

    nextConfig.providerSettings[provider] = {
      ...currentSettings,
      model: elements.aiModelInput?.value || "",
      endpoint: elements.aiEndpointInput?.value || "",
      apiKey: elements.aiApiKeyInput?.value || ""
    };

    return normalizeAiReviewConfig(nextConfig);
  }

  async function persistAiConfigFromControls() {
    aiConfig = await saveAiReviewConfig(readAiConfigFromControls());
    renderAiControls();
    return aiConfig;
  }

  function renderAiControls() {
    populateAiSelects();
    const provider = getAiProviderOption(aiConfig.provider);
    const providerSettings = getAiProviderSettings(aiConfig, provider.id);
    const enabled = Boolean(aiConfig.enabled);
    const screenshotMode =
      aiConfig.mode === AI_REVIEW_MODES.FULL_VISUAL || aiConfig.mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL;

    if (elements.aiEnabledToggle) elements.aiEnabledToggle.checked = enabled;
    if (elements.aiProviderSelect) elements.aiProviderSelect.value = provider.id;
    if (elements.aiReviewModeSelect) elements.aiReviewModeSelect.value = aiConfig.mode;
    if (elements.aiModelInput) {
      elements.aiModelInput.value = providerSettings.model || "";
      elements.aiModelInput.disabled = !enabled || aiRunning;
    }
    if (elements.aiEndpointInput) {
      elements.aiEndpointInput.value = providerSettings.endpoint || "";
      elements.aiEndpointInput.disabled = !enabled || !aiProviderRequiresEndpoint(provider.id) || aiRunning;
    }
    if (elements.aiEndpointRow) elements.aiEndpointRow.hidden = !aiProviderRequiresEndpoint(provider.id);
    if (elements.aiApiKeyInput) {
      elements.aiApiKeyInput.value = providerSettings.apiKey || "";
      elements.aiApiKeyInput.disabled = !enabled || !aiProviderRequiresApiKey(provider.id) || aiRunning;
    }
    if (elements.aiApiKeyRow) elements.aiApiKeyRow.hidden = !aiProviderRequiresApiKey(provider.id);
    if (elements.aiScreenshotSharingToggle) {
      elements.aiScreenshotSharingToggle.checked = Boolean(aiConfig.screenshotSharingEnabled);
      elements.aiScreenshotSharingToggle.disabled = !enabled || !screenshotMode || !provider.supportsVision || aiRunning;
    }
    if (elements.aiProviderSelect) elements.aiProviderSelect.disabled = aiRunning;
    if (elements.aiReviewModeSelect) elements.aiReviewModeSelect.disabled = !enabled || aiRunning;
    if (elements.runAiReviewButton) elements.runAiReviewButton.disabled = !enabled || aiRunning || !session;
    if (elements.cancelAiReviewButton) elements.cancelAiReviewButton.disabled = !aiRunning;
    if (elements.testAiConnectionButton) elements.testAiConnectionButton.disabled = !enabled || aiRunning;
    if (elements.clearAiSettingsButton) elements.clearAiSettingsButton.disabled = aiRunning;

    if (elements.aiProviderSummary) {
      const modeLabel = AI_REVIEW_MODE_OPTIONS.find((mode) => mode.id === aiConfig.mode)?.label || "Text refine";
      const screenshotState =
        enabled && screenshotMode && aiConfig.screenshotSharingEnabled && provider.supportsVision
          ? "screenshot allowed"
          : "no screenshot sharing";
      elements.aiProviderSummary.textContent = enabled
        ? `${provider.label} | ${modeLabel} | ${screenshotState}`
        : "Disabled by default.";
    }

    if (!enabled) {
      setAiStatus({
        text: "AI review is off. Local deterministic visual review remains available without external processing.",
        pill: "Off"
      });
    }
  }

  function reviewSourceNoticeText(context, badge) {
    const sourceType = context?.sourceType || "unknown";
    const base =
      "Olho reviews visible interface quality across hierarchy, UX clarity, accessibility-visible risk, design-system consistency, and enterprise polish.";
    const imageOnly =
      "This review analyses the visible interface only. DOM, focus states, and live interaction data are unavailable.";
    const scopeText =
      reviewScope === "design-area" && designArea?.reason
        ? ` Review is currently focused on the central design area: ${designArea.reason}`
        : "";

    if (sourceType === "webpage-capture") {
      return context?.isImageOnly
        ? `Live webpage review from the captured screen. ${base} ${imageOnly}${scopeText}`
        : `Live webpage review with available interface metadata. ${base}${scopeText}`;
    }

    if (sourceType === "figma-capture") {
      return `Figma frame review from the current browser view. ${base} ${imageOnly}${scopeText}`;
    }

    if (sourceType === "zeplin-capture") {
      return `Zeplin screen review from the current browser view. ${base} ${imageOnly}${scopeText}`;
    }

    if (sourceType === "design-import" || sourceType === "static-design") {
      return `Fallback design screenshot review. ${base} ${imageOnly}${scopeText}`;
    }

    if (context?.isImageOnly) {
      return `${badge?.label || "Image-only review"}. ${base} ${imageOnly}${scopeText}`;
    }

    return `${badge?.label || "Visual review"}. ${base}${scopeText}`;
  }

  function reviewBoundaryText(context) {
    const measuredLimit =
      context?.hasDomMetrics || context?.hasComputedStyles || context?.hasInteractiveElements
        ? "Implementation metadata may inform the review, but findings remain visual and evidence-based."
        : "Selector, focus-state, live interaction, and code-level evidence are unavailable for this source.";
    return `This is not a code accessibility audit, backend review, live interaction automation, or full WCAG compliance certification. ${measuredLimit}`;
  }

  function metadataAvailabilityText(context) {
    if (!context) return "Unknown";
    const unavailable = [];
    if (!context.hasDomMetrics) unavailable.push("DOM");
    if (!context.hasComputedStyles) unavailable.push("computed styles");
    if (!context.hasTextMetrics) unavailable.push("text metrics");
    if (!context.hasInteractiveElements) unavailable.push("interactive element metrics");
    if (!unavailable.length) return "DOM, style, text, and interaction metrics available";
    return `Image only; missing ${unavailable.join(", ")}`;
  }

  function updateSourceInformation() {
    if (!session || !reviewContext) return;
    const badge = reviewModeBadge(reviewContext.sourceType);
    const dimensions =
      session.media.width && session.media.height ? `${session.media.width} x ${session.media.height}` : "dimensions unknown";
    if (elements.reviewModeBadge) {
      elements.reviewModeBadge.textContent = badge.label;
      elements.reviewModeBadge.setAttribute("aria-label", `Review source mode: ${badge.label}`);
    }
    if (elements.sourceNoticeTitle) elements.sourceNoticeTitle.textContent = badge.label;
    if (elements.sourceReviewTypeValue) elements.sourceReviewTypeValue.textContent = badge.label;
    if (elements.sourceTypeValue) elements.sourceTypeValue.textContent = reviewContext.sourceType;
    if (elements.sourceDimensionsValue) elements.sourceDimensionsValue.textContent = dimensions;
    if (elements.sourceMetadataValue) elements.sourceMetadataValue.textContent = metadataAvailabilityText(reviewContext);

    const shouldShowNotice = true;
    if (elements.sourceNotice) elements.sourceNotice.hidden = !shouldShowNotice;
    if (elements.sourceNoticeText) {
      elements.sourceNoticeText.textContent = reviewSourceNoticeText(reviewContext, badge);
    }
    if (elements.reviewBoundaryText) {
      elements.reviewBoundaryText.textContent = reviewBoundaryText(reviewContext);
    }

    renderReviewScopeControls();

    const guidance = designReviewGuidanceForSource(reviewContext.sourceType, designSource?.platform);
    if (elements.designGuidancePanel) elements.designGuidancePanel.hidden = !guidance.length;
    if (elements.designGuidanceList) {
      elements.designGuidanceList.innerHTML = "";
      guidance.forEach((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        elements.designGuidanceList.append(item);
      });
    }
  }

  function designAreaScopeAvailable() {
    return Boolean(
      designArea?.bounds &&
        (reviewContext?.isDesignScreen || isDesignReviewSourceType(designSource?.sourceType || ""))
    );
  }

  function renderReviewScopeControls() {
    const available = designAreaScopeAvailable();
    if (elements.reviewScopeControls) {
      elements.reviewScopeControls.hidden = !available;
      elements.reviewScopeControls.title = available ? designArea.reason || "Central design area heuristic." : "";
    }
    if (elements.reviewVisibleScreenButton) {
      elements.reviewVisibleScreenButton.setAttribute("aria-pressed", reviewScope === "visible-screen" ? "true" : "false");
    }
    if (elements.reviewDesignAreaButton) {
      elements.reviewDesignAreaButton.setAttribute("aria-pressed", reviewScope === "design-area" ? "true" : "false");
      elements.reviewDesignAreaButton.disabled = !available;
    }
  }

  function viewportForRawMetrics() {
    return rawReviewMetrics.viewport || {
      width: elements.screenshotImage?.naturalWidth || baseReviewSession?.media?.width || 0,
      height: elements.screenshotImage?.naturalHeight || baseReviewSession?.media?.height || 0
    };
  }

  function imageMetricsForSession() {
    return {
      width: elements.screenshotImage?.naturalWidth || baseReviewSession?.media?.width || 0,
      height: elements.screenshotImage?.naturalHeight || baseReviewSession?.media?.height || 0,
      sizeBytes: baseReviewSession?.media?.sizeBytes || 0,
      mimeType: baseReviewSession?.media?.mimeType || ""
    };
  }

  function metricsForCurrentScope(sourceType) {
    const metrics = {
      ...rawReviewMetrics,
      viewport: viewportForRawMetrics(),
      image: imageMetricsForSession(),
      imageMetrics: imageMetricsForSession()
    };
    if (reviewScope === "design-area" && designAreaScopeAvailable()) {
      return filterMetricsForDesignArea(metrics, designArea);
    }
    if (isDesignReviewSourceType(sourceType)) {
      return {
        ...metrics,
        designArea
      };
    }
    return metrics;
  }

  function buildEngineInput(sourceType) {
    const scopedMetrics = metricsForCurrentScope(sourceType);
    return {
      itemId: baseReviewSession.itemId,
      media: imageSource.media,
      screenshotRef: baseReviewSession.screenshotRef,
      sourceType,
      elements: scopedMetrics.elements || [],
      domMetrics: scopedMetrics,
      viewport: scopedMetrics.viewport,
      imageMetrics: imageMetricsForSession(),
      detectedDesignArea: designArea,
      reviewScope,
      visualAnalysis
    };
  }

  async function runDeterministicReviewForCurrentScope({ persist = true } = {}) {
    if (!baseReviewSession || !imageSource) return;
    const sourceType = designSource?.sourceType || (rawReviewMetrics.elements?.length ? "webpage-capture" : "static-design");
    const currentTarget = reviewScope === "design-area" && designAreaScopeAvailable() ? designArea : null;
    visualAnalysis = await runLocalVisualAnalysisFromImageElement(elements.screenshotImage, {
      sourceType,
      target: currentTarget,
      viewport: viewportForRawMetrics(),
      cropBounds: currentTarget?.bounds || null
    });
    const engineInput = buildEngineInput(sourceType);
    reviewContext = createReviewContext(engineInput);
    const engineResult = runReviewEngine(engineInput);
    const devFindings = filterValidReviewFindings(developmentSampleFindings(baseReviewSession), {
      warnInvalid: true,
      context: "Review Mode development findings"
    });
    deterministicFindings = [...engineResult.findings, ...devFindings];
    session = {
      ...baseReviewSession,
      findings: deterministicFindings,
      deterministicFindings,
      reviewSourceType: reviewContext.sourceType,
      reviewScope,
      detectedDesignArea: designArea,
      visualAnalysis,
      designReview: {
        sourceType: reviewContext.sourceType,
        isDesignScreen: Boolean(reviewContext.isDesignScreen || isDesignReviewSourceType(reviewContext.sourceType)),
        isImageOnly: Boolean(reviewContext.isImageOnly),
        platform: designSource?.platform || "",
        confidence: designSource?.confidence || 0,
        reason: designSource?.reason || "",
        reviewScope,
        detectedDesignArea: designArea,
        metadataAvailability: {
          hasDomMetrics: reviewContext.hasDomMetrics,
          hasComputedStyles: reviewContext.hasComputedStyles,
          hasTextMetrics: reviewContext.hasTextMetrics,
          hasInteractiveElements: reviewContext.hasInteractiveElements,
          hasDesignMetadata: reviewContext.hasDesignMetadata,
          isImageOnly: reviewContext.isImageOnly
        }
      },
      engineMetadata: {
        ...engineResult.metadata,
        reviewScope,
        detectedDesignArea: designArea,
        visualAnalysis
      },
      skippedRules: engineResult.skippedRules
    };
    store.set(session);
    if (persist) {
      await persistReviewWorkspaceMetadata();
    }

    const title = session.title || "Untitled screenshot";
    const dimensions =
      session.media.width && session.media.height ? `${session.media.width} x ${session.media.height}` : "dimensions unknown";
    const created = formatDate(session.media.createdAt);
    const size = formatBytes(session.media.sizeBytes);

    if (elements.title) elements.title.textContent = title;
    if (elements.meta) {
      const scopeLabel = reviewScope === "design-area" ? "Central design area" : "Visible screen";
      const reviewSummary = `Professional visual review: ${engineResult.metadata.findingCount} findings, ${engineResult.skippedRules.length} rules skipped where evidence was unavailable`;
      elements.meta.textContent = [reviewModeBadge(reviewContext.sourceType).label, scopeLabel, dimensions, size, created, reviewSummary]
        .filter(Boolean)
        .join(" | ");
    }

    updateSourceInformation();
    renderReviewScopeControls();
    render();
  }

  async function setReviewScope(nextScope) {
    if (!["visible-screen", "design-area"].includes(nextScope) || nextScope === reviewScope) return;
    if (nextScope === "design-area" && !designAreaScopeAvailable()) return;
    reviewScope = nextScope;
    selectedFindingId = "";
    showStatus(nextScope === "design-area" ? "Reviewing central design area only." : "Reviewing full visible screen.");
    await runDeterministicReviewForCurrentScope();
  }

  async function confirmScreenshotSharingIfNeeded(nextConfig) {
    const provider = getAiProviderOption(nextConfig.provider);
    const needsConsent =
      nextConfig.enabled &&
      (nextConfig.mode === AI_REVIEW_MODES.FULL_VISUAL || nextConfig.mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL) &&
      nextConfig.screenshotSharingEnabled &&
      provider.supportsVision &&
      !nextConfig.screenshotConsentAcknowledged;

    if (!needsConsent) return true;

    const accepted = window.confirm(
      "AI screenshot review may send this screenshot or design data to the selected provider. Continue?"
    );
    if (!accepted) return false;

    aiConfig = await saveAiReviewConfig({
      ...nextConfig,
      screenshotConsentAcknowledged: true
    });
    renderAiControls();
    return true;
  }

  function setAiRunning(running) {
    aiRunning = running;
    if (elements.cancelAiReviewButton) {
      elements.cancelAiReviewButton.hidden = !running;
    }
    renderAiControls();
  }

  function showStatus(message, isError = false) {
    if (!elements.liveStatus) return;
    elements.liveStatus.textContent = message;
    elements.liveStatus.style.borderColor = isError ? "rgba(154, 47, 47, 0.42)" : "rgba(31, 111, 104, 0.32)";
    elements.liveStatus.style.color = isError ? "var(--review-danger)" : "var(--review-accent-strong)";
    elements.liveStatus.classList.add("show");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      elements.liveStatus?.classList.remove("show");
    }, 2800);
  }

  function showCopyFallback(text) {
    if (!elements.copyFallbackDialog || !elements.copyFallbackText) {
      showStatus("Clipboard access was blocked.", true);
      return;
    }
    elements.copyFallbackText.value = text;
    elements.copyFallbackDialog.showModal();
    elements.copyFallbackText.focus();
    elements.copyFallbackText.select();
  }

  async function copyText(text, successMessage) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard write is unavailable.");
      }
      await navigator.clipboard.writeText(text);
      showStatus(successMessage);
    } catch (error) {
      console.warn("Clipboard copy failed.", error);
      showCopyFallback(text);
    }
  }

  function ensureSession() {
    if (!session) {
      showStatus("Review report is not ready yet.", true);
      return false;
    }
    return true;
  }

  async function persistReviewWorkspaceMetadata({ reportStatus, reportExportedAt } = {}) {
    if (!session?.itemId || !reviewContext) return;
    const existingMetadata = imageSource?.media?.metadata || session.media?.metadata || {};
    const nextReportStatus =
      reportStatus ?? existingMetadata.reviewReportStatus ?? (session.findings?.length ? "ready" : "not-exported");
    const nextReportExportedAt = reportExportedAt ?? existingMetadata.reviewReportExportedAt ?? "";
    const workspaceMetadata = buildReviewWorkspaceMetadata({
      findings: session.findings || [],
      reviewContext,
      engineMetadata: session.engineMetadata,
      aiReview: session.aiReview,
      reportStatus: nextReportStatus,
      reportExportedAt: nextReportExportedAt
    });

    try {
      const updated = await updateMediaMetadata(session.itemId, {
        metadata: workspaceMetadata
      });
      const nextMetadata = updated?.metadata || {
        ...existingMetadata,
        ...workspaceMetadata
      };
      session = {
        ...session,
        media: {
          ...session.media,
          metadata: nextMetadata
        }
      };
      if (imageSource?.media) {
        imageSource.media = {
          ...imageSource.media,
          metadata: nextMetadata
        };
      }
    } catch (error) {
      console.warn("Review workspace metadata update failed", error);
    }
  }

  async function markReportExported() {
    await persistReviewWorkspaceMetadata({
      reportStatus: "exported",
      reportExportedAt: new Date().toISOString()
    });
  }

  async function exportHtmlReport() {
    if (!ensureSession()) return;
    downloadTextReport({
      text: buildHtmlReviewReport(session),
      filename: reviewReportFilename(session, "html"),
      mimeType: "text/html;charset=utf-8"
    });
    await markReportExported();
    showStatus("HTML review report exported locally.");
  }

  async function exportMarkdownReport() {
    if (!ensureSession()) return;
    downloadTextReport({
      text: buildMarkdownReviewReport(session),
      filename: reviewReportFilename(session, "md"),
      mimeType: "text/markdown;charset=utf-8"
    });
    await markReportExported();
    showStatus("Markdown review report exported locally.");
  }

  async function exportJsonReport() {
    if (!ensureSession()) return;
    downloadTextReport({
      text: buildJsonReviewReport(session),
      filename: reviewReportFilename(session, "json"),
      mimeType: "application/json;charset=utf-8"
    });
    await markReportExported();
    showStatus("JSON review data exported locally.");
  }

  function copySummary() {
    if (!ensureSession()) return;
    copyText(buildReviewSummaryMarkdown(session), "Full review summary copied.");
  }

  function copyFindingTicket(finding) {
    copyText(buildTicketMarkdown(finding), "Finding ticket copied.");
  }

  async function testAiConnection() {
    const nextConfig = await persistAiConfigFromControls();
    if (!nextConfig.enabled) {
      showStatus("Enable AI review before testing a provider connection.", true);
      return;
    }
    const provider = getAiProviderOption(nextConfig.provider);
    setAiStatus({
      text: `Testing ${provider.label}. This only runs because you clicked Test connection.`,
      pill: "Testing",
      active: true
    });

    try {
      const result = await testAiReviewConnection({ config: nextConfig });
      setAiStatus({
        text: result.message || `${provider.label} connection succeeded.`,
        pill: "Ready",
        active: true
      });
      showStatus(`${provider.label} connection test succeeded.`);
    } catch (error) {
      const message = aiReviewErrorMessage(error);
      setAiStatus({
        text: message,
        pill: "Error",
        error: true
      });
      showStatus(message, true);
    }
  }

  async function clearAiSettings() {
    aiConfig = await clearAiReviewConfig();
    if (elements.aiPassList) elements.aiPassList.innerHTML = "";
    renderAiControls();
    showStatus("AI review settings cleared locally.");
  }

  async function runAiReviewFromControls() {
    if (!session) {
      showStatus("Review session is not ready yet.", true);
      return;
    }

    let nextConfig = await persistAiConfigFromControls();
    if (!nextConfig.enabled) {
      showStatus("Enable AI review before running it.", true);
      return;
    }

    const consented = await confirmScreenshotSharingIfNeeded(nextConfig);
    if (!consented) {
      if (elements.aiScreenshotSharingToggle) elements.aiScreenshotSharingToggle.checked = false;
      aiConfig = await saveAiReviewConfig({
        ...nextConfig,
        screenshotSharingEnabled: false
      });
      renderAiControls();
      showStatus("AI screenshot review was not started.", true);
      return;
    }

    nextConfig = aiConfig;
    const providerOption = getAiProviderOption(nextConfig.provider);
    const willShareScreenshot =
      (nextConfig.mode === AI_REVIEW_MODES.FULL_VISUAL || nextConfig.mode === AI_REVIEW_MODES.STATIC_DESIGN_VISUAL) &&
      nextConfig.screenshotSharingEnabled &&
      providerOption.supportsVision;
    if (reviewContext?.isDesignScreen && deterministicFindings.length === 0 && !willShareScreenshot) {
      const message = "AI visual review requires screenshot sharing for image-only designs.";
      setAiStatus({
        text: message,
        pill: "Needs screenshot",
        error: true
      });
      showStatus(message, true);
      return;
    }
    const provider = getAiProviderOption(nextConfig.provider);
    aiAbortController = new AbortController();
    if (elements.aiPassList) elements.aiPassList.innerHTML = "";
    setAiRunning(true);
    setAiStatus({
      text: `Running optional AI review with ${provider.label}.`,
      pill: "Running",
      active: true
    });

    try {
      const result = await runAiReview({
        config: nextConfig,
        session,
        reviewContext,
        deterministicFindings,
        imageElement: elements.screenshotImage,
        signal: aiAbortController.signal,
        onProgress(update) {
          if (update.message) {
            setAiStatus({
              text: update.message,
              pill: update.status === "failed" ? "Error" : update.status === "complete" ? "Ready" : "Running",
              active: update.status !== "failed",
              error: update.status === "failed"
            });
            renderAiPass(update);
          }
        }
      });

      const previousSelected = selectedFindingId;
      session = {
        ...session,
        findings: result.findings,
        aiReview: result.metadata
      };
      store.set(session);
      await persistReviewWorkspaceMetadata({
        reportStatus: "ready",
        reportExportedAt: ""
      });
      if (!session.findings.some((finding) => finding.id === previousSelected)) {
        selectedFindingId = "";
      }

      setAiStatus({
        text: `AI review complete. ${result.acceptedAiFindings.length} AI finding${
          result.acceptedAiFindings.length === 1 ? "" : "s"
        } accepted; deterministic findings preserved.`,
        pill: "Ready",
        active: true
      });
      showStatus("AI review completed.");
      render();
    } catch (error) {
      const message = aiReviewErrorMessage(error);
      setAiStatus({
        text: `${message} Local deterministic findings were preserved.`,
        pill: "Error",
        error: true
      });
      showStatus(message, true);
    } finally {
      aiAbortController = null;
      setAiRunning(false);
    }
  }

  function cancelAiReview() {
    aiAbortController?.abort();
    setAiStatus({
      text: "Cancelling AI review. Local deterministic findings remain available.",
      pill: "Cancelling",
      active: true
    });
  }

  async function waitForScreenshotDecode() {
    if (!elements.screenshotImage) return;
    if (typeof elements.screenshotImage.decode === "function") {
      await elements.screenshotImage.decode();
      return;
    }
    if (elements.screenshotImage.complete) return;
    await new Promise((resolve, reject) => {
      elements.screenshotImage.addEventListener("load", resolve, { once: true });
      elements.screenshotImage.addEventListener("error", () => reject(new Error("Screenshot image failed to load.")), {
        once: true
      });
    });
  }

  function showFatalError(error) {
    const message = error?.message || "Review Mode could not load this item.";
    if (elements.loadingState) elements.loadingState.hidden = true;
    if (elements.screenshotFrame) elements.screenshotFrame.hidden = true;
    if (elements.errorState) {
      elements.errorState.hidden = false;
      elements.errorState.textContent = message;
    }
    if (elements.title) elements.title.textContent = "Review Mode unavailable";
    if (elements.meta) elements.meta.textContent = "No review data was saved or changed.";
  }

  function focusOverlayMarker(findingId) {
    if (!findingId || !elements.overlayLayer) return;
    requestAnimationFrame(() => {
      const marker = Array.from(elements.overlayLayer.querySelectorAll("[data-overlay-marker-id]")).find(
        (entry) => entry.dataset.overlayMarkerId === findingId
      );
      if (marker instanceof HTMLElement) {
        marker.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        const popover = elements.overlayLayer.querySelector(".overlay-popover");
        if (popover instanceof HTMLElement) {
          popover.focus({ preventScroll: true });
        } else {
          marker.focus({ preventScroll: true });
        }
      }
    });
  }

  function focusInspectorPanel() {
    requestAnimationFrame(() => {
      const target = elements.inspectorPanel?.querySelector("button, h3");
      if (target instanceof HTMLElement) target.focus?.();
    });
  }

  function selectFinding(nextId, { focusMarker = false, focusInspector = false } = {}) {
    selectedFindingId = nextId || "";
    render();
    if (focusMarker) focusOverlayMarker(selectedFindingId);
    if (focusInspector) focusInspectorPanel();
  }

  function render() {
    const findings = session?.findings || [];
    const scopedFindings =
      reviewScope === "design-area" && designArea?.bounds
        ? findings.filter((finding) => findingWithinDesignArea(finding, designArea))
        : findings;
    const visibleFindings = visibleFindingsForFilters(scopedFindings, findingFilters);
    if (selectedFindingId && !visibleFindings.some((finding) => finding.id === selectedFindingId)) {
      selectedFindingId = "";
    }
    const hasSelectedFinding = Boolean(selectedFindingId && visibleFindings.some((finding) => finding.id === selectedFindingId));
    if (elements.layout) elements.layout.classList.toggle("inspector-open", hasSelectedFinding);
    if (elements.inspectorPanel) elements.inspectorPanel.hidden = !hasSelectedFinding;
    if (elements.findingsCount) {
      elements.findingsCount.textContent =
        visibleFindings.length === scopedFindings.length
          ? String(scopedFindings.length)
          : `${visibleFindings.length}/${scopedFindings.length}`;
    }

    renderFindingList({
      container: elements.findingsList,
      findings: scopedFindings,
      selectedFindingId,
      filters: findingFilters,
      onFilterChange(nextFilters) {
        findingFilters = {
          ...findingFilters,
          ...nextFilters
        };
        render();
      },
      onSelect(nextId) {
        selectFinding(nextId, { focusMarker: true });
      }
    });

    renderFindingInspector({
      container: elements.inspector,
      findings: visibleFindings,
      selectedFindingId,
      onCopyTicket: copyFindingTicket
    });

    renderOverlayMarkers({
      container: elements.overlayLayer,
      findings: visibleFindings,
      selectedFindingId,
      designArea: reviewScope === "design-area" ? designArea : null,
      onSelect(nextId) {
        selectFinding(nextId, { focusMarker: Boolean(nextId) });
      },
      onOpenInspector(nextId) {
        selectFinding(nextId, { focusInspector: true });
      }
    });
  }

  async function init() {
    elements.backButton?.addEventListener("click", backToMemory);
    elements.aiSettingsButton?.addEventListener("click", () => {
      if (elements.aiSettingsDialog instanceof HTMLDialogElement) {
        elements.aiSettingsDialog.showModal();
        elements.aiEnabledToggle?.focus();
      }
    });
    elements.aiSettingsCloseButton?.addEventListener("click", () => {
      elements.aiSettingsDialog?.close();
      elements.aiSettingsButton?.focus();
    });
    elements.aiSettingsDialog?.addEventListener("cancel", () => {
      elements.aiSettingsButton?.focus();
    });
    elements.copySummaryButton?.addEventListener("click", copySummary);
    elements.exportHtmlButton?.addEventListener("click", exportHtmlReport);
    elements.exportMarkdownButton?.addEventListener("click", exportMarkdownReport);
    elements.exportJsonButton?.addEventListener("click", exportJsonReport);
    elements.aiEnabledToggle?.addEventListener("change", persistAiConfigFromControls);
    elements.aiProviderSelect?.addEventListener("change", async () => {
      aiConfig = await saveAiReviewConfig({
        ...aiConfig,
        provider: elements.aiProviderSelect.value
      });
      renderAiControls();
    });
    elements.aiReviewModeSelect?.addEventListener("change", persistAiConfigFromControls);
    elements.aiModelInput?.addEventListener("change", persistAiConfigFromControls);
    elements.aiEndpointInput?.addEventListener("change", persistAiConfigFromControls);
    elements.aiApiKeyInput?.addEventListener("change", persistAiConfigFromControls);
    elements.aiScreenshotSharingToggle?.addEventListener("change", persistAiConfigFromControls);
    elements.runAiReviewButton?.addEventListener("click", runAiReviewFromControls);
    elements.cancelAiReviewButton?.addEventListener("click", cancelAiReview);
    elements.reviewVisibleScreenButton?.addEventListener("click", () => {
      setReviewScope("visible-screen").catch((error) => {
        console.error(error);
        showStatus("Review scope update failed.", true);
      });
    });
    elements.reviewDesignAreaButton?.addEventListener("click", () => {
      setReviewScope("design-area").catch((error) => {
        console.error(error);
        showStatus("Review scope update failed.", true);
      });
    });
    elements.testAiConnectionButton?.addEventListener("click", testAiConnection);
    elements.clearAiSettingsButton?.addEventListener("click", clearAiSettings);
    elements.copyFallbackCloseButton?.addEventListener("click", () => {
      elements.copyFallbackDialog?.close();
    });
    window.addEventListener("beforeunload", () => {
      aiAbortController?.abort();
      imageSource?.revoke();
      store.clear();
      clearTimeout(statusTimer);
    });

    aiConfig = await loadAiReviewConfig();
    renderAiControls();
    setReportActionsEnabled(false);
    setLoading(true);
    setProgress("Loading saved screenshot.");
    const itemId = itemIdFromUrl();
    if (!itemId) {
      throw new Error("Review Mode requires a saved Memory image item.");
    }

    imageSource = await loadReviewImageSource(itemId);
    if (elements.screenshotImage) {
      elements.screenshotImage.src = imageSource.objectUrl;
      elements.screenshotImage.alt = `${imageSource.media.metadata?.title || "Untitled screenshot"} screenshot under review`;
    }
    setProgress("Decoding screenshot locally.");
    await waitForScreenshotDecode();

    baseReviewSession = createReviewSession({
      itemId,
      media: imageSource.media,
      imageUrl: imageSource.objectUrl
    });

    setProgress("Running deterministic visual review rules.");
    rawReviewMetrics = imageSource.media.metadata?.reviewMetrics || imageSource.media.metadata?.domMetrics || {};
    const hasRichElements = Array.isArray(rawReviewMetrics.elements) && rawReviewMetrics.elements.length > 0;
    designSource = detectDesignSource({
      media: imageSource.media,
      hasDomMetrics: hasRichElements
    });
    const sourceType = designSource.sourceType || (hasRichElements ? "webpage-capture" : "static-design");
    const viewport = rawReviewMetrics.viewport || {
      width: elements.screenshotImage?.naturalWidth || baseReviewSession.media.width,
      height: elements.screenshotImage?.naturalHeight || baseReviewSession.media.height
    };
    designArea = detectCentralDesignArea({
      sourceType,
      elements: rawReviewMetrics.elements || [],
      viewport,
      image: imageMetricsForSession()
    });
    reviewScope = ["figma-capture", "zeplin-capture"].includes(sourceType) ? "design-area" : "visible-screen";
    await runDeterministicReviewForCurrentScope();

    setLoading(false);
    setReportActionsEnabled(true);
    renderAiControls();
    updateSourceInformation();
    render();
  }

  return {
    init,
    showFatalError
  };
}
