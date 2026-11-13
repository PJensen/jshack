// display/input/InputManager.js
// Mobile-first pointer controls with spell gesture recognition.
// This module is display-only and must not import rules.

import {
  recognizeLightningGesture,
} from "./gestureRecognizers.js";
import { Actions, makeAction } from "./actions.js";

const TAP_SLOP_PX = 14;
const SAMPLE_MIN_DIST_PX = 3;
const MAX_GESTURE_POINTS = 64;
const MIN_GESTURE_POINTS = 6;
const CAST_MIN_QUALITY = 0.42;
const GESTURE_CLEAR_DELAY_MS = 180;
const JOYSTICK_LEFT_ZONE_RATIO = 0.5;
const JOYSTICK_DEADZONE_PX = 12;
const JOYSTICK_MAX_RADIUS_PX = 46;
const SWIPE_MIN_DIST_PX = 50;
const SWIPE_MAX_MS = 400;

function directionFromKey(key, code) {
  if (code === "ArrowLeft" || key === "a" || key === "h") return { dx: -1, dy: 0 };
  if (code === "ArrowRight" || key === "d" || key === "l") return { dx: 1, dy: 0 };
  if (code === "ArrowUp" || key === "w" || key === "k") return { dx: 0, dy: -1 };
  if (code === "ArrowDown" || key === "s" || key === "j") return { dx: 0, dy: 1 };
  return null;
}

export class InputManager {
  constructor(targetEl, options = {}) {
    this.target = targetEl || window;
    this.handlers = new Set();
    this.hotspots = new Map(); // id -> { element, action }
    this._canvas = options.canvas || null;
    this._touchFeedback = options.touchFeedback !== false;
    this._gestureClearTimer = 0;
    this._gesture = {
      active: false,
      pointerId: -1,
      pointerType: "",
      rect: null,
      localPoints: [],
      viewPoints: [],
      moved: false,
    };
    this._pointerInteraction = 'none'; // 'none' | 'walk' | 'gesture' | 'joystick'
    this._swipeStart = { x: 0, y: 0, t: 0 };
    this._joystick = {
      active: false,
      baseX: 0,
      baseY: 0,
      knobX: 0,
      knobY: 0,
      radius: JOYSTICK_MAX_RADIUS_PX,
      moved: false,
    };

    // Walk-repeat state ('walk' input mode).
    this._mode = (options.inputMode === 'gesture' || options.inputMode === 'joystick')
      ? options.inputMode
      : 'walk';
    this._walkInterval = Number.isFinite(options.walkInterval) && options.walkInterval > 0
      ? options.walkInterval : 555;
    this._walkRepeatTimer = 0;
    this._repeatPoint = null;

    this._cheatBuffer = "";
    this._attackDirectionPending = false;
    this._onKeyDown = (e) => this._handleKeyDown(e);
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);
    this._onPointerCancel = (e) => this._handlePointerCancel(e);
    this._onAttackDirectionRequest = () => this._beginAttackDirection();
    this._onSettingsChanged = (e) => {
      const { inputMode, walkInterval } = /** @type {any} */ (e).detail || {};
      if (inputMode === 'walk' || inputMode === 'gesture' || inputMode === 'joystick') this._mode = inputMode;
      if (Number.isFinite(walkInterval) && walkInterval > 0) this._walkInterval = walkInterval;
      // Cancel any active walk repeat when settings change.
      this._cancelWalkRepeat();
    };

