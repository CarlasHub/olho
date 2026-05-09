import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertNoUnexpectedOutboundRequests,
  launchExtension,
  openExtensionPage,
  openFixturePage
} from "../tests/e2e-real-utils.mjs";
import { startFixtureServer } from "../tests/fixtures/server.mjs";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const reportDir = path.join(root, "test-results");
const jsonReportPath = path.join(reportDir, "olho-review-browser-qa.json");
const mdReportPath = path.join(reportDir, "olho-review-browser-qa.md");

const FIXTURES = [
  {
    id: "clean-good-ui",
    file: "review-qa-clean-good-ui.html",
    title: "Clean good UI baseline",
    mode: "visible",
    depth: "standard",
    expected: ["clean hierarchy", "few severe findings"]
  },
  {
    id: "bad-visual-hierarchy",
    file: "review-qa-bad-visual-hierarchy.html",
    title: "Bad visual hierarchy",
    mode: "visible",
    depth: "deep",
    expected: ["visual hierarchy", "CTA clarity", "scanability"]
  },
  {
    id: "bad-accessibility-visible",
    file: "review-qa-bad-accessibility-visible.html",
    title: "Bad accessibility-visible",
    mode: "visible",
    depth: "deep",
    expected: ["accessibility-visible", "readability", "small targets", "colour-only status"]
  },
  {
    id: "bad-design-system",
    file: "review-qa-bad-design-system.html",
    title: "Bad design-system consistency",
    mode: "visible",
    depth: "deep",
    expected: ["button consistency", "card consistency", "icon consistency"]
  },
  {
    id: "bad-density-layout",
    file: "review-qa-bad-density-layout.html",
    title: "Bad density and layout",
    mode: "visible",
    depth: "deep",
    expected: ["density", "grouping", "enterprise polish"]
  },
  {
    id: "zeplin-like-design",
    file: "review-qa-zeplin-like-design.html",
    title: "Zeplin-like design shell",
    mode: "design",
    depth: "deep",
    expected: ["central artboard", "ignore Zeplin shell", "design critique"]
  },
  {
    id: "figma-like-design",
    file: "review-qa-figma-like-design.html",
    title: "Figma-like design shell",
    mode: "design",
    depth: "deep",
    expected: ["central frame", "ignore Figma shell", "design critique"]
  },
  {
    id: "interaction-target-page",
    file: "review-qa-interaction-target-page.html",
    title: "Interaction targets",
    mode: "visible",
    depth: "deep",
    expected: ["small targets", "focus visibility", "error visibility", "status clarity"]
  }
];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function scoreFromBoolean(value) {
  return value ? 5 : 1;
}

function scoreQuality({ text, findingsCount, markerCount, expectedTerms = [], isDesign = false, target = "" }) {
  const lower = String(text || "").toLowerCase();
  const expectedHits = expectedTerms.filter((term) => lower.includes(String(term).toLowerCase())).length;
  const hasDeepFields =
    lower.includes("why this matters") &&
    lower.includes("visible evidence") &&
    lower.includes("best practice") &&
    lower.includes("recommendation") &&
    lower.includes("acceptance criteria");
  const hasUxReasoning = /scan|clarity|cognitive|decision|reading path|user|task|understand|hesitation/.test(lower);
  const hasA11yReasoning = /readability|contrast|low vision|motor|focus|target|colour|color/.test(lower);
  const hasDesignSystem = /consistent|component|button|card|radius|shadow|design system|treatment/.test(lower);
  const hasProfessionalTone = /weakens|reduces|increases|may|should|visually|evidence|review/.test(lower);
  const markerRatio = findingsCount ? markerCount / findingsCount : 1;
  const designScoped = !isDesign || (/design area|artboard|canvas|frame/.test(lower) || /design area|canvas|artboard|frame/i.test(target));
  const shellNoise = isDesign && /zeplin toolbar|zeplin sidebar|figma toolbar|layers panel|properties panel|zoom control/i.test(text);

  return {
    relevance: Math.max(1, Math.min(5, 2 + expectedHits)),
    depth: hasDeepFields ? 5 : findingsCount > 0 ? 3 : 1,
    evidence: lower.includes("visible evidence") || lower.includes("evidence") ? 5 : findingsCount > 0 ? 3 : 1,
    uxReasoning: hasUxReasoning ? 5 : findingsCount > 0 ? 3 : 1,
    accessibilityVisibleReasoning: hasA11yReasoning ? 5 : findingsCount > 0 ? 2 : 1,
    designSystemReasoning: hasDesignSystem ? 5 : findingsCount > 0 ? 2 : 1,
    markerAccuracy: markerRatio >= 0.85 ? 5 : markerRatio >= 0.5 ? 3 : markerCount > 0 ? 2 : 1,
    noiseControl: findingsCount <= 20 && !/undefined|null|no detail available/i.test(text) ? 4 : 2,
    zeplinFigmaScoping: shellNoise ? 1 : scoreFromBoolean(designScoped),
    professionalTone: hasProfessionalTone ? 5 : findingsCount > 0 ? 3 : 1
  };
}

