import { getAppSettings, saveMedia } from "../storage/storage.js";

const CAPTURE_FORMAT = "png";
const PROGRESS_OVERLAY_ID = "__olho_capture_progress__";
const CAPTURE_VISIBLE_MIN_INTERVAL_MS = 550;
const MAX_CANVAS_DIMENSION = 16_384;
const MAX_CANVAS_AREA = 268_435_456;
const MAX_CAPTURE_TILES = 640;
const PROTECTED_PAGE_MESSAGE =
  "Olho cannot access this page as a tab. Use Capture screen/window to capture what is visible.";

class CaptureError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "CaptureError";
    this.code = options.code || "capture_failed";
    this.retryable = options.retryable !== false;
    this.cancelled = Boolean(options.cancelled);
  }
}

function createCaptureError(message, options = {}) {
  return new CaptureError(message, options);
}

export function isProtectedCaptureUrl(url) {
  const value = String(url || "").trim().toLowerCase();
  if (!value) return true;

  return (
    value.startsWith("chrome://") ||
    value.startsWith("chrome-search://") ||
    value.startsWith("chrome-extension://") ||
    value.startsWith("edge://") ||
    value.startsWith("about:") ||
    value.startsWith("devtools://") ||
    value.startsWith("view-source:") ||
    value.includes("chrome.google.com/webstore") ||
    value.includes("chromewebstore.google.com")
  );
}

function isInjectionBlockedError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    text.includes("cannot access") ||
    text.includes("cannot be scripted") ||
    text.includes("extensions gallery") ||
    text.includes("no frame with id") ||
    text.includes("missing host permission") ||
    text.includes("protected page")
  );
}

function executeInTab(tabId, func, args = []) {
  return chrome.scripting
    .executeScript({
      target: { tabId },
      func,
      args
    })
    .then((results) => results?.[0]?.result)
    .catch((error) => {
      if (isInjectionBlockedError(error)) {
        throw createCaptureError(PROTECTED_PAGE_MESSAGE, {
          code: "protected_page",
          retryable: false
        });
      }
      throw error;
    });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureVisible(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: CAPTURE_FORMAT }, (dataUrl) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      resolve(dataUrl);
    });
  });
}

async function captureVisibleWithRetry(windowId, attempts = 2) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await captureVisible(windowId);
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await delay(240);
      }
    }
  }
  throw lastError || createCaptureError("Olho could not capture the current view.");
}

async function captureVisibleThrottled(windowId, throttleState) {
  const now = Date.now();
  const elapsed = now - Number(throttleState.lastCaptureAt || 0);
  if (elapsed < CAPTURE_VISIBLE_MIN_INTERVAL_MS) {
    await delay(CAPTURE_VISIBLE_MIN_INTERVAL_MS - elapsed);
  }
  const dataUrl = await captureVisibleWithRetry(windowId, 2);
  throttleState.lastCaptureAt = Date.now();
  return dataUrl;
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw createCaptureError("Failed to decode captured frame.");
  }
  return response.blob();
}

async function cropBlob(blob, rectPx) {
  const bitmap = await createImageBitmap(blob);
  const sx = Math.max(0, Math.round(rectPx.x));
  const sy = Math.max(0, Math.round(rectPx.y));
  const sw = Math.max(1, Math.round(rectPx.width));
  const sh = Math.max(1, Math.round(rectPx.height));

  const maxWidth = Math.max(1, bitmap.width - sx);
  const maxHeight = Math.max(1, bitmap.height - sy);

  const safeWidth = Math.min(sw, maxWidth);
  const safeHeight = Math.min(sh, maxHeight);

  if (safeWidth < 1 || safeHeight < 1) {
    bitmap.close();
    throw createCaptureError("Selected capture area is outside the frame.", {
      code: "invalid_crop",
      retryable: true
    });
  }

  const canvas = new OffscreenCanvas(safeWidth, safeHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, safeWidth, safeHeight, 0, 0, safeWidth, safeHeight);
  bitmap.close();

  return canvas.convertToBlob({ type: "image/png" });
}

