import { assertEquals } from "jsr:@std/assert";
import { InputManager } from "../src/display/input/InputManager.js";
import { Actions } from "../src/display/input/actions.js";

class FakeEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }

  dispatchEvent(event) {
    const set = this._listeners.get(String(event?.type || ""));
    if (!set || set.size === 0) return true;
    for (const fn of Array.from(set)) fn(event);
    return !event.defaultPrevented;
  }

  emit(type, init = {}) {
    const ev = {
      type,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      stopImmediatePropagation() {},
      ...init,
    };
    this.dispatchEvent(ev);
    return ev;
  }
}

class FakeCanvas extends FakeEventTarget {
  constructor(rect) {
    super();
    this._rect = rect;
  }

  getBoundingClientRect() {
    return this._rect;
  }

  setPointerCapture() {}
  releasePointerCapture() {}
}

function emitPointer(target, type, x, y, pointerId = 1, pointerType = "touch") {
  target.emit(type, {
    pointerId,
    pointerType,
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
}

function drawPath(target, points, pointerId = 1, pointerType = "touch") {
  if (!Array.isArray(points) || points.length < 2) return;
  emitPointer(target, "pointerdown", points[0].x, points[0].y, pointerId, pointerType);
  for (let i = 1; i < points.length - 1; i++) {
    emitPointer(target, "pointermove", points[i].x, points[i].y, pointerId, pointerType);
  }
  const last = points[points.length - 1];
  emitPointer(target, "pointerup", last.x, last.y, pointerId, pointerType);
}

Deno.test("InputManager: touch tap emits tap-move action", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    emitPointer(canvas, "pointerdown", 170, 98);
    emitPointer(canvas, "pointerup", 170, 98);

    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.Move);
    assertEquals(actions[0]?.payload, { dx: 1, dy: 0 });
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: Z gesture emits active-spell cast action", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'gesture' });
  const actions = [];
  const hints = [];
  const off = mgr.onAction((a) => actions.push(a));
  target.addEventListener("ui:showSpellGestureHint", (e) => hints.push(e.detail));
  try {
    drawPath(canvas, [
      { x: 10, y: 10 },
      { x: 36, y: 10 },
      { x: 62, y: 10 },
      { x: 86, y: 10 },
      { x: 68, y: 34 },
      { x: 48, y: 56 },
      { x: 28, y: 78 },
      { x: 55, y: 78 },
      { x: 80, y: 78 },
      { x: 100, y: 78 },
    ]);

    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.CastActiveSpell);
    assertEquals(actions[0]?.payload, {});
    assertEquals(hints.length, 1);
    assertEquals(hints[0]?.id, "lightning");
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: Z gesture stays generic cast regardless of active spell label", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'gesture' });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    target.dispatchEvent(new CustomEvent("ui:updateActiveSpellLabel", {
      detail: { id: "blastwave" },
    }));

    drawPath(canvas, [
      { x: 12, y: 12 },
      { x: 40, y: 12 },
      { x: 68, y: 12 },
      { x: 92, y: 12 },
      { x: 70, y: 36 },
      { x: 50, y: 58 },
      { x: 30, y: 80 },
      { x: 58, y: 80 },
      { x: 86, y: 80 },
      { x: 104, y: 80 },
    ]);

    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.CastActiveSpell);
    assertEquals(actions[0]?.payload, {});
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: diagonal slash is unwired and falls back to movement", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    drawPath(canvas, [
      { x: 18, y: 12 },
      { x: 30, y: 24 },
      { x: 42, y: 36 },
      { x: 54, y: 48 },
      { x: 66, y: 60 },
      { x: 78, y: 72 },
      { x: 90, y: 84 },
      { x: 102, y: 96 },
    ]);

    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.Move);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: circle gesture is unwired and falls back to movement", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const hints = [];
  const off = mgr.onAction((a) => actions.push(a));
  target.addEventListener("ui:showSpellGestureHint", (e) => hints.push(e.detail));
  try {
    drawPath(canvas, [
      { x: 100, y: 40 },
      { x: 122, y: 50 },
      { x: 136, y: 70 },
      { x: 136, y: 94 },
      { x: 122, y: 114 },
      { x: 100, y: 124 },
      { x: 78, y: 114 },
      { x: 64, y: 94 },
      { x: 64, y: 70 },
      { x: 78, y: 50 },
      { x: 98, y: 42 },
    ]);

    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.Move);
    assertEquals(hints.length, 0);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: keyboard r and z both emit ranged action", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    const evR = target.emit("keydown", { key: "r", code: "KeyR" });
    const evZ = target.emit("keydown", { key: "z", code: "KeyZ" });

    assertEquals(evR.defaultPrevented, true);
    assertEquals(evZ.defaultPrevented, true);
    assertEquals(actions.length, 2);
    assertEquals(actions[0]?.type, Actions.ShootRanged);
    assertEquals(actions[1]?.type, Actions.ShootRanged);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: Shift+A arms cardinal attack direction", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const modes = [];
  const off = mgr.onAction((a) => actions.push(a));
  target.addEventListener("ui:attackDirectionMode", (e) => modes.push(e.detail));
  try {
    const evA = target.emit("keydown", { key: "A", code: "KeyA" });
    const evRight = target.emit("keydown", { key: "l", code: "KeyL" });

    assertEquals(evA.defaultPrevented, true);
    assertEquals(evRight.defaultPrevented, true);
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.AttackDirection);
    assertEquals(actions[0]?.payload, { dx: 1, dy: 0 });
    assertEquals(modes.map((m) => m.active), [true, false]);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: attack direction mode converts next touch direction to attack", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    target.dispatchEvent(new CustomEvent("ui:beginAttackDirection"));
    emitPointer(canvas, "pointerdown", 100, 20);
    emitPointer(canvas, "pointerup", 100, 20);

    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.AttackDirection);
    assertEquals(actions[0]?.payload, { dx: 0, dy: -1 });
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: keyboard c emits open character action", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    const evC = target.emit("keydown", { key: "c", code: "KeyC" });

    assertEquals(evC.defaultPrevented, true);
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.OpenCharacter);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: keyboard m toggles the minimap presentation", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  let toggles = 0;
  target.addEventListener("ui:toggleMinimap", () => toggles++);
  try {
    const evM = target.emit("keydown", { key: "m", code: "KeyM" });

    assertEquals(evM.defaultPrevented, true);
    assertEquals(toggles, 1);
  } finally {
    mgr.dispose();
  }
});

