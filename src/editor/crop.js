const HANDLE_SIZE = 10;
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
  return {
    nw: { x: x - half, y: y - half, size: HANDLE_SIZE },
    ne: { x: x + width - half, y: y - half, size: HANDLE_SIZE },
    sw: { x: x - half, y: y + height - half, size: HANDLE_SIZE },
    se: { x: x + width - half, y: y + height - half, size: HANDLE_SIZE }
  };
}

function handleHit(point, rect) {
  const handles = makeHandles(rect);
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
    this.onChange();
  }

  drawOverlay(ctx) {
    if (!this.rect) return;

    ctx.save();
    ctx.strokeStyle = "rgba(79, 70, 229, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
    ctx.setLineDash([]);

    const handles = makeHandles(this.rect);
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#1e1b4b";
    ctx.lineWidth = 1;

    Object.values(handles).forEach((handle) => {
      ctx.fillRect(handle.x, handle.y, handle.size, handle.size);
      ctx.strokeRect(handle.x, handle.y, handle.size, handle.size);
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
      this.onChange();
      return;
    }

    const handle = handleHit(point, this.rect);
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
      this.onChange();
      return;
    }

    if (this.dragMode === "move") {
      const dx = point.x - this.dragStart.x;
      const dy = point.y - this.dragStart.y;
      this.rect.x = clamp(this.rect.x + dx, 0, this.canvas.width - this.rect.width);
      this.rect.y = clamp(this.rect.y + dy, 0, this.canvas.height - this.rect.height);
      this.dragStart = point;
      this.onChange();
      return;
    }

    this.resizeRect(point);
    this.onChange();
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
