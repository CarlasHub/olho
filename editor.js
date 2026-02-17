import { CropTool } from "./src/editor/crop.js";
import { ResizeTool } from "./src/editor/resize.js";
import { createItem } from "./src/storage/storage.js";

const TOOL_TYPES = {
  DRAW: "draw",
  HIGHLIGHT: "highlight",
  RECT: "rect",
  ELLIPSE: "ellipse",
  ARROW: "arrow",
  LINE: "line",
  TEXT: "text",
  BLUR: "blur",
  ERASE: "erase",
  CROP: "crop",
  RESIZE: "resize"
};

const state = {
  tool: TOOL_TYPES.DRAW,
  color: "#ff4d4f",
  lineWidth: 4,
  blurRadius: 10,
  textSize: 28,
  fontFamily: "Space Grotesk, system-ui, sans-serif",
  zoom: 1,
  actions: [],
  redoStack: [],
  snapshots: [],
  snapshotRedo: [],
  currentAction: null,
  baseImage: null,
  baseDataUrl: null,
  baseImageCanvas: null,
  baseImageContext: null,
  pointerId: null,
  drawing: false
};

const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d");
const annotationCanvas = document.createElement("canvas");
const annotationCtx = annotationCanvas.getContext("2d");
const toast = document.getElementById("toast");
const canvasShell = document.querySelector(".canvas-shell");

const toolButtons = document.querySelectorAll(".tool-btn[data-tool]");
const colorPicker = document.getElementById("colorPicker");
const swatches = document.querySelectorAll(".swatch");
const strokeWidth = document.getElementById("strokeWidth");
const strokeValue = document.getElementById("strokeValue");
const textOptions = document.getElementById("textOptions");
const textSizeInput = document.getElementById("textSize");
const fontFamilySelect = document.getElementById("fontFamily");
const blurOptions = document.getElementById("blurOptions");
const blurRadius = document.getElementById("blurRadius");
const blurValue = document.getElementById("blurValue");
const cropOptions = document.getElementById("cropOptions");
const applyCropBtn = document.getElementById("applyCropBtn");
const cancelCropBtn = document.getElementById("cancelCropBtn");
const resizePanel = document.getElementById("resizePanel");
const resizeWidth = document.getElementById("resizeWidth");
const resizeHeight = document.getElementById("resizeHeight");
const resizeLock = document.getElementById("resizeLock");
const applyResizeBtn = document.getElementById("applyResizeBtn");
const cancelResizeBtn = document.getElementById("cancelResizeBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const clearBtn = document.getElementById("clearBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomValue = document.getElementById("zoomValue");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const saveBtn = document.getElementById("saveBtn");
const toolOptions = document.querySelector(".tool-options");
const optionsToggle = document.getElementById("optionsToggle");

const cropTool = new CropTool({
  canvas,
  getImageBitmap: () => state.baseImage,
  setImageBitmap: (bitmap) => {
    setBaseImage(bitmap);
    state.actions = [];
    state.redoStack = [];
  },
  onChange: () => render()
});

const resizeTool = new ResizeTool({
  canvas,
  onChange: () => render(),
  onSizeChange: (size) => syncResizeInputs(size)
});

setup();

function setup() {
  annotationCanvas.width = canvas.width;
  annotationCanvas.height = canvas.height;
  bindEvents();
  updateToolUI();
  updateZoom();
  loadPendingCapture();
  render();
}

function bindEvents() {
  toolButtons.forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  swatches.forEach((swatch) => {
    swatch.style.backgroundColor = swatch.dataset.color;
    swatch.addEventListener("click", () => {
      state.color = swatch.dataset.color;
      colorPicker.value = state.color;
      updateSwatchUI();
      render();
    });
  });

  colorPicker.addEventListener("input", (event) => {
    state.color = event.target.value;
    updateSwatchUI();
    render();
  });

  strokeWidth.addEventListener("input", (event) => {
    state.lineWidth = Number(event.target.value);
    strokeValue.textContent = `${state.lineWidth}px`;
  });

  textSizeInput.addEventListener("input", (event) => {
    state.textSize = Number(event.target.value);
  });

  fontFamilySelect.addEventListener("change", (event) => {
    state.fontFamily = event.target.value;
  });

  blurRadius.addEventListener("input", (event) => {
    state.blurRadius = Number(event.target.value);
    blurValue.textContent = `${state.blurRadius}px`;
    render();
  });

  applyCropBtn.addEventListener("click", async () => {
    await applyCrop();
  });

  cancelCropBtn.addEventListener("click", () => {
    cropTool.disable();
    setTool(TOOL_TYPES.DRAW);
  });

  resizeWidth.addEventListener("input", () => syncResize("width"));
  resizeHeight.addEventListener("input", () => syncResize("height"));
  resizeLock.addEventListener("change", (event) => {
    resizeTool.setLockRatio(event.target.checked);
  });

  applyResizeBtn.addEventListener("click", () => applyResize());
  cancelResizeBtn.addEventListener("click", () => {
    resizePanel.hidden = true;
    setTool(TOOL_TYPES.DRAW);
  });

  undoBtn.addEventListener("click", () => undo());
  redoBtn.addEventListener("click", () => redo());
  clearBtn.addEventListener("click", clearCanvas);

  zoomInBtn.addEventListener("click", () => setZoom(state.zoom + 0.1));
  zoomOutBtn.addEventListener("click", () => setZoom(state.zoom - 0.1));

  optionsToggle.addEventListener("click", () => {
    setOptionsOpen(toolOptions.classList.contains("collapsed"));
  });

  copyBtn.addEventListener("click", copyToClipboard);
  downloadBtn.addEventListener("click", downloadImage);
  saveBtn.addEventListener("click", saveToLibrary);

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerUp);

  window.addEventListener("keydown", handleKeydown);

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "capture_complete" && message.payload?.dataUrl) {
        loadFromDataUrl(message.payload.dataUrl);
      }
    });
  }
}