Deno.test("InputManager: keyboard f emits cast even when a ui-panel is open", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));

  const originalDocument = globalThis.document;
  const openPanel = { style: { display: "block" } };
  globalThis.document = {
    querySelectorAll(selector) {
      return selector === ".ui-panel" ? [openPanel] : [];
    },
  };

  try {
    const evF = target.emit("keydown", { key: "f", code: "KeyF", target: { tagName: "DIV" } });

    assertEquals(evF.defaultPrevented, true);
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.CastActiveSpell);
  } finally {
    off();
    mgr.dispose();
    globalThis.document = originalDocument;
  }
});

Deno.test("InputManager: keyboard e emits open equipment action", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    const evE = target.emit("keydown", { key: "e", code: "KeyE" });

    assertEquals(evE.defaultPrevented, true);
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.OpenEquipment);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: action-bar desktop hints emit canonical actions", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    const cases = [
      { event: { key: ".", code: "Period" }, type: Actions.Search },
      { event: { key: ">", code: "Period" }, type: Actions.Wait },
      { event: { key: "S", code: "KeyS" }, type: Actions.OpenSpellPicker },
      { event: { key: "p", code: "KeyP" }, type: Actions.RotatePetState },
      { event: { key: "o", code: "KeyO" }, type: Actions.QuickInteract },
      { event: { key: "v", code: "KeyV" }, type: Actions.CyclePosture },
    ];

    for (const entry of cases) {
      const ev = target.emit("keydown", entry.event);
      assertEquals(ev.defaultPrevented, true, `${entry.event.key} should be claimed`);
    }

    assertEquals(actions.map((a) => a.type), cases.map((entry) => entry.type));
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager: number keys target the four-slot pinned spell dock", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 220, height: 180 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false });
  const slots = [];
  target.addEventListener("ui:castPinnedSpell", (event) => slots.push(event.detail?.slot));
  try {
    for (const key of ["1", "2", "3", "4"]) {
      const ev = target.emit("keydown", { key, code: `Digit${key}` });
      assertEquals(ev.defaultPrevented, true, `${key} should cast pinned slot`);
    }
    const ev5 = target.emit("keydown", { key: "5", code: "Digit5" });

    assertEquals(slots, [0, 1, 2, 3]);
    assertEquals(ev5.defaultPrevented, false, "hidden fifth spell slot should not be keyboard-reachable");
  } finally {
    mgr.dispose();
  }
});

// ─── Walk-repeat mode tests ───────────────────────────────────────────────

