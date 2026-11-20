// src/display/fx/boltFxController.js
// Spell bolt and deity wrath lightning FX.

import { startShake } from "../camera/shake.js";
import { setInputLock } from "../input/inputLock.js";
import { clamp01, rgba, pathPolyline, jitterLine } from "./fxGeom.js";
import { Particle } from "../passes/vfx/particles/particlePool.js";
import { dragonBreath as drawDragonBreathGlyphFx } from "../passes/vfx/glyph/effects/dragonBreath.js";
import { ArrowFx, LineFx, PulseFx, DeityBoltFx, ScreenFlashFx, ScreenBoltFx } from "./fxEntries.js";

const FIRE_BREATH_SPEED_TILES_PER_SEC = 5.25;
const FIRE_BREATH_MIN_TRAVEL_SEC = 0.36;
const FIRE_BREATH_MAX_TRAVEL_SEC = 1.05;
const FIRE_BREATH_LINGER_SEC = 0.18;

const LINE_FX_STYLE = Object.freeze({
  bolt: Object.freeze({
    outer: 'rgba(120,200,255,ALPHA)',
    mid: 'rgba(160,220,255,ALPHA)',
    core: 'rgba(230,255,255,ALPHA)',
    pulseOuter: 'rgba(180,240,255,ALPHA)',
    pulseCore: 'rgba(255,255,220,ALPHA)',
    light: Object.freeze([200, 210, 255]),
    pulseLight: Object.freeze([220, 230, 255]),
    shake: 4,
  }),
  holy: Object.freeze({
    outer: 'rgba(255,226,150,ALPHA)',
    mid: 'rgba(255,241,186,ALPHA)',
    core: 'rgba(255,252,236,ALPHA)',
    pulseOuter: 'rgba(255,236,170,ALPHA)',
    pulseCore: 'rgba(255,249,220,ALPHA)',
    light: Object.freeze([255, 240, 180]),
    pulseLight: Object.freeze([255, 246, 205]),
    shake: 2,
  }),
  wet_arc: Object.freeze({
    outer: 'rgba(0,210,230,ALPHA)',
    mid: 'rgba(60,240,255,ALPHA)',
    core: 'rgba(200,255,255,ALPHA)',
    pulseOuter: 'rgba(40,225,245,ALPHA)',
    pulseCore: 'rgba(190,252,255,ALPHA)',
    light: Object.freeze([60, 220, 240]),
    pulseLight: Object.freeze([110, 235, 255]),
    shake: 3,
  }),
});

function getLineFxStyle(style) {
  return LINE_FX_STYLE[String(style || '').toLowerCase()] || LINE_FX_STYLE.bolt;
}

function alphaColor(template, alpha) {
  return template.replace('ALPHA', String(alpha));
}

const DEITY_WRATH_VFX = Object.freeze({
  default: Object.freeze({
    behavior: 'lightning_bolt',
    outer: Object.freeze([95, 165, 255]),
    mid: Object.freeze([170, 220, 255]),
    core: Object.freeze([235, 250, 255]),
    pulse: Object.freeze([210, 245, 255]),
    spark: Object.freeze([130, 210, 255]),
    baseShake: 5,
  }),
  molkhar: Object.freeze({
    behavior: 'lightning_bolt',
    outer: Object.freeze([255, 85, 40]),
    mid: Object.freeze([255, 170, 95]),
    core: Object.freeze([255, 240, 220]),
    pulse: Object.freeze([255, 205, 150]),
    spark: Object.freeze([255, 155, 90]),
    baseShake: 6,
  }),
  seraphine: Object.freeze({
    behavior: 'lightning_bolt',
    outer: Object.freeze([110, 180, 255]),
    mid: Object.freeze([185, 225, 255]),
    core: Object.freeze([245, 255, 255]),
    pulse: Object.freeze([225, 250, 255]),
    spark: Object.freeze([165, 220, 255]),
    baseShake: 5,
  }),
  loki: Object.freeze({
    behavior: 'lightning_bolt',
    outer: Object.freeze([145, 105, 255]),
    mid: Object.freeze([205, 165, 255]),
    core: Object.freeze([250, 240, 255]),
    pulse: Object.freeze([230, 205, 255]),
    spark: Object.freeze([195, 145, 255]),
    baseShake: 6,
  }),
  gaia: Object.freeze({
    behavior: 'lightning_bolt',
    outer: Object.freeze([95, 185, 140]),
    mid: Object.freeze([165, 225, 185]),
    core: Object.freeze([240, 255, 245]),
    pulse: Object.freeze([205, 245, 220]),
    spark: Object.freeze([140, 210, 165]),
    baseShake: 5,
  }),
});

