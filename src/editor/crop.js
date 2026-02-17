const HANDLE_SIZE = 10;
const MIN_SIZE = 24;
const HANDLE_RADIUS = 4.5;

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
  const radius = HANDLE_RADIUS / zoom;
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

export class CropTool {
  constructor({ canvas, getImageBitmap, setImageBitmap, onChange }) {
    this.canvas = canvas;
    this.getImageBitmap = getImageBitmap;
    this.setImageBitmap = setImageBitmap;
    this.onChange = onChange || (() => {});
    this.active = false;
    this.rect = null;
    this.dragMode = null;
    this.dragStart = null;
    this.zoom = 1;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  enable() {
    if (this.active) return;
    this.active = true;
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.onChange(this.rect);
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    this.rect = null;
    this.dragMode = null;
    this.dragStart = null;
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.onChange(this.rect);
  }

  setZoom(value) {
    this.zoom = value || 1;
  }

  drawOverlay(ctx) {
    if (!this.rect) return;

    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 24, 0.55)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.clearRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.95)";
    ctx.lineWidth = 1.5 / this.zoom;
    ctx.setLineDash([6 / this.zoom, 4 / this.zoom]);
    ctx.strokeRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
    ctx.setLineDash([]);

    const handles = makeHandles(this.rect);
    const radius = HANDLE_RADIUS / this.zoom;
    ctx.fillStyle = "#3b82f6";
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 1 / this.zoom;

    Object.values(handles).forEach((handle) => {
      const cx = handle.x + handle.size / 2;
      const cy = handle.y + handle.size / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();
  }

  async applyCrop({ devicePixelRatio = window.devicePixelRatio || 1 } = {}) {
    if (!this.rect) return null;

    const bitmap = this.getImageBitmap();
    if (!bitmap) return null;

    const sourceX = Math.round(this.rect.x * devicePixelRatio);
    const sourceY = Math.round(this.rect.y * devicePixelRatio);
    const sourceW = Math.round(this.rect.width * devicePixelRatio);
    const sourceH = Math.round(this.rect.height * devicePixelRatio);

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

    if (!this.rect) {
      this.rect = { x: point.x, y: point.y, width: 0, height: 0 };
      this.dragMode = "create";
      this.dragStart = point;
      this.onChange(this.rect);
      return;
    }

    const handle = handleHit(point, this.rect, this.zoom);
    if (handle) {
      this.dragMode = handle;
      this.dragStart = point;
      return;
    }

    if (pointInRect(point, this.rect)) {
      this.dragMode = "move";
      this.dragStart = point;
    }
  }

  handlePointerMove(event) {
    if (!this.active || !this.dragMode || !this.rect) return;
    const point = this.getPoint(event);

    if (this.dragMode === "create") {
      this.rect = this.normalizeRect(this.dragStart, point);
      this.onChange(this.rect);
      return;
    }

    if (this.dragMode === "move") {
      const dx = point.x - this.dragStart.x;
      const dy = point.y - this.dragStart.y;
      this.rect.x = clamp(this.rect.x + dx, 0, this.canvas.width - this.rect.width);
      this.rect.y = clamp(this.rect.y + dy, 0, this.canvas.height - this.rect.height);
      this.dragStart = point;
      this.onChange(this.rect);
      return;
    }

    this.resizeRect(point);
    this.onChange(this.rect);
  }

  handlePointerUp() {
    if (!this.active) return;
    this.dragMode = null;
    this.dragStart = null;
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
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }
}
