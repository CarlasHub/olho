const HANDLE_SIZE = 12;
const MIN_SIZE = 24;

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

function makeHandles(rect) {
  const { x, y, width, height } = rect;
  const half = HANDLE_SIZE / 2;
  const midX = x + width / 2;
  const midY = y + height / 2;
  return {
    nw: { x: x - half, y: y - half, size: HANDLE_SIZE },
    n: { x: midX - half, y: y - half, size: HANDLE_SIZE },
    ne: { x: x + width - half, y: y - half, size: HANDLE_SIZE },
    e: { x: x + width - half, y: midY - half, size: HANDLE_SIZE },
    se: { x: x + width - half, y: y + height - half, size: HANDLE_SIZE },
    s: { x: midX - half, y: y + height - half, size: HANDLE_SIZE },
    sw: { x: x - half, y: y + height - half, size: HANDLE_SIZE },
    w: { x: x - half, y: midY - half, size: HANDLE_SIZE }
  };
}

function handleHit(point, rect, zoom = 1) {
  const handles = makeHandles(rect);
  const radius = (HANDLE_SIZE * 0.65) / Math.max(0.001, zoom);
  for (const [key, handle] of Object.entries(handles)) {
    const cx = handle.x + handle.size / 2;
    const cy = handle.y + handle.size / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    if (dx * dx + dy * dy <= radius * radius) {
      return key;
    }
  }
  return null;
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
  return cursors[handle] || "crosshair";
}

