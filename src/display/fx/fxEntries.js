// src/display/fx/fxEntries.js
// Typed FX effect cache entries with shared lifecycle helpers.

// ---------------------------------------------------------------------------
// Base — shared ttl/max lifecycle for all time-decaying FX entries.
// ---------------------------------------------------------------------------
export class FxEntry {
  constructor(ttl, max) {
    this.ttl = ttl;
    this.max = max ?? ttl;
  }
  tick(dt) { this.ttl -= dt; }
  get expired() { return this.ttl <= 0; }
  /** Remaining life fraction, clamped [0,1]. Decays 1→0. */
  get alpha() { return this.max > 0 ? Math.max(0, Math.min(1, this.ttl / this.max)) : 0; }
  /** Elapsed life fraction, clamped [0,1]. Grows 0→1. */
  get progress() { return 1 - this.alpha; }
}

// ---------------------------------------------------------------------------
// Centered circle + radius (meteor, blastwave, frost impact).
// ---------------------------------------------------------------------------
export class RadialFx extends FxEntry {
  constructor({ x, y, radius, ttl }) {
    super(ttl);
    this.x = x;
    this.y = y;
    this.radius = radius;
  }
}

// ---------------------------------------------------------------------------
// Line endpoints (spell bolt, frost beam).
// ---------------------------------------------------------------------------
export class LineFx extends FxEntry {
  constructor({ from, to, ttl, chainIndex = 0, style = 'bolt' }) {
    super(ttl);
    this.from = from;
    this.to = to;
    this.chainIndex = chainIndex;
    this.style = style;
  }
}

// ---------------------------------------------------------------------------
// Blink teleport trail — line + oscillation phase + randomized flag.
// ---------------------------------------------------------------------------
export class BlinkFx extends FxEntry {
  constructor({ from, to, ttl, phase, randomized }) {
    super(ttl);
    this.from = from;
    this.to = to;
    this.phase = phase;
    this.randomized = randomized;
  }
}

// ---------------------------------------------------------------------------
// Phase strike — line + secondary impact positions + oscillation phase.
// ---------------------------------------------------------------------------
export class PhaseStrikeFx extends FxEntry {
  constructor({ from, to, hits, ttl, phase }) {
    super(ttl);
    this.from = from;
    this.to = to;
    this.hits = hits;
    this.phase = phase;
  }
}

// ---------------------------------------------------------------------------
// Deity wrath bolt — line + jitter amplitude + branch flag + tri-color.
// ---------------------------------------------------------------------------
export class DeityBoltFx extends FxEntry {
  constructor({ from, to, ttl, amp, branch, outer, mid, core }) {
    super(ttl);
    this.from = from;
    this.to = to;
    this.amp = amp;
    this.branch = branch;
    this.outer = outer;
    this.mid = mid;
    this.core = core;
  }
}

// ---------------------------------------------------------------------------
// Pulse glow — position + optional color (deity pulses, light pulses).
// ---------------------------------------------------------------------------
export class PulseFx extends FxEntry {
  constructor({ x, y, ttl, max = ttl, color = null }) {
    super(ttl, max);
    this.x = x;
    this.y = y;
    this.color = color;
  }
}

// ---------------------------------------------------------------------------
// Screen flash — no position, just color + lifetime.
// ---------------------------------------------------------------------------
export class ScreenFlashFx extends FxEntry {
  constructor({ ttl, color, peak }) {
    super(ttl);
    this.color = color;
    this.peak = peak; // undefined = legacy additive; number = source-over peak opacity
  }
}

// ---------------------------------------------------------------------------
// Screen-space lightning bolt — position + jitter + color.
// ---------------------------------------------------------------------------
export class ScreenBoltFx extends FxEntry {
  constructor({ x, y, ttl, amp, color }) {
    super(ttl);
    this.x = x;
    this.y = y;
    this.amp = amp;
    this.color = color;
  }
}