    this._bind();
  }

  dispose() {
    this._unbind();
    if (this._gestureClearTimer) {
      clearTimeout(this._gestureClearTimer);
      this._gestureClearTimer = 0;
    }
    this._cancelWalkRepeat();
    this._emitUi("ui:joystickProgress", { active: false });
    this._resetGestureState();
    this.handlers.clear();
    this.hotspots.clear();
  }

  /**
   * Dynamically update the input mode and walk interval (called when settings change).
   * @param {'walk'|'gesture'|'joystick'} mode
   * @param {number} [walkInterval]
   */
  setMode(mode, walkInterval) {
    if (mode === 'walk' || mode === 'gesture' || mode === 'joystick') this._mode = mode;
    if (Number.isFinite(walkInterval) && walkInterval > 0) this._walkInterval = walkInterval;
    this._cancelWalkRepeat();
    this._emitUi("ui:joystickProgress", { active: false });
  }

  onAction(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  registerHotspot(id, element, action) {
    if (!element) return () => { };
    const rec = { element, action };
    this.hotspots.set(id, rec);
    const click = (ev) => {
      ev.preventDefault();
      this._emit(action);
    };
    element.addEventListener("click", click, { passive: false });
    return () => {
      element.removeEventListener("click", click);
      this.hotspots.delete(id);
    };
  }

  _emit(action) {
    for (const h of this.handlers) try { h(action); } catch (e) { console.debug('[InputManager] handler failed:', e); }
  }

  _bind() {
    this.target.addEventListener("keydown", this._onKeyDown);
    this.target.addEventListener("ui:beginAttackDirection", this._onAttackDirectionRequest);
    this.target.addEventListener("ui:inputSettingsChanged", this._onSettingsChanged);
    const el = this._canvas || this.target;
    el.addEventListener("pointerdown", this._onPointerDown, { passive: false });
    el.addEventListener("pointermove", this._onPointerMove, { passive: false });
    el.addEventListener("pointerup", this._onPointerUp, { passive: false });
    el.addEventListener("pointercancel", this._onPointerCancel, { passive: false });
  }

  _unbind() {
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("ui:beginAttackDirection", this._onAttackDirectionRequest);
    this.target.removeEventListener("ui:inputSettingsChanged", this._onSettingsChanged);
    const el = this._canvas || this.target;
    el.removeEventListener("pointerdown", this._onPointerDown);
    el.removeEventListener("pointermove", this._onPointerMove);
    el.removeEventListener("pointerup", this._onPointerUp);
    el.removeEventListener("pointercancel", this._onPointerCancel);
  }

  _handleKeyDown(e) {
    const { key, code } = e;
    const lowerKey = key?.toLowerCase?.();

    // Never intercept game keys when the user is typing in a text field (e.g. name input)
    const target = /** @type {any} */ (e.target);
    const tag = String(target?.tagName || "").toLowerCase();
    const isTextEntry = !!target?.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
    if (isTextEntry) return;

    const keyDir = directionFromKey(key, code);
    if (this._attackDirectionPending && keyDir) {
      e.preventDefault();
      this._attackDirectionPending = false;
      this._emitUi("ui:attackDirectionMode", { active: false });
      this._emit(makeAction(Actions.AttackDirection, keyDir));
      return;
    }
    if (this._attackDirectionPending && (key === "Escape" || lowerKey === "escape")) {
      e.preventDefault();
      this._attackDirectionPending = false;
      this._emitUi("ui:attackDirectionMode", { active: false, cancelled: true });
      return;
    }

    // Cheat code detection (IDDQD → god mode)
    if (lowerKey && lowerKey.length === 1) {
      this._cheatBuffer = (this._cheatBuffer + lowerKey).slice(-5);
      if (this._cheatBuffer === "iddqd") {
        this._cheatBuffer = "";
        try { this.target?.dispatchEvent?.(new CustomEvent('debug:toggleGodMode')); } catch {}
        return;
      }
    }

    // Cast active spell: 'f' should be reliable even if a stale UI panel is left open.
    if (lowerKey === "f") {
      e.preventDefault();
      this._emit(makeAction(Actions.CastActiveSpell));
      return;
    }

    // Toggle the minimap presentation without consuming a turn.
    if (lowerKey === "m") {
      e.preventDefault();
      try { this.target?.dispatchEvent?.(new CustomEvent("ui:toggleMinimap")); } catch {}
      return;
    }

    // Pinned spell dock slots 1-4. Desktop gets keyboard aliases for the same
    // four-slot spell surface used by touch.
    if (key >= '1' && key <= '4' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      try {
        this.target?.dispatchEvent?.(new CustomEvent('ui:castPinnedSpell', {
          detail: { slot: Number(key) - 1 }
        }));
      } catch {}
      return;
    }

    // If any UI panel is open, ignore movement/consumable bindings to let UI handle keys
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const openPanels = Array.from(document.querySelectorAll('.ui-panel')).filter((p) => p && p.style.display === 'block');
      if (openPanels.length) {
        // Allow UI overlays to consume keys like arrows/enter without moving the player
        return;
      }
    }

    // Open Inventory: 'i'
    if (key?.toLowerCase() === 'i') {
      e.preventDefault();
      this._emit(makeAction(Actions.OpenInventory));
      return;
    }
    // Open Character: 'c'
    if (key?.toLowerCase() === 'c') {
      e.preventDefault();
      this._emit(makeAction(Actions.OpenCharacter));
      return;
    }
    // Open Equipment: 'e'
    if (key?.toLowerCase() === 'e') {
      e.preventDefault();
      this._emit(makeAction(Actions.OpenEquipment));
      return;
    }
    // Open spell picker: Shift+S. Plain 's' remains movement down.
    if (key === "S") {
      e.preventDefault();
      this._emit(makeAction(Actions.OpenSpellPicker));
      return;
    }
    // Search intent: '.' (period), matching the action-bar affordance.
    if (key === ".") {
      e.preventDefault();
      this._emit(makeAction(Actions.Search));
      return;
    }
    // Explicit melee attack: Shift+A, then a cardinal direction.
    if (key === "A") {
      e.preventDefault();
      this._beginAttackDirection();
      return;
    }
    // Wait intent: Shift+. ('>')
    if (key === ">") {
      e.preventDefault();
      this._emit(makeAction(Actions.Wait));
      return;
    }
    // Pray to deity: 'P' (Shift+P)
    if (key === "P") {
      e.preventDefault();
      this._emit(makeAction(Actions.Pray));
      return;
    }
    // Move left / right
    if (code === "ArrowLeft" || key === "a" || key === "h") {
      e.preventDefault();
      this._emit(makeAction(Actions.Move, { dx: -1, dy: 0 }));
      return;
    }
    if (code === "ArrowRight" || key === "d" || key === "l") {
      e.preventDefault();
      this._emit(makeAction(Actions.Move, { dx: 1, dy: 0 }));
      return;
    }
    // Move up / down
    if (code === "ArrowUp" || key === "w" || key === "k") {
      e.preventDefault();
      this._emit(makeAction(Actions.Move, { dx: 0, dy: -1 }));
      return;
    }
    if (code === "ArrowDown" || key === "s" || key === "j") {
      e.preventDefault();
      this._emit(makeAction(Actions.Move, { dx: 0, dy: 1 }));
      return;
    }
    // Drink potion (common roguelike: 'q' for quaff)
    if (lowerKey === "q") {
      e.preventDefault();
      this._emit(makeAction(Actions.DrinkPotion));
      return;
    }

    // Ranged attack / zap: 'r' or 'z'
    if (lowerKey === "r" || lowerKey === "z") {
      e.preventDefault();
      this._emit(makeAction(Actions.ShootRanged));
      return;
    }

    // Pet state rotation: 'p'
    if (lowerKey === "p") {
      e.preventDefault();
      this._emit(makeAction(Actions.RotatePetState));
      return;
    }

    // Contextual door/adjacent interaction: 'o'
    if (lowerKey === "o") {
      e.preventDefault();
      this._emit(makeAction(Actions.QuickInteract));
      return;
    }

    // Combat posture rotation: 'v'
    if (lowerKey === "v") {
      e.preventDefault();
      this._emit(makeAction(Actions.CyclePosture));
      return;
    }

    // Memory graph toggle: Shift+8
    if (key === '*' || (key === '8' && e.shiftKey)) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('ui:toggleMemoryGraph'));
      return;
    }

    // Deity mood graph show: Shift+7
    if (key === '&' || (key === '7' && e.shiftKey)) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('ui:showDeityMoodGraph'));
      return;
    }

    // Economy graph toggle: Shift+6
    if (key === '^' || (key === '6' && e.shiftKey)) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('ui:toggleEconomyGraph'));
      return;
    }

    // Lighting perf graph toggle: Shift+5
    if (key === '%' || (key === '5' && e.shiftKey)) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('ui:toggleLightingPerfGraph'));
      return;
    }

    // Apply tool: 'A' (Shift+A)
    if (key === "A") {
      e.preventDefault();
      this._emit(makeAction(Actions.OpenApplyChooser));
      return;
    }

    // Death log: '#' (tombstone-themed)
    if (key === "#") {
      e.preventDefault();
      this._emit(makeAction(Actions.OpenDeathLog));
      return;
    }

    // Pickup chooser: ',' (get)
    if (key === ",") {
      e.preventDefault();
      this._emit(makeAction(Actions.OpenPickupChooser));
      return;
    }
    // Desktop stair traverse: Enter / NumpadEnter
    if (key === "Enter" || code === "NumpadEnter") {
      e.preventDefault();
      this._emit(makeAction(Actions.TraverseStairs));
      return;
    }
  }

  _handlePointerDown(e) {
    const canvas = this._canvas;
    if (!canvas) return;
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      e.preventDefault();
      this._emitMoveTap(e.clientX, e.clientY, canvas.getBoundingClientRect());
      return;
    }
    if (this._gesture.active) return;
    if (typeof e.isPrimary === "boolean" && !e.isPrimary) return;

    e.preventDefault();
    this._swipeStart = { x: Number(e.clientX), y: Number(e.clientY), t: Date.now() };

    if (this._mode === 'walk') {
      // Walk-repeat mode: emit one step immediately, then repeat at _walkInterval.
      const rect = canvas.getBoundingClientRect();
      const localX = Number(e.clientX) - rect.left;
      const localY = Number(e.clientY) - rect.top;
      if (!Number.isFinite(localX) || !Number.isFinite(localY)) return;

      this._gesture.active = true;
      this._gesture.pointerId = Number(e.pointerId);
      this._gesture.rect = rect;
      this._pointerInteraction = 'walk';
      this._repeatPoint = { x: localX, y: localY };

      // Immediate first step.
      this._emitMoveFromLocalPoint(this._repeatPoint, rect);

      // Start repeat timer.
      this._startWalkRepeat();
      try {
        if (typeof canvas.setPointerCapture === "function") canvas.setPointerCapture(e.pointerId);
      } catch {}
      return;
    }

    if (this._mode === 'joystick') {
      const rect = canvas.getBoundingClientRect();
      const localX = Number(e.clientX) - rect.left;
      const localY = Number(e.clientY) - rect.top;
      if (!Number.isFinite(localX) || !Number.isFinite(localY)) return;

      if (localX <= rect.width * JOYSTICK_LEFT_ZONE_RATIO) {
        this._gesture.active = true;
        this._gesture.pointerId = Number(e.pointerId);
        this._gesture.rect = rect;
        this._pointerInteraction = 'joystick';

        this._joystick.active = true;
        this._joystick.baseX = localX;
        this._joystick.baseY = localY;
        this._joystick.knobX = localX;
        this._joystick.knobY = localY;
        this._joystick.moved = false;
        this._repeatPoint = { x: localX, y: localY };
        this._emitMoveFromJoystick();
        this._startWalkRepeat();
        try {
          if (typeof canvas.setPointerCapture === "function") canvas.setPointerCapture(e.pointerId);
        } catch {}
        return;
      }
    }

    if (this._gestureClearTimer) {
      clearTimeout(this._gestureClearTimer);
      this._gestureClearTimer = 0;
    }
    this._gesture.active = true;
    this._gesture.pointerId = Number(e.pointerId);
    this._gesture.pointerType = String(e.pointerType || "");
    this._gesture.rect = canvas.getBoundingClientRect();
    this._gesture.localPoints = [];
    this._gesture.viewPoints = [];
    this._gesture.moved = false;
    this._pointerInteraction = 'gesture';
    this._appendGesturePoint(e);
    this._emitGestureProgress(true, null);
    try {
      if (typeof canvas.setPointerCapture === "function") canvas.setPointerCapture(e.pointerId);
    } catch {} // pointer capture may not be supported
  }

  _handlePointerMove(e) {
    if (!this._gesture.active) return;
    if (Number(e.pointerId) !== this._gesture.pointerId) return;

    e.preventDefault();

    if (this._pointerInteraction === 'walk') {
      // Update the current repeat point so the next tick walks in the new direction.
      const rect = this._gesture.rect;
      if (rect) {
        const localX = Number(e.clientX) - rect.left;
        const localY = Number(e.clientY) - rect.top;
        if (Number.isFinite(localX) && Number.isFinite(localY)) {
          this._repeatPoint = { x: localX, y: localY };
        }
      }
      return;
    }

    if (this._pointerInteraction === 'joystick') {
      const rect = this._gesture.rect;
      if (!rect) return;
      const localX = Number(e.clientX) - rect.left;
      const localY = Number(e.clientY) - rect.top;
      if (!Number.isFinite(localX) || !Number.isFinite(localY)) return;

      const dx = localX - this._joystick.baseX;
      const dy = localY - this._joystick.baseY;
      const mag = Math.hypot(dx, dy);
      if (mag >= JOYSTICK_DEADZONE_PX) this._joystick.moved = true;
      const scale = mag > JOYSTICK_MAX_RADIUS_PX ? (JOYSTICK_MAX_RADIUS_PX / mag) : 1;
      this._joystick.knobX = this._joystick.baseX + dx * scale;
      this._joystick.knobY = this._joystick.baseY + dy * scale;
      this._repeatPoint = { x: this._joystick.knobX, y: this._joystick.knobY };
      if (this._joystick.moved) this._emitUi("ui:joystickProgress", this._buildJoystickUiPayload());
      return;
    }

    this._appendGesturePoint(e);
    this._emitGestureProgress(true, null);
  }

  _handlePointerUp(e) {
    if (!this._gesture.active) return;
    if (Number(e.pointerId) !== this._gesture.pointerId) return;

    e.preventDefault();

    if (this._pointerInteraction === 'walk') {
      this._cancelWalkRepeat();
      this._repeatPoint = null;
      if (this._detectSwipeRight(e)) {
        this._resetGestureState();
        this._emit(makeAction(Actions.OpenInventory));
        return;
      }
      this._resetGestureState();
      return;
    }

    if (this._pointerInteraction === 'joystick') {
      this._cancelWalkRepeat();
      this._repeatPoint = null;
      if (this._detectSwipeRight(e)) {
        this._emitUi("ui:joystickProgress", { active: false });
        this._resetGestureState();
        this._emit(makeAction(Actions.OpenInventory));
        return;
      }
      if (!this._joystick.moved) {
        const rect = this._gesture.rect;
        if (rect) {
          this._emitMoveFromLocalPoint({ x: this._joystick.baseX, y: this._joystick.baseY }, rect);
        }
      }
      this._emitUi("ui:joystickProgress", { active: false });
      this._resetGestureState();
      return;
    }

    this._appendGesturePoint(e);

    let recognized = null;
    if (this._gesture.moved && this._gesture.localPoints.length >= MIN_GESTURE_POINTS) {
      recognized = this._recognizeSpellGesture(this._gesture.localPoints, CAST_MIN_QUALITY);
    }

    if (recognized?.spellId) {
      // Route through normal active-spell cast flow (no hardcoded spell id).
      // This keeps gesture casting aligned with keyboard/HUD casting behavior.
      this._emit(makeAction(Actions.CastActiveSpell));
      this._emitUi("ui:showSpellGestureHint", {
        id: recognized.spellId,
        mode: "cast",
        quality: recognized.quality,
      });
      this._emitGestureProgress(false, recognized);
      this._resetGestureState();
      this._gestureClearTimer = setTimeout(() => {
        this._emitUi("ui:gestureProgress", { points: [], active: false, recognized: null });
        this._gestureClearTimer = 0;
      }, GESTURE_CLEAR_DELAY_MS);
      return;
    }

    if (this._detectSwipeRight(e)) {
      this._emitUi("ui:gestureProgress", { points: [], active: false, recognized: null });
      this._resetGestureState();
      this._emit(makeAction(Actions.OpenInventory));
      return;
    }

    const last = this._gesture.localPoints[this._gesture.localPoints.length - 1];
    if (last) this._emitMoveFromLocalPoint(last, this._gesture.rect);
    this._emitUi("ui:gestureProgress", { points: [], active: false, recognized: null });
    this._resetGestureState();
  }

  _handlePointerCancel(e) {
    if (!this._gesture.active) return;
    if (Number(e.pointerId) !== this._gesture.pointerId) return;
    e.preventDefault();
    if (this._pointerInteraction === 'walk') {
      this._cancelWalkRepeat();
      this._repeatPoint = null;
    } else if (this._pointerInteraction === 'joystick') {
      this._cancelWalkRepeat();
      this._repeatPoint = null;
      this._emitUi("ui:joystickProgress", { active: false });
    } else {
      this._emitUi("ui:gestureProgress", { points: [], active: false, recognized: null });
    }
    this._resetGestureState();
  }

  _resetGestureState() {
    const canvas = this._canvas;
    const pointerId = this._gesture.pointerId;
    this._gesture.active = false;
    this._gesture.pointerId = -1;
    this._gesture.pointerType = "";
    this._gesture.rect = null;
    this._gesture.localPoints = [];
    this._gesture.viewPoints = [];
    this._gesture.moved = false;
    this._pointerInteraction = 'none';
    this._joystick.active = false;
    this._joystick.moved = false;
    try {
      if (canvas && pointerId >= 0 && typeof canvas.releasePointerCapture === "function") {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {} // pointer capture may not be supported
  }

  _appendGesturePoint(e) {
    const rect = this._gesture.rect || this._canvas?.getBoundingClientRect();
    if (!rect) return;
    const localX = Number(e.clientX) - rect.left;
    const localY = Number(e.clientY) - rect.top;
    const viewX = Number(e.clientX);
    const viewY = Number(e.clientY);
    if (!Number.isFinite(localX) || !Number.isFinite(localY)) return;
    if (!Number.isFinite(viewX) || !Number.isFinite(viewY)) return;

    const points = this._gesture.localPoints;
    const last = points[points.length - 1];
    if (last) {
      const d = Math.hypot(localX - last.x, localY - last.y);
      if (d < SAMPLE_MIN_DIST_PX) return;
    }
    points.push({ x: localX, y: localY });
    this._gesture.viewPoints.push({ x: viewX, y: viewY });
    if (points.length > MAX_GESTURE_POINTS) {
      points.shift();
      this._gesture.viewPoints.shift();
    }

    const first = points[0];
    if (!first) return;
    const distFromStart = Math.hypot(localX - first.x, localY - first.y);
    this._gesture.moved = this._gesture.moved || distFromStart >= TAP_SLOP_PX;
  }

  _startWalkRepeat() {
    this._cancelWalkRepeat();
    this._walkRepeatTimer = setInterval(() => {
      // Stop if a UI panel is open (modal interruption).
      if (this._isUiBlocked()) {
        this._cancelWalkRepeat();
        this._repeatPoint = null;
        this._resetGestureState();
        return;
      }
      if (!this._gesture.active || !this._repeatPoint || !this._gesture.rect) {
        this._cancelWalkRepeat();
        return;
      }
      if (this._pointerInteraction === 'joystick') {
        this._emitMoveFromJoystick();
        return;
      }
      this._emitMoveFromLocalPoint(this._repeatPoint, this._gesture.rect);
    }, this._walkInterval);
  }

  _cancelWalkRepeat() {
    if (this._walkRepeatTimer) {
      clearInterval(this._walkRepeatTimer);
      this._walkRepeatTimer = 0;
    }
  }

  _isUiBlocked() {
    try {
      if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
        const panels = document.querySelectorAll('.ui-panel');
        for (let i = 0; i < panels.length; i++) {
          if (panels[i] && /** @type {any} */ (panels[i]).style.display === 'block') return true;
        }
      }
    } catch {}
    return false;
  }

  _emitGestureProgress(active, recognized) {
    if (!this._touchFeedback) return;
    this._emitUi("ui:gestureProgress", {
      points: this._gesture.viewPoints.slice(),
      active: !!active,
      recognized: recognized || null,
    });
  }

  _recognizeSpellGesture(localPoints, minQuality) {
    if (!Array.isArray(localPoints) || localPoints.length < MIN_GESTURE_POINTS) return null;

    // Intentionally scoped to one reliable gesture for now.
    // Other gesture recognizers remain available but are unhooked from input wiring.
    const z = recognizeLightningGesture(localPoints);
    if (!z || Number(z.quality) < minQuality) return null;
    return {
      spellId: "lightning",
      quality: Number(z.quality),
      bounds: this._boundsToViewport(z.bounds),
    };
  }

  _boundsToViewport(bounds) {
    const rect = this._gesture.rect;
    if (!bounds || !rect) return null;
    return {
      x: rect.left + Number(bounds.minX || 0),
      y: rect.top + Number(bounds.minY || 0),
      w: Number(bounds.width || 0),
      h: Number(bounds.height || 0),
    };
  }

  _emitMoveTap(clientX, clientY, rect) {
    const x = Number(clientX) - rect.left;
    const y = Number(clientY) - rect.top;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this._emitMoveFromLocalPoint({ x, y }, rect);
  }

  _emitMoveFromLocalPoint(point, rect) {
    if (!point || !rect) return;
    const centerX = rect.width * 0.5;
    const centerY = rect.height * 0.5;
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    if (Math.abs(dx) > Math.abs(dy)) {
      this._emitDirectionalAction({ dx: dx > 0 ? 1 : -1, dy: 0 });
      return;
    }
    this._emitDirectionalAction({ dx: 0, dy: dy > 0 ? 1 : -1 });
  }

  _emitMoveFromJoystick() {
    const dx = this._joystick.knobX - this._joystick.baseX;
    const dy = this._joystick.knobY - this._joystick.baseY;
    const mag = Math.hypot(dx, dy);
    if (!(mag >= JOYSTICK_DEADZONE_PX)) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      this._emitDirectionalAction({ dx: dx > 0 ? 1 : -1, dy: 0 });
      return;
    }
    this._emitDirectionalAction({ dx: 0, dy: dy > 0 ? 1 : -1 });
  }

  _beginAttackDirection() {
    this._attackDirectionPending = true;
    this._cancelWalkRepeat();
    this._emitUi("ui:attackDirectionMode", { active: true });
  }

  _emitDirectionalAction(dir) {
    if (this._attackDirectionPending) {
      this._attackDirectionPending = false;
      this._emitUi("ui:attackDirectionMode", { active: false });
      this._emit(makeAction(Actions.AttackDirection, dir));
      return;
    }
    this._emit(makeAction(Actions.Move, dir));
  }

  _buildJoystickUiPayload() {
    const rect = this._gesture.rect;
    if (!rect) return { active: false };
    return {
      active: true,
      base: {
        x: rect.left + this._joystick.baseX,
        y: rect.top + this._joystick.baseY,
      },
      knob: {
        x: rect.left + this._joystick.knobX,
        y: rect.top + this._joystick.knobY,
      },
      radius: this._joystick.radius,
    };
  }

  _detectSwipeRight(e) {
    const dx = Number(e.clientX) - this._swipeStart.x;
    const dy = Number(e.clientY) - this._swipeStart.y;
    const dt = Date.now() - this._swipeStart.t;
    return dx > SWIPE_MIN_DIST_PX && Math.abs(dx) > 2 * Math.abs(dy) && dt < SWIPE_MAX_MS;
  }

  _emitUi(name, detail) {
    try {
      this.target?.dispatchEvent?.(new CustomEvent(name, { detail }));
    } catch (e) { console.debug('[InputManager] dispatch ' + name + ':', e); }
  }
}