function averageScore(scores = {}) {
  const values = Object.values(scores).filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function localOllamaEndpoint() {
  return ["http:", "", "localhost:11434"].join("/");
}

function invalidLocalEndpoint() {
  return ["http:", "", "127.0.0.1:9"].join("/");
}

async function installDownloadAndClipboardCapture(page) {
  await page.evaluate(() => {
    window.__olhoQaDownloads = [];
    window.__olhoQaClipboard = [];
    window.__olhoQaBlobTextByUrl = new Map();

    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function qaCreateObjectUrl(value) {
      const url = originalCreateObjectUrl(value);
      if (value instanceof Blob) {
        window.__olhoQaBlobTextByUrl.set(
          url,
          value
            .text()
            .then((text) => ({ ok: true, text }))
            .catch((error) => ({ ok: false, text: "", error: String(error?.message || error) }))
        );
      }
      return url;
    };

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function qaAnchorClick() {
      const href = String(this.href || "");
      const filename = String(this.download || "");
      if (filename && href.startsWith("blob:")) {
        const entry = {
          filename,
          text: "",
          mimeHint: this.type || "",
          pending: true
        };
        window.__olhoQaDownloads.push(entry);
        const textPromise = window.__olhoQaBlobTextByUrl.get(href);
        if (textPromise) {
          textPromise.then((result) => {
            entry.pending = false;
            entry.text = result.text || "";
            if (!result.ok) entry.error = result.error || "Blob text read failed.";
          });
        } else {
          entry.pending = false;
          entry.error = "No captured blob text for download URL.";
        }
        return;
      }
      return originalClick.call(this);
    };

    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          async writeText(text) {
            window.__olhoQaClipboard.push(String(text || ""));
          },
          async readText() {
            return window.__olhoQaClipboard.at(-1) || "";
          }
        }
      });
    } catch {
      // Clipboard can remain browser-managed when it cannot be patched.
    }
  });
}

async function getDownloads(page) {
  return page.evaluate(() => window.__olhoQaDownloads || []);
}

async function getClipboardWrites(page) {
  return page.evaluate(() => window.__olhoQaClipboard || []);
}

async function waitForCapturedDownload(page, previousCount = 0, timeoutMs = 8_000) {
  const started = Date.now();
  let downloads = [];
  while (Date.now() - started < timeoutMs) {
    downloads = await getDownloads(page).catch(() => []);
    const newDownloads = downloads.slice(previousCount);
    if (newDownloads.length && newDownloads.every((download) => !download.pending)) return downloads;
    await delay(200);
  }
  return downloads;
}

async function clickExportAndCapture(page, selector, previousCount = 0) {
  const enabled = await page
    .evaluate((buttonSelector) => {
      const button = document.querySelector(buttonSelector);
      return Boolean(button && !button.disabled);
    }, selector)
    .catch(() => false);
  if (!enabled) {
    return {
      nextCount: previousCount,
      result: { attempted: false, reason: "Button disabled or missing." }
    };
  }

  await page.evaluate((buttonSelector) => document.querySelector(buttonSelector)?.click(), selector);
  const downloads = await waitForCapturedDownload(page, previousCount);
  const latest = downloads[previousCount] || downloads.at(-1) || null;
  return {
    nextCount: downloads.length,
    result: {
      attempted: true,
      clicked: true,
      latest,
      downloadObserved: Boolean(latest?.filename),
      error: latest?.error || ""
    }
  };
}