export class CropTool {
  constructor({ canvas, viewport, getImageBitmap, setImageBitmap, onChange }) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.getImageBitmap = getImageBitmap;
    this.setImageBitmap = setImageBitmap;
    this.onChange = onChange || (() => {});
    this.active = false;
    this.rect = null;
    this.dragMode = null;
    this.dragStart = null;
    this.pointerId = null;
    this.zoom = 1;
    this.dragSnapshot = null;

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
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    window.addEventListener("pointermove", this.handleWindowPointerMove);
    window.addEventListener("pointerup", this.handleWindowPointerUp);
    window.addEventListener("pointercancel", this.handleWindowPointerCancel);
    this.canvas.style.cursor = "crosshair";
    this.onChange(this.rect);
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    this.rect = null;
    this.dragMode = null;
    this.dragStart = null;
    this.dragSnapshot = null;
    this.pointerId = null;
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    window.removeEventListener("pointermove", this.handleWindowPointerMove);
    window.removeEventListener("pointerup", this.handleWindowPointerUp);
    window.removeEventListener("pointercancel", this.handleWindowPointerCancel);
    this.canvas.style.cursor = "";
    this.onChange(this.rect);
  }

  cancelActiveDrag() {
    if (!this.active || !this.dragMode) return;
    if (this.dragSnapshot) {
      this.rect = { ...this.dragSnapshot };
      this.onChange(this.rect);
    }
    this.dragMode = null;
    this.dragStart = null;
    this.dragSnapshot = null;
    this.pointerId = null;
    this.canvas.style.cursor = this.rect ? "crosshair" : "";
  }

  setZoom(value) {
    this.zoom = value || 1;
  }

  drawOverlay(ctx) {
    if (!this.rect) return;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.clearRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "#f8fbff";
    ctx.lineWidth = 2 / Math.max(0.001, this.zoom);
    ctx.strokeRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);

    const handles = makeHandles(this.rect);
    const size = HANDLE_SIZE / Math.max(0.001, this.zoom);
    const half = size / 2;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0c1119";
    ctx.lineWidth = 1.1 / Math.max(0.001, this.zoom);

    Object.values(handles).forEach((handle) => {
      const cx = handle.x + handle.size / 2 - half;
      const cy = handle.y + handle.size / 2 - half;
      ctx.fillRect(cx, cy, size, size);
      ctx.strokeRect(cx, cy, size, size);
    });

    const width = Math.round(this.rect.width);
    const height = Math.round(this.rect.height);
    const badgeText = `${width} x ${height}`;
    ctx.font = `${Math.max(11, 12 / Math.max(0.001, this.zoom))}px system-ui, sans-serif`;
    const padX = 7 / Math.max(0.001, this.zoom);
    const badgeH = 20 / Math.max(0.001, this.zoom);
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = textWidth + padX * 2;
    const badgeX = clamp(this.rect.x, 4 / this.zoom, this.canvas.width - badgeW - 4 / this.zoom);
    const badgeY = clamp(this.rect.y - badgeH - 6 / this.zoom, 4 / this.zoom, this.canvas.height - badgeH - 4 / this.zoom);
    ctx.fillStyle = "rgba(6, 10, 16, 0.9)";
    ctx.strokeStyle = "rgba(248, 251, 255, 0.82)";
    ctx.lineWidth = 1 / Math.max(0.001, this.zoom);
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
    ctx.fillStyle = "#f8fbff";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, badgeX + padX, badgeY + badgeH / 2);

    ctx.restore();
  }

  async applyCrop() {
    if (!this.rect) return null;

    const bitmap = this.getImageBitmap();
    if (!bitmap) return null;

    const sourceX = Math.round(this.rect.x);
    const sourceY = Math.round(this.rect.y);
    const sourceW = Math.round(this.rect.width);
    const sourceH = Math.round(this.rect.height);

    const canvas = new OffscreenCanvas(sourceW, sourceH);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);

    const cropped = await createImageBitmap(canvas);
    this.setImageBitmap(cropped);
    this.rect = null;
    this.onChange();
    return cropped;
  }

  handlePointerDown(event) {
    if (!this.active) return;

    const point = this.getPoint(event);
    this.pointerId = event.pointerId;

    if (typeof this.canvas.setPointerCapture === "function") {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // Best effort for environments where pointer capture may throw.
      }
    }

    if (!this.rect) {
      this.rect = { x: point.x, y: point.y, width: 0, height: 0 };
      this.dragMode = "create";
      this.dragStart = point;
      this.dragSnapshot = null;
      this.onChange(this.rect);
      return;
    }

    const handle = handleHit(point, this.rect, this.zoom);
    if (handle) {
      this.dragMode = handle;
      this.dragStart = point;
      this.dragSnapshot = { ...this.rect };
      this.canvas.style.cursor = cursorForHandle(handle);
      return;
    }

    if (pointInRect(point, this.rect)) {
      this.dragMode = "move";
      this.dragStart = point;
      this.dragSnapshot = { ...this.rect };
      this.canvas.style.cursor = "move";
      return;
    }

    this.dragMode = "create";
    this.dragStart = point;
    this.dragSnapshot = null;
    this.rect = { x: point.x, y: point.y, width: 0, height: 0 };
    this.onChange(this.rect);
  }

  handlePointerMove(event) {
    if (!this.active) return;
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    if (event.cancelable) {
      event.preventDefault();
    }
    const point = this.getPoint(event);

    if (!this.rect) return;

    if (!this.dragMode) {
      const handle = handleHit(point, this.rect, this.zoom);
      if (handle) {
        this.canvas.style.cursor = cursorForHandle(handle);
      } else if (pointInRect(point, this.rect)) {
        this.canvas.style.cursor = "move";
      } else {
        this.canvas.style.cursor = "crosshair";
      }
      return;
    }

    if (this.dragMode === "create") {
      this.rect = this.normalizeRect(this.dragStart, point);
      this.canvas.style.cursor = "crosshair";
      this.onChange(this.rect);
      return;
    }

    if (this.dragMode === "move") {
      const dx = point.x - this.dragStart.x;
      const dy = point.y - this.dragStart.y;
      this.rect.x = clamp(this.rect.x + dx, 0, this.canvas.width - this.rect.width);
      this.rect.y = clamp(this.rect.y + dy, 0, this.canvas.height - this.rect.height);
      this.dragStart = point;
      this.canvas.style.cursor = "move";
      this.onChange(this.rect);
      return;
    }

    this.resizeRect(point);
    this.canvas.style.cursor = cursorForHandle(this.dragMode);
    this.onChange(this.rect);
  }

  handlePointerUp(event) {
    if (!this.active) return;
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    if (event.cancelable) {
      event.preventDefault();
    }
    this.dragMode = null;
    this.dragStart = null;
    this.dragSnapshot = null;
    this.canvas.style.cursor = this.rect ? "crosshair" : "";

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

  resizeRect(point) {
    const rect = { ...this.rect };
    const minWidth = MIN_SIZE;
    const minHeight = MIN_SIZE;

    if (this.dragMode === "nw") {
      rect.width = rect.width + (rect.x - point.x);
      rect.height = rect.height + (rect.y - point.y);
      rect.x = point.x;
      rect.y = point.y;
    }

    if (this.dragMode === "ne") {
      rect.width = point.x - rect.x;
      rect.height = rect.height + (rect.y - point.y);
      rect.y = point.y;
    }

    if (this.dragMode === "sw") {
      rect.width = rect.width + (rect.x - point.x);
      rect.x = point.x;
      rect.height = point.y - rect.y;
    }

    if (this.dragMode === "se") {
      rect.width = point.x - rect.x;
      rect.height = point.y - rect.y;
    }

    if (this.dragMode === "n") {
      rect.height = rect.height + (rect.y - point.y);
      rect.y = point.y;
    }

    if (this.dragMode === "s") {
      rect.height = point.y - rect.y;
    }

    if (this.dragMode === "e") {
      rect.width = point.x - rect.x;
    }

    if (this.dragMode === "w") {
      rect.width = rect.width + (rect.x - point.x);
      rect.x = point.x;
    }

    rect.width = clamp(rect.width, minWidth, this.canvas.width - rect.x);
    rect.height = clamp(rect.height, minHeight, this.canvas.height - rect.y);
    rect.x = clamp(rect.x, 0, this.canvas.width - rect.width);
    rect.y = clamp(rect.y, 0, this.canvas.height - rect.height);

    this.rect = rect;
  }

  normalizeRect(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const width = Math.abs(a.x - b.x);
    const height = Math.abs(a.y - b.y);
    return {
      x: clamp(x, 0, this.canvas.width),
      y: clamp(y, 0, this.canvas.height),
      width: clamp(width, MIN_SIZE, this.canvas.width - x),
      height: clamp(height, MIN_SIZE, this.canvas.height - y)
    };
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