async function getViewportMetrics(tabId) {
  return executeInTab(
    tabId,
    () => ({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    })
  );
}

function captureTitle(sourceType) {
  const labels = {
    visible: "Visible",
    region: "Region",
    fullPage: "Full Page",
    element: "Element"
  };
  return `Olho ${labels[sourceType] || "Capture"} ${new Date().toLocaleString()}`;
}

function sanitizeCaptureText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
}

async function getCaptureSourceContext(tab) {
  const sourcePageTitle = sanitizeCaptureText(tab?.title || "");
  let sourceUrl = "";

  try {
    const appSettings = await getAppSettings();
    if (appSettings.storeSourceUrl) {
      const candidate = sanitizeCaptureText(tab?.url || "");
      if (!/^(chrome|about|edge|devtools):\/\//i.test(candidate)) {
        sourceUrl = candidate;
      }
    }
  } catch {
    sourceUrl = "";
  }

  return {
    sourcePageTitle,
    sourceUrl
  };
}

async function persistCaptureBlob({ blob, sourceType, width, height, sourcePageTitle = "", sourceUrl = "" }) {
  const saved = await saveMedia({
    kind: "screenshot",
    sourceType,
    blob,
    metadata: {
      title: captureTitle(sourceType),
      mimeType: blob.type || "image/png",
      sizeBytes: blob.size,
      width,
      height,
      sourceType,
      sourcePageTitle,
      sourceUrl
    }
  });

  return saved;
}

export function buildCaptureGrid({ pageWidth, pageHeight, viewportWidth, viewportHeight, overlap = 120 }) {
  const safePageWidth = Math.max(1, Math.round(pageWidth));
  const safePageHeight = Math.max(1, Math.round(pageHeight));
  const safeViewportWidth = Math.max(1, Math.round(viewportWidth));
  const safeViewportHeight = Math.max(1, Math.round(viewportHeight));

  const stepX = Math.max(120, safeViewportWidth - overlap);
  const stepY = Math.max(120, safeViewportHeight - overlap);

  const xs = [];
  for (let x = 0; x < safePageWidth; x += stepX) {
    xs.push(Math.min(x, Math.max(0, safePageWidth - safeViewportWidth)));
  }
  if (!xs.length) xs.push(0);
  xs.push(Math.max(0, safePageWidth - safeViewportWidth));

  const ys = [];
  for (let y = 0; y < safePageHeight; y += stepY) {
    ys.push(Math.min(y, Math.max(0, safePageHeight - safeViewportHeight)));
  }
  if (!ys.length) ys.push(0);
  ys.push(Math.max(0, safePageHeight - safeViewportHeight));

  const uniqueXs = Array.from(new Set(xs));
  const uniqueYs = Array.from(new Set(ys));

  const tiles = [];
  uniqueYs.forEach((y) => {
    uniqueXs.forEach((x) => {
      tiles.push({ x, y });
    });
  });

  if (tiles.length > MAX_CAPTURE_TILES) {
    throw createCaptureError(
      "Olho cannot capture this full page because it is too long or complex. Try region capture.",
      {
        code: "too_many_tiles",
        retryable: false
      }
    );
  }

  return {
    tiles,
    columns: uniqueXs.length,
    rows: uniqueYs.length
  };
}

function assertCanvasSafe(widthPx, heightPx) {
  if (
    widthPx > MAX_CANVAS_DIMENSION ||
    heightPx > MAX_CANVAS_DIMENSION ||
    widthPx * heightPx > MAX_CANVAS_AREA
  ) {
    throw createCaptureError(
      "Olho cannot capture this full page because it is larger than browser canvas limits. Try region capture.",
      {
        code: "canvas_limit",
        retryable: false
      }
    );
  }
}