function setTool(tool) {
  if (!tool) return;

  if (tool === TOOL_TYPES.RESIZE) {
    openResizePanel();
    return;
  }

  state.tool = tool;
  state.currentAction = null;
  if (tool === TOOL_TYPES.CROP) {
    cropTool.enable();
    resizeTool.disable();
  } else {
    cropTool.disable();
    resizeTool.disable();
  }
  updateToolUI();
  render();
}

function updateToolUI() {
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.tool);
  });

  textOptions.hidden = state.tool !== TOOL_TYPES.TEXT;
  blurOptions.hidden = state.tool !== TOOL_TYPES.BLUR;
  cropOptions.hidden = state.tool !== TOOL_TYPES.CROP;
  resizePanel.hidden = state.tool !== TOOL_TYPES.RESIZE;

  updateSwatchUI();
  autoOpenOptions();
}

function updateSwatchUI() {
  swatches.forEach((swatch) => {
    swatch.classList.toggle("active", swatch.dataset.color.toLowerCase() === state.color.toLowerCase());
  });
}

function setOptionsOpen(open) {
  toolOptions.classList.toggle("collapsed", !open);
  optionsToggle.classList.toggle("active", open);
}

function autoOpenOptions() {
  if ([TOOL_TYPES.TEXT, TOOL_TYPES.BLUR, TOOL_TYPES.CROP, TOOL_TYPES.RESIZE].includes(state.tool)) {
    setOptionsOpen(true);
  }
}

function handlePointerDown(event) {
  if (state.tool === TOOL_TYPES.CROP) return;
  if (state.tool === TOOL_TYPES.RESIZE) return;

  state.pointerId = event.pointerId;
  canvas.setPointerCapture(state.pointerId);
  const point = toCanvasPoint(event);

  if (state.tool === TOOL_TYPES.TEXT) {
    createTextInput(point);
    return;
  }

  state.drawing = true;
  state.currentAction = createAction(point);
  render();
}

function handlePointerMove(event) {
  if (!state.drawing || event.pointerId !== state.pointerId) return;
  const point = toCanvasPoint(event);
  updateCurrentAction(point);
  render();
}

function handlePointerUp(event) {
  if (!state.drawing || event.pointerId !== state.pointerId) return;
  state.drawing = false;
  canvas.releasePointerCapture(state.pointerId);
  finalizeCurrentAction();
  state.pointerId = null;
}

function handleKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }

  if (event.key === "Escape") {
    state.currentAction = null;
    state.drawing = false;
    cropTool.disable();
    resizePanel.hidden = true;
    setTool(TOOL_TYPES.DRAW);
    render();
  }
}