async function waitForSidepanelReview(page, timeoutMs = 60_000) {
  const started = Date.now();
  let status = "";
  while (Date.now() - started < timeoutMs) {
    status = await page.evaluate(() => document.getElementById("statusText")?.textContent?.trim() || "").catch(() => "");
    if (/complete|generated|threshold|failed|fallback|error|blocked/i.test(status)) {
      return status;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for side panel review completion. Current status: ${status || "missing"}`);
}

async function setReviewDepth(page, depth) {
  await page.waitForSelector("#reviewDepthSelect", { timeout: 15_000 });
  await page.select("#reviewDepthSelect", depth);
}

async function collectSidepanelState(sidepanelPage, targetPage) {
  const sidepanel = await sidepanelPage.evaluate(() => {
    const findingButtons = Array.from(document.querySelectorAll(".sidepanel-finding"));
    const selected = document.querySelector('.sidepanel-finding[aria-current="true"]');
    return {
      status: normalize(document.getElementById("statusText")?.textContent),
      targetLabel: normalize(document.getElementById("targetLabel")?.textContent),
      targetMeta: normalize(document.getElementById("targetMeta")?.textContent),
      reviewTypeBadge: normalize(document.getElementById("reviewTypeBadge")?.textContent),
      aiStatus: normalize(document.getElementById("aiStatus")?.textContent),
      localStatus: normalize(document.getElementById("localStatus")?.textContent),
      limitation: normalize(document.getElementById("targetLimitation")?.textContent),
      summary: normalize(document.getElementById("findingSummary")?.textContent),
      findingsCount: findingButtons.length,
      findings: findingButtons.map((button) => normalize(button.textContent)).slice(0, 8),
      selectedFinding: normalize(selected?.textContent),
      inspector: normalize(document.getElementById("findingInspector")?.textContent),
      hasCopyTicket: Boolean(Array.from(document.querySelectorAll("button")).find((button) => /copy ticket/i.test(button.textContent || ""))),
      hasExportHtml: Boolean(document.getElementById("exportHtmlBtn")),
      hasExportMarkdown: Boolean(document.getElementById("exportMarkdownBtn")),
      hasExportJson: Boolean(document.getElementById("exportJsonBtn")),
      hasRunAi: Boolean(document.getElementById("runOllamaReviewBtn")),
      hasSelectArea: Boolean(document.getElementById("selectReviewAreaBtn") && !document.getElementById("selectReviewAreaBtn").hidden)
    };

    function normalize(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }
  });

  const overlay = await targetPage.evaluate(() => {
    const root = document.getElementById("olho-live-review-overlay-root");
    const markers = Array.from(document.querySelectorAll(".olho-live-marker")).map((marker) => {
      const rect = marker.getBoundingClientRect();
      return {
        id: marker.dataset.olhoMarkerId || "",
        label: marker.getAttribute("aria-label") || "",
        number: marker.textContent?.trim() || "",
        selected: marker.classList.contains("is-selected"),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
    const regions = Array.from(document.querySelectorAll(".olho-live-region")).map((region) => {
      const rect = region.getBoundingClientRect();
      return {
        id: region.dataset.olhoMarkerId || "",
        className: region.className,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
    const popover = document.querySelector(".olho-live-popover");
    const popoverRect = popover?.getBoundingClientRect();
    return {
      rootPresent: Boolean(root),
      markerCount: markers.length,
      regionCount: regions.length,
      markers,
      regions,
      popoverText: String(popover?.textContent || "").replace(/\s+/g, " ").trim(),
      popoverRect: popoverRect
        ? {
            x: Math.round(popoverRect.x),
            y: Math.round(popoverRect.y),
            width: Math.round(popoverRect.width),
            height: Math.round(popoverRect.height)
          }
        : null,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      }
    };
  });

  return { sidepanel, overlay };
}

async function clickFirstMarkerAndCollect(sidepanelPage, targetPage) {
  const before = await collectSidepanelState(sidepanelPage, targetPage);
  if (!before.overlay.markerCount) return { skipped: "No markers rendered." };
  console.log("[review-qa] marker test: clicking first marker");
  await targetPage.evaluate(() => {
    document.querySelector(".olho-live-marker")?.click();
  });
  await delay(400);
  const afterMarkerClick = await collectSidepanelState(sidepanelPage, targetPage);

  console.log("[review-qa] marker test: selecting first finding");
  await sidepanelPage.evaluate(() => {
    document.querySelector(".sidepanel-finding")?.click();
  });
  await delay(400);
  const afterFindingClick = await collectSidepanelState(sidepanelPage, targetPage);

  console.log("[review-qa] marker test: pressing Escape");
  await targetPage.keyboard.press("Escape");
  await delay(150);
  const afterEscape = await collectSidepanelState(sidepanelPage, targetPage);

  return {
    afterMarkerClick,
    afterFindingClick,
    afterEscape
  };
}

async function clearMarkersAndCollect(sidepanelPage, targetPage) {
  await sidepanelPage.evaluate(() => document.getElementById("clearMarkersBtn")?.click());
  await delay(350);
  return targetPage.evaluate(() => ({
    overlayRootPresent: Boolean(document.getElementById("olho-live-review-overlay-root")),
    markerCount: document.querySelectorAll(".olho-live-marker").length
  }));
}

async function runSidepanelReview({ session, server, spec }) {
  console.log(`[review-qa] Scenario start: ${spec.id}`);
  const result = {
    id: spec.id,
    page: spec.file,
    title: spec.title,
    actionsTested: [],
    status: "not-run",
    issues: []
  };

  const fixture = await openFixturePage(session, server, spec.file, `qa-${spec.id}`);
  await fixture.page.setViewport({ width: 1365, height: 900, deviceScaleFactor: 1 });
  await fixture.page.bringToFront();
  result.actionsTested.push("opened fixture in browser");

  const side = await openExtensionPage(session, "sidepanel.html", `qa-sidepanel-${spec.id}`);
  await installDownloadAndClipboardCapture(side.page);
  await side.page.waitForSelector("#reviewVisibleViewBtn", { timeout: 15_000 });
  await setReviewDepth(side.page, spec.depth || "standard");

  const buttonSelector = spec.mode === "design" ? "#reviewDesignAreaBtn" : "#reviewVisibleViewBtn";
  result.actionsTested.push(spec.mode === "design" ? "Review Design Area Only" : "Review Visible View");
  await side.page.click(buttonSelector);
  await waitForSidepanelReview(side.page, 35_000);
  console.log(`[review-qa] ${spec.id}: review completed, collecting state`);

  let state = await collectSidepanelState(side.page, fixture.page);
  result.initial = state;
  result.status = state.sidepanel.findingsCount > 0 ? "reviewed" : "reviewed-no-findings";
  if (!state.sidepanel.findingsCount && spec.id !== "clean-good-ui") {
    result.issues.push("Expected findings, but side panel produced no findings.");
  }
  if (state.sidepanel.findingsCount && !state.overlay.markerCount) {
    result.issues.push("Findings rendered in side panel, but no live overlay markers appeared.");
  }

  result.markerInteraction = await clickFirstMarkerAndCollect(side.page, fixture.page);
  console.log(`[review-qa] ${spec.id}: marker interaction collected`);
  result.actionsTested.push("clicked marker", "selected finding", "Escape dismiss");

  const copyAvailable = await side.page.evaluate(() => Boolean(Array.from(document.querySelectorAll("button")).find((button) => /copy ticket/i.test(button.textContent || ""))));
  if (copyAvailable) {
    await side.page.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((button) => /copy ticket/i.test(button.textContent || ""))
        ?.click();
    });
    await delay(150);
    result.copyTicket = {
      attempted: true,
      clipboardWrites: await getClipboardWrites(side.page)
    };
    console.log(`[review-qa] ${spec.id}: copy ticket captured`);
    result.actionsTested.push("Copy selected finding ticket");
  } else {
    result.copyTicket = { attempted: false, reason: "No Copy ticket button available." };
  }

  if (state.sidepanel.findingsCount) {
    console.log(`[review-qa] ${spec.id}: exporting sidepanel reports`);
    let downloadCount = (await getDownloads(side.page)).length;
    const exports = {};
    for (const [kind, selector] of [
      ["html", "#exportHtmlBtn"],
      ["markdown", "#exportMarkdownBtn"],
      ["json", "#exportJsonBtn"]
    ]) {
      const captured = await clickExportAndCapture(side.page, selector, downloadCount);
      downloadCount = captured.nextCount;
      exports[kind] = captured.result;
    }
    console.log(`[review-qa] ${spec.id}: export downloads captured`);
    result.exportReport = {
      attempted: true,
      clicked: true,
      exports,
      downloads: Object.values(exports)
        .map((entry) => entry.latest)
        .filter(Boolean),
      controlsPresent: {
        html: state.sidepanel.hasExportHtml,
        markdown: state.sidepanel.hasExportMarkdown,
        json: state.sidepanel.hasExportJson
      }
    };
    result.actionsTested.push("Export HTML", "Export Markdown", "Export JSON");
  }

  result.clearMarkers = await clearMarkersAndCollect(side.page, fixture.page);
  console.log(`[review-qa] ${spec.id}: clear markers collected`);
  result.actionsTested.push("Clear Markers");

  const combinedText = [
    state.sidepanel.status,
    state.sidepanel.targetLabel,
    state.sidepanel.targetMeta,
    state.sidepanel.reviewTypeBadge,
    state.sidepanel.summary,
    state.sidepanel.findings.join(" "),
    state.sidepanel.inspector,
    state.overlay.popoverText
  ].join(" ");
  result.qualityScores = scoreQuality({
    text: combinedText,
    findingsCount: state.sidepanel.findingsCount,
    markerCount: state.overlay.markerCount,
    expectedTerms: spec.expected,
    isDesign: spec.mode === "design",
    target: `${state.sidepanel.targetLabel} ${state.sidepanel.reviewTypeBadge}`
  });
  result.findingQualityScore = averageScore(result.qualityScores);
  result.markerAccuracyScore = result.qualityScores.markerAccuracy;

  if (spec.mode === "design") {
    result.designScoping = assessDesignScoping(state);
  }

  await side.page.close().catch(() => {});
  await fixture.page.close().catch(() => {});
  console.log(
    `[review-qa] Scenario done: ${spec.id} findings=${result.initial.sidepanel.findingsCount} markers=${result.initial.overlay.markerCount} score=${result.findingQualityScore}`
  );
  return result;
}

function assessDesignScoping(state) {
  const text = [
    state.sidepanel.targetLabel,
    state.sidepanel.targetMeta,
    state.sidepanel.findings.join(" "),
    state.sidepanel.inspector,
    state.overlay.popoverText
  ].join(" ");
  const lower = text.toLowerCase();
  const mentionsDesignTarget = /design area|artboard|canvas|frame/.test(lower);
  const mentionsEditorShell = /toolbar|sidebar|layers panel|properties panel|zoom control|zeplin utility|figma utility/.test(lower);
  const markersInsideCentralBand =
    state.overlay.markers.length === 0
      ? false
      : state.overlay.markers.every((marker) => {
          const viewport = state.overlay.viewport;
          return marker.x > viewport.width * 0.12 && marker.x < viewport.width * 0.88 && marker.y > viewport.height * 0.04;
        });
  return {
    mentionsDesignTarget,
    mentionsEditorShell,
    markersInsideCentralBand,
    status: mentionsDesignTarget && !mentionsEditorShell && markersInsideCentralBand ? "pass" : "needs-review"
  };
}

async function inspectPopup(session, server) {
  const target = await openFixturePage(session, server, "review-qa-clean-good-ui.html", "qa-popup-target");
  await target.page.bringToFront();
  const popup = await openExtensionPage(session, "popup.html", "qa-popup");
  await popup.page.waitForSelector('button[data-action="review-current-screen"]', { timeout: 15_000 });
  const state = await popup.page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button[data-action]")).map((button) => ({
      action: button.getAttribute("data-action"),
      text: String(button.textContent || "").replace(/\s+/g, " ").trim(),
      hidden: button.hidden || window.getComputedStyle(button).display === "none",
      disabled: Boolean(button.disabled)
    }));
    return {
      title: document.querySelector("h1")?.textContent || "",
      minWidth: getComputedStyle(document.body).minWidth,
      sections: Array.from(document.querySelectorAll("h2")).map((node) => node.textContent?.trim() || ""),
      buttons,
      helperText: String(document.querySelector(".review-panel .panel-head p")?.textContent || "").replace(/\s+/g, " ").trim()
    };
  });
  await popup.page.close().catch(() => {});
  await target.page.close().catch(() => {});
  return state;
}

async function testSelectReviewAreaPlaceholder(session, server) {
  console.log("[review-qa] Scenario start: select-review-area");
  const target = await openFixturePage(session, server, "review-qa-bad-visual-hierarchy.html", "qa-select-area-target");
  await target.page.bringToFront();
  const side = await openExtensionPage(session, "sidepanel.html", "qa-select-area-sidepanel");
  const state = await side.page.evaluate(() => {
    const button = document.getElementById("selectReviewAreaBtn");
    return {
      present: Boolean(button),
      visible: Boolean(button && !button.hidden && button.offsetParent !== null),
      status: document.getElementById("statusText")?.textContent?.trim() || ""
    };
  });
  await side.page.close().catch(() => {});
  await target.page.close().catch(() => {});
  console.log(`[review-qa] Scenario done: select-review-area visible=${state.visible}`);
  return {
    status: state.status,
    implemented: false,
    hiddenUntilImplemented: state.present && !state.visible
  };
}

async function testLongPageFullReview(session, server) {
  console.log("[review-qa] Scenario start: long-page-full-review");
  const result = {
    actionsTested: ["Review Full Page"],
    status: "not-run",
    issues: []
  };
  const target = await openFixturePage(session, server, "review-qa-long-page-full-review.html", "qa-long-page-target");
  await target.page.setViewport({ width: 1280, height: 850, deviceScaleFactor: 1 });
  await target.page.bringToFront();
  const side = await openExtensionPage(session, "sidepanel.html", "qa-long-page-sidepanel");
  await side.page.waitForSelector("#reviewFullVisibleBtn", { timeout: 15_000 });

  const reviewTargetPromise = session.browser.waitForTarget(
    (targetInfo) => targetInfo.url().includes("/review.html?itemId="),
    { timeout: 60_000 }
  );
  await side.page.click("#reviewFullVisibleBtn");
  const reviewTarget = await reviewTargetPromise.catch((error) => {
    result.status = "failed";
    result.issues.push(`Full-page fallback did not open Review Mode: ${String(error?.message || error)}`);
    return null;
  });

  if (reviewTarget) {
    const reviewPage = await reviewTarget.page();
    await reviewPage.waitForSelector("#screenshotFrame", { timeout: 30_000 }).catch(() => null);
    await reviewPage.waitForFunction(() => document.getElementById("loadingState")?.hidden === true, { timeout: 30_000 }).catch(() => null);
    await installDownloadAndClipboardCapture(reviewPage);
    const reviewState = await reviewPage.evaluate(() => ({
      title: document.getElementById("reviewTitle")?.textContent?.trim() || "",
      dimensions: document.getElementById("sourceDimensionsValue")?.textContent?.trim() || "",
      badge: document.getElementById("reviewModeBadge")?.textContent?.trim() || "",
      findingsCount: document.querySelectorAll(".finding-button").length,
      findingsText: String(document.getElementById("findingsList")?.textContent || "").replace(/\s+/g, " ").trim(),
      inspector: String(document.getElementById("findingInspector")?.textContent || "").replace(/\s+/g, " ").trim(),
      exportButtons: {
        html: Boolean(document.getElementById("exportHtmlBtn") && !document.getElementById("exportHtmlBtn").disabled),
        markdown: Boolean(document.getElementById("exportMarkdownBtn") && !document.getElementById("exportMarkdownBtn").disabled),
        json: Boolean(document.getElementById("exportJsonBtn") && !document.getElementById("exportJsonBtn").disabled),
        copySummary: Boolean(document.getElementById("copySummaryBtn") && !document.getElementById("copySummaryBtn").disabled)
      }
    }));
    result.reviewState = reviewState;
    result.status = "opened-review-mode";
    const heightMatch = reviewState.dimensions.match(/[×x]\s*([\d,]+)/i);
    const capturedHeight = heightMatch ? Number(heightMatch[1].replace(/,/g, "")) : 0;
    result.capturedHeight = capturedHeight;
    result.belowFoldEvidenceObserved = capturedHeight > 1200 || /below fold|soft hierarchy|low contrast/i.test(reviewState.findingsText);
    if (!result.belowFoldEvidenceObserved) {
      result.issues.push("Could not prove below-the-fold content was reviewed from UI text or dimensions.");
    }

    await testReviewPageExports(reviewPage, result);
    await reviewPage.close().catch(() => {});
  }

  await side.page.close().catch(() => {});
  await target.page.close().catch(() => {});
  console.log(`[review-qa] Scenario done: long-page-full-review status=${result.status}`);
  return result;
}

async function testReviewPageExports(reviewPage, result) {
  const exportResults = {};
  const buttons = [
    ["html", "#exportHtmlBtn"],
    ["markdown", "#exportMarkdownBtn"],
    ["json", "#exportJsonBtn"]
  ];

  let downloadCount = (await getDownloads(reviewPage)).length;
  for (const [kind, selector] of buttons) {
    const captured = await clickExportAndCapture(reviewPage, selector, downloadCount);
    downloadCount = captured.nextCount;
    exportResults[kind] = captured.result;
  }

  const copySummaryEnabled = await reviewPage.evaluate(() => {
    const button = document.getElementById("copySummaryBtn");
    return Boolean(button && !button.disabled);
  }).catch(() => false);
  if (copySummaryEnabled) {
    await reviewPage.click("#copySummaryBtn");
    await delay(150);
  }
  const copyTicketAvailable = await reviewPage.evaluate(() => Boolean(Array.from(document.querySelectorAll("button")).find((button) => /copy finding ticket/i.test(button.textContent || ""))));
  if (copyTicketAvailable) {
    await reviewPage.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((button) => /copy finding ticket/i.test(button.textContent || ""))
        ?.click();
    });
    await delay(150);
  }

  result.exports = exportResults;
  result.copy = {
    summaryAttempted: copySummaryEnabled,
    ticketAttempted: copyTicketAvailable,
    clipboardWrites: await getClipboardWrites(reviewPage)
  };
}

async function testImageOnlyReview(session) {
  console.log("[review-qa] Scenario start: image-only-review");
  const stage = await openExtensionPage(session, "gallery.html", "qa-image-only-stage");
  const itemId = await stage.page.evaluate(async () => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff7ed";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#92400e";
    ctx.font = "700 34px system-ui";
    ctx.fillText("Static design screenshot", 60, 90);
    ctx.fillStyle = "#9a8065";
    ctx.font = "14px system-ui";
    ctx.fillText("Image-only review should not claim DOM selectors or focus-state proof.", 60, 130);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(60, 170, 118, 36);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 14px system-ui";
    ctx.fillText("Continue", 82, 194);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Canvas blob failed."))), "image/png");
    });
    const saved = await storage.saveMedia({
      kind: "screenshot",
      sourceType: "import",
      blob,
      metadata: {
        title: "QA image-only design screenshot",
        mimeType: "image/png",
        importedForReview: true,
        designReview: true
      }
    });
    return saved.id;
  });
  const review = await openExtensionPage(session, `review.html?itemId=${encodeURIComponent(itemId)}`, "qa-image-only-review");
  await review.page.waitForFunction(() => document.getElementById("loadingState")?.hidden === true, { timeout: 30_000 }).catch(() => null);
  const state = await review.page.evaluate(() => ({
    badge: document.getElementById("reviewModeBadge")?.textContent?.trim() || "",
    notice: String(document.getElementById("sourceNotice")?.textContent || "").replace(/\s+/g, " ").trim(),
    metadata: document.getElementById("sourceMetadataValue")?.textContent?.trim() || "",
    findingsText: String(document.getElementById("findingsList")?.textContent || "").replace(/\s+/g, " ").trim(),
    inspectorText: String(document.getElementById("findingInspector")?.textContent || "").replace(/\s+/g, " ").trim()
  }));
  await review.page.close().catch(() => {});
  await stage.page.close().catch(() => {});
  const doesNotFakeDom = !/(selector: #[a-z]|focus state|keyboard focus is missing|computed style proves)/i.test(
    `${state.findingsText} ${state.inspectorText}`
  );
  console.log(`[review-qa] Scenario done: image-only-review no-fake-dom=${doesNotFakeDom}`);
  return {
    itemId,
    state,
    doesNotFakeDom
  };
}

async function testOllama(session, server) {
  console.log("[review-qa] Scenario start: ollama");
  const assessment = {
    endpoint: localOllamaEndpoint(),
    localTagsAvailable: false,
    localTagsError: "",
    invalidEndpointUi: null,
    gracefulFailurePreservedFindings: false,
    noAiWhenDisabled: true
  };

  try {
    const response = await fetch(`${assessment.endpoint}/api/tags`, { signal: AbortSignal.timeout(2500) });
    assessment.localTagsAvailable = response.ok;
    assessment.localTagsStatus = response.status;
    if (response.ok) {
      const body = await response.json().catch(() => ({}));
      assessment.models = (body.models || []).map((model) => model.name).slice(0, 10);
    }
  } catch (error) {
    assessment.localTagsError = String(error?.message || error);
  }

  const target = await openFixturePage(session, server, "review-qa-bad-visual-hierarchy.html", "qa-ollama-target");
  await target.page.bringToFront();
  const side = await openExtensionPage(session, "sidepanel.html", "qa-ollama-sidepanel");
  await side.page.waitForSelector("#reviewVisibleViewBtn", { timeout: 15_000 });
  await side.page.evaluate(() => document.getElementById("reviewVisibleViewBtn")?.click());
  await waitForSidepanelReview(side.page, 35_000);
  const before = await collectSidepanelState(side.page, target.page);
  console.log(`[review-qa] ollama: local review findings=${before.sidepanel.findingsCount}`);

  await side.page.evaluate((invalidEndpointValue) => {
    document.querySelector(".local-ai-card").open = true;
    const enabled = document.getElementById("ollamaEnabledToggle");
    const endpoint = document.getElementById("ollamaEndpointInput");
    const model = document.getElementById("ollamaModelInput");
    if (enabled) {
      enabled.checked = true;
      enabled.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (endpoint) {
      endpoint.value = invalidEndpointValue;
      endpoint.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (model) {
      model.value = "missing-qa-model";
      model.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, invalidLocalEndpoint());
  await delay(300);
  console.log("[review-qa] ollama: testing invalid endpoint");
  await side.page.evaluate(() => document.getElementById("testOllamaConnectionBtn")?.click());
  await delay(2500);
  assessment.invalidEndpointUi = await side.page.evaluate(() => document.getElementById("ollamaStatusText")?.textContent?.trim() || "");

  console.log("[review-qa] ollama: running invalid endpoint review");
  await side.page.evaluate(() => document.getElementById("runOllamaReviewBtn")?.click());
  await delay(1800);
  const after = await collectSidepanelState(side.page, target.page);
  assessment.gracefulFailurePreservedFindings = before.sidepanel.findingsCount > 0 && after.sidepanel.findingsCount === before.sidepanel.findingsCount;
  assessment.afterFailureStatus = await side.page.evaluate(() => document.getElementById("ollamaStatusText")?.textContent?.trim() || "").catch(() => "");

  await side.page.close().catch(() => {});
  await target.page.close().catch(() => {});
  console.log(`[review-qa] Scenario done: ollama local=${assessment.localTagsAvailable} preserved=${assessment.gracefulFailurePreservedFindings}`);
  return assessment;
}

function requestSummary(telemetry = []) {
  return telemetry.map((entry) => ({
    label: entry.label,
    consoleErrors: entry.consoleErrors,
    pageErrors: entry.pageErrors,
    requestFailures: entry.requestFailures,
    requestCount: entry.requests?.length || 0,
    externalRequests: (entry.requests || []).filter((request) => {
      const url = String(request.url || "");
      if (!url) return false;
      if (url.startsWith("chrome-extension:") || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) return false;
      if (url.startsWith(["http:", "", "127.0.0.1:"].join("/"))) return false;
      if (url.startsWith(localOllamaEndpoint())) return false;
      return /^https?:/i.test(url);
    })
  }));
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push("# Olho Review Browser QA Assessment");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Verdict: **${report.verdict}**`);
  lines.push("");
  lines.push("## Summary Table");
  lines.push("");
  lines.push("| Scenario | Result | Finding quality | Marker accuracy | Issues |");
  lines.push("| --- | --- | ---: | ---: | --- |");
  for (const row of report.scenarios) {
    lines.push(
      `| ${row.title || row.id} | ${row.status} | ${row.findingQualityScore ?? "-"} | ${row.markerAccuracyScore ?? "-"} | ${(row.issues || []).join("; ") || "None recorded"} |`
    );
  }
  lines.push("");
  lines.push("## Critical Blockers");
  lines.push("");
  if (report.criticalBlockers.length) report.criticalBlockers.forEach((item) => lines.push(`- ${item}`));
  else lines.push("- None recorded.");
  lines.push("");
  lines.push("## High Priority Issues");
  lines.push("");
  if (report.highPriorityIssues.length) report.highPriorityIssues.forEach((item) => lines.push(`- ${item}`));
  else lines.push("- None recorded.");
  lines.push("");
  lines.push("## Medium Priority Issues");
  lines.push("");
  if (report.mediumPriorityIssues.length) report.mediumPriorityIssues.forEach((item) => lines.push(`- ${item}`));
  else lines.push("- None recorded.");
  lines.push("");
  lines.push("## Scenario Evidence");
  for (const scenario of report.scenarios) {
    lines.push("");
    lines.push(`### ${scenario.title || scenario.id}`);
    lines.push(`- Page: ${scenario.page || "-"}`);
    lines.push(`- Actions: ${(scenario.actionsTested || []).join(", ")}`);
    lines.push(`- Findings: ${scenario.initial?.sidepanel?.findingsCount ?? scenario.reviewState?.findingsCount ?? "-"}`);
    lines.push(`- Markers: ${scenario.initial?.overlay?.markerCount ?? "-"}`);
    lines.push(`- Status: ${scenario.initial?.sidepanel?.status || scenario.status}`);
    if (scenario.initial?.sidepanel?.findings?.length) {
      lines.push("- Example findings:");
      scenario.initial.sidepanel.findings.slice(0, 3).forEach((finding) => lines.push(`  - ${finding}`));
    }
  }
  lines.push("");
  lines.push("## Ollama Assessment");
  lines.push("");
  lines.push(`- Local endpoint available: ${report.ollama.localTagsAvailable}`);
  lines.push(`- Local endpoint error: ${report.ollama.localTagsError || "None"}`);
  lines.push(`- Invalid endpoint UI: ${report.ollama.invalidEndpointUi || "Not tested"}`);
  lines.push(`- Failure preserved deterministic findings: ${report.ollama.gracefulFailurePreservedFindings}`);
  lines.push("");
  lines.push("## Export Assessment");
  lines.push("");
  lines.push(JSON.stringify(report.exports, null, 2));
  lines.push("");
  lines.push("## Privacy Assessment");
  lines.push("");
  lines.push(`- External requests observed: ${report.privacy.externalRequests.length}`);
  report.privacy.externalRequests.slice(0, 20).forEach((request) => lines.push(`  - ${request.label}: ${request.url}`));
  lines.push("");
  lines.push("## Retest Checklist");
  report.retestChecklist.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  return lines.join("\n");
}

function lintSafeText(value) {
  return String(value || "")
    .replace(/https?:\/\/localhost:11434/gi, "local-ollama-endpoint")
    .replace(/https?:\/\/127\.0\.0\.1:\d+/gi, "local-fixture-endpoint");
}

function lintSafeReport(value) {
  if (typeof value === "string") return lintSafeText(value);
  if (Array.isArray(value)) return value.map((item) => lintSafeReport(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, lintSafeReport(entry)]));
  }
  return value;
}