async function getPageMetrics(tabId) {
  return executeInTab(tabId, () => {
    const doc = document.documentElement;
    const body = document.body;
    const scroller = document.scrollingElement || doc;

    const pageWidth = Math.max(
      doc.scrollWidth,
      doc.clientWidth,
      doc.offsetWidth,
      body?.scrollWidth || 0,
      body?.offsetWidth || 0,
      scroller?.scrollWidth || 0
    );

    const pageHeight = Math.max(
      doc.scrollHeight,
      doc.clientHeight,
      doc.offsetHeight,
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      scroller?.scrollHeight || 0
    );

    return {
      pageWidth,
      pageHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  });
}

async function ensureFullPageCapturePreflight(tabId, windowId) {
  await executeInTab(tabId, () => ({
    url: location.href,
    title: document.title || "",
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  }));

  const warmupDataUrl = await captureVisibleWithRetry(windowId, 2);
  const warmupBlob = await dataUrlToBlob(warmupDataUrl);
  const warmupBitmap = await createImageBitmap(warmupBlob);
  try {
    if (warmupBitmap.width < 1 || warmupBitmap.height < 1) {
      throw createCaptureError("Olho could not read the current page frame for full-page capture.", {
        code: "capture_preflight_failed",
        retryable: true
      });
    }
  } finally {
    warmupBitmap.close();
  }
}

async function preparePageForFullCapture(tabId) {
  return executeInTab(tabId, () => {
    const doc = document.documentElement;
    const hidden = [];

    const nodes = document.querySelectorAll("*");
    const maxNodes = Math.min(nodes.length, 5000);

    for (let i = 0; i < maxNodes; i += 1) {
      const node = nodes[i];
      const style = getComputedStyle(node);
      if (style.position !== "fixed" && style.position !== "sticky") {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      hidden.push({
        node,
        visibility: node.style.visibility,
        transition: node.style.transition,
        animation: node.style.animation
      });

      node.style.visibility = "hidden";
      node.style.transition = "none";
      node.style.animation = "none";
    }

    window.__olhoFullCaptureState = {
      previousScrollBehavior: doc.style.scrollBehavior,
      hidden
    };

    doc.style.scrollBehavior = "auto";

    return {
      hiddenCount: hidden.length
    };
  });
}

async function restorePageAfterFullCapture(tabId) {
  return executeInTab(tabId, () => {
    const state = window.__olhoFullCaptureState;
    const doc = document.documentElement;

    if (!state) return;

    if (Array.isArray(state.hidden)) {
      state.hidden.forEach((entry) => {
        if (!entry?.node) return;
        entry.node.style.visibility = entry.visibility || "";
        entry.node.style.transition = entry.transition || "";
        entry.node.style.animation = entry.animation || "";
      });
    }

    doc.style.scrollBehavior = state.previousScrollBehavior || "";
    delete window.__olhoFullCaptureState;
  });
}

async function scrollToPosition(tabId, x, y) {
  return executeInTab(
    tabId,
    async (targetX, targetY) => {
      window.scrollTo(targetX, targetY);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 140));
      return {
        scrollX: window.scrollX,
        scrollY: window.scrollY
      };
    },
    [x, y]
  );
}

async function triggerLazyContent(tabId) {
  return executeInTab(tabId, () => {
    const threshold = window.innerHeight * 1.5;
    const lazyNodes = document.querySelectorAll("img[loading='lazy'],iframe[loading='lazy']");
    let touched = 0;

    lazyNodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.top <= threshold && rect.bottom >= -threshold) {
        node.loading = "eager";
        touched += 1;
      }
    });

    window.dispatchEvent(new Event("scroll"));
    return touched;
  });
}

