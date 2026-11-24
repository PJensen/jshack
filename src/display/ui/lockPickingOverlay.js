// display/ui/lockPickingOverlay.js
// Display-only glyph lock minigame. Rules-side lock semantics can be wired later
// by opening this overlay and listening for ui:lockPickingFinished.

const TAU = Math.PI * 2;
const POLAR_DEADZONE = 0.18;
const POLAR_OUTER_RING = 0.96;

export const LOCK_PICKING_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    angleTolerance: 0.16,
    tensionTolerance: 0.15,
    setHoldMs: 190,
    jamHoldMs: 560,
    decayMs: 260,
  }),
  normal: Object.freeze({
    angleTolerance: 0.12,
    tensionTolerance: 0.11,
    setHoldMs: 260,
    jamHoldMs: 420,
    decayMs: 220,
  }),
  hard: Object.freeze({
    angleTolerance: 0.09,
    tensionTolerance: 0.085,
    setHoldMs: 340,
    jamHoldMs: 330,
    decayMs: 180,
  }),
});

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function angleDistance(a, b) {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % TAU) - Math.PI;
  return a + d * t;
}

function normalizePinCount(pinCount) {
  const n = Number(pinCount);
  if (!Number.isFinite(n)) return 5;
  return clamp(n | 0, 2, 9);
}

export function resolvePolarLockInput(dx, dy, radius) {
  const r = Math.max(1, Number(radius) || 1);
  const distance = Math.hypot(dx, dy);
  const inner = r * POLAR_DEADZONE;
  const outer = r * POLAR_OUTER_RING;
  const force = clamp((distance - inner) / Math.max(1, outer - inner), 0, 1);
  return Object.freeze({
    angle: Math.atan2(dy, dx),
    force,
    active: distance > inner,
  });
}

export function createLockPickingResult(game, success, reason) {
  return Object.freeze({
    success: !!success,
    reason: String(reason || (success ? "unlocked" : "failed")),
    pins: Number(game?.pinCount || 0) | 0,
    difficulty: String(game?.difficulty?.id || "normal"),
  });
}

export function notifyLockPickingResult(options, result) {
  if (typeof options?.finishedPickedListener === "function") {
    options.finishedPickedListener(result);
  }
  if (result.success && typeof options?.successPickedListener === "function") {
    options.successPickedListener(result);
  }
  if (!result.success && typeof options?.failedPickedListener === "function") {
    options.failedPickedListener(result);
  }
}

export function normalizeLockDifficulty(difficulty) {
  if (difficulty && typeof difficulty === "object") {
    return Object.freeze({
      ...LOCK_PICKING_DIFFICULTIES.normal,
      ...difficulty,
      id: String(difficulty.id || "custom"),
    });
  }

  const raw = String(difficulty || "normal").trim().toLowerCase();
  if (LOCK_PICKING_DIFFICULTIES[raw]) {
    return Object.freeze({ ...LOCK_PICKING_DIFFICULTIES[raw], id: raw });
  }

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const t = clamp(numeric, 1, 10) / 10;
    return Object.freeze({
      id: `rating:${numeric}`,
      angleTolerance: 0.18 - t * 0.105,
      tensionTolerance: 0.17 - t * 0.095,
      setHoldMs: 170 + t * 280,
      jamHoldMs: 590 - t * 300,
      decayMs: 280 - t * 120,
    });
  }

  return Object.freeze({ ...LOCK_PICKING_DIFFICULTIES.normal, id: "normal" });
}

