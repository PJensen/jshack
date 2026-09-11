// src/display/fx/spellAreaFx.js
// Blink, meteor, blastwave spell VFX (world-space; display-only).

import { startShake, startSlamShake } from "../camera/shake.js";
import { pathPolyline, jitterLine } from "./fxGeom.js";
import { Particle } from "../passes/vfx/particles/particlePool.js";
import { RadialFx, BlinkFx, PhaseStrikeFx, SearchPulseFx, ArcSweepFx, SmokeFx } from "./fxEntries.js";
import { isGoreDisabled } from "../ui/wiring/goreEngine.js";
import { VoidHoleCast } from "../../events/VoidHoleCast.js";
import { FrostNovaCast } from "../../events/FrostNovaCast.js";

/**
 * @param {{ world: import('../../lib/ecs-js/index.js').World, cam: object, fx: { pool: { spawn(o:object):void } }, PERF: { quality: string }, getFxTime: () => number, getPosition?: (id:number) => ({x:number,y:number}|null), ftext?: { addDamage: Function, addStatus?: Function }, sculptFloor?: ((x:number,y:number,delta:number,reliefKey?: string|number)=>void), sculptFloorBrush?: ((x:number,y:number,delta:number,radius:number,opts?:object,reliefKey?:string|number)=>void), getActiveReliefKey?: (() => (string|number|null|undefined)) }} deps
 */