function createAction(point) {
  switch (state.tool) {
    case TOOL_TYPES.DRAW:
    case TOOL_TYPES.HIGHLIGHT:
    case TOOL_TYPES.ERASE:
      return {
        type: state.tool,
        points: [point],
        color: state.color,
        width: state.lineWidth
      };
    case TOOL_TYPES.RECT:
    case TOOL_TYPES.ELLIPSE:
    case TOOL_TYPES.ARROW:
    case TOOL_TYPES.LINE:
    case TOOL_TYPES.BLUR:
      return {
        type: state.tool,
        start: point,
        end: point,
        color: state.color,
        width: state.lineWidth
      };
    default:
      return null;
  }
}

function updateCurrentAction(point) {
  if (!state.currentAction) return;

  if ([TOOL_TYPES.DRAW, TOOL_TYPES.HIGHLIGHT, TOOL_TYPES.ERASE].includes(state.currentAction.type)) {
    state.currentAction.points.push(point);
  } else {
    state.currentAction.end = point;
  }
}

function finalizeCurrentAction() {
  if (!state.currentAction) return;
  state.actions.push(state.currentAction);
  state.redoStack = [];
  state.currentAction = null;
  render();
}

async function undo() {
  if (state.actions.length) {
    const action = state.actions.pop();
    state.redoStack.push(action);
    render();
    return;
  }

  if (state.snapshots.length) {
    const snapshot = state.snapshots.pop();
    state.snapshotRedo.push(captureState());
    await restoreState(snapshot);
  }
}

async function redo() {
  if (state.redoStack.length) {
    const action = state.redoStack.pop();
    state.actions.push(action);
    render();
    return;
  }

  if (state.snapshotRedo.length) {
    const snapshot = state.snapshotRedo.pop();
    state.snapshots.push(captureState());
    await restoreState(snapshot);
  }
}

function clearCanvas() {
  if (!state.actions.length && !state.baseImage) return;
  state.snapshots.push(captureState());
  state.snapshotRedo = [];
  state.actions = [];
  render();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderComposite(ctx);

  if (state.currentAction) {
    drawAction(annotationCtx, state.currentAction);
    ctx.drawImage(annotationCanvas, 0, 0);
    annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  }

  if (state.tool === TOOL_TYPES.CROP) {
    cropTool.drawOverlay(ctx);
  }

  if (state.tool === TOOL_TYPES.RESIZE) {
    resizeTool.drawOverlay(ctx);
  }
}

function renderComposite(targetCtx) {
  if (state.baseImage) {
    targetCtx.drawImage(state.baseImage, 0, 0);
  } else {
    targetCtx.fillStyle = "#0f172a";
    targetCtx.fillRect(0, 0, canvas.width, canvas.height);
  }

  renderBlurLayers(targetCtx);
  renderAnnotations(targetCtx);
}

function renderAnnotations(targetCtx) {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  state.actions.forEach((action) => {
    if (!action || action.type === TOOL_TYPES.BLUR) return;
    drawAction(annotationCtx, action);
  });

  targetCtx.drawImage(annotationCanvas, 0, 0);
}

function renderBlurLayers(targetCtx) {
  const blurActions = state.actions.filter((action) => action.type === TOOL_TYPES.BLUR);
  if (!blurActions.length || !state.baseImageCanvas) return;

  blurActions.forEach((action) => {
    const rect = rectFromPoints(action.start, action.end);
    targetCtx.save();
    targetCtx.filter = `blur(${state.blurRadius}px)`;
    targetCtx.drawImage(
      state.baseImageCanvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      rect.x,
      rect.y,
      rect.width,
      rect.height
    );
    targetCtx.restore();
  });
}