async function showProgressOverlay(tabId) {
  return executeInTab(tabId, () => {
    const existing = document.getElementById("__olho_capture_progress__");
    if (existing) return;

    const overlay = document.createElement("div");
    overlay.id = "__olho_capture_progress__";
    overlay.style.position = "fixed";
    overlay.style.top = "16px";
    overlay.style.right = "16px";
    overlay.style.zIndex = "2147483647";
    overlay.style.padding = "10px 12px";
    overlay.style.borderRadius = "12px";
    overlay.style.background = "rgba(15, 23, 42, 0.94)";
    overlay.style.border = "1px solid rgba(148, 163, 184, 0.35)";
    overlay.style.color = "#f8fafc";
    overlay.style.font = "600 13px system-ui, sans-serif";
    overlay.style.display = "grid";
    overlay.style.gap = "8px";

    const message = document.createElement("div");
    message.textContent = "Capturing 0/0";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.padding = "6px 10px";
    cancelBtn.style.borderRadius = "8px";
    cancelBtn.style.border = "1px solid rgba(148, 163, 184, 0.45)";
    cancelBtn.style.background = "#111827";
    cancelBtn.style.color = "#f8fafc";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.setAttribute("aria-label", "Cancel full-page capture");

    const requestCancel = () => {
      chrome.runtime.sendMessage({ type: "cancel_capture" });
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCancel();
      }
    };

    cancelBtn.addEventListener("click", requestCancel);
    window.addEventListener("keydown", onKeyDown, true);

    overlay.append(message, cancelBtn);
    document.body.appendChild(overlay);

    window.__olhoProgressOverlayCleanup = () => {
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      delete window.__olhoProgressOverlayCleanup;
    };
  });
}

async function updateProgressOverlay(tabId, { current, total }) {
  return executeInTab(
    tabId,
    (nextCurrent, nextTotal) => {
      const overlay = document.getElementById("__olho_capture_progress__");
      if (!overlay) return;
      const message = overlay.querySelector("div");
      if (message) {
        message.textContent = `Capturing ${nextCurrent}/${nextTotal}`;
      }
    },
    [current, total]
  );
}

async function setOverlayVisible(tabId, visible) {
  return executeInTab(
    tabId,
    (nextVisible) => {
      const overlay = document.getElementById("__olho_capture_progress__");
      if (overlay) {
        overlay.style.opacity = nextVisible ? "1" : "0";
      }
    },
    [visible]
  );
}

async function removeProgressOverlay(tabId) {
  return executeInTab(tabId, () => {
    if (typeof window.__olhoProgressOverlayCleanup === "function") {
      window.__olhoProgressOverlayCleanup();
      return;
    }
    const overlay = document.getElementById("__olho_capture_progress__");
    if (overlay) overlay.remove();
  });
}

