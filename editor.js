import { CropTool } from "./src/editor/crop.js";
import { ResizeTool } from "./src/editor/resize.js";
import { EditorViewport } from "./src/editor/viewport.js";
import { estimateStoragePressure, getMedia, saveMedia, StorageQuotaError } from "./src/storage/storage.js";
import { installRuntimeGuard } from "./src/shared/runtime-guard.js";

const DRAFT_KEY = "olho_editor_drafts";
const DRAFT_MAX_BYTES = 2_000_000;
const LOCAL_IMAGE_MAX_BYTES = 30 * 1024 * 1024;
const MAX_HISTORY = 80;
const HANDLE_SIZE = 10;
const HIT_TOLERANCE = 12;
const ENDPOINT_HANDLE_RADIUS = 7;
const ACCEPTED_LOCAL_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const TOOL_TYPES = Object.freeze({
  SELECT: "select",
  DRAW: "draw",
  HIGHLIGHT: "highlight",
  LINE: "line",
  ARROW: "arrow",
  RECT: "rect",
  ROUNDED_RECT: "roundedRect",
  ELLIPSE: "ellipse",
  TEXT: "text",
  NUMBER_MARKER: "numberMarker",
  CALLOUT: "callout",
  BLUR: "blur",
  PIXELATE: "pixelate",
  REDACT: "redact",
  CROP: "crop",
  RESIZE: "resize"
});

const TOOL_GROUP_BY_TOOL = Object.freeze({
  [TOOL_TYPES.SELECT]: "select",
  [TOOL_TYPES.DRAW]: "draw",
  [TOOL_TYPES.HIGHLIGHT]: "draw",
  [TOOL_TYPES.LINE]: "shapes",
  [TOOL_TYPES.ARROW]: "shapes",
  [TOOL_TYPES.RECT]: "shapes",
  [TOOL_TYPES.ROUNDED_RECT]: "shapes",
  [TOOL_TYPES.ELLIPSE]: "shapes",
  [TOOL_TYPES.TEXT]: "text",
  [TOOL_TYPES.NUMBER_MARKER]: "text",
  [TOOL_TYPES.CALLOUT]: "text",
  [TOOL_TYPES.BLUR]: "redact",
  [TOOL_TYPES.PIXELATE]: "redact",
  [TOOL_TYPES.REDACT]: "redact",
  [TOOL_TYPES.CROP]: "transform",
  [TOOL_TYPES.RESIZE]: "transform"
});

const RECT_TOOLS = new Set([
  TOOL_TYPES.RECT,
  TOOL_TYPES.ROUNDED_RECT,
  TOOL_TYPES.ELLIPSE,
  TOOL_TYPES.BLUR,
  TOOL_TYPES.PIXELATE,
  TOOL_TYPES.REDACT
]);

const TEXT_TOOLS = new Set([TOOL_TYPES.TEXT, TOOL_TYPES.CALLOUT]);

const state = {
  tool: TOOL_TYPES.SELECT,
  actions: [],
  selectedActionId: null,
  pendingAction: null,
  pointerId: null,
  dragMode: null,
  dragStart: null,
  dragActionSnapshot: null,
  dragBoundsSnapshot: null,
  resizeHandle: null,
  endpointHandle: null,
  undoStack: [],
  redoStack: [],
  zoom: 1,
  markerCounter: 1,
  baseImage: null,
  baseDataUrl: null,
  baseImageCanvas: null,
  baseImageContext: null,
  currentItemId: null,
  projectBaseItemId: null,
  itemTitle: "",
  itemTags: [],
  lastExportFilename: "",
  style: {
    strokeColor: "#ff4d4f",
    fillColor: "#000000",
    opacity: 1,
    strokeWidth: 4,
    fontSize: 28,
    fontFamily: "Arial, sans-serif",
    arrowStyle: "filled",
    blurStrength: 10,
    pixelStrength: 14
  }
};

installRuntimeGuard({
  onError(message) {
    showToast(`Unexpected error: ${message}`, true);
  }
});

const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d");
const canvasShell = document.getElementById("canvasShell");
const annotationWorkCanvas = document.createElement("canvas");
const annotationWorkCtx = annotationWorkCanvas.getContext("2d", { willReadFrequently: true });
const toast = document.getElementById("toast");

const toolButtons = Array.from(document.querySelectorAll(".tool-btn[data-tool]"));
const toolGroups = Array.from(document.querySelectorAll(".tool-group[data-tool-group]"));
const toolOptionGroups = Array.from(document.querySelectorAll("[data-tool-scope]"));
const galleryBtn = document.getElementById("galleryBtn");
const openLocalImageBtn = document.getElementById("openLocalImageBtn");
const openLocalImageToolbarBtn = document.getElementById("openLocalImageToolbarBtn");
const pasteImageBtn = document.getElementById("pasteImageBtn");
const openExportPanelBtn = document.getElementById("openExportPanelBtn");
const saveCopyBtn = document.getElementById("saveCopyBtn");
const overwriteBtn = document.getElementById("overwriteBtn");
const resetEditsBtn = document.getElementById("resetEditsBtn");

const exportCopyBtn = document.getElementById("exportCopyBtn");
const exportDownloadBtn = document.getElementById("exportDownloadBtn");
const secureRedactionBtn = document.getElementById("secureRedactionBtn");
const copyMarkdownBtn = document.getElementById("copyMarkdownBtn");
const copyHtmlBtn = document.getElementById("copyHtmlBtn");

const strokeColorInput = document.getElementById("strokeColor");
const fillColorInput = document.getElementById("fillColor");
const opacityRange = document.getElementById("opacityRange");
const opacityValue = document.getElementById("opacityValue");
const strokeWidthInput = document.getElementById("strokeWidth");
const strokeValue = document.getElementById("strokeValue");
const fontSizeInput = document.getElementById("fontSize");
const fontFamilyInput = document.getElementById("fontFamily");
const arrowStyleInput = document.getElementById("arrowStyle");
const blurStrengthInput = document.getElementById("blurStrength");
const blurValue = document.getElementById("blurValue");
const pixelStrengthInput = document.getElementById("pixelStrength");
const pixelValue = document.getElementById("pixelValue");
const exportFormatInput = document.getElementById("exportFormat");

const itemTitleInput = document.getElementById("itemTitle");
const applyTitleBtn = document.getElementById("applyTitleBtn");
const itemTagsInput = document.getElementById("itemTags");
const applyTagsBtn = document.getElementById("applyTagsBtn");

const rotateLeftBtn = document.getElementById("rotateLeftBtn");
const rotateRightBtn = document.getElementById("rotateRightBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const duplicateBtn = document.getElementById("duplicateBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const fitBtn = document.getElementById("fitBtn");
const actualSizeBtn = document.getElementById("actualSizeBtn");
const zoomValue = document.getElementById("zoomValue");
const transformActionBar = document.getElementById("transformActionBar");

const cropPanel = document.getElementById("cropPanel");
const cropWidthValue = document.getElementById("cropWidth");
const cropHeightValue = document.getElementById("cropHeight");
const applyCropBtn = document.getElementById("applyCropBtn");
const cancelCropBtn = document.getElementById("cancelCropBtn");

const resizePanel = document.getElementById("resizePanel");
const resizeWidth = document.getElementById("resizeWidth");
const resizeHeight = document.getElementById("resizeHeight");
const resizeLock = document.getElementById("resizeLock");
const resizeLiveWidth = document.getElementById("resizeLiveWidth");
const resizeLiveHeight = document.getElementById("resizeLiveHeight");
const applyResizeBtn = document.getElementById("applyResizeBtn");
const cancelResizeBtn = document.getElementById("cancelResizeBtn");

const exportAnnotationJsonBtn = document.getElementById("exportAnnotationJsonBtn");
const exportProjectBtn = document.getElementById("exportProjectBtn");
const importProjectBtn = document.getElementById("importProjectBtn");
const projectFileInput = document.getElementById("projectFileInput");
const localImageInput = document.getElementById("localImageInput");
const localImageDropHint = document.getElementById("localImageDropHint");

const annotationList = document.getElementById("annotationList");
const annotationEmpty = document.getElementById("annotationEmpty");

const overwriteDialog = document.getElementById("overwriteDialog");
const overwriteCancelBtn = document.getElementById("overwriteCancelBtn");
const overwriteConfirmBtn = document.getElementById("overwriteConfirmBtn");

let draftSaveTimer = null;
let draftSkipNotice = false;
let textComposer = null;
let lastDialogInvoker = null;
let toastTimer = null;
let initialSessionSnapshot = null;
const viewport = new EditorViewport({
  canvas,
  getZoom: () => state.zoom,
  getPan: () => ({ x: 0, y: 0 })
});

const cropTool = new CropTool({
  canvas,
  viewport,
  getImageBitmap: () => state.baseImage,
  setImageBitmap: (bitmap) => {
    setBaseImage(bitmap);
    state.actions = [];
    state.selectedActionId = null;
  },
  onChange: (rect) => {
    updateCropMetrics(rect);
    render();
  }
});

const resizeTool = new ResizeTool({
  canvas,
  viewport,
  onChange: () => render(),
  onSizeChange: (size) => syncResizeInputs(size)
});

setup().catch((error) => {
  console.error(error);
  showToast("Editor setup failed.", true);
});

window.__olhoImportImageBlobForTesting = async function olhoImportImageBlobForTesting({
  base64,
  mimeType = "image/png",
  name = "Test Image"
} = {}) {
  if (!base64) {
    throw new Error("base64 image payload is required.");
  }
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });
  await loadLocalImageBlob(blob, { originalName: name });
  return {
    width: canvas.width,
    height: canvas.height,
    title: state.itemTitle
  };
};

function getEditorTestSnapshot() {
  return {
    tool: state.tool,
    actions: deepClone(state.actions),
    selectedActionId: state.selectedActionId,
    undoDepth: state.undoStack.length,
    redoDepth: state.redoStack.length,
    zoom: state.zoom,
    canvas: {
      width: canvas.width,
      height: canvas.height
    }
  };
}