export function createSpellAreaFxController({ world, cam, fx, PERF, getFxTime, getPosition, ftext, sculptFloor, sculptFloorBrush, getActiveReliefKey }) {
  // --- Blink state ---
  /** @type {BlinkFx[]} */
  const _blinkFx = [];

  function spawnBlinkBurst(x, y, intensity = 1) {
    const scale = PERF.quality === 'low' ? 0.7 : (PERF.quality === 'high' ? 1.2 : 1.0);
    const count = Math.max(4, Math.round((8 + intensity * 8) * scale));
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.4;
      const speed = 0.45 + Math.random() * 1.35;
      const life = 0.16 + Math.random() * 0.28;
      fx.pool.spawn(new Particle({
        x: x + (Math.random() - 0.5) * 0.12,
        y: y + (Math.random() - 0.5) * 0.12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.05,
        ay: 0.12,
        life,
        size0: 0.09 + Math.random() * 0.09,
        size1: 0.02,
        r: 130 + ((Math.random() * 50) | 0),
        g: 210 + ((Math.random() * 40) | 0),
        b: 255,
        a0: 0.92,
        rotVel: (Math.random() - 0.5) * 2.2,
      }));
    }
  }

  // --- Meteor state ---
  /** @type {RadialFx[]} */
  const _meteorFx = [];
  /** @type {Map<string, { x:number, y:number, reliefKey:string, startStep:number, endStep:number, base:number, radius:number, color:[number,number,number], phase:number }>} */
  const _impactWarmTiles = new Map();
  /** @type {Array<{ x:number, y:number, vx:number, vy:number, ay:number, ttl:number, max:number, radius:number, phase:number }>} */
  const _impactFlameLights = [];
  const MAX_IMPACT_WARM_TILES = 560;

  function hash2i(xi, yi, seed = 0) {
    let h = (Math.imul(xi | 0, 374761393) ^ Math.imul(yi | 0, 668265263) ^ Math.imul(seed | 0, 1442695041)) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function carveMeteorCrater(origin, radius, reliefKey) {
    if (!origin) return;
    const cx = Number(origin.x) + 0.5;
    const cy = Number(origin.y) + 0.5;
    const ox = Math.floor(cx);
    const oy = Math.floor(cy);
    const r = Math.max(1.2, Number(radius) || 2);
    const outer = r + 1.1;
    const ir = Math.ceil(outer);
    const keySeed = (typeof reliefKey === "number" ? (reliefKey | 0) : ((String(reliefKey || "").length * 131) | 0));
    const centerSeed = ((ox & 0xffff) << 16) ^ (oy & 0xffff) ^ keySeed;

    if (typeof sculptFloorBrush === "function") {
      // Central deep bowl.
      sculptFloorBrush(
        cx, cy, -0.90, r * 0.94,
        { falloff: 1.32, roughness: 0.28, depthNoise: 0.26, seed: centerSeed ^ 0x9e3779b9 },
        reliefKey,
      );
      // Uneven lobes to break perfect radial symmetry.
      const lobeCount = 4 + (centerSeed & 1);
      for (let i = 0; i < lobeCount; i++) {
        const a = (Math.PI * 2 * i / lobeCount) + (hash2i(i, centerSeed, 11) - 0.5) * 0.48;
        const dist = r * (0.38 + hash2i(i, centerSeed, 13) * 0.36);
        const lx = cx + Math.cos(a) * dist;
        const ly = cy + Math.sin(a) * dist;
        const lr = r * (0.36 + hash2i(i, centerSeed, 17) * 0.20);
        const ld = -0.40 - hash2i(i, centerSeed, 19) * 0.28;
        sculptFloorBrush(
          lx, ly, ld, lr,
          { falloff: 1.45, roughness: 0.34, depthNoise: 0.30, seed: centerSeed ^ (i * 2654435761) },
          reliefKey,
        );
      }
      return;
    }

    if (typeof sculptFloor !== "function") return;

    const sampleOffsets = [-0.33, 0, 0.33];
    const edgeSeedA = (centerSeed ^ 0x6c8e9cf5) | 0;
    const edgeSeedB = (centerSeed ^ 0x27d4eb2f) | 0;
    const phaseA = (centerSeed & 255) * 0.023;
    const phaseB = ((centerSeed >>> 8) & 255) * 0.019;
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        const tx = ox + dx;
        const ty = oy + dy;
        let hit = 0;
        let innerAccum = 0;
        let sampleCount = 0;
        for (let sy = 0; sy < sampleOffsets.length; sy++) {
          for (let sx = 0; sx < sampleOffsets.length; sx++) {
            sampleCount++;
            const px = tx + 0.5 + sampleOffsets[sx];
            const py = ty + 0.5 + sampleOffsets[sy];
            const ddx = px - cx;
            const ddy = py - cy;
            const ang = Math.atan2(ddy, ddx);
            const ring = Math.sqrt(ddx * ddx + ddy * ddy);
            const sector = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 24);
            const edgeNoiseA = 0.82 + hash2i(sector, 17, edgeSeedA) * 0.36;
            const edgeNoiseB = 0.84 + hash2i(sector, 43, edgeSeedB) * 0.28;
            const lobe = 1
              + 0.16 * Math.sin(ang * 3.0 + phaseA)
              + 0.10 * Math.sin(ang * 5.0 + phaseB);
            const edgeR = outer * edgeNoiseA * edgeNoiseB * lobe;
            if (ring > edgeR) continue;
            hit++;
            innerAccum += Math.max(0, 1 - ring / edgeR);
          }
        }
        if (hit <= 0) continue;
        const coverage = hit / sampleCount;
        const innerT = innerAccum / hit;
        if (innerT <= 0) continue;
        const n = hash2i(tx, ty, centerSeed);
        const irregular = 0.72 + n * 0.66;
        const depthNoise = 0.78 + hash2i(tx * 3, ty * 5, centerSeed ^ 0x3c6ef35f) * 0.48;
        let delta = -0.74 * Math.pow(innerT, 1.36) * irregular * depthNoise * coverage;
        if (coverage < 0.45) delta *= 0.68;
        if (Math.abs(delta) < 0.015) continue;
        sculptFloor(tx, ty, delta, reliefKey);
      }
    }
  }

  function carveStormPockmark(impact, reliefKey, seedSalt = 0) {
    if (typeof sculptFloorBrush !== "function" || !impact) return;
    const x = Number(impact.x) + 0.5;
    const y = Number(impact.y) + 0.5;
    const baseSeed = (((Math.floor(x) & 0xffff) << 16) ^ (Math.floor(y) & 0xffff) ^ (seedSalt | 0)) | 0;
    const baseR = 0.46 + hash2i(baseSeed, 3, 7) * 0.22;
    const baseD = -0.22 - hash2i(baseSeed, 5, 11) * 0.14;
    sculptFloorBrush(
      x, y, baseD, baseR,
      { falloff: 1.2, roughness: 0.38, depthNoise: 0.24, seed: baseSeed ^ 0x517cc1b7 },
      reliefKey,
    );
    if (hash2i(baseSeed, 13, 17) > 0.45) {
      const a = hash2i(baseSeed, 19, 23) * Math.PI * 2;
      const d = baseR * (0.34 + hash2i(baseSeed, 29, 31) * 0.26);
      sculptFloorBrush(
        x + Math.cos(a) * d,
        y + Math.sin(a) * d,
        baseD * (0.52 + hash2i(baseSeed, 37, 41) * 0.24),
        baseR * (0.42 + hash2i(baseSeed, 43, 47) * 0.23),
        { falloff: 1.42, roughness: 0.44, depthNoise: 0.32, seed: baseSeed ^ 0x85ebca6b },
        reliefKey,
      );
    }
  }

  // --- Blastwave state ---
  /** @type {RadialFx[]} */
  const _blastwaveFx = [];
  /** @type {RadialFx[]} */
  const _frostNovaFx = [];
  /** @type {Array<{ x:number, y:number, radius:number, ttl:number, max:number, phase:number }>} */
  const _frostNovaRemnants = [];
  /** @type {Array<{
   *   holeId:number,
   *   x:number,
   *   y:number,
   *   radius:number,
   *   phase:number,
   *   alpha:number,
   *   targetAlpha:number,
   *   strength:number,
   *   targetStrength:number,
   *   progress:number,
   *   collapsing:boolean,
   *   collapseFlash:number,
   *   fadeLeft:number,
   *   update(event:object):void,
   *   tick(dt:number):void,
   *   readonly expired:boolean,
   * }>} */
  const _voidHoleFx = [];

  class VoidHoleFx {
    constructor({ holeId, origin, radius, strength, progress, collapsing }) {
      this.holeId = Number(holeId || 0) | 0;
      this.x = Number(origin.x);
      this.y = Number(origin.y);
      this.radius = Math.max(2.8, (Number(radius) || 3) * 2.05);
      this.phase = Math.random() * Math.PI * 2;
      this.alpha = 0.08;
      this.targetAlpha = 1;
      this.strength = Math.max(0.2, Number(strength || 0.75));
      this.targetStrength = this.strength;
      this.progress = Math.max(0, Math.min(1, Number(progress || 0)));
      this.collapsing = !!collapsing;
      this.collapseFlash = this.collapsing ? 1 : 0;
      this.fadeLeft = this.collapsing ? 1.1 : Infinity;
    }

    update({ origin, radius, strength, progress, collapsing }) {
      if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
        this.x = Number(origin.x);
        this.y = Number(origin.y);
      }
      this.radius = Math.max(2.8, (Number(radius) || 3) * 2.05);
      this.targetStrength = Math.max(0.2, Number(strength || this.targetStrength || 0.75));
      this.progress = Math.max(this.progress, Math.max(0, Math.min(1, Number(progress || 0))));
      if (collapsing) {
        this.collapsing = true;
        this.collapseFlash = Math.max(this.collapseFlash, 1);
        this.fadeLeft = Math.max(Number.isFinite(this.fadeLeft) ? this.fadeLeft : 0, 1.1);
      }
    }

    tick(dt) {
      const blend = Math.min(1, Math.max(0, dt) * 5.5);
      this.alpha += (this.targetAlpha - this.alpha) * blend;
      this.strength += (this.targetStrength - this.strength) * blend;
      this.collapseFlash = Math.max(0, this.collapseFlash - Math.max(0, dt) * 1.9);
      if (this.collapsing) {
        this.fadeLeft -= Math.max(0, dt);
        if (this.fadeLeft < 0.55) this.targetAlpha = 0;
      }
    }

    get expired() {
      return this.collapsing && this.fadeLeft <= 0 && this.alpha < 0.04;
    }
  }

  // --- Flash Heal state ---
  /** @type {RadialFx[]} */
  const _flashHealFx = [];

  // --- Phase Strike state ---
  /** @type {PhaseStrikeFx[]} */
  const _phaseStrikeFx = [];

  // --- Smite state ---
  /** @type {RadialFx[]} */
  const _smiteFx = [];

  // --- Rampage state ---
  /** @type {RadialFx[]} */
  const _rampageFx = [];

  // --- Class ability VFX state ---
  /** @type {ArcSweepFx[]} */
  const _cleaveFx = [];
  /** @type {RadialFx[]} */
  const _warCryFx = [];
  /** @type {RadialFx[]} */
  const _divineShieldFx = [];
  /** @type {RadialFx[]} */
  const _consecrateFx = [];
  /** @type {SmokeFx[]} */
  const _smokeBombFx = [];

  // --- Search pulse state ---
  /** @type {SearchPulseFx[]} */
  const _searchPulseFx = [];
  /** @type {Map<number, {
   *   actor:number,
   *   targetId:number,
   *   expiresStep:number,
   *   lastTickStep:number,
   *   phase:number,
   *   tickFlash:number,
   *   endFlash:number,
   *   moteClock:number,
   *   breakReason:string,
   *   fading:boolean,
   *   fadeLeft:number,
   *   fadeMax:number,
   * }>} */
  const _drainLifeChannels = new Map();

  /**
   * Evocation channel VFX state — arcane mana-draw aura.
   * @type {Map<number, {
   *   actor:number,
   *   phase:number,
   *   intensity:number,
   *   moteClock:number,
   *   tickFlash:number,
   *   fading:boolean,
   *   fadeLeft:number,
   *   fadeMax:number,
   * }>}
   */
  const _evocationChannels = new Map();
  /** @type {Map<number, { actor:number, x:number, y:number, turns:number, startedAtStep:number, phase:number, fading:boolean, fadeLeft:number, fadeMax:number, rippleClock:number }>} */
  const _fishingChannels = new Map();

  const STORM_VOLLEY_SWAY_MAX_RAD = Math.PI / 36; // +/- 5deg
  const STORM_LOCAL_SWAY_MAX_RAD = Math.PI / 60; // +/- 3deg

  function spawnStormProjectile(to, style, lane = 0, sharedSway = 0) {
    if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return;
    const localSway = (Math.random() - 0.5) * 2 * STORM_LOCAL_SWAY_MAX_RAD;
    const totalSway = sharedSway + localSway;
    const fallDistance = 4.2 + Math.random() * 1.4;
    const driftX = Math.tan(totalSway) * fallDistance;
    const from = {
      x: Number(to.x) + driftX + (lane * 0.18) + ((Math.random() - 0.5) * 0.24),
      y: Number(to.y) - fallDistance,
    };
    try {
      world.emit?.('projectile:spawn', {
        style,
        from,
        to: { x: Number(to.x), y: Number(to.y) },
        speed: 8,
      });
    } catch (e) { console.debug('[spellAreaFx] emit projectile:spawn failed:', e); }
  }

  function spawnMeteorProjectile(to) {
    if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return;
    const sway = (Math.random() - 0.5) * 2 * STORM_VOLLEY_SWAY_MAX_RAD;
    const fallDistance = 5.2 + Math.random() * 1.2;
    const driftX = Math.tan(sway) * fallDistance;
    try {
      world.emit?.('projectile:spawn', {
        style: 'fireball',
        from: {
          x: Number(to.x) + driftX + ((Math.random() - 0.5) * 0.18),
          y: Number(to.y) - fallDistance,
        },
        to: { x: Number(to.x), y: Number(to.y) },
        speed: 7,
      });
    } catch (e) { console.debug('[spellAreaFx] emit meteor projectile:spawn failed:', e); }
  }

  function stormImpactRadius(radius) {
    const base = Math.max(0.42, Number(radius || 1) * 0.48);
    return Math.min(0.72, base);
  }

  function currentStep() {
    return Number.isFinite(Number(world?.step)) ? (Number(world.step) | 0) : 0;
  }

  function normReliefKey(reliefKey) {
    if (typeof reliefKey === "number" && Number.isFinite(reliefKey)) {
      return `depth:${Math.floor(reliefKey)}`;
    }
    const s = String(reliefKey ?? "").trim();
    if (!s) return "depth:0";
    return s.startsWith("depth:") ? s : `depth:${s}`;
  }

  function warmTileKey(reliefKey, tx, ty) {
    return `${reliefKey}|${tx},${ty}`;
  }

  function stampWarmTile(tx, ty, strength, turns, radius, color, reliefKey) {
    const s = Math.max(0, Number(strength) || 0);
    if (s <= 0) return;
    const t = Math.max(2, Math.round(Number(turns) || 0));
    const r = Math.max(0.32, Number(radius) || 0.32);
    const rk = normReliefKey(reliefKey);
    const key = warmTileKey(rk, tx, ty);
    const now = currentStep();
    const nextEnd = now + t;
    const c = Array.isArray(color) ? color : [255, 120, 45];
    const found = _impactWarmTiles.get(key);
    if (found) {
      found.reliefKey = rk;
      found.startStep = now;
      found.endStep = Math.max(found.endStep, nextEnd);
      found.base = Math.min(1.45, found.base * 0.55 + s);
      found.radius = Math.max(found.radius, r);
      found.color = [
        Math.max(found.color[0], c[0] | 0),
        Math.max(found.color[1], c[1] | 0),
        Math.max(found.color[2], c[2] | 0),
      ];
      return;
    }
    _impactWarmTiles.set(key, {
      x: tx + 0.5,
      y: ty + 0.5,
      reliefKey: rk,
      startStep: now,
      endStep: nextEnd,
      base: Math.min(1.45, s),
      radius: r,
      color: [c[0] | 0, c[1] | 0, c[2] | 0],
      phase: Math.random() * Math.PI * 2,
    });
  }

  function stampWarmSpot(at, radius, strength, turns, color, reliefKey) {
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
    const cx = Number(at.x) + 0.5;
    const cy = Number(at.y) + 0.5;
    const rr = Math.max(0.36, Number(radius) || 0.36);
    const tx0 = Math.floor(cx - rr);
    const ty0 = Math.floor(cy - rr);
    const tx1 = Math.ceil(cx + rr);
    const ty1 = Math.ceil(cy + rr);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const dx = (tx + 0.5) - cx;
        const dy = (ty + 0.5) - cy;
        const d = Math.hypot(dx, dy);
        if (d > rr) continue;
        const edge = Math.max(0, 1 - (d / rr));
        const tileStrength = strength * Math.pow(edge, 0.78);
        if (tileStrength < 0.045) continue;
        const tileTurns = Math.max(2, Math.round(turns * (0.58 + edge * 0.42)));
        const tileRadius = 0.40 + tileStrength * 0.95;
        stampWarmTile(tx, ty, tileStrength, tileTurns, tileRadius, color, reliefKey);
      }
    }
  }

  // --- Tick ---
  /** @param {number} dt */
  function tick(dt) {
    for (let i = _blinkFx.length - 1; i >= 0; i--) {
      _blinkFx[i].tick(dt);
      if (_blinkFx[i].expired) _blinkFx.splice(i, 1);
    }
    for (let i = _meteorFx.length - 1; i >= 0; i--) {
      _meteorFx[i].tick(dt);
      if (_meteorFx[i].expired) _meteorFx.splice(i, 1);
    }
    for (let i = _blastwaveFx.length - 1; i >= 0; i--) {
      _blastwaveFx[i].tick(dt);
      if (_blastwaveFx[i].expired) _blastwaveFx.splice(i, 1);
    }
    for (let i = _frostNovaFx.length - 1; i >= 0; i--) {
      _frostNovaFx[i].tick(dt);
      if (_frostNovaFx[i].expired) _frostNovaFx.splice(i, 1);
    }
    for (let i = _frostNovaRemnants.length - 1; i >= 0; i--) {
      const rem = _frostNovaRemnants[i];
      rem.ttl -= dt;
      if (rem.ttl <= 0) _frostNovaRemnants.splice(i, 1);
    }
    for (let i = _voidHoleFx.length - 1; i >= 0; i--) {
      _voidHoleFx[i].tick(dt);
      if (_voidHoleFx[i].expired) _voidHoleFx.splice(i, 1);
    }
    for (let i = _flashHealFx.length - 1; i >= 0; i--) {
      _flashHealFx[i].tick(dt);
      if (_flashHealFx[i].expired) _flashHealFx.splice(i, 1);
    }
    for (let i = _phaseStrikeFx.length - 1; i >= 0; i--) {
      _phaseStrikeFx[i].tick(dt);
      if (_phaseStrikeFx[i].expired) _phaseStrikeFx.splice(i, 1);
    }
    for (let i = _smiteFx.length - 1; i >= 0; i--) {
      _smiteFx[i].tick(dt);
      if (_smiteFx[i].expired) _smiteFx.splice(i, 1);
    }
    for (let i = _rampageFx.length - 1; i >= 0; i--) {
      _rampageFx[i].tick(dt);
      if (_rampageFx[i].expired) _rampageFx.splice(i, 1);
    }
    for (let i = _searchPulseFx.length - 1; i >= 0; i--) {
      _searchPulseFx[i].tick(dt);
      if (_searchPulseFx[i].expired) _searchPulseFx.splice(i, 1);
    }
    for (let i = _cleaveFx.length - 1; i >= 0; i--) {
      _cleaveFx[i].tick(dt);
      if (_cleaveFx[i].expired) _cleaveFx.splice(i, 1);
    }
    for (let i = _warCryFx.length - 1; i >= 0; i--) {
      _warCryFx[i].tick(dt);
      if (_warCryFx[i].expired) _warCryFx.splice(i, 1);
    }
    for (let i = _divineShieldFx.length - 1; i >= 0; i--) {
      _divineShieldFx[i].tick(dt);
      if (_divineShieldFx[i].expired) _divineShieldFx.splice(i, 1);
    }
    for (let i = _consecrateFx.length - 1; i >= 0; i--) {
      _consecrateFx[i].tick(dt);
      if (_consecrateFx[i].expired) _consecrateFx.splice(i, 1);
    }
    for (let i = _smokeBombFx.length - 1; i >= 0; i--) {
      _smokeBombFx[i].tick(dt);
      if (_smokeBombFx[i].expired) _smokeBombFx.splice(i, 1);
    }
    const step = currentStep();
    for (const [k, h] of _impactWarmTiles) {
      if (step >= h.endStep) _impactWarmTiles.delete(k);
    }
    for (let i = _impactFlameLights.length - 1; i >= 0; i--) {
      const f = _impactFlameLights[i];
      f.ttl -= dt;
      if (f.ttl <= 0) { _impactFlameLights.splice(i, 1); continue; }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += f.ay * dt;
    }
    if (_impactWarmTiles.size > MAX_IMPACT_WARM_TILES) {
      const entries = [..._impactWarmTiles.entries()];
      entries.sort((a, b) => a[1].endStep - b[1].endStep);
      const overflow = _impactWarmTiles.size - MAX_IMPACT_WARM_TILES;
      for (let i = 0; i < overflow; i++) _impactWarmTiles.delete(entries[i][0]);
    }
    if (_impactFlameLights.length > 180) {
      _impactFlameLights.splice(0, _impactFlameLights.length - 180);
    }
    for (const [actorId, ch] of _fishingChannels) {
      ch.rippleClock = Math.max(0, Number(ch.rippleClock || 0) - dt);
      if (ch.fading) {
        ch.fadeLeft = Math.max(0, Number(ch.fadeLeft || 0) - dt);
        if (ch.fadeLeft <= 0) _fishingChannels.delete(actorId);
        continue;
      }
      if (Number(ch.durationLeft || 0) > 0) {
        ch.durationLeft = Math.max(0, Number(ch.durationLeft || 0) - dt);
        if (ch.durationLeft <= 0) {
          ch.fading = true;
          ch.fadeMax = 0.35;
          ch.fadeLeft = Math.max(Number(ch.fadeLeft || 0), ch.fadeMax);
        }
      }
      if (!fx?.pool || ch.rippleClock > 0) continue;
      ch.rippleClock = 0.07 + Math.random() * 0.05;
      const a = Math.random() * Math.PI * 2;
      const r = 0.10 + Math.random() * 0.28;
      fx.pool.spawn(new Particle({
        x: Number(ch.x) + Math.cos(a) * r,
        y: Number(ch.y) + Math.sin(a) * r,
        vx: Math.cos(a) * (0.08 + Math.random() * 0.10),
        vy: Math.sin(a) * (0.08 + Math.random() * 0.10),
        life: 0.45 + Math.random() * 0.28,
        size0: 0.07 + Math.random() * 0.05,
        size1: 0.01,
        r: 100,
        g: 210,
        b: 255,
        a0: 0.72,
      }));
    }
    for (const [actorId, channel] of _drainLifeChannels) {
      channel.tickFlash = Math.max(0, Number(channel.tickFlash || 0) - dt);
      channel.endFlash = Math.max(0, Number(channel.endFlash || 0) - dt);
      channel.moteClock = Math.max(0, Number(channel.moteClock || 0) - dt);

      const actorPos = typeof getPosition === "function" ? getPosition(actorId) : null;
      const targetPos = typeof getPosition === "function" ? getPosition(channel.targetId) : null;
      if (!actorPos || !targetPos) {
        _drainLifeChannels.delete(actorId);
        continue;
      }

      if (channel.fading) {
        channel.fadeLeft = Math.max(0, Number(channel.fadeLeft || 0) - dt);
        if (channel.fadeLeft <= 0) {
          _drainLifeChannels.delete(actorId);
        }
        continue;
      }

      if (world.step > Number(channel.expiresStep || 0)) {
        channel.fading = true;
        channel.fadeMax = 0.22;
        channel.fadeLeft = channel.fadeMax;
      }

      if (!fx?.pool || channel.moteClock > 0) continue;
      channel.moteClock = 0.04 + Math.random() * 0.07;
      const tx = Number(targetPos.x) - Number(actorPos.x);
      const ty = Number(targetPos.y) - Number(actorPos.y);
      const t = 0.15 + Math.random() * 0.7;
      const px = Number(actorPos.x) + tx * t + (Math.random() - 0.5) * 0.10;
      const py = Number(actorPos.y) + ty * t + (Math.random() - 0.5) * 0.10;
      const towardCaster = -1;
      fx.pool.spawn(new Particle({
        x: px,
        y: py,
        vx: (tx || 0.001) * towardCaster * (0.25 + Math.random() * 0.25),
        vy: (ty || 0.001) * towardCaster * (0.25 + Math.random() * 0.25),
        ay: -0.03,
        life: 0.12 + Math.random() * 0.14,
        size0: 0.045 + Math.random() * 0.03,
        size1: 0.01,
        r: 190 + ((Math.random() * 35) | 0),
        g: 40 + ((Math.random() * 25) | 0),
        b: 70 + ((Math.random() * 35) | 0),
        a0: 0.72,
      }));
    }

    // --- Tick: Evocation channels ---
    for (const [actorId, ch] of _evocationChannels) {
      ch.tickFlash = Math.max(0, Number(ch.tickFlash || 0) - dt);
      ch.moteClock = Math.max(0, Number(ch.moteClock || 0) - dt);

      const actorPos = typeof getPosition === "function" ? getPosition(actorId) : null;
      if (!actorPos) { _evocationChannels.delete(actorId); continue; }

      if (ch.fading) {
        ch.fadeLeft = Math.max(0, Number(ch.fadeLeft || 0) - dt);
        if (ch.fadeLeft <= 0) _evocationChannels.delete(actorId);
        continue;
      }

      // Ramp intensity up over time
      ch.intensity = Math.min(1.5, (ch.intensity || 0) + dt * 0.6);

      if (!fx?.pool || ch.moteClock > 0) continue;
      ch.moteClock = 0.025 + Math.random() * 0.04;

      // Spawn converging aether particles in a ring around the caster, spiraling inward
      const cx = Number(actorPos.x);
      const cy = Number(actorPos.y);
      const spawnRadius = 0.8 + Math.random() * 0.6;
      const angle = Math.random() * Math.PI * 2;
      const px = cx + Math.cos(angle) * spawnRadius;
      const py = cy + Math.sin(angle) * spawnRadius;
      // Velocity toward center with tangential spiral component
      const toCenterX = cx - px;
      const toCenterY = cy - py;
      const tangentX = -toCenterY * 0.4;
      const tangentY = toCenterX * 0.4;
      const speed = 0.8 + Math.random() * 0.5;
      const life = 0.3 + Math.random() * 0.25;

      // Primary arcane motes — blue-violet converging
      fx.pool.spawn(new Particle({
        x: px, y: py,
        vx: (toCenterX + tangentX) * speed,
        vy: (toCenterY + tangentY) * speed,
        life,
        size0: 0.06 + Math.random() * 0.05,
        size1: 0.01,
        r: 120 + ((Math.random() * 40) | 0),
        g: 140 + ((Math.random() * 60) | 0),
        b: 255,
        a0: 0.7 * ch.intensity,
        a1: 0,
      }));

      // Secondary bright mote — white-cyan core energy (sparser)
      if (Math.random() < 0.35) {
        const innerRadius = 0.3 + Math.random() * 0.3;
        const a2 = Math.random() * Math.PI * 2;
        fx.pool.spawn(new Particle({
          x: cx + Math.cos(a2) * innerRadius,
          y: cy + Math.sin(a2) * innerRadius,
          vx: (cx - (cx + Math.cos(a2) * innerRadius)) * 1.2,
          vy: (cy - (cy + Math.sin(a2) * innerRadius)) * 1.2 - 0.15,
          life: 0.15 + Math.random() * 0.12,
          size0: 0.04 + Math.random() * 0.03,
          size1: 0.005,
          r: 200 + ((Math.random() * 55) | 0),
          g: 220 + ((Math.random() * 35) | 0),
          b: 255,
          a0: 0.85 * ch.intensity,
          a1: 0,
        }));
      }

      // Rising wisps — energy ascending from the draw point
      if (Math.random() < 0.2) {
        fx.pool.spawn(new Particle({
          x: cx + (Math.random() - 0.5) * 0.15,
          y: cy,
          vx: (Math.random() - 0.5) * 0.15,
          vy: -0.6 - Math.random() * 0.4,
          life: 0.35 + Math.random() * 0.25,
          size0: 0.035 + Math.random() * 0.025,
          size1: 0.005,
          r: 180 + ((Math.random() * 40) | 0),
          g: 160 + ((Math.random() * 60) | 0),
          b: 255,
          a0: 0.5 * ch.intensity,
          a1: 0,
        }));
      }
    }
  }

  // --- Draw: Evocation ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawEvocation(ctx) {
    if (!_evocationChannels.size || typeof getPosition !== "function") return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const now = getFxTime();
    const TAU = Math.PI * 2;

    for (const [actorId, ch] of _evocationChannels) {
      const pos = getPosition(actorId);
      if (!pos) continue;
      const cx = Number(pos.x);
      const cy = Number(pos.y);

      const baseAlpha = ch.fading
        ? 0.7 * (Number(ch.fadeLeft || 0) / Math.max(0.001, Number(ch.fadeMax || 1)))
        : 0.7;
      const intensity = Number(ch.intensity || 0);
      const pulse = 0.5 + 0.5 * Math.sin(now * 8 + Number(ch.phase || 0));
      const pulse2 = 0.5 + 0.5 * Math.sin(now * 12 + Number(ch.phase || 0) + 1.5);

      // Outer aura glow — large soft circle
      const outerR = 0.55 + pulse * 0.15 * intensity;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
      grad.addColorStop(0, `rgba(100,160,255,${(0.20 * baseAlpha * intensity).toFixed(3)})`);
      grad.addColorStop(0.5, `rgba(130,120,255,${(0.12 * baseAlpha * intensity).toFixed(3)})`);
      grad.addColorStop(1, `rgba(80,60,200,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, TAU);
      ctx.fill();

      // Inner core glow — bright arcane center
      const innerR = 0.15 + pulse2 * 0.08 * intensity;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
      coreGrad.addColorStop(0, `rgba(220,240,255,${(0.35 * baseAlpha * intensity).toFixed(3)})`);
      coreGrad.addColorStop(0.6, `rgba(140,180,255,${(0.18 * baseAlpha * intensity).toFixed(3)})`);
      coreGrad.addColorStop(1, `rgba(100,100,220,0)`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, TAU);
      ctx.fill();

      // Rotating sigil arcs — 3 arcs orbiting the caster
      const arcCount = 3;
      const arcRadius = 0.35 + pulse * 0.06;
      ctx.lineWidth = 0.03;
      ctx.lineCap = "round";
      for (let i = 0; i < arcCount; i++) {
        const baseAngle = now * 2.5 + (TAU / arcCount) * i + Number(ch.phase || 0);
        const arcLen = 0.6 + pulse * 0.3;
        ctx.strokeStyle = `rgba(160,200,255,${(0.35 * baseAlpha * intensity + 0.15 * pulse).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, arcRadius, baseAngle, baseAngle + arcLen);
        ctx.stroke();
      }

      // Tick flash — bright burst when mana is restored
      if (ch.tickFlash > 0) {
        const tf = Math.min(1, Number(ch.tickFlash) / 0.12);
        const flashR = 0.25 + tf * 0.20;
        const flashGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
        flashGrad.addColorStop(0, `rgba(200,230,255,${(0.40 * tf).toFixed(3)})`);
        flashGrad.addColorStop(0.5, `rgba(120,180,255,${(0.22 * tf).toFixed(3)})`);
        flashGrad.addColorStop(1, `rgba(80,80,200,0)`);
        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, flashR, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFishing(ctx) {
    if (!_fishingChannels.size) return;
    const TAU = Math.PI * 2;
    const fxTime = Number(getFxTime?.() || 0);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [actorId, ch] of _fishingChannels) {
      const actorPos = typeof getPosition === "function" ? getPosition(actorId) : null;
      const alphaBase = ch.fading
        ? Math.max(0, Math.min(1, Number(ch.fadeLeft || 0) / Math.max(0.001, Number(ch.fadeMax || 1))))
        : 1;
      const bob = Math.sin(fxTime * 5.2 + Number(ch.phase || 0)) * 0.045;
      const bx = Number(ch.x);
      const by = Number(ch.y) - 0.08 + bob;
      if (actorPos) {
        const ax = Number(actorPos.x);
        const ay = Number(actorPos.y);
        ctx.strokeStyle = `rgba(220,245,255,${(0.72 * alphaBase).toFixed(3)})`;
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5 - 0.22;
        ctx.quadraticCurveTo(mx, my, bx, by);
        ctx.stroke();
      }

      const pulse = 0.5 + 0.5 * Math.sin(fxTime * 6.4 + Number(ch.phase || 0));
      ctx.strokeStyle = `rgba(90,220,255,${(0.58 * alphaBase).toFixed(3)})`;
      ctx.lineWidth = 0.055;
      ctx.beginPath();
      ctx.ellipse(bx, by + 0.03, 0.32 + pulse * 0.07, 0.13 + pulse * 0.03, 0, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = `rgba(245,70,62,${(0.92 * alphaBase).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(bx, by, 0.14, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(250,250,235,${(0.94 * alphaBase).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(bx, by, 0.14, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = `rgba(30,60,75,${(0.72 * alphaBase).toFixed(3)})`;
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.arc(bx, by, 0.142, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Draw: Blink ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawBlink(ctx) {
    if (!_blinkFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();

    for (const eff of _blinkFx) {
      const alpha = eff.alpha;
      const t = eff.progress;
      const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 15.0 + eff.phase);

      const dx = eff.to.x - eff.from.x;
      const dy = eff.to.y - eff.from.y;
      const dist = Math.hypot(dx, dy);
      const segments = Math.max(7, Math.min(18, Math.round(dist * 2.0)));
      const amp = (0.04 + pulse * 0.10) * alpha;
      const arc = jitterLine(eff.from, eff.to, segments, amp);

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(130,220,255,${(0.22 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.18;
      pathPolyline(ctx, arc);
      ctx.stroke();

      ctx.strokeStyle = `rgba(210,245,255,${(0.80 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.045;
      pathPolyline(ctx, jitterLine(eff.from, eff.to, segments + 2, amp * 0.55));
      ctx.stroke();

      const sparkEvery = Math.max(1, Math.floor(arc.length / 6));
      for (let i = 1; i < arc.length - 1; i += sparkEvery) {
        const p = arc[i];
        if (!p) continue;
        const size = 0.03 + pulse * 0.03;
        ctx.fillStyle = `rgba(215,250,255,${(0.55 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.fill();
      }

      const fromR = 0.20 + t * 0.85 + pulse * 0.05;
      const toR = 0.24 + t * 1.05 + pulse * 0.06;
      const flare = eff.randomized ? 1.2 : 1.0;

      ctx.strokeStyle = `rgba(150,220,255,${(0.65 * alpha * flare).toFixed(3)})`;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.arc(eff.from.x, eff.from.y, fromR, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(eff.to.x, eff.to.y, toR, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = `rgba(230,250,255,${(0.20 * alpha * flare).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(eff.from.x, eff.from.y, Math.max(0.05, fromR * 0.42), 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(eff.to.x, eff.to.y, Math.max(0.05, toR * 0.40), 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  // --- Draw: Meteor ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawMeteor(ctx) {
    if (!_meteorFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of _meteorFx) {
      const t = m.progress; // 0→1 over lifetime
      // Phase 1: bright white impact flash
      if (t < 0.15) {
        const flashT = t / 0.15;
        const flashR = 0.3 + flashT * (m.radius + 0.5);
        const flashA = 0.7 * (1 - flashT);
        ctx.fillStyle = `rgba(255,255,220,${flashA})`;
        ctx.beginPath(); ctx.arc(m.x, m.y, flashR, 0, Math.PI * 2); ctx.fill();
      }
      // Phase 2: orange-red glow fading out
      const glowA = 0.35 * (1 - t);
      const glowR = m.radius * 0.8 + t * 0.5;
      ctx.fillStyle = `rgba(255,120,40,${glowA})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, glowR, 0, Math.PI * 2); ctx.fill();
      // Inner hot core
      const coreA = 0.25 * (1 - t * t);
      ctx.fillStyle = `rgba(255,200,100,${coreA})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, glowR * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // --- Draw: Blastwave ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawBlastwave(ctx) {
    if (!_blastwaveFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bw of _blastwaveFx) {
      const t = bw.progress; // 0→1
      // Expanding ring
      const ringR = t * (bw.radius + 0.5);
      const ringA = 0.8 * (1 - t * 0.55);
      ctx.strokeStyle = `rgba(215,235,255,${ringA})`;
      ctx.lineWidth = Math.max(0.12, 0.32 * (1 - t * 0.68));
      ctx.beginPath(); ctx.arc(bw.x, bw.y, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(140,190,255,${(ringA * 0.65).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.06, 0.14 * (1 - t * 0.55));
      ctx.beginPath(); ctx.arc(bw.x, bw.y, Math.max(0, ringR - 0.28), 0, Math.PI * 2); ctx.stroke();
      // Inner filled disc (fades fast)
      if (t < 0.55) {
        const discA = 0.26 * (1 - t / 0.55);
        ctx.fillStyle = `rgba(220,240,255,${discA})`;
        ctx.beginPath(); ctx.arc(bw.x, bw.y, ringR * 0.68, 0, Math.PI * 2); ctx.fill();
      }
      // Bright center flash
      if (t < 0.16) {
        const cFlashA = 0.7 * (1 - t / 0.16);
        ctx.fillStyle = `rgba(255,255,255,${cFlashA})`;
        ctx.beginPath(); ctx.arc(bw.x, bw.y, 0.45, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // --- Draw: Frost Nova ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawFrostNova(ctx) {
    if (!_frostNovaFx.length && !_frostNovaRemnants.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const rem of _frostNovaRemnants) {
      const life = rem.max > 0 ? Math.max(0, Math.min(1, rem.ttl / rem.max)) : 0;
      const pulse = 0.85 + 0.15 * Math.sin(Number(getFxTime?.() || 0) * 6 + rem.phase);
      ctx.fillStyle = `rgba(110,205,255,${(0.12 * life * pulse).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(rem.x, rem.y, rem.radius * (0.85 + (1 - life) * 0.18), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(210,245,255,${(0.20 * life).toFixed(3)})`;
      ctx.lineWidth = 0.05 + 0.08 * life;
      ctx.beginPath(); ctx.arc(rem.x, rem.y, rem.radius * (0.62 + (1 - life) * 0.2), 0, Math.PI * 2); ctx.stroke();
    }
    for (const nova of _frostNovaFx) {
      const t = nova.progress;
      const ringR = t * (nova.radius + 0.7);
      const ringA = 0.88 * (1 - t * 0.50);
      ctx.strokeStyle = `rgba(220,250,255,${ringA})`;
      ctx.lineWidth = Math.max(0.10, 0.30 * (1 - t * 0.62));
      ctx.beginPath(); ctx.arc(nova.x, nova.y, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(90,190,255,${(ringA * 0.72).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.06, 0.16 * (1 - t * 0.55));
      ctx.beginPath(); ctx.arc(nova.x, nova.y, Math.max(0, ringR - 0.24), 0, Math.PI * 2); ctx.stroke();
      if (t < 0.62) {
        ctx.fillStyle = `rgba(140,220,255,${(0.22 * (1 - t / 0.62)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(nova.x, nova.y, ringR * 0.72, 0, Math.PI * 2); ctx.fill();
      }
      if (t < 0.20) {
        ctx.fillStyle = `rgba(255,255,255,${(0.72 * (1 - t / 0.20)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(nova.x, nova.y, 0.50, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawVoidHole(ctx) {
    if (!_voidHoleFx.length) return;
    const time = Number(getFxTime?.() || 0);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (const well of _voidHoleFx) {
      const t = Math.max(0, Math.min(1, well.progress));
      const alpha = well.alpha;
      const strength = Math.max(0.1, Number(well.strength || 1));
      const collapse = well.collapsing ? 1 : 0;
      const r = Math.max(0.8, well.radius * (0.62 + t * 0.38));
      ctx.fillStyle = `rgba(2,0,8,${Math.min(0.88, (0.34 + collapse * 0.18) * alpha * strength).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(well.x, well.y, Math.max(0.35, r * (0.50 + collapse * 0.20)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const well of _voidHoleFx) {
      const t = Math.max(0, Math.min(1, well.progress));
      const alpha = well.alpha;
      const strength = Math.max(0.1, Number(well.strength || 1));
      const collapse = well.collapsing ? 1 : 0;
      const drift = 0.96 + 0.04 * Math.sin(time * 2.1 + well.phase);
      const r = Math.max(0.8, well.radius * (0.58 + t * 0.42 + collapse * 0.10));
      const flash = Math.max(0, Number(well.collapseFlash || 0));

      ctx.strokeStyle = `rgba(190,112,255,${Math.min(0.92, (0.34 + flash * 0.30) * alpha * strength).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.08, (0.16 + flash * 0.10) * alpha * strength);
      ctx.beginPath();
      ctx.arc(well.x, well.y, r * drift, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(92,24,156,${Math.min(0.78, 0.42 * alpha * strength).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.05, 0.12 * alpha * strength);
      ctx.beginPath();
      ctx.arc(well.x, well.y, Math.max(0.18, r * 0.58), 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(24,0,54,${Math.min(0.72, 0.32 * alpha * strength).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(well.x, well.y, Math.max(0.24, r * 0.42), 0, Math.PI * 2);
      ctx.fill();

      if (flash > 0) {
        ctx.fillStyle = `rgba(220,170,255,${Math.min(0.82, 0.46 * flash * alpha * strength).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(well.x, well.y, well.radius * (0.38 + (1 - flash) * 0.92), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // --- Draw: Flash Heal ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawFlashHeal(ctx) {
    if (!_flashHealFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();
    for (const eff of _flashHealFx) {
      const t = eff.progress;
      const alpha = eff.alpha;
      const pulse = 0.55 + 0.45 * Math.sin(_fxTime * 13.0 + eff.x * 0.7 + eff.y * 0.4);
      const maxR = Number.isFinite(eff.radius) ? Math.max(0.9, eff.radius) : 1.4;

      if (t < 0.22) {
        const ft = t / 0.22;
        const flashR = 0.20 + ft * (maxR * 0.75);
        const flashA = 0.85 * (1 - ft) * alpha;
        ctx.fillStyle = `rgba(255,255,235,${flashA.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(eff.x, eff.y, flashR, 0, TAU);
        ctx.fill();
      }

      const ringR = 0.20 + t * maxR;
      ctx.strokeStyle = `rgba(255,245,190,${(0.85 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.12 * (1 - t * 0.55);
      ctx.beginPath();
      ctx.arc(eff.x, eff.y, ringR, 0, TAU);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255,255,230,${(0.62 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.065;
      ctx.beginPath();
      ctx.arc(eff.x, eff.y, ringR * (1.35 + pulse * 0.12), 0, TAU);
      ctx.stroke();

      const glowR = 0.20 + t * (maxR * 0.55) + pulse * 0.06;
      ctx.fillStyle = `rgba(255,240,170,${(0.32 * alpha).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(eff.x, eff.y, glowR, 0, TAU);
      ctx.fill();

      const spokeA = 0.42 * (1 - t) * alpha;
      if (spokeA > 0.02) {
        ctx.strokeStyle = `rgba(255,250,210,${spokeA.toFixed(3)})`;
        ctx.lineWidth = 0.04;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + pulse * 0.08;
          const len = ringR * (0.55 + 0.25 * pulse);
          ctx.beginPath();
          ctx.moveTo(eff.x, eff.y);
          ctx.lineTo(eff.x + Math.cos(a) * len, eff.y + Math.sin(a) * len);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // --- Draw: Phase Strike ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawPhaseStrike(ctx) {
    if (!_phaseStrikeFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();

    for (const eff of _phaseStrikeFx) {
      const alpha = eff.alpha;
      const t = eff.progress;
      const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 18.0 + eff.phase);

      const dx = eff.to.x - eff.from.x;
      const dy = eff.to.y - eff.from.y;
      const dist = Math.hypot(dx, dy);
      const segments = Math.max(7, Math.min(18, Math.round(dist * 2.0)));
      const amp = (0.06 + pulse * 0.12) * alpha;
      const arc = jitterLine(eff.from, eff.to, segments, amp);

      // Outer violet glow trail
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(180,100,255,${(0.28 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.22;
      pathPolyline(ctx, arc);
      ctx.stroke();

      // Inner bright violet-white core
      ctx.strokeStyle = `rgba(230,180,255,${(0.85 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.05;
      pathPolyline(ctx, jitterLine(eff.from, eff.to, segments + 2, amp * 0.5));
      ctx.stroke();

      // Sparks along the arc
      const sparkEvery = Math.max(1, Math.floor(arc.length / 6));
      for (let i = 1; i < arc.length - 1; i += sparkEvery) {
        const p = arc[i];
        if (!p) continue;
        const size = 0.035 + pulse * 0.035;
        ctx.fillStyle = `rgba(220,170,255,${(0.6 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.fill();
      }

      // Portal rings at origin and destination (purple)
      const fromR = 0.20 + t * 0.85 + pulse * 0.05;
      const toR = 0.24 + t * 1.05 + pulse * 0.06;

      ctx.strokeStyle = `rgba(160,80,255,${(0.65 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.arc(eff.from.x, eff.from.y, fromR, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(eff.to.x, eff.to.y, toR, 0, TAU);
      ctx.stroke();

      // Inner portal disc fill
      ctx.fillStyle = `rgba(200,140,255,${(0.20 * alpha).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(eff.from.x, eff.from.y, Math.max(0.05, fromR * 0.42), 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(eff.to.x, eff.to.y, Math.max(0.05, toR * 0.40), 0, TAU);
      ctx.fill();

      // Impact flashes at each hit enemy position
      for (const h of eff.hits) {
        const flashR = 0.15 + t * 0.55 + pulse * 0.08;
        const flashA = 0.7 * alpha;
        // Bright violet-white flash
        ctx.fillStyle = `rgba(240,200,255,${(flashA * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(h.x, h.y, flashR * 0.5, 0, TAU);
        ctx.fill();
        // Expanding impact ring
        ctx.strokeStyle = `rgba(200,100,255,${(flashA * 0.6).toFixed(3)})`;
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.arc(h.x, h.y, flashR, 0, TAU);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // --- Draw: Smite ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawSmite(ctx) {
    if (!_smiteFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    for (const eff of _smiteFx) {
      const t = eff.progress; // 0→1
      const alpha = eff.alpha;
      // Vertical beam (descends from above, narrows as it fades)
      const beamH = 3.5;
      const beamTopY = eff.y - beamH;
      const beamW = Math.max(0.02, 0.28 * (1 - t * 0.7));
      const beamA = 0.75 * alpha;
      const grad = ctx.createLinearGradient(eff.x, beamTopY, eff.x, eff.y);
      grad.addColorStop(0, `rgba(255,255,220,0)`);
      grad.addColorStop(0.4, `rgba(255,230,140,${(beamA * 0.5).toFixed(3)})`);
      grad.addColorStop(1, `rgba(255,220,80,${beamA.toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(eff.x - beamW, beamTopY, beamW * 2, beamH);
      // Outer beam glow (wider, softer)
      const outerW = beamW * 3;
      const outerGrad = ctx.createLinearGradient(eff.x, beamTopY, eff.x, eff.y);
      outerGrad.addColorStop(0, `rgba(255,240,180,0)`);
      outerGrad.addColorStop(0.5, `rgba(255,220,120,${(beamA * 0.15).toFixed(3)})`);
      outerGrad.addColorStop(1, `rgba(255,200,60,${(beamA * 0.3).toFixed(3)})`);
      ctx.fillStyle = outerGrad;
      ctx.fillRect(eff.x - outerW, beamTopY, outerW * 2, beamH);
      // Impact flash (bright white-gold at target)
      if (t < 0.25) {
        const flashT = t / 0.25;
        const flashR = 0.15 + flashT * 0.65;
        const flashA = 0.85 * (1 - flashT);
        ctx.fillStyle = `rgba(255,255,230,${flashA.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(eff.x, eff.y, flashR, 0, TAU); ctx.fill();
      }
      // Expanding golden ring
      const ringR = 0.1 + t * 1.2;
      ctx.strokeStyle = `rgba(255,220,80,${(0.7 * alpha).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.04, 0.16 * (1 - t * 0.6));
      ctx.beginPath(); ctx.arc(eff.x, eff.y, ringR, 0, TAU); ctx.stroke();
      // Inner golden glow disc
      const glowR = 0.15 + t * 0.5;
      ctx.fillStyle = `rgba(255,210,80,${(0.25 * alpha).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(eff.x, eff.y, glowR, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // --- Draw: Rampage ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawRampage(ctx) {
    if (!_rampageFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();
    for (const eff of _rampageFx) {
      const t = eff.progress;
      const alpha = eff.alpha;
      // Inner blood-red flash
      if (t < 0.3) {
        const ft = t / 0.3;
        const flashR = 0.2 + ft * 1.0;
        const flashA = 0.8 * (1 - ft) * alpha;
        ctx.fillStyle = `rgba(255,40,20,${flashA.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(eff.x, eff.y, flashR, 0, TAU); ctx.fill();
      }
      // Expanding rage ring
      const ringR = 0.15 + t * 1.6;
      ctx.strokeStyle = `rgba(255,80,20,${(0.7 * alpha).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.04, 0.2 * (1 - t * 0.6));
      ctx.beginPath(); ctx.arc(eff.x, eff.y, ringR, 0, TAU); ctx.stroke();
      // Outer pulsing orange glow
      const pulse = 0.6 + 0.4 * Math.sin(_fxTime * 16 + eff.x * 0.5);
      const glowR = 0.3 + t * 0.8;
      ctx.fillStyle = `rgba(255,100,20,${(0.2 * alpha * pulse).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(eff.x, eff.y, glowR, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // --- Draw: Cleave (arc sweep) ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawCleave(ctx) {
    if (!_cleaveFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const _fxTime = getFxTime();
    for (const eff of _cleaveFx) {
      const t = eff.progress;
      const alpha = eff.alpha;
      const [cr, cg, cb] = eff.color || [255, 220, 200];

      // Animated sweep: arc grows from startAngle through sweepAngle over lifetime
      const sweepProgress = Math.min(1, t * 2.5); // complete sweep in first 40% of lifetime
      const currentSweep = eff.sweepAngle * sweepProgress;
      const R = eff.radius * (0.6 + t * 0.4);

      // Outer glow arc
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.35 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.28 + 0.12 * (1 - t);
      ctx.beginPath();
      ctx.arc(eff.x, eff.y, R + 0.15, eff.startAngle, eff.startAngle + currentSweep);
      ctx.stroke();

      // Bright inner arc (the slash)
      ctx.strokeStyle = `rgba(255,250,240,${(0.8 * alpha * (1 - t * 0.4)).toFixed(3)})`;
      ctx.lineWidth = 0.14 + 0.08 * (1 - t);
      ctx.beginPath();
      ctx.arc(eff.x, eff.y, R, eff.startAngle, eff.startAngle + currentSweep);
      ctx.stroke();

      // Leading edge spark
      if (sweepProgress < 1) {
        const edgeAngle = eff.startAngle + currentSweep;
        const ex = eff.x + Math.cos(edgeAngle) * R;
        const ey = eff.y + Math.sin(edgeAngle) * R;
        const pulse = 0.6 + 0.4 * Math.sin(_fxTime * 22 + eff.startAngle);
        ctx.fillStyle = `rgba(255,255,255,${(0.7 * alpha * pulse).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(ex, ey, 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // --- Draw: War Cry (shockwave ring) ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawWarCry(ctx) {
    if (!_warCryFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();
    for (const eff of _warCryFx) {
      const t = eff.progress;
      const alpha = eff.alpha;
      const maxR = eff.radius + 0.5;

      // Inner red flash (brief)
      if (t < 0.2) {
        const ft = t / 0.2;
        const flashA = 0.6 * (1 - ft) * alpha;
        ctx.fillStyle = `rgba(255,60,20,${flashA.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(eff.x, eff.y, 0.3 + ft * 0.5, 0, TAU); ctx.fill();
      }

      // Expanding shockwave ring (red-orange)
      const ringR = t * maxR;
      const ringW = Math.max(0.04, 0.22 * (1 - t * 0.6));
      ctx.strokeStyle = `rgba(255,80,30,${(0.7 * alpha).toFixed(3)})`;
      ctx.lineWidth = ringW;
      ctx.beginPath(); ctx.arc(eff.x, eff.y, ringR, 0, TAU); ctx.stroke();

      // Secondary thinner ring (slightly behind)
      const ring2R = Math.max(0, ringR - 0.35);
      if (ring2R > 0) {
        ctx.strokeStyle = `rgba(255,140,50,${(0.4 * alpha).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.02, ringW * 0.5);
        ctx.beginPath(); ctx.arc(eff.x, eff.y, ring2R, 0, TAU); ctx.stroke();
      }

      // Pulsing center glow
      const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 14 + eff.x);
      const glowA = 0.15 * alpha * pulse * (1 - t);
      ctx.fillStyle = `rgba(255,100,30,${glowA.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(eff.x, eff.y, 0.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // --- Draw: Divine Shield (golden dome) ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawDivineShield(ctx) {
    if (!_divineShieldFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();
    for (const eff of _divineShieldFx) {
      const t = eff.progress;
      const alpha = eff.alpha;

      // Expanding golden dome ring
      const ringR = 0.3 + t * 1.0;
      const pulse = 0.6 + 0.4 * Math.sin(_fxTime * 10 + eff.y * 0.6);
      ctx.strokeStyle = `rgba(255,220,80,${(0.7 * alpha * pulse).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.06, 0.18 * (1 - t * 0.5));
      ctx.beginPath(); ctx.arc(eff.x, eff.y, ringR, 0, TAU); ctx.stroke();

      // Inner golden glow disc
      const discA = 0.25 * alpha * (1 - t * 0.6);
      ctx.fillStyle = `rgba(255,240,150,${discA.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(eff.x, eff.y, ringR * 0.6, 0, TAU); ctx.fill();

      // White center flash (brief)
      if (t < 0.15) {
        const ft = t / 0.15;
        ctx.fillStyle = `rgba(255,255,230,${(0.8 * (1 - ft)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(eff.x, eff.y, 0.35 * (1 - ft * 0.3), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // --- Draw: Consecrate (holy ground glow) ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawConsecrate(ctx) {
    if (!_consecrateFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();
    for (const eff of _consecrateFx) {
      const t = eff.progress;
      const alpha = eff.alpha;
      const R = eff.radius + 0.3;
      const pulse = 0.55 + 0.45 * Math.sin(_fxTime * 6 + eff.x * 0.4);

      // Ground glow disc (sustained, golden)
      const discA = 0.18 * alpha * pulse;
      ctx.fillStyle = `rgba(255,210,60,${discA.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(eff.x, eff.y, R, 0, TAU); ctx.fill();

      // Ring border
      ctx.strokeStyle = `rgba(255,220,80,${(0.4 * alpha).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.03, 0.08 * (1 - t * 0.3));
      ctx.beginPath(); ctx.arc(eff.x, eff.y, R, 0, TAU); ctx.stroke();

      // Cross pattern on ground (holy symbol)
      const crossA = 0.12 * alpha * pulse;
      ctx.strokeStyle = `rgba(255,240,180,${crossA.toFixed(3)})`;
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(eff.x - R * 0.6, eff.y); ctx.lineTo(eff.x + R * 0.6, eff.y);
      ctx.moveTo(eff.x, eff.y - R * 0.6); ctx.lineTo(eff.x, eff.y + R * 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Draw: Smoke Bomb (expanding gray cloud) ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawSmokeBomb(ctx) {
    if (!_smokeBombFx.length) return;
    ctx.save();
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();
    for (const eff of _smokeBombFx) {
      const t = eff.progress;
      const alpha = eff.alpha;
      const maxR = eff.radius + 0.5;

      // Expanding translucent smoke disc (normal composite for opacity)
      ctx.globalCompositeOperation = 'source-over';
      const discR = (0.3 + t * 0.7) * maxR;
      const discA = Math.min(0.35, 0.35 * alpha * (1 - t * 0.3));
      ctx.fillStyle = `rgba(80,80,90,${discA.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(eff.x, eff.y, discR, 0, TAU); ctx.fill();

      // Swirling ring (lighter for glow)
      ctx.globalCompositeOperation = 'lighter';
      const ringR = t * maxR;
      const swirl = _fxTime * 4 + eff.x;
      ctx.strokeStyle = `rgba(140,140,150,${(0.3 * alpha).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.04, 0.16 * (1 - t * 0.5));
      ctx.beginPath(); ctx.arc(eff.x, eff.y, ringR, swirl, swirl + Math.PI * 1.2); ctx.stroke();

      // Wispy inner detail
      const wispA = 0.15 * alpha * (1 - t);
      ctx.strokeStyle = `rgba(180,180,190,${wispA.toFixed(3)})`;
      ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.arc(eff.x, eff.y, ringR * 0.5, swirl + Math.PI, swirl + Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // --- Draw: Search Pulse ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawSearchPulse(ctx) {
    if (!_searchPulseFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    for (const eff of _searchPulseFx) {
      const t = eff.progress; // 0→1
      const alpha = eff.alpha;
      // Thin off-white expanding ring: grows from origin to full radius
      const ringR = t * eff.radius;
      const ringA = 0.55 * alpha;          // peak opacity ≈0.55, fades with alpha
      ctx.strokeStyle = `rgba(230,245,255,${ringA.toFixed(3)})`;
      ctx.lineWidth = Math.max(0.02, 0.035 * (1 - t * 0.7)); // starts thin, narrows as it expands
      ctx.beginPath(); ctx.arc(eff.x, eff.y, ringR, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawDrainLife(ctx) {
    if (!_drainLifeChannels.size || typeof getPosition !== "function") return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const now = getFxTime();
    const TAU = Math.PI * 2;
    for (const [actorId, channel] of _drainLifeChannels) {
      const from = getPosition(actorId);
      const to = getPosition(channel.targetId);
      if (!from || !to) continue;
      const dx = Number(to.x) - Number(from.x);
      const dy = Number(to.y) - Number(from.y);
      const dist = Math.hypot(dx, dy);
      if (dist <= 0.05) continue;

      const baseAlpha = channel.fading
        ? 0.65 * (Number(channel.fadeLeft || 0) / Math.max(0.001, Number(channel.fadeMax || 1)))
        : 0.75;
      const pulse = 0.55 + 0.45 * Math.sin(now * 16 + Number(channel.phase || 0));
      const segments = Math.max(6, Math.min(20, Math.round(dist * 2.2)));
      const amp = 0.015 + pulse * 0.05;
      const arcA = jitterLine(from, to, segments, amp);
      const arcB = jitterLine(from, to, segments + 2, amp * 0.6);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.strokeStyle = `rgba(105,20,35,${(0.32 * baseAlpha).toFixed(3)})`;
      ctx.lineWidth = 0.28;
      pathPolyline(ctx, arcA);
      ctx.stroke();

      ctx.strokeStyle = `rgba(210,45,65,${(0.48 * baseAlpha + 0.20 * pulse).toFixed(3)})`;
      ctx.lineWidth = 0.12;
      pathPolyline(ctx, arcB);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255,170,190,${(0.35 * baseAlpha + 0.20 * pulse).toFixed(3)})`;
      ctx.lineWidth = 0.05;
      pathPolyline(ctx, jitterLine(from, to, segments + 4, amp * 0.35));
      ctx.stroke();

      if (channel.tickFlash > 0) {
        const tf = Math.min(1, Number(channel.tickFlash) / 0.10);
        ctx.fillStyle = `rgba(255,90,120,${(0.30 * tf).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(Number(to.x), Number(to.y), 0.20 + tf * 0.22, 0, TAU);
        ctx.fill();
      }

      if (channel.endFlash > 0) {
        const ef = Math.min(1, Number(channel.endFlash) / 0.24);
        ctx.fillStyle = `rgba(190,40,70,${(0.28 * ef).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(Number(to.x), Number(to.y), 0.30 + ef * 0.36, 0, TAU);
        ctx.fill();
      }

      const casterGlow = 0.14 + pulse * 0.10;
      ctx.fillStyle = `rgba(220,70,100,${(0.16 * baseAlpha + 0.10 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(Number(from.x), Number(from.y), casterGlow, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- Listeners ---
  function installListeners() {
    world.on('spell:blink', ({ from, to, randomized }) => {
      if (!from || !to) return;
      if (!Number.isFinite(from.x) || !Number.isFinite(from.y)) return;
      if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) return;

      const src = { x: from.x, y: from.y };
      const dst = { x: to.x, y: to.y };
      _blinkFx.push(new BlinkFx({
        from: src,
        to: dst,
        ttl: 0.26,
        phase: Math.random() * Math.PI * 2,
        randomized: !!randomized,
      }));

      const intensity = randomized ? 1.15 : 1.0;
      spawnBlinkBurst(src.x, src.y, intensity);
      spawnBlinkBurst(dst.x, dst.y, intensity);

      const dx = dst.x - src.x;
      const dy = dst.y - src.y;
      const dist = Math.hypot(dx, dy);
      const sparkleCount = Math.max(6, Math.min(22, Math.round(dist * 1.8)));
      const sparkScale = PERF.quality === 'low' ? 0.6 : 1.0;
      const sparkleCountScaled = Math.max(4, Math.round(sparkleCount * sparkScale));
      for (let i = 0; i < sparkleCountScaled; i++) {
        const t = (i + Math.random()) / Math.max(1, sparkleCountScaled);
        const x = src.x + dx * t + (Math.random() - 0.5) * 0.18;
        const y = src.y + dy * t + (Math.random() - 0.5) * 0.18;
        fx.pool.spawn(new Particle({
          x,
          y,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          ay: 0.04,
          life: 0.10 + Math.random() * 0.20,
          size0: 0.05 + Math.random() * 0.04,
          size1: 0.01,
          r: 190 + ((Math.random() * 40) | 0),
          g: 235 + ((Math.random() * 20) | 0),
          b: 255,
          a0: 0.7,
        }));
      }

      startShake(cam, randomized ? 4 : 3, randomized ? 0.14 : 0.12);
    });

    world.on('spell:meteor', ({ actor, from, origin, radius, depth }) => {
      if (origin && Number.isFinite(origin.x)) {
        const reliefKey = depth ?? (typeof getActiveReliefKey === "function" ? getActiveReliefKey() : null);
        carveMeteorCrater(origin, radius || 2, reliefKey);
        const r = Math.max(1.2, Number(radius || 2));
        stampWarmSpot(origin, 0.90, 1.20, 26, [255, 132, 52], reliefKey);
        stampWarmSpot(origin, r * 0.96, 0.70, 19, [242, 112, 38], reliefKey);
        for (let k = 0; k < 7; k++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 0.16 + Math.random() * 0.30;
          const life = 0.28 + Math.random() * 0.36;
          _impactFlameLights.push({
            x: Number(origin.x) + 0.5 + (Math.random() - 0.5) * 0.25,
            y: Number(origin.y) + 0.5 + (Math.random() - 0.5) * 0.25,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - (0.14 + Math.random() * 0.20),
            ay: 0.72,
            ttl: life,
            max: life,
            radius: 0.26 + Math.random() * 0.16,
            phase: Math.random() * Math.PI * 2,
          });
        }
        spawnMeteorProjectile(origin);
        _meteorFx.push(new RadialFx({ x: origin.x, y: origin.y, radius: radius || 2, ttl: 0.45 }));
        startSlamShake(cam, 14, 0.55);
        // Fire particle burst
        const N = 30;
        for (let i = 0; i < N; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = 1.0 + Math.random() * 2.5;
          const life = 0.3 + Math.random() * 0.4;
          fx.pool.spawn(new Particle({
            x: origin.x + (Math.random() - 0.5) * 0.4,
            y: origin.y + (Math.random() - 0.5) * 0.4,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            ay: 0.8,
            life,
            size0: 0.25 + Math.random() * 0.15,
            size1: 0.04,
            r: 255, g: 140 + Math.random() * 80 | 0, b: 30,
            a0: 0.95,
          }));
        }
      }
    });

    world.on('spell:blizzard', ({ impacts }) => {
      if (!Array.isArray(impacts) || impacts.length <= 0) return;
      const volleySway = (Math.random() - 0.5) * 2 * STORM_VOLLEY_SWAY_MAX_RAD;
      for (let i = 0; i < impacts.length; i++) {
        const impact = impacts[i];
        if (!impact || !Number.isFinite(impact.x) || !Number.isFinite(impact.y)) continue;
        spawnStormProjectile(impact, 'frostbolt', (i % 3) - 1, volleySway);
        _blastwaveFx.push(new RadialFx({
          x: Number(impact.x),
          y: Number(impact.y),
          radius: stormImpactRadius(impact.radius),
          ttl: 0.14,
        }));
        for (let j = 0; j < 5; j++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = 0.18 + Math.random() * 0.45;
          fx.pool.spawn(new Particle({
            x: Number(impact.x) + (Math.random() - 0.5) * 0.18,
            y: Number(impact.y) + (Math.random() - 0.5) * 0.12,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd - 0.05,
            ay: 0.18,
            life: 0.12 + Math.random() * 0.08,
            size0: 0.04 + Math.random() * 0.025,
            size1: 0.02,
            r: 190,
            g: 225 + ((Math.random() * 20) | 0),
            b: 255,
            a0: 0.82,
          }));
        }
      }
      startShake(cam, 2, 0.08);
    });

    world.on('spell:firestorm', ({ impacts, depth }) => {
      if (!Array.isArray(impacts) || impacts.length <= 0) return;
      const reliefKey = depth ?? (typeof getActiveReliefKey === "function" ? getActiveReliefKey() : null);
      const volleySway = (Math.random() - 0.5) * 2 * STORM_VOLLEY_SWAY_MAX_RAD;
      for (let i = 0; i < impacts.length; i++) {
        const impact = impacts[i];
        if (!impact || !Number.isFinite(impact.x) || !Number.isFinite(impact.y)) continue;
        carveStormPockmark(impact, reliefKey, i + impacts.length * 31);
        stampWarmSpot(
          impact,
          0.74 + Math.random() * 0.20,
          0.78 + Math.random() * 0.22,
          12 + ((Math.random() * 6) | 0),
          [242, 106, 36],
          reliefKey,
        );
        const smallCount = 2 + ((Math.random() * 2) | 0);
        for (let k = 0; k < smallCount; k++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 0.08 + Math.random() * 0.22;
          const life = 0.20 + Math.random() * 0.22;
          _impactFlameLights.push({
            x: Number(impact.x) + 0.5 + (Math.random() - 0.5) * 0.16,
            y: Number(impact.y) + 0.5 + (Math.random() - 0.5) * 0.16,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - (0.10 + Math.random() * 0.16),
            ay: 0.70,
            ttl: life,
            max: life,
            radius: 0.17 + Math.random() * 0.11,
            phase: Math.random() * Math.PI * 2,
          });
        }
        spawnStormProjectile(impact, 'fireball', (i % 3) - 1, volleySway);
        _meteorFx.push(new RadialFx({
          x: Number(impact.x),
          y: Number(impact.y),
          radius: stormImpactRadius(impact.radius),
          ttl: 0.16,
        }));
        for (let j = 0; j < 6; j++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = 0.2 + Math.random() * 0.6;
          fx.pool.spawn(new Particle({
            x: Number(impact.x) + (Math.random() - 0.5) * 0.16,
            y: Number(impact.y) + (Math.random() - 0.5) * 0.10,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd - 0.08,
            ay: 0.22,
            life: 0.12 + Math.random() * 0.10,
            size0: 0.05 + Math.random() * 0.03,
            size1: 0.02,
            r: 255,
            g: 110 + ((Math.random() * 80) | 0),
            b: 40,
            a0: 0.88,
          }));
        }
      }
      startShake(cam, 3, 0.1);
    });

    world.on('spell:blastwave', ({ actor, origin, knockbacks, radius }) => {
      if (origin && Number.isFinite(origin.x)) {
        const waveRadius = Math.max(2, Number(radius) || 2);
        const ttl = Math.max(0.45, Math.min(1.6, 0.24 + waveRadius * 0.06));
        _blastwaveFx.push(new RadialFx({ x: origin.x, y: origin.y, radius: waveRadius, ttl }));
        if (waveRadius >= 6) {
          _blastwaveFx.push(new RadialFx({ x: origin.x, y: origin.y, radius: Math.max(2, waveRadius * 0.8), ttl: ttl * 0.86 }));
        }
        if (waveRadius >= 10) {
          _blastwaveFx.push(new RadialFx({ x: origin.x, y: origin.y, radius: Math.max(2, waveRadius * 0.58), ttl: ttl * 0.72 }));
        }
        startShake(cam, Math.min(14, 5 + Math.floor(waveRadius / 2)), Math.min(0.55, 0.18 + waveRadius * 0.015));
        // Radial particle burst
        const N = waveRadius >= 10 ? 40 : (waveRadius >= 6 ? 32 : 24);
        for (let i = 0; i < N; i++) {
          const angle = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
          const spd = 2.0 + Math.random() * Math.max(1.5, waveRadius * 0.2);
          fx.pool.spawn(new Particle({
            x: origin.x, y: origin.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 0.3 + Math.random() * 0.22,
            size0: 0.18 + Math.random() * 0.06, size1: 0.03,
            r: 210, g: 225, b: 255,
            a0: 0.85,
          }));
        }
      }
    });

    world.on(FrostNovaCast, ({ actor, origin, frozen, radius }) => {
      if (!origin || !Number.isFinite(origin.x)) return;
      const waveRadius = Math.max(2, Number(radius) || 2);
      const ttl = Math.max(0.50, Math.min(1.6, 0.26 + waveRadius * 0.07));
      _frostNovaFx.push(new RadialFx({ x: origin.x, y: origin.y, radius: waveRadius, ttl }));
      _frostNovaRemnants.push({
        x: origin.x,
        y: origin.y,
        radius: waveRadius + 0.25,
        ttl: PERF.quality === 'low' ? 0.75 : 1.25,
        max: PERF.quality === 'low' ? 0.75 : 1.25,
        phase: Math.random() * Math.PI * 2,
      });
      startShake(cam, Math.min(8, 3 + Math.floor(waveRadius / 2)), Math.min(0.32, 0.14 + waveRadius * 0.012));

      const shardCount = PERF.quality === 'low' ? 16 : 28;
      for (let i = 0; i < shardCount; i++) {
        const angle = (i / shardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.28;
        const spd = 1.25 + Math.random() * Math.max(1.2, waveRadius * 0.24);
        fx.pool.spawn(new Particle({
          x: origin.x + (Math.random() - 0.5) * 0.16,
          y: origin.y + (Math.random() - 0.5) * 0.16,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 0.34 + Math.random() * 0.24,
          size0: 0.12 + Math.random() * 0.08,
          size1: 0.02,
          r: 150 + ((Math.random() * 65) | 0),
          g: 220 + ((Math.random() * 30) | 0),
          b: 255,
          a0: 0.88,
          rotVel: (Math.random() - 0.5) * 4.0,
        }));
      }

      const hits = Array.isArray(frozen) ? frozen : [];
      const maxHitBursts = PERF.quality === 'low' ? 4 : 10;
      for (let i = 0; i < Math.min(hits.length, maxHitBursts); i++) {
        const hit = hits[i];
        if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) continue;
        for (let j = 0; j < 5; j++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = 0.35 + Math.random() * 0.75;
          fx.pool.spawn(new Particle({
            x: hit.x + (Math.random() - 0.5) * 0.20,
            y: hit.y + (Math.random() - 0.5) * 0.20,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd - 0.06,
            ay: 0.10,
            life: 0.28 + Math.random() * 0.16,
            size0: 0.07 + Math.random() * 0.04,
            size1: 0.01,
            r: 205,
            g: 240,
            b: 255,
            a0: 0.82,
          }));
        }
      }
    });

    world.on(VoidHoleCast, (event) => {
      const { holeId, origin, radius, affected, strength, progress, collapsing } = event;
      if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return;
      const wellStrength = Math.max(0.25, Number(strength || 0.75));
      const isCollapse = !!collapsing;
      let well = _voidHoleFx.find((entry) => entry.holeId === (Number(holeId || 0) | 0));
      if (!well) {
        well = new VoidHoleFx({ holeId, origin, radius, strength: wellStrength, progress, collapsing: isCollapse });
        _voidHoleFx.push(well);
      } else {
        well.update({ origin, radius, strength: wellStrength, progress, collapsing: isCollapse });
      }
      startShake(cam, isCollapse ? 10 : 2.5 + wellStrength * 1.5, isCollapse ? 0.34 : 0.12);

      if (fx?.pool) {
        const count = (isCollapse ? 58 : 16) + Math.min(34, Array.isArray(affected) ? affected.length * (isCollapse ? 6 : 3) : 0);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 0.65 + Math.random() * Math.max(1.4, (Number(radius) || 3) * (isCollapse ? 1.95 : 1.45));
          const speed = (isCollapse ? 2.6 : 0.9 + wellStrength * 0.7) + Math.random() * (isCollapse ? 3.1 : 1.4);
          fx.pool.spawn(new Particle({
            x: Number(origin.x) + Math.cos(angle) * dist,
            y: Number(origin.y) + Math.sin(angle) * dist,
            vx: -Math.cos(angle) * speed,
            vy: -Math.sin(angle) * speed,
            life: (isCollapse ? 0.34 : 0.46) + Math.random() * (isCollapse ? 0.52 : 0.42),
            size0: (isCollapse ? 0.09 : 0.045) + Math.random() * (isCollapse ? 0.13 : 0.065),
            size1: 0.004,
            r: 145 + ((Math.random() * 70) | 0),
            g: 55 + ((Math.random() * 35) | 0),
            b: 225 + ((Math.random() * 30) | 0),
            a0: isCollapse ? 0.98 : 0.70,
            rotVel: (Math.random() - 0.5) * (isCollapse ? 8 : 4),
          }));
        }
      }
    });

    // Frost + Shadow bolt VFX are handled by projectileFx (projectile style).

    world.on('spell:flash_heal', ({ at, amount }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _flashHealFx.push(new RadialFx({ x: at.x, y: at.y, radius: 1.5, ttl: 0.44 }));
      const scale = PERF.quality === 'low' ? 0.7 : (PERF.quality === 'high' ? 1.25 : 1.0);
      const sparkleCount = Math.max(14, Math.round(30 * scale));
      for (let i = 0; i < sparkleCount; i++) {
        const angle = (Math.PI * 2 * i / sparkleCount) + (Math.random() - 0.5) * 0.55;
        const speed = 0.45 + Math.random() * 1.25;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.16,
          y: at.y + (Math.random() - 0.5) * 0.16,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.16,
          ay: 0.18,
          life: 0.28 + Math.random() * 0.40,
          size0: 0.11 + Math.random() * 0.09,
          size1: 0.02,
          r: 250 + ((Math.random() * 5) | 0),
          g: 230 + ((Math.random() * 20) | 0),
          b: 170 + ((Math.random() * 35) | 0),
          a0: 0.92,
          rot: Math.random() * Math.PI * 2,
          rotVel: (Math.random() - 0.5) * 2.4,
        }));
      }
      const shimmerCount = Math.max(5, Math.round(10 * scale));
      for (let i = 0; i < shimmerCount; i++) {
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 1.0,
          y: at.y + (Math.random() - 0.5) * 0.7,
          vx: (Math.random() - 0.5) * 0.25,
          vy: 0.10 + Math.random() * 0.24,
          ay: 0.03,
          life: 0.60 + Math.random() * 0.45,
          size0: 0.06 + Math.random() * 0.05,
          size1: 0.01,
          r: 255,
          g: 245,
          b: 205,
          a0: 0.55,
          rotVel: (Math.random() - 0.5) * 1.8,
        }));
      }
      startShake(cam, Number(amount || 0) > 0 ? 3 : 2, 0.12);
    });

    world.on('spell:smite', ({ actor, targetId, at, amount, missed, fizzle }) => {
      if (fizzle) return;
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _smiteFx.push(new RadialFx({ x: at.x, y: at.y, radius: 1.2, ttl: 0.42 }));
      // Golden radial particle burst
      const scale = PERF.quality === 'low' ? 0.65 : (PERF.quality === 'high' ? 1.25 : 1.0);
      const burstCount = Math.max(10, Math.round(20 * scale));
      for (let i = 0; i < burstCount; i++) {
        const angle = (Math.PI * 2 * i / burstCount) + (Math.random() - 0.5) * 0.5;
        const speed = 0.6 + Math.random() * 1.4;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.14,
          y: at.y + (Math.random() - 0.5) * 0.14,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.3,
          ay: 0.2,
          life: 0.25 + Math.random() * 0.35,
          size0: 0.12 + Math.random() * 0.08,
          size1: 0.02,
          r: 255,
          g: 220 + ((Math.random() * 35) | 0),
          b: 60 + ((Math.random() * 60) | 0),
          a0: 0.92,
          rotVel: (Math.random() - 0.5) * 2.0,
        }));
      }
      // Rising motes (holy sparkles drifting upward)
      const moteCount = Math.max(6, Math.round(12 * scale));
      for (let i = 0; i < moteCount; i++) {
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.8,
          y: at.y + (Math.random() - 0.5) * 0.5,
          vx: (Math.random() - 0.5) * 0.2,
          vy: -(0.15 + Math.random() * 0.35),
          ay: -0.02,
          life: 0.5 + Math.random() * 0.5,
          size0: 0.06 + Math.random() * 0.04,
          size1: 0.01,
          r: 255,
          g: 250,
          b: 200,
          a0: 0.6,
          rotVel: (Math.random() - 0.5) * 1.5,
        }));
      }
      startShake(cam, 4, 0.14);
    });

    world.on('spell:death_volley', ({ origin, impacts, hits }) => {
      const points = Array.isArray(impacts) && impacts.length > 0
        ? impacts
        : (origin ? [origin] : []);
      if (points.length <= 0) return;
      for (let i = 0; i < points.length; i++) {
        const at = points[i];
        if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) continue;
        _smiteFx.push(new RadialFx({ x: Number(at.x), y: Number(at.y), radius: 0.7, ttl: 0.20 }));
        const burst = 10;
        for (let j = 0; j < burst; j++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.45 + Math.random() * 0.85;
          fx.pool.spawn(new Particle({
            x: Number(at.x) + (Math.random() - 0.5) * 0.10,
            y: Number(at.y) + (Math.random() - 0.5) * 0.10,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.1,
            ay: 0.18,
            life: 0.16 + Math.random() * 0.20,
            size0: 0.07 + Math.random() * 0.05,
            size1: 0.02,
            r: 205 + ((Math.random() * 30) | 0),
            g: 220 + ((Math.random() * 20) | 0),
            b: 240 + ((Math.random() * 10) | 0),
            a0: 0.85,
          }));
        }
      }
      if (Array.isArray(hits)) {
        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          if (!hit?.at) continue;
          fx.pool.spawn(new Particle({
            x: Number(hit.at.x),
            y: Number(hit.at.y),
            vx: 0,
            vy: -0.25,
            ay: 0.08,
            life: 0.24,
            size0: 0.14,
            size1: 0.03,
            r: 255,
            g: 180,
            b: 110,
            a0: 0.75,
          }));
        }
      }
      startShake(cam, 3, 0.10);
    });

    world.on('spell:boar_charge', ({ from, to, hit, missed }) => {
      if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return;
      const impactX = Number(to.x);
      const impactY = Number(to.y);
      _blastwaveFx.push(new RadialFx({
        x: impactX,
        y: impactY,
        radius: hit ? 1.15 : 0.85,
        ttl: hit ? 0.26 : 0.18,
      }));

      const burstCount = hit ? 20 : 12;
      for (let i = 0; i < burstCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (hit ? 0.55 : 0.38) + Math.random() * (hit ? 1.05 : 0.7);
        fx.pool.spawn(new Particle({
          x: impactX + (Math.random() - 0.5) * 0.10,
          y: impactY + (Math.random() - 0.5) * 0.10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.08,
          ay: 0.12,
          life: 0.16 + Math.random() * 0.16,
          size0: 0.06 + Math.random() * 0.06,
          size1: 0.02,
          r: 210 + ((Math.random() * 30) | 0),
          g: 150 + ((Math.random() * 35) | 0),
          b: 90 + ((Math.random() * 30) | 0),
          a0: 0.86,
        }));
      }

      if (from && Number.isFinite(from.x) && Number.isFinite(from.y)) {
        const dx = impactX - Number(from.x);
        const dy = impactY - Number(from.y);
        const dist = Math.max(1, Math.hypot(dx, dy));
        const dirX = dx / dist;
        const dirY = dy / dist;
        const streakCount = Math.max(3, Math.floor(dist * 2));
        for (let i = 0; i < streakCount; i++) {
          const t = (i + Math.random() * 0.7) / streakCount;
          const px = Number(from.x) + dx * t;
          const py = Number(from.y) + dy * t;
          fx.pool.spawn(new Particle({
            x: px + (Math.random() - 0.5) * 0.08,
            y: py + (Math.random() - 0.5) * 0.08,
            vx: dirX * (0.25 + Math.random() * 0.3),
            vy: dirY * (0.25 + Math.random() * 0.3),
            ay: 0.04,
            life: 0.08 + Math.random() * 0.08,
            size0: 0.04 + Math.random() * 0.03,
            size1: 0.01,
            r: 230,
            g: 180,
            b: 120,
            a0: 0.6,
          }));
        }
      }

      if (hit) startShake(cam, 5, 0.16);
      else if (missed) startShake(cam, 3, 0.10);
      else startShake(cam, 4, 0.12);
    });

    world.on('spell:boar_bite', ({ at, hit, missed }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _smiteFx.push(new RadialFx({
        x: Number(at.x),
        y: Number(at.y),
        radius: hit ? 0.62 : 0.45,
        ttl: 0.12,
      }));
      const burst = hit ? 10 : 6;
      for (let i = 0; i < burst; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (hit ? 0.24 : 0.16) + Math.random() * 0.35;
        fx.pool.spawn(new Particle({
          x: Number(at.x) + (Math.random() - 0.5) * 0.08,
          y: Number(at.y) + (Math.random() - 0.5) * 0.08,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.02,
          ay: 0.05,
          life: 0.08 + Math.random() * 0.12,
          size0: 0.03 + Math.random() * 0.03,
          size1: 0.01,
          r: 225,
          g: 165 + ((Math.random() * 25) | 0),
          b: 120 + ((Math.random() * 25) | 0),
          a0: 0.8,
        }));
      }
      if (hit) startShake(cam, 2, 0.06);
      else if (missed) startShake(cam, 1, 0.04);
    });

    world.on('spell:wolf_howl', ({ at, ralliedIds }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const count = PERF.quality === 'low' ? 14 : 24;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / 20;
        const speed = 0.28 + Math.random() * 0.55;
        fx.pool.spawn(new Particle({
          x: Number(at.x),
          y: Number(at.y),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.04,
          ay: 0.05,
          life: 0.18 + Math.random() * 0.18,
          size0: 0.05 + Math.random() * 0.04,
          size1: 0.01,
          r: 150,
          g: 245,
          b: 105,
          a0: 0.78,
        }));
      }
      if (Array.isArray(ralliedIds) && ralliedIds.length > 0) startShake(cam, 2, 0.08);
    });

    world.on('spell:shield_bash', ({ at, hit, missed }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _blastwaveFx.push(new RadialFx({
        x: Number(at.x),
        y: Number(at.y),
        radius: hit ? 0.95 : 0.7,
        ttl: hit ? 0.2 : 0.14,
      }));
      const burstCount = hit ? 14 : 9;
      for (let i = 0; i < burstCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (hit ? 0.45 : 0.28) + Math.random() * 0.7;
        fx.pool.spawn(new Particle({
          x: Number(at.x) + (Math.random() - 0.5) * 0.12,
          y: Number(at.y) + (Math.random() - 0.5) * 0.12,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.06,
          ay: 0.1,
          life: 0.13 + Math.random() * 0.15,
          size0: 0.05 + Math.random() * 0.05,
          size1: 0.015,
          r: 235,
          g: 205,
          b: 150,
          a0: 0.8,
        }));
      }
      if (hit) startShake(cam, 4, 0.12);
      else if (missed) startShake(cam, 2, 0.08);
    });

    world.on('spell:acid_spit', ({ at, hit }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _smiteFx.push(new RadialFx({
        x: Number(at.x),
        y: Number(at.y),
        radius: hit ? 0.78 : 0.55,
        ttl: 0.18,
      }));
      const burstCount = hit ? 16 : 11;
      for (let i = 0; i < burstCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (hit ? 0.33 : 0.24) + Math.random() * 0.62;
        fx.pool.spawn(new Particle({
          x: Number(at.x) + (Math.random() - 0.5) * 0.10,
          y: Number(at.y) + (Math.random() - 0.5) * 0.10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.03,
          ay: 0.06,
          life: 0.14 + Math.random() * 0.16,
          size0: 0.05 + Math.random() * 0.04,
          size1: 0.015,
          r: 200 + ((Math.random() * 30) | 0),
          g: 240,
          b: 110 + ((Math.random() * 30) | 0),
          a0: 0.84,
        }));
      }
      startShake(cam, hit ? 3 : 2, 0.08);
    });

    world.on('spell:phase_strike', ({ from, to, hits, randomized }) => {
      if (!from || !to) return;
      if (!Number.isFinite(from.x) || !Number.isFinite(from.y)) return;
      if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) return;

      const src = { x: from.x, y: from.y };
      const dst = { x: to.x, y: to.y };
      const hitPositions = Array.isArray(hits) ? hits.map(h => ({ x: h.x, y: h.y })) : [];

      _phaseStrikeFx.push(new PhaseStrikeFx({
        from: src,
        to: dst,
        hits: hitPositions,
        ttl: 0.32,
        phase: Math.random() * Math.PI * 2,
      }));

      // Purple particle burst at source and destination
      const scale = PERF.quality === 'low' ? 0.7 : (PERF.quality === 'high' ? 1.2 : 1.0);
      const burstCount = Math.max(4, Math.round(12 * scale));
      for (const pos of [src, dst]) {
        for (let i = 0; i < burstCount; i++) {
          const angle = (Math.PI * 2 * i / burstCount) + (Math.random() - 0.5) * 0.4;
          const speed = 0.5 + Math.random() * 1.4;
          fx.pool.spawn(new Particle({
            x: pos.x + (Math.random() - 0.5) * 0.12,
            y: pos.y + (Math.random() - 0.5) * 0.12,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.05,
            ay: 0.12,
            life: 0.18 + Math.random() * 0.26,
            size0: 0.10 + Math.random() * 0.09,
            size1: 0.02,
            r: 180 + ((Math.random() * 50) | 0),
            g: 80 + ((Math.random() * 60) | 0),
            b: 255,
            a0: 0.92,
            rotVel: (Math.random() - 0.5) * 2.2,
          }));
        }
      }

      // Violet sparkle trail along the path
      const pdx = dst.x - src.x;
      const pdy = dst.y - src.y;
      const dist = Math.hypot(pdx, pdy);
      const sparkleCount = Math.max(6, Math.min(22, Math.round(dist * 1.8)));
      const sparkScale = PERF.quality === 'low' ? 0.6 : 1.0;
      const sparkleCountScaled = Math.max(4, Math.round(sparkleCount * sparkScale));
      for (let i = 0; i < sparkleCountScaled; i++) {
        const t = (i + Math.random()) / Math.max(1, sparkleCountScaled);
        fx.pool.spawn(new Particle({
          x: src.x + pdx * t + (Math.random() - 0.5) * 0.18,
          y: src.y + pdy * t + (Math.random() - 0.5) * 0.18,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          ay: 0.04,
          life: 0.12 + Math.random() * 0.22,
          size0: 0.05 + Math.random() * 0.04,
          size1: 0.01,
          r: 210 + ((Math.random() * 30) | 0),
          g: 160 + ((Math.random() * 40) | 0),
          b: 255,
          a0: 0.75,
        }));
      }

      // Violet impact bursts at each hit enemy
      for (const h of hitPositions) {
        const impactCount = Math.max(3, Math.round(8 * scale));
        for (let i = 0; i < impactCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.8 + Math.random() * 1.6;
          fx.pool.spawn(new Particle({
            x: h.x + (Math.random() - 0.5) * 0.15,
            y: h.y + (Math.random() - 0.5) * 0.15,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            ay: 0.2,
            life: 0.14 + Math.random() * 0.20,
            size0: 0.12 + Math.random() * 0.08,
            size1: 0.02,
            r: 220 + ((Math.random() * 35) | 0),
            g: 120 + ((Math.random() * 60) | 0),
            b: 255,
            a0: 0.95,
            rot: Math.random() * Math.PI * 2,
            rotVel: (Math.random() - 0.5) * 3,
          }));
        }
      }

      startShake(cam, 5, 0.18);
    });

    world.on('spell:rampage', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _rampageFx.push(new RadialFx({ x: at.x, y: at.y, radius: 1.8, ttl: 0.5 }));
      // Red/orange particle burst
      const scale = PERF.quality === 'low' ? 0.65 : (PERF.quality === 'high' ? 1.25 : 1.0);
      const burstCount = Math.max(12, Math.round(24 * scale));
      for (let i = 0; i < burstCount; i++) {
        const angle = (Math.PI * 2 * i / burstCount) + (Math.random() - 0.5) * 0.5;
        const speed = 0.7 + Math.random() * 1.6;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.14,
          y: at.y + (Math.random() - 0.5) * 0.14,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.2,
          ay: 0.15,
          life: 0.22 + Math.random() * 0.35,
          size0: 0.13 + Math.random() * 0.09,
          size1: 0.02,
          r: 255,
          g: 50 + ((Math.random() * 60) | 0),
          b: 10 + ((Math.random() * 30) | 0),
          a0: 0.95,
          rotVel: (Math.random() - 0.5) * 2.5,
        }));
      }
      // Rising rage embers
      const emberCount = Math.max(6, Math.round(14 * scale));
      for (let i = 0; i < emberCount; i++) {
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.9,
          y: at.y + (Math.random() - 0.5) * 0.5,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -(0.2 + Math.random() * 0.5),
          ay: -0.03,
          life: 0.5 + Math.random() * 0.5,
          size0: 0.07 + Math.random() * 0.05,
          size1: 0.01,
          r: 255,
          g: 120 + ((Math.random() * 80) | 0),
          b: 20,
          a0: 0.7,
          rotVel: (Math.random() - 0.5) * 2.0,
        }));
      }
      startShake(cam, 4, 0.16);
    });

    world.on('spell:verdant_ward', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _flashHealFx.push(new RadialFx({ x: at.x, y: at.y, radius: 1.4, ttl: 0.5 }));
      const count = PERF.quality === 'low' ? 12 : 20;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.7;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.2,
          y: at.y + (Math.random() - 0.5) * 0.2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.18,
          ay: -0.02,
          life: 0.35 + Math.random() * 0.35,
          size0: 0.08 + Math.random() * 0.05,
          size1: 0.02,
          r: 100 + ((Math.random() * 40) | 0),
          g: 180 + ((Math.random() * 70) | 0),
          b: 90 + ((Math.random() * 40) | 0),
          a0: 0.85,
          rotVel: (Math.random() - 0.5) * 1.2,
        }));
      }
      startShake(cam, 2, 0.08);
    });

    // Entangle — green vine burst erupting upward around target
    world.on('spell:entangle', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      // Rising vine tendrils
      const count = PERF.quality === 'low' ? 14 : 22;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.4;
        const speed = 0.15 + Math.random() * 0.5;
        fx.pool.spawn(new Particle({
          x: at.x + Math.cos(angle) * (0.1 + Math.random() * 0.25),
          y: at.y + Math.sin(angle) * (0.1 + Math.random() * 0.25),
          vx: Math.cos(angle) * speed * 0.3,
          vy: -(0.4 + Math.random() * 0.6),
          ay: 0.15,
          life: 0.4 + Math.random() * 0.35,
          size0: 0.07 + Math.random() * 0.05,
          size1: 0.02,
          r: 30 + ((Math.random() * 40) | 0),
          g: 160 + ((Math.random() * 80) | 0),
          b: 40 + ((Math.random() * 30) | 0),
          a0: 0.9,
          rotVel: (Math.random() - 0.5) * 2.0,
        }));
      }
      // Ground burst ring
      const ring = PERF.quality === 'low' ? 6 : 10;
      for (let i = 0; i < ring; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 0.6;
        fx.pool.spawn(new Particle({
          x: at.x, y: at.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.18 + Math.random() * 0.14,
          size0: 0.06 + Math.random() * 0.03,
          size1: 0.01,
          r: 60, g: 200, b: 60,
          a0: 0.75,
        }));
      }
      startShake(cam, 2, 0.08);
    });

    // Thorn Burst — radial thorn volley outward from caster + impact splashes
    world.on('spell:thorn_burst', ({ from, impacts, radius }) => {
      if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.y)) return;
      const r = Math.max(1, Number(radius || 3));

      // Random thorn spray outward from caster
      const N = PERF.quality === 'low' ? 16 : 28;
      for (let i = 0; i < N; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 0.8 + Math.random() * r * 0.6;
        fx.pool.spawn(new Particle({
          x: from.x + (Math.random() - 0.5) * 0.15,
          y: from.y + (Math.random() - 0.5) * 0.15,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          ay: 0.08,
          life: 0.25 + Math.random() * 0.2,
          size0: 0.07 + Math.random() * 0.04,
          size1: 0.02,
          r: 80 + ((Math.random() * 50) | 0),
          g: 140 + ((Math.random() * 70) | 0),
          b: 15 + ((Math.random() * 20) | 0),
          a0: 0.92,
        }));
      }

      // Secondary slower poison mist puffs
      const mist = PERF.quality === 'low' ? 8 : 14;
      for (let i = 0; i < mist; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 0.3 + Math.random() * 0.4;
        fx.pool.spawn(new Particle({
          x: from.x, y: from.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 0.05,
          life: 0.4 + Math.random() * 0.3,
          size0: 0.1 + Math.random() * 0.06,
          size1: 0.04,
          r: 40, g: 170 + ((Math.random() * 60) | 0), b: 25,
          a0: 0.5,
        }));
      }

      // Impact splashes at each hit target
      if (Array.isArray(impacts)) {
        for (let i = 0; i < impacts.length; i++) {
          const imp = impacts[i];
          if (!imp || !Number.isFinite(imp.x) || !Number.isFinite(imp.y)) continue;
          const splashN = PERF.quality === 'low' ? 4 : 8;
          for (let j = 0; j < splashN; j++) {
            const a = Math.random() * Math.PI * 2;
            const s = 0.2 + Math.random() * 0.4;
            fx.pool.spawn(new Particle({
              x: imp.x + (Math.random() - 0.5) * 0.15,
              y: imp.y + (Math.random() - 0.5) * 0.15,
              vx: Math.cos(a) * s,
              vy: Math.sin(a) * s,
              ay: 0.25,
              life: 0.15 + Math.random() * 0.15,
              size0: 0.06 + Math.random() * 0.03,
              size1: 0.01,
              r: 120 + ((Math.random() * 40) | 0),
              g: 50 + ((Math.random() * 30) | 0),
              b: 20,
              a0: 0.85,
            }));
          }
        }
      }
      startShake(cam, Math.min(5, 2 + (impacts?.length || 0)), 0.10);
    });

    world.on('spell:harmony_ward', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _smiteFx.push(new RadialFx({ x: at.x, y: at.y, radius: 1.25, ttl: 0.46 }));
      const count = PERF.quality === 'low' ? 14 : 24;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / Math.max(1, count)) + (Math.random() - 0.5) * 0.45;
        const speed = 0.22 + Math.random() * 0.85;
        const warm = (i % 2) === 0;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.18,
          y: at.y + (Math.random() - 0.5) * 0.18,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          ay: 0.03,
          life: 0.28 + Math.random() * 0.32,
          size0: 0.08 + Math.random() * 0.04,
          size1: 0.02,
          r: warm ? 250 : 110,
          g: warm ? 220 : 210,
          b: warm ? 90 : 255,
          a0: 0.82,
        }));
      }
      startShake(cam, 2, 0.08);
    });

    world.on('spell:shadow_veil', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _blinkFx.push(new BlinkFx({
        from: { x: at.x, y: at.y },
        to: { x: at.x, y: at.y },
        ttl: 0.34,
        phase: Math.random() * Math.PI * 2,
        randomized: false,
      }));
      const count = PERF.quality === 'low' ? 12 : 20;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.45;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.26,
          y: at.y + (Math.random() - 0.5) * 0.26,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.06,
          ay: -0.01,
          life: 0.30 + Math.random() * 0.38,
          size0: 0.06 + Math.random() * 0.04,
          size1: 0.01,
          r: 165 + ((Math.random() * 35) | 0),
          g: 85 + ((Math.random() * 35) | 0),
          b: 220 + ((Math.random() * 35) | 0),
          a0: 0.72,
          rotVel: (Math.random() - 0.5) * 1.6,
        }));
      }
      startShake(cam, 1, 0.05);
    });

    // ── Generator impact VFX (small, snappy) ──

    // Savage Strike — boar-bite-style radial flash + gravity particles + shake
    world.on('spell:savage_strike', ({ at, hit, missed }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _smiteFx.push(new RadialFx({
        x: Number(at.x),
        y: Number(at.y),
        radius: hit ? 0.55 : 0.38,
        ttl: 0.10,
      }));
      const burst = hit ? (PERF.quality === 'low' ? 6 : 12) : 5;
      for (let i = 0; i < burst; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (hit ? 0.28 : 0.18) + Math.random() * 0.32;
        fx.pool.spawn(new Particle({
          x: Number(at.x) + (Math.random() - 0.5) * 0.10,
          y: Number(at.y) + (Math.random() - 0.5) * 0.10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.03,
          ay: 0.06,
          life: 0.09 + Math.random() * 0.11,
          size0: 0.035 + Math.random() * 0.03,
          size1: 0.01,
          r: 210,
          g: 110 + ((Math.random() * 30) | 0),
          b: 45 + ((Math.random() * 20) | 0),
          a0: 0.85,
        }));
      }
      if (hit) startShake(cam, 3, 0.08);
      else if (missed) startShake(cam, 1, 0.04);
    });

    // Melee generators — small burst at impact
    for (const _ev of ['spell:cheap_shot', 'spell:holy_strike']) {
      world.on(_ev, ({ at, hit }) => {
        if (!hit || !at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
        const isHoly = _ev === 'spell:holy_strike';
        const count = PERF.quality === 'low' ? 4 : 8;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.3 + Math.random() * 0.5;
          fx.pool.spawn(new Particle({
            x: at.x + (Math.random() - 0.5) * 0.15,
            y: at.y + (Math.random() - 0.5) * 0.15,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.12 + Math.random() * 0.1,
            size0: 0.04 + Math.random() * 0.03,
            size1: 0.01,
            r: isHoly ? 255 : 140,
            g: isHoly ? 230 : 140,
            b: isHoly ? 100 : 180,
            a0: 0.8,
          }));
        }
      });
    }

    // Ranged generators — small impact burst at target
    for (const _ev of ['spell:arcane_bolt', 'spell:natures_touch', 'spell:leech_spores']) {
      world.on(_ev, ({ at, hit }) => {
        if (!hit || !at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
        const isArcane = _ev === 'spell:arcane_bolt';
        const count = PERF.quality === 'low' ? 5 : 10;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.2 + Math.random() * 0.4;
          fx.pool.spawn(new Particle({
            x: at.x + (Math.random() - 0.5) * 0.12,
            y: at.y + (Math.random() - 0.5) * 0.12,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.1,
            life: 0.15 + Math.random() * 0.12,
            size0: 0.04 + Math.random() * 0.02,
            size1: 0.01,
            r: isArcane ? 180 : 60,
            g: isArcane ? 120 : 180 + ((Math.random() * 40) | 0),
            b: isArcane ? 255 : 60,
            a0: 0.75,
          }));
        }
      });
    }

    // ── Buff / Rotation ability VFX ──

    // Iron Flesh — metallic sparks converging inward
    world.on('spell:iron_flesh', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const count = PERF.quality === 'low' ? 16 : 26;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.3;
        const dist = 0.6 + Math.random() * 0.4;
        const speed = 1.2 + Math.random() * 0.6;
        fx.pool.spawn(new Particle({
          x: at.x + Math.cos(angle) * dist,
          y: at.y + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * speed,
          vy: -Math.sin(angle) * speed,
          life: 0.3 + Math.random() * 0.15,
          size0: 0.06 + Math.random() * 0.04,
          size1: 0.02,
          r: 170 + ((Math.random() * 50) | 0),
          g: 180 + ((Math.random() * 50) | 0),
          b: 200 + ((Math.random() * 55) | 0),
          a0: 0.9,
        }));
      }
      startShake(cam, 2, 0.08);
    });

    // Ignite Weapons — fire burst from caster
    world.on('spell:ignite_weapons', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const count = PERF.quality === 'low' ? 14 : 22;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.3 + Math.random() * 0.6;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.2,
          y: at.y + (Math.random() - 0.5) * 0.2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.3,
          ay: -0.05,
          life: 0.25 + Math.random() * 0.2,
          size0: 0.07 + Math.random() * 0.04,
          size1: 0.02,
          r: 255,
          g: 120 + ((Math.random() * 80) | 0),
          b: 20 + ((Math.random() * 30) | 0),
          a0: 0.88,
        }));
      }
      startShake(cam, 2, 0.06);
    });

    // Barkskin — green/brown particles converging + rising leaf motes
    world.on('spell:barkskin', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const count = PERF.quality === 'low' ? 14 : 22;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.4;
        const dist = 0.5 + Math.random() * 0.3;
        const speed = 0.8 + Math.random() * 0.5;
        const bark = Math.random() > 0.4;
        fx.pool.spawn(new Particle({
          x: at.x + Math.cos(angle) * dist,
          y: at.y + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * speed,
          vy: -Math.sin(angle) * speed - 0.1,
          ay: 0.05,
          life: 0.3 + Math.random() * 0.2,
          size0: 0.06 + Math.random() * 0.04,
          size1: 0.02,
          r: bark ? 110 + ((Math.random() * 30) | 0) : 50 + ((Math.random() * 30) | 0),
          g: bark ? 80 + ((Math.random() * 30) | 0) : 170 + ((Math.random() * 60) | 0),
          b: bark ? 40 : 40 + ((Math.random() * 20) | 0),
          a0: 0.85,
          rotVel: (Math.random() - 0.5) * 1.5,
        }));
      }
      startShake(cam, 1, 0.05);
    });

    // Quicken — yellow/white energy sparks swirling upward
    world.on('spell:quicken', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const count = PERF.quality === 'low' ? 12 : 20;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.5;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.3,
          y: at.y + (Math.random() - 0.5) * 0.3,
          vx: Math.cos(angle) * speed,
          vy: -(0.4 + Math.random() * 0.6),
          ay: -0.05,
          life: 0.25 + Math.random() * 0.25,
          size0: 0.04 + Math.random() * 0.03,
          size1: 0.01,
          r: 255,
          g: 240 + ((Math.random() * 15) | 0),
          b: 100 + ((Math.random() * 80) | 0),
          a0: 0.9,
        }));
      }
    });

    // Mark of Death — dark purple implosion on target
    world.on('spell:mark_of_death', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const count = PERF.quality === 'low' ? 16 : 24;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.3;
        const dist = 0.7 + Math.random() * 0.4;
        const speed = 1.4 + Math.random() * 0.8;
        fx.pool.spawn(new Particle({
          x: at.x + Math.cos(angle) * dist,
          y: at.y + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * speed,
          vy: -Math.sin(angle) * speed,
          life: 0.3 + Math.random() * 0.15,
          size0: 0.06 + Math.random() * 0.04,
          size1: 0.01,
          r: 160 + ((Math.random() * 40) | 0),
          g: 30 + ((Math.random() * 30) | 0),
          b: 200 + ((Math.random() * 55) | 0),
          a0: 0.92,
        }));
      }
      startShake(cam, 2, 0.06);
    });

    // Primal Roar — orange/red shockwave burst outward
    world.on('spell:primal_roar', ({ at, radius }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const r = Math.max(1, Number(radius || 2));
      const N = PERF.quality === 'low' ? 18 : 30;
      for (let i = 0; i < N; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 0.8 + Math.random() * r * 0.5;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.15,
          y: at.y + (Math.random() - 0.5) * 0.15,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 0.2 + Math.random() * 0.2,
          size0: 0.08 + Math.random() * 0.05,
          size1: 0.02,
          r: 240 + ((Math.random() * 15) | 0),
          g: 100 + ((Math.random() * 60) | 0),
          b: 20 + ((Math.random() * 20) | 0),
          a0: 0.88,
        }));
      }
      startShake(cam, 4, 0.14);
    });

    world.on('spell:earthshatter', ({ origin, radius, enhanced }) => {
      if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return;
      const r = Math.max(1, Number(radius || 1));
      // Radial dust/rock particle burst.
      const N = enhanced ? 28 : 20;
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const spd = 1.2 + Math.random() * Math.max(0.8, r * 0.4);
        const rr = enhanced ? 200 + ((Math.random() * 55) | 0) : 140 + ((Math.random() * 60) | 0);
        const gg = enhanced ? 90 + ((Math.random() * 60) | 0) : 115 + ((Math.random() * 50) | 0);
        const bb = enhanced ? 15 + ((Math.random() * 20) | 0) : 70 + ((Math.random() * 40) | 0);
        fx.pool.spawn(new Particle({
          x: origin.x, y: origin.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 0.28 + Math.random() * 0.22,
          size0: 0.14 + Math.random() * 0.06, size1: 0.03,
          r: rr, g: gg, b: bb,
          a0: 0.82,
        }));
      }
      if (enhanced) {
        // Extra ember burst for volcanic variant.
        for (let i = 0; i < 12; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = 0.6 + Math.random() * 1.0;
          fx.pool.spawn(new Particle({
            x: origin.x + (Math.random() - 0.5) * 0.3,
            y: origin.y + (Math.random() - 0.5) * 0.3,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd - 0.3,
            ay: 0.10,
            life: 0.20 + Math.random() * 0.16,
            size0: 0.08 + Math.random() * 0.04, size1: 0.02,
            r: 255, g: 150 + ((Math.random() * 80) | 0), b: 20 + ((Math.random() * 30) | 0),
            a0: 0.90,
          }));
        }
      }
      startShake(cam, enhanced ? 6 : 4, enhanced ? 0.20 : 0.14);
    });

    world.on('search:pulse', ({ at, radius }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const r = Math.max(1, Number(radius || 6));
      _searchPulseFx.push(new SearchPulseFx({ x: at.x, y: at.y, radius: r, ttl: 0.38 }));
    });

    world.on("spell:drain_life:start", ({ actor, targetId, turnsLeft }) => {
      const a = Number(actor || 0) | 0;
      const t = Number(targetId || 0) | 0;
      if (!(a > 0) || !(t > 0)) return;
      const rawTurns = Number(turnsLeft);
      const finiteTurns = Number.isFinite(rawTurns) && rawTurns > 0;
      _drainLifeChannels.set(a, {
        actor: a,
        targetId: t,
        expiresStep: finiteTurns ? (world.step + (rawTurns | 0) + 1) : Number.POSITIVE_INFINITY,
        lastTickStep: world.step,
        phase: Math.random() * Math.PI * 2,
        tickFlash: 0.08,
        endFlash: 0,
        moteClock: 0,
        breakReason: "",
        fading: false,
        fadeLeft: 0,
        fadeMax: 0,
      });
    });

    world.on("spell:drain_life:tick", ({ actor, targetId }) => {
      const a = Number(actor || 0) | 0;
      if (!(a > 0)) return;
      const current = _drainLifeChannels.get(a);
      if (!current) return;
      current.targetId = Number(targetId || current.targetId) | 0;
      current.lastTickStep = world.step;
      current.tickFlash = Math.max(0.10, Number(current.tickFlash || 0));
      current.expiresStep = Math.max(current.expiresStep, world.step + 2);
    });

    world.on("spell:drain_life:break", ({ actor, reason }) => {
      const a = Number(actor || 0) | 0;
      if (!(a > 0)) return;
      const current = _drainLifeChannels.get(a);
      if (!current) return;
      current.breakReason = String(reason || "");
      current.fading = true;
      current.fadeMax = 0.24;
      current.fadeLeft = current.fadeMax;
      current.endFlash = 0.24;
    });

    world.on("channeling:cancelled", ({ actor, spellId, reason }) => {
      if (String(spellId || "") !== "drain_life") return;
      const a = Number(actor || 0) | 0;
      if (!(a > 0)) return;
      const current = _drainLifeChannels.get(a);
      if (!current) return;
      current.breakReason = String(reason || "channel_cancelled");
      current.fading = true;
      current.fadeMax = 0.20;
      current.fadeLeft = current.fadeMax;
      current.endFlash = Math.max(Number(current.endFlash || 0), 0.18);
    });

    world.on("channeling:complete", ({ actor, spellId }) => {
      if (String(spellId || "") !== "drain_life") return;
      const a = Number(actor || 0) | 0;
      if (!(a > 0)) return;
      const current = _drainLifeChannels.get(a);
      if (!current) return;
      current.breakReason = "channel_complete";
      current.fading = true;
      current.fadeMax = 0.20;
      current.fadeLeft = current.fadeMax;
      current.endFlash = Math.max(Number(current.endFlash || 0), 0.16);
    });

    function startFishingChannelFx({ actor, x, y, turns, durationSec }) {
      const a = Number(actor || 0) | 0;
      const tx = Number(x);
      const ty = Number(y);
      if (!(a > 0) || !Number.isFinite(tx) || !Number.isFinite(ty)) return;
      _fishingChannels.set(a, {
        actor: a,
        x: Math.floor(tx),
        y: Math.floor(ty),
        turns: Math.max(1, Number(turns || 12) | 0),
        durationLeft: Math.max(0, Number(durationSec || 0)),
        startedAtStep: currentStep(),
        phase: Math.random() * Math.PI * 2,
        fading: false,
        fadeLeft: 0,
        fadeMax: 0,
        rippleClock: 0,
      });
    }

    world.on("fishing:cast", (ev) => {
      startFishingChannelFx(ev || {});
    });

    world.on("townfolk:fished", (ev) => {
      startFishingChannelFx({ ...(ev || {}), turns: 6, durationSec: 1.1 });
    });

    world.on("channeling:start", ({ actor, spellId, x, y, castTime }) => {
      if (String(spellId || "") !== "fishing") return;
      startFishingChannelFx({ actor, x, y, turns: castTime });
    });

    function fadeFishing(actor) {
      const a = Number(actor || 0) | 0;
      const current = _fishingChannels.get(a);
      if (!current) return;
      current.fading = true;
      current.fadeMax = 0.35;
      current.fadeLeft = Math.max(Number(current.fadeLeft || 0), current.fadeMax);
    }

    world.on("channeling:complete", ({ actor, spellId }) => {
      if (String(spellId || "") !== "fishing") return;
      fadeFishing(actor);
    });

    world.on("channeling:cancelled", ({ actor, spellId }) => {
      if (String(spellId || "") !== "fishing") return;
      fadeFishing(actor);
    });

    // ── Evocation channel VFX ──────────────────────────────────────────

    world.on("channeling:start", ({ actor, spellId }) => {
      if (String(spellId || "") !== "evocation") return;
      const a = Number(actor || 0) | 0;
      if (!(a > 0)) return;
      _evocationChannels.set(a, {
        actor: a,
        phase: Math.random() * Math.PI * 2,
        intensity: 0,
        moteClock: 0,
        tickFlash: 0,
        fading: false,
        fadeLeft: 0,
        fadeMax: 0,
      });
    });

    world.on("spell:evocation:tick", ({ actor, manaRestored }) => {
      const a = Number(actor || 0) | 0;
      if (!(a > 0)) return;
      const current = _evocationChannels.get(a);
      if (!current) return;
      current.tickFlash = Math.max(0.12, Number(current.tickFlash || 0));

      // Float text: "+N MANA"
      const pos = typeof getPosition === "function" ? getPosition(a) : null;
      if (pos && ftext && Number(manaRestored) > 0) {
        ftext.addStatus(pos.x, pos.y - 0.45, `+${manaRestored} MANA`, {
          color: '#88ccff', life: 0.85, scaleStart: 1.15, scaleEnd: 0.85,
        });
      }
    });

    world.on("channeling:cancelled", ({ actor, spellId, reason }) => {
      if (String(spellId || "") !== "evocation") return;
      const a = Number(actor || 0) | 0;
      if (!(a > 0)) return;
      const current = _evocationChannels.get(a);
      if (!current) return;
      current.fading = true;
      current.fadeMax = 0.28;
      current.fadeLeft = current.fadeMax;
    });

    world.on("channeling:complete", ({ actor, spellId }) => {
      if (String(spellId || "") !== "evocation") return;
      const a = Number(actor || 0) | 0;
      if (!(a > 0)) return;
      const current = _evocationChannels.get(a);
      if (!current) return;
      current.fading = true;
      current.fadeMax = 0.22;
      current.fadeLeft = current.fadeMax;
    });

    // ── Class ability VFX ────────────────────────────────────────────────

    world.on('spell:war_cry', ({ at, affected }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _warCryFx.push(new RadialFx({ x: at.x, y: at.y, radius: 3.5, ttl: 0.42 }));
      // Red particle shockwave burst
      const scale = PERF.quality === 'low' ? 0.65 : (PERF.quality === 'high' ? 1.25 : 1.0);
      const count = Math.max(14, Math.round(28 * scale));
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.45;
        const speed = 1.2 + Math.random() * 2.0;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.12,
          y: at.y + (Math.random() - 0.5) * 0.12,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.18 + Math.random() * 0.22,
          size0: 0.10 + Math.random() * 0.06,
          size1: 0.02,
          r: 255, g: 70 + ((Math.random() * 50) | 0), b: 20 + ((Math.random() * 20) | 0),
          a0: 0.85,
        }));
      }
      startShake(cam, (affected || 0) > 0 ? 5 : 2, 0.16);
    });

    world.on('spell:cleave', ({ at, hits }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      if (!hits || !hits.length) return;
      // Determine sweep direction from hit positions → full 270° arc
      let avgAngle = 0;
      for (const h of hits) {
        avgAngle += Math.atan2(h.y - at.y, h.x - at.x);
      }
      avgAngle /= hits.length;
      const startAngle = avgAngle - Math.PI * 0.75; // 270° sweep centered on avg hit direction
      _cleaveFx.push(new ArcSweepFx({
        x: at.x, y: at.y,
        startAngle,
        sweepAngle: Math.PI * 1.5, // 270°
        radius: 1.3,
        ttl: 0.28,
        color: [255, 200, 180],
      }));
      // Blood sparks at each hit
      for (const h of (isGoreDisabled() ? [] : hits)) {
        const count = PERF.quality === 'low' ? 4 : 8;
        for (let i = 0; i < count; i++) {
          const dx = h.x - at.x, dy = h.y - at.y;
          const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2;
          const speed = 0.4 + Math.random() * 1.0;
          fx.pool.spawn(new Particle({
            x: h.x, y: h.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            ay: 0.15,
            life: 0.12 + Math.random() * 0.16,
            size0: 0.08 + Math.random() * 0.06,
            size1: 0.02,
            r: 255, g: 100 + ((Math.random() * 60) | 0), b: 80,
            a0: 0.9,
          }));
        }
      }
      startShake(cam, 3, 0.10);
    });

    world.on('spell:bloodthirst', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      // Dark crimson aura pulse
      _rampageFx.push(new RadialFx({ x: at.x, y: at.y, radius: 1.2, ttl: 0.45 }));
      if (isGoreDisabled()) { startShake(cam, 2, 0.08); return; }
      // Rising blood motes
      const count = PERF.quality === 'low' ? 10 : 18;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.1 + Math.random() * 0.35;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.6,
          y: at.y + (Math.random() - 0.5) * 0.4,
          vx: Math.cos(angle) * speed,
          vy: -(0.3 + Math.random() * 0.5),
          ay: -0.02,
          life: 0.4 + Math.random() * 0.4,
          size0: 0.06 + Math.random() * 0.04,
          size1: 0.01,
          r: 170 + ((Math.random() * 40) | 0), g: 10, b: 25 + ((Math.random() * 20) | 0),
          a0: 0.8,
        }));
      }
      startShake(cam, 2, 0.08);
    });

    world.on('proc:bloodthirst', ({ actor, target, healed }) => {
      if (typeof getPosition !== "function") return;
      if (isGoreDisabled()) return;
      const from = getPosition(Number(target || 0));
      const to = getPosition(Number(actor || 0));
      if (!from || !to) return;
      // Red droplets flying from victim TO caster (life drain visual)
      const count = Math.max(3, Math.min(8, (healed || 1) * 2));
      for (let i = 0; i < count; i++) {
        const dx = to.x - from.x, dy = to.y - from.y;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = 2.0 + Math.random() * 1.5;
        const spread = (Math.random() - 0.5) * 0.8;
        fx.pool.spawn(new Particle({
          x: from.x + (Math.random() - 0.5) * 0.2,
          y: from.y + (Math.random() - 0.5) * 0.2,
          vx: (dx / dist) * speed + spread,
          vy: (dy / dist) * speed + spread - 0.3,
          ay: 0.5,
          life: 0.20 + Math.random() * 0.14,
          size0: 0.09 + Math.random() * 0.05,
          size1: 0.03,
          r: 200, g: 20, b: 30 + ((Math.random() * 25) | 0),
          a0: 0.9,
        }));
      }
    });

    world.on('spell:purify', ({ at, removed }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      if (!removed) return;
      // Golden upward burst
      _flashHealFx.push(new RadialFx({ x: at.x, y: at.y, radius: 1.2, ttl: 0.38 }));
      const scale = PERF.quality === 'low' ? 0.7 : 1.0;
      // Rising golden sparkles (cleansing)
      const goldCount = Math.max(10, Math.round(20 * scale));
      for (let i = 0; i < goldCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.5;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.5,
          y: at.y + (Math.random() - 0.5) * 0.3,
          vx: Math.cos(angle) * speed,
          vy: -(0.5 + Math.random() * 0.8),
          ay: -0.05,
          life: 0.35 + Math.random() * 0.35,
          size0: 0.07 + Math.random() * 0.04,
          size1: 0.01,
          r: 255, g: 230 + ((Math.random() * 25) | 0), b: 100 + ((Math.random() * 60) | 0),
          a0: 0.9,
        }));
      }
      // Dark corruption particles ejected outward (what's being removed)
      const darkCount = Math.max(6, Math.round(removed * 4 * scale));
      for (let i = 0; i < darkCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.2;
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.2,
          y: at.y + (Math.random() - 0.5) * 0.2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.4,
          ay: 0.15,
          life: 0.20 + Math.random() * 0.18,
          size0: 0.08 + Math.random() * 0.04,
          size1: 0.02,
          r: 60 + ((Math.random() * 40) | 0), g: 30, b: 60 + ((Math.random() * 30) | 0),
          a0: 0.75,
        }));
      }
      startShake(cam, 2, 0.06);
    });

    world.on('spell:divine_shield', ({ at }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _divineShieldFx.push(new RadialFx({ x: at.x, y: at.y, radius: 1.4, ttl: 0.50 }));
      // Orbiting golden sparkles
      const count = PERF.quality === 'low' ? 12 : 22;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count);
        const orbitR = 0.4 + Math.random() * 0.4;
        const speed = 0.3 + Math.random() * 0.6;
        fx.pool.spawn(new Particle({
          x: at.x + Math.cos(angle) * orbitR,
          y: at.y + Math.sin(angle) * orbitR,
          vx: Math.cos(angle + Math.PI * 0.5) * speed,
          vy: Math.sin(angle + Math.PI * 0.5) * speed - 0.15,
          ay: -0.02,
          life: 0.40 + Math.random() * 0.30,
          size0: 0.07 + Math.random() * 0.04,
          size1: 0.02,
          r: 255, g: 220 + ((Math.random() * 30) | 0), b: 80 + ((Math.random() * 50) | 0),
          a0: 0.85,
        }));
      }
      startShake(cam, 2, 0.08);
    });

    world.on('spell:consecrate', ({ at, radius }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const r = Math.max(1, Number(radius || 2));
      _consecrateFx.push(new RadialFx({ x: at.x, y: at.y, radius: r, ttl: 1.2 }));
      // Burst of rising golden motes from the ground
      const scale = PERF.quality === 'low' ? 0.6 : 1.0;
      const count = Math.max(16, Math.round(32 * scale));
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * r;
        fx.pool.spawn(new Particle({
          x: at.x + Math.cos(angle) * dist,
          y: at.y + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.15,
          vy: -(0.3 + Math.random() * 0.6),
          ay: -0.02,
          life: 0.5 + Math.random() * 0.6,
          size0: 0.05 + Math.random() * 0.04,
          size1: 0.01,
          r: 255, g: 210 + ((Math.random() * 40) | 0), b: 50 + ((Math.random() * 60) | 0),
          a0: 0.75,
        }));
      }
      startShake(cam, 3, 0.10);
    });

    world.on('spell:smoke_bomb', ({ at, affected }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      _smokeBombFx.push(new SmokeFx({ x: at.x, y: at.y, radius: 3.5, ttl: 0.65 }));
      // Gray billowing particles outward
      const scale = PERF.quality === 'low' ? 0.6 : 1.0;
      const count = Math.max(18, Math.round(36 * scale));
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.5;
        const speed = 0.6 + Math.random() * 1.8;
        const gray = 100 + ((Math.random() * 80) | 0);
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.2,
          y: at.y + (Math.random() - 0.5) * 0.2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.15,
          ay: -0.04,
          life: 0.30 + Math.random() * 0.35,
          size0: 0.14 + Math.random() * 0.10,
          size1: 0.04,
          r: gray, g: gray, b: gray + 10,
          a0: 0.65,
        }));
      }
      // Rising wispy tendrils
      const wispCount = Math.max(8, Math.round(14 * scale));
      for (let i = 0; i < wispCount; i++) {
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 1.2,
          y: at.y + (Math.random() - 0.5) * 0.8,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -(0.2 + Math.random() * 0.4),
          ay: -0.01,
          life: 0.5 + Math.random() * 0.4,
          size0: 0.10 + Math.random() * 0.06,
          size1: 0.03,
          r: 140, g: 140, b: 150,
          a0: 0.5,
        }));
      }
      startShake(cam, (affected || 0) > 0 ? 3 : 1, 0.10);
    });

    world.on('spell:poison_blade', ({ at, fizzle }) => {
      if (fizzle) return;
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      // Green dripping particles falling from weapon area
      const count = PERF.quality === 'low' ? 8 : 14;
      for (let i = 0; i < count; i++) {
        fx.pool.spawn(new Particle({
          x: at.x + (Math.random() - 0.5) * 0.4,
          y: at.y - 0.1 + Math.random() * 0.3,
          vx: (Math.random() - 0.5) * 0.2,
          vy: 0.2 + Math.random() * 0.5,
          ay: 0.4,
          life: 0.25 + Math.random() * 0.25,
          size0: 0.06 + Math.random() * 0.04,
          size1: 0.02,
          r: 50 + ((Math.random() * 30) | 0), g: 200 + ((Math.random() * 50) | 0), b: 40,
          a0: 0.85,
        }));
      }
      // Brief green flash
      const flashCount = PERF.quality === 'low' ? 4 : 8;
      for (let i = 0; i < flashCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.4;
        fx.pool.spawn(new Particle({
          x: at.x, y: at.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.12 + Math.random() * 0.12,
          size0: 0.05 + Math.random() * 0.03,
          size1: 0.01,
          r: 80, g: 255, b: 80,
          a0: 0.7,
        }));
      }
    });

    // Life Tap — particles sucked inward toward caster (life→mana conversion)
    world.on('spell:lifetap', ({ actor }) => {
      if (typeof getPosition !== "function") return;
      const pos = getPosition(Number(actor || 0));
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;

      // Ring of particles that converge on the caster
      const count = PERF.quality === 'low' ? 14 : 24;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.3;
        const dist = 0.7 + Math.random() * 0.5;
        const px = pos.x + Math.cos(angle) * dist;
        const py = pos.y + Math.sin(angle) * dist;
        const speed = 1.2 + Math.random() * 0.8;
        fx.pool.spawn(new Particle({
          x: px, y: py,
          vx: -Math.cos(angle) * speed,
          vy: -Math.sin(angle) * speed,
          life: 0.35 + Math.random() * 0.15,
          size0: 0.07 + Math.random() * 0.04,
          size1: 0.01,
          r: 140 + ((Math.random() * 50) | 0),
          g: 20 + ((Math.random() * 20) | 0),
          b: 60 + ((Math.random() * 40) | 0),
          a0: 0.85,
        }));
      }
      // Secondary inner burst — small bright motes rushing in fast
      const inner = PERF.quality === 'low' ? 6 : 10;
      for (let i = 0; i < inner; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 0.35 + Math.random() * 0.25;
        const speed = 1.8 + Math.random() * 1.0;
        fx.pool.spawn(new Particle({
          x: pos.x + Math.cos(angle) * dist,
          y: pos.y + Math.sin(angle) * dist,
          vx: -Math.cos(angle) * speed,
          vy: -Math.sin(angle) * speed,
          life: 0.15 + Math.random() * 0.10,
          size0: 0.04 + Math.random() * 0.02,
          size1: 0.005,
          r: 200 + ((Math.random() * 55) | 0),
          g: 60 + ((Math.random() * 30) | 0),
          b: 180 + ((Math.random() * 50) | 0),
          a0: 0.95,
        }));
      }
      startShake(cam, 2, 0.06);
    });
  }

  /** Return active light sources for the lighting engine. */
  function getActiveLights() {
    const out = [];
    const fxTime = Number(getFxTime?.() || 0);
    const step = currentStep();
    const activeReliefKey = (typeof getActiveReliefKey === "function")
      ? normReliefKey(getActiveReliefKey())
      : null;
    for (const [, h] of _impactWarmTiles) {
      if (activeReliefKey != null && h.reliefKey !== activeReliefKey) continue;
      const span = Math.max(1, h.endStep - h.startStep);
      const turnsLeft = h.endStep - step;
      if (turnsLeft <= 0) continue;
      const progress = 1 - Math.max(0, Math.min(1, turnsLeft / span)); // 0..1
      const plateau = progress < 0.42
        ? 1
        : Math.max(0, 1 - ((progress - 0.42) / 0.58));
      const heat = h.base * (0.74 + plateau * 0.26);
      const settle = 0.985 + 0.015 * Math.sin(fxTime * 1.25 + h.phase);
      const flicker = Math.max(0.10, Math.min(1.52, heat * settle));
      out.push({
        x: h.x,
        y: h.y,
        radius: h.radius * (0.84 + plateau * 0.34),
        color: h.color,
        flicker,
      });
    }
    for (let i = 0; i < _impactFlameLights.length; i++) {
      const f = _impactFlameLights[i];
      const life = f.max > 0 ? Math.max(0, Math.min(1, f.ttl / f.max)) : 0;
      if (life <= 0) continue;
      out.push({
        x: f.x,
        y: f.y,
        radius: f.radius * (0.66 + life * 0.44),
        color: [255, 142, 58],
        flicker: 0.40 + life * 0.64 + 0.10 * Math.sin(fxTime * 7.6 + f.phase),
      });
    }
    for (let i = 0; i < _meteorFx.length; i++) {
      const m = _meteorFx[i];
      out.push({ x: m.x, y: m.y, radius: (m.radius || 2) * 3 * m.alpha, color: [255, 140, 40] });
    }
    for (let i = 0; i < _blastwaveFx.length; i++) {
      const b = _blastwaveFx[i];
      out.push({ x: b.x, y: b.y, radius: (b.radius || 2) * 2 * b.alpha, color: [255, 200, 100] });
    }
    for (let i = 0; i < _frostNovaFx.length; i++) {
      const f = _frostNovaFx[i];
      out.push({ x: f.x, y: f.y, radius: (f.radius || 2) * 2.2 * f.alpha, color: [135, 215, 255] });
    }
    for (let i = 0; i < _frostNovaRemnants.length; i++) {
      const rem = _frostNovaRemnants[i];
      const life = rem.max > 0 ? Math.max(0, Math.min(1, rem.ttl / rem.max)) : 0;
      out.push({ x: rem.x, y: rem.y, radius: rem.radius * 1.7 * life, color: [100, 190, 255] });
    }
    for (let i = 0; i < _voidHoleFx.length; i++) {
      const v = _voidHoleFx[i];
      const drift = 0.96 + 0.04 * Math.sin(fxTime * 2.1 + Number(v.phase || 0));
      out.push({
        x: v.x,
        y: v.y,
        radius: Math.max(1.5, (v.radius || 3) * (0.98 + 0.08 * v.progress) * drift),
        kind: "void",
        color: [155, 120, 255],
        voidStrength: Math.max(0.16, Number(v.strength || 0.8) * 2.65 * v.alpha * drift),
        softness: v.collapsing ? 11 : 9,
      });
    }
    for (let i = 0; i < _flashHealFx.length; i++) {
      const f = _flashHealFx[i];
      out.push({ x: f.x, y: f.y, radius: 4 * f.alpha, color: [255, 240, 180] });
    }
    for (let i = 0; i < _smiteFx.length; i++) {
      const s = _smiteFx[i];
      out.push({ x: s.x, y: s.y, radius: 5 * s.alpha, color: [255, 240, 180] });
    }
    for (let i = 0; i < _searchPulseFx.length; i++) {
      const s = _searchPulseFx[i];
      out.push({ x: s.x, y: s.y, radius: 6 * s.alpha, color: [180, 220, 255] });
    }
    for (let i = 0; i < _warCryFx.length; i++) {
      const w = _warCryFx[i];
      out.push({ x: w.x, y: w.y, radius: 4 * w.alpha, color: [255, 80, 30] });
    }
    for (let i = 0; i < _divineShieldFx.length; i++) {
      const d = _divineShieldFx[i];
      out.push({ x: d.x, y: d.y, radius: 4 * d.alpha, color: [255, 230, 120] });
    }
    for (let i = 0; i < _consecrateFx.length; i++) {
      const c = _consecrateFx[i];
      out.push({ x: c.x, y: c.y, radius: (c.radius || 2) * 2.5 * c.alpha, color: [255, 210, 60] });
    }
    for (const [, ch] of _drainLifeChannels) {
      if (ch.from && ch.to) {
        out.push({ x: ch.to.x, y: ch.to.y, radius: 3, color: [255, 50, 50] });
      }
    }
    return out;
  }

  return { tick, drawBlink, drawMeteor, drawBlastwave, drawFrostNova, drawVoidHole, drawFlashHeal, drawSmite, drawPhaseStrike, drawRampage, drawSearchPulse, drawDrainLife, drawEvocation, drawFishing, drawCleave, drawWarCry, drawDivineShield, drawConsecrate, drawSmokeBomb, getActiveLights, installListeners };
}