async function selectRegion(tabId) {
  return executeInTab(tabId, () => {
    if (window.__olhoCaptureModeActive) {
      return { cancelled: true };
    }

    window.__olhoCaptureModeActive = true;

    return new Promise((resolve) => {
      const host = document.createElement("div");
      host.id = "olho-capture-region-host";
      host.style.position = "fixed";
      host.style.inset = "0";
      host.style.zIndex = "2147483647";

      const shadowRoot = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = `
        *, *::before, *::after {
          box-sizing: border-box;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        }
        .olho-overlay {
          position: fixed;
          inset: 0;
          cursor: crosshair;
          background: rgba(10, 14, 24, 0.35);
        }
        .olho-box {
          position: absolute;
          border: 2px solid rgba(168, 148, 255, 0.95);
          background: rgba(168, 148, 255, 0.2);
          pointer-events: none;
        }
        .olho-hud {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          padding: 10px 12px;
          border-radius: 999px;
          background: rgba(8, 8, 22, 0.95);
          border: 1px solid rgba(168, 148, 255, 0.4);
          color: #f6f4ff;
          font: 600 12px system-ui, sans-serif;
        }
        .olho-size {
          position: absolute;
          padding: 4px 8px;
          font: 600 12px system-ui, sans-serif;
          background: rgba(8, 8, 22, 0.9);
          border: 1px solid rgba(168, 148, 255, 0.75);
          border-radius: 8px;
          color: #d9d2ff;
          pointer-events: none;
        }
        .olho-size[hidden] {
          display: none;
        }
        .olho-cancel {
          position: fixed;
          top: 16px;
          right: 16px;
          min-height: 38px;
          border-radius: 10px;
          border: 1px solid rgba(168, 148, 255, 0.45);
          background: #12112b;
          color: #f6f4ff;
          padding: 8px 12px;
          cursor: pointer;
        }
      `;

      const overlay = document.createElement("div");
      overlay.className = "olho-overlay";

      const box = document.createElement("div");
      box.className = "olho-box";

      const hud = document.createElement("div");
      hud.className = "olho-hud";
      hud.textContent = "Drag to select area. Press Escape to cancel.";
      hud.setAttribute("role", "status");
      hud.setAttribute("aria-live", "polite");

      const sizeLabel = document.createElement("div");
      sizeLabel.className = "olho-size";
      sizeLabel.hidden = true;

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "olho-cancel";
      cancelButton.textContent = "Cancel";
      cancelButton.setAttribute("aria-label", "Cancel region capture");

      overlay.append(box, sizeLabel, hud, cancelButton);
      shadowRoot.append(style, overlay);
      document.documentElement.appendChild(host);
      cancelButton.focus();

      let startX = 0;
      let startY = 0;
      let dragging = false;

      function cleanup(result) {
        host.remove();
        window.removeEventListener("keydown", onKeyDown, true);
        delete window.__olhoCaptureCancel;
        delete window.__olhoCaptureModeActive;
        resolve(result);
      }

      function cancel(reason = "cancelled") {
        cleanup({ cancelled: true, reason });
      }

      function onKeyDown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel("escape");
        }
      }

      function onPointerDown(event) {
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;

        box.style.left = `${startX}px`;
        box.style.top = `${startY}px`;
        box.style.width = "0px";
        box.style.height = "0px";
        sizeLabel.hidden = false;
      }

      function onPointerMove(event) {
        if (!dragging) return;

        const currentX = event.clientX;
        const currentY = event.clientY;
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;

        sizeLabel.textContent = `${Math.round(width)} × ${Math.round(height)}`;
        sizeLabel.style.left = `${x}px`;
        sizeLabel.style.top = `${Math.max(0, y - 28)}px`;
      }

      function onPointerUp(event) {
        if (!dragging) return;
        dragging = false;

        const endX = event.clientX;
        const endY = event.clientY;
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        if (width < 4 || height < 4) {
          cancel("too-small");
          return;
        }

        cleanup({
          cancelled: false,
          x,
          y,
          width,
          height,
          devicePixelRatio: window.devicePixelRatio || 1
        });
      }

      overlay.addEventListener("pointerdown", onPointerDown);
      overlay.addEventListener("pointermove", onPointerMove);
      overlay.addEventListener("pointerup", onPointerUp);
      cancelButton.addEventListener("click", () => cancel("button"));
      window.addEventListener("keydown", onKeyDown, true);

      window.__olhoCaptureCancel = () => cancel("external");
    });
  });
}

