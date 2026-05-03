const MAX_HISTORY_ENTRIES = 120;

function cloneAction(action) {
  return {
    ...action,
    bounds: action?.bounds ? { ...action.bounds } : undefined,
    style: action?.style ? { ...action.style } : undefined
  };
}

function cloneActions(actions = []) {
  return actions.map((action) => cloneAction(action));
}

function nextHistory(history, snapshot) {
  const merged = [...history, snapshot];
  if (merged.length <= MAX_HISTORY_ENTRIES) {
    return merged;
  }
  return merged.slice(merged.length - MAX_HISTORY_ENTRIES);
}

export function sanitizeAnnotationText(input) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createAnnotationState(initialActions = []) {
  return {
    actions: cloneActions(initialActions),
    selectedActionId: null,
    undoStack: [],
    redoStack: []
  };
}

export function addAnnotation(state, action) {
  if (!action || !action.id) {
    throw new Error("Annotation action with id is required.");
  }

  return {
    ...state,
    undoStack: nextHistory(state.undoStack || [], cloneActions(state.actions || [])),
    redoStack: [],
    actions: [...(state.actions || []), cloneAction(action)],
    selectedActionId: action.id
  };
}

export function updateAnnotation(state, id, updates = {}) {
  const items = state.actions || [];
  const index = items.findIndex((entry) => entry.id === id);
  if (index < 0) return state;

  const nextAction = cloneAction({
    ...items[index],
    ...updates
  });

  const nextActions = [...items];
  nextActions[index] = nextAction;

  return {
    ...state,
    undoStack: nextHistory(state.undoStack || [], cloneActions(items)),
    redoStack: [],
    actions: nextActions
  };
}

export function removeAnnotation(state, id) {
  const items = state.actions || [];
  const nextActions = items.filter((entry) => entry.id !== id);
  if (nextActions.length === items.length) return state;

  return {
    ...state,
    undoStack: nextHistory(state.undoStack || [], cloneActions(items)),
    redoStack: [],
    actions: nextActions,
    selectedActionId: state.selectedActionId === id ? null : state.selectedActionId
  };
}

export function duplicateAnnotation(state, id, nextId) {
  const items = state.actions || [];
  const source = items.find((entry) => entry.id === id);
  if (!source) return state;
  if (!nextId) {
    throw new Error("Next annotation id is required for duplicate.");
  }

  const clone = cloneAction({
    ...source,
    id: nextId
  });

  return {
    ...state,
    undoStack: nextHistory(state.undoStack || [], cloneActions(items)),
    redoStack: [],
    actions: [...items, clone],
    selectedActionId: nextId
  };
}

export function undoAnnotation(state) {
  const undoStack = state.undoStack || [];
  if (!undoStack.length) return state;

  const previous = undoStack[undoStack.length - 1];
  const nextUndo = undoStack.slice(0, -1);
  const nextRedo = nextHistory(state.redoStack || [], cloneActions(state.actions || []));

  return {
    ...state,
    actions: cloneActions(previous),
    undoStack: nextUndo,
    redoStack: nextRedo,
    selectedActionId: null
  };
}

export function redoAnnotation(state) {
  const redoStack = state.redoStack || [];
  if (!redoStack.length) return state;

  const next = redoStack[redoStack.length - 1];
  const nextRedo = redoStack.slice(0, -1);
  const nextUndo = nextHistory(state.undoStack || [], cloneActions(state.actions || []));

  return {
    ...state,
    actions: cloneActions(next),
    undoStack: nextUndo,
    redoStack: nextRedo,
    selectedActionId: null
  };
}
