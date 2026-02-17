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

export class ResizeTool {
  constructor({ canvas, onChange, onSizeChange }) {
    this.canvas = canvas;
    this.onChange = onChange || (() => {});
    this.onSizeChange = onSizeChange || (() => {});
    this.active = false;
    this.dragMode = null;
    this.dragStart = null;
    this.startSize = null;
    this.lockRatio = true;
    this.zoom = 1;
    this.size = { width: canvas.width, height: canvas.height };

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  enable() {
    if (this.active) return;
    this.active = true;
    this.size = { width: this.canvas.width, height: this.canvas.height };
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.onChange();
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    this.dragMode = null;
    this.dragStart = null;
    this.startSize = null;
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.onChange();
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
    const handleSize = BASE_HANDLE_SIZE / this.zoom;
    const handles = this.getHandles(rect, handleSize);

    ctx.save();
    ctx.strokeStyle = "rgba(91, 108, 255, 0.9)";
    ctx.lineWidth = 2 / this.zoom;
    ctx.setLineDash([6 / this.zoom, 4 / this.zoom]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.setLineDash([]);

    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#1e1b4b";
    ctx.lineWidth = 1 / this.zoom;

    Object.values(handles).forEach((handle) => {
      ctx.fillRect(handle.x, handle.y, handle.size, handle.size);
      ctx.strokeRect(handle.x, handle.y, handle.size, handle.size);
    });

    ctx.restore();
  }

  handlePointerDown(event) {
    if (!this.active) return;
    const point = this.getPoint(event);
    const rect = { x: 0, y: 0, width: this.size.width, height: this.size.height };
    const handle = this.handleHit(point, rect);

    if (handle) {
      this.dragMode = handle;
      this.dragStart = point;
      this.startSize = { ...this.size };
      return;
    }

    if (pointInRect(point, rect)) {
      this.dragMode = "se";
      this.dragStart = point;
      this.startSize = { ...this.size };
    }
  }

  handlePointerMove(event) {
    if (!this.active || !this.dragMode || !this.startSize) return;
    const point = this.getPoint(event);
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
      const ratio = this.startSize.width / this.startSize.height;
      if (this.dragMode === "n" || this.dragMode === "s") {
        nextWidth = clamp(nextHeight * ratio, MIN_SIZE, 10000);
      } else if (this.dragMode === "e" || this.dragMode === "w") {
        nextHeight = clamp(nextWidth / ratio, MIN_SIZE, 10000);
      } else {
        nextHeight = clamp(nextWidth / ratio, MIN_SIZE, 10000);
      }
    }

    this.size = {
      width: Math.round(nextWidth),
      height: Math.round(nextHeight)
    };
    this.onSizeChange(this.size);
    this.onChange();
  }

  handlePointerUp() {
    if (!this.active) return;
    this.dragMode = null;
    this.dragStart = null;
    this.startSize = null;
  }

  handleHit(point, rect) {
    const handleSize = BASE_HANDLE_SIZE / this.zoom;
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
    return {
      nw: { x: rect.x - half, y: rect.y - half, size },
      ne: { x: rect.x + rect.width - half, y: rect.y - half, size },
      sw: { x: rect.x - half, y: rect.y + rect.height - half, size },
      se: { x: rect.x + rect.width - half, y: rect.y + rect.height - half, size },
      n: { x: rect.x + rect.width / 2 - half, y: rect.y - half, size },
      s: { x: rect.x + rect.width / 2 - half, y: rect.y + rect.height - half, size },
      e: { x: rect.x + rect.width - half, y: rect.y + rect.height / 2 - half, size },
      w: { x: rect.x - half, y: rect.y + rect.height / 2 - half, size }
    };
  }

  getPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }
}