function rng(seed) {
  let s = seed | 0;
  return function next() {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seedFrom(pinCount, difficulty) {
  let seed = 0x2A71C0DE ^ (pinCount * 991);
  const id = String(difficulty?.id || "normal");
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  return seed | 0;
}

export class LockPickingMiniGame {
  constructor(pinCount = 5, difficulty = "normal") {
    this.pinCount = normalizePinCount(pinCount);
    this.difficulty = normalizeLockDifficulty(difficulty);
    this.seed = seedFrom(this.pinCount, this.difficulty);
    this.state = {
      pins: [],
      tension: 0,
      pickAngle: -Math.PI / 2,
      shownPickAngle: -Math.PI / 2,
      pickActive: false,
      solved: false,
      jam: 0,
      flash: 0,
      shake: 0,
      message: "Drag from the center. Direction aims the pick; distance sets force.",
      status: "find the first tooth",
    };
    this.reset();
  }

  reset() {
    const rand = rng(this.seed);
    const offset = rand() * TAU;
    const pins = [];
    for (let i = 0; i < this.pinCount; i++) {
      pins.push({
        id: i,
        angle: (offset + i * TAU / this.pinCount + (rand() - 0.5) * 0.44 + TAU) % TAU,
        tension: 0.22 + rand() * 0.58,
        set: false,
        charge: 0,
        grind: 0,
        pulse: 0,
      });
    }
    this.state.pins = pins.sort((a, b) => a.angle - b.angle);
    this.state.tension = 0;
    this.state.pickAngle = -Math.PI / 2;
    this.state.shownPickAngle = this.state.pickAngle;
    this.state.pickActive = false;
    this.state.solved = false;
    this.state.jam = 0;
    this.state.flash = 0;
    this.state.shake = 0;
    this.state.message = "Drag from the center. Direction aims the pick; distance sets force.";
    this.state.status = "find the first tooth";
  }

  get setCount() {
    return this.state.pins.filter((pin) => pin.set).length;
  }

  get progress() {
    return this.state.pins.length ? this.setCount / this.state.pins.length : 0;
  }

  canSet(pin) {
    return this.state.pickActive &&
      angleDistance(this.state.pickAngle, pin.angle) < this.difficulty.angleTolerance &&
      Math.abs(this.state.tension - pin.tension) < this.difficulty.tensionTolerance;
  }

  isGrinding(pin) {
    return this.state.pickActive &&
      !pin.set &&
      angleDistance(this.state.pickAngle, pin.angle) < this.difficulty.angleTolerance * 1.15 &&
      this.state.tension > pin.tension + this.difficulty.tensionTolerance * 1.35;
  }

  nearestUnsetPin() {
    let best = null;
    let bestD = Infinity;
    for (const pin of this.state.pins) {
      if (pin.set) continue;
      const d = angleDistance(this.state.pickAngle, pin.angle);
      if (d < bestD) {
        best = pin;
        bestD = d;
      }
    }
    return best;
  }

  tick(dt) {
    if (this.state.solved) return;
    const s = this.state;
    s.flash = Math.max(0, s.flash - dt);
    s.shake = Math.max(0, s.shake - dt);
    s.shownPickAngle = lerpAngle(s.shownPickAngle, s.pickAngle, 1 - Math.pow(0.34, dt / 16.67));

    const candidate = this.nearestUnsetPin();
    for (const pin of s.pins) {
      if (pin.set) continue;

      if (pin === candidate && this.canSet(pin)) {
        pin.charge += dt;
        if (pin.charge >= this.difficulty.setHoldMs) {
          pin.set = true;
          pin.pulse = 1;
          pin.charge = 0;
          s.flash = 160;
          s.jam = 0;
          const left = s.pins.length - this.setCount;
          s.status = left ? `${left} teeth remain` : "open";
          s.message = left ? "Clean set. Keep moving." : "The lock gives.";
        }
      } else {
        pin.charge = Math.max(0, pin.charge - dt / this.difficulty.decayMs * this.difficulty.setHoldMs);
      }

      if (pin === candidate && this.isGrinding(pin)) {
        pin.grind += dt;
        s.jam += dt;
        s.shake = 90;
        s.message = "Too much force. Ease off.";
        if (s.jam >= this.difficulty.jamHoldMs) {
          const lastSet = [...s.pins].reverse().find((p) => p.set);
          if (lastSet) lastSet.set = false;
          s.jam = 0;
          s.flash = 220;
          s.status = "slipped";
          s.message = "The lock bit back. Reset the pressure.";
        }
      } else {
        pin.grind = Math.max(0, pin.grind - dt * 2);
      }

      pin.pulse = Math.max(0, pin.pulse - dt / 300);
    }

    if (s.pins.every((pin) => pin.set)) {
      s.solved = true;
      s.flash = 700;
      s.status = "unlocked";
      s.message = "Open. Clean work.";
    }
  }
}

function vibrate(pattern) {
  try {
    if (navigator?.vibrate) navigator.vibrate(pattern);
  } catch {
    // Optional haptics are best-effort display feedback.
  }
}

function setStyles(el, styles) {
  Object.assign(el.style, styles);
  return el;
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function updateHud(game, els) {
  const total = game.state.pins.length;
  const set = game.setCount;
  els.count.textContent = `${set}/${total}`;
  els.progress.style.width = `${game.progress * 100}%`;
  els.force.textContent = `force ${Math.round(game.state.tension * 100)}%`;
  els.status.textContent = game.state.status;
  els.toast.textContent = game.state.message;
  if (els.open) {
    els.open.disabled = !game.state.solved;
    els.open.style.opacity = game.state.solved ? "1" : ".45";
    els.open.style.cursor = game.state.solved ? "pointer" : "default";
  }
}

function drawLock(game, canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const s = game.state;
  const shake = s.shake ? Math.sin(Date.now() * 0.07) * 2.5 : 0;
  const cx = w / 2 + shake;
  const cy = h / 2 + 4 - shake;
  const r = Math.min(w, h) * 0.34;

  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.5);
  bg.addColorStop(0, "rgba(119,180,214,.16)");
  bg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.65, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);

  ctx.lineWidth = 18;
  ctx.strokeStyle = "rgba(255,255,255,.075)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.04, 0, TAU);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.beginPath();
  ctx.arc(0, 0, r * POLAR_DEADZONE, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, r * POLAR_OUTER_RING, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.lineWidth = 7;
  ctx.strokeStyle = s.solved ? "rgba(84,224,154,.95)" : "rgba(119,180,214,.45)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, -Math.PI / 2, -Math.PI / 2 + TAU * s.tension);
  ctx.stroke();

  for (const pin of s.pins) {
    const px = Math.cos(pin.angle) * r * 0.86;
    const py = Math.sin(pin.angle) * r * 0.86;
    const charge = pin.charge / game.difficulty.setHoldMs;
    const glow = pin.set ? 1 : charge;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(pin.angle + Math.PI / 2);
    ctx.fillStyle = pin.set ? "rgba(84,224,154,.95)" : `rgba(255,255,255,${0.18 + glow * 0.55})`;
    ctx.strokeStyle = pin.grind > 0 ? "rgba(231,92,84,.95)" : "rgba(255,255,255,.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-11, -17, 22, 34, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pin.set ? "rgba(9,11,16,.8)" : "rgba(9,11,16,.55)";
    ctx.beginPath();
    ctx.arc(0, 0, 4 + charge * 5, 0, TAU);
    ctx.fill();

    if (pin.pulse > 0) {
      ctx.strokeStyle = `rgba(84,224,154,${pin.pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + (1 - pin.pulse) * 22, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  const a = s.shownPickAngle;
  const pickLength = r * (POLAR_DEADZONE + (POLAR_OUTER_RING - POLAR_DEADZONE) * Math.max(0.08, s.tension));
  const px = Math.cos(a) * pickLength;
  const py = Math.sin(a) * pickLength;
  ctx.lineCap = "round";
  ctx.strokeStyle = s.pickActive ? "rgba(238,244,255,.92)" : "rgba(238,244,255,.38)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
  ctx.lineTo(px, py);
  ctx.stroke();

  ctx.strokeStyle = s.pickActive ? "rgba(119,180,214,.28)" : "rgba(255,255,255,.09)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, pickLength, a - 0.08, a + 0.08);
  ctx.stroke();

  ctx.fillStyle = s.pickActive ? "rgba(238,244,255,.98)" : "rgba(238,244,255,.42)";
  ctx.beginPath();
  ctx.arc(px, py, 12, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,.26)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.38, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = s.solved ? "rgba(84,224,154,.9)" : "rgba(255,255,255,.14)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.38, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = s.solved ? "rgba(84,224,154,.95)" : "rgba(255,255,255,.68)";
  ctx.font = "900 16px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s.solved ? "OPEN" : "LOCK", 0, 0);

  if (s.flash > 0) {
    ctx.strokeStyle = s.solved
      ? `rgba(84,224,154,${s.flash / 700})`
      : `rgba(226,180,82,${Math.min(1, s.flash / 220)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.08 + (1 - Math.min(1, s.flash / 700)) * 0.18), 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

function fitCanvas(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function updatePickFromPointer(game, canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2 - 4;
  const radius = Math.min(rect.width, rect.height) * 0.34;
  const input = resolvePolarLockInput(x, y, radius);
  game.state.pickAngle = input.angle;
  game.state.tension = input.force;
  game.state.pickActive = input.active;
}

function isLockCenterPointer(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2 - 4;
  const radius = Math.min(rect.width, rect.height) * 0.34;
  return Math.hypot(x, y) <= radius * 0.38;
}

export function renderLockPicking(panel, options = {}) {
  if (typeof panel._lockPickingCleanup === "function") panel._lockPickingCleanup();

  const inner = panel._inner || panel;
  inner.innerHTML = "";
  const close = make("button", "", "x");
  setStyles(close, {
    position: "absolute",
    right: "6px",
    top: "6px",
    width: "28px",
    height: "28px",
    border: "1px solid #35445b",
    borderRadius: "6px",
    background: "#101626",
    color: "#cfe8ff",
    cursor: "pointer",
  });
  close.addEventListener("click", () => {
    finish(false, "cancelled");
    panel.style.display = "none";
  });
  inner.appendChild(close);

  setStyles(inner, {
    width: "min(420px, calc(100vw - 28px))",
    maxHeight: "min(88vh, 620px)",
    overflow: "hidden",
    padding: "0",
    borderRadius: "8px",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    background: "#101821",
    border: "1px solid rgba(255,255,255,.16)",
  });

  const game = new LockPickingMiniGame(options.pinCount ?? options.pins ?? 5, options.difficulty ?? "normal");
  const card = make("section", "lockPicking-card");
  setStyles(card, { display: "grid", color: "#eef4ff" });

  const top = make("div", "lockPicking-top");
  setStyles(top, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "14px 14px 8px",
  });
  const title = make("div", "");
  setStyles(title, { display: "grid", gap: "2px", minWidth: "0" });
  const strong = make("strong", "", "Glyph Lock");
  setStyles(strong, { fontSize: "15px", letterSpacing: ".12em", textTransform: "uppercase" });
  const sub = make("span", "", `${game.pinCount} pins / ${game.difficulty.id}`);
  setStyles(sub, { fontSize: "12px", color: "#9ba9be", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
  title.append(strong, sub);
  const reset = make("button", "", "reset");
  setStyles(reset, {
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: "6px",
    background: "#172232",
    color: "#eef4ff",
    padding: "8px 12px",
    fontWeight: "800",
    cursor: "pointer",
  });
  const open = make("button", "", "open");
  open.disabled = true;
  setStyles(open, {
    border: "1px solid rgba(84,224,154,.38)",
    borderRadius: "6px",
    background: "#163024",
    color: "#dfffee",
    padding: "8px 12px",
    fontWeight: "900",
    cursor: "default",
    opacity: ".45",
  });
  const actions = make("div", "");
  setStyles(actions, { display: "flex", gap: "8px", alignItems: "center" });
  actions.append(reset, open);
  top.append(title, actions);
  card.appendChild(top);

  const stage = make("div", "lockPicking-stage");
  setStyles(stage, {
    position: "relative",
    height: "min(88vw, 390px)",
    minHeight: "330px",
    touchAction: "none",
    userSelect: "none",
  });
  const canvas = make("canvas", "");
  setStyles(canvas, { position: "absolute", inset: "0", width: "100%", height: "100%", touchAction: "none" });
  stage.append(canvas);
  card.appendChild(stage);

  const bottom = make("div", "");
  setStyles(bottom, { padding: "0 16px 16px", display: "grid", gap: "10px" });
  const meter = make("div", "");
  setStyles(meter, {
    height: "8px",
    borderRadius: "999px",
    background: "rgba(255,255,255,.08)",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,.16)",
  });
  const progress = make("i", "");
  setStyles(progress, {
    display: "block",
    width: "0%",
    height: "100%",
    background: "linear-gradient(90deg, #54e09a, #77b4d6)",
  });
  meter.appendChild(progress);
  const readout = make("div", "");
  setStyles(readout, {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    color: "#9ba9be",
    fontSize: "12px",
    fontWeight: "750",
  });
  const status = make("span", "", game.state.status);
  const count = make("span", "", `0/${game.pinCount}`);
  const force = make("span", "", "force 0%");
  readout.append(status, force, count);
  const toast = make("div", "", game.state.message);
  setStyles(toast, { minHeight: "34px", fontSize: "12px", lineHeight: "1.35", color: "#eef4ff", opacity: ".9" });
  bottom.append(meter, readout, toast);
  card.appendChild(bottom);
  inner.appendChild(card);

  const ctx = canvas.getContext("2d");
  const els = { progress, force, status, count, toast, open };
  let pickPointer = null;
  let raf = 0;
  let lastTime = performance.now();
  let wasSolved = false;
  let completed = false;

  function finish(success, reason) {
    if (completed) return;
    completed = true;
    const result = createLockPickingResult(game, success, reason);
    notifyLockPickingResult(options, result);
    window.dispatchEvent(new CustomEvent("ui:lockPickingFinished", { detail: result }));
  }

  function onKeyDown(e) {
    if (panel.style.display === "none") return;
    if (e.key !== "Escape" && e.keyCode !== 27) return;
    finish(false, "cancelled");
    panel.style.display = "none";
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onBackdropPointerDown(e) {
    if (e.target === panel) finish(false, "cancelled");
  }

  function frame(now) {
    if (panel.style.display === "none") return;
    const dt = Math.min(40, now - lastTime);
    lastTime = now;
    game.tick(dt);
    if (game.state.solved && !wasSolved) {
      wasSolved = true;
      vibrate([25, 45, 25, 45, 60]);
    }
    updateHud(game, els);
    fitCanvas(canvas, ctx);
    drawLock(game, canvas, ctx);
    raf = requestAnimationFrame(frame);
  }

  function resetGame() {
    game.reset();
    wasSolved = false;
    completed = false;
    updateHud(game, els);
    fitCanvas(canvas, ctx);
    drawLock(game, canvas, ctx);
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (game.state.solved && isLockCenterPointer(canvas, e)) {
      finish(true, "unlocked");
      panel.style.display = "none";
      return;
    }
    pickPointer = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    updatePickFromPointer(game, canvas, e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pickPointer === e.pointerId) updatePickFromPointer(game, canvas, e);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (pickPointer === e.pointerId) {
      pickPointer = null;
      game.state.pickActive = false;
    }
  });
  canvas.addEventListener("pointercancel", (e) => {
    if (pickPointer === e.pointerId) {
      pickPointer = null;
      game.state.pickActive = false;
    }
  });
  reset.addEventListener("click", resetGame);
  open.addEventListener("click", () => {
    if (!game.state.solved) return;
    finish(true, "unlocked");
    panel.style.display = "none";
  });

  panel.addEventListener("pointerdown", onBackdropPointerDown);

  function cleanup() {
    if (raf) cancelAnimationFrame(raf);
    panel.removeEventListener("pointerdown", onBackdropPointerDown);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("resize", onResize);
  }
  panel._lockPickingCleanup = cleanup;

  function onResize() {
    fitCanvas(canvas, ctx);
  }

  fitCanvas(canvas, ctx);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("resize", onResize);
  updateHud(game, els);
  drawLock(game, canvas, ctx);
  raf = requestAnimationFrame(frame);
}