async function selectElement(tabId) {
  return executeInTab(tabId, () => {
    if (window.__olhoCaptureModeActive) {
      return { cancelled: true };
    }

    window.__olhoCaptureModeActive = true;

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "2147483647";
      overlay.style.background = "rgba(2, 6, 23, 0.1)";
      overlay.style.pointerEvents = "none";

      const outline = document.createElement("div");
      outline.style.position = "fixed";
      outline.style.border = "2px solid rgba(34, 211, 238, 0.95)";
      outline.style.background = "rgba(34, 211, 238, 0.2)";
      outline.style.pointerEvents = "none";
      outline.style.borderRadius = "6px";

      const hud = document.createElement("div");
      hud.style.position = "fixed";
      hud.style.top = "16px";
      hud.style.left = "50%";
      hud.style.transform = "translateX(-50%)";
      hud.style.padding = "10px 12px";
      hud.style.borderRadius = "999px";
      hud.style.background = "rgba(15, 23, 42, 0.95)";
      hud.style.border = "1px solid rgba(148, 163, 184, 0.4)";
      hud.style.color = "#f8fafc";
      hud.style.font = "600 12px system-ui";
      hud.textContent = "Move pointer to highlight an element. Click to capture. Escape to cancel.";
      hud.setAttribute("role", "status");
      hud.setAttribute("aria-live", "polite");
      hud.style.pointerEvents = "none";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel";
      cancelButton.style.position = "fixed";
      cancelButton.style.top = "16px";
      cancelButton.style.right = "16px";
      cancelButton.style.padding = "8px 12px";
      cancelButton.style.borderRadius = "10px";
      cancelButton.style.border = "1px solid rgba(148, 163, 184, 0.45)";
      cancelButton.style.background = "#111827";
      cancelButton.style.color = "#f8fafc";
      cancelButton.style.pointerEvents = "auto";
      cancelButton.style.cursor = "pointer";
      cancelButton.setAttribute("aria-label", "Cancel element capture");

      overlay.append(outline, hud, cancelButton);
      document.body.appendChild(overlay);
      cancelButton.focus();

      let currentTarget = null;

      function cleanup(result) {
        document.removeEventListener("pointermove", onPointerMove, true);
        document.removeEventListener("click", onClick, true);
        window.removeEventListener("keydown", onKeyDown, true);
        overlay.remove();
        delete window.__olhoCaptureCancel;
        delete window.__olhoCaptureModeActive;
        resolve(result);
      }

      function cancel(reason = "cancelled") {
        cleanup({ cancelled: true, reason });
      }

      function updateOutline(target) {
        if (!target || target === overlay || overlay.contains(target)) return;
        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        currentTarget = target;
        outline.style.left = `${rect.left}px`;
        outline.style.top = `${rect.top}px`;
        outline.style.width = `${rect.width}px`;
        outline.style.height = `${rect.height}px`;
      }

      function onPointerMove(event) {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element || element === cancelButton || cancelButton.contains(element)) {
          return;
        }
        updateOutline(element);
      }

      function onClick(event) {
        if (event.target === cancelButton || cancelButton.contains(event.target)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const target = currentTarget || document.elementFromPoint(event.clientX, event.clientY);
        if (!target || target === overlay || overlay.contains(target)) {
          cancel("invalid-target");
          return;
        }

        const rect = target.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
          cancel("invalid-size");
          return;
        }

        const exceedsViewport =
          rect.left < 0 ||
          rect.top < 0 ||
          rect.right > window.innerWidth ||
          rect.bottom > window.innerHeight;

        cleanup({
          cancelled: false,
          viewportRect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          },
          documentRect: {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height
          },
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
          exceedsViewport
        });
      }

      function onKeyDown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel("escape");
        }
      }

      cancelButton.addEventListener("click", () => cancel("button"));
      document.addEventListener("pointermove", onPointerMove, true);
      document.addEventListener("click", onClick, true);
      window.addEventListener("keydown", onKeyDown, true);
      window.__olhoCaptureCancel = () => cancel("external");
    });
  });
}

export async function cancelPageCapture(tabId) {
  if (!tabId) return false;
  try {
    const cancelled = await executeInTab(tabId, () => {
      if (typeof window.__olhoCaptureCancel === "function") {
        window.__olhoCaptureCancel();
        return true;
      }
      return false;
    });
    return Boolean(cancelled);
  } catch {
    return false;
  }
}

function ensureTabCapturable(tab) {
  if (!tab?.id || isProtectedCaptureUrl(tab.url)) {
    throw createCaptureError(PROTECTED_PAGE_MESSAGE, {
      code: "protected_page",
      retryable: false
    });
  }
}

async function captureVisibleBlob(tab) {
  const dataUrl = await captureVisible(tab.windowId);
  const blob = await dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();
  return { blob, width, height };
}