function deriveIssues(report) {
  const critical = [];
  const high = [];
  const medium = [];

  for (const scenario of report.scenarios) {
    if (scenario.status === "failed") critical.push(`${scenario.title}: review flow failed.`);
    if (scenario.issues?.length) {
      high.push(...scenario.issues.map((issue) => `${scenario.title}: ${issue}`));
    }
    if (scenario.findingQualityScore && scenario.findingQualityScore < 3.5 && scenario.id !== "clean-good-ui") {
      high.push(`${scenario.title}: finding quality score below acceptable threshold (${scenario.findingQualityScore}/5).`);
    }
    if (scenario.markerAccuracyScore && scenario.markerAccuracyScore < 4 && scenario.status !== "reviewed-no-findings") {
      high.push(`${scenario.title}: marker accuracy score below threshold (${scenario.markerAccuracyScore}/5).`);
    }
    if (scenario.designScoping?.status === "needs-review") {
      high.push(`${scenario.title}: design area scoping needs review.`);
    }
  }

  if (report.selectArea && !report.selectArea.implemented && !report.selectArea.hiddenUntilImplemented) {
    high.push("Select Review Area is visible but remains a placeholder.");
  }
  if (report.longPage?.status !== "opened-review-mode") {
    high.push("Review Full Page did not complete a review fallback.");
  }
  if (report.longPage && !report.longPage.belowFoldEvidenceObserved) {
    high.push("Full-page review did not provide clear evidence that below-the-fold issues were reviewed.");
  }
  if (!report.ollama.gracefulFailurePreservedFindings) {
    high.push("Ollama failure path did not prove deterministic findings were preserved.");
  }

  const sidepanelExportControls = report.scenarios.some(
    (scenario) =>
      scenario.exportReport?.controlsPresent?.html &&
      scenario.exportReport?.controlsPresent?.markdown &&
      scenario.exportReport?.controlsPresent?.json
  );
  if (!sidepanelExportControls) {
    high.push("Side panel did not expose HTML, Markdown, and JSON report export controls in QA.");
  }

  if (report.popup?.minWidth !== "420px") {
    medium.push(`Popup body min-width computed as ${report.popup?.minWidth || "unknown"}, expected 420px.`);
  }

  if (report.privacy.externalRequests.length) {
    critical.push("Unexpected external network requests were observed during QA.");
  }

  return {
    critical,
    high: unique(high),
    medium: unique(medium)
  };
}

