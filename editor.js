const TOOL_TYPES = {
  DRAW: "draw",
  RECT: "rect",
  ARROW: "arrow",
  TEXT: "text",
  BLUR: "blur",
  ERASE: "erase"
};

const TOOL_LABELS = {
  [TOOL_TYPES.DRAW]: "Free Draw",
  [TOOL_TYPES.RECT]: "Rectangle",
  [TOOL_TYPES.ARROW]: "Arrow",
  [TOOL_TYPES.TEXT]: "Text",
  [TOOL_TYPES.BLUR]: "Blur",
  [TOOL_TYPES.ERASE]: "Eraser"
};

const SHORTCUTS = {
  Digit1: TOOL_TYPES.DRAW,
  Digit2: TOOL_TYPES.RECT,
  Digit3: TOOL_TYPES.ARROW,
  Digit4: TOOL_TYPES.TEXT,
  Digit5: TOOL_TYPES.BLUR,
  Digit6: TOOL_TYPES.ERASE,
  KeyD: TOOL_TYPES.DRAW,
  KeyR: TOOL_TYPES.RECT,
  KeyA: TOOL_TYPES.ARROW,
  KeyT: TOOL_TYPES.TEXT,
  KeyB: TOOL_TYPES.BLUR,
  KeyE: TOOL_TYPES.ERASE
};

const DEFAULT_STATE = {
  tool: TOOL_TYPES.DRAW,
  color: "#f8fafc",
  lineWidth: 3,
  blurRadius: 8,
  textSize: 20,
  fontFamily: "Space Grotesk, system-ui, sans-serif"
};

const state = {
  ...DEFAULT_STATE,
  actions: [],
  redoStack: [],
  currentAction: null,
  baseImage: null,
  baseImageCanvas: null,
  baseImageContext: null,
  pointerId: null,
  drawing: false
};

const ui = createEditorShell();
const canvas = ui.canvas;
const ctx = canvas.getContext("2d");
const annotationCanvas = document.createElement("canvas");
const annotationCtx = annotationCanvas.getContext("2d");

setupCanvas();
setupToolbar(ui.toolbar);
attachEvents();
render();