window.__olhoEditorTestApi = {
  listVisibleTools() {
    return toolButtons.map((button) => button.dataset.tool).filter(Boolean);
  },
  getSnapshot() {
    return getEditorTestSnapshot();
  },
  setTool(tool) {
    setTool(tool);
    return state.tool;
  },
  setStyle(patch = {}) {
    if (typeof patch.strokeColor === "string") state.style.strokeColor = patch.strokeColor;
    if (typeof patch.fillColor === "string") state.style.fillColor = patch.fillColor;
    if (Number.isFinite(Number(patch.opacity))) state.style.opacity = clamp(Number(patch.opacity), 0.1, 1);
    if (Number.isFinite(Number(patch.strokeWidth))) state.style.strokeWidth = clamp(Number(patch.strokeWidth), 1, 24);
    if (Number.isFinite(Number(patch.fontSize))) state.style.fontSize = clamp(Number(patch.fontSize), 10, 120);
    if (typeof patch.fontFamily === "string" && patch.fontFamily.trim()) state.style.fontFamily = patch.fontFamily;
    if (typeof patch.arrowStyle === "string" && ["filled", "open"].includes(patch.arrowStyle)) {
      state.style.arrowStyle = patch.arrowStyle;
    }
    if (Number.isFinite(Number(patch.blurStrength))) state.style.blurStrength = clamp(Number(patch.blurStrength), 2, 40);
    if (Number.isFinite(Number(patch.pixelStrength))) state.style.pixelStrength = clamp(Number(patch.pixelStrength), 4, 64);
    syncStyleControls();
    render();
    return { ...state.style };
  },
  dragAction(start, end, tool = state.tool) {
    setTool(tool);
    const draft = createDraftAction(tool, start);
    if (!draft) {
      throw new Error(`Tool ${tool} does not support drag actions.`);
    }
    updateDraftAction(draft, end);
    const bounds = getActionBounds(draft);
    if (!bounds || bounds.width < 2 || bounds.height < 2) {
      throw new Error("Dragged action bounds are too small.");
    }
    pushUndoSnapshot();
    state.actions.push(cloneAction(draft));
    state.selectedActionId = draft.id;
    renderAnnotationList();
    render();
    scheduleDraftSave();
    return getEditorTestSnapshot();
  },
  addTextAction({ tool = TOOL_TYPES.TEXT, text = "Text", x = 120, y = 120 } = {}) {
    const value = sanitizeText(text);
    if (!value) throw new Error("Text is required.");
    if (![TOOL_TYPES.TEXT, TOOL_TYPES.CALLOUT].includes(tool)) {
      throw new Error("Tool must be text or callout.");
    }
    pushUndoSnapshot();
    appendTextAction(tool, value, { x, y });
    return getEditorTestSnapshot();
  },
  addNumberMarker({ x = 120, y = 120 } = {}) {
    pushUndoSnapshot();
    appendNumberMarker({ x, y });
    return getEditorTestSnapshot();
  },
  selectAt(point) {
    setTool(TOOL_TYPES.SELECT);
    handleSelectPointerDown(point);
    return getEditorTestSnapshot();
  },
  selectActionById(actionId) {
    const id = String(actionId || "");
    const exists = state.actions.some((action) => action.id === id);
    if (!exists) {
      throw new Error(`Action not found: ${id}`);
    }
    setTool(TOOL_TYPES.SELECT);
    state.selectedActionId = id;
    renderAnnotationList();
    render();
    return getEditorTestSnapshot();
  },
  moveSelectedBy(dx = 0, dy = 0) {
    const selected = getSelectedAction();
    if (!selected) throw new Error("No selected action to move.");
    pushUndoSnapshot();
    updateActionById(selected.id, moveAction(selected, dx, dy));
    renderAnnotationList();
    render();
    scheduleDraftSave();
    return getEditorTestSnapshot();
  },
  resizeSelectedTo(rect = {}) {
    const selected = getSelectedAction();
    if (!selected) throw new Error("No selected action to resize.");
    const fromRect = getActionBounds(selected);
    if (!fromRect) throw new Error("Selected action has no bounds.");
    const nextRect = {
      x: Number.isFinite(Number(rect.x)) ? Number(rect.x) : fromRect.x,
      y: Number.isFinite(Number(rect.y)) ? Number(rect.y) : fromRect.y,
      width: Math.max(2, Number.isFinite(Number(rect.width)) ? Number(rect.width) : fromRect.width),
      height: Math.max(2, Number.isFinite(Number(rect.height)) ? Number(rect.height) : fromRect.height)
    };
    pushUndoSnapshot();
    updateActionById(selected.id, resizeActionToRect(selected, fromRect, nextRect));
    renderAnnotationList();
    render();
    scheduleDraftSave();
    return getEditorTestSnapshot();
  },
  adjustSelectedArrowEnd({ dx = 0, dy = 0 } = {}) {
    const selected = getSelectedAction();
    if (!selected || ![TOOL_TYPES.ARROW, TOOL_TYPES.LINE].includes(selected.type)) {
      throw new Error("Selected action is not an arrow or line.");
    }
    pushUndoSnapshot();
    const next = cloneAction(selected);
    next.end = {
      x: next.end.x + Number(dx || 0),
      y: next.end.y + Number(dy || 0)
    };
    updateActionById(next.id, next);
    renderAnnotationList();
    render();
    scheduleDraftSave();
    return getEditorTestSnapshot();
  },
  updateSelectedStyle(patch = {}) {
    const selected = getSelectedAction();
    if (!selected) throw new Error("No selected action.");
    pushUndoSnapshot();
    const next = cloneAction(selected);
    if (typeof patch.strokeColor === "string") next.strokeColor = patch.strokeColor;
    if (typeof patch.fillColor === "string") next.fillColor = patch.fillColor;
    if (Number.isFinite(Number(patch.opacity))) next.opacity = clamp(Number(patch.opacity), 0.1, 1);
    if (Number.isFinite(Number(patch.strokeWidth))) next.strokeWidth = clamp(Number(patch.strokeWidth), 1, 24);
    if (Number.isFinite(Number(patch.fontSize))) next.fontSize = clamp(Number(patch.fontSize), 10, 120);
    updateActionById(next.id, next);
    renderAnnotationList();
    render();
    scheduleDraftSave();
    return getEditorTestSnapshot();
  },
  async applyCropRect(rect = {}) {
    setTool(TOOL_TYPES.CROP);
    cropTool.rect = {
      x: Math.max(0, Number(rect.x || 0)),
      y: Math.max(0, Number(rect.y || 0)),
      width: Math.max(24, Number(rect.width || 120)),
      height: Math.max(24, Number(rect.height || 80))
    };
    updateCropMetrics(cropTool.rect);
    render();
    await applyCrop();
    return getEditorTestSnapshot();
  },
  async applyResizeSize(width, height) {
    setTool(TOOL_TYPES.RESIZE);
    resizeTool.setSize(width, height);
    await applyResize();
    return getEditorTestSnapshot();
  },
  async exportBlobInfo(format = "png") {
    const blob = await exportImageBlob(format);
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    return {
      format,
      type: blob.type,
      size: blob.size,
      head: Array.from(head)
    };
  },
  async saveCopyAndGetItemId() {
    await saveEditedCopy();
    return state.currentItemId || null;
  },
  async copyPng() {
    return copyToClipboard();
  },
  async undo() {
    await undo();
    return getEditorTestSnapshot();
  },
  async redo() {
    await redo();
    return getEditorTestSnapshot();
  },
  clearAll() {
    clearAllAnnotations();
    return getEditorTestSnapshot();
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createActionId() {
  return crypto.randomUUID();
}

function sanitizeText(text) {
  return String(text || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 3000);
}

function parseTags(value) {
  if (!value) return [];
  const tags = value
    .split(",")
    .map((tag) => sanitizeText(tag).toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(tags));
}

function sanitizeFilenameLabel(name) {
  return String(name || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function isAcceptedLocalImageType(type) {
  return ACCEPTED_LOCAL_IMAGE_TYPES.has(String(type || "").toLowerCase());
}

function clearEditingStateForFreshImage() {
  state.currentItemId = null;
  state.projectBaseItemId = null;
  state.actions = [];
  state.selectedActionId = null;
  state.markerCounter = 1;
  state.undoStack = [];
  state.redoStack = [];
}

function actionLabel(action) {
  if (!action) return "Unknown";
  const map = {
    [TOOL_TYPES.DRAW]: "Pen Stroke",
    [TOOL_TYPES.HIGHLIGHT]: "Highlighter",
    [TOOL_TYPES.LINE]: "Line",
    [TOOL_TYPES.ARROW]: "Arrow",
    [TOOL_TYPES.RECT]: "Rectangle",
    [TOOL_TYPES.ROUNDED_RECT]: "Rounded Rectangle",
    [TOOL_TYPES.ELLIPSE]: "Ellipse",
    [TOOL_TYPES.TEXT]: `Text: ${String(action.text || "").slice(0, 18)}`,
    [TOOL_TYPES.NUMBER_MARKER]: `Marker #${action.number}`,
    [TOOL_TYPES.CALLOUT]: `Callout: ${String(action.text || "").slice(0, 18)}`,
    [TOOL_TYPES.BLUR]: "Blur",
    [TOOL_TYPES.PIXELATE]: "Pixelate",
    [TOOL_TYPES.REDACT]: "Redaction"
  };
  return map[action.type] || action.type;
}

function rectFromPoints(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function pointInRect(point, rect, padding = 0) {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  );
}

function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    const sx = point.x - start.x;
    const sy = point.y - start.y;
    return Math.hypot(sx, sy);
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function pointNearPolyline(point, points, radius) {
  if (!Array.isArray(points) || points.length < 2) return false;
  for (let i = 1; i < points.length; i += 1) {
    if (distancePointToSegment(point, points[i - 1], points[i]) <= radius) {
      return true;
    }
  }
  return false;
}

function pointInEllipse(point, rect, padding = 0) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = Math.max(1, rect.width / 2 + padding);
  const ry = Math.max(1, rect.height / 2 + padding);
  const nx = (point.x - cx) / rx;
  const ny = (point.y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function pointInCircle(point, cx, cy, radius, padding = 0) {
  const dx = point.x - cx;
  const dy = point.y - cy;
  return dx * dx + dy * dy <= (radius + padding) * (radius + padding);
}

function hitTestAction(action, point) {
  if (!action) return false;

  if (action.type === TOOL_TYPES.DRAW || action.type === TOOL_TYPES.HIGHLIGHT) {
    const radius = Math.max(HIT_TOLERANCE, (action.strokeWidth || state.style.strokeWidth) / 2 + HIT_TOLERANCE * 0.5);
    return pointNearPolyline(point, action.points, radius);
  }

  if (action.type === TOOL_TYPES.LINE || action.type === TOOL_TYPES.ARROW) {
    const radius = Math.max(HIT_TOLERANCE, (action.strokeWidth || state.style.strokeWidth) / 2 + HIT_TOLERANCE * 0.5);
    return distancePointToSegment(point, action.start, action.end) <= radius;
  }

  if (action.type === TOOL_TYPES.ELLIPSE) {
    const bounds = getActionBounds(action);
    if (!bounds) return false;
    return pointInEllipse(point, bounds, Math.max(HIT_TOLERANCE, (action.strokeWidth || 2) / 2));
  }

  if (action.type === TOOL_TYPES.RECT || action.type === TOOL_TYPES.ROUNDED_RECT) {
    const bounds = getActionBounds(action);
    if (!bounds) return false;
    const strokePad = Math.max(HIT_TOLERANCE, (action.strokeWidth || 2) / 2);
    const outer = pointInRect(point, bounds, strokePad);
    if (!outer) return false;
    if (action.fillColor && action.fillColor !== "transparent") {
      return true;
    }
    return !pointInRect(point, bounds, -strokePad);
  }

  if (action.type === TOOL_TYPES.BLUR || action.type === TOOL_TYPES.PIXELATE || action.type === TOOL_TYPES.REDACT) {
    const bounds = getActionBounds(action);
    if (!bounds) return false;
    return pointInRect(point, bounds, 1);
  }

  if (action.type === TOOL_TYPES.TEXT || action.type === TOOL_TYPES.CALLOUT) {
    const bounds = getActionBounds(action);
    if (!bounds) return false;
    return pointInRect(point, bounds, 2);
  }

  if (action.type === TOOL_TYPES.NUMBER_MARKER) {
    return pointInCircle(point, action.x, action.y, action.radius || 16, Math.max(2, HIT_TOLERANCE * 0.5));
  }

  const bounds = getActionBounds(action);
  if (!bounds) return false;
  return pointInRect(point, bounds, HIT_TOLERANCE);
}

function getActionBounds(action) {
  if (!action) return null;

  if (action.type === TOOL_TYPES.DRAW || action.type === TOOL_TYPES.HIGHLIGHT) {
    const xs = action.points.map((point) => point.x);
    const ys = action.points.map((point) => point.y);
    if (!xs.length) return null;
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(2, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(2, Math.max(...ys) - Math.min(...ys))
    };
  }

  if (action.type === TOOL_TYPES.LINE || action.type === TOOL_TYPES.ARROW) {
    return rectFromPoints(action.start, action.end);
  }

  if (RECT_TOOLS.has(action.type)) {
    return {
      x: action.x,
      y: action.y,
      width: action.width,
      height: action.height
    };
  }

  if (action.type === TOOL_TYPES.TEXT) {
    const width = Math.max(30, action.textWidth || (action.text ? action.text.length * action.fontSize * 0.55 : 30));
    const height = Math.max(20, action.textHeight || action.fontSize * 1.3);
    return {
      x: action.x,
      y: action.y,
      width,
      height
    };
  }

  if (action.type === TOOL_TYPES.NUMBER_MARKER) {
    const radius = action.radius || 16;
    return {
      x: action.x - radius,
      y: action.y - radius,
      width: radius * 2,
      height: radius * 2
    };
  }

  if (action.type === TOOL_TYPES.CALLOUT) {
    return {
      x: action.x,
      y: action.y,
      width: action.width,
      height: action.height
    };
  }

  return null;
}

function getSelectionHandles(bounds) {
  const size = HANDLE_SIZE / Math.max(0.001, state.zoom);
  const half = size / 2;
  const { x, y, width, height } = bounds;
  return {
    nw: { x: x - half, y: y - half, size },
    ne: { x: x + width - half, y: y - half, size },
    sw: { x: x - half, y: y + height - half, size },
    se: { x: x + width - half, y: y + height - half, size }
  };
}

function hitSelectionHandle(point, bounds) {
  const handles = getSelectionHandles(bounds);
  for (const [name, handle] of Object.entries(handles)) {
    if (
      point.x >= handle.x &&
      point.x <= handle.x + handle.size &&
      point.y >= handle.y &&
      point.y <= handle.y + handle.size
    ) {
      return name;
    }
  }
  return null;
}

function getEndpointHandles(action) {
  if (!action || !action.start || !action.end) {
    return null;
  }
  const radius = ENDPOINT_HANDLE_RADIUS / Math.max(0.001, state.zoom);
  return {
    start: {
      x: action.start.x,
      y: action.start.y,
      radius
    },
    end: {
      x: action.end.x,
      y: action.end.y,
      radius
    }
  };
}

function hitEndpointHandle(point, action) {
  const handles = getEndpointHandles(action);
  if (!handles) return null;
  for (const [name, handle] of Object.entries(handles)) {
    if (pointInCircle(point, handle.x, handle.y, handle.radius, HIT_TOLERANCE / Math.max(0.001, state.zoom))) {
      return name;
    }
  }
  return null;
}

function deepClone(value) {
  return structuredClone(value);
}

function cloneAction(action) {
  return deepClone(action);
}

function scalePoint(point, fromRect, toRect) {
  const sx = fromRect.width === 0 ? 1 : toRect.width / fromRect.width;
  const sy = fromRect.height === 0 ? 1 : toRect.height / fromRect.height;
  return {
    x: toRect.x + (point.x - fromRect.x) * sx,
    y: toRect.y + (point.y - fromRect.y) * sy
  };
}

function moveAction(action, dx, dy) {
  const next = cloneAction(action);

  if (next.points) {
    next.points = next.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  }

  if (next.start) {
    next.start = { x: next.start.x + dx, y: next.start.y + dy };
  }

  if (next.end) {
    next.end = { x: next.end.x + dx, y: next.end.y + dy };
  }

  if (typeof next.x === "number") {
    next.x += dx;
  }

  if (typeof next.y === "number") {
    next.y += dy;
  }

  return next;
}

function resizeActionToRect(action, fromRect, toRect) {
  const next = cloneAction(action);

  if (next.points) {
    next.points = next.points.map((point) => scalePoint(point, fromRect, toRect));
  }

  if (next.start) {
    next.start = scalePoint(next.start, fromRect, toRect);
  }

  if (next.end) {
    next.end = scalePoint(next.end, fromRect, toRect);
  }

  if (RECT_TOOLS.has(next.type) || next.type === TOOL_TYPES.CALLOUT) {
    next.x = toRect.x;
    next.y = toRect.y;
    next.width = Math.max(2, toRect.width);
    next.height = Math.max(2, toRect.height);
  }

  if (next.type === TOOL_TYPES.TEXT) {
    next.x = toRect.x;
    next.y = toRect.y;
    next.textWidth = Math.max(30, toRect.width);
    next.textHeight = Math.max(next.fontSize * 1.25, toRect.height);
  }

  if (next.type === TOOL_TYPES.NUMBER_MARKER) {
    const center = {
      x: fromRect.x + fromRect.width / 2,
      y: fromRect.y + fromRect.height / 2
    };
    const targetCenter = {
      x: toRect.x + toRect.width / 2,
      y: toRect.y + toRect.height / 2
    };
    const dx = targetCenter.x - center.x;
    const dy = targetCenter.y - center.y;
    if (typeof next.x === "number") next.x += dx;
    if (typeof next.y === "number") next.y += dy;
  }

  return next;
}

function rotatePointCW(point, width, _height) {
  return {
    x: width - point.y,
    y: point.x
  };
}

function rotatePointCCW(point, _width, height) {
  return {
    x: point.y,
    y: height - point.x
  };
}

function rotateAction(action, direction, width, height) {
  const next = cloneAction(action);
  const rotate = direction === "cw" ? rotatePointCW : rotatePointCCW;

  if (next.points) {
    next.points = next.points.map((point) => rotate(point, width, height));
  }

  if (next.start) {
    next.start = rotate(next.start, width, height);
  }

  if (next.end) {
    next.end = rotate(next.end, width, height);
  }

  if (typeof next.x === "number" && typeof next.y === "number") {
    const p = rotate({ x: next.x, y: next.y }, width, height);
    next.x = p.x;
    next.y = p.y;
  }

  if (typeof next.width === "number" && typeof next.height === "number") {
    const oldWidth = next.width;
    next.width = next.height;
    next.height = oldWidth;
  }

  return next;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdown(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\n/g, " ");
}

function getDraftStorageArea() {
  return chrome?.storage?.session || null;
}

async function setup() {
  annotationWorkCanvas.width = canvas.width;
  annotationWorkCanvas.height = canvas.height;
  bindEvents();
  syncStyleControls();
  updateToolOptionVisibility(state.tool);
  updateZoom();
  await initLoad();
  render();
}

function bindEvents() {
  toolButtons.forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  galleryBtn.addEventListener("click", openGallery);
  openLocalImageBtn.addEventListener("click", () => localImageInput.click());
  openLocalImageToolbarBtn?.addEventListener("click", () => localImageInput.click());
  pasteImageBtn.addEventListener("click", async () => {
    try {
      await pasteImageFromClipboard();
    } catch (error) {
      showToast(String(error?.message || error), true);
    }
  });
  openExportPanelBtn.addEventListener("click", () => {
    const exportSection = document.getElementById("inspectorExportSection");
    if (exportSection instanceof HTMLDetailsElement) {
      exportSection.open = true;
    }
    exportFormatInput?.focus();
    document.getElementById("exportHint")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  saveCopyBtn.addEventListener("click", () => saveEditedCopy());
  overwriteBtn.addEventListener("click", () => openOverwriteDialog(overwriteBtn));
  resetEditsBtn.addEventListener("click", () => {
    resetEdits().catch((error) => {
      console.error(error);
      showToast("Reset edits failed.", true);
    });
  });

  exportCopyBtn.addEventListener("click", () => copyToClipboard());
  exportDownloadBtn.addEventListener("click", () => downloadExport());
  secureRedactionBtn.addEventListener("click", () => saveSecureRedactionCopy());
  copyMarkdownBtn.addEventListener("click", copyMarkdownReference);
  copyHtmlBtn.addEventListener("click", copyHtmlSnippet);

  strokeColorInput.addEventListener("input", () => {
    state.style.strokeColor = strokeColorInput.value;
    applyLiveStyleToSelection({ strokeColor: state.style.strokeColor });
  });

  fillColorInput.addEventListener("input", () => {
    state.style.fillColor = fillColorInput.value;
    applyLiveStyleToSelection({ fillColor: state.style.fillColor });
  });

  opacityRange.addEventListener("input", () => {
    state.style.opacity = Number(opacityRange.value);
    opacityValue.textContent = `${Math.round(state.style.opacity * 100)}%`;
    applyLiveStyleToSelection({ opacity: state.style.opacity });
  });

  strokeWidthInput.addEventListener("input", () => {
    state.style.strokeWidth = Number(strokeWidthInput.value);
    strokeValue.textContent = `${state.style.strokeWidth}px`;
    applyLiveStyleToSelection({ strokeWidth: state.style.strokeWidth });
  });

  fontSizeInput.addEventListener("input", () => {
    state.style.fontSize = clamp(Number(fontSizeInput.value || 28), 10, 120);
    applyLiveStyleToSelection({ fontSize: state.style.fontSize });
  });

  fontFamilyInput.addEventListener("change", () => {
    state.style.fontFamily = fontFamilyInput.value;
    applyLiveStyleToSelection({ fontFamily: state.style.fontFamily });
  });

  arrowStyleInput.addEventListener("change", () => {
    state.style.arrowStyle = arrowStyleInput.value;
    applyLiveStyleToSelection({ arrowStyle: state.style.arrowStyle });
  });

  blurStrengthInput.addEventListener("input", () => {
    state.style.blurStrength = Number(blurStrengthInput.value);
    blurValue.textContent = `${state.style.blurStrength}px`;
    applyLiveStyleToSelection({ blurStrength: state.style.blurStrength });
    render();
  });

  pixelStrengthInput.addEventListener("input", () => {
    state.style.pixelStrength = Number(pixelStrengthInput.value);
    pixelValue.textContent = String(state.style.pixelStrength);
    applyLiveStyleToSelection({ pixelStrength: state.style.pixelStrength });
    render();
  });

  applyTitleBtn.addEventListener("click", () => {
    state.itemTitle = sanitizeText(itemTitleInput.value) || "";
    itemTitleInput.value = state.itemTitle;
    showToast("Title updated.");
    scheduleDraftSave();
  });

  applyTagsBtn.addEventListener("click", () => {
    state.itemTags = parseTags(itemTagsInput.value);
    itemTagsInput.value = state.itemTags.join(", ");
    showToast("Tags updated.");
    scheduleDraftSave();
  });

  rotateLeftBtn.addEventListener("click", () => rotateCanvasAndActions("ccw"));
  rotateRightBtn.addEventListener("click", () => rotateCanvasAndActions("cw"));
  undoBtn.addEventListener("click", () => undo());
  redoBtn.addEventListener("click", () => redo());
  duplicateBtn.addEventListener("click", () => duplicateSelectedAction());
  deleteSelectedBtn.addEventListener("click", () => deleteSelectedAction());
  clearAllBtn.addEventListener("click", () => clearAllAnnotations());

  zoomInBtn.addEventListener("click", () => setZoom(state.zoom + 0.1));
  zoomOutBtn.addEventListener("click", () => setZoom(state.zoom - 0.1));
  fitBtn.addEventListener("click", () => fitToScreen());
  actualSizeBtn.addEventListener("click", () => setZoom(1));

  applyCropBtn.addEventListener("click", () => applyCrop());
  cancelCropBtn.addEventListener("click", () => setTool(TOOL_TYPES.SELECT));

  resizeWidth.addEventListener("input", () => syncResize("width"));
  resizeHeight.addEventListener("input", () => syncResize("height"));
  resizeLock.addEventListener("change", () => {
    resizeTool.setLockRatio(resizeLock.checked);
  });
  applyResizeBtn.addEventListener("click", () => applyResize());
  cancelResizeBtn.addEventListener("click", () => setTool(TOOL_TYPES.SELECT));

  exportAnnotationJsonBtn.addEventListener("click", () => exportAnnotationJson());
  exportProjectBtn.addEventListener("click", () => exportProjectFile());
  importProjectBtn.addEventListener("click", () => projectFileInput.click());
  projectFileInput.addEventListener("change", () => importProjectFile());
  localImageInput.addEventListener("change", () => handleImageFileInputChange());

  overwriteCancelBtn.addEventListener("click", () => {
    overwriteDialog.close("cancel");
  });
  overwriteConfirmBtn.addEventListener("click", async () => {
    overwriteDialog.close("confirm");
    await overwriteCurrentItem();
  });
  overwriteDialog.addEventListener("close", () => {
    const invoker = lastDialogInvoker;
    lastDialogInvoker = null;
    if (invoker && typeof invoker.focus === "function") {
      queueMicrotask(() => invoker.focus());
      requestAnimationFrame(() => invoker.focus());
    }
  });

  canvas.addEventListener("pointerdown", onCanvasPointerDown);
  canvas.addEventListener("pointermove", onCanvasPointerMove);
  canvas.addEventListener("pointerup", onCanvasPointerUp);
  canvas.addEventListener("pointercancel", onCanvasPointerCancel);
  canvasShell.addEventListener("dragenter", (event) => {
    event.preventDefault();
    showDropHint(true);
  });
  canvasShell.addEventListener("dragover", (event) => {
    event.preventDefault();
    showDropHint(true);
  });
  canvasShell.addEventListener("dragleave", (event) => {
    if (!canvasShell.contains(event.relatedTarget)) {
      showDropHint(false);
    }
  });
  canvasShell.addEventListener("drop", async (event) => {
    event.preventDefault();
    showDropHint(false);
    const files = Array.from(event.dataTransfer?.files || []);
    const imageFile = files.find((file) => isAcceptedLocalImageType(file.type));
    if (!imageFile) {
      showToast("Unsupported file type. Use PNG, JPG, or WebP.", true);
      return;
    }
    try {
      await importImageFile(imageFile);
    } catch (error) {
      showToast(String(error?.message || error), true);
    }
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("paste", (event) => {
    handlePasteEvent(event).catch((error) => {
      showToast(String(error?.message || error), true);
    });
  });
}

function syncStyleControls() {
  strokeColorInput.value = state.style.strokeColor;
  fillColorInput.value = state.style.fillColor;
  opacityRange.value = String(state.style.opacity);
  opacityValue.textContent = `${Math.round(state.style.opacity * 100)}%`;
  strokeWidthInput.value = String(state.style.strokeWidth);
  strokeValue.textContent = `${state.style.strokeWidth}px`;
  fontSizeInput.value = String(state.style.fontSize);
  fontFamilyInput.value = state.style.fontFamily;
  arrowStyleInput.value = state.style.arrowStyle;
  blurStrengthInput.value = String(state.style.blurStrength);
  blurValue.textContent = `${state.style.blurStrength}px`;
  pixelStrengthInput.value = String(state.style.pixelStrength);
  pixelValue.textContent = String(state.style.pixelStrength);
}

function applyLiveStyleToSelection(patch = {}) {
  const selected = getSelectedAction();
  if (!selected) return;

  const next = cloneAction(selected);
  let changed = false;

  if (typeof patch.strokeColor === "string" && next.strokeColor !== patch.strokeColor) {
    next.strokeColor = patch.strokeColor;
    changed = true;
  }
  if (typeof patch.fillColor === "string" && "fillColor" in next && next.fillColor !== patch.fillColor) {
    next.fillColor = patch.fillColor;
    changed = true;
  }
  if (Number.isFinite(Number(patch.opacity)) && next.opacity !== patch.opacity) {
    next.opacity = clamp(Number(patch.opacity), 0.1, 1);
    changed = true;
  }
  if (Number.isFinite(Number(patch.strokeWidth)) && "strokeWidth" in next && next.strokeWidth !== patch.strokeWidth) {
    next.strokeWidth = clamp(Number(patch.strokeWidth), 1, 24);
    changed = true;
  }
  if (Number.isFinite(Number(patch.fontSize)) && "fontSize" in next && next.fontSize !== patch.fontSize) {
    const nextSize = clamp(Number(patch.fontSize), 10, 120);
    next.fontSize = nextSize;
    if (next.type === TOOL_TYPES.TEXT) {
      const lines = String(next.text || "").split("\n");
      const lineCount = Math.max(1, lines.length);
      next.textHeight = Math.max(nextSize * 1.25, lineCount * nextSize * 1.25);
      if (!Number.isFinite(Number(next.textWidth)) || next.textWidth < 20) {
        next.textWidth = Math.max(...lines.map((line) => line.length), 1) * nextSize * 0.6;
      }
    }
    changed = true;
  }
  if (typeof patch.fontFamily === "string" && "fontFamily" in next && next.fontFamily !== patch.fontFamily) {
    next.fontFamily = patch.fontFamily;
    changed = true;
  }
  if (typeof patch.arrowStyle === "string" && next.type === TOOL_TYPES.ARROW && next.arrowStyle !== patch.arrowStyle) {
    next.arrowStyle = patch.arrowStyle;
    changed = true;
  }
  if (Number.isFinite(Number(patch.blurStrength)) && next.type === TOOL_TYPES.BLUR && next.blurStrength !== patch.blurStrength) {
    next.blurStrength = clamp(Number(patch.blurStrength), 2, 40);
    changed = true;
  }
  if (Number.isFinite(Number(patch.pixelStrength)) && next.type === TOOL_TYPES.PIXELATE && next.pixelStrength !== patch.pixelStrength) {
    next.pixelStrength = clamp(Number(patch.pixelStrength), 4, 64);
    changed = true;
  }

  if (!changed) return;
  updateActionById(next.id, next);
  renderAnnotationList();
  render();
  scheduleDraftSave();
}

function openOverwriteDialog(invoker) {
  if (!state.currentItemId) {
    showToast("No current item to overwrite.", true);
    return;
  }
  lastDialogInvoker = invoker;
  overwriteDialog.showModal();
  overwriteConfirmBtn.focus();
}

function setTool(tool) {
  if (!tool || !Object.values(TOOL_TYPES).includes(tool)) {
    return;
  }

  if (textComposer) {
    destroyTextComposer();
  }

  state.tool = tool;
  state.pendingAction = null;
  state.dragMode = null;
  state.resizeHandle = null;
  state.endpointHandle = null;

  toolButtons.forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  syncToolGroupOpenState(tool);
  updateToolOptionVisibility(tool);

  const cropMode = tool === TOOL_TYPES.CROP;
  cropPanel.hidden = !cropMode;
  if (cropMode) {
    resizePanel.hidden = true;
    resizeTool.disable();
    cropTool.enable();
    cropTool.setZoom(state.zoom);
  } else {
    cropTool.disable();
  }

  const resizeMode = tool === TOOL_TYPES.RESIZE;
  if (resizeMode) {
    cropPanel.hidden = true;
    resizePanel.hidden = false;
    cropTool.disable();
    resizeTool.enable();
    resizeTool.setZoom(state.zoom);
    resizeTool.setSize(canvas.width, canvas.height);
    resizeTool.setLockRatio(resizeLock.checked);
    resizeWidth.value = String(canvas.width);
    resizeHeight.value = String(canvas.height);
  } else {
    resizeTool.disable();
    if (tool !== TOOL_TYPES.CROP) {
      resizePanel.hidden = true;
    }
  }
  if (transformActionBar) {
    transformActionBar.hidden = !cropMode && !resizeMode;
  }

  if (tool !== TOOL_TYPES.SELECT) {
    state.selectedActionId = null;
    renderAnnotationList();
  }

  render();
}

function syncToolGroupOpenState(tool) {
  const targetGroup = TOOL_GROUP_BY_TOOL[tool];
  if (!targetGroup) return;

  toolGroups.forEach((group) => {
    const groupName = group.dataset.toolGroup;
    if (groupName === targetGroup) {
      group.open = true;
    }
  });
}

function updateToolOptionVisibility(tool) {
  toolOptionGroups.forEach((group) => {
    const scopes = String(group.dataset.toolScope || "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!scopes.length) {
      group.hidden = false;
      return;
    }
    group.hidden = !scopes.includes(tool);
  });
}

function onCanvasPointerDown(event) {
  if (state.tool === TOOL_TYPES.CROP || state.tool === TOOL_TYPES.RESIZE) {
    return;
  }

  const point = toCanvasPoint(event);
  if (event.cancelable) {
    event.preventDefault();
  }
  state.pointerId = event.pointerId;
  try {
    if (typeof canvas.setPointerCapture === "function") {
      canvas.setPointerCapture(state.pointerId);
    }
  } catch {
    // Pointer capture can fail in some automation/headless paths. Keep
    // interaction working without aborting the event handler.
  }

  if (state.tool === TOOL_TYPES.SELECT) {
    handleSelectPointerDown(point);
    return;
  }

  if (TEXT_TOOLS.has(state.tool)) {
    openTextComposer(state.tool, point);
    return;
  }

  if (state.tool === TOOL_TYPES.NUMBER_MARKER) {
    pushUndoSnapshot();
    appendNumberMarker(point);
    return;
  }

  const draft = createDraftAction(state.tool, point);
  if (!draft) {
    return;
  }

  state.pendingAction = draft;
  state.dragMode = "draw";
  state.dragStart = point;
  render();
}

function onCanvasPointerMove(event) {
  if (event.pointerId !== state.pointerId) {
    return;
  }

  const point = toCanvasPoint(event);

  if (state.dragMode === "draw" && state.pendingAction) {
    updateDraftAction(state.pendingAction, point);
    render();
    return;
  }

  if (state.dragMode === "move-selection" && state.selectedActionId && state.dragActionSnapshot) {
    const dx = point.x - state.dragStart.x;
    const dy = point.y - state.dragStart.y;
    updateActionById(state.selectedActionId, moveAction(state.dragActionSnapshot, dx, dy));
    renderAnnotationList();
    render();
    return;
  }

  if (state.dragMode === "endpoint-selection" && state.selectedActionId && state.dragActionSnapshot && state.endpointHandle) {
    const nextAction = cloneAction(state.dragActionSnapshot);
    if (state.endpointHandle === "start" && nextAction.start) {
      nextAction.start = { x: point.x, y: point.y };
    } else if (state.endpointHandle === "end" && nextAction.end) {
      nextAction.end = { x: point.x, y: point.y };
    }
    updateActionById(state.selectedActionId, nextAction);
    renderAnnotationList();
    render();
    return;
  }

  if (state.dragMode === "resize-selection" && state.selectedActionId && state.dragBoundsSnapshot) {
    const nextRect = resizeRectFromHandle(state.dragBoundsSnapshot, state.resizeHandle, point);
    const nextAction = resizeActionToRect(state.dragActionSnapshot, state.dragBoundsSnapshot, nextRect);
    updateActionById(state.selectedActionId, nextAction);
    renderAnnotationList();
    render();
  }
}

function onCanvasPointerUp(event) {
  if (event.pointerId !== state.pointerId) {
    return;
  }

  if (state.dragMode === "draw" && state.pendingAction) {
    // Commit final pointer position so quick drags without move events still
    // capture a real segment/shape endpoint.
    updateDraftAction(state.pendingAction, toCanvasPoint(event));
    finalizePendingAction();
  } else if (
    state.dragMode === "move-selection" ||
    state.dragMode === "resize-selection" ||
    state.dragMode === "endpoint-selection"
  ) {
    scheduleDraftSave();
  }

  state.pendingAction = null;
  state.dragMode = null;
  state.dragStart = null;
  state.dragActionSnapshot = null;
  state.dragBoundsSnapshot = null;
  state.resizeHandle = null;
  state.endpointHandle = null;

  try {
    if (typeof canvas.releasePointerCapture === "function") {
      canvas.releasePointerCapture(state.pointerId);
    }
  } catch {
    // Best effort. Release may throw if capture was never established.
  }
  state.pointerId = null;
}

function onCanvasPointerCancel(event) {
  if (event.pointerId !== state.pointerId) {
    return;
  }
  if (event.cancelable) {
    event.preventDefault();
  }

  if (state.dragActionSnapshot && state.selectedActionId) {
    updateActionById(state.selectedActionId, state.dragActionSnapshot);
  }

  state.pendingAction = null;
  state.dragMode = null;
  state.dragStart = null;
  state.dragActionSnapshot = null;
  state.dragBoundsSnapshot = null;
  state.resizeHandle = null;
  state.endpointHandle = null;

  try {
    if (typeof canvas.releasePointerCapture === "function") {
      canvas.releasePointerCapture(state.pointerId);
    }
  } catch {
    // Best effort.
  }
  state.pointerId = null;
  renderAnnotationList();
  render();
}

function createDraftAction(tool, point) {
  if (tool === TOOL_TYPES.DRAW || tool === TOOL_TYPES.HIGHLIGHT) {
    return {
      id: createActionId(),
      type: tool,
      points: [point],
      strokeColor: state.style.strokeColor,
      strokeWidth: state.style.strokeWidth,
      opacity: tool === TOOL_TYPES.HIGHLIGHT ? Math.min(0.45, state.style.opacity) : state.style.opacity
    };
  }

  if (tool === TOOL_TYPES.LINE || tool === TOOL_TYPES.ARROW) {
    return {
      id: createActionId(),
      type: tool,
      start: point,
      end: point,
      strokeColor: state.style.strokeColor,
      strokeWidth: state.style.strokeWidth,
      opacity: state.style.opacity,
      arrowStyle: state.style.arrowStyle
    };
  }

  if (RECT_TOOLS.has(tool)) {
    return {
      id: createActionId(),
      type: tool,
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
      strokeColor: state.style.strokeColor,
      fillColor: state.style.fillColor,
      strokeWidth: state.style.strokeWidth,
      opacity: state.style.opacity,
      radius: Math.max(4, state.style.strokeWidth * 2),
      blurStrength: state.style.blurStrength,
      pixelStrength: state.style.pixelStrength
    };
  }

  return null;
}

function appendNumberMarker(point) {
  const marker = {
    id: createActionId(),
    type: TOOL_TYPES.NUMBER_MARKER,
    x: point.x,
    y: point.y,
    radius: clamp(state.style.strokeWidth * 3, 12, 36),
    number: state.markerCounter,
    fillColor: state.style.fillColor,
    strokeColor: state.style.strokeColor,
    textColor: "#ffffff",
    opacity: state.style.opacity
  };
  state.markerCounter += 1;
  state.actions.push(marker);
  state.selectedActionId = marker.id;
  renderAnnotationList();
  render();
  scheduleDraftSave();
  return marker;
}

function appendTextAction(type, text, point) {
  if (type === TOOL_TYPES.TEXT) {
    const lines = text.split("\n");
    const textWidth = Math.max(...lines.map((line) => line.length), 1) * state.style.fontSize * 0.6;
    state.actions.push({
      id: createActionId(),
      type: TOOL_TYPES.TEXT,
      x: point.x,
      y: point.y,
      text,
      strokeColor: state.style.strokeColor,
      opacity: state.style.opacity,
      fontSize: state.style.fontSize,
      fontFamily: state.style.fontFamily,
      textWidth,
      textHeight: lines.length * state.style.fontSize * 1.3
    });
  } else {
    const lines = text.split("\n");
    const width = Math.max(120, Math.max(...lines.map((line) => line.length), 1) * state.style.fontSize * 0.65 + 24);
    const height = Math.max(56, lines.length * state.style.fontSize * 1.2 + 18);
    state.actions.push({
      id: createActionId(),
      type: TOOL_TYPES.CALLOUT,
      x: point.x,
      y: point.y,
      width,
      height,
      text,
      strokeColor: state.style.strokeColor,
      fillColor: state.style.fillColor,
      opacity: state.style.opacity,
      strokeWidth: state.style.strokeWidth,
      fontSize: Math.max(11, state.style.fontSize * 0.7),
      fontFamily: state.style.fontFamily
    });
  }

  state.selectedActionId = state.actions[state.actions.length - 1].id;
  renderAnnotationList();
  render();
  scheduleDraftSave();
  return state.actions[state.actions.length - 1];
}

function updateDraftAction(draft, point) {
  if (!draft) return;

  if (draft.points) {
    draft.points.push(point);
    return;
  }

  if (draft.start && draft.end) {
    draft.end = point;
    return;
  }

  if (typeof draft.x === "number" && typeof draft.y === "number") {
    const next = rectFromPoints({ x: draft.x, y: draft.y }, point);
    draft.x = next.x;
    draft.y = next.y;
    draft.width = Math.max(2, next.width);
    draft.height = Math.max(2, next.height);
  }
}

function finalizePendingAction() {
  if (!state.pendingAction) {
    return;
  }

  const bounds = getActionBounds(state.pendingAction);
  if (!bounds || bounds.width < 2 || bounds.height < 2) {
    state.pendingAction = null;
    render();
    return;
  }

  pushUndoSnapshot();
  state.actions.push(cloneAction(state.pendingAction));
  state.selectedActionId = state.pendingAction.id;
  renderAnnotationList();
  render();
  scheduleDraftSave();
}

function handleSelectPointerDown(point) {
  const selectedAction = getSelectedAction();
  if (selectedAction) {
    if (selectedAction.type === TOOL_TYPES.LINE || selectedAction.type === TOOL_TYPES.ARROW) {
      const endpointHandle = hitEndpointHandle(point, selectedAction);
      if (endpointHandle) {
        pushUndoSnapshot();
        state.dragMode = "endpoint-selection";
        state.endpointHandle = endpointHandle;
        state.dragStart = point;
        state.dragActionSnapshot = cloneAction(selectedAction);
        return;
      }
    }

    const selectedBounds = getActionBounds(selectedAction);
    if (selectedBounds) {
      const handle = hitSelectionHandle(point, selectedBounds);
      if (handle) {
        pushUndoSnapshot();
        state.dragMode = "resize-selection";
        state.resizeHandle = handle;
        state.dragStart = point;
        state.dragActionSnapshot = cloneAction(selectedAction);
        state.dragBoundsSnapshot = selectedBounds;
        return;
      }

      if (hitTestAction(selectedAction, point)) {
        pushUndoSnapshot();
        state.dragMode = "move-selection";
        state.dragStart = point;
        state.dragActionSnapshot = cloneAction(selectedAction);
        state.dragBoundsSnapshot = selectedBounds;
        return;
      }
    }
  }

  const picked = pickActionAtPoint(point);
  state.selectedActionId = picked ? picked.id : null;
  renderAnnotationList();
  render();
}

function pickActionAtPoint(point) {
  for (let i = state.actions.length - 1; i >= 0; i -= 1) {
    const action = state.actions[i];
    if (hitTestAction(action, point)) {
      return action;
    }
  }
  return null;
}

function resizeRectFromHandle(baseRect, handle, point) {
  const rect = { ...baseRect };

  if (handle.includes("n")) {
    const bottom = rect.y + rect.height;
    rect.y = clamp(point.y, 0, bottom - 2);
    rect.height = Math.max(2, bottom - rect.y);
  }

  if (handle.includes("s")) {
    rect.height = Math.max(2, point.y - rect.y);
  }

  if (handle.includes("w")) {
    const right = rect.x + rect.width;
    rect.x = clamp(point.x, 0, right - 2);
    rect.width = Math.max(2, right - rect.x);
  }

  if (handle.includes("e")) {
    rect.width = Math.max(2, point.x - rect.x);
  }

  rect.x = clamp(rect.x, 0, canvas.width - 2);
  rect.y = clamp(rect.y, 0, canvas.height - 2);
  rect.width = clamp(rect.width, 2, canvas.width - rect.x);
  rect.height = clamp(rect.height, 2, canvas.height - rect.y);

  return rect;
}

function getSelectedAction() {
  return state.actions.find((action) => action.id === state.selectedActionId) || null;
}

function updateActionById(id, nextAction) {
  const index = state.actions.findIndex((action) => action.id === id);
  if (index < 0) return;
  state.actions[index] = nextAction;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  annotationWorkCtx.clearRect(0, 0, annotationWorkCanvas.width, annotationWorkCanvas.height);

  if (state.baseImage) {
    annotationWorkCtx.drawImage(state.baseImage, 0, 0);
  } else {
    annotationWorkCtx.fillStyle = "#101b35";
    annotationWorkCtx.fillRect(0, 0, canvas.width, canvas.height);
  }

  state.actions.forEach((action) => {
    drawAction(annotationWorkCtx, action);
  });

  if (state.pendingAction) {
    drawAction(annotationWorkCtx, state.pendingAction);
  }

  ctx.drawImage(annotationWorkCanvas, 0, 0);

  if (state.tool === TOOL_TYPES.SELECT) {
    drawSelectionOverlay(ctx);
  }

  if (state.tool === TOOL_TYPES.CROP) {
    cropTool.drawOverlay(ctx);
  }

  if (state.tool === TOOL_TYPES.RESIZE) {
    resizeTool.drawOverlay(ctx);
  }

  updateToolbarState();
}

function drawAction(context, action) {
  if (!action) return;

  if (action.type === TOOL_TYPES.DRAW || action.type === TOOL_TYPES.HIGHLIGHT) {
    drawPath(context, action.points, action.strokeColor, action.strokeWidth, action.opacity);
    return;
  }

  if (action.type === TOOL_TYPES.LINE) {
    drawLine(context, action.start, action.end, action.strokeColor, action.strokeWidth, action.opacity);
    return;
  }

  if (action.type === TOOL_TYPES.ARROW) {
    drawArrow(
      context,
      action.start,
      action.end,
      action.strokeColor,
      action.strokeWidth,
      action.opacity,
      action.arrowStyle || "filled"
    );
    return;
  }

  if (action.type === TOOL_TYPES.RECT || action.type === TOOL_TYPES.ROUNDED_RECT || action.type === TOOL_TYPES.ELLIPSE) {
    drawShape(context, action);
    return;
  }

  if (action.type === TOOL_TYPES.BLUR) {
    drawBlur(context, action);
    return;
  }

  if (action.type === TOOL_TYPES.PIXELATE) {
    drawPixelate(context, action);
    return;
  }

  if (action.type === TOOL_TYPES.REDACT) {
    drawRedaction(context, action);
    return;
  }

  if (action.type === TOOL_TYPES.TEXT) {
    drawText(context, action);
    return;
  }

  if (action.type === TOOL_TYPES.NUMBER_MARKER) {
    drawNumberMarker(context, action);
    return;
  }

  if (action.type === TOOL_TYPES.CALLOUT) {
    drawCallout(context, action);
  }
}

function drawPath(context, points, color, width, alpha) {
  if (!Array.isArray(points) || points.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = alpha;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    context.lineTo(points[i].x, points[i].y);
  }
  context.stroke();
  context.restore();
}

function drawLine(context, start, end, color, width, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function drawArrow(context, start, end, color, width, alpha, style) {
  const headLength = Math.max(10, width * 2.3);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();

  const a1 = {
    x: end.x - headLength * Math.cos(angle - Math.PI / 6),
    y: end.y - headLength * Math.sin(angle - Math.PI / 6)
  };
  const a2 = {
    x: end.x - headLength * Math.cos(angle + Math.PI / 6),
    y: end.y - headLength * Math.sin(angle + Math.PI / 6)
  };

  if (style === "open") {
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(a1.x, a1.y);
    context.moveTo(end.x, end.y);
    context.lineTo(a2.x, a2.y);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(a1.x, a1.y);
    context.lineTo(a2.x, a2.y);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  context.restore();
}

function drawShape(context, action) {
  context.save();
  context.globalAlpha = action.opacity;
  context.lineWidth = action.strokeWidth;
  context.strokeStyle = action.strokeColor;
  context.fillStyle = action.fillColor;

  if (action.type === TOOL_TYPES.RECT) {
    context.beginPath();
    context.rect(action.x, action.y, action.width, action.height);
  } else if (action.type === TOOL_TYPES.ROUNDED_RECT) {
    const radius = clamp(action.radius || 8, 2, Math.min(action.width, action.height) / 2);
    roundedRectPath(context, action.x, action.y, action.width, action.height, radius);
  } else {
    context.beginPath();
    context.ellipse(
      action.x + action.width / 2,
      action.y + action.height / 2,
      action.width / 2,
      action.height / 2,
      0,
      0,
      Math.PI * 2
    );
  }

  if (action.fillColor && action.fillColor !== "transparent") {
    context.fill();
  }
  context.stroke();
  context.restore();
}

function roundedRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawBlur(context, action) {
  const x = Math.round(action.x);
  const y = Math.round(action.y);
  const w = Math.max(1, Math.round(action.width));
  const h = Math.max(1, Math.round(action.height));

  const source = document.createElement("canvas");
  source.width = w;
  source.height = h;
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(context.canvas, x, y, w, h, 0, 0, w, h);

  context.save();
  context.globalAlpha = action.opacity;
  context.filter = `blur(${Math.max(2, action.blurStrength || state.style.blurStrength)}px)`;
  context.drawImage(source, 0, 0, w, h, x, y, w, h);
  context.filter = "none";
  context.strokeStyle = action.strokeColor;
  context.lineWidth = Math.max(1, action.strokeWidth * 0.8);
  context.strokeRect(x, y, w, h);
  context.restore();
}

function drawPixelate(context, action) {
  const x = Math.round(action.x);
  const y = Math.round(action.y);
  const w = Math.max(1, Math.round(action.width));
  const h = Math.max(1, Math.round(action.height));
  const block = clamp(Math.round(action.pixelStrength || state.style.pixelStrength), 2, 80);

  const sampleW = Math.max(1, Math.round(w / block));
  const sampleH = Math.max(1, Math.round(h / block));

  const source = document.createElement("canvas");
  source.width = w;
  source.height = h;
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(context.canvas, x, y, w, h, 0, 0, w, h);

  const tiny = document.createElement("canvas");
  tiny.width = sampleW;
  tiny.height = sampleH;
  const tinyCtx = tiny.getContext("2d");
  tinyCtx.imageSmoothingEnabled = false;
  tinyCtx.drawImage(source, 0, 0, sampleW, sampleH);

  context.save();
  context.globalAlpha = action.opacity;
  context.imageSmoothingEnabled = false;
  context.drawImage(tiny, 0, 0, sampleW, sampleH, x, y, w, h);
  context.imageSmoothingEnabled = true;
  context.strokeStyle = action.strokeColor;
  context.lineWidth = Math.max(1, action.strokeWidth * 0.8);
  context.strokeRect(x, y, w, h);
  context.restore();
}

function drawRedaction(context, action) {
  context.save();
  context.globalAlpha = action.opacity;
  context.fillStyle = action.fillColor || "#000000";
  context.fillRect(action.x, action.y, action.width, action.height);
  context.restore();
}

function drawText(context, action) {
  context.save();
  context.globalAlpha = action.opacity;
  context.fillStyle = action.strokeColor;
  context.font = `${action.fontSize}px ${action.fontFamily}`;
  context.textBaseline = "top";
  const maxWidth = Math.max(30, Number(action.textWidth || 0));
  const rawLines = String(action.text || "").split("\n");
  const wrapped = wrapTextLines(context, rawLines, maxWidth);
  const lineHeight = action.fontSize * 1.25;
  const maxLines = Math.max(1, Math.floor(Math.max(lineHeight, Number(action.textHeight || lineHeight)) / lineHeight));
  wrapped.slice(0, maxLines).forEach((line, index) => {
    context.fillText(line, action.x, action.y + index * lineHeight);
  });
  context.restore();
}

function wrapTextLines(context, lines, maxWidth) {
  const result = [];
  const safeWidth = Math.max(20, Number(maxWidth || 0));

  lines.forEach((line) => {
    const text = String(line || "");
    if (!text.trim()) {
      result.push("");
      return;
    }

    const words = text.split(/\s+/);
    let current = "";

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      const width = context.measureText(candidate).width;
      if (width <= safeWidth) {
        current = candidate;
        return;
      }

      if (current) {
        result.push(current);
      }

      if (context.measureText(word).width <= safeWidth) {
        current = word;
        return;
      }

      // Hard split for very long token segments.
      let segment = "";
      Array.from(word).forEach((char) => {
        const next = `${segment}${char}`;
        if (context.measureText(next).width <= safeWidth) {
          segment = next;
          return;
        }
        if (segment) result.push(segment);
        segment = char;
      });
      current = segment;
    });

    if (current || !words.length) {
      result.push(current);
    }
  });

  return result;
}

function drawNumberMarker(context, action) {
  context.save();
  context.globalAlpha = action.opacity;
  context.fillStyle = action.fillColor;
  context.strokeStyle = action.strokeColor;
  context.lineWidth = Math.max(2, (action.radius || 16) * 0.15);
  context.beginPath();
  context.arc(action.x, action.y, action.radius || 16, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = action.textColor || "#ffffff";
  context.font = `${Math.max(12, (action.radius || 16) * 1.1)}px ${state.style.fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(action.number), action.x, action.y);
  context.restore();
}

function drawCallout(context, action) {
  context.save();
  context.globalAlpha = action.opacity;
  context.fillStyle = action.fillColor;
  context.strokeStyle = action.strokeColor;
  context.lineWidth = Math.max(1, action.strokeWidth || 2);

  roundedRectPath(context, action.x, action.y, action.width, action.height, 10);
  context.fill();
  context.stroke();

  context.beginPath();
  const tailX = action.x;
  const tailY = action.y + Math.min(action.height - 12, 24);
  context.moveTo(tailX + 2, tailY + 6);
  context.lineTo(tailX - 14, tailY + 14);
  context.lineTo(tailX + 2, tailY + 20);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = action.strokeColor;
  context.font = `${action.fontSize}px ${action.fontFamily}`;
  context.textBaseline = "top";
  const lines = String(action.text || "").split("\n");
  const lineHeight = action.fontSize * 1.2;
  lines.forEach((line, index) => {
    context.fillText(line, action.x + 10, action.y + 8 + index * lineHeight);
  });
  context.restore();
}

function drawSelectionOverlay(context) {
  const selected = getSelectedAction();
  if (!selected) return;
  const bounds = getActionBounds(selected);
  if (!bounds) return;

  context.save();
  context.strokeStyle = "#f8fbff";
  context.lineWidth = 2 / state.zoom;
  context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

  const handles = getSelectionHandles(bounds);
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#0a0d13";
  context.lineWidth = 1.2 / state.zoom;
  Object.values(handles).forEach((handle) => {
    context.fillRect(handle.x, handle.y, handle.size, handle.size);
    context.strokeRect(handle.x, handle.y, handle.size, handle.size);
  });

  if (selected.type === TOOL_TYPES.LINE || selected.type === TOOL_TYPES.ARROW) {
    const endpoints = getEndpointHandles(selected);
    if (endpoints) {
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#0a0d13";
      context.lineWidth = 1.2 / state.zoom;
      Object.values(endpoints).forEach((endpoint) => {
        context.beginPath();
        context.arc(endpoint.x, endpoint.y, endpoint.radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      });
    }
  }

  context.restore();
}

function updateToolbarState() {
  const selected = Boolean(getSelectedAction());
  const hasRedaction = hasSolidRedactionBlock();
  const hasBaseline = Boolean(initialSessionSnapshot?.baseDataUrl);
  duplicateBtn.disabled = !selected;
  deleteSelectedBtn.disabled = !selected;
  clearAllBtn.disabled = state.actions.length === 0;
  overwriteBtn.disabled = !state.currentItemId;
  resetEditsBtn.disabled = !hasBaseline;
  secureRedactionBtn.disabled = !hasRedaction;
  undoBtn.disabled = state.undoStack.length === 0;
  redoBtn.disabled = state.redoStack.length === 0;
}

function captureSessionSnapshot() {
  return {
    baseDataUrl: state.baseDataUrl,
    actions: deepClone(state.actions),
    markerCounter: state.markerCounter,
    itemTitle: state.itemTitle,
    itemTags: deepClone(state.itemTags),
    currentItemId: state.currentItemId,
    projectBaseItemId: state.projectBaseItemId
  };
}

function rememberSessionBaseline() {
  if (!state.baseDataUrl) {
    initialSessionSnapshot = null;
    updateToolbarState();
    return;
  }
  initialSessionSnapshot = captureSessionSnapshot();
  updateToolbarState();
}

async function resetEdits() {
  if (!initialSessionSnapshot?.baseDataUrl) {
    showToast("No baseline image to reset.", true);
    return;
  }

  const confirmed = window.confirm("Reset edits to the original loaded image?");
  if (!confirmed) {
    return;
  }

  await loadFromDataUrl(initialSessionSnapshot.baseDataUrl);
  state.actions = deepClone(initialSessionSnapshot.actions || []);
  state.selectedActionId = null;
  state.markerCounter = Number(initialSessionSnapshot.markerCounter || inferNextMarker(state.actions));
  state.currentItemId = initialSessionSnapshot.currentItemId || null;
  state.projectBaseItemId = initialSessionSnapshot.projectBaseItemId || null;
  setItemTitle(initialSessionSnapshot.itemTitle || "");
  setItemTags(initialSessionSnapshot.itemTags || []);
  state.undoStack = [];
  state.redoStack = [];
  renderAnnotationList();
  render();
  scheduleDraftSave();
  showToast("Edits reset.");
}

function renderAnnotationList() {
  annotationList.innerHTML = "";

  if (!state.actions.length) {
    annotationEmpty.hidden = false;
    return;
  }

  annotationEmpty.hidden = true;

  const reversed = [...state.actions].reverse();
  reversed.forEach((action) => {
    const row = document.createElement("li");
    row.className = "annotation-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "annotation-item";
    button.classList.toggle("active", action.id === state.selectedActionId);
    button.setAttribute("aria-label", `Select ${actionLabel(action)}`);
    button.textContent = actionLabel(action);
    button.addEventListener("click", () => {
      state.selectedActionId = action.id;
      renderAnnotationList();
      render();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (state.selectedActionId !== action.id) {
          state.selectedActionId = action.id;
        }
        deleteSelectedAction();
      }
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "annotation-delete danger";
    remove.setAttribute("aria-label", `Delete ${actionLabel(action)}`);
    remove.textContent = "Del";
    remove.addEventListener("click", () => {
      state.selectedActionId = action.id;
      deleteSelectedAction();
    });

    row.append(button, remove);
    annotationList.append(row);
  });
}

function toCanvasPoint(event) {
  return viewport.viewportPointToImagePoint(event.clientX, event.clientY);
}

function setZoom(value) {
  state.zoom = clamp(Number(value.toFixed(2)), 0.2, 5);
  updateZoom();
}

function fitToScreen() {
  const shellRect = canvasShell.getBoundingClientRect();
  const maxWidth = Math.max(200, shellRect.width - 40);
  const maxHeight = Math.max(200, shellRect.height - 40);
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
  setZoom(scale);
}

function updateZoom() {
  canvas.style.transform = `scale(${state.zoom})`;
  zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  cropTool.setZoom(state.zoom);
  resizeTool.setZoom(state.zoom);
}

function pushUndoSnapshot() {
  const snapshot = {
    baseDataUrl: state.baseDataUrl,
    actions: deepClone(state.actions),
    selectedActionId: state.selectedActionId,
    markerCounter: state.markerCounter,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    itemTitle: state.itemTitle,
    itemTags: deepClone(state.itemTags)
  };

  state.undoStack.push(snapshot);
  if (state.undoStack.length > MAX_HISTORY) {
    state.undoStack.shift();
  }
  state.redoStack = [];
  updateToolbarState();
}

function captureCurrentSnapshot() {
  return {
    baseDataUrl: state.baseDataUrl,
    actions: deepClone(state.actions),
    selectedActionId: state.selectedActionId,
    markerCounter: state.markerCounter,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    itemTitle: state.itemTitle,
    itemTags: deepClone(state.itemTags)
  };
}

async function restoreSnapshot(snapshot) {
  if (!snapshot) return;
  if (snapshot.baseDataUrl) {
    await loadFromDataUrl(snapshot.baseDataUrl);
  }
  state.actions = deepClone(snapshot.actions || []);
  state.selectedActionId = snapshot.selectedActionId || null;
  state.markerCounter = Number(snapshot.markerCounter || 1);
  state.itemTitle = snapshot.itemTitle || state.itemTitle;
  state.itemTags = Array.isArray(snapshot.itemTags) ? snapshot.itemTags : state.itemTags;
  itemTitleInput.value = state.itemTitle;
  itemTagsInput.value = state.itemTags.join(", ");
  renderAnnotationList();
  render();
}

async function undo() {
  if (!state.undoStack.length) return;
  const current = captureCurrentSnapshot();
  const snapshot = state.undoStack.pop();
  state.redoStack.push(current);
  await restoreSnapshot(snapshot);
  scheduleDraftSave();
  updateToolbarState();
}

async function redo() {
  if (!state.redoStack.length) return;
  const current = captureCurrentSnapshot();
  const snapshot = state.redoStack.pop();
  state.undoStack.push(current);
  await restoreSnapshot(snapshot);
  scheduleDraftSave();
  updateToolbarState();
}

function deleteSelectedAction() {
  const selected = getSelectedAction();
  if (!selected) return;
  pushUndoSnapshot();
  state.actions = state.actions.filter((action) => action.id !== selected.id);
  state.selectedActionId = null;
  renderAnnotationList();
  render();
  scheduleDraftSave();
}

function clearAllAnnotations() {
  if (!state.actions.length) return;
  pushUndoSnapshot();
  state.actions = [];
  state.selectedActionId = null;
  renderAnnotationList();
  render();
  scheduleDraftSave();
  showToast("All annotations cleared.");
}

function duplicateSelectedAction() {
  const selected = getSelectedAction();
  if (!selected) return;
  pushUndoSnapshot();
  const clone = moveAction(cloneAction(selected), 14, 14);
  clone.id = createActionId();
  if (clone.type === TOOL_TYPES.NUMBER_MARKER) {
    clone.number = state.markerCounter;
    state.markerCounter += 1;
  }
  state.actions.push(clone);
  state.selectedActionId = clone.id;
  renderAnnotationList();
  render();
  scheduleDraftSave();
}

async function rotateCanvasAndActions(direction) {
  if (!["cw", "ccw"].includes(direction)) return;
  if (!state.baseImage) return;

  pushUndoSnapshot();

  const sourceCanvas = await exportCompositeCanvas();
  const sourceW = sourceCanvas.width;
  const sourceH = sourceCanvas.height;

  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = sourceH;
  rotatedCanvas.height = sourceW;
  const rotatedCtx = rotatedCanvas.getContext("2d");

  rotatedCtx.save();
  if (direction === "cw") {
    rotatedCtx.translate(rotatedCanvas.width, 0);
    rotatedCtx.rotate(Math.PI / 2);
  } else {
    rotatedCtx.translate(0, rotatedCanvas.height);
    rotatedCtx.rotate(-Math.PI / 2);
  }
  rotatedCtx.drawImage(sourceCanvas, 0, 0);
  rotatedCtx.restore();

  const dataUrl = rotatedCanvas.toDataURL("image/png");
  await loadFromDataUrl(dataUrl);

  state.actions = state.actions.map((action) => rotateAction(action, direction, sourceW, sourceH));
  state.selectedActionId = null;
  renderAnnotationList();
  render();
  scheduleDraftSave();
}

async function applyCrop() {
  if (!state.baseImage) return;
  pushUndoSnapshot();
  await cropTool.applyCrop({ devicePixelRatio: 1 });
  state.baseDataUrl = await canvasToDataUrl();
  state.actions = [];
  state.selectedActionId = null;
  setTool(TOOL_TYPES.SELECT);
  renderAnnotationList();
  render();
  scheduleDraftSave();
  showToast("Crop applied.");
}

function updateCropMetrics(rect) {
  if (!cropWidthValue || !cropHeightValue) return;
  if (!rect) {
    cropWidthValue.textContent = "0";
    cropHeightValue.textContent = "0";
    return;
  }
  cropWidthValue.textContent = String(Math.round(rect.width));
  cropHeightValue.textContent = String(Math.round(rect.height));
}

function syncResizeInputs(size) {
  resizeWidth.value = String(size.width);
  resizeHeight.value = String(size.height);
  if (resizeLiveWidth) {
    resizeLiveWidth.textContent = String(size.width);
  }
  if (resizeLiveHeight) {
    resizeLiveHeight.textContent = String(size.height);
  }
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
  const size = resizeTool.getSize();
  const width = Number(size.width);
  const height = Number(size.height);
  if (!width || !height) {
    showToast("Enter width and height.", true);
    return;
  }

  pushUndoSnapshot();

  const source = await exportCompositeCanvas();
  const next = document.createElement("canvas");
  next.width = width;
  next.height = height;
  const nextCtx = next.getContext("2d");
  nextCtx.drawImage(source, 0, 0, width, height);

  const dataUrl = next.toDataURL("image/png");
  await loadFromDataUrl(dataUrl);

  state.actions = [];
  state.selectedActionId = null;
  setTool(TOOL_TYPES.SELECT);
  renderAnnotationList();
  render();
  scheduleDraftSave();
  showToast("Resize applied.");
}

function openTextComposer(type, point) {
  destroyTextComposer();

  const shell = document.createElement("div");
  shell.className = "text-input-shell";
  shell.setAttribute("role", "group");

  const label = document.createElement("label");
  const inputId = `olho_text_input_${Date.now()}`;
  label.setAttribute("for", inputId);
  label.textContent = type === TOOL_TYPES.CALLOUT ? "Callout text" : "Text annotation";

  const textarea = document.createElement("textarea");
  textarea.id = inputId;
  textarea.placeholder = "Type annotation text";
  textarea.setAttribute("aria-label", label.textContent);

  const actions = document.createElement("div");
  actions.className = "option-row";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "ghost";
  cancelBtn.textContent = "Cancel";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "primary";
  addBtn.textContent = "Add";

  actions.append(cancelBtn, addBtn);
  shell.append(label, textarea, actions);

  const shellRect = canvasShell.getBoundingClientRect();
  const approxX = clamp((point.x / canvas.width) * shellRect.width, 8, Math.max(8, shellRect.width - 260));
  const approxY = clamp((point.y / canvas.height) * shellRect.height, 8, Math.max(8, shellRect.height - 180));
  shell.style.left = `${approxX}px`;
  shell.style.top = `${approxY}px`;

  canvasShell.appendChild(shell);
  textarea.focus();

  const commit = () => {
    const text = sanitizeText(textarea.value);
    if (!text) {
      destroyTextComposer();
      return;
    }

    pushUndoSnapshot();
    appendTextAction(type, text, point);
    destroyTextComposer();
  };

  cancelBtn.addEventListener("click", () => destroyTextComposer());
  addBtn.addEventListener("click", commit);
  textarea.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      destroyTextComposer();
    }
  });

  textComposer = shell;
}

function destroyTextComposer() {
  if (textComposer) {
    textComposer.remove();
    textComposer = null;
  }
}

function setItemTitle(title) {
  state.itemTitle = sanitizeText(title || "");
  itemTitleInput.value = state.itemTitle;
}

function setItemTags(tags = []) {
  state.itemTags = Array.isArray(tags) ? tags : [];
  itemTagsInput.value = state.itemTags.join(", ");
}

function resizeCanvasToBitmap(bitmap) {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  annotationWorkCanvas.width = bitmap.width;
  annotationWorkCanvas.height = bitmap.height;
}

function setBaseImage(bitmap, dataUrl = null) {
  state.baseImage = bitmap;
  state.baseDataUrl = dataUrl;

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = bitmap.width;
  baseCanvas.height = bitmap.height;
  const baseCtx = baseCanvas.getContext("2d");
  baseCtx.drawImage(bitmap, 0, 0);

  state.baseImageCanvas = baseCanvas;
  state.baseImageContext = baseCtx;
  resizeCanvasToBitmap(bitmap);
}

async function loadFromDataUrl(dataUrl) {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Could not load image data.");
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  setBaseImage(bitmap, dataUrl);
}

async function loadFromBlob(blob) {
  const bitmap = await createImageBitmap(blob);
  const dataUrl = await blobToDataUrl(blob);
  setBaseImage(bitmap, dataUrl);
}

async function loadLocalImageBlob(blob, metadata = {}) {
  if (!(blob instanceof Blob)) {
    throw new Error("No image file was provided.");
  }

  const mimeType = String(blob.type || "").toLowerCase();
  if (!isAcceptedLocalImageType(mimeType)) {
    throw new Error("Unsupported image type. Use PNG, JPG, or WebP.");
  }

  if (blob.size > LOCAL_IMAGE_MAX_BYTES) {
    throw new Error("Image is too large for editor import. Use a file under 30 MB.");
  }

  await loadFromBlob(blob);
  clearEditingStateForFreshImage();
  const fallbackTitle = sanitizeFilenameLabel(metadata.originalName) || "Imported Image";
  setItemTitle(fallbackTitle);
  setItemTags([]);
  renderAnnotationList();
  render();
  rememberSessionBaseline();
  showToast("Image loaded. You can annotate and save to Memory.");
}

async function importImageFile(file) {
  await loadLocalImageBlob(file, {
    originalName: file?.name || ""
  });
}

async function handleImageFileInputChange() {
  const file = localImageInput?.files?.[0] || null;
  if (!file) return;
  try {
    await importImageFile(file);
  } catch (error) {
    showToast(String(error?.message || error), true);
  } finally {
    localImageInput.value = "";
  }
}

async function pasteImageFromClipboard() {
  if (!navigator.clipboard?.read) {
    throw new Error("Clipboard image read is unavailable in this browser.");
  }

  const items = await navigator.clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((type) => isAcceptedLocalImageType(type));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    await loadLocalImageBlob(blob, {
      originalName: "Clipboard Image"
    });
    return true;
  }

  throw new Error("No image found on the clipboard.");
}

async function handlePasteEvent(event) {
  const files = Array.from(event.clipboardData?.files || []);
  const imageFile = files.find((file) => isAcceptedLocalImageType(file.type));
  if (!imageFile) return;

  event.preventDefault();
  try {
    await importImageFile(imageFile);
  } catch (error) {
    showToast(String(error?.message || error), true);
  }
}

function showDropHint(visible) {
  if (localImageDropHint) {
    localImageDropHint.hidden = !visible;
  }
  canvasShell.classList.toggle("drag-active", visible);
}

function getDraftKey() {
  return state.currentItemId || "unsaved";
}

function buildProjectPayload({ includeBaseData = true } = {}) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    title: state.itemTitle || "",
    tags: deepClone(state.itemTags),
    baseItemId: state.projectBaseItemId || state.currentItemId || null,
    baseDataUrl: includeBaseData ? state.baseDataUrl || null : null,
    actions: deepClone(state.actions),
    markerCounter: state.markerCounter,
    canvas: {
      width: canvas.width,
      height: canvas.height
    }
  };
}

function buildAnnotationSidecar() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseItemId: state.projectBaseItemId || state.currentItemId || null,
    actions: deepClone(state.actions),
    canvas: {
      width: canvas.width,
      height: canvas.height
    }
  };
}

async function saveDraftNow() {
  const draftStorage = getDraftStorageArea();
  if (!draftStorage || !state.baseDataUrl) return;

  const approxBytes = Math.round(state.baseDataUrl.length * 0.75);
  if (approxBytes > DRAFT_MAX_BYTES) {
    if (!draftSkipNotice) {
      draftSkipNotice = true;
      showToast("Draft skipped (base image too large).", true);
    }
    return;
  }

  const { [DRAFT_KEY]: drafts } = await draftStorage.get({ [DRAFT_KEY]: {} });
  const nextDrafts = { ...(drafts || {}) };
  nextDrafts[getDraftKey()] = {
    baseDataUrl: state.baseDataUrl,
    actions: deepClone(state.actions),
    selectedActionId: state.selectedActionId,
    markerCounter: state.markerCounter,
    title: state.itemTitle,
    tags: deepClone(state.itemTags),
    projectBaseItemId: state.projectBaseItemId,
    updatedAt: Date.now()
  };

  await draftStorage.set({ [DRAFT_KEY]: nextDrafts });
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    saveDraftNow().catch((error) => {
      console.warn("Draft save failed", error);
    });
  }, 700);
}

async function clearDraft(key = getDraftKey()) {
  const draftStorage = getDraftStorageArea();
  if (!draftStorage) return;
  const { [DRAFT_KEY]: drafts } = await draftStorage.get({ [DRAFT_KEY]: {} });
  if (!drafts?.[key]) return;
  const nextDrafts = { ...drafts };
  delete nextDrafts[key];
  await draftStorage.set({ [DRAFT_KEY]: nextDrafts });
}

async function loadDraft(key) {
  const draftStorage = getDraftStorageArea();
  if (!draftStorage) return false;

  const { [DRAFT_KEY]: drafts } = await draftStorage.get({ [DRAFT_KEY]: {} });
  const draft = drafts?.[key];
  if (!draft?.baseDataUrl) return false;

  await loadFromDataUrl(draft.baseDataUrl);
  state.actions = Array.isArray(draft.actions) ? deepClone(draft.actions) : [];
  state.selectedActionId = draft.selectedActionId || null;
  state.markerCounter = Number(draft.markerCounter || 1);
  state.projectBaseItemId = draft.projectBaseItemId || state.projectBaseItemId;
  setItemTitle(draft.title || state.itemTitle);
  setItemTags(draft.tags || []);

  renderAnnotationList();
  render();
  rememberSessionBaseline();
  showToast("Draft restored.");
  return true;
}

async function loadItemById(itemId) {
  try {
    const item = await getMedia(itemId, { includeBlob: true });
    if (!item) {
      showToast("Item not found.", true);
      return false;
    }

    if (item.type !== "image") {
      showToast("Video editing is not supported in screenshot editor.", true);
      return false;
    }

    state.currentItemId = item.id;
    state.projectBaseItemId = item.id;
    setItemTitle(item.metadata?.title || "Untitled");
    setItemTags(item.metadata?.tags || []);

    if (await loadDraft(item.id)) {
      return true;
    }

    const project = item.metadata?.olhoProject;
    if (project && Array.isArray(project.actions)) {
      const loadedProject = await loadProjectFromPayload(project, item);
      if (loadedProject) {
        return true;
      }
    }

    if (item.blob instanceof Blob) {
      await loadFromBlob(item.blob);
      state.actions = [];
      state.selectedActionId = null;
      state.markerCounter = 1;
      renderAnnotationList();
      render();
      rememberSessionBaseline();
      return true;
    }

    showToast("Image source missing.", true);
    return false;
  } catch (error) {
    console.error(error);
    showToast("Failed to load item.", true);
    return false;
  }
}

async function loadProjectFromPayload(project, fallbackItem = null) {
  if (!project || !Array.isArray(project.actions)) {
    return false;
  }

  let loadedBase = false;

  if (project.baseItemId) {
    const baseItem = await getMedia(project.baseItemId, { includeBlob: true });
    if (baseItem?.blob instanceof Blob) {
      await loadFromBlob(baseItem.blob);
      state.projectBaseItemId = project.baseItemId;
      loadedBase = true;
    }
  }

  if (!loadedBase && project.baseDataUrl) {
    await loadFromDataUrl(project.baseDataUrl);
    state.projectBaseItemId = project.baseItemId || state.projectBaseItemId;
    loadedBase = true;
  }

  if (!loadedBase && fallbackItem?.blob instanceof Blob) {
    await loadFromBlob(fallbackItem.blob);
    state.projectBaseItemId = fallbackItem.id;
    loadedBase = true;
  }

  if (!loadedBase) {
    return false;
  }

  state.actions = deepClone(project.actions);
  state.selectedActionId = null;
  state.markerCounter = Number(project.markerCounter || inferNextMarker(state.actions));
  if (project.title) {
    setItemTitle(project.title);
  }
  if (Array.isArray(project.tags)) {
    setItemTags(project.tags);
  }

  renderAnnotationList();
  render();
  rememberSessionBaseline();
  showToast("Project restored.");
  return true;
}

function inferNextMarker(actions) {
  const max = actions
    .filter((action) => action.type === TOOL_TYPES.NUMBER_MARKER)
    .reduce((acc, action) => Math.max(acc, Number(action.number || 0)), 0);
  return max + 1;
}

async function initLoad() {
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get("itemId");
  const shouldAutoCopy = params.get("copy") === "1";
  const promptImport = params.get("import") === "1";

  if (itemId) {
    const loaded = await loadItemById(itemId);
    if (loaded) {
      if (shouldAutoCopy) {
        await copyToClipboard({ autoTriggered: true });
      }
      return;
    }
  }

  const pending = await loadPendingCapture();
  if (!pending) {
    await loadDraft("unsaved");
  }

  if (shouldAutoCopy) {
    await copyToClipboard({ autoTriggered: true });
  }

  if (promptImport) {
    queueMicrotask(() => {
      localImageInput.click();
    });
  }

  renderAnnotationList();
  render();
}

async function loadPendingCapture() {
  try {
    if (chrome?.storage?.session) {
      const { lastCapture } = await chrome.storage.session.get("lastCapture");
      if (lastCapture?.dataUrl) {
        await loadFromDataUrl(lastCapture.dataUrl);
        state.currentItemId = null;
        state.projectBaseItemId = null;
        setItemTitle(`Olho Capture ${new Date().toLocaleString()}`);
        setItemTags([]);
        state.actions = [];
        state.selectedActionId = null;
        state.markerCounter = 1;
        await chrome.storage.session.remove("lastCapture");
        renderAnnotationList();
        render();
        rememberSessionBaseline();
        return true;
      }
    }
  } catch (error) {
    console.warn("Pending capture load failed", error);
  }
  return false;
}

async function exportCompositeCanvas() {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const outCtx = out.getContext("2d", { willReadFrequently: true });

  if (state.baseImage) {
    outCtx.drawImage(state.baseImage, 0, 0);
  } else {
    outCtx.fillStyle = "#101b35";
    outCtx.fillRect(0, 0, out.width, out.height);
  }

  state.actions.forEach((action) => {
    drawAction(outCtx, action);
  });

  return out;
}

function isPdfVectorAction(action) {
  return [
    TOOL_TYPES.DRAW,
    TOOL_TYPES.HIGHLIGHT,
    TOOL_TYPES.LINE,
    TOOL_TYPES.ARROW,
    TOOL_TYPES.RECT,
    TOOL_TYPES.ROUNDED_RECT,
    TOOL_TYPES.ELLIPSE,
    TOOL_TYPES.TEXT,
    TOOL_TYPES.NUMBER_MARKER,
    TOOL_TYPES.CALLOUT,
    TOOL_TYPES.REDACT
  ].includes(action.type);
}

async function exportPdfRasterBaseCanvas() {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const outCtx = out.getContext("2d", { willReadFrequently: true });

  if (state.baseImage) {
    outCtx.drawImage(state.baseImage, 0, 0);
  } else {
    outCtx.fillStyle = "#101b35";
    outCtx.fillRect(0, 0, out.width, out.height);
  }

  state.actions.forEach((action) => {
    if (!isPdfVectorAction(action)) {
      drawAction(outCtx, action);
    }
  });

  return out;
}

async function canvasToDataUrl() {
  const composed = await exportCompositeCanvas();
  return composed.toDataURL("image/png");
}

function canvasToBlob(canvasOut, type = "image/png", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvasOut.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas export failed."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

async function exportImageBlob(format = "png") {
  if (format === "pdf") {
    const rasterBase = await exportPdfRasterBaseCanvas();
    const vectorActions = state.actions.filter((action) => isPdfVectorAction(action));
    return createPdfBlobFromCanvasAndVectors(rasterBase, vectorActions);
  }

  const canvasOut = await exportCompositeCanvas();

  if (format === "jpg") {
    return canvasToBlob(canvasOut, "image/jpeg", 0.92);
  }

  if (format === "webp") {
    return canvasToBlob(canvasOut, "image/webp", 0.92);
  }

  return canvasToBlob(canvasOut, "image/png", 1);
}

function bytesFromString(text) {
  return new TextEncoder().encode(text);
}

function padOffset(value) {
  return String(value).padStart(10, "0");
}

function joinUint8(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

function formatPdfNumber(value) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function escapePdfText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function hexToRgb(hex, fallback = [0, 0, 0]) {
  const normalized = String(hex || "").trim();
  const match = normalized.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return fallback;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r / 255, g / 255, b / 255];
}

function pdfStrokeColor(color) {
  const [r, g, b] = hexToRgb(color, [1, 0, 0]);
  return `${formatPdfNumber(r)} ${formatPdfNumber(g)} ${formatPdfNumber(b)} RG`;
}

function pdfFillColor(color) {
  const [r, g, b] = hexToRgb(color, [0, 0, 0]);
  return `${formatPdfNumber(r)} ${formatPdfNumber(g)} ${formatPdfNumber(b)} rg`;
}

function normalizeOpacity(value) {
  return clamp(Number(value || 1), 0.02, 1);
}

function applyOpacityCommand(commands, opacityMap, opacity) {
  const safeOpacity = normalizeOpacity(opacity);
  if (safeOpacity >= 0.999) return;
  const name = opacityMap.get(safeOpacity);
  if (name) {
    commands.push(`/${name} gs`);
  }
}

function drawPdfPolyline(commands, points, close = false) {
  if (!Array.isArray(points) || points.length < 2) return;
  commands.push(`${formatPdfNumber(points[0].x)} ${formatPdfNumber(points[0].y)} m`);
  for (let i = 1; i < points.length; i += 1) {
    commands.push(`${formatPdfNumber(points[i].x)} ${formatPdfNumber(points[i].y)} l`);
  }
  if (close) {
    commands.push("h");
  }
}

function drawPdfEllipse(commands, x, y, w, h) {
  const k = 0.5522847498;
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;

  commands.push(`${formatPdfNumber(cx + rx)} ${formatPdfNumber(cy)} m`);
  commands.push(
    `${formatPdfNumber(cx + rx)} ${formatPdfNumber(cy + ry * k)} ${formatPdfNumber(cx + rx * k)} ${formatPdfNumber(
      cy + ry
    )} ${formatPdfNumber(cx)} ${formatPdfNumber(cy + ry)} c`
  );
  commands.push(
    `${formatPdfNumber(cx - rx * k)} ${formatPdfNumber(cy + ry)} ${formatPdfNumber(cx - rx)} ${formatPdfNumber(
      cy + ry * k
    )} ${formatPdfNumber(cx - rx)} ${formatPdfNumber(cy)} c`
  );
  commands.push(
    `${formatPdfNumber(cx - rx)} ${formatPdfNumber(cy - ry * k)} ${formatPdfNumber(cx - rx * k)} ${formatPdfNumber(
      cy - ry
    )} ${formatPdfNumber(cx)} ${formatPdfNumber(cy - ry)} c`
  );
  commands.push(
    `${formatPdfNumber(cx + rx * k)} ${formatPdfNumber(cy - ry)} ${formatPdfNumber(cx + rx)} ${formatPdfNumber(
      cy - ry * k
    )} ${formatPdfNumber(cx + rx)} ${formatPdfNumber(cy)} c`
  );
}

function drawPdfCircle(commands, cx, cy, radius) {
  drawPdfEllipse(commands, cx - radius, cy - radius, radius * 2, radius * 2);
}

function drawPdfRoundedRect(commands, x, y, w, h, radius) {
  const r = clamp(radius, 2, Math.min(w, h) / 2);
  const k = 0.5522847498;
  const c = r * k;

  commands.push(`${formatPdfNumber(x + r)} ${formatPdfNumber(y)} m`);
  commands.push(`${formatPdfNumber(x + w - r)} ${formatPdfNumber(y)} l`);
  commands.push(
    `${formatPdfNumber(x + w - r + c)} ${formatPdfNumber(y)} ${formatPdfNumber(x + w)} ${formatPdfNumber(
      y + r - c
    )} ${formatPdfNumber(x + w)} ${formatPdfNumber(y + r)} c`
  );
  commands.push(`${formatPdfNumber(x + w)} ${formatPdfNumber(y + h - r)} l`);
  commands.push(
    `${formatPdfNumber(x + w)} ${formatPdfNumber(y + h - r + c)} ${formatPdfNumber(x + w - r + c)} ${formatPdfNumber(
      y + h
    )} ${formatPdfNumber(x + w - r)} ${formatPdfNumber(y + h)} c`
  );
  commands.push(`${formatPdfNumber(x + r)} ${formatPdfNumber(y + h)} l`);
  commands.push(
    `${formatPdfNumber(x + r - c)} ${formatPdfNumber(y + h)} ${formatPdfNumber(x)} ${formatPdfNumber(
      y + h - r + c
    )} ${formatPdfNumber(x)} ${formatPdfNumber(y + h - r)} c`
  );
  commands.push(`${formatPdfNumber(x)} ${formatPdfNumber(y + r)} l`);
  commands.push(
    `${formatPdfNumber(x)} ${formatPdfNumber(y + r - c)} ${formatPdfNumber(x + r - c)} ${formatPdfNumber(
      y
    )} ${formatPdfNumber(x + r)} ${formatPdfNumber(y)} c`
  );
  commands.push("h");
}

function drawPdfArrowHead(commands, action) {
  const start = action.start;
  const end = action.end;
  const strokeWidth = Math.max(1, action.strokeWidth || 2);
  const headLength = Math.max(10, strokeWidth * 2.3);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const a1 = {
    x: end.x - headLength * Math.cos(angle - Math.PI / 6),
    y: end.y - headLength * Math.sin(angle - Math.PI / 6)
  };
  const a2 = {
    x: end.x - headLength * Math.cos(angle + Math.PI / 6),
    y: end.y - headLength * Math.sin(angle + Math.PI / 6)
  };

  if (action.arrowStyle === "open") {
    commands.push(`${formatPdfNumber(end.x)} ${formatPdfNumber(end.y)} m`);
    commands.push(`${formatPdfNumber(a1.x)} ${formatPdfNumber(a1.y)} l`);
    commands.push("S");
    commands.push(`${formatPdfNumber(end.x)} ${formatPdfNumber(end.y)} m`);
    commands.push(`${formatPdfNumber(a2.x)} ${formatPdfNumber(a2.y)} l`);
    commands.push("S");
    return;
  }

  commands.push(`${formatPdfNumber(end.x)} ${formatPdfNumber(end.y)} m`);
  commands.push(`${formatPdfNumber(a1.x)} ${formatPdfNumber(a1.y)} l`);
  commands.push(`${formatPdfNumber(a2.x)} ${formatPdfNumber(a2.y)} l`);
  commands.push("h");
  commands.push("f");
}

function buildPdfVectorContent(actions, pageHeight, opacityMap) {
  const commands = [];
  commands.push("q");
  commands.push(`1 0 0 -1 0 ${formatPdfNumber(pageHeight)} cm`);

  actions.forEach((action) => {
    if (!isPdfVectorAction(action)) return;
    const strokeWidth = Math.max(0.5, Number(action.strokeWidth || 1));
    const strokeColor = action.strokeColor || "#ff4d4f";
    const fillColor = action.fillColor || "#000000";

    commands.push("q");
    applyOpacityCommand(commands, opacityMap, action.opacity);
    commands.push(pdfStrokeColor(strokeColor));
    commands.push(pdfFillColor(fillColor));
    commands.push(`${formatPdfNumber(strokeWidth)} w`);
    commands.push("1 J");
    commands.push("1 j");

    if (action.type === TOOL_TYPES.DRAW || action.type === TOOL_TYPES.HIGHLIGHT) {
      drawPdfPolyline(commands, action.points);
      commands.push("S");
      commands.push("Q");
      return;
    }

    if (action.type === TOOL_TYPES.LINE) {
      commands.push(`${formatPdfNumber(action.start.x)} ${formatPdfNumber(action.start.y)} m`);
      commands.push(`${formatPdfNumber(action.end.x)} ${formatPdfNumber(action.end.y)} l`);
      commands.push("S");
      commands.push("Q");
      return;
    }

    if (action.type === TOOL_TYPES.ARROW) {
      commands.push(`${formatPdfNumber(action.start.x)} ${formatPdfNumber(action.start.y)} m`);
      commands.push(`${formatPdfNumber(action.end.x)} ${formatPdfNumber(action.end.y)} l`);
      commands.push("S");
      drawPdfArrowHead(commands, action);
      commands.push("Q");
      return;
    }

    if (action.type === TOOL_TYPES.RECT) {
      commands.push(
        `${formatPdfNumber(action.x)} ${formatPdfNumber(action.y)} ${formatPdfNumber(action.width)} ${formatPdfNumber(
          action.height
        )} re`
      );
      if (action.fillColor && action.fillColor !== "transparent") {
        commands.push("B");
      } else {
        commands.push("S");
      }
      commands.push("Q");
      return;
    }

    if (action.type === TOOL_TYPES.ROUNDED_RECT) {
      drawPdfRoundedRect(commands, action.x, action.y, action.width, action.height, action.radius || 8);
      if (action.fillColor && action.fillColor !== "transparent") {
        commands.push("B");
      } else {
        commands.push("S");
      }
      commands.push("Q");
      return;
    }

    if (action.type === TOOL_TYPES.ELLIPSE) {
      drawPdfEllipse(commands, action.x, action.y, action.width, action.height);
      if (action.fillColor && action.fillColor !== "transparent") {
        commands.push("B");
      } else {
        commands.push("S");
      }
      commands.push("Q");
      return;
    }

    if (action.type === TOOL_TYPES.REDACT) {
      commands.push(
        `${formatPdfNumber(action.x)} ${formatPdfNumber(action.y)} ${formatPdfNumber(action.width)} ${formatPdfNumber(
          action.height
        )} re`
      );
      commands.push("f");
      commands.push("Q");
      return;
    }

    if (action.type === TOOL_TYPES.TEXT) {
      const fontSize = Math.max(8, Number(action.fontSize || 14));
      const lines = String(action.text || "").split("\n");
      commands.push("BT");
      commands.push(`/F1 ${formatPdfNumber(fontSize)} Tf`);
      commands.push(pdfFillColor(action.strokeColor || strokeColor));
      const lineHeight = fontSize * 1.25;
      lines.forEach((line, index) => {
        const y = action.y + fontSize + index * lineHeight;
        commands.push(`1 0 0 1 ${formatPdfNumber(action.x)} ${formatPdfNumber(y)} Tm`);
        commands.push(`(${escapePdfText(line)}) Tj`);
      });
      commands.push("ET");
      commands.push("Q");
      return;
    }

    if (action.type === TOOL_TYPES.NUMBER_MARKER) {
      const radius = Math.max(8, Number(action.radius || 16));
      drawPdfCircle(commands, action.x, action.y, radius);
      commands.push("B");
      const textSize = Math.max(10, radius * 1.05);
      commands.push("BT");
      commands.push(`/F1 ${formatPdfNumber(textSize)} Tf`);
      commands.push(pdfFillColor(action.textColor || "#ffffff"));
      const centeredX = action.x - textSize * 0.3;
      const centeredY = action.y + textSize * 0.35;
      commands.push(`1 0 0 1 ${formatPdfNumber(centeredX)} ${formatPdfNumber(centeredY)} Tm`);
      commands.push(`(${escapePdfText(String(action.number || ""))}) Tj`);
      commands.push("ET");
      commands.push("Q");
      return;
    }

    if (action.type === TOOL_TYPES.CALLOUT) {
      drawPdfRoundedRect(commands, action.x, action.y, action.width, action.height, 10);
      commands.push("B");

      commands.push(`${formatPdfNumber(action.x + 2)} ${formatPdfNumber(action.y + 12)} m`);
      commands.push(`${formatPdfNumber(action.x - 14)} ${formatPdfNumber(action.y + 20)} l`);
      commands.push(`${formatPdfNumber(action.x + 2)} ${formatPdfNumber(action.y + 26)} l`);
      commands.push("h");
      commands.push("B");

      const fontSize = Math.max(8, Number(action.fontSize || 12));
      const lines = String(action.text || "").split("\n");
      commands.push("BT");
      commands.push(`/F1 ${formatPdfNumber(fontSize)} Tf`);
      commands.push(pdfFillColor(action.strokeColor || strokeColor));
      const lineHeight = fontSize * 1.2;
      lines.forEach((line, index) => {
        const y = action.y + 9 + fontSize + index * lineHeight;
        commands.push(`1 0 0 1 ${formatPdfNumber(action.x + 10)} ${formatPdfNumber(y)} Tm`);
        commands.push(`(${escapePdfText(line)}) Tj`);
      });
      commands.push("ET");
      commands.push("Q");
      return;
    }

    commands.push("Q");
  });

  commands.push("Q");
  return `${commands.join("\n")}\n`;
}

async function createPdfBlobFromCanvasAndVectors(rasterCanvas, vectorActions) {
  const jpegBlob = await canvasToBlob(rasterCanvas, "image/jpeg", 0.92);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

  const width = rasterCanvas.width;
  const height = rasterCanvas.height;

  const opacityValues = Array.from(
    new Set(
      vectorActions
        .map((action) => normalizeOpacity(action.opacity))
        .filter((opacity) => opacity < 0.999)
        .map((value) => Number(value.toFixed(3)))
    )
  );

  const opacityMap = new Map(opacityValues.map((opacity, index) => [opacity, `GS${index + 1}`]));

  const vectorStream = buildPdfVectorContent(vectorActions, height, opacityMap);
  const contentStream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n${vectorStream}`;
  const contentBytes = bytesFromString(contentStream);

  const objectChunks = [];
  const offsets = [0];
  let pointer = 0;

  const pushChunk = (bytes) => {
    offsets.push(pointer);
    objectChunks.push(bytes);
    pointer += bytes.length;
  };

  const header = bytesFromString("%PDF-1.4\n");
  pointer += header.length;

  pushChunk(bytesFromString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
  pushChunk(bytesFromString("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n"));

  const extGStateEntries = opacityValues
    .map((opacity, index) => `/${`GS${index + 1}`} ${7 + index} 0 R`)
    .join(" ");

  const extGStateBlock = extGStateEntries ? ` /ExtGState << ${extGStateEntries} >>` : "";

  pushChunk(
    bytesFromString(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> /Font << /F1 5 0 R >>${extGStateBlock} >> /Contents 6 0 R >>\nendobj\n`
    )
  );

  const imgHead = bytesFromString(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  const imgTail = bytesFromString("\nendstream\nendobj\n");
  const imgObject = joinUint8([imgHead, jpegBytes, imgTail]);
  pushChunk(imgObject);

  pushChunk(bytesFromString("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"));

  const contentHead = bytesFromString(`6 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  const contentBody = contentBytes;
  const contentTail = bytesFromString("endstream\nendobj\n");
  const contentObject = joinUint8([contentHead, contentBody, contentTail]);
  pushChunk(contentObject);

  opacityValues.forEach((opacity) => {
    pushChunk(
      bytesFromString(
        `${7 + opacityValues.indexOf(opacity)} 0 obj\n<< /Type /ExtGState /CA ${formatPdfNumber(
          opacity
        )} /ca ${formatPdfNumber(opacity)} >>\nendobj\n`
      )
    );
  });

  const xrefStart = pointer;
  const objectCount = 6 + opacityValues.length;
  const xrefLines = ["xref", `0 ${objectCount + 1}`, "0000000000 65535 f "];
  for (let i = 1; i <= objectCount; i += 1) {
    xrefLines.push(`${padOffset(offsets[i])} 00000 n `);
  }

  const xref = bytesFromString(`${xrefLines.join("\n")}\n`);
  const trailer = bytesFromString(
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  const pdfBytes = joinUint8([header, ...objectChunks, xref, trailer]);
  return new Blob([pdfBytes], { type: "application/pdf" });
}

function classifyClipboardError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  const lockedDownPatterns = [
    /enterprise/,
    /policy/,
    /managed/,
    /rdp/,
    /remote desktop/,
    /wayland/,
    /permission denied/,
    /denied/,
    /security/,
    /notallowederror/,
    /clipboard.*disabled/,
    /operation is insecure/
  ];

  if (lockedDownPatterns.some((pattern) => pattern.test(message))) {
    return "Clipboard is blocked by this environment (RDP, enterprise policy, or Linux/Wayland).";
  }

  return "Clipboard write failed in this browser context.";
}

function extensionForFormat(format) {
  if (format === "jpg") return "jpg";
  if (format === "webp") return "webp";
  if (format === "pdf") return "pdf";
  return "png";
}

async function copyToClipboard({ autoTriggered = false } = {}) {
  try {
    const blob = await exportImageBlob("png");
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("Clipboard API unavailable.");
    }
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    showToast("Copied PNG to clipboard.");
    return true;
  } catch (error) {
    console.error(error);
    const suffix = autoTriggered ? " Use Copy PNG after the editor opens." : "";
    showToast(`${classifyClipboardError(error)}${suffix}`, true);
    return false;
  }
}

async function downloadBlob(blob, extension, label) {
  const filename = `olho-capture-${Date.now()}.${extension}`;
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `Olho/${filename}`,
      saveAs: true
    });
    state.lastExportFilename = filename;
    showToast(`${label} download started.`);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 20_000);
  }
}

async function downloadExport() {
  const format = exportFormatInput.value;
  try {
    const blob = await exportImageBlob(format);
    await downloadBlob(blob, extensionForFormat(format), format.toUpperCase());
  } catch (error) {
    console.error(error);
    showToast("Download failed.", true);
  }
}

async function saveEditedCopy() {
  try {
    const format = exportFormatInput.value === "pdf" ? "png" : exportFormatInput.value;
    const blob = await exportImageBlob(format);
    const pressure = await estimateStoragePressure(blob.size);
    if (pressure.nearQuota) {
      showToast("Local library is nearly full. Consider cleanup soon.", true);
    }

    const payload = {
      kind: "screenshot",
      blob,
      sourceType: "visible",
      metadata: {
        title: sanitizeText(itemTitleInput.value) || `Olho Capture ${new Date().toLocaleString()}`,
        tags: parseTags(itemTagsInput.value),
        mimeType: blob.type,
        extension: extensionForFormat(format),
        sizeBytes: blob.size,
        width: canvas.width,
        height: canvas.height,
        sourceType: "visible",
        olhoProject: buildProjectPayload({ includeBaseData: true })
      }
    };

    const created = await saveMedia(payload);
    state.currentItemId = created.id;
    state.projectBaseItemId = payload.metadata.olhoProject.baseItemId || state.projectBaseItemId;
    setItemTitle(payload.metadata.title);
    setItemTags(payload.metadata.tags);
    updateToolbarState();
    await clearDraft();
    scheduleDraftSave();
    showToast("Edited copy saved to local library.");
  } catch (error) {
    console.error(error);
    if (error instanceof StorageQuotaError && error.blob instanceof Blob) {
      try {
        await downloadBlob(error.blob, "png", "PNG fallback");
        showToast("Library full. PNG fallback downloaded.", true);
        return;
      } catch {
        showToast("Library full and fallback download failed.", true);
        return;
      }
    }
    showToast("Save copy failed.", true);
  }
}

function hasSolidRedactionBlock() {
  return state.actions.some((action) => action.type === TOOL_TYPES.REDACT);
}

async function saveSecureRedactionCopy() {
  if (!hasSolidRedactionBlock()) {
    showToast("Secure redaction save requires at least one solid redaction block.", true);
    return;
  }

  try {
    const blob = await exportImageBlob("png");
    const pressure = await estimateStoragePressure(blob.size);
    if (pressure.nearQuota) {
      showToast("Local library is nearly full. Consider cleanup soon.", true);
    }

    const baseTitle = sanitizeText(itemTitleInput.value) || `Olho Capture ${new Date().toLocaleString()}`;
    const secureTitle = `${baseTitle} (Secure Redaction)`;

    const created = await saveMedia({
      kind: "screenshot",
      blob,
      sourceType: "visible",
      metadata: {
        title: secureTitle,
        tags: parseTags(itemTagsInput.value),
        mimeType: "image/png",
        extension: "png",
        sizeBytes: blob.size,
        width: canvas.width,
        height: canvas.height,
        sourceType: "visible",
        secureRedaction: true,
        redactionMode: "flattened",
        olhoProject: null,
        note: "Flattened secure redaction export. Blur/pixelate are visual only; solid blocks are intended masking."
      }
    });

    state.currentItemId = created.id;
    setItemTitle(secureTitle);
    updateToolbarState();
    await clearDraft();
    scheduleDraftSave();
    showToast("Secure redaction copy saved (flattened PNG, project metadata removed).");
  } catch (error) {
    console.error(error);
    if (error instanceof StorageQuotaError && error.blob instanceof Blob) {
      try {
        await downloadBlob(error.blob, "png", "Secure PNG fallback");
        showToast("Library full. Secure redaction PNG downloaded.", true);
        return;
      } catch {
        showToast("Secure redaction save failed and fallback download failed.", true);
        return;
      }
    }
    showToast("Secure redaction save failed.", true);
  }
}

async function overwriteCurrentItem() {
  if (!state.currentItemId) {
    showToast("No current item to overwrite.", true);
    return;
  }

  try {
    const format = exportFormatInput.value === "pdf" ? "png" : exportFormatInput.value;
    const blob = await exportImageBlob(format);
    const current = await getMedia(state.currentItemId);

    await saveMedia({
      id: state.currentItemId,
      kind: "screenshot",
      blob,
      folderId: current?.folderId,
      createdAt: current?.createdAt,
      sourceType: "visible",
      metadata: {
        ...(current?.metadata || {}),
        title: sanitizeText(itemTitleInput.value) || current?.metadata?.title || "Olho Capture",
        tags: parseTags(itemTagsInput.value),
        mimeType: blob.type,
        extension: extensionForFormat(format),
        sizeBytes: blob.size,
        width: canvas.width,
        height: canvas.height,
        sourceType: "visible",
        olhoProject: buildProjectPayload({ includeBaseData: true })
      }
    });

    await clearDraft();
    scheduleDraftSave();
    rememberSessionBaseline();
    showToast("Current item overwritten.");
  } catch (error) {
    console.error(error);
    showToast("Overwrite failed.", true);
  }
}

async function copyMarkdownReference() {
  if (!state.lastExportFilename) {
    showToast("Download a file first to create a local reference.", true);
    return;
  }

  const title = escapeMarkdown(state.itemTitle || "Olho Capture");
  const markdown = `![${title}](./${escapeMarkdown(state.lastExportFilename)})`;

  try {
    await navigator.clipboard.writeText(markdown);
    showToast("Markdown reference copied.");
  } catch (error) {
    console.error(error);
    showToast("Could not copy Markdown reference.", true);
  }
}

async function copyHtmlSnippet() {
  if (!state.lastExportFilename) {
    showToast("Download a file first to create a local snippet.", true);
    return;
  }

  const alt = escapeHtml(state.itemTitle || "Olho capture");
  const src = escapeHtml(`./${state.lastExportFilename}`);
  const html = `<img src="${src}" alt="${alt}" />`;

  try {
    await navigator.clipboard.writeText(html);
    showToast("HTML snippet copied.");
  } catch (error) {
    console.error(error);
    showToast("Could not copy HTML snippet.", true);
  }
}

async function exportAnnotationJson() {
  try {
    const payload = buildAnnotationSidecar();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    await downloadBlob(blob, "annotations.json", "Annotation JSON");
  } catch (error) {
    console.error(error);
    showToast("Annotation JSON export failed.", true);
  }
}

async function exportProjectFile() {
  try {
    const payload = buildProjectPayload({ includeBaseData: true });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    await downloadBlob(blob, "olho-project.json", "Project file");
  } catch (error) {
    console.error(error);
    showToast("Project export failed.", true);
  }
}

async function importProjectFile() {
  const file = projectFileInput.files?.[0];
  projectFileInput.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload || !Array.isArray(payload.actions)) {
      throw new Error("Invalid project file.");
    }

    pushUndoSnapshot();

    const loaded = await loadProjectFromPayload(payload, null);
    if (!loaded) {
      throw new Error("Project source image is unavailable.");
    }

    state.currentItemId = null;
    state.selectedActionId = null;
    renderAnnotationList();
    render();
    scheduleDraftSave();
  } catch (error) {
    console.error(error);
    showToast("Project import failed.", true);
  }
}

async function openGallery() {
  const url = chrome.runtime.getURL("gallery.html");
  await chrome.tabs.create({ url });
}

function onKeyDown(event) {
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    if (event.key === "Escape" && textComposer) {
      event.preventDefault();
      destroyTextComposer();
    }
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveEditedCopy();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copyToClipboard();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    if (event.shiftKey) {
      duplicateSelectedAction();
    } else {
      downloadExport();
    }
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelectedAction();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    destroyTextComposer();
    if (state.tool === TOOL_TYPES.CROP || state.tool === TOOL_TYPES.RESIZE) {
      setTool(TOOL_TYPES.SELECT);
      return;
    }
    if (state.selectedActionId) {
      state.selectedActionId = null;
      renderAnnotationList();
      render();
      return;
    }
    if (state.tool !== TOOL_TYPES.SELECT) {
      setTool(TOOL_TYPES.SELECT);
    }
    return;
  }

  if (event.key === "Enter") {
    if (state.tool === TOOL_TYPES.CROP) {
      event.preventDefault();
      applyCrop();
      return;
    }
    if (state.tool === TOOL_TYPES.RESIZE) {
      event.preventDefault();
      applyResize();
    }
  }
}

function showToast(message, isError = false) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  toast.style.borderColor = isError ? "rgba(239, 83, 80, 0.7)" : "rgba(159, 176, 216, 0.45)";
  toast.style.color = isError ? "#ffebee" : "#f4f7ff";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}
