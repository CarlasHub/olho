const MIN_SIZE = 50;
const BASE_HANDLE_SIZE = 12;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function cursorForHandle(handle) {
  const cursors = {
    nw: "nwse-resize",
    se: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize"
  };
  return cursors[handle] || "nwse-resize";
}

function getEditorColor(canvas, token, fallback) {
  if (typeof getComputedStyle !== "function") {
    return fallback;
  }
  const value = getComputedStyle(canvas).getPropertyValue(token).trim();
  return value || fallback;
}

export class ResizeTool {
  constructor({ canvas, viewport, onChange, onSizeChange }) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.onChange = onChange || (() => {});
    this.onSizeChange = onSizeChange || (() => {});
    this.active = false;
    this.dragMode = null;
    this.dragStart = null;
    this.startSize = null;
    this.lockRatio = true;
    this.zoom = 1;
    this.pointerId = null;
    this.previewSnapshot = null;
    this.size = { width: canvas.width, height: canvas.height };

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleWindowPointerMove = this.handleWindowPointerMove.bind(this);
    this.handleWindowPointerUp = this.handleWindowPointerUp.bind(this);
    this.handleWindowPointerCancel = this.handleWindowPointerCancel.bind(this);
  }

  enable() {
    if (this.active) return;
    this.active = true;
    this.size = { width: this.canvas.width, height: this.canvas.height };
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    window.addEventListener("pointermove", this.handleWindowPointerMove);
    window.addEventListener("pointerup", this.handleWindowPointerUp);
    window.addEventListener("pointercancel", this.handleWindowPointerCancel);
    this.canvas.style.cursor = "";
    this.onChange();
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    this.dragMode = null;
    this.dragStart = null;
    this.startSize = null;
    this.previewSnapshot = null;
    this.pointerId = null;
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    window.removeEventListener("pointermove", this.handleWindowPointerMove);
    window.removeEventListener("pointerup", this.handleWindowPointerUp);
    window.removeEventListener("pointercancel", this.handleWindowPointerCancel);
    this.canvas.style.cursor = "";
    this.onChange();
  }

  cancelActiveDrag() {
    if (!this.active || !this.dragMode) return;
    if (this.previewSnapshot) {
      this.size = { ...this.previewSnapshot };
      this.onSizeChange(this.size);
      this.onChange();
    }
    this.dragMode = null;
    this.dragStart = null;
    this.startSize = null;
    this.previewSnapshot = null;
    this.pointerId = null;
    this.canvas.style.cursor = "";
  }

  setZoom(value) {
    this.zoom = value || 1;
  }

  setLockRatio(value) {
    this.lockRatio = Boolean(value);
  }

  setSize(width, height) {
    this.size = {
      width: clamp(Math.round(width), MIN_SIZE, 10000),
      height: clamp(Math.round(height), MIN_SIZE, 10000)
    };
    this.onSizeChange(this.size);
    this.onChange();
  }

  getSize() {
    return { ...this.size };
  }

  drawOverlay(ctx) {
    if (!this.active) return;

    const rect = { x: 0, y: 0, width: this.size.width, height: this.size.height };
    const handleSize = BASE_HANDLE_SIZE / Math.max(0.001, this.zoom);
    const handles = this.getHandles(rect, handleSize);
    const resizeLineShadow = getEditorColor(this.canvas, "--editor-handle-border", "#020617");
    const resizeLine = getEditorColor(this.canvas, "--editor-resize-line", "#67e8f9");
    const handleFill = getEditorColor(this.canvas, "--editor-handle", "#f8fafc");
    const handleBorder = getEditorColor(this.canvas, "--editor-handle-border", "#020617");
    const badgeBg = getEditorColor(this.canvas, "--editor-bg-workspace", "rgba(6, 10, 16, 0.92)");
    const badgeStroke = getEditorColor(this.canvas, "--editor-border-strong", "rgba(248, 251, 255, 0.82)");
    const badgeTextColor = getEditorColor(this.canvas, "--editor-text-primary", "#f8fafc");

    ctx.save();
    ctx.strokeStyle = resizeLineShadow;
    ctx.lineWidth = 4 / Math.max(0.001, this.zoom);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = resizeLine;
    ctx.lineWidth = 2 / Math.max(0.001, this.zoom);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    ctx.fillStyle = handleFill;
    ctx.strokeStyle = handleBorder;
    ctx.lineWidth = 1.1 / Math.max(0.001, this.zoom);

    Object.values(handles).forEach((handle) => {
      ctx.fillRect(handle.x, handle.y, handle.size, handle.size);
      ctx.strokeRect(handle.x, handle.y, handle.size, handle.size);
    });

    const badgeText = `${Math.round(this.size.width)} x ${Math.round(this.size.height)}`;
    ctx.font = `${Math.max(11, 12 / Math.max(0.001, this.zoom))}px system-ui, sans-serif`;
    const padX = 7 / Math.max(0.001, this.zoom);
    const badgeH = 20 / Math.max(0.001, this.zoom);
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = textWidth + padX * 2;
    const badgeX = 4 / Math.max(0.001, this.zoom);
    const badgeY = 4 / Math.max(0.001, this.zoom);
    ctx.fillStyle = badgeBg;
    ctx.strokeStyle = badgeStroke;
    ctx.lineWidth = 1 / Math.max(0.001, this.zoom);
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
    ctx.fillStyle = badgeTextColor;
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, badgeX + padX, badgeY + badgeH / 2);

    ctx.restore();
  }

  handlePointerDown(event) {
    if (!this.active) return;
    const point = this.getPoint(event);
    const rect = { x: 0, y: 0, width: this.size.width, height: this.size.height };
    const handle = this.handleHit(point, rect);

    this.pointerId = event.pointerId;
    if (typeof this.canvas.setPointerCapture === "function") {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // Best effort only.
      }
    }

    if (handle) {
      this.dragMode = handle;
      this.dragStart = point;
      this.startSize = { ...this.size };
      this.previewSnapshot = { ...this.size };
      this.canvas.style.cursor = cursorForHandle(handle);
      return;
    }

    if (pointInRect(point, rect)) {
      this.dragMode = "se";
      this.dragStart = point;
      this.startSize = { ...this.size };
      this.previewSnapshot = { ...this.size };
      this.canvas.style.cursor = "nwse-resize";
    }
  }

  handlePointerMove(event) {
    if (!this.active) return;
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    if (event.cancelable) {
      event.preventDefault();
    }
    const point = this.getPoint(event);
    const rect = { x: 0, y: 0, width: this.size.width, height: this.size.height };

    if (!this.dragMode || !this.startSize) {
      const handle = this.handleHit(point, rect);
      if (handle) {
        this.canvas.style.cursor = cursorForHandle(handle);
      } else if (pointInRect(point, rect)) {
        this.canvas.style.cursor = "nwse-resize";
      } else {
        this.canvas.style.cursor = "";
      }
      return;
    }

    const dx = point.x - this.dragStart.x;
    const dy = point.y - this.dragStart.y;

    let nextWidth = this.startSize.width;
    let nextHeight = this.startSize.height;

    if (this.dragMode.includes("e")) {
      nextWidth = this.startSize.width + dx;
    }
    if (this.dragMode.includes("w")) {
      nextWidth = this.startSize.width - dx;
    }
    if (this.dragMode.includes("s")) {
      nextHeight = this.startSize.height + dy;
    }
    if (this.dragMode.includes("n")) {
      nextHeight = this.startSize.height - dy;
    }

    nextWidth = clamp(nextWidth, MIN_SIZE, 10000);
    nextHeight = clamp(nextHeight, MIN_SIZE, 10000);

    if (this.lockRatio) {
      const ratio = this.startSize.width / Math.max(1, this.startSize.height);
      if (this.dragMode === "n" || this.dragMode === "s") {
        nextWidth = clamp(nextHeight * ratio, MIN_SIZE, 10000);
      } else if (this.dragMode === "e" || this.dragMode === "w") {
        nextHeight = clamp(nextWidth / ratio, MIN_SIZE, 10000);
      } else {
        const candidateH = nextWidth / ratio;
        if (Math.abs(dy) > Math.abs(dx)) {
          nextWidth = nextHeight * ratio;
        } else {
          nextHeight = candidateH;
        }
      }
    }

    this.size = {
      width: Math.round(nextWidth),
      height: Math.round(nextHeight)
    };
    this.canvas.style.cursor = cursorForHandle(this.dragMode);
    this.onSizeChange(this.size);
    this.onChange();
  }

  handlePointerUp(event) {
    if (!this.active) return;
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    if (event.cancelable) {
      event.preventDefault();
    }
    this.dragMode = null;
    this.dragStart = null;
    this.startSize = null;
    this.previewSnapshot = null;
    this.canvas.style.cursor = "";

    if (typeof this.canvas.releasePointerCapture === "function") {
      try {
        this.canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Best effort only.
      }
    }
    this.pointerId = null;
  }

  handlePointerCancel(event) {
    if (!this.active) return;
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    if (event.cancelable) {
      event.preventDefault();
    }
    this.cancelActiveDrag();
    if (typeof this.canvas.releasePointerCapture === "function") {
      try {
        this.canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Best effort only.
      }
    }
  }

  handleWindowPointerMove(event) {
    if (!this.active || this.pointerId === null) return;
    if (event.pointerId !== this.pointerId) return;
    this.handlePointerMove(event);
  }

  handleWindowPointerUp(event) {
    if (!this.active || this.pointerId === null) return;
    if (event.pointerId !== this.pointerId) return;
    this.handlePointerUp(event);
  }

  handleWindowPointerCancel(event) {
    if (!this.active || this.pointerId === null) return;
    if (event.pointerId !== this.pointerId) return;
    this.handlePointerCancel(event);
  }

  handleHit(point, rect) {
    const handleSize = BASE_HANDLE_SIZE / Math.max(0.001, this.zoom);
    const handles = this.getHandles(rect, handleSize);
    for (const [key, handle] of Object.entries(handles)) {
      if (
        point.x >= handle.x &&
        point.x <= handle.x + handle.size &&
        point.y >= handle.y &&
        point.y <= handle.y + handle.size
      ) {
        return key;
      }
    }
    return null;
  }

  getHandles(rect, size) {
    const half = size / 2;
    const handles = {
      nw: { x: rect.x - half, y: rect.y - half, size },
      ne: { x: rect.x + rect.width - half, y: rect.y - half, size },
      sw: { x: rect.x - half, y: rect.y + rect.height - half, size },
      se: { x: rect.x + rect.width - half, y: rect.y + rect.height - half, size }
    };
    if (!this.lockRatio) {
      handles.n = { x: rect.x + rect.width / 2 - half, y: rect.y - half, size };
      handles.s = { x: rect.x + rect.width / 2 - half, y: rect.y + rect.height - half, size };
      handles.e = { x: rect.x + rect.width - half, y: rect.y + rect.height / 2 - half, size };
      handles.w = { x: rect.x - half, y: rect.y + rect.height / 2 - half, size };
    }
    return handles;
  }

  getPoint(event) {
    if (this.viewport && typeof this.viewport.viewportPointToImagePoint === "function") {
      return this.viewport.viewportPointToImagePoint(event.clientX, event.clientY);
    }

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / Math.max(1, rect.width);
    const scaleY = this.canvas.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }
}
