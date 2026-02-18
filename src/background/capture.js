const CAPTURE_FORMAT = "png";
const OVERLAY_ID = "__olho_capture_progress__";

function executeInTab(tabId, func, args = []) {
  return chrome.scripting
    .executeScript({
      target: { tabId },
      func,
      args
    })
    .then((results) => results?.[0]?.result);
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

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function cropDataUrl(dataUrl, rect, devicePixelRatio = 1) {
  const blob = await dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(blob);
  const sx = Math.round(rect.x * devicePixelRatio);
  const sy = Math.round(rect.y * devicePixelRatio);
  const sw = Math.round(rect.width * devicePixelRatio);
  const sh = Math.round(rect.height * devicePixelRatio);

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();

  const outputBlob = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataUrl(outputBlob);
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
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollBehavior: doc.style.scrollBehavior || ""
    };
  });
}

async function setScrollBehavior(tabId, value) {
  return executeInTab(tabId, (nextValue) => {
    const doc = document.documentElement;
    const prev = doc.style.scrollBehavior || "";
    doc.style.scrollBehavior = nextValue;
    return prev;
  }, [value]);
}

async function scrollTo(tabId, x, y) {
  return executeInTab(tabId, (scrollX, scrollY) => {
    window.scrollTo(scrollX, scrollY);
    return { scrollX: window.scrollX, scrollY: window.scrollY };
  }, [x, y]);
}

async function showProgressOverlay(tabId) {
  return executeInTab(tabId, () => {
    if (document.getElementById("__olho_capture_progress__")) {
      return;
    }
    const overlay = document.createElement("div");
    overlay.id = "__olho_capture_progress__";
    overlay.style.position = "fixed";
    overlay.style.top = "16px";
    overlay.style.right = "16px";
    overlay.style.zIndex = "2147483647";
    overlay.style.padding = "10px 14px";
    overlay.style.borderRadius = "12px";
    overlay.style.background = "rgba(15, 23, 42, 0.92)";
    overlay.style.border = "1px solid rgba(148, 163, 184, 0.3)";
    overlay.style.color = "#f8fafc";
    overlay.style.font = "600 13px system-ui, sans-serif";
    overlay.style.boxShadow = "0 12px 24px rgba(15, 23, 42, 0.35)";
    overlay.textContent = "Capturing…";
    document.body.appendChild(overlay);
  });
}

async function updateProgressOverlay(tabId, { current, total }) {
  return executeInTab(tabId, (progress) => {
    const overlay = document.getElementById("__olho_capture_progress__");
    if (!overlay) return;
    overlay.textContent = `Capturing ${progress.current}/${progress.total}`;
  }, [{ current, total }]);
}

async function setOverlayVisible(tabId, visible) {
  return executeInTab(tabId, (nextVisible) => {
    const overlay = document.getElementById("__olho_capture_progress__");
    if (!overlay) return;
    overlay.style.opacity = nextVisible ? "1" : "0";
  }, [visible]);
}

async function removeProgressOverlay(tabId) {
  return executeInTab(tabId, () => {
    const overlay = document.getElementById("__olho_capture_progress__");
    if (overlay) overlay.remove();
  });
}

async function selectRegion(tabId) {
  return executeInTab(tabId, () => {
    if (window.__olhoRegionSelectActive) return null;
    window.__olhoRegionSelectActive = true;

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.cursor = "crosshair";
      overlay.style.zIndex = "2147483647";
      overlay.style.background = "rgba(10, 14, 24, 0.35)";

      const box = document.createElement("div");
      box.style.position = "absolute";
      box.style.border = "2px dashed rgba(59, 130, 246, 0.9)";
      box.style.background = "rgba(59, 130, 246, 0.15)";
      box.style.pointerEvents = "none";

      const hint = document.createElement("div");
      hint.style.position = "fixed";
      hint.style.top = "16px";
      hint.style.left = "50%";
      hint.style.transform = "translateX(-50%)";
      hint.style.padding = "6px 12px";
      hint.style.borderRadius = "999px";
      hint.style.background = "rgba(15, 23, 42, 0.9)";
      hint.style.border = "1px solid rgba(148, 163, 184, 0.3)";
      hint.style.color = "#f8fafc";
      hint.style.font = "600 12px system-ui, sans-serif";
      hint.textContent = "Drag to select region · Esc to cancel";

      overlay.appendChild(box);
      overlay.appendChild(hint);
      document.body.appendChild(overlay);

      let startX = 0;
      let startY = 0;
      let dragging = false;

      function cleanup(result) {
        window.__olhoRegionSelectActive = false;
        overlay.remove();
        window.removeEventListener("keydown", onKeyDown);
        resolve(result);
      }

      function onKeyDown(event) {
        if (event.key === "Escape") {
          cleanup(null);
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
          cleanup(null);
          return;
        }
        cleanup({ x, y, width, height, devicePixelRatio: window.devicePixelRatio || 1 });
      }

      overlay.addEventListener("pointerdown", onPointerDown);
      overlay.addEventListener("pointermove", onPointerMove);
      overlay.addEventListener("pointerup", onPointerUp);
      window.addEventListener("keydown", onKeyDown);
    });
  });
}