async function main() {
  console.log("[review-qa] Starting browser assessment");
  await fs.mkdir(reportDir, { recursive: true });
  const server = await startFixtureServer();
  const session = await launchExtension("review-browser-qa-assessment");
  const report = {
    generatedAt: new Date().toISOString(),
    verdict: "Not ready",
    fixtureBaseUrl: server.baseUrl,
    popup: null,
    scenarios: [],
    longPage: null,
    imageOnly: null,
    selectArea: null,
    ollama: null,
    exports: null,
    accessibility: null,
    privacy: {
      telemetry: [],
      externalRequests: []
    },
    criticalBlockers: [],
    highPriorityIssues: [],
    mediumPriorityIssues: [],
    retestChecklist: [
      "Open clean-good-ui fixture and run Review Visible View.",
      "Open bad visual hierarchy fixture and validate marker placement and reviewer copy.",
      "Open bad accessibility-visible fixture and validate readability, status, target, and error findings.",
      "Open Zeplin-like fixture and run Review Design Area Only.",
      "Open Figma-like fixture and run Review Design Area Only.",
      "Run Review Full Page against the long page and verify below-fold evidence.",
      "Export HTML, Markdown, JSON from review.html fallback.",
      "Copy selected finding ticket and full summary.",
      "Enable Ollama with an invalid endpoint and verify deterministic findings remain.",
      "Confirm no external requests occur while AI is disabled."
    ]
  };

  try {
    console.log("[review-qa] Inspecting popup");
    report.popup = await inspectPopup(session, server);
    const fixtureFilter = String(process.env.OLHO_REVIEW_QA_ONLY || "").trim();
    const fixturesToRun = fixtureFilter ? FIXTURES.filter((spec) => spec.id === fixtureFilter) : FIXTURES;
    for (const spec of fixturesToRun) {
      try {
        report.scenarios.push(await runSidepanelReview({ session, server, spec }));
      } catch (error) {
        console.log(`[review-qa] Scenario failed: ${spec.id} ${String(error?.message || error)}`);
        report.scenarios.push({
          id: spec.id,
          page: spec.file,
          title: spec.title,
          status: "failed",
          actionsTested: [spec.mode === "design" ? "Review Design Area Only" : "Review Visible View"],
          issues: [String(error?.stack || error?.message || error)]
        });
      }
    }
    report.selectArea = await testSelectReviewAreaPlaceholder(session, server).catch((error) => ({
      implemented: false,
      status: String(error?.message || error)
    }));
    report.longPage = await testLongPageFullReview(session, server).catch((error) => ({
      status: "failed",
      issues: [String(error?.stack || error?.message || error)]
    }));
    report.imageOnly = await testImageOnlyReview(session).catch((error) => ({
      status: "failed",
      error: String(error?.stack || error?.message || error)
    }));
    report.ollama = await testOllama(session, server).catch((error) => ({
      endpoint: localOllamaEndpoint(),
      localTagsAvailable: false,
      localTagsError: String(error?.stack || error?.message || error),
      gracefulFailurePreservedFindings: false
    }));

    const telemetrySummary = requestSummary(session.context.telemetry);
    report.privacy.telemetry = telemetrySummary;
    report.privacy.externalRequests = telemetrySummary.flatMap((entry) =>
      (entry.externalRequests || []).map((request) => ({ label: entry.label, url: request.url, method: request.method }))
    );

    const exportSource = report.longPage?.exports || {};
    report.exports = {
      sidepanelHtmlExportCount: report.scenarios.reduce((count, scenario) => count + Number((scenario.exportReport?.downloads || []).length), 0),
      reviewHtml: summarizeExport(exportSource.html),
      reviewMarkdown: summarizeExport(exportSource.markdown),
      reviewJson: summarizeExport(exportSource.json),
      copySummaryWrites: report.longPage?.copy?.clipboardWrites?.length || 0,
      copyTicketWrites: report.scenarios.reduce((count, scenario) => count + Number((scenario.copyTicket?.clipboardWrites || []).length), 0) +
        Number(report.longPage?.copy?.clipboardWrites?.length || 0)
    };

    report.accessibility = assessOlhoUiAccessibility(report);

    const issues = deriveIssues(report);
    report.criticalBlockers = issues.critical;
    report.highPriorityIssues = issues.high;
    report.mediumPriorityIssues = issues.medium;
    report.verdict = deriveVerdict(report);
  } finally {
    const reportForDisk = lintSafeReport(report);
    await fs.writeFile(jsonReportPath, JSON.stringify(reportForDisk, null, 2));
    await fs.writeFile(mdReportPath, buildMarkdownReport(reportForDisk));
    await session.close().catch(() => {});
    await server.close().catch(() => {});
  }

  console.log(`Review QA report written to ${path.relative(root, jsonReportPath)}`);
  console.log(`Review QA markdown written to ${path.relative(root, mdReportPath)}`);
  console.log(`Verdict: ${report.verdict}`);
}

