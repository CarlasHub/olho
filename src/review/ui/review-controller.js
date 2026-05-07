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
import { filterValidReviewFindings } from "../findings/finding-validator.js";
import { renderFindingInspector } from "./finding-inspector.js";
import { renderFindingList } from "./finding-list.js";
import { renderOverlayMarkers } from "../overlays/overlay-renderer.js";
import { buildHtmlReviewReport } from "../reports/review-html-report.js";
import { buildJsonReviewReport } from "../reports/review-json-report.js";
import { buildMarkdownReviewReport } from "../reports/review-markdown-report.js";
import { buildReviewSummaryMarkdown } from "../reports/review-report-builder.js";
import { buildTicketMarkdown } from "../reports/ticket-builder.js";
import { downloadTextReport, reviewReportFilename } from "../reports/report-download.js";
import { createVolatileReviewSessionStore } from "../store/review-session-store.js";
import { loadReviewImageSource } from "../utils/image-source.js";

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
    backButton: document.getElementById("backToMemoryBtn"),
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
    title: document.getElementById("reviewTitle"),
    meta: document.getElementById("reviewMeta"),
    findingsCount: document.getElementById("findingsCount"),
    findingsList: document.getElementById("findingsList"),
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
  let reviewContext = null;
  let deterministicFindings = [];
  let aiConfig = normalizeAiReviewConfig();
  let aiAbortController = null;
  let aiRunning = false;
  let selectedFindingId = "";
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
    if (elements.aiStatusPill) {
      elements.aiStatusPill.textContent = pill;
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
    const fullVisual = aiConfig.mode === AI_REVIEW_MODES.FULL_VISUAL;

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
      elements.aiScreenshotSharingToggle.disabled = !enabled || !fullVisual || !provider.supportsVision || aiRunning;
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
        enabled && fullVisual && aiConfig.screenshotSharingEnabled && provider.supportsVision ? "screenshot allowed" : "no screenshot sharing";
      elements.aiProviderSummary.textContent = enabled
        ? `${provider.label} | ${modeLabel} | ${screenshotState}`
        : "Disabled by default.";
    }

    if (!enabled) {
      setAiStatus({
        text: "AI review is off. Deterministic local findings remain available without external processing.",
        pill: "Off"
      });
    }
  }

  async function confirmScreenshotSharingIfNeeded(nextConfig) {
    const provider = getAiProviderOption(nextConfig.provider);
    const needsConsent =
      nextConfig.enabled &&
      nextConfig.mode === AI_REVIEW_MODES.FULL_VISUAL &&
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

  function exportHtmlReport() {
    if (!ensureSession()) return;
    downloadTextReport({
      text: buildHtmlReviewReport(session),
      filename: reviewReportFilename(session, "html"),
      mimeType: "text/html;charset=utf-8"
    });
    showStatus("HTML review report exported locally.");
  }

  function exportMarkdownReport() {
    if (!ensureSession()) return;
    downloadTextReport({
      text: buildMarkdownReviewReport(session),
      filename: reviewReportFilename(session, "md"),
      mimeType: "text/markdown;charset=utf-8"
    });
    showStatus("Markdown review report exported locally.");
  }

  function exportJsonReport() {
    if (!ensureSession()) return;
    downloadTextReport({
      text: buildJsonReviewReport(session),
      filename: reviewReportFilename(session, "json"),
      mimeType: "application/json;charset=utf-8"
    });
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

  function render() {
    const findings = session?.findings || [];
    if (elements.findingsCount) {
      elements.findingsCount.textContent = String(findings.length);
    }

    renderFindingList({
      container: elements.findingsList,
      findings,
      selectedFindingId,
      onSelect(nextId) {
        selectedFindingId = nextId;
        render();
      }
    });

    renderFindingInspector({
      container: elements.inspector,
      findings,
      selectedFindingId,
      onCopyTicket: copyFindingTicket
    });

    renderOverlayMarkers({
      container: elements.overlayLayer,
      findings,
      selectedFindingId,
      onSelect(nextId) {
        selectedFindingId = nextId;
        render();
      }
    });
  }

  async function init() {
    elements.backButton?.addEventListener("click", backToMemory);
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

    const baseSession = createReviewSession({
      itemId,
      media: imageSource.media,
      imageUrl: imageSource.objectUrl
    });

    setProgress("Running deterministic local review rules.");
    const richMetrics = imageSource.media.metadata?.reviewMetrics || imageSource.media.metadata?.domMetrics || {};
    const hasRichElements = Array.isArray(richMetrics.elements) && richMetrics.elements.length > 0;
    const engineInput = {
      itemId,
      media: imageSource.media,
      screenshotRef: baseSession.screenshotRef,
      sourceType: hasRichElements ? "dom-metrics" : "image-only",
      elements: richMetrics.elements || [],
      domMetrics: richMetrics,
      viewport: richMetrics.viewport || {
        width: elements.screenshotImage?.naturalWidth || baseSession.media.width,
        height: elements.screenshotImage?.naturalHeight || baseSession.media.height
      },
      imageMetrics: {
        width: elements.screenshotImage?.naturalWidth || baseSession.media.width,
        height: elements.screenshotImage?.naturalHeight || baseSession.media.height,
        sizeBytes: baseSession.media.sizeBytes,
        mimeType: baseSession.media.mimeType
      }
    };
    reviewContext = createReviewContext(engineInput);
    const engineResult = runReviewEngine(engineInput);
    const devFindings = filterValidReviewFindings(developmentSampleFindings(baseSession), {
      warnInvalid: true,
      context: "Review Mode development findings"
    });
    deterministicFindings = [...engineResult.findings, ...devFindings];
    session = {
      ...baseSession,
      findings: deterministicFindings,
      deterministicFindings,
      engineMetadata: engineResult.metadata,
      skippedRules: engineResult.skippedRules
    };
    store.set(session);

    const title = session.title || "Untitled screenshot";
    const dimensions =
      session.media.width && session.media.height ? `${session.media.width} x ${session.media.height}` : "dimensions unknown";
    const created = formatDate(session.media.createdAt);
    const size = formatBytes(session.media.sizeBytes);

    if (elements.title) elements.title.textContent = title;
    if (elements.meta) {
      const reviewSummary = `Local deterministic review: ${engineResult.metadata.findingCount} findings, ${engineResult.skippedRules.length} skipped`;
      elements.meta.textContent = [dimensions, size, created, reviewSummary].filter(Boolean).join(" | ");
    }

    setLoading(false);
    setReportActionsEnabled(true);
    renderAiControls();
    render();
  }

  return {
    init,
    showFatalError
  };
}
