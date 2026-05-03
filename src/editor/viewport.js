function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRect(rect = {}) {
  const x1 = Number(rect.x) || 0;
  const y1 = Number(rect.y) || 0;
  const x2 = x1 + (Number(rect.width) || 0);
  const y2 = y1 + (Number(rect.height) || 0);
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

export class EditorViewport {
  constructor({ canvas, getZoom = () => 1, getPan = () => ({ x: 0, y: 0 }) }) {
    this.canvas = canvas;
    this.getZoom = getZoom;
    this.getPan = getPan;
  }

  getCanvasRect() {
    return this.canvas.getBoundingClientRect();
  }

  getDevicePixelRatio() {
    return window.devicePixelRatio || 1;
  }

  getCurrentTransform() {
    const zoom = Number(this.getZoom?.() || 1) || 1;
    const panRaw = this.getPan?.() || { x: 0, y: 0 };
    const pan = {
      x: Number(panRaw.x || 0),
      y: Number(panRaw.y || 0)
    };
    return { zoom, pan };
  }

  getInverseTransform() {
    const { zoom, pan } = this.getCurrentTransform();
    return {
      zoom: zoom === 0 ? 1 : 1 / zoom,
      pan: {
        x: -pan.x,
        y: -pan.y
      }
    };
  }

  viewportPointToCanvasPoint(clientX, clientY) {
    const rect = this.getCanvasRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const scaleX = this.canvas.width / width;
    const scaleY = this.canvas.height / height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  canvasPointToImagePoint(x, y) {
    const { pan } = this.getCurrentTransform();
    return {
      x: Number(x) - pan.x,
      y: Number(y) - pan.y
    };
  }

  imagePointToCanvasPoint(x, y) {
    const { pan } = this.getCurrentTransform();
    return {
      x: Number(x) + pan.x,
      y: Number(y) + pan.y
    };
  }

  viewportPointToImagePoint(clientX, clientY) {
    const canvasPoint = this.viewportPointToCanvasPoint(clientX, clientY);
    return this.canvasPointToImagePoint(canvasPoint.x, canvasPoint.y);
  }

  clampImagePoint(point) {
    return {
      x: clamp(Number(point.x || 0), 0, Math.max(0, this.canvas.width)),
      y: clamp(Number(point.y || 0), 0, Math.max(0, this.canvas.height))
    };
  }

  clampRectToImage(rect) {
    const normalized = normalizeRect(rect);
    const x = clamp(normalized.x, 0, this.canvas.width);
    const y = clamp(normalized.y, 0, this.canvas.height);
    const width = clamp(normalized.width, 0, this.canvas.width - x);
    const height = clamp(normalized.height, 0, this.canvas.height - y);
    return { x, y, width, height };
  }

  normalizeRect(rect) {
    return normalizeRect(rect);
  }

  scaleRect(rect, scale = 1) {
    const safeScale = Number(scale) || 1;
    return {
      x: Number(rect.x || 0) * safeScale,
      y: Number(rect.y || 0) * safeScale,
      width: Math.max(0, Number(rect.width || 0) * safeScale),
      height: Math.max(0, Number(rect.height || 0) * safeScale)
    };
  }

  hitTestHandle(point, rect, handleSize = 12) {
    const normalized = this.normalizeRect(rect);
    const half = handleSize / 2;
    const midX = normalized.x + normalized.width / 2;
    const midY = normalized.y + normalized.height / 2;
    const handles = {
      nw: { x: normalized.x - half, y: normalized.y - half, size: handleSize },
      n: { x: midX - half, y: normalized.y - half, size: handleSize },
      ne: { x: normalized.x + normalized.width - half, y: normalized.y - half, size: handleSize },
      e: { x: normalized.x + normalized.width - half, y: midY - half, size: handleSize },
      se: { x: normalized.x + normalized.width - half, y: normalized.y + normalized.height - half, size: handleSize },
      s: { x: midX - half, y: normalized.y + normalized.height - half, size: handleSize },
      sw: { x: normalized.x - half, y: normalized.y + normalized.height - half, size: handleSize },
      w: { x: normalized.x - half, y: midY - half, size: handleSize }
    };

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
}
