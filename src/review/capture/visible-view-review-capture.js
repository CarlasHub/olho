function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then((response) => response.blob());
}

async function imageSizeFromBlob(blob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  return { width: 0, height: 0 };
}

function collectReviewMetricsInPage(options = {}) {
  const mode = options?.mode === "full-page" ? "full-page" : "visible-view";
  const documentElement = document.documentElement;
  const documentWidth = Math.max(documentElement?.scrollWidth || 0, document.body?.scrollWidth || 0, window.innerWidth);
  const documentHeight = Math.max(documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0, window.innerHeight);
  const viewport = {
    width: mode === "full-page" ? documentWidth : window.innerWidth,
    height: mode === "full-page" ? documentHeight : window.innerHeight,
    scrollX: mode === "full-page" ? 0 : window.scrollX,
    scrollY: mode === "full-page" ? 0 : window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1
  };
  const selectors = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[role='heading']",
    "[role='tab']",
    "[role='menuitem']",
    "[role='alert']",
    "[role='status']",
    "label",
    "p",
    "li",
    "th",
    "td",
    "main",
    "article",
    "section",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "fieldset",
    "[class*='card' i]",
    "[class*='tile' i]",
    "[class*='panel' i]",
    "[class*='section' i]",
    "[class*='hero' i]",
    "[class*='block' i]",
    "[class*='container' i]",
    "[class*='content' i]",
    "[class*='grid' i]",
    "[class*='row' i]",
    "[class*='column' i]",
    "[class*='toolbar' i]",
    "[class*='sidebar' i]",
    "[class*='modal' i]",
    "[class*='dialog' i]",
    "[class*='badge' i]",
    "[class*='pill' i]",
    "[class*='alert' i]",
    "[class*='error' i]",
    "[class*='status' i]"
  ];

  function selectorFor(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const tag = element.tagName.toLowerCase();
    const classNames = Array.from(element.classList || [])
      .slice(0, 2)
      .map((name) => `.${CSS.escape(name)}`)
      .join("");
    return `${tag}${classNames}`;
  }

  function componentTypeFor(element, role, selector) {
    const tag = element.tagName.toLowerCase();
    const text = `${selector} ${role} ${tag}`.toLowerCase();
    if (/^h[1-6]$/.test(tag) || role === "heading") return "heading";
    if (tag === "button" || role === "button" || /\b(btn|button|cta)\b/.test(text)) return "button";
    if (tag === "a" || role === "link") return "link";
    if (/\b(card|tile|panel|modal|dialog)\b/.test(text)) return "card";
    if (/\b(alert|error)\b/.test(text)) return "error";
    if (/\b(status|badge|pill|tag)\b/.test(text)) return "status";
    if (
      /^(main|article|section|nav|header|footer|aside|form|fieldset)$/.test(tag) ||
      /\b(section|hero|block|container|content|grid|row|column|toolbar|sidebar)\b/.test(text)
    ) {
      return "region";
    }
    return "";
  }

  function isVisible(rect, style) {
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    if (rect.width < 4 || rect.height < 4) return false;
    if (mode === "full-page") return true;
    if (rect.right < 0 || rect.bottom < 0 || rect.left > viewport.width || rect.top > viewport.height) return false;
    return true;
  }

  function alphaForColour(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text || text === "transparent") return 0;
    const match = text.match(/^rgba?\(([^)]+)\)$/i);
    if (!match) return 1;
    const parts = match[1].split(",").map((part) => part.trim());
    return parts.length >= 4 ? Number(parts[3]) || 0 : 1;
  }

  function isTransparentColour(value) {
    return alphaForColour(value) <= 0.02;
  }

  function effectiveBackgroundColor(element, style) {
    let current = element;
    while (current instanceof HTMLElement) {
      const currentStyle = current === element ? style : window.getComputedStyle(current);
      const backgroundColor = currentStyle.backgroundColor || "";
      if (backgroundColor && !isTransparentColour(backgroundColor)) {
        return backgroundColor;
      }
      current = current.parentElement;
    }
    const bodyBackground = window.getComputedStyle(document.body || document.documentElement).backgroundColor;
    return bodyBackground && !isTransparentColour(bodyBackground) ? bodyBackground : "rgb(255, 255, 255)";
  }

  const seen = new Set();
  const elements = [];
  document.querySelectorAll(selectors.join(",")).forEach((element) => {
    if (!(element instanceof HTMLElement) || seen.has(element)) return;
    seen.add(element);
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (!isVisible(rect, style)) return;
    const selector = selectorFor(element);
    const role = element.getAttribute("role") || "";
    const text = String(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const type = componentTypeFor(element, role, selector);
    if (!text && !type) return;
    const backgroundColor = effectiveBackgroundColor(element, style);
    const viewportBounds =
      mode === "full-page"
        ? {
            x: Math.round(rect.left + window.scrollX),
            y: Math.round(rect.top + window.scrollY),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        : {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
    elements.push({
      selector,
      tagName: element.tagName.toLowerCase(),
      role,
      type,
      text,
      bounds: viewportBounds,
      computedStyle: {
        color: style.color,
        backgroundColor,
        ownBackgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight
      },
      interactive: Boolean(
        element.matches("button,a[href],input,select,textarea,[role='button'],[role='link'],[role='tab'],[role='menuitem']")
      ),
      headingLevel: /^h[1-6]$/i.test(element.tagName) ? Number(element.tagName.slice(1)) : Number(element.getAttribute("aria-level") || 0)
    });
  });

  return {
    source: mode === "full-page" ? "sidepanel-full-page-dom" : "sidepanel-live-dom",
    mode,
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    viewport,
    elements: elements.slice(0, mode === "full-page" ? 450 : 180)
  };
}

export async function collectLiveReviewMetrics(tabId) {
  if (!Number.isFinite(tabId) || !chrome?.scripting?.executeScript) {
    throw new Error("Live review metrics require scripting access to the active tab.");
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectReviewMetricsInPage,
    args: [{ mode: "visible-view" }]
  });
  return result?.result || null;
}

export async function collectFullPageReviewMetrics(tabId) {
  if (!Number.isFinite(tabId) || !chrome?.scripting?.executeScript) {
    throw new Error("Full-page review metrics require scripting access to the active tab.");
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectReviewMetricsInPage,
    args: [{ mode: "full-page" }]
  });
  return result?.result || null;
}

export async function captureVisibleViewForReview(tab) {
  if (!Number.isFinite(tab?.id)) {
    throw new Error("Open the page you want to review, then try again.");
  }
  await chrome.tabs.update(tab.id, { active: true }).catch(() => null);
  const metrics = await collectLiveReviewMetrics(tab.id);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const blob = await dataUrlToBlob(dataUrl);
  const image = await imageSizeFromBlob(blob);
  return {
    tab,
    dataUrl,
    blob,
    image,
    viewport: metrics?.viewport || {
      width: image.width,
      height: image.height,
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1
    },
    metrics: {
      ...(metrics || {}),
      image,
      imageMetrics: {
        ...image,
        sizeBytes: blob.size,
        mimeType: blob.type || "image/png"
      }
    }
  };
}