function drawAction(context, action) {
  if (!action) return;

  if (action.type === TOOL_TYPES.DRAW) {
    drawPath(context, action.points, action.color, action.width, 1);
    return;
  }

  if (action.type === TOOL_TYPES.HIGHLIGHT) {
    drawPath(context, action.points, action.color, action.width + 6, 0.35);
    return;
  }

  if (action.type === TOOL_TYPES.ERASE) {
    context.save();
    context.globalCompositeOperation = "destination-out";
    drawPath(context, action.points, "rgba(0,0,0,1)", action.width + 8, 1);
    context.restore();
    return;
  }

  if (action.type === TOOL_TYPES.RECT) {
    const rect = rectFromPoints(action.start, action.end);
    context.save();
    context.strokeStyle = action.color;
    context.lineWidth = action.width;
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
    context.restore();
    return;
  }

  if (action.type === TOOL_TYPES.ELLIPSE) {
    const rect = rectFromPoints(action.start, action.end);
    context.save();
    context.strokeStyle = action.color;
    context.lineWidth = action.width;
    context.beginPath();
    context.ellipse(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      rect.width / 2,
      rect.height / 2,
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
    context.restore();
    return;
  }

  if (action.type === TOOL_TYPES.ARROW) {
    drawArrow(context, action.start, action.end, action.color, action.width);
    return;
  }

  if (action.type === TOOL_TYPES.LINE) {
    context.save();
    context.strokeStyle = action.color;
    context.lineWidth = action.width;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(action.start.x, action.start.y);
    context.lineTo(action.end.x, action.end.y);
    context.stroke();
    context.restore();
    return;
  }

  if (action.type === TOOL_TYPES.TEXT) {
    context.save();
    context.fillStyle = action.color;
    context.font = `${action.size}px ${action.font}`;
    context.fillText(action.text, action.x, action.y);
    context.restore();
  }
}

function drawPath(context, points, color, width, alpha) {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.globalAlpha = alpha;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
  context.restore();
}

function drawArrow(context, start, end, color, width) {
  const headLength = Math.max(10, width * 2.2);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();

  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  context.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.restore();
}

function rectFromPoints(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function toCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

async function loadFromDataUrl(dataUrl, { preserveActions = false } = {}) {
  if (!preserveActions) {
    state.actions = [];
    state.redoStack = [];
    state.currentAction = null;
  }
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  setBaseImage(bitmap, dataUrl);
}

function setBaseImage(bitmap, dataUrl = null) {
  state.baseImage = bitmap;
  state.baseImageCanvas = document.createElement("canvas");
  state.baseImageCanvas.width = bitmap.width;
  state.baseImageCanvas.height = bitmap.height;
  state.baseImageContext = state.baseImageCanvas.getContext("2d");
  state.baseImageContext.drawImage(bitmap, 0, 0);
  state.baseDataUrl = dataUrl;
  resizeCanvasToImage(bitmap);
  render();
}

function resizeCanvasToImage(bitmap) {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  annotationCanvas.width = bitmap.width;
  annotationCanvas.height = bitmap.height;
}

function captureState() {
  return {
    baseDataUrl: state.baseDataUrl,
    actions: structuredClone(state.actions)
  };
}

async function restoreState(snapshot) {
  if (!snapshot) return;
  state.actions = structuredClone(snapshot.actions || []);
  state.redoStack = [];
  if (snapshot.baseDataUrl) {
    await loadFromDataUrl(snapshot.baseDataUrl, { preserveActions: true });
  } else {
    state.baseImage = null;
    state.baseDataUrl = null;
    render();
  }
}

async function loadPendingCapture() {
  try {
    if (chrome?.storage?.session) {
      const { lastCapture } = await chrome.storage.session.get("lastCapture");
      if (lastCapture?.dataUrl) {
        await loadFromDataUrl(lastCapture.dataUrl);
        await chrome.storage.session.remove("lastCapture");
      }
      return;
    }

    if (chrome?.storage?.local) {
      const { lastCapture } = await chrome.storage.local.get("lastCapture");
      if (lastCapture?.dataUrl) {
        await loadFromDataUrl(lastCapture.dataUrl);
        await chrome.storage.local.remove("lastCapture");
      }
    }
  } catch (error) {
    console.warn("Failed to load pending capture", error);
  }
}

function showToast(message, isError = false) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  toast.style.borderColor = isError ? "rgba(248, 113, 113, 0.6)" : "rgba(148, 163, 184, 0.2)";
  toast.style.color = isError ? "#fecaca" : "#f9fafb";
  setTimeout(() => toast.classList.remove("show"), 2000);
}

function setZoom(value) {
  state.zoom = Math.min(2.5, Math.max(0.5, Number(value.toFixed(2))));
  updateZoom();
}

function updateZoom() {
  canvas.style.transform = `scale(${state.zoom})`;
  zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  resizeTool.setZoom(state.zoom);
}

function openResizePanel() {
  if (!canvas.width || !canvas.height) return;
  cropTool.disable();
  resizePanel.hidden = false;
  state.tool = TOOL_TYPES.RESIZE;
  resizeTool.enable();
  resizeTool.setSize(canvas.width, canvas.height);
  resizeTool.setLockRatio(resizeLock.checked);
  resizeWidth.value = String(canvas.width);
  resizeHeight.value = String(canvas.height);
  updateToolUI();
}

function syncResize(changed) {
  const width = Number(resizeWidth.value || canvas.width);
  const height = Number(resizeHeight.value || canvas.height);

  if (resizeLock.checked) {
    const ratio = canvas.width / canvas.height;
    if (changed === "width") {
      const nextHeight = Math.round(width / ratio);
      resizeHeight.value = String(nextHeight);
      resizeTool.setSize(width, nextHeight);
      return;
    }
    if (changed === "height") {
      const nextWidth = Math.round(height * ratio);
      resizeWidth.value = String(nextWidth);
      resizeTool.setSize(nextWidth, height);
      return;
    }
  }

  resizeTool.setSize(width, height);
}

async function applyResize() {
  const pending = resizeTool.getSize();
  const width = Number(pending.width);
  const height = Number(pending.height);
  if (!width || !height) {
    showToast("Enter width and height.", true);
    return;
  }

  state.snapshots.push(captureState());
  state.snapshotRedo = [];

  const composite = await exportCompositeCanvas();
  const canvasOut = document.createElement("canvas");
  canvasOut.width = width;
  canvasOut.height = height;
  const ctxOut = canvasOut.getContext("2d");
  ctxOut.drawImage(composite, 0, 0, width, height);
  const blob = await canvasToBlob(canvasOut);
  const dataUrl = await blobToDataUrl(blob);
  await loadFromDataUrl(dataUrl);

  state.actions = [];
  state.redoStack = [];
  resizePanel.hidden = true;
  resizeTool.disable();
  setTool(TOOL_TYPES.DRAW);
  showToast("Resized.");
}

async function applyCrop() {
  if (!state.baseImage) return;
  state.snapshots.push(captureState());
  state.snapshotRedo = [];
  await cropTool.applyCrop({ devicePixelRatio: 1 });
  state.baseDataUrl = await canvasToDataUrl();
  state.actions = [];
  state.redoStack = [];
  cropTool.disable();
  setTool(TOOL_TYPES.DRAW);
  showToast("Cropped.");
}

async function canvasToDataUrl() {
  const canvasOut = await exportCompositeCanvas();
  return canvasOut.toDataURL("image/png");
}

async function exportCompositeCanvas() {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportCtx = exportCanvas.getContext("2d");
  renderComposite(exportCtx);
  return exportCanvas;
}

async function exportCompositeBlob() {
  const exportCanvas = await exportCompositeCanvas();
  return canvasToBlob(exportCanvas);
}

function canvasToBlob(canvasOut) {
  return new Promise((resolve, reject) => {
    canvasOut.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to export image."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

async function copyToClipboard() {
  try {
    const blob = await exportCompositeBlob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    showToast("Copied to clipboard.");
  } catch (error) {
    console.error(error);
    showToast("Copy failed.", true);
  }
}

async function downloadImage() {
  try {
    const blob = await exportCompositeBlob();
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: `olho-capture-${Date.now()}.png`,
      saveAs: true
    });
    showToast("Download started.");
  } catch (error) {
    console.error(error);
    showToast("Download failed.", true);
  }
}

async function saveToLibrary() {
  try {
    const blob = await exportCompositeBlob();
    const url = URL.createObjectURL(blob);
    await createItem({
      type: "image",
      blobUrl: url,
      metadata: { title: `Olho Capture ${new Date().toLocaleString()}` }
    });
    showToast("Saved to library.");
  } catch (error) {
    console.error(error);
    showToast("Save failed.", true);
  }
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

function createTextInput(point) {
  const input = document.createElement("textarea");
  input.className = "text-input";
  input.style.left = `${point.x * state.zoom}px`;
  input.style.top = `${point.y * state.zoom}px`;
  input.style.color = state.color;
  input.style.fontFamily = state.fontFamily;
  input.style.fontSize = `${state.textSize}px`;
  input.placeholder = "Type...";

  canvasShell.style.position = "relative";
  canvasShell.appendChild(input);
  input.focus();

  const commit = () => {
    const text = input.value.trim();
    if (text) {
      state.actions.push({
        type: TOOL_TYPES.TEXT,
        x: point.x,
        y: point.y,
        text,
        color: state.color,
        size: state.textSize,
        font: state.fontFamily
      });
      state.redoStack = [];
    }
    input.remove();
    render();
  };

  input.addEventListener("blur", commit, { once: true });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commit();
    }
  });
}

function syncResizeInputs(size) {
  resizeWidth.value = String(size.width);
  resizeHeight.value = String(size.height);
}
