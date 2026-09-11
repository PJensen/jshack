// src/display/fx/cloudFx.js
// Fire, plasma, poison cloud, and bubble pop VFX (world-space; display-only).

import { startShake } from "../camera/shake.js";
import { Particle } from "../passes/vfx/particles/particlePool.js";
import { BubblePopFx } from "./fxEntries.js";

/**
 * @param {{ world: import('../../lib/ecs-js/index.js').World, cam: object, fx: { pool: { spawn(o:object):void } }, getFxTime: () => number, getPosition: (id:number) => ({x:number,y:number}|null) }} deps
 */
export function createCloudFxController({ world, cam, fx, getFxTime, getPosition }) {
  const isAuraKind = (kind) => {
    const key = String(kind || '').toLowerCase();
    return key === 'ally_aura' || key === 'aura';
  };
  const auraColor = (identity) => {
    const key = String(identity || '').toLowerCase();
    if (key.includes('plague')) return [150, 220, 75];
    if (key.includes('dread')) return [190, 105, 235];
    if (key.includes('void')) return [90, 145, 255];
    if (key.includes('blood')) return [245, 75, 85];
    if (key.includes('drum') || key.includes('wolf')) return [115, 225, 105];
    return [120, 205, 125];
  };
  /** @type {Map<number, { x:number, y:number, radius:number, turnsLeft:number, maxTurns:number, pulseFlash:number, phase:number, fading:boolean, fadeLeft:number, fadeMax:number, medium:string }>} */
  const _fireCloudFx = new Map();
  /** @type {Map<number, { x:number, y:number, radius:number, turnsLeft:number, maxTurns:number, flash:number, phase:number, fading:boolean, fadeLeft:number, fadeMax:number }>} */
  const _plasmaCloudFx = new Map();
  /** @type {Map<number, { x:number, y:number, radius:number, turnsLeft:number, maxTurns:number, phase:number, fading:boolean, fadeLeft:number, fadeMax:number }>} */
  const _allyAuraFx = new Map();
  /** @type {Map<number, { x:number, y:number, radius:number, turnsLeft:number, maxTurns:number, pulseFlash:number, phase:number, fading:boolean, fadeLeft:number, fadeMax:number, medium:string, bubbleClock:number }>} */
  const _poisonCloudFx = new Map();
  /** @type {BubblePopFx[]} */
  const _poisonBubblePops = [];
  /** @type {Array<{ x:number, y:number, ttl:number, max:number, strength:number, phase:number, embers:boolean }>} */
  const _burnPlumes = [];
  /** @type {Map<number, { x:number, y:number, radius:number, turnsLeft:number, maxTurns:number, pulseFlash:number, phase:number, fading:boolean, fadeLeft:number, fadeMax:number, enhanced:boolean }>} */
  const _quakeCloudFx = new Map();

  function clearTransientCloudState() {
    _fireCloudFx.clear();
    _plasmaCloudFx.clear();
    _allyAuraFx.clear();
    _poisonCloudFx.clear();
    _quakeCloudFx.clear();
    _poisonBubblePops.length = 0;
    _burnPlumes.length = 0;
  }

  // --- Particle helpers ---
  function spawnPlasmaCloudSparks(x, y, count = 8) {
    if (!fx?.pool) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 1.2;
      fx.pool.spawn(new Particle({
        x: x + (Math.random() - 0.5) * 0.35,
        y: y + (Math.random() - 0.5) * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.22 + Math.random() * 0.18,
        size0: 0.09 + Math.random() * 0.06,
        size1: 0.02,
        r: 170 + ((Math.random() * 60) | 0),
        g: 235 + ((Math.random() * 20) | 0),
        b: 255,
        a0: 0.9,
      }));
    }
  }

  function spawnPoisonCloudMotes(x, y, count = 8) {
    if (!fx?.pool) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.12 + Math.random() * 0.45;
      fx.pool.spawn(new Particle({
        x: x + (Math.random() - 0.5) * 0.4,
        y: y + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (0.08 + Math.random() * 0.12),
        ay: -0.03,
        life: 0.50 + Math.random() * 0.30,
        size0: 0.09 + Math.random() * 0.05,
        size1: 0.03,
        r: 120 + ((Math.random() * 50) | 0),
        g: 205 + ((Math.random() * 45) | 0),
        b: 90 + ((Math.random() * 40) | 0),
        a0: 0.52,
        rotVel: (Math.random() - 0.5) * 0.9,
      }));
    }
  }

  function spawnFireCloudEmbers(x, y, count = 8) {
    if (!fx?.pool) return;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.95;
      const speed = 0.30 + Math.random() * 0.70;
      fx.pool.spawn(new Particle({
        x: x + (Math.random() - 0.5) * 0.22,
        y: y + 0.08 + (Math.random() - 0.5) * 0.10,
        vx: Math.cos(angle) * speed * 0.34,
        vy: Math.sin(angle) * speed - 0.16,
        ay: -0.10,
        life: 0.28 + Math.random() * 0.26,
        size0: 0.10 + Math.random() * 0.08,
        size1: 0.018,
        r: 255,
        g: 150 + ((Math.random() * 90) | 0),
        b: 24 + ((Math.random() * 36) | 0),
        a0: 0.88,
        rotVel: (Math.random() - 0.5) * 1.4,
      }));
    }
  }

  function spawnBurnPlume(x, y, strength = 1, embers = true) {
    _burnPlumes.push({
      x,
      y,
      ttl: 1.90 + Math.random() * 0.90 + strength * 0.22,
      max: 1.90 + Math.random() * 0.90 + strength * 0.22,
      strength: Math.max(0.8, Number(strength) || 1),
      phase: Math.random() * Math.PI * 2,
      embers: !!embers,
    });
    if (_burnPlumes.length > 48) {
      _burnPlumes.splice(0, _burnPlumes.length - 48);
    }
  }

  function spawnQuakeDust(x, y, count = 6, enhanced = false) {
    if (!fx?.pool) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.10 + Math.random() * 0.35;
      const r = enhanced ? (200 + ((Math.random() * 55) | 0)) : (140 + ((Math.random() * 60) | 0));
      const g = enhanced ? (100 + ((Math.random() * 50) | 0)) : (120 + ((Math.random() * 50) | 0));
      const b = enhanced ? (20 + ((Math.random() * 30) | 0)) : (80 + ((Math.random() * 40) | 0));
      fx.pool.spawn(new Particle({
        x: x + (Math.random() - 0.5) * 0.30,
        y: y + (Math.random() - 0.5) * 0.20,
        vx: Math.cos(angle) * speed * 0.4,
        vy: Math.sin(angle) * speed - 0.20 - Math.random() * 0.15,
        ay: -0.06,
        life: 0.35 + Math.random() * 0.30,
        size0: 0.07 + Math.random() * 0.05,
        size1: 0.02,
        r, g, b,
        a0: enhanced ? 0.80 : 0.55,
        rotVel: (Math.random() - 0.5) * 1.0,
      }));
    }
    if (enhanced) {
      for (let i = 0; i < Math.max(2, count >> 1); i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.20 + Math.random() * 0.50;
        fx.pool.spawn(new Particle({
          x: x + (Math.random() - 0.5) * 0.20,
          y: y + (Math.random() - 0.5) * 0.15,
          vx: Math.cos(angle) * speed * 0.5,
          vy: Math.sin(angle) * speed - 0.25,
          ay: 0.06,
          life: 0.22 + Math.random() * 0.18,
          size0: 0.06 + Math.random() * 0.04,
          size1: 0.01,
          r: 255, g: 140 + ((Math.random() * 80) | 0), b: 20 + ((Math.random() * 30) | 0),
          a0: 0.85,
          rotVel: (Math.random() - 0.5) * 1.8,
        }));
      }
    }
  }

  /**
   * Choose a bubbling point within a cloud's Chebyshev footprint.
   * @param {{x:number, y:number, radius:number}} cloud
   */
  function randomPoisonBubblePoint(cloud) {
    const r = Math.max(0, Number(cloud?.radius || 0) | 0);
    if (r <= 0) {
      return {
        x: cloud.x + (Math.random() - 0.5) * 0.28,
        y: cloud.y + (Math.random() - 0.5) * 0.28,
      };
    }
    const ox = (Math.random() * (r * 2 + 1) - r) + (Math.random() - 0.5) * 0.25;
    const oy = (Math.random() * (r * 2 + 1) - r) + (Math.random() - 0.5) * 0.25;
    return { x: cloud.x + ox, y: cloud.y + oy };
  }

  function spawnPoisonBubblePop(x, y, strength = 1) {
    const s = Math.max(1, Number(strength || 1) | 0);

    if (fx?.pool) {
      const count = 2 + s;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1; // mostly upward
        const speed = 0.08 + Math.random() * 0.24;
        fx.pool.spawn(new Particle({
          x: x + (Math.random() - 0.5) * 0.12,
          y: y + (Math.random() - 0.5) * 0.08,
          vx: Math.cos(angle) * speed * 0.6,
          vy: Math.sin(angle) * speed - 0.04,
          ay: -0.04,
          life: 0.18 + Math.random() * 0.20,
          size0: 0.05 + Math.random() * 0.04,
          size1: 0.01,
          r: 170 + ((Math.random() * 45) | 0),
          g: 240 + ((Math.random() * 15) | 0),
          b: 150 + ((Math.random() * 40) | 0),
          a0: 0.48,
          rotVel: (Math.random() - 0.5) * 0.6,
        }));
      }
    }

    const pops = 1 + ((Math.random() < 0.35 * s) ? 1 : 0);
    for (let i = 0; i < pops; i++) {
      _poisonBubblePops.push(new BubblePopFx({
        x: x + (Math.random() - 0.5) * 0.10,
        y: y + (Math.random() - 0.5) * 0.08,
        ttl: 0.28 + Math.random() * 0.22,
        r0: 0.02 + Math.random() * 0.04,
        r1: 0.15 + Math.random() * 0.10,
        rise: 0.08 + Math.random() * 0.10,
        phase: Math.random() * Math.PI * 2,
      }));
    }
  }

  // --- Tick ---
  /** @param {number} dt */
  function tick(dt) {
    // Fire hazards
    for (const [hazardId, cloud] of _fireCloudFx) {
      cloud.pulseFlash = Math.max(0, cloud.pulseFlash - dt);
      if (cloud.fading) {
        cloud.fadeLeft = Math.max(0, cloud.fadeLeft - dt);
        if (cloud.fadeLeft <= 0) {
          _fireCloudFx.delete(hazardId);
        }
        continue;
      }
      if (!world.isAlive(hazardId)) {
        cloud.fading = true;
        cloud.fadeMax = 0.35;
        cloud.fadeLeft = Math.max(cloud.fadeLeft, cloud.fadeMax);
        cloud.pulseFlash = Math.max(cloud.pulseFlash, 0.10);
      }
    }

    // Plasma clouds
    for (const [cloudId, cloud] of _plasmaCloudFx) {
      cloud.flash = Math.max(0, cloud.flash - dt);
      if (cloud.fading) {
        cloud.fadeLeft = Math.max(0, cloud.fadeLeft - dt);
        if (cloud.fadeLeft <= 0) {
          _plasmaCloudFx.delete(cloudId);
        }
        continue;
      }
      // Safety net: if entity is gone but we missed expired event, start a soft fade.
      if (!world.isAlive(cloudId)) {
        cloud.fading = true;
        cloud.fadeMax = 0.35;
        cloud.fadeLeft = Math.max(cloud.fadeLeft, cloud.fadeMax);
        cloud.flash = Math.max(cloud.flash, 0.12);
      }
    }

    // Poison clouds
    for (const [hazardId, cloud] of _poisonCloudFx) {
      cloud.pulseFlash = Math.max(0, cloud.pulseFlash - dt);
      cloud.bubbleClock = Number.isFinite(cloud.bubbleClock)
        ? Number(cloud.bubbleClock)
        : (0.08 + Math.random() * 0.16);

      if (!cloud.fading) {
        cloud.bubbleClock -= dt;
        while (cloud.bubbleClock <= 0) {
          const p = randomPoisonBubblePoint(cloud);
          const dense = cloud.medium === 'floor';
          const strength = (dense && Math.random() < 0.32) ? 2 : 1;
          spawnPoisonBubblePop(p.x, p.y, strength);
          cloud.bubbleClock += (dense ? 0.10 : 0.15) + Math.random() * (dense ? 0.12 : 0.18);
        }
      }

      if (cloud.fading) {
        cloud.fadeLeft = Math.max(0, cloud.fadeLeft - dt);
        if (cloud.fadeLeft <= 0) {
          _poisonCloudFx.delete(hazardId);
        }
        continue;
      }
      if (!world.isAlive(hazardId)) {
        cloud.fading = true;
        cloud.fadeMax = 0.45;
        cloud.fadeLeft = Math.max(cloud.fadeLeft, cloud.fadeMax);
        cloud.pulseFlash = Math.max(cloud.pulseFlash, 0.10);
      }
    }

    // Quake hazards
    for (const [hazardId, cloud] of _quakeCloudFx) {
      cloud.pulseFlash = Math.max(0, cloud.pulseFlash - dt);
      cloud.phase += dt * 12.0;
      if (cloud.fading) {
        cloud.fadeLeft = Math.max(0, cloud.fadeLeft - dt);
        if (cloud.fadeLeft <= 0) {
          _quakeCloudFx.delete(hazardId);
        }
        continue;
      }
      if (!world.isAlive(hazardId)) {
        cloud.fading = true;
        cloud.fadeMax = 0.40;
        cloud.fadeLeft = Math.max(cloud.fadeLeft, cloud.fadeMax);
      }
    }

    // Friendly aura fields
    for (const [hazardId, aura] of _allyAuraFx) {
      if (aura.fading) {
        aura.fadeLeft = Math.max(0, aura.fadeLeft - dt);
        if (aura.fadeLeft <= 0) _allyAuraFx.delete(hazardId);
        continue;
      }
      if (!world.isAlive(hazardId)) {
        aura.fading = true;
        aura.fadeMax = 0.45;
        aura.fadeLeft = Math.max(aura.fadeLeft, aura.fadeMax);
      }
    }

    // Bubble pops
    for (let i = _poisonBubblePops.length - 1; i >= 0; i--) {
      _poisonBubblePops[i].tick(dt);
      if (_poisonBubblePops[i].expired) _poisonBubblePops.splice(i, 1);
    }

    for (let i = _burnPlumes.length - 1; i >= 0; i--) {
      const plume = _burnPlumes[i];
      plume.ttl -= dt;
      if (plume.ttl <= 0) _burnPlumes.splice(i, 1);
    }
  }

  // --- Draw: Fire hazards (area rendering moved to SDF light field) ---
  /** @param {CanvasRenderingContext2D} _ctx */
  function drawFire(ctx) {
    if (!_fireCloudFx.size) return;
    ctx.save();
    const _fxTime = getFxTime();
    const TAU = Math.PI * 2;

    for (const cloud of _fireCloudFx.values()) {
      const cx = cloud.x;
      const cy = cloud.y;
      const r = Math.max(0, cloud.radius | 0);
      const lifeFactor = Math.max(0.30, Math.min(1, (cloud.maxTurns > 0) ? (cloud.turnsLeft / cloud.maxTurns) : 1));
      const fadeFactor = cloud.fading
        ? Math.max(0, Math.min(1, (cloud.fadeMax > 0) ? (cloud.fadeLeft / cloud.fadeMax) : 0))
        : 1;
      const alphaScale = lifeFactor * fadeFactor;
      if (alphaScale < 0.01) continue;
      const flashBoost = cloud.pulseFlash > 0 ? (cloud.pulseFlash / 0.20) : 0;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
          const tx = cx + dx;
          const ty = cy + dy;

          // Flickering fire fill
          const flicker = 0.55 + 0.45 * Math.sin(_fxTime * 5.2 + cloud.phase + dx * 1.3 + dy * 0.9);
          const fillA = (0.08 + flicker * 0.06 + flashBoost * 0.08) * alphaScale;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(180,60,12,${fillA.toFixed(3)})`;
          ctx.beginPath();
          ctx.rect(tx - 0.5, ty - 0.5, 1, 1);
          ctx.fill();

          // Bright ember core
          ctx.globalCompositeOperation = 'lighter';
          const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 7.8 + cloud.phase * 0.6 + dx * 2.1 + dy * 1.7);
          const coreA = (0.06 + pulse * 0.06 + flashBoost * 0.10) * alphaScale;
          const grad = ctx.createRadialGradient(tx, ty, 0.02, tx, ty, 0.38);
          grad.addColorStop(0, `rgba(255,200,80,${coreA.toFixed(3)})`);
          grad.addColorStop(0.5, `rgba(255,100,20,${(coreA * 0.55).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(140,30,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(tx, ty, 0.38, 0, TAU);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  // --- Draw: Poison clouds — Bezier perimeter + flat fill + bubble pops ---
  // Light field provides the atmospheric green tint underneath; this pass adds
  // a well-defined "spilled liquid" boundary on top.
  /** @param {CanvasRenderingContext2D} ctx */
  function drawPoison(ctx) {
    if (!_poisonCloudFx.size && !_poisonBubblePops.length) return;
    ctx.save();
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();

    // Bezier perimeter + flat fill for each active poison cloud
    for (const cloud of _poisonCloudFx.values()) {
      const cx = cloud.x;
      const cy = cloud.y;
      const r = Math.max(0, cloud.radius | 0);
      const wobble = 0.5 + 0.5 * Math.sin(_fxTime * 2.1 + cloud.phase * 0.8);
      const lifeFactor = Math.max(0.32, Math.min(1, (cloud.maxTurns > 0) ? (cloud.turnsLeft / cloud.maxTurns) : 1));
      const fadeFactor = cloud.fading
        ? Math.max(0, Math.min(1, (cloud.fadeMax > 0) ? (cloud.fadeLeft / cloud.fadeMax) : 0))
        : 1;
      const alphaScale = lifeFactor * fadeFactor;
      if (alphaScale < 0.01) continue;

      // Build undulating Bezier contour
      const points = [];
      const pointCount = Math.max(10, 12 + r * 6);
      const baseR = r + 0.88;
      const driftX = 0.05 * Math.sin(_fxTime * 1.2 + cloud.phase);
      const driftY = 0.05 * Math.cos(_fxTime * 1.0 + cloud.phase * 0.6);
      for (let i = 0; i < pointCount; i++) {
        const t = i / pointCount;
        const a = t * TAU;
        const noise =
          0.10 * Math.sin(_fxTime * 2.7 + a * 2.4 + cloud.phase) +
          0.06 * Math.sin(_fxTime * 3.6 + a * 4.2 - cloud.phase * 0.4);
        const rr = baseR + noise + 0.05 * wobble;
        points.push({
          x: cx + driftX + Math.cos(a) * rr,
          y: cy + driftY + Math.sin(a) * (rr * 0.92),
        });
      }

      if (points.length >= 3) {
        const p0 = points[0];
        const p1 = points[1];
        const firstMid = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };
        ctx.beginPath();
        ctx.moveTo(firstMid.x, firstMid.y);
        for (let i = 1; i <= points.length; i++) {
          const p = points[i % points.length];
          const n = points[(i + 1) % points.length];
          const mid = { x: (p.x + n.x) * 0.5, y: (p.y + n.y) * 0.5 };
          ctx.quadraticCurveTo(p.x, p.y, mid.x, mid.y);
        }
        ctx.closePath();

        // Flat semi-transparent fill — defined area like spilled liquid
        ctx.globalCompositeOperation = 'source-over';
        const fillA = (0.09 + wobble * 0.04) * alphaScale;
        ctx.fillStyle = `rgba(62,130,48,${fillA.toFixed(3)})`;
        ctx.fill();

        // Crisp perimeter stroke
        const edgeA = (0.18 + wobble * 0.06) * alphaScale;
        ctx.strokeStyle = `rgba(140,210,110,${edgeA.toFixed(3)})`;
        ctx.lineWidth = 0.055;
        ctx.stroke();
      }
    }

    // Bubble pop ring VFX on top
    if (_poisonBubblePops.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < _poisonBubblePops.length; i++) {
        const pop = _poisonBubblePops[i];
        const u = pop.progress;
        const alive = pop.alpha;
        const rr = pop.radius;
        const wob = 0.015 * Math.sin(_fxTime * 6.5 + pop.phase);
        const x = pop.x + wob;
        const y = pop.y;

        const ringA = (0.24 * alive) + 0.02;
        ctx.strokeStyle = `rgba(176,255,132,${ringA.toFixed(3)})`;
        ctx.lineWidth = 0.045 + (1 - u) * 0.015;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = `rgba(90,196,68,${(ringA * 0.65).toFixed(3)})`;
        ctx.lineWidth = 0.028;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.01, rr * 0.68), 0, TAU);
        ctx.stroke();

        const coreA = (0.10 + (1 - u) * 0.18) * alive;
        if (coreA > 0.01) {
          ctx.fillStyle = `rgba(206,255,170,${coreA.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.008, (1 - u) * 0.055), 0, TAU);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  /** @param {CanvasRenderingContext2D} ctx */
  function drawBurnPlumes(ctx) {
    if (!_burnPlumes.length) return;
    ctx.save();
    const _fxTime = getFxTime();

    for (let i = 0; i < _burnPlumes.length; i++) {
      const plume = _burnPlumes[i];
      const life = plume.max > 0 ? Math.max(0, Math.min(1, plume.ttl / plume.max)) : 0;
      const age = 1 - life;
      const age2 = age * age;
      const lift = age * (0.34 + plume.strength * 0.16) + age2 * (0.26 + plume.strength * 0.14);
      const sway = Math.sin(_fxTime * 1.9 + plume.phase) * (0.02 + age * 0.07);
      const drift = Math.cos(_fxTime * 1.1 + plume.phase * 0.7) * age * 0.04;
      const cx = plume.x + sway + drift;
      const cy = plume.y - 0.10 - lift;
      const smokeAlpha = Math.max(0, (0.05 + age * 0.10 + age2 * 0.18) * (0.85 + plume.strength * 0.10));
      const baseRx = 0.18 + plume.strength * 0.06 + age * 0.05;
      const baseRy = 0.10 + plume.strength * 0.03 + age * 0.06;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(20,18,16,${smokeAlpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, baseRx, baseRy, age * 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(54,42,34,${(smokeAlpha * 0.72).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(cx - 0.07 - age * 0.03, cy - 0.09 - age * 0.03, baseRx * 0.78, baseRy * 0.92, -0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 0.06 + age * 0.04, cy - 0.14 - age * 0.05, baseRx * 0.68, baseRy * 0.84, 0.24, 0, Math.PI * 2);
      ctx.fill();

      if (!plume.embers) continue;
      ctx.globalCompositeOperation = 'lighter';
      const emberAlpha = Math.max(0, 0.12 + life * 0.30 + age * 0.22);
      for (let j = 0; j < 4; j++) {
        const sparkPhase = plume.phase + j * 2.1;
        const ex = plume.x + Math.sin(_fxTime * 4.6 + sparkPhase) * (0.03 + j * 0.018);
        const ey = plume.y - 0.03 - age * (0.24 + j * 0.10) + Math.cos(_fxTime * 3.7 + sparkPhase) * 0.02;
        ctx.fillStyle = j === 0
          ? `rgba(255,248,210,${emberAlpha.toFixed(3)})`
          : j === 1
            ? `rgba(255,194,92,${(emberAlpha * 0.95).toFixed(3)})`
            : `rgba(255,108,26,${(emberAlpha * 0.86).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(ex, ey, 0.030 + j * 0.006, 0, Math.PI * 2);
        ctx.fill();
      }

      const coreAlpha = Math.max(0, 0.16 + life * 0.24);
      ctx.fillStyle = `rgba(255,214,120,${coreAlpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(plume.x, plume.y - 0.04, 0.06 + plume.strength * 0.014, 0.11 + plume.strength * 0.028, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // --- Draw: Plasma clouds ---
  // Volumetric layered glow + discrete-snap branching crackle arcs.
  // No perimeter contour — halo from SDF light field (getActiveLights contour points).
  /** @param {CanvasRenderingContext2D} ctx */
  function drawPlasma(ctx) {
    if (!_plasmaCloudFx.size) return;
    ctx.save();
    const TAU = Math.PI * 2;
    const _fxTime = getFxTime();

    for (const cloud of _plasmaCloudFx.values()) {
      const cx = cloud.x;
      const cy = cloud.y;
      const r = Math.max(0, cloud.radius | 0);
      const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 8.5 + cloud.phase);
      const lifeFactor = Math.max(0.35, Math.min(1, (cloud.maxTurns > 0) ? (cloud.turnsLeft / cloud.maxTurns) : 1));
      const fadeFactor = cloud.fading
        ? Math.max(0, Math.min(1, (cloud.fadeMax > 0) ? (cloud.fadeLeft / cloud.fadeMax) : 0))
        : 1;
      const flashBoost = cloud.flash > 0 ? (cloud.flash / 0.26) : 0;
      const alphaScale = lifeFactor * fadeFactor;

      // Drifting core offset — churning internal motion.
      const driftX = 0.22 * Math.sin(_fxTime * 1.3 + cloud.phase);
      const driftY = 0.22 * Math.cos(_fxTime * 1.1 + cloud.phase * 0.7);
      const kx = cx + driftX;
      const ky = cy + driftY;

      ctx.globalCompositeOperation = 'lighter';

      // Outer diffuse glow.
      const coreR = 0.55 + pulse * 0.12 + flashBoost * 0.10;
      let grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, coreR);
      grad.addColorStop(0,   `rgba(210,255,255,${((0.45 + pulse * 0.25 + flashBoost * 0.30) * alphaScale).toFixed(3)})`);
      grad.addColorStop(0.4, `rgba(80,190,255,${((0.25 + pulse * 0.10) * alphaScale).toFixed(3)})`);
      grad.addColorStop(1,   'rgba(10,50,120,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(kx, ky, coreR, 0, TAU);
      ctx.fill();

      // Tight inner hot point — overdriven near-white center.
      const pinR = 0.13 + pulse * 0.04;
      grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, pinR);
      grad.addColorStop(0,   `rgba(255,255,255,${((0.70 + pulse * 0.20 + flashBoost * 0.20) * alphaScale).toFixed(3)})`);
      grad.addColorStop(0.5, `rgba(180,240,255,${((0.40 + pulse * 0.15) * alphaScale).toFixed(3)})`);
      grad.addColorStop(1,   'rgba(60,160,220,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(kx, ky, pinR, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  // --- Draw: Quake — emissive crack lines only (ground tint via light field) ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawQuake(ctx) {
    if (!_quakeCloudFx.size) return;
    ctx.save();
    const _fxTime = getFxTime();
    const TAU = Math.PI * 2;

    for (const cloud of _quakeCloudFx.values()) {
      const cx = cloud.x;
      const cy = cloud.y;
      const r = Math.max(0, cloud.radius | 0);
      const enhanced = !!cloud.enhanced;
      const lifeFactor = Math.max(0.25, Math.min(1, (cloud.maxTurns > 0) ? (cloud.turnsLeft / cloud.maxTurns) : 1));
      const fadeFactor = cloud.fading
        ? Math.max(0, Math.min(1, (cloud.fadeMax > 0) ? (cloud.fadeLeft / cloud.fadeMax) : 0))
        : 1;
      const flashBoost = cloud.pulseFlash > 0 ? (cloud.pulseFlash / 0.20) : 0;
      const alphaScale = lifeFactor * fadeFactor;
      const tremor = Math.sin(_fxTime * 18.0 + cloud.phase) * 0.015 * alphaScale;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
          const tx = cx + dx + tremor;
          const ty = cy + dy;

          ctx.globalCompositeOperation = enhanced ? 'lighter' : 'source-over';
          const crackA = (enhanced ? (0.40 + flashBoost * 0.20) : (0.30 + flashBoost * 0.12)) * alphaScale;
          ctx.strokeStyle = enhanced
            ? `rgba(255,100,20,${crackA.toFixed(3)})`
            : `rgba(139,115,85,${crackA.toFixed(3)})`;
          ctx.lineWidth = enhanced ? 0.05 : 0.04;

          const seed = (dx + 5) * 17 + (dy + 5) * 31;
          const crackCount = 3 + (seed & 1);
          for (let c = 0; c < crackCount; c++) {
            const baseAngle = (c / crackCount) * TAU + (seed * 0.37 + c * 1.1);
            const jitter = Math.sin(seed * 2.3 + c * 5.7) * 0.35;
            const angle = baseAngle + jitter;
            const len = 0.22 + (((seed + c * 7) % 13) / 13) * 0.20;
            const midAngle = angle + Math.sin(seed * 1.7 + c * 3.1) * 0.6;
            const midLen = len * 0.55;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.quadraticCurveTo(
              tx + Math.cos(midAngle) * midLen,
              ty + Math.sin(midAngle) * midLen,
              tx + Math.cos(angle) * len,
              ty + Math.sin(angle) * len,
            );
            ctx.stroke();
          }

          if (enhanced) {
            const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 6.0 + cloud.phase + dx * 0.9 + dy * 0.7);
            const glowA = (0.10 + pulse * 0.08 + flashBoost * 0.10) * alphaScale;
            const grad = ctx.createRadialGradient(tx, ty, 0.02, tx, ty, 0.32);
            grad.addColorStop(0, `rgba(255,160,40,${glowA.toFixed(3)})`);
            grad.addColorStop(0.6, `rgba(200,60,10,${(glowA * 0.5).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(120,20,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(tx, ty, 0.32, 0, TAU);
            ctx.fill();
          }
        }
      }
    }

    ctx.restore();
  }

  // --- Draw: friendly aura fields ---
  /** @param {CanvasRenderingContext2D} ctx */
  function drawAllyAura(ctx) {
    if (!_allyAuraFx.size) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const TAU = Math.PI * 2;
    const now = getFxTime();
    for (const aura of _allyAuraFx.values()) {
      const life = Math.max(0.35, Math.min(1, aura.maxTurns > 0 ? aura.turnsLeft / aura.maxTurns : 1));
      const fade = aura.fading ? Math.max(0, aura.fadeMax > 0 ? aura.fadeLeft / aura.fadeMax : 0) : 1;
      const pulse = 0.65 + 0.35 * Math.sin(now * 5.5 + aura.phase);
      const alpha = life * fade;
      const radius = Math.max(0.5, aura.radius | 0);
      const [r, g, b] = aura.color || [120, 205, 125];

      ctx.fillStyle = `rgba(${r},${g},${b},${(0.035 * alpha).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(aura.x, aura.y, radius + 0.1, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = `rgba(${Math.min(255, r + 55)},${Math.min(255, g + 35)},${Math.min(255, b + 35)},${(0.45 * alpha * pulse).toFixed(3)})`;
      ctx.lineWidth = 0.07 + 0.025 * pulse;
      ctx.beginPath();
      ctx.arc(aura.x, aura.y, radius, 0, TAU);
      ctx.stroke();

      ctx.strokeStyle = `rgba(${Math.min(255, r + 25)},${Math.min(255, g + 25)},${Math.min(255, b + 75)},${(0.28 * alpha).toFixed(3)})`;
      ctx.lineWidth = 0.04;
      for (let i = 0; i < 3; i++) {
        const start = now * 0.35 + aura.phase + i * (TAU / 3);
        ctx.beginPath();
        ctx.arc(aura.x, aura.y, Math.max(0.5, radius - 0.14), start, start + 0.70);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- Listeners ---
  function installListeners() {
    world.on('dungeon:transitioned', () => {
      clearTransientCloudState();
    });

    world.on('plasmaCloud:spawned', ({ cloudId, at, radius, turnsLeft }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const id = Number(cloudId || 0) | 0;
      if (!(id > 0)) return;
      const r = Math.max(0, Number(radius || 1) | 0);
      const ttl = Math.max(1, Number(turnsLeft || 1) | 0);
      _plasmaCloudFx.set(id, {
        x: at.x,
        y: at.y,
        radius: r,
        turnsLeft: ttl,
        maxTurns: ttl,
        flash: 0.24,
        phase: Math.random() * Math.PI * 2,
        fading: false,
        fadeLeft: 0,
        fadeMax: 0,
      });
      // Fill every dangerous tile with initial spark activity.
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
          spawnPlasmaCloudSparks(at.x + dx, at.y + dy, 2);
        }
      }
      startShake(cam, 2, 0.10);
    });

    world.on('plasmaCloud:pulse', ({ cloudId, at, radius, turnsLeft, affectedIds }) => {
      const id = Number(cloudId || 0) | 0;
      if (!(id > 0)) return;
      const r = Math.max(0, Number(radius || 1) | 0);
      const ttl = Math.max(0, Number(turnsLeft || 0) | 0);
      const prev = _plasmaCloudFx.get(id);
      const next = {
        x: (at && Number.isFinite(at.x)) ? at.x : (prev?.x ?? 0),
        y: (at && Number.isFinite(at.y)) ? at.y : (prev?.y ?? 0),
        radius: r,
        turnsLeft: ttl,
        maxTurns: Math.max(prev?.maxTurns ?? 0, ttl),
        flash: 0.26,
        phase: prev?.phase ?? (Math.random() * Math.PI * 2),
        fading: false,
        fadeLeft: 0,
        fadeMax: 0,
      };
      _plasmaCloudFx.set(id, next);

      if (Array.isArray(affectedIds)) {
        for (let i = 0; i < affectedIds.length; i++) {
          const tpos = getPosition(Number(affectedIds[i] || 0));
          if (!tpos) continue;
          spawnPlasmaCloudSparks(tpos.x, tpos.y, 5);
        }
      } else {
        // Fallback: keep it visually loud even if the payload omits affected ids.
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
            if (Math.random() < 0.35) spawnPlasmaCloudSparks(next.x + dx, next.y + dy, 2);
          }
        }
      }
      startShake(cam, 2, 0.08);
    });

    world.on('plasmaCloud:expired', ({ cloudId, at, radius }) => {
      const id = Number(cloudId || 0) | 0;
      if (!(id > 0)) return;
      const cloud = _plasmaCloudFx.get(id);
      if (!cloud) return;
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
        cloud.x = at.x;
        cloud.y = at.y;
      }
      if (Number.isFinite(radius)) cloud.radius = Math.max(0, Number(radius) | 0);
      cloud.fading = true;
      cloud.fadeMax = 0.45;
      cloud.fadeLeft = cloud.fadeMax;
      cloud.flash = Math.max(cloud.flash, 0.16);
    });

    world.on('hazard:spawned', (evt) => {
      const { hazardId, kind, at, radius, turnsLeft, medium, identity } = evt;
      if (isAuraKind(kind)) {
        const id = Number(hazardId || 0) | 0;
        if (!(id > 0) || !at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
        const ttl = Math.max(1, Number(turnsLeft || 1) | 0);
        _allyAuraFx.set(id, {
          x: at.x,
          y: at.y,
          radius: Math.max(0, Number(radius || 0) | 0),
          turnsLeft: ttl,
          maxTurns: ttl,
          color: auraColor(identity),
          phase: Math.random() * Math.PI * 2,
          fading: false,
          fadeLeft: 0,
          fadeMax: 0,
        });
        return;
      }
      if (String(kind || '').toLowerCase() === 'quake') {
        if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
        const id = Number(hazardId || 0) | 0;
        if (!(id > 0)) return;
        const r = Math.max(0, Number(radius || 0) | 0);
        const ttl = Math.max(1, Number(turnsLeft || 1) | 0);
        const identity = String(evt.identity || '');
        const enhanced = identity === 'quake_volcanic';
        _quakeCloudFx.set(id, {
          x: at.x, y: at.y, radius: r,
          turnsLeft: ttl, maxTurns: ttl,
          pulseFlash: 0.20,
          phase: Math.random() * Math.PI * 2,
          fading: false, fadeLeft: 0, fadeMax: 0,
          enhanced,
        });
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
            spawnQuakeDust(at.x + dx, at.y + dy, 4, enhanced);
          }
        }
        startShake(cam, enhanced ? 4 : 2, 0.14);
        return;
      }
      if (String(kind || '').toLowerCase() === 'fire') {
        if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
        const id = Number(hazardId || 0) | 0;
        if (!(id > 0)) return;
        const r = Math.max(0, Number(radius || 0) | 0);
        const ttl = Math.max(1, Number(turnsLeft || 1) | 0);
        _fireCloudFx.set(id, {
          x: at.x,
          y: at.y,
          radius: r,
          turnsLeft: ttl,
          maxTurns: ttl,
          pulseFlash: 0.18,
          phase: Math.random() * Math.PI * 2,
          fading: false,
          fadeLeft: 0,
          fadeMax: 0,
          medium: String(medium || 'floor').toLowerCase() === 'floor' ? 'floor' : 'air',
        });
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
            spawnFireCloudEmbers(at.x + dx, at.y + dy, 3);
          }
        }
        return;
      }
      const hazardKind = String(kind || '').toLowerCase();
      if (hazardKind !== 'poison' && hazardKind !== 'gas') return;
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const id = Number(hazardId || 0) | 0;
      if (!(id > 0)) return;
      const r = Math.max(0, Number(radius || 1) | 0);
      const ttl = Math.max(1, Number(turnsLeft || 1) | 0);
      _poisonCloudFx.set(id, {
        x: at.x,
        y: at.y,
        radius: r,
        turnsLeft: ttl,
        maxTurns: ttl,
        pulseFlash: 0.20,
        phase: Math.random() * Math.PI * 2,
        fading: false,
        fadeLeft: 0,
        fadeMax: 0,
        medium: String(medium || 'air').toLowerCase() === 'floor' ? 'floor' : 'air',
        bubbleClock: 0.08 + Math.random() * 0.16,
      });
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
          if (Math.random() < 0.85) spawnPoisonCloudMotes(at.x + dx, at.y + dy, 2);
        }
      }
      const seedCloud = { x: at.x, y: at.y, radius: r };
      const popBursts = Math.max(2, 1 + r);
      for (let i = 0; i < popBursts; i++) {
        const p = randomPoisonBubblePoint(seedCloud);
        spawnPoisonBubblePop(p.x, p.y, Math.random() < 0.28 ? 2 : 1);
      }
    });

    world.on('hazard:pulse', ({ hazardId, kind, at, radius, turnsLeft, affectedIds, medium }) => {
      if (isAuraKind(kind)) {
        const id = Number(hazardId || 0) | 0;
        if (!(id > 0)) return;
        const prev = _allyAuraFx.get(id);
        _allyAuraFx.set(id, {
          x: at && Number.isFinite(at.x) ? at.x : (prev?.x ?? 0),
          y: at && Number.isFinite(at.y) ? at.y : (prev?.y ?? 0),
          radius: Math.max(0, Number(radius || 0) | 0),
          turnsLeft: Math.max(0, Number(turnsLeft || 0) | 0),
          maxTurns: Math.max(prev?.maxTurns ?? 0, Number(turnsLeft || 0) | 0),
          color: prev?.color || auraColor(''),
          phase: prev?.phase ?? (Math.random() * Math.PI * 2),
          fading: false,
          fadeLeft: 0,
          fadeMax: 0,
        });
        if (fx?.pool && Array.isArray(affectedIds)) {
          for (const affectedId of affectedIds) {
            const pos = getPosition(Number(affectedId || 0));
            if (!pos) continue;
            fx.pool.spawn(new Particle({
              x: pos.x,
              y: pos.y - 0.2,
              vx: (Math.random() - 0.5) * 0.12,
              vy: -0.25 - Math.random() * 0.20,
              ay: -0.04,
              life: 0.35 + Math.random() * 0.20,
              size0: 0.055,
              size1: 0.01,
              r: 160,
              g: 255,
              b: 110,
              a0: 0.72,
            }));
          }
        }
        return;
      }
      if (String(kind || '').toLowerCase() === 'quake') {
        const id = Number(hazardId || 0) | 0;
        if (!(id > 0)) return;
        const r = Math.max(0, Number(radius || 0) | 0);
        const ttl = Math.max(0, Number(turnsLeft || 0) | 0);
        const prev = _quakeCloudFx.get(id);
        const enhanced = prev?.enhanced ?? false;
        const next = {
          x: (at && Number.isFinite(at.x)) ? at.x : (prev?.x ?? 0),
          y: (at && Number.isFinite(at.y)) ? at.y : (prev?.y ?? 0),
          radius: r, turnsLeft: ttl,
          maxTurns: Math.max(prev?.maxTurns ?? 0, ttl),
          pulseFlash: 0.22,
          phase: prev?.phase ?? (Math.random() * Math.PI * 2),
          fading: false, fadeLeft: 0, fadeMax: 0,
          enhanced,
        };
        _quakeCloudFx.set(id, next);
        if (Array.isArray(affectedIds)) {
          for (let i = 0; i < affectedIds.length; i++) {
            const tpos = getPosition(Number(affectedIds[i] || 0));
            if (!tpos) continue;
            spawnQuakeDust(tpos.x, tpos.y, 5, enhanced);
          }
        } else {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
              if (Math.random() < 0.5) spawnQuakeDust(next.x + dx, next.y + dy, 3, enhanced);
            }
          }
        }
        startShake(cam, enhanced ? 3 : 2, 0.10);
        return;
      }
      if (String(kind || '').toLowerCase() === 'fire') {
        const id = Number(hazardId || 0) | 0;
        if (!(id > 0)) return;
        const r = Math.max(0, Number(radius || 0) | 0);
        const ttl = Math.max(0, Number(turnsLeft || 0) | 0);
        const prev = _fireCloudFx.get(id);
        const next = {
          x: (at && Number.isFinite(at.x)) ? at.x : (prev?.x ?? 0),
          y: (at && Number.isFinite(at.y)) ? at.y : (prev?.y ?? 0),
          radius: r,
          turnsLeft: ttl,
          maxTurns: Math.max(prev?.maxTurns ?? 0, ttl),
          pulseFlash: 0.20,
          phase: prev?.phase ?? (Math.random() * Math.PI * 2),
          fading: false,
          fadeLeft: 0,
          fadeMax: 0,
          medium: String(medium || prev?.medium || 'floor').toLowerCase() === 'floor' ? 'floor' : 'air',
        };
        _fireCloudFx.set(id, next);
        if (Array.isArray(affectedIds) && affectedIds.length > 0) {
          for (let i = 0; i < affectedIds.length; i++) {
            const pos = getPosition(Number(affectedIds[i] || 0));
            if (!pos) continue;
            spawnFireCloudEmbers(pos.x, pos.y, 5);
          }
        } else {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
              if (Math.random() < 0.35) spawnFireCloudEmbers(next.x + dx, next.y + dy, 2);
            }
          }
        }
        return;
      }
      const hazardKind = String(kind || '').toLowerCase();
      if (hazardKind !== 'poison' && hazardKind !== 'gas') return;
      const id = Number(hazardId || 0) | 0;
      if (!(id > 0)) return;
      const r = Math.max(0, Number(radius || 1) | 0);
      const ttl = Math.max(0, Number(turnsLeft || 0) | 0);
      const prev = _poisonCloudFx.get(id);
      const next = {
        x: (at && Number.isFinite(at.x)) ? at.x : (prev?.x ?? 0),
        y: (at && Number.isFinite(at.y)) ? at.y : (prev?.y ?? 0),
        radius: r,
        turnsLeft: ttl,
        maxTurns: Math.max(prev?.maxTurns ?? 0, ttl),
        pulseFlash: 0.24,
        phase: prev?.phase ?? (Math.random() * Math.PI * 2),
        fading: false,
        fadeLeft: 0,
        fadeMax: 0,
        medium: String(medium || prev?.medium || 'air').toLowerCase() === 'floor' ? 'floor' : 'air',
        bubbleClock: Number.isFinite(prev?.bubbleClock)
          ? Math.max(0.04, Number(prev?.bubbleClock || 0))
          : (0.08 + Math.random() * 0.14),
      };
      _poisonCloudFx.set(id, next);

      if (Array.isArray(affectedIds)) {
        for (let i = 0; i < affectedIds.length; i++) {
          const tpos = getPosition(Number(affectedIds[i] || 0));
          if (!tpos) continue;
          spawnPoisonCloudMotes(tpos.x, tpos.y, 4);
          if (Math.random() < 0.72) {
            spawnPoisonBubblePop(
              tpos.x + (Math.random() - 0.5) * 0.18,
              tpos.y + (Math.random() - 0.5) * 0.12,
              Math.random() < 0.22 ? 2 : 1,
            );
          }
        }
      } else {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
            if (Math.random() < 0.28) spawnPoisonCloudMotes(next.x + dx, next.y + dy, 2);
          }
        }
        const popBursts = Math.max(1, r);
        for (let i = 0; i < popBursts; i++) {
          const p = randomPoisonBubblePoint(next);
          spawnPoisonBubblePop(p.x, p.y, 1);
        }
      }
    });

    world.on('hazard:expired', ({ hazardId, kind, at, radius }) => {
      if (!isAuraKind(kind)) return;
      const id = Number(hazardId || 0) | 0;
      const aura = _allyAuraFx.get(id);
      if (!aura) return;
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
        aura.x = at.x;
        aura.y = at.y;
      }
      if (Number.isFinite(radius)) aura.radius = Math.max(0, Number(radius) | 0);
      aura.fading = true;
      aura.fadeMax = 0.45;
      aura.fadeLeft = aura.fadeMax;
    });

    world.on('hazard:expired', ({ hazardId, kind, at, radius }) => {
      if (String(kind || '').toLowerCase() === 'quake') {
        const id = Number(hazardId || 0) | 0;
        if (!(id > 0)) return;
        const cloud = _quakeCloudFx.get(id);
        if (!cloud) return;
        if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
          cloud.x = at.x;
          cloud.y = at.y;
        }
        if (Number.isFinite(radius)) cloud.radius = Math.max(0, Number(radius) | 0);
        cloud.fading = true;
        cloud.fadeMax = 0.40;
        cloud.fadeLeft = cloud.fadeMax;
        spawnQuakeDust(cloud.x, cloud.y, 6, cloud.enhanced);
        return;
      }
      if (String(kind || '').toLowerCase() === 'fire') {
        const id = Number(hazardId || 0) | 0;
        if (!(id > 0)) return;
        const cloud = _fireCloudFx.get(id);
        if (!cloud) return;
        if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
          cloud.x = at.x;
          cloud.y = at.y;
        }
        if (Number.isFinite(radius)) cloud.radius = Math.max(0, Number(radius) | 0);
        cloud.fading = true;
        cloud.fadeMax = 0.30;
        cloud.fadeLeft = cloud.fadeMax;
        cloud.pulseFlash = Math.max(cloud.pulseFlash, 0.10);
        spawnFireCloudEmbers(cloud.x, cloud.y, 4);
        return;
      }
      const hazardKind = String(kind || '').toLowerCase();
      if (hazardKind !== 'poison' && hazardKind !== 'gas') return;
      const id = Number(hazardId || 0) | 0;
      if (!(id > 0)) return;
      const cloud = _poisonCloudFx.get(id);
      if (!cloud) return;
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
        cloud.x = at.x;
        cloud.y = at.y;
      }
      if (Number.isFinite(radius)) cloud.radius = Math.max(0, Number(radius) | 0);
      cloud.fading = true;
      cloud.fadeMax = 0.55;
      cloud.fadeLeft = cloud.fadeMax;
      cloud.pulseFlash = Math.max(cloud.pulseFlash, 0.12);
      const popBursts = Math.max(1, 1 + (cloud.radius | 0));
      for (let i = 0; i < popBursts; i++) {
        const p = randomPoisonBubblePoint(cloud);
        spawnPoisonBubblePop(p.x, p.y, 1);
      }
    });

    world.on('hazard:ignited', ({ hazardId, fromKind, toKind, at, radius }) => {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      const from = String(fromKind || '').toLowerCase();
      const to = String(toKind || '').toLowerCase();
      if (from !== 'gas' || to !== 'fire') return;
      const id = Number(hazardId || 0) | 0;
      const r = Math.max(0, Number(radius || 0) | 0);

      // End any lingering gas/poison cloud entry immediately.
      if (id > 0) _poisonCloudFx.delete(id);

      // Ignition burst at the conversion point so it reads as a detonation.
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
          const px = at.x + dx;
          const py = at.y + dy;
          spawnFireCloudEmbers(px, py, 4);
          if (Math.random() < 0.6) spawnPoisonCloudMotes(px, py, 2);
        }
      }
      startShake(cam, Math.max(2, 2 + r), 0.12);
    });

    world.on('tile:burned', ({ x, y, burnedKind }) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const kind = String(burnedKind || 'tree');
      const structure = kind === 'wall' || kind === 'door' || kind === 'fence';
      spawnBurnPlume(Number(x), Number(y), structure ? 1.7 : 1.1, true);
    });

    world.on('entity:burned', ({ x, y }) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      spawnBurnPlume(Number(x), Number(y), 1.25, true);
    });
  }

  /** Return active light sources for the lighting engine.
   *  One LightDef per tile within each cloud's Chebyshev footprint —
   *  small radii for minimal glow (legibility, not drama). */
  function getActiveLights() {
    const out = [];
    const _fxTime = getFxTime();

    // -- Fire: compact warm hotspot, gentle breathing flicker --
    for (const [, cloud] of _fireCloudFx) {
      const r = Math.max(0, cloud.radius | 0);
      const life = Math.max(0.30, Math.min(1, cloud.maxTurns > 0 ? cloud.turnsLeft / cloud.maxTurns : 1));
      const fade = cloud.fading ? Math.max(0, cloud.fadeMax > 0 ? cloud.fadeLeft / cloud.fadeMax : 0) : 1;
      const a = life * fade;
      if (a < 0.01) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
          const flk = 0.80 + 0.14 * Math.sin(_fxTime * 3.1 + cloud.phase + dx * 0.7 + dy * 0.5);
          out.push({ x: cloud.x + dx, y: cloud.y + dy, radius: 0.9, color: [214, 104, 36], flicker: a * flk });
        }
      }
    }

    // -- Plasma: single hot point on the death tile, high-freq shimmer --
    for (const [, cloud] of _plasmaCloudFx) {
      const life = Math.max(0.35, Math.min(1, cloud.maxTurns > 0 ? cloud.turnsLeft / cloud.maxTurns : 1));
      const fade = cloud.fading ? Math.max(0, cloud.fadeMax > 0 ? cloud.fadeLeft / cloud.fadeMax : 0) : 1;
      const a = life * fade;
      if (a < 0.01) continue;
      const driftX = 0.22 * Math.sin(_fxTime * 1.3 + cloud.phase);
      const driftY = 0.22 * Math.cos(_fxTime * 1.1 + cloud.phase * 0.7);
      const shimmer = 0.65 + 0.35 * Math.sin(_fxTime * 8.5 + cloud.phase)
                               * Math.sin(_fxTime * 13.1 + cloud.phase * 0.6);
      out.push({ x: cloud.x + driftX, y: cloud.y + driftY, radius: 1.2, color: [120, 220, 255], flicker: a * Math.max(0.4, shimmer) });
    }

    // -- Poison: dim green, high-freq dual-sin bubbling --
    for (const [, cloud] of _poisonCloudFx) {
      const r = Math.max(0, cloud.radius | 0);
      const life = Math.max(0.32, Math.min(1, cloud.maxTurns > 0 ? cloud.turnsLeft / cloud.maxTurns : 1));
      const fade = cloud.fading ? Math.max(0, cloud.fadeMax > 0 ? cloud.fadeLeft / cloud.fadeMax : 0) : 1;
      const a = life * fade;
      if (a < 0.01) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
          const bubble = 0.65 + 0.35 * Math.sin(_fxTime * 7.3 + cloud.phase + dx * 1.9 + dy * 2.3)
                                     * Math.sin(_fxTime * 11.1 + cloud.phase * 0.7 + dx * 0.8);
          out.push({ x: cloud.x + dx, y: cloud.y + dy, radius: 0.8, color: [65, 145, 50], flicker: a * Math.max(0.4, bubble) });
        }
      }
    }

    // -- Quake: very dim brown (enhanced: warmer, slightly brighter) --
    for (const [, cloud] of _quakeCloudFx) {
      const r = Math.max(0, cloud.radius | 0);
      const life = Math.max(0.25, Math.min(1, cloud.maxTurns > 0 ? cloud.turnsLeft / cloud.maxTurns : 1));
      const fade = cloud.fading ? Math.max(0, cloud.fadeMax > 0 ? cloud.fadeLeft / cloud.fadeMax : 0) : 1;
      const a = life * fade;
      if (a < 0.01) continue;
      const enh = !!cloud.enhanced;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
          out.push({ x: cloud.x + dx, y: cloud.y + dy, radius: 0.3, color: enh ? [140, 60, 20] : [100, 80, 55], flicker: a * (enh ? 0.7 : 0.4) });
        }
      }
    }

    // -- Friendly aura: soft green/blue field glow --
    for (const [, aura] of _allyAuraFx) {
      const life = Math.max(0.35, Math.min(1, aura.maxTurns > 0 ? aura.turnsLeft / aura.maxTurns : 1));
      const fade = aura.fading ? Math.max(0, aura.fadeMax > 0 ? aura.fadeLeft / aura.fadeMax : 0) : 1;
      const a = life * fade;
      if (a < 0.01) continue;
      const r = Math.max(0, aura.radius | 0);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
          out.push({ x: aura.x + dx, y: aura.y + dy, radius: 0.45, color: aura.color || [120, 205, 125], flicker: a * 0.35 });
        }
      }
    }

    return out;
  }

  return { tick, drawFire, drawPoison, drawPlasma, drawQuake, drawAllyAura, drawBurnPlumes, getActiveLights, installListeners };
}
