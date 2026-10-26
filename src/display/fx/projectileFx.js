// src/display/fx/projectileFx.js
// Arrow / ranged-shot tracer VFX + shadow bolt + familiar fireball projectile (world-space; display-only).

import { startShake } from "../camera/shake.js";
import { Particle } from "../passes/vfx/particles/particlePool.js";
import { ArrowFx, ArrowSparkFx, RadialFx, StuckArrowFx } from "./fxEntries.js";
import { resolveDominantProjectileVfx } from "../../bridge/schema/weaponVfxResolver.js";
import { normalizedGoreType } from "../ui/wiring/goreEngine.js";
import { setInputLock } from "../input/inputLock.js";
import { computeMissEndpoint, missSeedFromIds } from "./projectileMiss.js";
import { ArcaneBarrageCast, MagicMissileCast } from "../../events/ArcaneProjectileCast.js";
import { FearSpellCast } from "../../events/FearSpellCast.js";

// Lazy audio imports — must not break projectile VFX if audio fails to load
let _playTracked = null;
let _resolveSound = null;
let _audioLoaded = false;
function _ensureAudio() {
  if (_audioLoaded) return;
  _audioLoaded = true;
  try {
    import("../audio/audioEngine.js").then(m => { _playTracked = m.playTracked; }).catch(() => {});
    import("../audio/sounds.js").then(m => { _resolveSound = m.resolve; }).catch(() => {});
  } catch (_) {}
}

/**
 * @param {{ world: import('../../lib/ecs-js/index.js').World, cam: object, fx: { pool: { spawn(o:object):void } }, getPosition: (id:number) => ({x:number,y:number}|null) }} deps
 */
