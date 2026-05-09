import { createReviewContext } from "../engine/review-context.js";
import { runReviewEngine } from "../engine/review-engine.js";
import {
  getAiProviderSettings,
  loadAiReviewConfig,
  saveAiReviewConfig,
  updateAiProviderSettings
} from "../ai/ai-review-config.js";
import { detectAiReviewCapabilities, runAiReview, testAiReviewConnection } from "../ai/ai-review-engine.js";
import { aiReviewErrorMessage } from "../ai/ai-review-errors.js";
import { buildOverlayMarkers } from "../capture/review-screenshot-coordinates.js";
import { captureVisibleViewForReview, collectFullPageReviewMetrics } from "../capture/visible-view-review-capture.js";
import { buildReviewSummaryMarkdown } from "../reports/review-report-builder.js";
import { buildHtmlReviewReport } from "../reports/review-html-report.js";
import { buildJsonReviewReport } from "../reports/review-json-report.js";
import { buildMarkdownReviewReport } from "../reports/review-markdown-report.js";
import { downloadTextReport, reviewReportFilename } from "../reports/report-download.js";
import { createLiveReviewSession } from "../session/live-review-session.js";
import { LIVE_REVIEW_MESSAGES } from "../session/live-review-messages.js";
import { createLiveReviewStore } from "../session/live-review-store.js";
import { detectReviewTarget } from "../targeting/review-target-detector.js";
import { filterElementsForTarget } from "../targeting/target-region-model.js";
import { runLocalVisualAnalysisFromBlob } from "../visual-analysis/visual-analysis-pipeline.js";
import { updateMediaMetadata } from "../../storage/storage.js";
import { MESSAGE_TYPES } from "../../../extension/models.js";
import {
  clearLiveOverlay,
  getActiveReviewTab,
  injectLiveOverlay,
  openFallbackReviewTab,
  sendOverlayMessage
} from "./sidepanel-actions.js";
import {
  renderCategoryFilters,
  renderFindingSummary,
  renderSidepanelFindings
} from "./sidepanel-findings.js";
import { renderSidepanelInspector } from "./sidepanel-inspector.js";
import { setStatus, setTargetSummary } from "./sidepanel-status.js";
import { setExportAvailable, setToolbarBusy } from "./sidepanel-toolbar.js";
import {
  imageElementFromDataUrl,
  populateOllamaModeSelect,
  readOllamaConfigFromControls,
  renderOllamaControls,
  renderOllamaPass,
  setOllamaStatus
} from "./sidepanel-ai.js";

function normalizeLaunchAction(value) {
  const action = String(value || "").trim();
  if (action === "review-current-design") return "design-area-only";
  if (action === "review-full-page") return "visible-view";
  if (action === "review-current-screen" || action === "review-visible-view") return "visible-view";
  return "";
}

function extensionStorageSession() {
  return chrome.storage?.session || null;
}

async function readQueuedLaunchAction() {
  const storage = extensionStorageSession();
  if (!storage?.get) return "";
  const data = await storage.get("olhoSidepanelLaunch").catch(() => ({}));
  await storage.remove?.("olhoSidepanelLaunch").catch(() => null);
  const launch = data?.olhoSidepanelLaunch || {};
  if (Date.now() - Number(launch.ts || 0) > 15_000) return "";
  return normalizeLaunchAction(launch.action);
}

async function copyText(text, onError) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    onError?.(error);
    return false;
  }
}

