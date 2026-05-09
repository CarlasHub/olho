(function installOlhoOverlayMarkerLayer() {
  if (window.__olhoOverlayMarkerLayer) return;

  const ROOT_ID = "olho-live-review-overlay-root";
  let selectedMarkerId = "";
  let currentMarkers = [];

  function viewportSize() {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-olho-live-review", "true");
    document.documentElement.append(root);
    return root;
  }

  function sizeRoot(root) {
    const size = viewportSize();
    root.style.width = `${size.width}px`;
    root.style.height = `${size.height}px`;
  }

  function toViewportRect(markerData) {
    const rect = markerData.rect || {};
    const coordinateSpace = markerData.coordinateSpace || "page";
    const x = Number(rect.x || 0);
    const y = Number(rect.y || 0);
    const width = Math.max(18, Number(rect.width || 0));
    const height = Math.max(18, Number(rect.height || 0));

    if (coordinateSpace === "viewport") {
      return { x, y, width, height };
    }

    return {
      x: x - Number(window.scrollX || 0),
      y: y - Number(window.scrollY || 0),
      width,
      height
    };
  }

  function toViewportPoint(markerData, fallbackRect) {
    const anchor = markerData.anchor || {};
    const x = Number.isFinite(Number(anchor.x)) ? Number(anchor.x) : fallbackRect.x + Math.max(8, fallbackRect.width / 2);
    const y = Number.isFinite(Number(anchor.y)) ? Number(anchor.y) : fallbackRect.y + Math.max(8, fallbackRect.height / 2);
    if ((markerData.coordinateSpace || "page") === "viewport") {
      return { x, y };
    }
    return {
      x: x - Number(window.scrollX || 0),
      y: y - Number(window.scrollY || 0)
    };
  }

  function markerVisibleInViewport(rect) {
    return rect.x + rect.width >= -64 && rect.y + rect.height >= -64 && rect.x <= window.innerWidth + 64 && rect.y <= window.innerHeight + 64;
  }

  function clearPopover(root) {
    root.querySelectorAll(".olho-live-popover").forEach((node) => node.remove());
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function positionPopoverNearMarker(popover, marker) {
    const markerRect = marker.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 10;
    const width = popover.offsetWidth || 320;
    const height = popover.offsetHeight || 160;
    const hasRightSpace = markerRect.right + gap + width <= window.innerWidth - viewportPadding;
    const hasLeftSpace = markerRect.left - gap - width >= viewportPadding;
    const hasBottomSpace = markerRect.bottom + gap + height <= window.innerHeight - viewportPadding;

    let left;
    let top;
    if (hasRightSpace) {
      left = markerRect.right + gap;
      top = markerRect.top + markerRect.height / 2 - height / 2;
    } else if (hasLeftSpace) {
      left = markerRect.left - gap - width;
      top = markerRect.top + markerRect.height / 2 - height / 2;
    } else if (hasBottomSpace) {
      left = markerRect.left + markerRect.width / 2 - width / 2;
      top = markerRect.bottom + gap;
    } else {
      left = markerRect.left + markerRect.width / 2 - width / 2;
      top = markerRect.top - gap - height;
    }

    popover.style.left = `${clamp(left, viewportPadding, window.innerWidth - width - viewportPadding)}px`;
    popover.style.top = `${clamp(top, viewportPadding, window.innerHeight - height - viewportPadding)}px`;
  }

  function markerById(root, findingId) {
    return Array.from(root.querySelectorAll("[data-olho-marker-id]")).find(
      (node) => node.dataset.olhoMarkerId === findingId
    );
  }

  function markerDataById(findingId) {
    return currentMarkers.find((marker) => String(marker.id || "") === String(findingId || "")) || null;
  }

  function clearSelectedRegion(root) {
    root.querySelectorAll(".olho-live-region").forEach((node) => node.remove());
  }

  function renderSelectedRegion(root, markerData) {
    clearSelectedRegion(root);
    if (!markerData) return;
    const rect = toViewportRect(markerData);
    if (!markerVisibleInViewport(rect)) return;
    const highlight = document.createElement("div");
    highlight.className = `olho-live-region is-selected severity-${markerData.severity || "medium"} marker-${
      markerData.markerType || "component-group"
    }`;
    highlight.style.left = `${Number(rect.x || 0)}px`;
    highlight.style.top = `${Number(rect.y || 0)}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    highlight.dataset.olhoMarkerId = markerData.id;
    root.prepend(highlight);
  }

  function selectMarker(findingId) {
    const root = ensureRoot();
    selectedMarkerId = String(findingId || "");
    root.querySelectorAll("[data-olho-marker-id]").forEach((node) => {
      const active = node.dataset.olhoMarkerId === selectedMarkerId;
      node.classList.toggle("is-selected", active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
    renderSelectedRegion(root, markerDataById(selectedMarkerId));
    const marker = selectedMarkerId ? markerById(root, selectedMarkerId) : null;
    if (marker instanceof HTMLElement) {
      marker.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      marker.focus({ preventScroll: true });
    }
  }

  function showPopover(marker, markerData) {
    const root = ensureRoot();
    clearPopover(root);
    const popover = document.createElement("div");
    popover.className = `olho-live-popover marker-${markerData.markerType || "component-group"}`;
    popover.tabIndex = -1;
    const title = document.createElement("strong");
    title.textContent = markerData.issue || "Review finding";
    const meta = document.createElement("p");
    meta.className = "olho-live-popover-meta";
    meta.textContent = `${markerData.severity || "medium"} | ${markerData.category || "review"} | ${Math.round(
      Number(markerData.confidence || 0) * 100
    )}% confidence | ${markerData.source || "rule-engine"}`;
    const fields = [
      ["Evidence", markerData.evidence || "Evidence is available in the side panel."],
      ["Impact", markerData.impact || ""],
      ["Recommendation", markerData.recommendation || ""]
    ];
    popover.append(title, meta);
    fields.forEach(([label, text]) => {
      if (!text) return;
      const paragraph = document.createElement("p");
      const span = document.createElement("span");
      span.textContent = `${label}: `;
      paragraph.append(span, document.createTextNode(text));
      popover.append(paragraph);
    });
    popover.style.left = "12px";
    popover.style.top = "12px";
    root.append(popover);
    positionPopoverNearMarker(popover, marker);
    popover.focus({ preventScroll: true });
  }

  function notifyMarkerSelected(findingId) {
    try {
      chrome.runtime.sendMessage({
        type: "olho_live_review_marker_selected",
        source: "olho-live-review-overlay",
        payload: { findingId }
      });
    } catch {
      // The side panel may not be listening anymore.
    }
  }

  function createMarker(markerData) {
    const rect = toViewportRect(markerData);
    if (!markerVisibleInViewport(rect)) return [];
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = `olho-live-marker severity-${markerData.severity || "medium"} marker-${
      markerData.markerType || "component-group"
    }`;
    pin.textContent = String(markerData.number || "");
    const anchor = toViewportPoint(markerData, rect);
    pin.style.left = `${anchor.x}px`;
    pin.style.top = `${anchor.y}px`;
    pin.dataset.olhoMarkerId = markerData.id;
    pin.setAttribute("aria-label", markerData.label || `Review finding ${markerData.number || ""}`);
    pin.setAttribute("aria-pressed", "false");
    pin.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectMarker(markerData.id);
      showPopover(pin, markerData);
      notifyMarkerSelected(markerData.id);
    });
    return [pin];
  }

  function renderMarkers(markers = []) {
    const root = ensureRoot();
    currentMarkers = Array.isArray(markers) ? markers : [];
    sizeRoot(root);
    root.innerHTML = "";
    clearPopover(root);
    currentMarkers.forEach((markerData) => {
      const nodes = createMarker(markerData);
      root.append(...nodes);
    });
    if (selectedMarkerId) selectMarker(selectedMarkerId);
  }

  function clearMarkers() {
    const root = document.getElementById(ROOT_ID);
    selectedMarkerId = "";
    currentMarkers = [];
    if (root) root.remove();
  }

  function reflowMarkers() {
    const root = document.getElementById(ROOT_ID);
    if (!root || !currentMarkers.length) return;
    renderMarkers(currentMarkers);
  }

  window.__olhoOverlayMarkerLayer = {
    renderMarkers,
    clearMarkers,
    selectMarker,
    sizeRoot
  };

  window.addEventListener("resize", () => {
    reflowMarkers();
  });

  window.addEventListener("scroll", reflowMarkers, { passive: true });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    clearPopover(root);
    selectMarker("");
  });
})();