export function createProjectileFxController({ world, cam, fx, getPosition }) {
  /** @type {ArrowFx[]} */
  const _arrowFx = [];
  /** @type {ArrowSparkFx[]} */
  const _arrowSparks = [];
  /** @type {StuckArrowFx[]} */
  const _stuckArrows = [];
  /** @type {Array<{ fireAt:number, fn:()=>void }>} */
  const _pendingStuck = [];
  /** @type {Map<number, string>} last arrow style per target (for stuck arrow coloring) */
  const _lastShotStyle = new Map();

  // --- Shadow Bolt projectile state ---
  /** @type {ArrowFx[]} */
  const _sboltFx = [];
  /** @type {RadialFx[]} */
  const _sboltImpact = [];

  // --- Familiar Fireball projectile state ---
  /** @type {ArrowFx[]} */
  const _fireballFx = [];
  /** @type {RadialFx[]} */
  const _fireballImpact = [];

  // --- Frost Bolt projectile state ---
  /** @type {ArrowFx[]} */
  const _frostboltFx = [];
  /** @type {RadialFx[]} */
  const _frostboltImpact = [];

  // --- Arcane missile projectile state ---
  /** @type {ArrowFx[]} */
  const _arcaneMissileFx = [];
  /** @type {RadialFx[]} */
  const _arcaneMissileImpact = [];

  // --- Ricochet Theology projectile state ---
  /** @type {ArrowFx[]} */
  const _ricochetFx = [];
  /** @type {RadialFx[]} */
  const _ricochetImpact = [];

  // --- Plague Swarm projectile state ---
  /** @type {ArrowFx[]} */
  const _swarmFx = [];
  /** @type {RadialFx[]} */
  const _swarmImpact = [];

  // --- Web Spit projectile state ---
  /** @type {ArrowFx[]} */
  const _webSpitFx = [];
  /** @type {RadialFx[]} */
  const _webSpitImpact = [];

  function _hasInflight() {
    return _arrowFx.length > 0 || _sboltFx.length > 0 || _fireballFx.length > 0
      || _frostboltFx.length > 0 || _ricochetFx.length > 0 || _webSpitFx.length > 0
      || _swarmFx.length > 0 || _arcaneMissileFx.length > 0;
  }

  function _syncInputLock() {
    try { setInputLock('projectileFx', _hasInflight()); } catch (e) { console.debug('[projectileFx] input lock sync failed:', e); }
  }

  /** WeakMap<ArrowFx, { updatePan, updateVolume, stop }> — travel audio handles */
  const _travelAudio = new WeakMap();

  /**
   * Update travel audio pan for a projectile based on current interpolated position.
   * Pan is relative to the camera center (cam.x), which tracks the player.
   */
  function _tickTravelAudio(entry) {
    const handle = _travelAudio.get(entry);
    if (!handle) return;
    const hx = entry.from.x + (entry.to.x - entry.from.x) * entry.progress;
    const cx = cam?.x ?? 0;
    handle.updatePan(Math.max(-1, Math.min(1, (hx - cx) / 8)));
  }

  /** Stop travel audio for a projectile that has arrived or been removed. */
  function _stopTravelAudio(entry) {
    const handle = _travelAudio.get(entry);
    if (handle) {
      handle.stop();
      _travelAudio.delete(entry);
    }
  }

  function arcanePoint(p) {
    const u = p.progress;
    const x = p.from.x + (p.to.x - p.from.x) * u;
    const y = p.from.y + (p.to.y - p.from.y) * u;
    const lane = Number(p.arcaneLane || 0);
    const amp = Number(p.arcaneAmp || 0.32);
    const cycles = Number(p.arcaneCycles || 1.35);
    const phase = Number(p.arcanePhase || 0);
    const wave = Math.sin(u * Math.PI * 2 * cycles + phase) * Math.sin(u * Math.PI);
    const px = -p.dy;
    const py = p.dx;
    return {
      x: x + px * (wave * amp + lane * 0.18 * Math.sin(Math.PI * u)),
      y: y + py * (wave * amp + lane * 0.18 * Math.sin(Math.PI * u)),
    };
  }

  function tick(dt) {
    // Arrows
    for (let i = _arrowFx.length - 1; i >= 0; i--) {
      const a = _arrowFx[i];
      if (fx?.pool && a.progress < 1 && (a.style === "venom" || a.style === "storm" || a.style === "frost")) {
        const hx = a.from.x + (a.to.x - a.from.x) * a.progress;
        const hy = a.from.y + (a.to.y - a.from.y) * a.progress;
        const rate = a.style === "storm" ? 42 : 28;
        const count = Math.max(1, Math.ceil(dt * rate));
        for (let j = 0; j < count; j++) {
          if (a.style === "storm") {
            fx.pool.spawn(new Particle({
              x: hx + (Math.random() - 0.5) * 0.06,
              y: hy + (Math.random() - 0.5) * 0.06,
              vx: -a.dx * 1.8 + (Math.random() - 0.5) * 1.1,
              vy: -a.dy * 1.8 + (Math.random() - 0.5) * 1.1,
              life: 0.10 + Math.random() * 0.12,
              size0: 0.05 + Math.random() * 0.03,
              size1: 0.01,
              r: 145 + (Math.random() * 60 | 0),
              g: 205 + (Math.random() * 45 | 0),
              b: 255,
              a0: 0.8,
            }));
          } else if (a.style === "frost") {
            fx.pool.spawn(new Particle({
              x: hx + (Math.random() - 0.5) * 0.07,
              y: hy + (Math.random() - 0.5) * 0.07,
              vx: -a.dx * 1.0 + (Math.random() - 0.5) * 0.8,
              vy: -a.dy * 1.0 + (Math.random() - 0.5) * 0.8 + 0.08,
              life: 0.14 + Math.random() * 0.16,
              size0: 0.05 + Math.random() * 0.03,
              size1: 0.01,
              r: 165 + (Math.random() * 45 | 0),
              g: 220 + (Math.random() * 30 | 0),
              b: 255,
              a0: 0.74,
            }));
          } else {
            fx.pool.spawn(new Particle({
              x: hx + (Math.random() - 0.5) * 0.08,
              y: hy + (Math.random() - 0.5) * 0.08,
              vx: -a.dx * 0.9 + (Math.random() - 0.5) * 0.6,
              vy: -a.dy * 0.9 + (Math.random() - 0.5) * 0.6 - 0.02,
              life: 0.12 + Math.random() * 0.15,
              size0: 0.05 + Math.random() * 0.04,
              size1: 0.01,
              r: 95 + (Math.random() * 45 | 0),
              g: 225 + (Math.random() * 30 | 0),
              b: 95 + (Math.random() * 35 | 0),
              a0: 0.7,
            }));
          }
        }
      }
      _tickTravelAudio(a);
      a.tick(dt);
      if (a.arrived) {
        _stopTravelAudio(a);
        // Arrow arrived — spawn impact spark
        _arrowSparks.push(new ArrowSparkFx({ x: a.to.x, y: a.to.y, ttl: 0.18, style: a.style || 'plain' }));
        if (a.leaveLodged) {
          _stuckArrows.push(new StuckArrowFx({
            targetId: 0,
            x: a.to.x,
            y: a.to.y,
            ox: 0,
            oy: 0,
            dx: a.dx,
            dy: a.dy,
            style: a.style || 'plain',
            ttl: 2.5,
          }));
        }
        _arrowFx.splice(i, 1);
      }
    }
    for (let i = _arrowSparks.length - 1; i >= 0; i--) {
      _arrowSparks[i].tick(dt);
      if (_arrowSparks[i].expired) _arrowSparks.splice(i, 1);
    }

    // Stuck arrows — track target entity position, expire on TTL or lost target
    for (let i = _stuckArrows.length - 1; i >= 0; i--) {
      const sa = _stuckArrows[i];
      sa.tick(dt);
      if (sa.targetId > 0) {
        const pos = getPosition(sa.targetId);
        if (!pos || sa.expired) { _stuckArrows.splice(i, 1); continue; }
        sa.x = pos.x + sa.ox;
        sa.y = pos.y + sa.oy;
      } else if (sa.expired) {
        _stuckArrows.splice(i, 1);
      }
    }
    // Flush deferred stuck arrow spawns
    if (_pendingStuck.length) {
      const t = performance.now() / 1000;
      for (let i = _pendingStuck.length - 1; i >= 0; i--) {
        if (t >= _pendingStuck[i].fireAt) {
          _pendingStuck[i].fn();
          _pendingStuck.splice(i, 1);
        }
      }
    }

    // Shadow Bolt projectiles
    for (let i = _sboltFx.length - 1; i >= 0; i--) {
      const sb = _sboltFx[i];

      // Spawn trailing purple flame particles during flight
      if (fx?.pool && sb.progress < 1) {
        const hx = sb.from.x + (sb.to.x - sb.from.x) * sb.progress;
        const hy = sb.from.y + (sb.to.y - sb.from.y) * sb.progress;
        const count = Math.max(1, Math.ceil(dt * 100));
        for (let j = 0; j < count; j++) {
          fx.pool.spawn(new Particle({
            x: hx + (Math.random() - 0.5) * 0.08,
            y: hy + (Math.random() - 0.5) * 0.08,
            vx: -sb.dx * 1.2 + (Math.random() - 0.5) * 0.7,
            vy: -sb.dy * 1.2 + (Math.random() - 0.5) * 0.7,
            life: 0.18 + Math.random() * 0.22,
            size0: 0.09 + Math.random() * 0.07,
            size1: 0.01,
            r: 140 + (Math.random() * 70 | 0),
            g: 30 + (Math.random() * 50 | 0),
            b: 200 + (Math.random() * 55 | 0),
            a0: 0.75,
          }));
        }
      }

      _tickTravelAudio(sb);
      sb.tick(dt);

      if (sb.arrived) {
        _stopTravelAudio(sb);
        // Impact radial burst
        _sboltImpact.push(new RadialFx({ x: sb.to.x, y: sb.to.y, radius: 0.9, ttl: 0.50 }));
        startShake(cam, 4, 0.16);

        // Purple particle burst at impact
        if (fx?.pool) {
          for (let k = 0; k < 24; k++) {
            const angle = (k / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const spd = 0.8 + Math.random() * 2.0;
            const life = 0.30 + Math.random() * 0.35;
            fx.pool.spawn(new Particle({
              x: sb.to.x + (Math.random() - 0.5) * 0.3,
              y: sb.to.y + (Math.random() - 0.5) * 0.3,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 0.3,
              ay: 0.25,
              life,
              size0: 0.14 + Math.random() * 0.10,
              size1: 0.02,
              r: 130 + (Math.random() * 70 | 0),
              g: 40 + (Math.random() * 40 | 0),
              b: 220 + (Math.random() * 35 | 0),
              a0: 0.9,
              rot: Math.random() * Math.PI * 2,
              rotVel: (Math.random() - 0.5) * 4,
            }));
          }
          // Lingering dark motes (shadow dissipation)
          for (let k = 0; k < 10; k++) {
            fx.pool.spawn(new Particle({
              x: sb.to.x + (Math.random() - 0.5) * 1.0,
              y: sb.to.y + (Math.random() - 0.5) * 0.6,
              vx: (Math.random() - 0.5) * 0.4,
              vy: -0.1 + Math.random() * -0.3,
              life: 0.6 + Math.random() * 0.5,
              size0: 0.07 + Math.random() * 0.05,
              size1: 0.01,
              r: 80, g: 20, b: 140,
              a0: 0.55,
              rotVel: (Math.random() - 0.5) * 2,
            }));
          }
        }
        _sboltFx.splice(i, 1);
      }
    }
    // Shadow bolt impacts
    for (let i = _sboltImpact.length - 1; i >= 0; i--) {
      _sboltImpact[i].tick(dt);
      if (_sboltImpact[i].expired) _sboltImpact.splice(i, 1);
    }

    // Familiar Fireball projectiles
    for (let i = _fireballFx.length - 1; i >= 0; i--) {
      const fb = _fireballFx[i];

      // Spawn trailing flame particles during flight
      if (fx?.pool && fb.progress < 1) {
        const hx = fb.from.x + (fb.to.x - fb.from.x) * fb.progress;
        const hy = fb.from.y + (fb.to.y - fb.from.y) * fb.progress;
        const count = Math.max(1, Math.ceil(dt * 80));
        for (let j = 0; j < count; j++) {
          fx.pool.spawn(new Particle({
            x: hx + (Math.random() - 0.5) * 0.1,
            y: hy + (Math.random() - 0.5) * 0.1,
            vx: -fb.dx * 0.8 + (Math.random() - 0.5) * 0.9,
            vy: -fb.dy * 0.8 + (Math.random() - 0.5) * 0.9 - 0.4,
            ay: -0.3,
            life: 0.2 + Math.random() * 0.25,
            size0: 0.1 + Math.random() * 0.08,
            size1: 0.02,
            r: 255,
            g: 100 + (Math.random() * 100 | 0),
            b: 10 + (Math.random() * 30 | 0),
            a0: 0.8,
          }));
        }
      }

      _tickTravelAudio(fb);
      fb.tick(dt);

      if (fb.arrived) {
        _stopTravelAudio(fb);
        // Impact radial burst
        _fireballImpact.push(new RadialFx({ x: fb.to.x, y: fb.to.y, radius: 0.7, ttl: 0.40 }));
        startShake(cam, 3, 0.12);

        // Fiery particle burst at impact
        if (fx?.pool) {
          for (let k = 0; k < 18; k++) {
            const angle = (k / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const spd = 0.6 + Math.random() * 1.8;
            fx.pool.spawn(new Particle({
              x: fb.to.x + (Math.random() - 0.5) * 0.25,
              y: fb.to.y + (Math.random() - 0.5) * 0.25,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 0.5,
              ay: -0.2,
              life: 0.25 + Math.random() * 0.3,
              size0: 0.13 + Math.random() * 0.09,
              size1: 0.02,
              r: 255,
              g: 80 + (Math.random() * 120 | 0),
              b: 10 + (Math.random() * 30 | 0),
              a0: 0.9,
              rotVel: (Math.random() - 0.5) * 3,
            }));
          }
          // Lingering smoke/ember motes
          for (let k = 0; k < 8; k++) {
            fx.pool.spawn(new Particle({
              x: fb.to.x + (Math.random() - 0.5) * 0.8,
              y: fb.to.y + (Math.random() - 0.5) * 0.5,
              vx: (Math.random() - 0.5) * 0.3,
              vy: -0.15 + Math.random() * -0.35,
              life: 0.5 + Math.random() * 0.4,
              size0: 0.06 + Math.random() * 0.04,
              size1: 0.01,
              r: 180, g: 60, b: 10,
              a0: 0.5,
              rotVel: (Math.random() - 0.5) * 2,
            }));
          }
        }
        _fireballFx.splice(i, 1);
      }
    }
    // Fireball impacts
    for (let i = _fireballImpact.length - 1; i >= 0; i--) {
      _fireballImpact[i].tick(dt);
      if (_fireballImpact[i].expired) _fireballImpact.splice(i, 1);
    }

    // Frost Bolt projectiles
    for (let i = _frostboltFx.length - 1; i >= 0; i--) {
      const fb = _frostboltFx[i];

      // Spawn trailing ice particles during flight
      if (fx?.pool && fb.progress < 1) {
        const hx = fb.from.x + (fb.to.x - fb.from.x) * fb.progress;
        const hy = fb.from.y + (fb.to.y - fb.from.y) * fb.progress;
        const count = Math.max(1, Math.ceil(dt * 80));
        for (let j = 0; j < count; j++) {
          fx.pool.spawn(new Particle({
            x: hx + (Math.random() - 0.5) * 0.1,
            y: hy + (Math.random() - 0.5) * 0.1,
            vx: -fb.dx * 0.8 + (Math.random() - 0.5) * 0.9,
            vy: -fb.dy * 0.8 + (Math.random() - 0.5) * 0.9 - 0.3,
            ay: 0.2,
            life: 0.2 + Math.random() * 0.25,
            size0: 0.1 + Math.random() * 0.08,
            size1: 0.02,
            r: 140 + (Math.random() * 60 | 0),
            g: 210 + (Math.random() * 40 | 0),
            b: 255,
            a0: 0.8,
          }));
        }
      }

      _tickTravelAudio(fb);
      fb.tick(dt);

      if (fb.arrived) {
        _stopTravelAudio(fb);
        // Impact radial burst
        _frostboltImpact.push(new RadialFx({ x: fb.to.x, y: fb.to.y, radius: 0.7, ttl: 0.40 }));
        startShake(cam, 3, 0.14);

        // Ice shard particle burst at impact
        if (fx?.pool) {
          for (let k = 0; k < 20; k++) {
            const angle = (k / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            const spd = 0.6 + Math.random() * 1.8;
            fx.pool.spawn(new Particle({
              x: fb.to.x + (Math.random() - 0.5) * 0.3,
              y: fb.to.y + (Math.random() - 0.5) * 0.3,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 0.4,
              ay: 0.3,
              life: 0.35 + Math.random() * 0.35,
              size0: 0.12 + Math.random() * 0.10,
              size1: 0.02,
              r: 140 + (Math.random() * 60 | 0),
              g: 220 + (Math.random() * 35 | 0),
              b: 255,
              a0: 0.9,
              rot: Math.random() * Math.PI * 2,
              rotVel: (Math.random() - 0.5) * 4,
            }));
          }
          // Slow-falling snowflake motes (lingering cold)
          for (let k = 0; k < 8; k++) {
            fx.pool.spawn(new Particle({
              x: fb.to.x + (Math.random() - 0.5) * 1.0,
              y: fb.to.y + (Math.random() - 0.5) * 0.6,
              vx: (Math.random() - 0.5) * 0.3,
              vy: 0.2 + Math.random() * 0.3,
              life: 0.7 + Math.random() * 0.5,
              size0: 0.06 + Math.random() * 0.05,
              size1: 0.01,
              r: 220, g: 240, b: 255,
              a0: 0.6,
              rotVel: (Math.random() - 0.5) * 2,
            }));
          }
        }
        _frostboltFx.splice(i, 1);
      }
    }
    // Frost bolt impacts
    for (let i = _frostboltImpact.length - 1; i >= 0; i--) {
      _frostboltImpact[i].tick(dt);
      if (_frostboltImpact[i].expired) _frostboltImpact.splice(i, 1);
    }

    // Arcane missile projectiles
    for (let i = _arcaneMissileFx.length - 1; i >= 0; i--) {
      const bolt = _arcaneMissileFx[i];
      if (fx?.pool && bolt.progress < 1) {
        const pt = arcanePoint(bolt);
        const count = Math.max(1, Math.ceil(dt * 70));
        for (let j = 0; j < count; j++) {
          fx.pool.spawn(new Particle({
            x: pt.x + (Math.random() - 0.5) * 0.12,
            y: pt.y + (Math.random() - 0.5) * 0.12,
            vx: -bolt.dx * 0.55 + (Math.random() - 0.5) * 0.55,
            vy: -bolt.dy * 0.55 + (Math.random() - 0.5) * 0.55 - 0.10,
            ay: 0.08,
            life: 0.14 + Math.random() * 0.18,
            size0: 0.055 + Math.random() * 0.045,
            size1: 0.006,
            r: 175 + ((Math.random() * 45) | 0),
            g: 115 + ((Math.random() * 65) | 0),
            b: 255,
            a0: 0.78,
            rotVel: (Math.random() - 0.5) * 3.2,
          }));
        }
      }

      _tickTravelAudio(bolt);
      bolt.tick(dt);

      if (bolt.arrived) {
        _stopTravelAudio(bolt);
        _arcaneMissileImpact.push(new RadialFx({ x: bolt.to.x, y: bolt.to.y, radius: 0.62, ttl: 0.30 }));
        if (!bolt.arcaneLane) startShake(cam, 3, 0.10);
        if (fx?.pool) {
          for (let k = 0; k < 12; k++) {
            const angle = (k / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const spd = 0.55 + Math.random() * 1.15;
            fx.pool.spawn(new Particle({
              x: bolt.to.x + (Math.random() - 0.5) * 0.20,
              y: bolt.to.y + (Math.random() - 0.5) * 0.20,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 0.15,
              ay: 0.10,
              life: 0.16 + Math.random() * 0.18,
              size0: 0.07 + Math.random() * 0.06,
              size1: 0.008,
              r: 185 + ((Math.random() * 55) | 0),
              g: 130 + ((Math.random() * 70) | 0),
              b: 255,
              a0: 0.90,
              rotVel: (Math.random() - 0.5) * 3.6,
            }));
          }
        }
        _arcaneMissileFx.splice(i, 1);
      }
    }
    for (let i = _arcaneMissileImpact.length - 1; i >= 0; i--) {
      _arcaneMissileImpact[i].tick(dt);
      if (_arcaneMissileImpact[i].expired) _arcaneMissileImpact.splice(i, 1);
    }

    // Ricochet Theology projectiles
    for (let i = _ricochetFx.length - 1; i >= 0; i--) {
      const bolt = _ricochetFx[i];
      _tickTravelAudio(bolt);
      bolt.tick(dt);

      if (bolt.arrived) {
        _stopTravelAudio(bolt);
        _ricochetImpact.push(new RadialFx({ x: bolt.to.x, y: bolt.to.y, radius: 0.55, ttl: 0.22 }));
        startShake(cam, 2, 0.08);

        if (fx?.pool) {
          for (let k = 0; k < 10; k++) {
            const angle = (k / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
            const spd = 0.55 + Math.random() * 1.15;
            fx.pool.spawn(new Particle({
              x: bolt.to.x + (Math.random() - 0.5) * 0.18,
              y: bolt.to.y + (Math.random() - 0.5) * 0.18,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 0.15,
              ay: 0.18,
              life: 0.12 + Math.random() * 0.16,
              size0: 0.06 + Math.random() * 0.04,
              size1: 0.01,
              r: 110 + (Math.random() * 45 | 0),
              g: 205 + (Math.random() * 35 | 0),
              b: 255,
              a0: 0.82,
            }));
          }
        }

        _ricochetFx.splice(i, 1);
      }
    }
    for (let i = _ricochetImpact.length - 1; i >= 0; i--) {
      _ricochetImpact[i].tick(dt);
      if (_ricochetImpact[i].expired) _ricochetImpact.splice(i, 1);
    }

    // Plague Swarm projectiles — buzzing bee-like particles
    for (let i = _swarmFx.length - 1; i >= 0; i--) {
      const sw = _swarmFx[i];

      // Spawn chaotic buzzing yellow-black particles during flight
      if (fx?.pool && sw.progress < 1) {
        const hx = sw.from.x + (sw.to.x - sw.from.x) * sw.progress;
        const hy = sw.from.y + (sw.to.y - sw.from.y) * sw.progress;
        const count = Math.max(1, Math.ceil(dt * 90));
        for (let j = 0; j < count; j++) {
          // Alternating yellow and dark particles for bee swarm look
          const isYellow = Math.random() > 0.35;
          fx.pool.spawn(new Particle({
            x: hx + (Math.random() - 0.5) * 0.25,
            y: hy + (Math.random() - 0.5) * 0.25,
            vx: (Math.random() - 0.5) * 2.0 - sw.dx * 0.5,
            vy: (Math.random() - 0.5) * 2.0 - sw.dy * 0.5,
            life: 0.12 + Math.random() * 0.14,
            size0: isYellow ? (0.04 + Math.random() * 0.03) : (0.03 + Math.random() * 0.02),
            size1: 0.01,
            r: isYellow ? (220 + (Math.random() * 35 | 0)) : (40 + (Math.random() * 20 | 0)),
            g: isYellow ? (180 + (Math.random() * 40 | 0)) : (30 + (Math.random() * 15 | 0)),
            b: isYellow ? (20 + (Math.random() * 20 | 0)) : (10 + (Math.random() * 10 | 0)),
            a0: 0.85,
          }));
        }
      }

      _tickTravelAudio(sw);
      sw.tick(dt);

      if (sw.arrived) {
        _stopTravelAudio(sw);
        // Impact: swarm burst
        _swarmImpact.push(new RadialFx({ x: sw.to.x, y: sw.to.y, radius: 0.6, ttl: 0.45 }));
        startShake(cam, 2, 0.08);

        // Swarm explosion particles
        if (fx?.pool) {
          for (let k = 0; k < 22; k++) {
            const angle = (k / 22) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
            const spd = 0.5 + Math.random() * 1.6;
            const isYellow = Math.random() > 0.3;
            fx.pool.spawn(new Particle({
              x: sw.to.x + (Math.random() - 0.5) * 0.3,
              y: sw.to.y + (Math.random() - 0.5) * 0.3,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 0.2,
              ay: 0.15,
              life: 0.25 + Math.random() * 0.3,
              size0: 0.05 + Math.random() * 0.04,
              size1: 0.01,
              r: isYellow ? (230 + (Math.random() * 25 | 0)) : 35,
              g: isYellow ? (190 + (Math.random() * 40 | 0)) : 25,
              b: isYellow ? 15 : 5,
              a0: 0.8,
              rotVel: (Math.random() - 0.5) * 5,
            }));
          }
        }
        _swarmFx.splice(i, 1);
      }
    }
    // Swarm impacts
    for (let i = _swarmImpact.length - 1; i >= 0; i--) {
      _swarmImpact[i].tick(dt);
      if (_swarmImpact[i].expired) _swarmImpact.splice(i, 1);
    }

    // Web Spit projectiles — trailing silk strands
    for (let i = _webSpitFx.length - 1; i >= 0; i--) {
      const ws = _webSpitFx[i];

      // Spawn trailing silk particles during flight
      if (fx?.pool && ws.progress < 1) {
        const hx = ws.from.x + (ws.to.x - ws.from.x) * ws.progress;
        const hy = ws.from.y + (ws.to.y - ws.from.y) * ws.progress;
        const count = Math.max(1, Math.ceil(dt * 55));
        for (let j = 0; j < count; j++) {
          fx.pool.spawn(new Particle({
            x: hx + (Math.random() - 0.5) * 0.06,
            y: hy + (Math.random() - 0.5) * 0.06,
            vx: -ws.dx * 0.6 + (Math.random() - 0.5) * 0.4,
            vy: -ws.dy * 0.6 + (Math.random() - 0.5) * 0.4 + 0.15,
            ay: 0.3,
            life: 0.20 + Math.random() * 0.18,
            size0: 0.04 + Math.random() * 0.03,
            size1: 0.01,
            r: 200 + (Math.random() * 40 | 0),
            g: 200 + (Math.random() * 40 | 0),
            b: 200 + (Math.random() * 40 | 0),
            a0: 0.55,
          }));
        }
      }

      _tickTravelAudio(ws);
      ws.tick(dt);

      if (ws.arrived) {
        _stopTravelAudio(ws);
        // Impact: sticky web radial + particle burst
        _webSpitImpact.push(new RadialFx({ x: ws.to.x, y: ws.to.y, radius: 0.8, ttl: 0.55 }));
        startShake(cam, 3, 0.10);

        if (fx?.pool) {
          // Silk strands radiating outward
          for (let k = 0; k < 16; k++) {
            const angle = (k / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            const spd = 0.4 + Math.random() * 1.2;
            fx.pool.spawn(new Particle({
              x: ws.to.x + (Math.random() - 0.5) * 0.2,
              y: ws.to.y + (Math.random() - 0.5) * 0.2,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd + 0.1,
              ay: 0.4,
              life: 0.35 + Math.random() * 0.30,
              size0: 0.10 + Math.random() * 0.08,
              size1: 0.02,
              r: 220 + (Math.random() * 30 | 0),
              g: 220 + (Math.random() * 30 | 0),
              b: 220 + (Math.random() * 30 | 0),
              a0: 0.85,
              rotVel: (Math.random() - 0.5) * 3,
            }));
          }
          // Sticky drip motes (slow-falling, lingering)
          for (let k = 0; k < 8; k++) {
            fx.pool.spawn(new Particle({
              x: ws.to.x + (Math.random() - 0.5) * 0.6,
              y: ws.to.y + (Math.random() - 0.5) * 0.4,
              vx: (Math.random() - 0.5) * 0.2,
              vy: 0.15 + Math.random() * 0.25,
              ay: 0.1,
              life: 0.6 + Math.random() * 0.5,
              size0: 0.05 + Math.random() * 0.04,
              size1: 0.01,
              r: 190, g: 190, b: 200,
              a0: 0.50,
              rotVel: (Math.random() - 0.5) * 1.5,
            }));
          }
        }
        _webSpitFx.splice(i, 1);
      }
    }
    // Web spit impacts
    for (let i = _webSpitImpact.length - 1; i >= 0; i--) {
      _webSpitImpact[i].tick(dt);
      if (_webSpitImpact[i].expired) _webSpitImpact.splice(i, 1);
    }

    _syncInputLock();
  }

  // ── Travel sound mapping (projectile style → sound ID) ────
  const TRAVEL_SOUND = {
    fireball:     "travel:fire",
    frostbolt:    "travel:ice",
    shadow_bolt:  "travel:shadow",
    arcane_missile: "travel:shadow",
    plague_swarm: "travel:poison",
    plain:        "travel:arrow",
    fire:         "travel:fire",
    frost:        "travel:ice",
    storm:        "travel:lightning",
    venom:        "travel:poison",
  };



  function spawnTransientProjectile({
    from,
    to,
    style = 'plain',
    speed = 18,
    minDuration = 0.06,
    maxDuration = 0.4,
    arcaneLane = 0,
    arcaneAmp = 0.32,
    arcanePhase = 0,
    arcaneCycles = 1.35,
  }) {
    if (!from || !to) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const duration = Math.max(minDuration, Math.min(maxDuration, len / Math.max(0.01, Number(speed || 18))));
    const entry = new ArrowFx({
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      duration,
      dx: dx / len,
      dy: dy / len,
      len,
      style,
    });
    entry.arcaneLane = arcaneLane;
    entry.arcaneAmp = arcaneAmp;
    entry.arcanePhase = arcanePhase;
    entry.arcaneCycles = arcaneCycles;

    if (style === 'shadow_bolt') _sboltFx.push(entry);
    else if (style === 'fireball') _fireballFx.push(entry);
    else if (style === 'frostbolt') _frostboltFx.push(entry);
    else if (style === 'arcane_missile') _arcaneMissileFx.push(entry);
    else if (style === 'ricochet_theology') _ricochetFx.push(entry);
    else if (style === 'web_spit') _webSpitFx.push(entry);
    else if (style === 'plague_swarm') _swarmFx.push(entry);
    else _arrowFx.push(entry);

    // Attach travel sound if registered and flight is long enough to hear
    if (duration >= 0.15) {
      _ensureAudio();
      const soundId = TRAVEL_SOUND[style];
      if (soundId && _playTracked && _resolveSound) {
        const s = _resolveSound(soundId);
        if (s) {
          const handle = _playTracked(s.url, {
            bus: s.bus,
            loop: false,
            volume: 0.6,
            randomPitch: s.randomPitch,
          });
          if (handle) _travelAudio.set(entry, handle);
        }
      }
    }

    _syncInputLock();
    return entry;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function draw(ctx) {
    const hasArrows = _arrowFx.length || _arrowSparks.length || _stuckArrows.length;
    const hasSbolt = _sboltFx.length || _sboltImpact.length;
    const hasFireball = _fireballFx.length || _fireballImpact.length;
    const hasFrostbolt = _frostboltFx.length || _frostboltImpact.length;
    const hasArcaneMissile = _arcaneMissileFx.length || _arcaneMissileImpact.length;
    const hasRicochet = _ricochetFx.length || _ricochetImpact.length;
    const hasWebSpit = _webSpitFx.length || _webSpitImpact.length;
    const hasSwarm = _swarmFx.length || _swarmImpact.length;
    if (!hasArrows && !hasSbolt && !hasFireball && !hasFrostbolt && !hasArcaneMissile && !hasRicochet && !hasWebSpit && !hasSwarm) return;
    ctx.save();

    // Draw flying arrows
    for (const a of _arrowFx) {
      const progress = a.progress;
      const isFire = a.style === 'fire';
      const isBlunt = a.style === 'blunt';
      const isVenom = a.style === 'venom';
      const isStorm = a.style === 'storm';
      const isFrost = a.style === 'frost';
      // Current head position (lerp from→to)
      const hx = a.from.x + (a.to.x - a.from.x) * progress;
      const hy = a.from.y + (a.to.y - a.from.y) * progress;
      // Tail trails behind the head
      const tailLen = Math.min(isFire ? 0.8 : (isBlunt ? 0.68 : 0.6), a.len * progress);
      const tx = hx - a.dx * tailLen;
      const ty = hy - a.dy * tailLen;

      if (isFire) {
        // Fire arrow: outer glow
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,100,20,0.25)';
        ctx.lineWidth = 0.18;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.restore();
        // Fire arrow: bright orange shaft
        ctx.strokeStyle = 'rgba(255,160,40,0.95)';
        ctx.lineWidth = 0.07;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        // Fire arrowhead (hot white-yellow tip)
        ctx.fillStyle = 'rgba(255,240,180,1.0)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.09, 0, Math.PI * 2); ctx.fill();
      } else if (isBlunt) {
        // Blunt arrow: heavier-looking shaft and tip.
        ctx.strokeStyle = 'rgba(175,155,125,0.95)';
        ctx.lineWidth = 0.085;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = 'rgba(215,215,225,0.98)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.09, 0, Math.PI * 2); ctx.fill();
      } else if (isVenom) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(70,220,80,0.28)';
        ctx.lineWidth = 0.16;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(110,245,120,0.92)';
        ctx.lineWidth = 0.07;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = 'rgba(190,255,200,0.96)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.075, 0, Math.PI * 2); ctx.fill();
      } else if (isStorm) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(110,180,255,0.35)';
        ctx.lineWidth = 0.19;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(185,225,255,0.95)';
        ctx.lineWidth = 0.065;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = 'rgba(240,250,255,1.0)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.08, 0, Math.PI * 2); ctx.fill();
      } else if (isFrost) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(130,210,255,0.28)';
        ctx.lineWidth = 0.17;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(165,235,255,0.94)';
        ctx.lineWidth = 0.065;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = 'rgba(230,250,255,0.98)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.08, 0, Math.PI * 2); ctx.fill();
      } else {
        // Normal arrow: warm wood shaft
        ctx.strokeStyle = 'rgba(210,180,110,0.9)';
        ctx.lineWidth = 0.06;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        // Arrowhead (bright tip)
        ctx.fillStyle = 'rgba(240,230,200,0.95)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.07, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Impact sparks
    for (const s of _arrowSparks) {
      const alpha = s.alpha;
      const isFire = s.style === 'fire';
      const isBlunt = s.style === 'blunt';
      const isVenom = s.style === 'venom';
      const isStorm = s.style === 'storm';
      const isFrost = s.style === 'frost';
      if (isFire) {
        // Fire impact: orange-red burst
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,120,30,${0.5 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.3 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,200,80,${0.4 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.15 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (isBlunt) {
        // Blunt impact: brighter, wider hit flash for a more obvious impact read.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,240,210,${0.72 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.34 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(220,200,170,${0.48 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.54 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (isVenom) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(80,230,95,${0.46 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.24 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(160,255,170,${0.32 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.12 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (isStorm) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(140,205,255,${0.52 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.26 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(235,250,255,${0.30 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.13 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (isFrost) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(145,225,255,${0.48 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.24 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(225,245,255,${0.30 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.12 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        // Normal impact: small warm flash
        ctx.fillStyle = `rgba(255,220,140,${0.5 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.2 * alpha, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,250,230,${0.3 * alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 0.1 * alpha, 0, Math.PI * 2); ctx.fill();
      }
    }

    // --- Stuck arrows lodged in targets ---
    for (const sa of _stuckArrows) {
      const alpha = sa.alpha;
      if (alpha <= 0) continue;
      const shaftLen = 0.38;
      const tx = sa.x - sa.dx * shaftLen;
      const ty = sa.y - sa.dy * shaftLen;
      const isFire = sa.style === 'fire';
      const isVenom = sa.style === 'venom';
      const isStorm = sa.style === 'storm';
      const isFrost = sa.style === 'frost';
      // Shaft
      if (isFire) {
        ctx.strokeStyle = `rgba(255,160,40,${(0.85 * alpha).toFixed(3)})`;
      } else if (isVenom) {
        ctx.strokeStyle = `rgba(110,245,120,${(0.80 * alpha).toFixed(3)})`;
      } else if (isStorm) {
        ctx.strokeStyle = `rgba(185,225,255,${(0.82 * alpha).toFixed(3)})`;
      } else if (isFrost) {
        ctx.strokeStyle = `rgba(165,235,255,${(0.82 * alpha).toFixed(3)})`;
      } else {
        ctx.strokeStyle = `rgba(210,180,110,${(0.80 * alpha).toFixed(3)})`;
      }
      ctx.lineWidth = 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sa.x, sa.y); ctx.stroke();
      // Fletching nock at tail end
      const nx = tx - sa.dx * 0.06;
      const ny = ty - sa.dy * 0.06;
      ctx.strokeStyle = `rgba(180,170,155,${(0.5 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(nx, ny); ctx.stroke();
    }

    // --- Shadow Bolt projectile ---
    if (_sboltFx.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const sb of _sboltFx) {
        const progress = sb.progress;
        const hx = sb.from.x + (sb.to.x - sb.from.x) * progress;
        const hy = sb.from.y + (sb.to.y - sb.from.y) * progress;
        // Tail trails behind the head (energy wake)
        const tailLen = Math.min(0.8, sb.len * progress);
        const tx = hx - sb.dx * tailLen;
        const ty = hy - sb.dy * tailLen;

        // Outer purple glow trail
        ctx.strokeStyle = 'rgba(100,30,180,0.28)';
        ctx.lineWidth = 0.24;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        // Inner bright purple energy shaft
        ctx.strokeStyle = 'rgba(170,80,255,0.85)';
        ctx.lineWidth = 0.09;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();

        // Outer head glow (large dim purple)
        ctx.fillStyle = 'rgba(130,50,230,0.40)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.24, 0, Math.PI * 2); ctx.fill();
        // Bright purple-white energy core
        ctx.fillStyle = 'rgba(210,170,255,1.0)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.11, 0, Math.PI * 2); ctx.fill();
        // Hot white center
        ctx.fillStyle = 'rgba(240,220,255,0.7)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.055, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // --- Familiar Fireball projectile ---
    if (_fireballFx.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const fb of _fireballFx) {
        const progress = fb.progress;
        const hx = fb.from.x + (fb.to.x - fb.from.x) * progress;
        const hy = fb.from.y + (fb.to.y - fb.from.y) * progress;
        // Tail trails behind the head
        const tailLen = Math.min(0.9, fb.len * progress);
        const tx = hx - fb.dx * tailLen;
        const ty = hy - fb.dy * tailLen;

        // Wide fiery glow trail
        ctx.strokeStyle = 'rgba(255,60,5,0.25)';
        ctx.lineWidth = 0.3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        // Inner bright orange trail
        ctx.strokeStyle = 'rgba(255,130,20,0.6)';
        ctx.lineWidth = 0.14;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();

        // Outer heat glow
        ctx.fillStyle = 'rgba(255,70,10,0.3)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.28, 0, Math.PI * 2); ctx.fill();
        // Bright orange-yellow core orb
        ctx.fillStyle = 'rgba(255,170,40,0.9)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.16, 0, Math.PI * 2); ctx.fill();
        // Hot white center
        ctx.fillStyle = 'rgba(255,240,190,0.95)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.07, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // --- Familiar Fireball impact ---
    if (_fireballImpact.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const imp of _fireballImpact) {
        const t = imp.progress;
        // Bright flash on impact
        if (t < 0.2) {
          const flashT = t / 0.2;
          const flashR = 0.2 + flashT * 0.45;
          const flashA = 0.8 * (1 - flashT);
          ctx.fillStyle = `rgba(255,200,80,${flashA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, flashR, 0, Math.PI * 2); ctx.fill();
        }
        // Expanding heat ring
        const ringR = t * (imp.radius + 0.3);
        const ringA = 0.45 * (1 - t);
        ctx.strokeStyle = `rgba(255,100,20,${ringA.toFixed(3)})`;
        ctx.lineWidth = 0.1 * (1 - t * 0.5);
        ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR, 0, Math.PI * 2); ctx.stroke();
        // Inner hot disc
        if (t < 0.35) {
          const discA = 0.25 * (1 - t / 0.35);
          ctx.fillStyle = `rgba(255,160,30,${discA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR * 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // --- Frost Bolt projectile ---
    if (_frostboltFx.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const fb of _frostboltFx) {
        const progress = fb.progress;
        const hx = fb.from.x + (fb.to.x - fb.from.x) * progress;
        const hy = fb.from.y + (fb.to.y - fb.from.y) * progress;
        // Tail trails behind the head
        const tailLen = Math.min(0.9, fb.len * progress);
        const tx = hx - fb.dx * tailLen;
        const ty = hy - fb.dy * tailLen;

        // Wide icy glow trail
        ctx.strokeStyle = 'rgba(80,180,255,0.25)';
        ctx.lineWidth = 0.3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        // Inner bright cyan trail
        ctx.strokeStyle = 'rgba(150,220,255,0.6)';
        ctx.lineWidth = 0.14;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();

        // Outer frost glow
        ctx.fillStyle = 'rgba(100,200,255,0.3)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.28, 0, Math.PI * 2); ctx.fill();
        // Bright icy-white core orb
        ctx.fillStyle = 'rgba(180,235,255,0.9)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.16, 0, Math.PI * 2); ctx.fill();
        // White center
        ctx.fillStyle = 'rgba(230,245,255,0.95)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.07, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // --- Frost Bolt impact ---
    if (_frostboltImpact.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const imp of _frostboltImpact) {
        const t = imp.progress;
        // Bright white-blue flash on impact
        if (t < 0.2) {
          const flashT = t / 0.2;
          const flashR = 0.2 + flashT * 0.45;
          const flashA = 0.8 * (1 - flashT);
          ctx.fillStyle = `rgba(200,235,255,${flashA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, flashR, 0, Math.PI * 2); ctx.fill();
        }
        // Expanding ice ring
        const ringR = t * (imp.radius + 0.3);
        const ringA = 0.45 * (1 - t);
        ctx.strokeStyle = `rgba(120,210,255,${ringA.toFixed(3)})`;
        ctx.lineWidth = 0.1 * (1 - t * 0.5);
        ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR, 0, Math.PI * 2); ctx.stroke();
        // Inner frost disc
        if (t < 0.35) {
          const discA = 0.25 * (1 - t / 0.35);
          ctx.fillStyle = `rgba(160,230,255,${discA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR * 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // --- Arcane missile projectile ---
    if (_arcaneMissileFx.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const bolt of _arcaneMissileFx) {
        const head = arcanePoint(bolt);
        const u0 = Math.max(0, bolt.progress - 0.16);
        const fakeTail = {
          ...bolt,
          get progress() { return u0; },
        };
        const tail = arcanePoint(fakeTail);
        const laneScale = bolt.arcaneLane ? 0.72 : 1.0;

        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(120,80,255,0.24)';
        ctx.lineWidth = 0.30 * laneScale;
        ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();

        ctx.strokeStyle = 'rgba(190,120,255,0.68)';
        ctx.lineWidth = 0.12 * laneScale;
        ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();

        ctx.fillStyle = 'rgba(90,70,255,0.28)';
        ctx.beginPath(); ctx.arc(head.x, head.y, 0.34 * laneScale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(195,150,255,0.92)';
        ctx.beginPath(); ctx.arc(head.x, head.y, 0.16 * laneScale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(245,235,255,0.98)';
        ctx.beginPath(); ctx.arc(head.x, head.y, 0.065 * laneScale, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // --- Arcane missile impact ---
    if (_arcaneMissileImpact.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const imp of _arcaneMissileImpact) {
        const t = imp.progress;
        if (t < 0.24) {
          const a = 0.78 * (1 - t / 0.24);
          ctx.fillStyle = `rgba(225,200,255,${a.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, 0.20 + t * 0.48, 0, Math.PI * 2); ctx.fill();
        }
        const ringA = 0.44 * (1 - t);
        ctx.strokeStyle = `rgba(160,95,255,${ringA.toFixed(3)})`;
        ctx.lineWidth = 0.08 * (1 - t * 0.45);
        ctx.beginPath(); ctx.arc(imp.x, imp.y, t * (imp.radius + 0.42), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    // --- Ricochet Theology projectile ---
    if (_ricochetFx.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const bolt of _ricochetFx) {
        const progress = bolt.progress;
        const hx = bolt.from.x + (bolt.to.x - bolt.from.x) * progress;
        const hy = bolt.from.y + (bolt.to.y - bolt.from.y) * progress;
        const tailLen = Math.min(0.7, bolt.len * progress);
        const tx = hx - bolt.dx * tailLen;
        const ty = hy - bolt.dy * tailLen;

        ctx.strokeStyle = 'rgba(90,190,255,0.25)';
        ctx.lineWidth = 0.18;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.strokeStyle = 'rgba(180,240,255,0.92)';
        ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = 'rgba(235,250,255,0.98)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.08, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // --- Ricochet Theology impact ---
    if (_ricochetImpact.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const imp of _ricochetImpact) {
        const t = imp.progress;
        const ringR = t * (imp.radius + 0.16);
        const ringA = 0.4 * (1 - t);
        ctx.strokeStyle = `rgba(150,225,255,${ringA.toFixed(3)})`;
        ctx.lineWidth = 0.07;
        ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR, 0, Math.PI * 2); ctx.stroke();
        if (t < 0.3) {
          const flashA = 0.55 * (1 - t / 0.3);
          ctx.fillStyle = `rgba(220,245,255,${flashA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, 0.14 + t * 0.12, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // --- Shadow Bolt impact ---
    if (_sboltImpact.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const imp of _sboltImpact) {
        const t = imp.progress;
        // Bright flash on impact
        if (t < 0.15) {
          const flashT = t / 0.15;
          const flashR = 0.2 + flashT * 0.5;
          const flashA = 0.85 * (1 - flashT);
          ctx.fillStyle = `rgba(200,140,255,${flashA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, flashR, 0, Math.PI * 2); ctx.fill();
        }
        // Expanding shadow ring
        const ringR = t * (imp.radius + 0.4);
        const ringA = 0.5 * (1 - t);
        ctx.strokeStyle = `rgba(140,60,255,${ringA.toFixed(3)})`;
        ctx.lineWidth = 0.09 * (1 - t * 0.5);
        ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR, 0, Math.PI * 2); ctx.stroke();
        // Inner dark disc
        if (t < 0.4) {
          const discA = 0.22 * (1 - t / 0.4);
          ctx.fillStyle = `rgba(80,20,140,${discA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR * 0.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // --- Web Spit projectile ---
    if (_webSpitFx.length) {
      for (const ws of _webSpitFx) {
        const progress = ws.progress;
        const hx = ws.from.x + (ws.to.x - ws.from.x) * progress;
        const hy = ws.from.y + (ws.to.y - ws.from.y) * progress;
        // Scale up as it flies: starts small, arrives at full size
        const scale = 0.3 + 0.7 * progress;

        // Outer silk glow (soft white halo)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(210,210,220,${(0.20 + 0.10 * progress).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(hx, hy, 0.28 * scale, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Web glyph rendered as scaled text in world-space
        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(scale, scale);
        // Slight spin during flight
        ctx.rotate(progress * Math.PI * 1.5);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 0.85px monospace';
        ctx.shadowColor = 'rgba(220,220,230,0.7)';
        ctx.shadowBlur = 4 + 6 * progress;
        ctx.fillStyle = `rgba(230,230,240,${(0.7 + 0.3 * progress).toFixed(3)})`;
        ctx.fillText('\u{1F578}', 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }
    // Web spit impacts — expanding sticky ring
    if (_webSpitImpact.length) {
      ctx.save();
      for (const imp of _webSpitImpact) {
        const t = imp.progress;
        const alpha = imp.alpha;
        const ringR = imp.radius * (0.3 + t * 0.7);
        // Outer sticky ring
        ctx.strokeStyle = `rgba(210,210,220,${(0.5 * alpha).toFixed(3)})`;
        ctx.lineWidth = 0.10 * (1 - t * 0.4);
        ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR, 0, Math.PI * 2); ctx.stroke();
        // Inner web disc
        if (t < 0.5) {
          const discA = 0.28 * (1 - t / 0.5);
          ctx.fillStyle = `rgba(200,200,210,${discA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR * 0.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // --- Plague Swarm projectile ---
    if (_swarmFx.length) {
      for (const sw of _swarmFx) {
        const progress = sw.progress;
        const hx = sw.from.x + (sw.to.x - sw.from.x) * progress;
        const hy = sw.from.y + (sw.to.y - sw.from.y) * progress;

        // Swarm cloud: cluster of small buzzing dots
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Amber glow halo
        ctx.fillStyle = 'rgba(220,180,30,0.18)';
        ctx.beginPath(); ctx.arc(hx, hy, 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Individual "bees" orbiting the center
        const t = performance.now() * 0.008;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + t + progress * 4;
          const r = 0.12 + 0.06 * Math.sin(t * 1.5 + k);
          const bx = hx + Math.cos(a) * r;
          const by = hy + Math.sin(a) * r;
          ctx.fillStyle = (k % 2 === 0) ? 'rgba(240,200,30,0.95)' : 'rgba(50,35,10,0.9)';
          ctx.beginPath(); ctx.arc(bx, by, 0.04, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // --- Plague Swarm impact ---
    if (_swarmImpact.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const imp of _swarmImpact) {
        const t = imp.progress;
        // Amber flash
        if (t < 0.2) {
          const flashA = 0.6 * (1 - t / 0.2);
          ctx.fillStyle = `rgba(230,190,40,${flashA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(imp.x, imp.y, 0.25 + t * 0.3, 0, Math.PI * 2); ctx.fill();
        }
        // Expanding swarm ring
        const ringR = t * (imp.radius + 0.2);
        const ringA = 0.4 * (1 - t);
        ctx.strokeStyle = `rgba(200,170,20,${ringA.toFixed(3)})`;
        ctx.lineWidth = 0.08 * (1 - t * 0.5);
        ctx.beginPath(); ctx.arc(imp.x, imp.y, ringR, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function installListeners() {
    world.on('ranged:shot', ({ attacker, target, hit, style, projectileSpeed, from, to, missTo, impact }) => {
      const apos = (from && Number.isFinite(from.x) && Number.isFinite(from.y))
        ? { x: Number(from.x), y: Number(from.y) }
        : getPosition(Number(attacker || 0));
      const dpos = (to && Number.isFinite(to.x) && Number.isFinite(to.y))
        ? { x: Number(to.x), y: Number(to.y) }
        : getPosition(Number(target || 0));
      if (!apos || !dpos) return;
      const baseStyle = String(style || 'plain').toLowerCase();
      const profile = resolveDominantProjectileVfx(world, Number(attacker || 0));
      const profileStyle = String(profile?.projectileStyle || "").toLowerCase();
      const s = (baseStyle === "plain" && profileStyle) ? profileStyle : baseStyle;
      _lastShotStyle.set(Number(target || 0), s);
      const speed = Number(projectileSpeed || 18);
      const end = !hit
        ? ((missTo && Number.isFinite(missTo.x) && Number.isFinite(missTo.y))
          ? { x: Number(missTo.x), y: Number(missTo.y) }
          : computeMissEndpoint(apos, dpos, missSeedFromIds(attacker, target, 0x52a9)))
        : dpos;
      const projectile = spawnTransientProjectile({
        from: apos,
        to: end,
        style: s,
        speed,
        minDuration: 0.06,
        maxDuration: 0.4,
      });
      if (!hit && impact?.kind === 'ground' && projectile) projectile.leaveLodged = true;
      startShake(
        cam,
        s === 'fire'
          ? 3
          : (s === 'blunt'
            ? 4
            : (s === 'storm' ? 3 : 2)),
        s === 'fire'
          ? 0.10
          : (s === 'blunt'
            ? 0.12
            : (s === 'storm' ? 0.10 : 0.08)),
      );
      // Fire arrow: spawn trailing embers
      if (s === 'fire' && fx?.pool) {
        const dx = dpos.x - apos.x;
        const dy = dpos.y - apos.y;
        const len = Math.hypot(dx, dy) || 1;
        for (let i = 0; i < 4; i++) {
          fx.pool.spawn(new Particle({
            x: apos.x + dx / len * 0.5, y: apos.y + dy / len * 0.5,
            vx: (dx / len) * 3 + (Math.random() - 0.5) * 1.5,
            vy: (dy / len) * 3 + (Math.random() - 0.5) * 1.5,
            ay: 0.4, life: 0.25 + Math.random() * 0.15,
            size0: 0.12 + Math.random() * 0.08, size1: 0.02,
            r: 255, g: 160 + Math.random() * 60 | 0, b: 30,
            a0: 0.9,
          }));
        }
      }
    });

    // Stuck arrows — lodge in target on arrow hit (VFX only)
    world.on('damaged', ({ target, cause, projectileKind, projectileDelay, impactVector, goreType, targetKind }) => {
      if (String(cause || '') !== 'ranged') return;
      if (String(projectileKind || '').toLowerCase() !== 'arrow') return;
      const tid = Number(target || 0);
      if (!(tid > 0)) return;
      // Skip bodyless targets (skeletons, ghosts, spirits)
      const gore = normalizedGoreType(goreType, targetKind);
      if (gore === 'bone' || gore === 'none') return;
      const iv = impactVector;
      if (!iv || !Number.isFinite(iv.dx) || !Number.isFinite(iv.dy)) return;
      const delay = Number(projectileDelay) || 0;
      const doSpawn = () => {
        const pos = getPosition(tid);
        if (!pos) return;
        // Angular jitter: ±5–10° off arrival vector
        const jitterAngle = (Math.random() - 0.5) * (Math.PI / 12);
        const cos = Math.cos(jitterAngle), sin = Math.sin(jitterAngle);
        const dx = iv.dx * cos - iv.dy * sin;
        const dy = iv.dx * sin + iv.dy * cos;
        // Positional jitter: small random offset from entity center
        const ox = (Math.random() - 0.5) * 0.25;
        const oy = (Math.random() - 0.5) * 0.25;
        const arrowStyle = _lastShotStyle.get(tid) || 'plain';
        _lastShotStyle.delete(tid);
        _stuckArrows.push(new StuckArrowFx({
          targetId: tid, ox, oy, dx, dy,
          style: arrowStyle,
          ttl: 2.5 + Math.random() * 1.5,
        }));
      };
      if (delay > 0) {
        _pendingStuck.push({ fireAt: performance.now() / 1000 + delay, fn: doSpawn });
      } else {
        doSpawn();
      }
    });

    // Familiar Fireball: fiery orb projectile from familiar to target
    world.on('familiar:fireball', ({ from, to }) => {
      spawnTransientProjectile({
        from,
        to,
        style: 'fireball',
        speed: 8,
        minDuration: 0.1,
        maxDuration: 0.6,
      });
    });

    // Frost Bolt: icy projectile from caster to target
    world.on('spell:frost', ({ actor, targetId, from, at, fizzle, missed, missTo }) => {
      if (fizzle) return;
      if (!from || !at) return;
      const to = missed
        ? (missTo && Number.isFinite(missTo.x) && Number.isFinite(missTo.y)
          ? { x: Number(missTo.x), y: Number(missTo.y) }
          : computeMissEndpoint(from, at, missSeedFromIds(actor, targetId, 0x1075)))
        : at;
      spawnTransientProjectile({
        from,
        to,
        style: 'frostbolt',
        speed: 8,
        minDuration: 0.1,
        maxDuration: 0.6,
      });
    });

    // Shadow Bolt: purple energy projectile from caster to target
    world.on('spell:shadow_bolt', ({ actor, targetId, from, to, fizzle, missed, missTo }) => {
      if (fizzle) return;
      if (!from || !to) return;
      const end = missed
        ? (missTo && Number.isFinite(missTo.x) && Number.isFinite(missTo.y)
          ? { x: Number(missTo.x), y: Number(missTo.y) }
          : computeMissEndpoint(from, to, missSeedFromIds(actor, targetId, 0xb01a)))
        : to;
      spawnTransientProjectile({
        from,
        to: end,
        style: 'shadow_bolt',
        speed: 10,
        minDuration: 0.08,
        maxDuration: 0.7,
      });
    });

    world.on(FearSpellCast, ({ actor, targetId, from, at, fizzle, missed, missTo }) => {
      if (fizzle) return;
      if (!from || !at) return;
      const end = missed
        ? (missTo && Number.isFinite(missTo.x) && Number.isFinite(missTo.y)
          ? { x: Number(missTo.x), y: Number(missTo.y) }
          : computeMissEndpoint(from, at, missSeedFromIds(actor, targetId, 0xfea2)))
        : at;
      spawnTransientProjectile({
        from,
        to: end,
        style: 'shadow_bolt',
        speed: 10,
        minDuration: 0.08,
        maxDuration: 0.7,
      });
    });

    // Fireball: fiery orb from caster to target (reuses familiar fireball VFX)
    world.on('spell:fireball', ({ actor, targetId, from, to, fizzle, missed, missTo }) => {
      if (fizzle) return;
      if (!from || !to) return;
      const end = missed
        ? (missTo && Number.isFinite(missTo.x) && Number.isFinite(missTo.y)
          ? { x: Number(missTo.x), y: Number(missTo.y) }
          : computeMissEndpoint(from, to, missSeedFromIds(actor, targetId, 0xf1b4)))
        : to;
      spawnTransientProjectile({
        from,
        to: end,
        style: 'fireball',
        speed: 8,
        minDuration: 0.1,
        maxDuration: 0.6,
      });
    });

    // Generator projectiles (ranged builders)
    for (const _ev of ['spell:arcane_bolt', 'spell:natures_touch', 'spell:leech_spores']) {
      world.on(_ev, ({ actor, targetId, from, at, hit, missed, missTo }) => {
        if (!(hit || missed) || !from || !at) return;
        const style = _ev === 'spell:arcane_bolt' ? 'plain'
          : _ev === 'spell:natures_touch' ? 'venom'
          : 'venom';
        const to = missed
          ? (missTo && Number.isFinite(missTo.x) && Number.isFinite(missTo.y)
            ? { x: Number(missTo.x), y: Number(missTo.y) }
            : computeMissEndpoint(from, at, missSeedFromIds(actor, targetId, 0x6e91)))
          : at;
        spawnTransientProjectile({
          from, to, style,
          speed: 12, minDuration: 0.06, maxDuration: 0.4,
        });
      });
    }

    world.on(MagicMissileCast, ({ actor, targetId, from, at, hit, missed, missTo }) => {
      if (!(hit || missed) || !from || !at) return;
      const to = missed
        ? (missTo && Number.isFinite(missTo.x) && Number.isFinite(missTo.y)
          ? { x: Number(missTo.x), y: Number(missTo.y) }
          : computeMissEndpoint(from, at, missSeedFromIds(actor, targetId, 0x4d15)))
        : at;
      spawnTransientProjectile({
        from, to, style: 'arcane_missile',
        speed: 9, minDuration: 0.12, maxDuration: 0.58,
        arcaneAmp: 0.38,
        arcanePhase: 0.45,
        arcaneCycles: 1.45,
      });
    });

    world.on(ArcaneBarrageCast, ({ actor, targetId, from, at, hit, missed, missTo, lanes }) => {
      if (!(hit || missed) || !from || !at) return;
      const to = missed
        ? (missTo && Number.isFinite(missTo.x) && Number.isFinite(missTo.y)
          ? { x: Number(missTo.x), y: Number(missTo.y) }
          : computeMissEndpoint(from, at, missSeedFromIds(actor, targetId, 0xba77)))
        : at;
      const count = Math.max(1, Number(lanes || 3) | 0);
      for (let i = 0; i < count; i++) {
        const lane = i - ((count - 1) / 2);
        spawnTransientProjectile({
          from, to, style: 'arcane_missile',
          speed: 9, minDuration: 0.12, maxDuration: 0.58,
          arcaneLane: lane,
          arcaneAmp: 0.22,
          arcanePhase: i * 2.094,
          arcaneCycles: 1.18,
        });
      }
    });

    // Plague Swarm: buzzing swarm projectile from caster to target
    world.on('spell:plague_swarm', ({ actor, targetId, from, at, fizzle, missed, missTo }) => {
      if (fizzle) return;
      if (!from || !at) return;
      const to = missed
        ? (missTo && Number.isFinite(missTo.x) && Number.isFinite(missTo.y)
          ? { x: Number(missTo.x), y: Number(missTo.y) }
          : computeMissEndpoint(from, at, missSeedFromIds(actor, targetId, 0x5a77)))
        : at;
      spawnTransientProjectile({
        from,
        to,
        style: 'plague_swarm',
        speed: 6,
        minDuration: 0.15,
        maxDuration: 0.7,
      });
    });

    // Plague Swarm jump: swarm leaps from one enemy to the next
    world.on('spell:plague_swarm:jump', ({ from, to }) => {
      if (!from || !to) return;
      spawnTransientProjectile({
        from,
        to,
        style: 'plague_swarm',
        speed: 5,
        minDuration: 0.18,
        maxDuration: 0.6,
      });
    });

    // Web Spit: silk ball projectile from spider to target
    world.on('spell:web_spit', ({ actor, at }) => {
      const from = getPosition(Number(actor || 0));
      if (!from || !at) return;
      spawnTransientProjectile({
        from,
        to: at,
        style: 'web_spit',
        speed: 7,
        minDuration: 0.12,
        maxDuration: 0.5,
      });
    });

    // Acid Spit: spray of acid particles from caster to target
    world.on('spell:acid_spit', ({ actor, at }) => {
      if (!fx?.pool || !at) return;
      const from = getPosition(Number(actor || 0));
      if (!from) return;
      const dx = Number(at.x) - Number(from.x);
      const dy = Number(at.y) - Number(from.y);
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      // Spray of acid globs along the flight path
      for (let i = 0; i < 12; i++) {
        const spread = (Math.random() - 0.5) * 0.35;
        const spd = 3.5 + Math.random() * 2.5;
        fx.pool.spawn(new Particle({
          x: Number(from.x) + (Math.random() - 0.5) * 0.15,
          y: Number(from.y) + (Math.random() - 0.5) * 0.15,
          vx: nx * spd + (-ny) * spread * spd,
          vy: ny * spd + nx * spread * spd,
          ay: 0.4,
          life: (len / spd) * (0.8 + Math.random() * 0.5),
          size0: 0.06 + Math.random() * 0.05,
          size1: 0.02,
          r: 140 + (Math.random() * 60 | 0),
          g: 220 + (Math.random() * 35 | 0),
          b: 40 + (Math.random() * 40 | 0),
          a0: 0.80,
        }));
      }
      // A few dripping trailing drops
      for (let i = 0; i < 5; i++) {
        const spd = 2.0 + Math.random() * 1.5;
        fx.pool.spawn(new Particle({
          x: Number(from.x) + (Math.random() - 0.5) * 0.1,
          y: Number(from.y) + (Math.random() - 0.5) * 0.1,
          vx: nx * spd + (Math.random() - 0.5) * 0.6,
          vy: ny * spd + (Math.random() - 0.5) * 0.4 + 0.3,
          ay: 0.8,
          life: 0.25 + Math.random() * 0.3,
          size0: 0.03 + Math.random() * 0.03,
          size1: 0.01,
          r: 120, g: 200, b: 50,
          a0: 0.55,
        }));
      }
    });

    // Web struggle: silk strands burst when stuck actor tries to move
    world.on('movement:slowed', ({ x, y, dx, dy }) => {
      if (!fx?.pool) return;
      const wx = Number(x || 0);
      const wy = Number(y || 0);
      const mdx = Number(dx || 0);
      const mdy = Number(dy || 0);
      // Burst of silk strands in the attempted direction
      for (let k = 0; k < 6; k++) {
        const angle = Math.atan2(mdy, mdx) + (Math.random() - 0.5) * 1.6;
        const spd = 0.3 + Math.random() * 0.8;
        fx.pool.spawn(new Particle({
          x: wx + (Math.random() - 0.5) * 0.3,
          y: wy + (Math.random() - 0.5) * 0.3,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd + 0.05,
          ay: 0.3,
          life: 0.18 + Math.random() * 0.15,
          size0: 0.06 + Math.random() * 0.04,
          size1: 0.01,
          r: 210 + (Math.random() * 30 | 0),
          g: 210 + (Math.random() * 30 | 0),
          b: 215 + (Math.random() * 30 | 0),
          a0: 0.6,
          rotVel: (Math.random() - 0.5) * 3,
        }));
      }
    });

    world.on('projectile:spawn', ({ style, from, to, sourceId, targetId, speed }) => {
      const start = from || getPosition(Number(sourceId || 0));
      const end = to || getPosition(Number(targetId || 0));
      spawnTransientProjectile({
        from: start,
        to: end,
        style: String(style || 'plain'),
        speed: Number(speed || 18),
        minDuration: 0.05,
        maxDuration: 0.4,
      });
    });
  }

  /** Return active light sources for the lighting engine. */
  function getActiveLights() {
    const out = [];
    // Shadow bolts — purple glow
    for (let i = 0; i < _sboltFx.length; i++) {
      const sb = _sboltFx[i];
      const u = sb.progress;
      out.push({
        x: sb.from.x + (sb.to.x - sb.from.x) * u,
        y: sb.from.y + (sb.to.y - sb.from.y) * u,
        radius: 4, color: [160, 80, 220],
      });
    }
    // Fireballs — orange glow
    for (let i = 0; i < _fireballFx.length; i++) {
      const fb = _fireballFx[i];
      const u = fb.progress;
      out.push({
        x: fb.from.x + (fb.to.x - fb.from.x) * u,
        y: fb.from.y + (fb.to.y - fb.from.y) * u,
        radius: 5, color: [255, 140, 50],
      });
    }
    // Frost bolts — cool blue glow
    for (let i = 0; i < _frostboltFx.length; i++) {
      const fb = _frostboltFx[i];
      const u = fb.progress;
      out.push({
        x: fb.from.x + (fb.to.x - fb.from.x) * u,
        y: fb.from.y + (fb.to.y - fb.from.y) * u,
        radius: 4, color: [140, 200, 255],
      });
    }
    // Arcane missiles — violet moving light on the actual sine path
    for (let i = 0; i < _arcaneMissileFx.length; i++) {
      const bolt = _arcaneMissileFx[i];
      const pt = arcanePoint(bolt);
      const laneScale = bolt.arcaneLane ? 0.72 : 1.0;
      out.push({
        x: pt.x,
        y: pt.y,
        radius: 4.2 * laneScale,
        color: [190, 120, 255],
        flicker: 0.85 + 0.15 * Math.sin(bolt.progress * Math.PI * 6 + Number(bolt.arcanePhase || 0)),
        softness: 4,
      });
    }
    // Ricochet — holy gold
    for (let i = 0; i < _ricochetFx.length; i++) {
      const r = _ricochetFx[i];
      const u = r.progress;
      out.push({
        x: r.from.x + (r.to.x - r.from.x) * u,
        y: r.from.y + (r.to.y - r.from.y) * u,
        radius: 4, color: [255, 240, 180],
      });
    }
    // Plague swarm — amber glow
    for (let i = 0; i < _swarmFx.length; i++) {
      const sw = _swarmFx[i];
      const u = sw.progress;
      out.push({
        x: sw.from.x + (sw.to.x - sw.from.x) * u,
        y: sw.from.y + (sw.to.y - sw.from.y) * u,
        radius: 3, color: [220, 180, 40],
      });
    }
    // Elemental arrows — compact moving glow
    for (let i = 0; i < _arrowFx.length; i++) {
      const a = _arrowFx[i];
      if (a.style !== 'fire' && a.style !== 'venom' && a.style !== 'storm' && a.style !== 'frost') continue;
      const u = a.progress;
      const color = a.style === "venom"
        ? [120, 255, 80]
        : (a.style === "storm"
          ? [145, 205, 255]
          : (a.style === "frost" ? [160, 220, 255] : [255, 100, 30]));
      const radius = a.style === "storm"
        ? 3.2
        : (a.style === "frost" ? 2.8 : (a.style === "venom" ? 2.7 : 3));
      out.push({
        x: a.from.x + (a.to.x - a.from.x) * u,
        y: a.from.y + (a.to.y - a.from.y) * u,
        radius,
        color,
      });
    }
    // Impacts
    for (let i = 0; i < _sboltImpact.length; i++) {
      const imp = _sboltImpact[i];
      out.push({ x: imp.x, y: imp.y, radius: 3 * imp.alpha, color: [160, 80, 220] });
    }
    for (let i = 0; i < _fireballImpact.length; i++) {
      const imp = _fireballImpact[i];
      out.push({ x: imp.x, y: imp.y, radius: 4 * imp.alpha, color: [255, 140, 50] });
    }
    for (let i = 0; i < _frostboltImpact.length; i++) {
      const imp = _frostboltImpact[i];
      out.push({ x: imp.x, y: imp.y, radius: 3 * imp.alpha, color: [140, 200, 255] });
    }
    for (let i = 0; i < _arcaneMissileImpact.length; i++) {
      const imp = _arcaneMissileImpact[i];
      out.push({ x: imp.x, y: imp.y, radius: 3.2 * imp.alpha, color: [205, 150, 255] });
    }
    // Web spit — faint cool white glow
    for (let i = 0; i < _webSpitFx.length; i++) {
      const ws = _webSpitFx[i];
      const u = ws.progress;
      out.push({
        x: ws.from.x + (ws.to.x - ws.from.x) * u,
        y: ws.from.y + (ws.to.y - ws.from.y) * u,
        radius: 2.5, color: [200, 200, 220],
      });
    }
    for (let i = 0; i < _webSpitImpact.length; i++) {
      const imp = _webSpitImpact[i];
      out.push({ x: imp.x, y: imp.y, radius: 2 * imp.alpha, color: [200, 200, 220] });
    }
    // Elemental arrow impacts — brief flare
    for (let i = 0; i < _arrowSparks.length; i++) {
      const s = _arrowSparks[i];
      if (s.style !== "fire" && s.style !== "venom" && s.style !== "storm" && s.style !== "frost") continue;
      const color = s.style === "venom"
        ? [120, 255, 90]
        : (s.style === "storm"
          ? [155, 215, 255]
          : (s.style === "frost" ? [170, 230, 255] : [255, 120, 40]));
      out.push({ x: s.x, y: s.y, radius: 2.5 * s.alpha, color });
    }
    return out;
  }

  return { tick, draw, getActiveLights, installListeners };
}