export function createSidepanelController({ document, window }) {
  const store = createLiveReviewStore();
  const elements = {
    reviewTypeBadge: document.getElementById("reviewTypeBadge"),
    targetLabel: document.getElementById("targetLabel"),
    targetMeta: document.getElementById("targetMeta"),
    statusText: document.getElementById("statusText"),
    progress: document.getElementById("reviewProgress"),
    reviewVisibleButton: document.getElementById("reviewVisibleViewBtn"),
    reviewDesignButton: document.getElementById("reviewDesignAreaBtn"),
    reviewFullButton: document.getElementById("reviewFullVisibleBtn"),
    reviewDepthSelect: document.getElementById("reviewDepthSelect"),
    selectAreaButton: document.getElementById("selectReviewAreaBtn"),
    clearMarkersButton: document.getElementById("clearMarkersBtn"),
    copySummaryButton: document.getElementById("copySummaryBtn"),
    exportHtmlButton: document.getElementById("exportHtmlBtn"),
    exportMarkdownButton: document.getElementById("exportMarkdownBtn"),
    exportJsonButton: document.getElementById("exportJsonBtn"),
    fallbackButton: document.getElementById("openFallbackReviewBtn"),
    summary: document.getElementById("findingSummary"),
    filters: document.getElementById("categoryFilters"),
    findings: document.getElementById("findingsList"),
    inspector: document.getElementById("findingInspector"),
    limitation: document.getElementById("targetLimitation"),
    localStatus: document.getElementById("localStatus"),
    aiStatus: document.getElementById("aiStatus"),
    ollamaSummary: document.getElementById("ollamaSummary"),
    ollamaCapability: document.getElementById("ollamaCapability"),
    ollamaEnabledToggle: document.getElementById("ollamaEnabledToggle"),
    ollamaModeSelect: document.getElementById("ollamaModeSelect"),
    ollamaModelInput: document.getElementById("ollamaModelInput"),
    ollamaEndpointInput: document.getElementById("ollamaEndpointInput"),
    ollamaScreenshotToggle: document.getElementById("ollamaScreenshotToggle"),
    saveOllamaButton: document.getElementById("saveOllamaSettingsBtn"),
    testOllamaButton: document.getElementById("testOllamaConnectionBtn"),
    runOllamaButton: document.getElementById("runOllamaReviewBtn"),
    cancelOllamaButton: document.getElementById("cancelOllamaReviewBtn"),
    ollamaStatusText: document.getElementById("ollamaStatusText"),
    ollamaUnderstanding: document.getElementById("ollamaUnderstanding"),
    ollamaSynthesis: document.getElementById("ollamaSynthesis"),
    ollamaDetails: document.getElementById("ollamaDetails"),
    ollamaPassList: document.getElementById("ollamaPassList")
  };

  let activeCategory = "all";
  let currentTab = null;
  let currentCapture = null;
  let currentReviewContext = null;
  let deterministicFindings = [];
  let aiConfig = null;
  let aiCapability = null;
  let aiRunning = false;
  let aiAbortController = null;

  function selectedFinding() {
    const state = store.getState();
    return state.findings.find((finding) => finding.id === state.selectedFindingId) || null;
  }

  function render() {
    const state = store.getState();
    renderFindingSummary(elements.summary, state.findings);
    renderCategoryFilters(elements.filters, {
      activeCategory,
      findings: state.findings,
      onChange(category) {
        activeCategory = category;
        render();
      }
    });
    renderSidepanelFindings({
      container: elements.findings,
      findings: state.findings,
      selectedFindingId: state.selectedFindingId,
      activeCategory,
      onSelect: selectFinding
    });
    renderSidepanelInspector({
      container: elements.inspector,
      finding: selectedFinding(),
      onCopyTicket: async (markdown) => {
        const copied = await copyText(markdown, () => {
          setStatus(elements, { message: "Clipboard access was blocked.", tone: "error" });
        });
        if (copied) setStatus(elements, { message: "Ticket-ready finding copied.", tone: "success" });
      }
    });
    setTargetSummary(elements, {
      tab: state.activeTab,
      target: state.target,
      source: state.session?.designReview
    });
    if (elements.limitation) {
      const limitations = state.target?.limitations || [];
      elements.limitation.hidden = !limitations.length;
      elements.limitation.textContent = limitations.join(" ");
    }
    setExportAvailable(elements, Boolean(state.session));
    renderOllamaControls(elements, aiConfig, {
      session: state.session,
      running: aiRunning,
      capability: aiCapability
    });
  }

  async function selectFinding(findingId) {
    store.setState({ selectedFindingId: findingId || "" });
    render();
    const state = store.getState();
    if (state.activeTab?.id && findingId) {
      await sendOverlayMessage(state.activeTab.id, LIVE_REVIEW_MESSAGES.SELECT_MARKER, { findingId }).catch(() => null);
    }
  }

  function scopedMetricsForTarget(metrics = {}, target = null) {
    const elements = filterElementsForTarget(metrics.elements || [], target);
    return {
      ...metrics,
      elements,
      target
    };
  }

  function buildEngineInput({ tab, capture, source, target, visualAnalysis = null }) {
    const scopedMetrics = scopedMetricsForTarget(capture.metrics || {}, target);
    return {
      itemId: `live:${tab.id}`,
      screenshotRef: `live-visible-view:${tab.id}:${Date.now()}`,
      sourceType: source.sourceType || "webpage-capture",
      media: {
        type: "image",
        metadata: {
          reviewSourceType: source.sourceType || "webpage-capture",
          sourceUrl: tab.url || "",
          sourcePageTitle: tab.title || ""
        }
      },
      elements: scopedMetrics.elements || [],
      domMetrics: scopedMetrics,
      viewport: capture.viewport,
      imageMetrics: capture.metrics?.imageMetrics || capture.image,
      reviewDepth: elements.reviewDepthSelect?.value || "standard",
      reviewFocus: activeCategory || "all",
      reviewScope: target?.type || "full-visible-page",
      reviewTarget: target,
      visualAnalysis
    };
  }

  async function runReview(mode = "visible-view") {
    setToolbarBusy(elements, true);
    setStatus(elements, { message: "Preparing live page overlay.", tone: "active" });
    try {
      currentTab = await getActiveReviewTab();
      store.setState({ activeTab: currentTab, status: "running", error: "", selectedFindingId: "" });
      await injectLiveOverlay(currentTab.id);
      setStatus(elements, { message: "Capturing visible view locally.", tone: "active" });
      currentCapture = await captureVisibleViewForReview(currentTab);

      const detection = detectReviewTarget({
        tab: currentTab,
        metrics: currentCapture.metrics,
        mode
      });
      const { source, target } = detection;
      setStatus(elements, { message: "Measuring local visual evidence from screenshot pixels.", tone: "active" });
      const visualAnalysis = await runLocalVisualAnalysisFromBlob(currentCapture.blob, {
        sourceType: source.sourceType || "webpage-capture",
        target,
        viewport: currentCapture.viewport,
        cropBounds: target?.excludesPageChrome ? target.bounds : null
      });
      const engineInput = buildEngineInput({
        tab: currentTab,
        capture: currentCapture,
        source,
        target,
        visualAnalysis
      });

      setStatus(elements, { message: "Running deterministic visual review.", tone: "active" });
      const reviewContext = createReviewContext(engineInput);
      const engineResult = runReviewEngine(engineInput);
      const findings = engineResult.findings;
      currentReviewContext = reviewContext;
      deterministicFindings = findings;
      const session = createLiveReviewSession({
        tab: currentTab,
        capture: currentCapture,
        target,
        reviewContext,
        engineResult,
        findings,
        visualAnalysis
      });
      const markers = buildOverlayMarkers(findings, currentCapture.viewport, {
        elements: engineInput.elements,
        target
      });

      await sendOverlayMessage(currentTab.id, LIVE_REVIEW_MESSAGES.RENDER_MARKERS, {
        markers,
        target,
        findingCount: findings.length
      });
      store.setState({
        status: "ready",
        target,
        session,
        findings,
        selectedFindingId: "",
        lastRunAt: new Date().toISOString()
      });
      const markerNote = markers.length === findings.length ? "" : ` ${findings.length - markers.length} finding(s) have no reliable marker.`;
      setStatus(elements, {
        message: findings.length
          ? `${engineResult.metadata.reviewDepthLabel} complete. ${findings.length} reviewer finding(s) generated.${markerNote}`
          : "Review complete. No deterministic findings crossed the evidence threshold.",
        tone: findings.length ? "success" : "neutral"
      });
      render();
    } catch (error) {
      const message = String(error?.message || error || "Live review failed.");
      store.setState({ status: "error", error: message });
      setStatus(elements, {
        message: `${message} Use screenshot fallback if this page blocks injection.`,
        tone: "error"
      });
      render();
    } finally {
      setToolbarBusy(elements, false);
      setExportAvailable(elements, Boolean(store.getState().session));
    }
  }

  async function persistOllamaConfig() {
    aiConfig = await saveAiReviewConfig(readOllamaConfigFromControls(elements, aiConfig));
    render();
    return aiConfig;
  }

  function selectedOllamaModel(config) {
    return String(getAiProviderSettings(config, "ollama").model || "").trim();
  }

  async function ensureInstalledOllamaModel(config, connectionResult = null) {
    const settings = getAiProviderSettings(config, "ollama");
    const initialResult = connectionResult || await testAiReviewConnection({ config });
    const models = Array.isArray(initialResult.models) ? initialResult.models.filter(Boolean) : [];
    let capability = initialResult.capabilities || null;
    const needsInstalledModel = !selectedOllamaModel(config) || capability?.modelInstalled === false;

    if (needsInstalledModel && models.length) {
      const nextModel = models[0];
      const nextConfig = updateAiProviderSettings(config, "ollama", { model: nextModel });
      aiConfig = await saveAiReviewConfig(nextConfig);
      if (elements.ollamaModelInput) elements.ollamaModelInput.value = nextModel;
      const detected = await detectAiReviewCapabilities({ config: aiConfig }).catch(() => null);
      capability = detected?.capabilities || {
        ...capability,
        model: nextModel,
        modelInstalled: true,
        responseQuality: "auto-selected-installed-model"
      };
      return {
        config: aiConfig,
        capability,
        autoSelectedModel: nextModel
      };
    }

    return {
      config,
      capability,
      autoSelectedModel: ""
    };
  }

  function setAiRunning(running) {
    aiRunning = Boolean(running);
    if (elements.aiStatus) elements.aiStatus.textContent = aiRunning ? "Ollama running" : aiConfig?.enabled ? "Ollama ready" : "AI off";
    renderOllamaControls(elements, aiConfig, {
      session: store.getState().session,
      running: aiRunning,
      capability: aiCapability
    });
  }

  async function testOllamaConnection() {
    let config = await persistOllamaConfig();
    if (!config.enabled) {
      setOllamaStatus(elements, { message: "Enable Ollama before testing the local connection.", tone: "error" });
      return;
    }

    setOllamaStatus(elements, { message: "Testing local Ollama connection.", tone: "active" });
    try {
      const result = await testAiReviewConnection({ config });
      const prepared = await ensureInstalledOllamaModel(config, result);
      aiConfig = prepared.config;
      aiCapability = prepared.capability || result.capabilities || null;
      render();
      setOllamaStatus(elements, {
        message: prepared.autoSelectedModel
          ? `Ollama responded locally. Selected installed model ${prepared.autoSelectedModel}.`
          : aiCapability?.limitation || result.message || "Ollama responded locally.",
        tone: aiCapability?.supportsVision ? "success" : "active"
      });
    } catch (error) {
      setOllamaStatus(elements, { message: aiReviewErrorMessage(error), tone: "error" });
    }
  }

  async function runOllamaReview() {
    const state = store.getState();
    if (!state.session) {
      setOllamaStatus(elements, { message: "Run local review before running Ollama.", tone: "error" });
      return;
    }

    let config = await persistOllamaConfig();
    if (!config.enabled) {
      setOllamaStatus(elements, { message: "Enable Ollama before running local AI review.", tone: "error" });
      return;
    }

    let prepared;
    try {
      prepared = await ensureInstalledOllamaModel(config);
    } catch (error) {
      setOllamaStatus(elements, {
        message: `Could not detect installed Ollama models: ${aiReviewErrorMessage(error)} Local deterministic findings were preserved.`,
        tone: "error"
      });
      return;
    }
    config = prepared.config;
    aiCapability = prepared.capability || aiCapability;
    if (!selectedOllamaModel(config)) {
      render();
      setOllamaStatus(elements, {
        message:
          "Select an installed Ollama model before running review. Click Test Local Connection to auto-detect local models.",
        tone: "error"
      });
      return;
    }
    aiAbortController = new AbortController();
    if (elements.ollamaPassList) elements.ollamaPassList.innerHTML = "";
    setAiRunning(true);
    setOllamaStatus(elements, {
      message: prepared.autoSelectedModel
        ? `Selected installed model ${prepared.autoSelectedModel}. Running structured local Ollama review.`
        : "Running structured local Ollama review.",
      tone: "active"
    });

    try {
      const imageElement = config.screenshotSharingEnabled && currentCapture?.dataUrl
        ? await imageElementFromDataUrl(currentCapture.dataUrl)
        : null;
      const result = await runAiReview({
        config,
        session: state.session,
        reviewContext: currentReviewContext || {},
        deterministicFindings,
        imageElement,
        signal: aiAbortController.signal,
        onProgress(update) {
          if (update.message) {
            setOllamaStatus(elements, {
              message: update.message,
              tone: update.status === "failed" ? "error" : update.status === "complete" ? "success" : "active"
            });
            renderOllamaPass(elements, update);
          }
        }
      });
      const nextSession = {
        ...state.session,
        findings: result.findings,
        aiReview: result.metadata
      };
      const selectedId = result.findings.some((finding) => finding.id === state.selectedFindingId)
        ? state.selectedFindingId
        : "";
      const markers = buildOverlayMarkers(result.findings, currentCapture?.viewport || {}, {
        elements: currentReviewContext?.elements || [],
        target: state.target
      });
      if (state.activeTab?.id) {
        await sendOverlayMessage(state.activeTab.id, LIVE_REVIEW_MESSAGES.RENDER_MARKERS, {
          markers,
          target: state.target,
          findingCount: result.findings.length
        }).catch(() => null);
      }
      store.setState({
        session: nextSession,
        findings: result.findings,
        selectedFindingId: selectedId
      });
      setOllamaStatus(elements, {
        message: `Ollama review complete. ${result.acceptedAiFindings.length} local AI finding(s) accepted.`,
        tone: "success"
      });
      render();
      if (selectedId) await selectFinding(selectedId);
    } catch (error) {
      setOllamaStatus(elements, {
        message: `${aiReviewErrorMessage(error)} Local deterministic findings were preserved.`,
        tone: "error"
      });
    } finally {
      aiAbortController = null;
      setAiRunning(false);
    }
  }

  function cancelOllamaReview() {
    aiAbortController?.abort();
    setOllamaStatus(elements, { message: "Cancelling Ollama review. Local findings remain available.", tone: "active" });
  }

  async function clearMarkers() {
    const state = store.getState();
    await clearLiveOverlay(state.activeTab?.id || currentTab?.id).catch(() => null);
    store.setState({ findings: [], selectedFindingId: "", session: null, target: null });
    setStatus(elements, { message: "Live review markers cleared.", tone: "neutral" });
    render();
  }

  function currentSessionOrWarn() {
    const session = store.getState().session;
    if (!session) {
      setStatus(elements, { message: "Run a review before exporting a report.", tone: "error" });
      return null;
    }
    return session;
  }

  function exportReport(format = "html") {
    const session = currentSessionOrWarn();
    if (!session) return;
    const exporters = {
      html: {
        text: buildHtmlReviewReport(session),
        extension: "html",
        mimeType: "text/html;charset=utf-8",
        label: "HTML"
      },
      markdown: {
        text: buildMarkdownReviewReport(session),
        extension: "md",
        mimeType: "text/markdown;charset=utf-8",
        label: "Markdown"
      },
      json: {
        text: buildJsonReviewReport(session),
        extension: "json",
        mimeType: "application/json;charset=utf-8",
        label: "JSON"
      }
    };
    const report = exporters[format] || exporters.html;
    downloadTextReport({
      text: report.text,
      filename: reviewReportFilename(session, report.extension),
      mimeType: report.mimeType
    });
    setStatus(elements, { message: `${report.label} review report exported locally.`, tone: "success" });
  }

  async function copySummary() {
    const session = currentSessionOrWarn();
    if (!session) return;
    const copied = await copyText(buildReviewSummaryMarkdown(session), () => {
      setStatus(elements, { message: "Clipboard access was blocked.", tone: "error" });
    });
    if (copied) {
      setStatus(elements, { message: "Full review summary copied as Markdown.", tone: "success" });
    }
  }

  async function openFallback(captureType = MESSAGE_TYPES.CAPTURE_VISIBLE) {
    setToolbarBusy(elements, true);
    try {
      const tab = currentTab || (await getActiveReviewTab());
      let fullPageMetrics = null;
      if (captureType === MESSAGE_TYPES.CAPTURE_FULL_PAGE) {
        setStatus(elements, { message: "Collecting full-page review metadata before capture.", tone: "active" });
        fullPageMetrics = await collectFullPageReviewMetrics(tab.id).catch((error) => {
          console.warn("[Olho Review] Full-page DOM metrics unavailable.", error);
          return null;
        });
      }
      const fallbackOptions =
        captureType === MESSAGE_TYPES.CAPTURE_FULL_PAGE
          ? {
              async beforeOpen(itemId) {
                await updateMediaMetadata(itemId, {
                  metadata: {
                    reviewEntryPoint: "side-panel-full-page-review",
                    reviewSourceType: "webpage-capture",
                    reviewCaptureMode: "full-page",
                    ...(fullPageMetrics
                      ? {
                          reviewMetrics: fullPageMetrics,
                          hasReviewMetrics: true
                        }
                      : {
                          hasReviewMetrics: false,
                          reviewLimitations: [
                            "Full-page deterministic review could not collect DOM/style metadata for this page. The fallback report is screenshot-only and may not identify below-fold issues."
                          ]
                        }),
                    fullPageReviewMetadata: {
                      supported: Boolean(fullPageMetrics),
                      source: fullPageMetrics?.source || "",
                      elementCount: Array.isArray(fullPageMetrics?.elements) ? fullPageMetrics.elements.length : 0,
                      capturedAt: fullPageMetrics?.capturedAt || new Date().toISOString()
                    }
                  }
                }).catch((error) => {
                  console.warn("[Olho Review] Could not attach full-page review metadata.", error);
                });
              }
            }
          : {};
      await openFallbackReviewTab(tab, captureType, fallbackOptions);
      setStatus(elements, {
        message:
          captureType === MESSAGE_TYPES.CAPTURE_FULL_PAGE
            ? "Opened full-page Review Mode with collected page metadata where available."
            : "Opened screenshot fallback Review Mode.",
        tone: "success"
      });
    } catch (error) {
      setStatus(elements, { message: String(error?.message || error), tone: "error" });
    } finally {
      setToolbarBusy(elements, false);
      setExportAvailable(elements, Boolean(store.getState().session));
    }
  }

  function bindEvents() {
    elements.reviewVisibleButton?.addEventListener("click", () => runReview("visible-view"));
    elements.reviewDesignButton?.addEventListener("click", () => runReview("design-area-only"));
    elements.reviewFullButton?.addEventListener("click", () => openFallback(MESSAGE_TYPES.CAPTURE_FULL_PAGE));
    elements.clearMarkersButton?.addEventListener("click", clearMarkers);
    elements.copySummaryButton?.addEventListener("click", copySummary);
    elements.exportHtmlButton?.addEventListener("click", () => exportReport("html"));
    elements.exportMarkdownButton?.addEventListener("click", () => exportReport("markdown"));
    elements.exportJsonButton?.addEventListener("click", () => exportReport("json"));
    elements.fallbackButton?.addEventListener("click", () => openFallback(MESSAGE_TYPES.CAPTURE_VISIBLE));
    elements.saveOllamaButton?.addEventListener("click", async () => {
      await persistOllamaConfig();
      setOllamaStatus(elements, { message: "Ollama settings saved locally.", tone: "success" });
    });
    elements.testOllamaButton?.addEventListener("click", testOllamaConnection);
    elements.runOllamaButton?.addEventListener("click", runOllamaReview);
    elements.cancelOllamaButton?.addEventListener("click", cancelOllamaReview);
    [
      elements.ollamaEnabledToggle,
      elements.ollamaModeSelect,
      elements.ollamaModelInput,
      elements.ollamaEndpointInput,
      elements.ollamaScreenshotToggle
    ].forEach((control) => {
      control?.addEventListener("change", persistOllamaConfig);
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== LIVE_REVIEW_MESSAGES.MARKER_SELECTED) return;
      selectFinding(message.payload?.findingId).catch(() => null);
    });
    window.addEventListener("beforeunload", () => {
      const state = store.getState();
      clearLiveOverlay(state.activeTab?.id).catch(() => null);
    });
  }

  async function init() {
    populateOllamaModeSelect(elements.ollamaModeSelect);
    bindEvents();
    aiConfig = await loadAiReviewConfig();
    setStatus(elements, {
      message: "Local deterministic review is ready. AI is off by default.",
      tone: "neutral"
    });
    if (elements.localStatus) elements.localStatus.textContent = "Local review active";
    if (elements.aiStatus) elements.aiStatus.textContent = aiConfig.enabled ? "Ollama ready" : "AI off";
    renderOllamaControls(elements, aiConfig, {
      session: null,
      running: false,
      capability: aiCapability
    });
    setExportAvailable(elements, false);
    currentTab = await getActiveReviewTab().catch(() => null);
    if (currentTab) {
      store.setState({ activeTab: currentTab });
      setTargetSummary(elements, { tab: currentTab });
    }
    render();

    const launchAction = await readQueuedLaunchAction();
    if (launchAction) {
      await runReview(launchAction);
    }
  }

  return {
    init,
    runReview,
    clearMarkers
  };
}