async function notifyEditor(payload) {
  try {
    await chrome.runtime.sendMessage({
      type: "capture_complete",
      payload
    });
  } catch (error) {
    console.warn("Failed to notify editor", error);
  }
}

export async function captureVisibleArea(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const metrics = await getPageMetrics(tabId);
  const dataUrl = await captureVisible(tab.windowId);

  const payload = {
    mode: "visible",
    dataUrl,
    width: metrics.viewportWidth,
    height: metrics.viewportHeight,
    devicePixelRatio: metrics.devicePixelRatio
  };

  await notifyEditor(payload);
  return payload;
}

export async function captureRegion(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const selection = await selectRegion(tabId);
  if (!selection) {
    return { mode: "region", cancelled: true };
  }
  const dataUrl = await captureVisible(tab.windowId);
  const cropped = await cropDataUrl(dataUrl, selection, selection.devicePixelRatio || 1);

  const payload = {
    mode: "region",
    dataUrl: cropped,
    width: selection.width,
    height: selection.height,
    devicePixelRatio: selection.devicePixelRatio || 1
  };

  await notifyEditor(payload);
  return payload;
}

export async function captureFullPage(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const metrics = await getPageMetrics(tabId);
  const dpr = metrics.devicePixelRatio || 1;

  if (metrics.pageHeight <= metrics.viewportHeight && metrics.pageWidth <= metrics.viewportWidth) {
    return captureVisibleArea(tabId);
  }

  const canvas = new OffscreenCanvas(
    Math.round(metrics.pageWidth * dpr),
    Math.round(metrics.pageHeight * dpr)
  );
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;

  const originalScrollBehavior = await setScrollBehavior(tabId, "auto");
  const originalScroll = { x: metrics.scrollX, y: metrics.scrollY };

  const positions = [];
  const step = Math.max(100, metrics.viewportHeight - 120);
  for (let y = 0; y < metrics.pageHeight; y += step) {
    positions.push(Math.min(y, metrics.pageHeight - metrics.viewportHeight));
  }
  if (!positions.length) {
    positions.push(0);
  }

  try {
    await scrollTo(tabId, 0, 0);
    await delay(180);
    await showProgressOverlay(tabId);
    for (let i = 0; i < positions.length; i += 1) {
      const y = positions[i];
      await updateProgressOverlay(tabId, { current: i + 1, total: positions.length });
      const actual = await scrollTo(tabId, 0, y);
      await delay(300);

      await setOverlayVisible(tabId, false);
      const dataUrl = await captureVisible(tab.windowId);
      await setOverlayVisible(tabId, true);
      const blob = await dataUrlToBlob(dataUrl);
      const bitmap = await createImageBitmap(blob);

      const sliceHeight = Math.min(metrics.viewportHeight, metrics.pageHeight - actual.scrollY);
      const sliceHeightPx = Math.round(sliceHeight * dpr);
      const destY = Math.round(actual.scrollY * dpr);

      context.drawImage(
        bitmap,
        0,
        0,
        bitmap.width,
        sliceHeightPx,
        0,
        destY,
        canvas.width,
        sliceHeightPx
      );

      bitmap.close();
    }
  } finally {
    await scrollTo(tabId, originalScroll.x, originalScroll.y);
    await setScrollBehavior(tabId, originalScrollBehavior || "");
    await removeProgressOverlay(tabId);
  }

  const outputBlob = await canvas.convertToBlob({ type: "image/png" });
  const fullDataUrl = await blobToDataUrl(outputBlob);

  const payload = {
    mode: "full",
    dataUrl: fullDataUrl,
    width: metrics.pageWidth,
    height: metrics.pageHeight,
    devicePixelRatio: dpr
  };

  await notifyEditor(payload);
  return payload;
}