function createEditorShell() {
  injectStyles();
  const root = document.createElement("div");
  root.className = "editor-shell";

  const toolbar = document.createElement("div");
  toolbar.className = "editor-toolbar";

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "editor-canvas-wrap";

  const canvas = document.createElement("canvas");
  canvas.id = "annotationCanvas";
  canvas.setAttribute("aria-label", "Annotation canvas");
  canvas.tabIndex = 0;
  canvasWrap.append(canvas);

  root.append(toolbar, canvasWrap);
  document.body.prepend(root);
  return { root, toolbar, canvasWrap, canvas };
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: dark;
      font-family: "Space Grotesk", system-ui, sans-serif;
      background: #0b1020;
      color: #f8fafc;
    }

    body {
      margin: 0;
      padding: 24px;
      background: radial-gradient(circle at top, #111827 0%, #0b1020 55%, #070b16 100%);
      color: #f8fafc;
    }

    .editor-shell {
      display: grid;
      gap: 16px;
    }

    .editor-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 12px;
      border-radius: 16px;
      background: #111827;
      border: 1px solid rgba(148, 163, 184, 0.2);
      box-shadow: 0 22px 50px rgba(15, 23, 42, 0.45);
    }

    .editor-toolbar button,
    .editor-toolbar select,
    .editor-toolbar input[type="color"],
    .editor-toolbar input[type="range"] {
      border-radius: 10px;
      border: 1px solid transparent;
      background: #1f2937;
      color: #f8fafc;
      padding: 8px 10px;
      font-size: 0.9rem;
    }

    .editor-toolbar button.active {
      background: #4f46e5;
      color: #f8fafc;
      border-color: rgba(99, 102, 241, 0.7);
    }

    .editor-toolbar button:focus-visible,
    .editor-toolbar input:focus-visible,
    .editor-toolbar select:focus-visible,
    canvas:focus-visible {
      outline: 2px solid #38bdf8;
      outline-offset: 2px;
    }

    .editor-canvas-wrap {
      background: #111827;
      border-radius: 18px;
      padding: 16px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      box-shadow: 0 22px 50px rgba(15, 23, 42, 0.45);
      overflow: auto;
    }

    #annotationCanvas {
      display: block;
      width: 100%;
      max-width: 1200px;
      height: auto;
      background: #0f172a;
      border-radius: 14px;
    }
  `;
  document.head.append(style);
}

function setupCanvas() {
  const width = 1200;
  const height = 720;
  canvas.width = width;
  canvas.height = height;
  annotationCanvas.width = width;
  annotationCanvas.height = height;
}

function resizeForImage(imageBitmap) {
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  annotationCanvas.width = imageBitmap.width;
  annotationCanvas.height = imageBitmap.height;
  canvas.style.maxWidth = "100%";
  canvas.style.height = "auto";
}

function setupToolbar(toolbar) {
  const toolGroup = document.createElement("div");
  toolGroup.className = "tool-group";

  Object.values(TOOL_TYPES).forEach((tool) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = TOOL_LABELS[tool];
    button.dataset.tool = tool;
    if (tool === state.tool) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => setTool(tool));
    toolGroup.append(button);
  });

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = state.color;
  colorInput.setAttribute("aria-label", "Stroke color");
  colorInput.addEventListener("input", (event) => {
    state.color = event.target.value;
  });

  const sizeInput = document.createElement("input");
  sizeInput.type = "range";
  sizeInput.min = "1";
  sizeInput.max = "16";
  sizeInput.value = String(state.lineWidth);
  sizeInput.setAttribute("aria-label", "Stroke size");
  sizeInput.addEventListener("input", (event) => {
    state.lineWidth = Number(event.target.value);
  });

  const undoButton = document.createElement("button");
  undoButton.type = "button";
  undoButton.textContent = "Undo";
  undoButton.addEventListener("click", undo);

  const redoButton = document.createElement("button");
  redoButton.type = "button";
  redoButton.textContent = "Redo";
  redoButton.addEventListener("click", redo);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  clearButton.addEventListener("click", () => {
    state.actions = [];
    state.redoStack = [];
    render();
  });

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.setAttribute("aria-label", "Load image");
  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    setBaseImage(bitmap);
  });

  toolbar.append(toolGroup, colorInput, sizeInput, undoButton, redoButton, clearButton, fileInput);
}

function setTool(tool) {
  state.tool = tool;
  state.currentAction = null;
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
}

function attachEvents() {
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

function handlePointerDown(event) {
  if (state.drawing) return;
  state.pointerId = event.pointerId;
  canvas.setPointerCapture(state.pointerId);
  const point = toCanvasPoint(event);

  if (state.tool === TOOL_TYPES.TEXT) {
    const text = prompt("Enter text");
    if (text) {
      pushAction({
        type: TOOL_TYPES.TEXT,
        x: point.x,
        y: point.y,
        text,
        color: state.color,
        size: state.textSize,
        font: state.fontFamily
      });
    }
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
    render();
    return;
  }

  const tool = SHORTCUTS[event.code];
  if (tool) {
    setTool(tool);
  }
}

function createAction(point) {
  switch (state.tool) {
    case TOOL_TYPES.DRAW:
    case TOOL_TYPES.ERASE:
      return {
        type: state.tool,
        points: [point],
        color: state.color,
        width: state.lineWidth
      };
    case TOOL_TYPES.RECT:
    case TOOL_TYPES.BLUR:
    case TOOL_TYPES.ARROW:
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
  const action = state.currentAction;
  if (!action) return;

  if (action.type === TOOL_TYPES.DRAW || action.type === TOOL_TYPES.ERASE) {
    action.points.push(point);
  } else {
    action.end = point;
  }
}

function finalizeCurrentAction() {
  if (!state.currentAction) return;
  pushAction(state.currentAction);
  state.currentAction = null;
}

function pushAction(action) {
  state.actions.push(action);
  state.redoStack = [];
  render();
}

function undo() {
  const action = state.actions.pop();
  if (action) {
    state.redoStack.push(action);
    render();
  }
}

function redo() {
  const action = state.redoStack.pop();
  if (action) {
    state.actions.push(action);
    render();
  }
}

async function loadFromDataUrl(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  setBaseImage(bitmap);
}

function setBaseImage(bitmap) {
  state.baseImage = bitmap;
  state.baseImageCanvas = document.createElement("canvas");
  state.baseImageCanvas.width = bitmap.width;
  state.baseImageCanvas.height = bitmap.height;
  state.baseImageContext = state.baseImageCanvas.getContext("2d");
  state.baseImageContext.drawImage(bitmap, 0, 0);
  resizeForImage(bitmap);
  render();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.baseImage) {
    ctx.drawImage(state.baseImage, 0, 0);
  } else {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  renderBlurLayers();
  renderAnnotations();

  if (state.currentAction) {
    drawAction(annotationCtx, state.currentAction, true);
    ctx.drawImage(annotationCanvas, 0, 0);
    annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  }
}

function renderBlurLayers() {
  const blurActions = [...state.actions, state.currentAction].filter(
    (action) => action && action.type === TOOL_TYPES.BLUR
  );

  if (!blurActions.length || !state.baseImageCanvas) return;

  blurActions.forEach((action) => {
    const rect = rectFromPoints(action.start, action.end);
    ctx.save();
    ctx.filter = `blur(${state.blurRadius}px)`;
    ctx.drawImage(
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
    ctx.restore();
  });
}

function renderAnnotations() {
  annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  state.actions.forEach((action) => {
    if (!action) return;
    if (action.type === TOOL_TYPES.BLUR) return;
    drawAction(annotationCtx, action);
  });

  ctx.drawImage(annotationCanvas, 0, 0);
}

function drawAction(context, action, preview = false) {
  if (action.type === TOOL_TYPES.DRAW) {
    drawPath(context, action.points, action.color, action.width);
    return;
  }

  if (action.type === TOOL_TYPES.ERASE) {
    context.save();
    context.globalCompositeOperation = "destination-out";
    drawPath(context, action.points, "rgba(0,0,0,1)", action.width + 6);
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

  if (action.type === TOOL_TYPES.ARROW) {
    drawArrow(context, action.start, action.end, action.color, action.width);
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

function drawPath(context, points, color, width) {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
  context.restore();
}

function drawArrow(context, start, end, color, width) {
  const headLength = 14;
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
