// display/fx/hitstopController.js
// Hitstop: brief time-scale reduction on impactful hits.
// All display-side dt flows through this controller's scale factor,
// so gore, bumps, recoil, particles, and float text all slow in unison.
//
// Two modes (configurable):
//   "freeze"   — time scale drops to near-zero (classic fighting-game hitstop)
//   "slowdown" — time scale drops to a fraction (cinematic slow-mo)
//
// Stacking: new hitstops extend remaining duration but don't compound the scale.

// ── Tuning ──────────────────────────────────────────────────────────

/** Mode: "freeze" snaps to FREEZE_SCALE; "slowdown" lerps to SLOW_SCALE */
const MODE = 'freeze';

/** Time scale during freeze mode (0 = full stop, 0.02 = near-frozen) */
const FREEZE_SCALE = 0.05;

/** Time scale during slowdown mode */
const SLOW_SCALE = 0.12;

/** Duration (seconds of REAL time) for a baseline hit (1 damage) */
const BASE_DURATION = 0.04;

/** Duration for a critical hit */
const CRIT_DURATION = 0.09;

/** Duration for a killing blow */
const KILL_DURATION = 0.13;

/** Extra duration per point of damage (log-scaled, caps out) */
const DMG_DURATION_SCALE = 0.008;
const DMG_DURATION_CAP = 0.08;

/** Minimum damage to trigger hitstop (ignore chip/dot) */
const MIN_DAMAGE = 2;

/** Ease-out: last portion of duration ramps scale back toward 1.0 */
const EASE_OUT_FRAC = 0.45;

// ── Controller ──────────────────────────────────────────────────────

/** Frames-per-second at which durations are tuned (desktop baseline) */
const BASELINE_FPS = 60;
/** Minimum scale factor so mobile still gets some hitstop */
const MIN_PERF_SCALE = 0.4;

export function createHitstopController() {
  let _remaining = 0;   // real-time seconds left in current hitstop
  let _duration = 0;     // total duration of current hitstop (for ease-out calc)
  let _fpsEMA = BASELINE_FPS; // smoothed FPS estimate for adaptive scaling
  /** @type {Array<{delay:number,duration:number}>} */
  const _pending = [];

  /**
   * Request a hitstop. If one is already active, extends duration to whichever
   * is longer (remaining vs new). Does not stack/compound.
   * Duration is scaled down on slower devices so hitstop feels consistent.
   * @param {number} dur  Duration in real-time seconds (tuned for 60fps)
   */
  function request(dur) {
    if (dur <= 0) return;
    // Scale duration: at 60fps use full duration, at 30fps use ~50%
    const perfScale = Math.max(MIN_PERF_SCALE, Math.min(1, _fpsEMA / BASELINE_FPS));
    const scaled = dur * perfScale;
    if (scaled > _remaining) {
      _remaining = scaled;
      _duration = scaled;
    }
  }

  function requestAfter(delay, dur) {
    if (dur <= 0) return;
    if (!(delay > 0)) {
      request(dur);
      return;
    }
    _pending.push({ delay, duration: dur });
  }

  /**
   * Compute hitstop duration from damage event properties.
   * @param {number} damage
   * @param {boolean} critical
   * @param {boolean} killed
   * @returns {number} duration in seconds (0 = no hitstop)
   */
  function durationForHit(damage, critical, killed) {
    if (damage < MIN_DAMAGE && !critical && !killed) return 0;

    let dur = BASE_DURATION;

    // Damage scaling (logarithmic)
    const dmgExtra = Math.min(DMG_DURATION_CAP,
      DMG_DURATION_SCALE * Math.log(1 + Math.max(0, damage) / 3));
    dur += dmgExtra;

    if (critical) dur = Math.max(dur, CRIT_DURATION) + dmgExtra;
    if (killed)   dur = Math.max(dur, KILL_DURATION);

    return dur;
  }

  /**
   * Consume real-time dt and return the scaled dt that display systems should use.
   * Call once per frame, BEFORE all other tick/render calls.
   * @param {number} realDt  Raw frame delta (seconds)
   * @returns {number} Scaled dt for display systems
   */
  function scale(realDt) {
    // Track smoothed FPS for adaptive duration scaling
    if (realDt > 0) {
      const instFps = 1 / realDt;
      _fpsEMA = _fpsEMA * 0.93 + instFps * 0.07;
    }

    for (let i = _pending.length - 1; i >= 0; i--) {
      const pending = _pending[i];
      pending.delay -= realDt;
      if (pending.delay <= 0) {
        request(pending.duration);
        _pending.splice(i, 1);
      }
    }

    if (_remaining <= 0) return realDt;

    _remaining -= realDt;

    if (_remaining <= 0) {
      // Hitstop just ended this frame — blend partial
      const overrun = -_remaining;
      _remaining = 0;
      _duration = 0;
      // Return the portion of dt after hitstop ended, at full speed
      return overrun;
    }

    // Active hitstop: apply time scale
    const baseScale = MODE === 'freeze' ? FREEZE_SCALE : SLOW_SCALE;

    // Ease-out: ramp scale back toward 1.0 in the tail portion
    const elapsed = _duration - _remaining;
    const easeStart = _duration * (1 - EASE_OUT_FRAC);
    let s;
    if (elapsed >= easeStart && _duration > 0) {
      const t = (elapsed - easeStart) / (_duration * EASE_OUT_FRAC);
      s = baseScale + (1 - baseScale) * (t * t); // quadratic ease-out
    } else {
      s = baseScale;
    }

    return realDt * s;
  }

  /**
   * Wire up event listeners.
   * @param {{ world:any, isPlayer:(id:number)=>boolean, bumpFx?:any }} deps
   */
  function installListeners({ world, isPlayer, bumpFx }) {
    // Freeze mid-swing: bumpFx fires onContact when the lunge reaches apex,
    // so hitstop kicks in at the moment of impact — not at start or end.
    if (bumpFx && typeof bumpFx.onContact === 'function') {
      bumpFx.onContact(() => {
        request(BASE_DURATION);
      });
    }

    // Upgrade the freeze when damage actually resolves (crits/big hits extend it)
    world.on('damaged', ({ target, amount, critical, projectileDelay }) => {
      const dmg = Number(amount) || 0;
      const dur = durationForHit(dmg, !!critical, false);
      requestAfter(Number(projectileDelay) || 0, dur);
    });

    world.on('died', ({ id }) => {
      // Death always gets a strong hitstop regardless of projectile timing
      request(KILL_DURATION);
    });
  }

  /** True when hitstop is actively slowing time. */
  function isActive() { return _remaining > 0; }

  return { request, durationForHit, scale, installListeners, isActive };
}