function getWrathVfxProfile(deityId) {
  const key = String(deityId || '').toLowerCase();
  return DEITY_WRATH_VFX[key] || DEITY_WRATH_VFX.default;
}

/**
 * @param {{ world: import('../../lib/ecs-js/index.js').World, cam: object, fx: { pool?: { spawn(p:object):void } }, getPosition: (id:number) => ({x:number,y:number}|null) }} deps
 */
export function createBoltFxController({ world, cam, fx, getPosition }) {
  /** @type {LineFx[]} */
  const _boltFx = [];
  /** @type {PulseFx[]} */
  const _lightPulses = [];
  /** @type {Array<{
   *   from:{x:number,y:number},
   *   to:{x:number,y:number},
   *   tiles:Array<{x:number,y:number}>,
   *   beam: ArrowFx,
   *   linger:number,
   *   lingerMax:number,
   *   age:number,
   *   seed:number,
   *   impactPositions:Array<{x:number,y:number}>,
   *   impactSpawned:boolean
   * }>} */
  const _fireBreathFx = [];
  /** @type {DeityBoltFx[]} */
  const _deityBolts = [];
  /** @type {PulseFx[]} */
  const _deityPulses = [];
  /** @type {ScreenFlashFx[]} */
  const _screenFlash = [];
  /** @type {ScreenBoltFx[]} */
  const _screenBolts = [];

  function isBlocking() {
    return _fireBreathFx.length > 0;
  }

  function syncInputLock() {
    try { setInputLock('boltFx:fireBreath', isBlocking()); } catch (e) { console.debug('[boltFx] input lock sync failed:', e); }
  }

  function _spawnDeityWrath(payload) {
    const playerId = Number(payload?.playerId || 0) | 0;
    if (!(playerId > 0)) return;
    const pos = getPosition(playerId);
    if (!pos) return;

    const x = Number(pos.x);
    const yTarget = Number(pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(yTarget)) return;

    const profile = getWrathVfxProfile(payload?.deityId || '');
    if (profile.behavior !== 'lightning_bolt') return;

    const intensity = clamp01(Number(payload?.intensity || 0));
    const severityScale = Math.max(1, Number(payload?.severityScale || 1));
    const wrathDebt = Math.max(0, Number(payload?.wrathDebt || 0));

    const ttlMain = 0.28
      + Math.min(0.14, intensity * 0.10)
      + Math.min(0.14, (severityScale - 1) * 0.08);
    const mainAmp = 0.08 + Math.min(0.18, (severityScale - 1) * 0.08 + wrathDebt * 0.03);

    _deityBolts.push(new DeityBoltFx({
      from: { x, y: 0 },
      to: { x, y: yTarget },
      ttl: ttlMain, amp: mainAmp, branch: false,
      outer: profile.outer, mid: profile.mid, core: profile.core,
    }));
    _deityPulses.push(new PulseFx({ x, y: yTarget, ttl: 0.32, color: profile.pulse }));
    _screenBolts.push(new ScreenBoltFx({
      x, y: yTarget,
      ttl: ttlMain + 0.12,
      amp: 6 + Math.min(10, (severityScale - 1) * 5 + wrathDebt * 2.5),
      color: profile.core,
    }));

    const branchCount = Math.max(2, 2 + Math.floor((severityScale - 1) * 3 + Math.min(3, wrathDebt * 2)));
    for (let i = 0; i < branchCount; i++) {
      const tStart = 0.12 + Math.random() * 0.68;
      const yStart = yTarget * tStart;
      const xStart = x + (Math.random() - 0.5) * 0.26;
      const yEnd = Math.min(yTarget + 1.6, yStart + 0.9 + Math.random() * (2.4 + severityScale));
      const xEnd = xStart + (Math.random() - 0.5) * (0.8 + severityScale * 0.35);
      const ttl = ttlMain * (0.65 + Math.random() * 0.25);
      _deityBolts.push(new DeityBoltFx({
        from: { x: xStart, y: yStart }, to: { x: xEnd, y: yEnd },
        ttl, amp: mainAmp * 0.75, branch: true,
        outer: profile.outer, mid: profile.mid, core: profile.core,
      }));
      _deityPulses.push(new PulseFx({
        x: xEnd, y: yEnd,
        ttl: 0.16 + Math.random() * 0.12, max: 0.26,
        color: profile.pulse,
      }));
    }

    if (fx?.pool) {
      const lineLength = Math.max(1, Math.abs(yTarget));
      const sparkCount = Math.max(14, Math.round(lineLength * (0.7 + Math.min(2.2, severityScale))));
      for (let i = 0; i < sparkCount; i++) {
        const t = Math.random();
        fx.pool.spawn(new Particle({
          x: x + (Math.random() - 0.5) * 0.34,
          y: yTarget * t + (Math.random() - 0.5) * 0.08,
          vx: (Math.random() - 0.5) * 0.35,
          vy: 0.8 + Math.random() * (2.1 + severityScale),
          ay: 0.9,
          life: 0.14 + Math.random() * 0.26,
          size0: 0.06 + Math.random() * 0.05, size1: 0.01,
          r: profile.spark[0], g: profile.spark[1], b: profile.spark[2],
          a0: 0.82,
          rotVel: (Math.random() - 0.5) * 2.4,
        }));
      }
    }

    const shakePower = Math.min(
      12,
      Math.round(profile.baseShake + intensity * 3 + (severityScale - 1) * 4 + Math.min(2.5, wrathDebt * 1.5))
    );
    const shakeDur = 0.14 + Math.min(0.18, intensity * 0.07 + (severityScale - 1) * 0.05);
    startShake(cam, shakePower, shakeDur);

    const flashDuration = 0.12 + Math.min(0.12, intensity * 0.06 + (severityScale - 1) * 0.04);
    _screenFlash.push(new ScreenFlashFx({ ttl: flashDuration, color: profile.pulse }));
  }

  function _spawnFireBreathParticles(entry, count = 8, opts = {}) {
    if (!fx?.pool || !entry) return;
    const impact = opts?.impact === true;
    const uMin = impact ? 1 : Math.max(0, Math.min(1, Number(opts?.uMin ?? 0)));
    const uMax = impact ? 1 : Math.max(uMin, Math.min(1, Number(opts?.uMax ?? 1)));
    for (let i = 0; i < count; i++) {
      const u = impact
        ? 1
        : uMin + (Math.random() * Math.max(0, uMax - uMin));
      const px = entry.from.x + (entry.to.x - entry.from.x) * u;
      const py = entry.from.y + (entry.to.y - entry.from.y) * u;
      const trailBias = impact ? 0.2 : 0.85;
      fx.pool.spawn(new Particle({
        x: px + (Math.random() - 0.5) * 0.20,
        y: py + (Math.random() - 0.5) * 0.16,
        vx: ((Math.random() - 0.5) * 0.35) + (entry.to.x - entry.from.x) * 0.08 * trailBias,
        vy: -0.22 - Math.random() * 0.55 + (entry.to.y - entry.from.y) * 0.03 * trailBias,
        ay: -0.10,
        life: (impact ? 0.18 : 0.14) + Math.random() * (impact ? 0.24 : 0.20),
        size0: 0.08 + Math.random() * (impact ? 0.12 : 0.08),
        size1: 0.01,
        r: 255,
        g: 120 + ((Math.random() * 110) | 0),
        b: 10 + ((Math.random() * 28) | 0),
        a0: impact ? 0.92 : 0.78,
        rotVel: (Math.random() - 0.5) * 2.8,
      }));
    }
    if (!impact) return;
    for (let i = 0; i < Math.max(2, Math.floor(count / 3)); i++) {
      fx.pool.spawn(new Particle({
        x: entry.to.x + (Math.random() - 0.5) * 0.42,
        y: entry.to.y + (Math.random() - 0.5) * 0.24,
        vx: (Math.random() - 0.5) * 0.22,
        vy: -0.10 - Math.random() * 0.22,
        life: 0.28 + Math.random() * 0.28,
        size0: 0.06 + Math.random() * 0.05,
        size1: 0.01,
        r: 120 + ((Math.random() * 40) | 0),
        g: 50 + ((Math.random() * 26) | 0),
        b: 16 + ((Math.random() * 12) | 0),
        a0: 0.38,
        rotVel: (Math.random() - 0.5) * 1.6,
      }));
    }
  }

  function _spawnDivineIntervention(payload) {
    const playerId = Number(payload?.playerId || 0) | 0;
    if (!(playerId > 0)) return;
    const pos = getPosition(playerId);
    if (!pos) return;

    const profile = getWrathVfxProfile(String(payload?.deityId || ''));
    const kind = String(payload?.kind || '');
    const boonBoost = (kind === 'boon' || kind === 'miracle') ? 1.45 : 1.0;
    _deityPulses.push(new PulseFx({
      x: Number(pos.x),
      y: Number(pos.y),
      ttl: 0.42,
      color: profile.pulse,
      max: 0.52,
    }));
    _deityPulses.push(new PulseFx({
      x: Number(pos.x),
      y: Number(pos.y),
      ttl: 0.28,
      color: profile.core,
      max: 0.32,
    }));

    if (fx?.pool) {
      const count = Math.max(18, Math.floor(26 * boonBoost));
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = (0.38 + Math.random() * 0.42) * boonBoost;
        fx.pool.spawn(new Particle({
          x: Number(pos.x) + (Math.random() - 0.5) * 0.15,
          y: Number(pos.y) + (Math.random() - 0.5) * 0.15,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.12,
          ay: 0.28,
          life: 0.32 + Math.random() * 0.36,
          size0: 0.05 + Math.random() * 0.07,
          size1: 0.01,
          r: profile.spark[0],
          g: profile.spark[1],
          b: profile.spark[2],
          a0: 0.86,
          rotVel: (Math.random() - 0.5) * 2.0,
        }));
      }
    }

    _screenFlash.push(new ScreenFlashFx({ ttl: 0.10, color: profile.pulse }));
    startShake(cam, kind === 'boon' ? 3 : 2, 0.10);
  }

  function _spawnFireBreathImpactParticles(entry) {
    const impacts = Array.isArray(entry.impactPositions) && entry.impactPositions.length
      ? entry.impactPositions
      : [entry.to];
    for (let i = 0; i < impacts.length; i++) {
      const pos = impacts[i];
      _spawnFireBreathParticles({ ...entry, to: pos }, 8, { impact: true });
    }
  }

  const STORM_LIGHTNING_VFX = Object.freeze({
    outer: Object.freeze([140, 180, 255]),
    mid:   Object.freeze([200, 225, 255]),
    core:  Object.freeze([245, 252, 255]),
    pulse: Object.freeze([220, 240, 255]),
    spark: Object.freeze([160, 210, 255]),
  });

  function _spawnStormLightning({ x, y }) {
    const ttl = 0.22 + Math.random() * 0.08;
    const amp = 0.10 + Math.random() * 0.06;
    const pal = STORM_LIGHTNING_VFX;

    // Main bolt from sky to ground
    _deityBolts.push(new DeityBoltFx({
      from: { x, y: 0 }, to: { x, y },
      ttl, amp, branch: false,
      outer: pal.outer, mid: pal.mid, core: pal.core,
    }));
    _deityPulses.push(new PulseFx({ x, y, ttl: 0.28, color: pal.pulse }));
    _screenBolts.push(new ScreenBoltFx({
      x, y, ttl: ttl + 0.10, amp: 7, color: pal.core,
    }));

    // 2-3 forks
    const forkCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < forkCount; i++) {
      const tStart = 0.15 + Math.random() * 0.55;
      const yStart = y * tStart;
      const xStart = x + (Math.random() - 0.5) * 0.3;
      const yEnd = Math.min(y + 1.2, yStart + 1.0 + Math.random() * 2.0);
      const xEnd = xStart + (Math.random() - 0.5) * 1.2;
      _deityBolts.push(new DeityBoltFx({
        from: { x: xStart, y: yStart }, to: { x: xEnd, y: yEnd },
        ttl: ttl * (0.6 + Math.random() * 0.3), amp: amp * 0.7, branch: true,
        outer: pal.outer, mid: pal.mid, core: pal.core,
      }));
      _deityPulses.push(new PulseFx({
        x: xEnd, y: yEnd, ttl: 0.14 + Math.random() * 0.10, max: 0.22,
        color: pal.pulse,
      }));
    }

    // Sparks at impact
    if (fx?.pool) {
      for (let i = 0; i < 18; i++) {
        const t = Math.random();
        fx.pool.spawn(new Particle({
          x: x + (Math.random() - 0.5) * 0.3,
          y: y * t + (Math.random() - 0.5) * 0.06,
          vx: (Math.random() - 0.5) * 0.4,
          vy: 0.6 + Math.random() * 2.0,
          ay: 0.8,
          life: 0.12 + Math.random() * 0.22,
          size0: 0.05 + Math.random() * 0.05, size1: 0.01,
          r: pal.spark[0], g: pal.spark[1], b: pal.spark[2],
          a0: 0.85,
          rotVel: (Math.random() - 0.5) * 2.2,
        }));
      }
    }

    startShake(cam, 4, 0.14);
    _screenFlash.push(new ScreenFlashFx({ ttl: 0.10, color: pal.pulse }));
  }

  function installListeners() {
    world.on('spell:bolt', ({ actor, targetId, spellId, from, to, chainIndex = 0, wet = false }) => {
      if (from && to) {
        _boltFx.push(new LineFx({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, ttl: 0.14, chainIndex: Number(chainIndex || 0), style: wet ? 'wet_arc' : undefined }));
        _lightPulses.push(new PulseFx({ x: to.x, y: to.y, ttl: 0.12 }));
        const lightningPrimary = String(spellId || '').toLowerCase() === 'lightning' && Number(chainIndex || 0) === 0;
        startShake(cam, lightningPrimary ? 6 : 4, lightningPrimary ? 0.22 : 0.18);
      }
    });
    // Content DSL beam: real LineFx + PulseFx + shake (used by presentation system)
    world.on('content:beam:vfx', ({ fromX, fromY, toX, toY, style, shake: shakeAmt }) => {
      if (!Number.isFinite(fromX) || !Number.isFinite(toX)) return;
      _boltFx.push(new LineFx({
        from: { x: fromX + 0.5, y: fromY + 0.5 },
        to: { x: toX + 0.5, y: toY + 0.5 },
        ttl: 0.36,
        style: style || 'holy',
      }));
      _lightPulses.push(new PulseFx({ x: toX + 0.5, y: toY + 0.5, ttl: 0.42, color: [255, 246, 205] }));
      if (shakeAmt !== 0) startShake(cam, shakeAmt ?? 2, 0.10);
    });
    world.on('deity:wrath', ({ playerId, deityId, intensity, severityScale, wrathDebt }) => {
      _spawnDeityWrath({
        playerId: Number(playerId || 0),
        deityId: String(deityId || ''),
        intensity: Number(intensity || 0),
        severityScale: Number(severityScale || 1),
        wrathDebt: Number(wrathDebt || 0),
      });
    });
    world.on('deity:intervention', (payload) => {
      const kind = String(payload?.kind || '');
      if (kind === 'miracle' || kind === 'boon' || kind === 'shrine_blessing' || kind === 'patron_shift' || kind === 'prayer_uncurse') {
        _spawnDivineIntervention(payload);
      }
    });
    world.on('weather:lightning', ({ x, y }) => {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        _spawnStormLightning({ x: Number(x), y: Number(y) });
      }
    });
    world.on('proc:chainLightning', ({ from, to, chainTo }) => {
      if (from && to) {
        _boltFx.push(new LineFx({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, ttl: 0.12 }));
        _lightPulses.push(new PulseFx({ x: to.x, y: to.y, ttl: 0.10 }));
      }
      if (to && chainTo) {
        _boltFx.push(new LineFx({ from: { x: to.x, y: to.y }, to: { x: chainTo.x, y: chainTo.y }, ttl: 0.12, chainIndex: 1 }));
        _lightPulses.push(new PulseFx({ x: chainTo.x, y: chainTo.y, ttl: 0.10 }));
      }
      if (from && to) startShake(cam, 2, 0.10);
    });
    world.on('electrocute:flash', ({ target, isPlayer }) => {
      const id = Number(target || 0) | 0;
      if (!(id > 0) || !isPlayer) return;
      _screenFlash.push(new ScreenFlashFx({ ttl: 0.18, color: [255, 255, 255], peak: 0.9 }));
      startShake(cam, 3, 0.12);
    });
    world.on('spell:smite:dazzle', () => {
      _screenFlash.push(new ScreenFlashFx({ ttl: 0.07, color: [255, 245, 180] }));
    });
    world.on('monster:firebreath', ({ from, to, tiles, hitIds }) => {
      if (!from || !to) return;
      const lineTiles = Array.isArray(tiles)
        ? tiles
          .filter((tile) => tile && Number.isFinite(tile.x) && Number.isFinite(tile.y))
          .map((tile) => ({ x: Number(tile.x), y: Number(tile.y) }))
        : [];
      const dx = Number(to.x) - Number(from.x);
      const dy = Number(to.y) - Number(from.y);
      const len = Math.hypot(dx, dy) || 1;
      const travelDuration = Math.max(
        FIRE_BREATH_MIN_TRAVEL_SEC,
        Math.min(FIRE_BREATH_MAX_TRAVEL_SEC, len / FIRE_BREATH_SPEED_TILES_PER_SEC),
      );
      const impactPositions = [];
      if (Array.isArray(hitIds)) {
        for (let i = 0; i < hitIds.length; i++) {
          const pos = getPosition(Number(hitIds[i] || 0));
          if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
            impactPositions.push({ x: Number(pos.x), y: Number(pos.y) });
          }
        }
      }
      if (!impactPositions.length) {
        impactPositions.push({ x: Number(to.x), y: Number(to.y) });
      }
      const entry = {
        from: { x: Number(from.x), y: Number(from.y) },
        to: { x: Number(to.x), y: Number(to.y) },
        tiles: lineTiles,
        beam: new ArrowFx({
          from: { x: Number(from.x), y: Number(from.y) },
          to: { x: Number(to.x), y: Number(to.y) },
          duration: travelDuration,
          dx: dx / len,
          dy: dy / len,
          len,
          style: 'dragon_breath',
        }),
        linger: FIRE_BREATH_LINGER_SEC,
        lingerMax: FIRE_BREATH_LINGER_SEC,
        age: 0,
        seed: Math.random() * 4096,
        impactPositions,
        impactSpawned: false,
      };
      _fireBreathFx.push(entry);
      _spawnFireBreathParticles(entry, Math.max(5, 2 + lineTiles.length), { uMin: 0, uMax: 0.12 });
      startShake(cam, 2, 0.12);
      syncInputLock();
    });
  }

  function tick(dt) {
    // Spell bolts
    if (_boltFx.length) {
      for (const eff of _boltFx) eff.tick(dt);
      for (let i = _boltFx.length - 1; i >= 0; i--) {
        if (_boltFx[i].expired) _boltFx.splice(i, 1);
      }
    }
    if (_lightPulses.length) {
      for (const f of _lightPulses) f.tick(dt);
      for (let i = _lightPulses.length - 1; i >= 0; i--) {
        if (_lightPulses[i].expired) _lightPulses.splice(i, 1);
      }
    }
    if (_fireBreathFx.length) {
      let changed = false;
      for (let i = _fireBreathFx.length - 1; i >= 0; i--) {
        const fxEntry = _fireBreathFx[i];
        const prevTravelTime = fxEntry.beam.t;
        const prevArrived = fxEntry.beam.arrived;
        const prevProgress = fxEntry.beam.progress;
        fxEntry.age += dt;
        fxEntry.beam.tick(dt);
        const nextProgress = fxEntry.beam.progress;
        _spawnFireBreathParticles(
          fxEntry,
          Math.max(2, Math.ceil(dt * Math.max(16, 10 + fxEntry.tiles.length * 4))),
          {
            uMin: Math.max(0, Math.min(prevProgress, nextProgress) - 0.18),
            uMax: Math.max(prevProgress, nextProgress),
          },
        );
        if (fxEntry.beam.arrived && !fxEntry.impactSpawned) {
          fxEntry.impactSpawned = true;
          _spawnFireBreathImpactParticles(fxEntry);
          startShake(cam, 5, 0.16);
        }
        if (fxEntry.beam.arrived) {
          const travelRemaining = Math.max(0, fxEntry.beam.duration - prevTravelTime);
          const lingerDt = prevArrived ? dt : Math.max(0, dt - travelRemaining);
          fxEntry.linger -= lingerDt;
        }
        if (fxEntry.beam.arrived && fxEntry.linger <= 0) {
          _fireBreathFx.splice(i, 1);
          changed = true;
        }
      }
      if (changed) syncInputLock();
    }
    // Deity wrath
    if (_deityBolts.length) {
      for (let i = _deityBolts.length - 1; i >= 0; i--) {
        _deityBolts[i].tick(dt);
        if (_deityBolts[i].expired) _deityBolts.splice(i, 1);
      }
    }
    if (_deityPulses.length) {
      for (let i = _deityPulses.length - 1; i >= 0; i--) {
        _deityPulses[i].tick(dt);
        if (_deityPulses[i].expired) _deityPulses.splice(i, 1);
      }
    }
    if (_screenFlash.length) {
      for (let i = _screenFlash.length - 1; i >= 0; i--) {
        _screenFlash[i].tick(dt);
        if (_screenFlash[i].expired) _screenFlash.splice(i, 1);
      }
    }
    if (_screenBolts.length) {
      for (let i = _screenBolts.length - 1; i >= 0; i--) {
        _screenBolts[i].tick(dt);
        if (_screenBolts[i].expired) _screenBolts.splice(i, 1);
      }
    }
  }

  function drawBolts(ctx) {
    if (!_boltFx.length && !_lightPulses.length && !_fireBreathFx.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of _lightPulses) {
      const a = p.alpha;
      const pulseColor = Array.isArray(p.color) ? p.color : null;
      const pulseOuter = pulseColor
        ? `rgba(${pulseColor[0]},${pulseColor[1]},${pulseColor[2]},${0.18 * a})`
        : `rgba(180,240,255,${0.18 * a})`;
      const pulseCore = pulseColor
        ? `rgba(255,255,220,${0.10 * a})`
        : `rgba(255,255,220,${0.10 * a})`;
      ctx.fillStyle = pulseOuter;
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pulseCore;
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.35, 0, Math.PI * 2); ctx.fill();
    }
    for (const eff of _boltFx) {
      const alpha = eff.alpha;
      const style = getLineFxStyle(eff.style);
      const pts = jitterLine(eff.from, eff.to, 11, 0.10 * alpha);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = alphaColor(style.outer, 0.18 * alpha);
      ctx.lineWidth = 0.22;
      pathPolyline(ctx, pts); ctx.stroke();
      ctx.strokeStyle = alphaColor(style.mid, 0.35 * alpha);
      ctx.lineWidth = 0.10;
      pathPolyline(ctx, pts); ctx.stroke();
      const core = jitterLine(eff.from, eff.to, 13, 0.05 * alpha);
      ctx.strokeStyle = alphaColor(style.core, 0.9 * alpha);
      ctx.lineWidth = 0.045;
      pathPolyline(ctx, core); ctx.stroke();
    }
    for (let i = 0; i < _fireBreathFx.length; i++) {
      const eff = _fireBreathFx[i];
      const travelProgress = eff.beam.progress;
      const lineAlpha = eff.beam.arrived
        ? Math.max(0, Math.min(1, eff.linger / Math.max(0.001, eff.lingerMax)))
        : Math.max(0.26, Math.min(1, 0.32 + (travelProgress * 1.18)));
      const beamTo = eff.beam.arrived
        ? eff.to
        : {
          x: eff.from.x + (eff.to.x - eff.from.x) * travelProgress,
          y: eff.from.y + (eff.to.y - eff.from.y) * travelProgress,
        };
      const len = Math.max(1, Math.hypot(beamTo.x - eff.from.x, beamTo.y - eff.from.y));
      const pts = jitterLine(eff.from, beamTo, Math.max(8, Math.min(18, Math.floor(len * 3))), 0.08 + 0.04 * lineAlpha);
      ctx.strokeStyle = `rgba(255,70,18,${(0.24 * lineAlpha).toFixed(3)})`;
      ctx.lineWidth = 0.34;
      pathPolyline(ctx, pts); ctx.stroke();
      ctx.strokeStyle = `rgba(255,138,40,${(0.46 * lineAlpha).toFixed(3)})`;
      ctx.lineWidth = 0.16;
      pathPolyline(ctx, pts); ctx.stroke();
      ctx.strokeStyle = `rgba(255,246,208,${(0.92 * lineAlpha).toFixed(3)})`;
      ctx.lineWidth = 0.055;
      pathPolyline(ctx, jitterLine(eff.from, beamTo, Math.max(10, Math.floor(len * 4)), 0.03 + 0.02 * lineAlpha)); ctx.stroke();

      const visibleTiles = eff.beam.arrived
        ? eff.tiles.length
        : Math.max(1, Math.min(eff.tiles.length, Math.ceil(eff.tiles.length * travelProgress)));
      for (let j = 0; j < visibleTiles; j++) {
        const tile = eff.tiles[j];
        const pulse = 0.5 + 0.5 * Math.sin((eff.age * 16) + eff.seed + j * 0.7);
        ctx.fillStyle = `rgba(255,120,24,${(0.10 + 0.08 * pulse * lineAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(tile.x, tile.y, 0.34 + 0.05 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      drawDragonBreathGlyphFx(
        ctx,
        'D',
        eff.from.x,
        eff.from.y,
        1.0 + lineAlpha * 0.08,
        eff.age,
        0,
        eff.seed,
        eff.from.y,
        { gain: lineAlpha },
      );
    }
    ctx.restore();
  }

  function drawDeityWrath(ctx) {
    if (!_deityBolts.length && !_deityPulses.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < _deityPulses.length; i++) {
      const pulse = _deityPulses[i];
      const a = pulse.alpha;
      const outerR = 0.24 + pulse.progress * 0.7;
      const innerR = 0.08 + pulse.progress * 0.26;
      ctx.fillStyle = rgba(pulse.color, 0.16 * a);
      ctx.beginPath(); ctx.arc(pulse.x, pulse.y, outerR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,245,${(0.12 * a).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(pulse.x, pulse.y, innerR, 0, Math.PI * 2); ctx.fill();
    }

    for (let i = 0; i < _deityBolts.length; i++) {
      const seg = _deityBolts[i];
      const alpha = seg.alpha;
      const len = Math.max(1, Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y));
      const points = Math.max(8, Math.min(24, Math.floor(len * (seg.branch ? 1.3 : 1.6))));
      const pts = jitterLine(seg.from, seg.to, points, seg.amp * alpha);
      const widthScale = seg.branch ? 0.72 : 1.0;
      ctx.strokeStyle = rgba(seg.outer, 0.22 * alpha);
      ctx.lineWidth = 0.24 * widthScale;
      pathPolyline(ctx, pts); ctx.stroke();
      ctx.strokeStyle = rgba(seg.mid, 0.42 * alpha);
      ctx.lineWidth = 0.11 * widthScale;
      pathPolyline(ctx, pts); ctx.stroke();
      const core = jitterLine(seg.from, seg.to, points + 2, seg.amp * 0.45 * alpha);
      ctx.strokeStyle = rgba(seg.core, 0.95 * alpha);
      ctx.lineWidth = 0.05 * widthScale;
      pathPolyline(ctx, core); ctx.stroke();
    }

    ctx.restore();
  }

  function drawScreenFlash(ctx, width, height) {
    let strongest = null;
    for (let i = 0; i < _screenFlash.length; i++) {
      const flash = _screenFlash[i];
      if (!strongest || flash.ttl > strongest.ttl) strongest = flash;
    }
    if (!strongest) return;
    const a = strongest.alpha;
    ctx.save();
    if (strongest.peak != null) {
      // High-intensity flash (flashbang): opaque white overlay that fades fast
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255,255,255,${(strongest.peak * a).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    } else {
      // Subtle additive flash (spells, storm lightning)
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(strongest.color, 0.18 * a);
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = `rgba(255,255,255,${(0.05 * a).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  function drawScreenBolts(ctx, width, height) {
    if (!_screenBolts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    const scale = Number(cam.scale || 1);

    for (let i = 0; i < _screenBolts.length; i++) {
      const bolt = _screenBolts[i];
      const alpha = bolt.alpha;
      const sx = (bolt.x - cam.x) * scale + halfW;
      const sy = (bolt.y - cam.y) * scale + halfH;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      if (sx < -80 || sx > width + 80 || sy < -120) continue;
      const endY = Math.max(0, Math.min(height + 120, sy));
      const start = { x: sx, y: 0 };
      const end = { x: sx + (Math.random() - 0.5) * 8, y: endY };
      const segments = Math.max(10, Math.min(26, Math.floor((endY / 34) + 10)));
      const pts = jitterLine(start, end, segments, bolt.amp * alpha);
      ctx.strokeStyle = rgba(bolt.color, 0.25 * alpha);
      ctx.lineWidth = 7.5;
      pathPolyline(ctx, pts); ctx.stroke();
      ctx.strokeStyle = rgba(bolt.color, 0.78 * alpha);
      ctx.lineWidth = 3.2;
      pathPolyline(ctx, pts); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(0.95 * alpha).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      pathPolyline(ctx, jitterLine(start, end, segments + 2, (bolt.amp * 0.42) * alpha)); ctx.stroke();
    }
    ctx.restore();
  }

  function hasScreenEffects() {
    return _screenFlash.length > 0 || _screenBolts.length > 0;
  }

  /** Return active light sources for the lighting engine. */
  function getActiveLights() {
    const out = [];
    for (let i = 0; i < _boltFx.length; i++) {
      const b = _boltFx[i];
      const u = b.progress;
      const style = getLineFxStyle(b.style);
      out.push({
        x: b.from.x + (b.to.x - b.from.x) * u,
        y: b.from.y + (b.to.y - b.from.y) * u,
        radius: 8 * b.alpha,
        color: style.light,
      });
      out.push({ x: b.to.x, y: b.to.y, radius: 5 * b.alpha, color: style.light });
    }
    for (let i = 0; i < _lightPulses.length; i++) {
      const p = _lightPulses[i];
      out.push({ x: p.x, y: p.y, radius: 6 * p.alpha, color: Array.isArray(p.color) ? p.color : [220, 230, 255] });
    }
    for (let i = 0; i < _fireBreathFx.length; i++) {
      const fb = _fireBreathFx[i];
      const u = fb.beam ? fb.beam.progress : 1;
      const hx = fb.from.x + (fb.to.x - fb.from.x) * u;
      const hy = fb.from.y + (fb.to.y - fb.from.y) * u;
      out.push({ x: hx, y: hy, radius: 6, color: [255, 120, 40] });
    }
    return out;
  }

  return {
    isBlocking,
    tick,
    drawBolts,
    drawDeityWrath,
    drawScreenFlash,
    drawScreenBolts,
    hasScreenEffects,
    getActiveLights,
    installListeners,
  };
}