Deno.test("InputManager walk mode: pointerdown emits immediate move", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'walk', walkInterval: 10000 });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    emitPointer(canvas, "pointerdown", 170, 98);
    // Immediate step: should emit one move right (170 > center 100, horizontal dominant)
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.Move);
    assertEquals(actions[0]?.payload, { dx: 1, dy: 0 });
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager walk mode: pointerup stops repeat without extra step", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'walk', walkInterval: 10000 });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    emitPointer(canvas, "pointerdown", 170, 98);
    emitPointer(canvas, "pointerup", 170, 98);
    // Only the initial step; no extra step on pointer up
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.Move);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager walk mode: pointermove updates direction for next repeat", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'walk', walkInterval: 10000 });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    emitPointer(canvas, "pointerdown", 170, 98); // right → step emitted
    emitPointer(canvas, "pointermove", 30, 98);  // drag toward left side
    // Move should NOT emit a second action (direction update deferred to next tick).
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.payload, { dx: 1, dy: 0 });
    // In walk mode, pointerup does NOT emit an extra step (differs from gesture mode).
    emitPointer(canvas, "pointerup", 30, 98);
    assertEquals(actions.length, 1, "no extra step emitted on pointer-up in walk mode");
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager walk mode: setMode switches to gesture mode — tap emits on pointer-up", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'walk', walkInterval: 10000 });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    // Switch to gesture mode at runtime.
    mgr.setMode('gesture');
    // In gesture mode a tap should emit the move on pointer-up (not on pointer-down).
    emitPointer(canvas, "pointerdown", 170, 98);
    assertEquals(actions.length, 0, "gesture mode: no immediate step on pointerdown");
    emitPointer(canvas, "pointerup", 170, 98);
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.Move);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager joystick mode: tap emits on pointer-up (gesture-style)", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'joystick' });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    emitPointer(canvas, "pointerdown", 170, 98);
    assertEquals(actions.length, 0, "joystick mode: no immediate step on pointerdown");
    emitPointer(canvas, "pointerup", 170, 98);
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.Move);
    assertEquals(actions[0]?.payload, { dx: 1, dy: 0 });
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager joystick mode: left-zone press shows joystick and movement is not pointermove-flooded", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'joystick', walkInterval: 10000 });
  const actions = [];
  const ui = [];
  const off = mgr.onAction((a) => actions.push(a));
  target.addEventListener('ui:joystickProgress', (e) => ui.push(e.detail));
  try {
    emitPointer(canvas, 'pointerdown', 40, 100); // left zone
    emitPointer(canvas, 'pointermove', 90, 100); // drag right beyond deadzone
    assertEquals(actions.length, 0);
    assertEquals(ui.length > 0, true);
    assertEquals(!!ui[0]?.active, true);

    emitPointer(canvas, 'pointerup', 40, 100);
    assertEquals(!!ui[ui.length - 1]?.active, false);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager joystick mode: short left-zone tap emits movement on pointer-up", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'joystick' });
  const actions = [];
  const ui = [];
  const off = mgr.onAction((a) => actions.push(a));
  target.addEventListener('ui:joystickProgress', (e) => ui.push(e.detail));
  try {
    emitPointer(canvas, 'pointerdown', 40, 100); // left zone joystick touch
    assertEquals(actions.length, 0, 'no immediate move on pointerdown in joystick mode');
    emitPointer(canvas, 'pointerup', 40, 100);
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.Move);
    assertEquals(actions[0]?.payload, { dx: -1, dy: 0 });
    assertEquals(ui.some((d) => !!d?.active), false);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager walk mode: ui:inputSettingsChanged event switches to walk mode", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  // Start in gesture mode.
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'gesture', walkInterval: 555 });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    // Switch to walk mode via event.
    target.dispatchEvent(new CustomEvent('ui:inputSettingsChanged', {
      detail: { inputMode: 'walk', walkInterval: 333 },
    }));
    // Now pointer-down should emit an immediate step (walk mode behaviour).
    emitPointer(canvas, "pointerdown", 170, 98);
    assertEquals(actions.length, 1);
    assertEquals(actions[0]?.type, Actions.Move);
    assertEquals(actions[0]?.payload, { dx: 1, dy: 0 });
    emitPointer(canvas, "pointerup", 170, 98);
  } finally {
    off();
    mgr.dispose();
  }
});

Deno.test("InputManager walk mode: pointercancel stops repeat", () => {
  const target = new FakeEventTarget();
  const canvas = new FakeCanvas({ left: 0, top: 0, width: 200, height: 200 });
  const mgr = new InputManager(target, { canvas, touchFeedback: false, inputMode: 'walk', walkInterval: 10000 });
  const actions = [];
  const off = mgr.onAction((a) => actions.push(a));
  try {
    emitPointer(canvas, "pointerdown", 170, 98);
    emitPointer(canvas, "pointercancel", 170, 98);
    assertEquals(mgr._walkRepeatTimer, 0);
    assertEquals(mgr._gesture.active, false);
  } finally {
    off();
    mgr.dispose();
  }
});