// ---------------------------------------------------------------------------
// Arrow in flight — forward progress (t → duration), NOT ttl decay.
// ---------------------------------------------------------------------------
export class ArrowFx {
  constructor({ from, to, duration, dx, dy, len, style }) {
    this.from = from;
    this.to = to;
    this.t = 0;
    this.duration = duration;
    this.dx = dx;
    this.dy = dy;
    this.len = len;
    this.style = style;
  }
  tick(dt) { this.t += dt; }
  get arrived() { return this.t >= this.duration; }
  get progress() { return Math.min(1, this.t / this.duration); }
}

// ---------------------------------------------------------------------------
// Arrow impact spark — position + style + lifetime.
// ---------------------------------------------------------------------------
export class ArrowSparkFx extends FxEntry {
  constructor({ x, y, ttl, style }) {
    super(ttl);
    this.x = x;
    this.y = y;
    this.style = style;
  }
}

// ---------------------------------------------------------------------------
// Stuck arrow — lodged in a target entity, tracks position + fades out.
// ---------------------------------------------------------------------------
export class StuckArrowFx extends FxEntry {
  constructor({ targetId, x = 0, y = 0, ox, oy, dx, dy, style, ttl }) {
    super(ttl);
    this.targetId = targetId;
    this.ox = ox;            // jitter offset from entity center
    this.oy = oy;
    this.dx = dx;            // arrow direction (normalized)
    this.dy = dy;
    this.style = style;
    this.x = x;              // updated each tick from getPosition for actor arrows
    this.y = y;
  }
}

// ---------------------------------------------------------------------------
// Search pulse — expanding off-white ring from the searcher's position.
// ---------------------------------------------------------------------------
export class SearchPulseFx extends FxEntry {
  constructor({ x, y, radius, ttl }) {
    super(ttl);
    this.x = x;
    this.y = y;
    this.radius = radius;
  }
}

// ---------------------------------------------------------------------------
// Arc sweep — for cleave-style melee AoE (center + angular sweep arc).
// ---------------------------------------------------------------------------
export class ArcSweepFx extends FxEntry {
  constructor({ x, y, startAngle, sweepAngle, radius, ttl, color }) {
    super(ttl);
    this.x = x;
    this.y = y;
    this.startAngle = startAngle;
    this.sweepAngle = sweepAngle;
    this.radius = radius;
    this.color = color; // [r,g,b]
  }
}

// ---------------------------------------------------------------------------
// Melee slash — directional arc sweep for weapon strikes.
// ---------------------------------------------------------------------------
export class MeleeSlashFx extends FxEntry {
  constructor({ x, y, startAngle, sweepAngle, radius, ttl, color, lineWidth, style }) {
    super(ttl);
    this.x = x;
    this.y = y;
    this.startAngle = startAngle;
    this.sweepAngle = sweepAngle;
    this.radius = radius;
    this.color = color;   // [r,g,b]
    this.lineWidth = lineWidth || 0.14;
    this.style = style;   // 'sweep' | 'stab' | 'impact' | 'parry' | 'whiff'
  }
}

// ---------------------------------------------------------------------------
// Smoke cloud — expanding translucent disc (smoke bomb, fog).
// ---------------------------------------------------------------------------
export class SmokeFx extends FxEntry {
  constructor({ x, y, radius, ttl }) {
    super(ttl);
    this.x = x;
    this.y = y;
    this.radius = radius;
  }
}

export class BubblePopFx extends FxEntry {
  constructor({ x, y, ttl, r0, r1, rise, phase }) {
    super(ttl);
    this.x = x;
    this.y = y;
    this.r0 = r0;
    this.r1 = r1;
    this.rise = rise;
    this.phase = phase;
  }
  tick(dt) {
    super.tick(dt);
    this.y -= this.rise * dt;
    this.phase += dt * 6.0;
  }
  get radius() { return this.r0 + (this.r1 - this.r0) * this.progress; }
}