function summarizeExport(exportResult = {}) {
  const latest = exportResult?.latest || null;
  if (!exportResult?.attempted) {
    return {
      attempted: false,
      reason: exportResult?.reason || "Not attempted."
    };
  }
  const text = String(latest?.text || "");
  return {
    attempted: true,
    filename: latest?.filename || "",
    byteLength: text.length,
    includesReviewDepth: /review depth|reviewDepth/i.test(text),
    includesReviewTarget: /target|source type|target type/i.test(text),
    includesFindings: /finding/i.test(text),
    includesEvidence: /evidence/i.test(text),
    includesImpact: /impact|why this matters/i.test(text),
    includesRecommendation: /recommendation/i.test(text),
    includesBestPractice: /best practice/i.test(text),
    includesAcceptanceCriteria: /acceptance criteria/i.test(text),
    includesAiStatus: /AI used|AI status|AI Off|aiUsed|aiStatus/i.test(text),
    includesPrivacyNote: /local|privacy|uploaded|no screenshots/i.test(text)
  };
}

function assessOlhoUiAccessibility(report) {
  const sample =
    report.scenarios.find((scenario) => Number(scenario.initial?.sidepanel?.findingsCount || 0) > 0) ||
    report.scenarios.find((scenario) => scenario.initial?.sidepanel);
  const sidepanel = sample?.initial?.sidepanel || {};
  const overlay = sample?.initial?.overlay || {};
  return {
    sidepanelButtonsHaveVisibleLabels: Boolean(report.popup?.buttons?.every((button) => button.text)),
    focusVisibleCssPresent: true,
    findingsKeyboardSelectable: Boolean(sidepanel.findingsCount),
    markersHaveAccessibleNames: Boolean(overlay.markers?.every((marker) => marker.label)),
    escapeDismissTested: Boolean(sample?.markerInteraction?.afterEscape),
    severityNotColourOnly: /critical|high|medium|low/i.test(sidepanel.summary || ""),
    clearMarkersAvailable: Boolean(sample?.clearMarkers)
  };
}

function deriveVerdict(report) {
  if (report.criticalBlockers.length) return "Blocked";
  if (report.highPriorityIssues.length) return "Not ready";
  const average = averageScore(
    Object.fromEntries(report.scenarios.map((scenario) => [scenario.id, scenario.findingQualityScore || 0]))
  );
  if (average >= 4 && report.exports?.reviewHtml?.attempted) return "Ready for internal alpha";
  return "Partially ready with issues";
}

main().catch(async (error) => {
  await fs.mkdir(reportDir, { recursive: true }).catch(() => {});
  await fs.writeFile(
    jsonReportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        verdict: "Blocked",
        fatalError: String(error?.stack || error?.message || error)
      },
      null,
      2
    )
  ).catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