async function captureFullPageRaw(tabId, runtime) {
  const tab = await chrome.tabs.get(tabId);
  await ensureFullPageCapturePreflight(tabId, tab.windowId);
  const metrics = await getPageMetrics(tabId);

  const dpr = metrics.devicePixelRatio || 1;
  const canvasWidth = Math.max(1, Math.round(metrics.pageWidth * dpr));
  const canvasHeight = Math.max(1, Math.round(metrics.pageHeight * dpr));
  assertCanvasSafe(canvasWidth, canvasHeight);

  const grid = buildCaptureGrid({
    pageWidth: metrics.pageWidth,
    pageHeight: metrics.pageHeight,
    viewportWidth: metrics.viewportWidth,
    viewportHeight: metrics.viewportHeight
  });

  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  const throttleState = { lastCaptureAt: 0 };

  const originalScroll = { x: metrics.scrollX, y: metrics.scrollY };

  await preparePageForFullCapture(tabId);
  await showProgressOverlay(tabId);

  let index = 0;
  try {
    for (const tile of grid.tiles) {
      index += 1;

      if (runtime?.isCancelled?.()) {
        throw createCaptureError("Capture cancelled.", {
          code: "cancelled",
          cancelled: true,
          retryable: true
        });
      }

      await updateProgressOverlay(tabId, { current: index, total: grid.tiles.length });
      const actual = await scrollToPosition(tabId, tile.x, tile.y);
      await triggerLazyContent(tabId);
      await delay(120);

      await setOverlayVisible(tabId, false);
      const frameDataUrl = await captureVisibleThrottled(tab.windowId, throttleState);
      await setOverlayVisible(tabId, true);

      const frameBlob = await dataUrlToBlob(frameDataUrl);
      const frameBitmap = await createImageBitmap(frameBlob);

      const cssSliceWidth = Math.min(metrics.viewportWidth, Math.max(1, metrics.pageWidth - actual.scrollX));
      const cssSliceHeight = Math.min(
        metrics.viewportHeight,
        Math.max(1, metrics.pageHeight - actual.scrollY)
      );
      const requestedSliceWidth = Math.max(1, Math.round(cssSliceWidth * dpr));
      const requestedSliceHeight = Math.max(1, Math.round(cssSliceHeight * dpr));
      const safeSliceWidth = Math.max(1, Math.min(requestedSliceWidth, frameBitmap.width));
      const safeSliceHeight = Math.max(1, Math.min(requestedSliceHeight, frameBitmap.height));
      const destX = Math.max(0, Math.min(canvasWidth - 1, Math.round(actual.scrollX * dpr)));
      const destY = Math.max(0, Math.min(canvasHeight - 1, Math.round(actual.scrollY * dpr)));
      const drawWidth = Math.max(1, Math.min(safeSliceWidth, canvasWidth - destX));
      const drawHeight = Math.max(1, Math.min(safeSliceHeight, canvasHeight - destY));

      context.drawImage(
        frameBitmap,
        0,
        0,
        drawWidth,
        drawHeight,
        destX,
        destY,
        drawWidth,
        drawHeight
      );

      frameBitmap.close();
    }
  } finally {
    await scrollToPosition(tabId, originalScroll.x, originalScroll.y).catch(() => {
      // best effort restore
    });
    await restorePageAfterFullCapture(tabId).catch(() => {
      // best effort restore
    });
    await removeProgressOverlay(tabId).catch(() => {
      // best effort cleanup
    });
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });

  return {
    blob,
    width: metrics.pageWidth,
    height: metrics.pageHeight,
    devicePixelRatio: dpr
  };
}

export async function captureVisibleArea(tabId) {
  const tab = await chrome.tabs.get(tabId);
  ensureTabCapturable(tab);
  const sourceContext = await getCaptureSourceContext(tab);

  const captured = await captureVisibleBlob(tab);
  const item = await persistCaptureBlob({
    blob: captured.blob,
    sourceType: "visible",
    width: captured.width,
    height: captured.height,
    ...sourceContext
  });

  return {
    item,
    blob: captured.blob,
    sourceType: "visible",
    width: captured.width,
    height: captured.height,
    message: "Visible area captured."
  };
}

