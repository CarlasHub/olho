import test from "node:test";
import assert from "node:assert/strict";

import {
  addAnnotation,
  createAnnotationState,
  duplicateAnnotation,
  redoAnnotation,
  removeAnnotation,
  sanitizeAnnotationText,
  undoAnnotation,
  updateAnnotation
} from "../src/editor/annotation-model.js";

test("annotation text sanitization strips control characters", () => {
  const value = sanitizeAnnotationText("  hi\u0000\tthere\n ");
  assert.equal(value, "hi there");
});

test("annotation state supports add update remove", () => {
  let state = createAnnotationState();
  state = addAnnotation(state, { id: "a1", tool: "rect", bounds: { x: 10, y: 20, width: 100, height: 80 } });
  assert.equal(state.actions.length, 1);

  state = updateAnnotation(state, "a1", { bounds: { x: 15, y: 20, width: 120, height: 90 } });
  assert.equal(state.actions[0].bounds.x, 15);
  assert.equal(state.actions[0].bounds.width, 120);

  state = removeAnnotation(state, "a1");
  assert.equal(state.actions.length, 0);
});

test("annotation duplicate creates a separate action", () => {
  let state = createAnnotationState([{ id: "seed", tool: "arrow", bounds: { x: 1, y: 2, width: 3, height: 4 } }]);
  state = duplicateAnnotation(state, "seed", "copy");
  assert.equal(state.actions.length, 2);
  assert.equal(state.actions[0].id, "seed");
  assert.equal(state.actions[1].id, "copy");
  assert.notEqual(state.actions[0], state.actions[1]);
});

test("annotation undo and redo restore action snapshots", () => {
  let state = createAnnotationState();
  state = addAnnotation(state, { id: "first", tool: "rect", bounds: { x: 0, y: 0, width: 10, height: 10 } });
  state = addAnnotation(state, { id: "second", tool: "text", bounds: { x: 2, y: 2, width: 5, height: 5 } });
  assert.equal(state.actions.length, 2);

  state = undoAnnotation(state);
  assert.equal(state.actions.length, 1);
  assert.equal(state.actions[0].id, "first");

  state = redoAnnotation(state);
  assert.equal(state.actions.length, 2);
  assert.equal(state.actions[1].id, "second");
});
