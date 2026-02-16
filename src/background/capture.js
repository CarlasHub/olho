const CAPTURE_FORMAT = "png";

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

async function getPageMetrics(tabId) {
  return executeInTab(tabId, () => {
    const doc = document.documentElement;
    const body = document.body;
    const pageWidth = Math.max(doc.scrollWidth, doc.clientWidth, body?.scrollWidth || 0);
    const pageHeight = Math.max(doc.scrollHeight, doc.clientHeight, body?.scrollHeight || 0);
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

export async function captureFullPage(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const metrics = await getPageMetrics(tabId);
  const dpr = metrics.devicePixelRatio || 1;

  const canvas = new OffscreenCanvas(
    Math.round(metrics.pageWidth * dpr),
    Math.round(metrics.pageHeight * dpr)
  );
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;

  const originalScrollBehavior = await setScrollBehavior(tabId, "auto");
  const originalScroll = { x: metrics.scrollX, y: metrics.scrollY };

  const positions = [];
  for (let y = 0; y < metrics.pageHeight; y += metrics.viewportHeight) {
    positions.push(y);
  }

  try {
    for (const y of positions) {
      const actual = await scrollTo(tabId, 0, y);
      await delay(120);

      const dataUrl = await captureVisible(tab.windowId);
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