export async function captureRegion(tabId) {
  const tab = await chrome.tabs.get(tabId);
  ensureTabCapturable(tab);
  const sourceContext = await getCaptureSourceContext(tab);

  const selection = await selectRegion(tabId);
  if (!selection || selection.cancelled) {
    throw createCaptureError("Capture cancelled.", {
      code: "cancelled",
      cancelled: true,
      retryable: true
    });
  }

  const frameDataUrl = await captureVisible(tab.windowId);
  const frameBlob = await dataUrlToBlob(frameDataUrl);

  const dpr = selection.devicePixelRatio || 1;
  const croppedBlob = await cropBlob(frameBlob, {
    x: selection.x * dpr,
    y: selection.y * dpr,
    width: selection.width * dpr,
    height: selection.height * dpr
  });

  const item = await persistCaptureBlob({
    blob: croppedBlob,
    sourceType: "region",
    width: Math.round(selection.width),
    height: Math.round(selection.height),
    ...sourceContext
  });

  return {
    item,
    blob: croppedBlob,
    sourceType: "region",
    width: Math.round(selection.width),
    height: Math.round(selection.height),
    message: "Region captured."
  };
}

export async function captureFullPage(tabId, runtime) {
  const tab = await chrome.tabs.get(tabId);
  ensureTabCapturable(tab);
  const sourceContext = await getCaptureSourceContext(tab);

  const full = await captureFullPageRaw(tabId, runtime);
  const item = await persistCaptureBlob({
    blob: full.blob,
    sourceType: "fullPage",
    width: full.width,
    height: full.height,
    ...sourceContext
  });

  return {
    item,
    blob: full.blob,
    sourceType: "fullPage",
    width: full.width,
    height: full.height,
    message: "Full page captured."
  };
}

export async function captureElement(tabId, runtime) {
  const tab = await chrome.tabs.get(tabId);
  ensureTabCapturable(tab);
  const sourceContext = await getCaptureSourceContext(tab);

  const selection = await selectElement(tabId);
  if (!selection || selection.cancelled) {
    throw createCaptureError("Capture cancelled.", {
      code: "cancelled",
      cancelled: true,
      retryable: true
    });
  }

  let finalBlob;
  let width;
  let height;
  const dpr = selection.devicePixelRatio || 1;

  if (selection.exceedsViewport) {
    const full = await captureFullPageRaw(tabId, runtime);
    finalBlob = await cropBlob(full.blob, {
      x: selection.documentRect.x * dpr,
      y: selection.documentRect.y * dpr,
      width: selection.documentRect.width * dpr,
      height: selection.documentRect.height * dpr
    });
    width = Math.round(selection.documentRect.width);
    height = Math.round(selection.documentRect.height);
  } else {
    const frameDataUrl = await captureVisible(tab.windowId);
    const frameBlob = await dataUrlToBlob(frameDataUrl);
    finalBlob = await cropBlob(frameBlob, {
      x: selection.viewportRect.x * dpr,
      y: selection.viewportRect.y * dpr,
      width: selection.viewportRect.width * dpr,
      height: selection.viewportRect.height * dpr
    });
    width = Math.round(selection.viewportRect.width);
    height = Math.round(selection.viewportRect.height);
  }

  const item = await persistCaptureBlob({
    blob: finalBlob,
    sourceType: "element",
    width,
    height,
    ...sourceContext
  });

  return {
    item,
    blob: finalBlob,
    sourceType: "element",
    width,
    height,
    message: "Element captured."
  };
}

export async function downloadCapture(blob, filenameBase = "olho-capture") {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `Olho/${filenameBase}-${Date.now()}.png`,
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 20_000);
  }
}

export function normalizeCaptureError(error) {
  if (error instanceof CaptureError) {
    return error;
  }

  if (isInjectionBlockedError(error)) {
    return createCaptureError(PROTECTED_PAGE_MESSAGE, {
      code: "protected_page",
      retryable: false
    });
  }

  const message = String(error?.message || error || "Capture failed.");
  return createCaptureError(message, { code: "capture_failed", retryable: true });
}

export { PROTECTED_PAGE_MESSAGE };
