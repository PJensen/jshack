// src/display/fx/deathEssenceFxController.js
// Leaves a small lingering "spirit essence" orb when an entity dies.
// Display-only VFX: spawned from the rules 'died' event, colorized from palette fg,
// and scaled by the dead entity's vitality.

import { buildPalette } from "../palette/index.js";

const INSTALLED_KEY = Symbol.for("jshack:display:deathEssenceFx:installed");
const MAX_ORBS = 256;
const ARRIVE_DURATION = 0.26;
const PALETTE = buildPalette();
const CYAN_GLOW = Object.freeze({ r: 116, g: 244, b: 255 });

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function easeOutCubic(t) {
  const u = 1 - clamp01(t);
  return 1 - (u * u * u);
}

function easeOutBack(t) {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * ((x - 1) ** 3) + c1 * ((x - 1) ** 2);
}

function parseHexColor(hex) {
  const raw = String(hex || "").trim();
  if (!raw) return { r: 207, g: 232, b: 255 };
  let h = raw[0] === "#" ? raw.slice(1) : raw;
  if (h.length === 3) h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return { r: 207, g: 232, b: 255 };
  const n = Number.parseInt(h, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function fgForIdentity(identity) {
  const key = String(identity || "").trim();
  return (
    PALETTE[key]?.fg
    || PALETTE.monster?.fg
    || "#cfe8ff"
  );
}

function orbScaleFromVitality(maxHp) {
  const hp = Math.max(1, Number(maxHp) || 1);
  // Square-root curve keeps early HP differences readable while preventing giant bosses
  // from creating absurdly large essence spheres.
  const t = clamp01((Math.sqrt(hp) - Math.sqrt(6)) / (Math.sqrt(140) - Math.sqrt(6)));
  return 0.82 + t * 1.10;
}

function seededUnit(seed) {
  const x = Math.sin((seed + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * @param {{
 *   world: import('../../lib/ecs-js/index.js').World,
 *   getFxTime?: () => number,
 *   getPosition?: (id:number) => ({x:number,y:number}|null),
 *   getEntityIdentity?: (id:number) => string,
 *   getEntityVitality?: (id:number) => ({ hp?:number, maxHp?:number }|null),
 * }} deps
 */
export function createDeathEssenceFxController({
  world,
  getFxTime,
  getPosition,
  getEntityIdentity,
  getEntityVitality,
}) {
  /** @type {Array<{
   *   x:number,
   *   y:number,
   *   bornAt:number,
   *   arrivalHeight:number,
   *   hoverAmp:number,
   *   hoverSpeed:number,
   *   phase:number,
   *   radius:number,
   *   glowRadius:number,
   *   r:number,
   *   g:number,
   *   b:number,
   * }>} */
  const orbs = [];
  /** @type {Map<number, number>} */
  const orbIndexByEntity = new Map();
  /** @type {Map<number, { dx:number, dy:number, force:number, cause:string, critical:boolean, at:number }>} */
  const pendingImpulseByEntity = new Map();

  let spawnSerial = 0;
  const now = () => Math.max(0, Number(getFxTime?.() || 0));

  function spawnDeathEssence(id) {
    const entityId = Number(id || 0) | 0;
    if (!(entityId > 0)) return;

    const pos = getPosition ? getPosition(entityId) : null;
    if (!pos) return;

    const vit = getEntityVitality ? getEntityVitality(entityId) : null;
    const maxHp = Math.max(1, Number(vit?.maxHp || vit?.hp || 1));
    const scale = orbScaleFromVitality(maxHp);
    const identity = getEntityIdentity ? getEntityIdentity(entityId) : "";
    const { r, g, b } = parseHexColor(fgForIdentity(identity));

    const seed = (entityId * 131 + spawnSerial++ * 31) >>> 0;
    const jitterA = seededUnit(seed);
    const jitterB = seededUnit(seed ^ 0x9e3779b9);

    const orb = {
      entityId,
      maxHp,
      x: Number(pos.x) + (jitterA - 0.5) * 0.06,
      y: Number(pos.y) + (jitterB - 0.5) * 0.06,
      bornAt: now(),
      arrivalHeight: 0.76 + jitterA * 0.34,
      hoverAmp: 0.018 + jitterB * 0.016,
      hoverSpeed: 1.5 + jitterA * 1.2,
      phase: jitterB * Math.PI * 2,
      radius: 0.082 * scale,
      glowRadius: 0.104 * scale,
      r,
      g,
      b,
      fromX: Number(pos.x),
      fromY: Number(pos.y),
      toX: Number(pos.x),
      toY: Number(pos.y),
      moveStartAt: now(),
      moveDuration: ARRIVE_DURATION,
      peak: 0.22,
    };
    orbs.push(orb);
    orbIndexByEntity.set(entityId, orbs.length - 1);

    const pendingImpulse = pendingImpulseByEntity.get(entityId);
    if (pendingImpulse) {
      applyImpulse(orb, pendingImpulse);
      pendingImpulseByEntity.delete(entityId);
    }

    if (orbs.length > MAX_ORBS) {
      const dropCount = orbs.length - MAX_ORBS;
      for (let i = 0; i < dropCount; i++) {
        orbIndexByEntity.delete(Number(orbs[i]?.entityId || 0) | 0);
      }
      orbs.splice(0, dropCount);
      orbIndexByEntity.clear();
      for (let i = 0; i < orbs.length; i++) {
        orbIndexByEntity.set(Number(orbs[i].entityId || 0) | 0, i);
      }
    }
  }

  function captureDamageImpulse(ev) {
    const targetId = Number(ev?.target || 0) | 0;
    if (!(targetId > 0)) return;

    const rawDx = Number(ev?.impactVector?.dx || 0);
    const rawDy = Number(ev?.impactVector?.dy || 0);
    const mag = Math.hypot(rawDx, rawDy);
    const dx = mag > 0.0001 ? (rawDx / mag) : 0;
    const dy = mag > 0.0001 ? (rawDy / mag) : 0;
    const dmg = Math.max(0, Number(ev?.amount || 0));
    const force = Math.max(0, Math.min(3, dmg / 12));
    const cause = String(ev?.cause || "");
    const critical = !!ev?.critical;

    pendingImpulseByEntity.set(targetId, {
      dx,
      dy,
      force,
      cause,
      critical,
      at: now(),
    });
  }

  function applyImpulse(orb, impulse) {
    if (!orb || !impulse) return;
    const seed = (Number(orb.entityId || 0) * 131 + spawnSerial * 31) >>> 0;
    const j1 = seededUnit(seed ^ 0x9e3779b9);
    const j2 = seededUnit(seed ^ 0xc2b2ae35);
    const idx = Number(impulse.dx || 0);
    const idy = Number(impulse.dy || 0);
    const force = Math.max(0, Math.min(3, Number(impulse.force || 0)));
    const cause = String(impulse.cause || "");

    let pushBase = 0.60, pushPerF = 0.45;
    let fanBase = 0.80, fanPerF = 0.55;
    let drift = 0.20;
    if (cause === "melee" || cause === "retaliation") {
      pushBase = 0.70; pushPerF = 0.55;
      fanBase = 1.00; fanPerF = 0.70;
    } else if (cause === "ranged") {
      pushBase = 1.00; pushPerF = 0.65;
      fanBase = 0.35; fanPerF = 0.20;
    } else if (cause === "spell:phase_strike") {
      pushBase = 1.20; pushPerF = 0.80;
      fanBase = 1.30; fanPerF = 0.90;
    } else if (cause === "spell:smite" || cause === "spell:meteor") {
      pushBase = 0; pushPerF = 0;
      fanBase = 0; fanPerF = 0;
      drift = 0.35;
    } else if (cause.startsWith("spell:")) {
      pushBase = 0.85; pushPerF = 0.60;
      fanBase = 0.90; fanPerF = 0.60;
    } else if (cause.includes("burn")) {
      pushBase = 0.10; pushPerF = 0.05;
      fanBase = 0.15; fanPerF = 0.08;
      drift = 0.10;
    }

    const critAmp = impulse.critical ? 1.55 : 1;
    const critLift = impulse.critical ? 1.7 : 1;
    const critHang = impulse.critical ? 1.35 : 1;
    const wScatter = critAmp;
    const wLift = critLift;
    const wHang = critHang;

    let toX = orb.x;
    let toY = orb.y;
    if ((idx || idy) && (pushBase > 0 || fanBase > 0)) {
      const push = (pushBase + pushPerF * force) * wScatter;
      toX += idx * push;
      toY += idy * push;
      const perpX = -idy;
      const perpY = idx;
      const fan = (j1 - 0.5) * (fanBase + fanPerF * force) * wScatter;
      toX += perpX * fan;
      toY += perpY * fan;
    }
    toX += (j1 - 0.5) * drift * wScatter;
    toY += (j2 - 0.5) * drift * wScatter;

    const dist = Math.hypot(toX - orb.x, toY - orb.y);
    if (!(dist > 0) || dist > 5) return;

    let durBase = 0.30, durDist = 0.12, durForce = 0.05;
    let pkBase = 0.30, pkDist = 0.25, pkForce = 0.12;
    if (cause === "spell:phase_strike") {
      durBase = 0.22; durDist = 0.08; durForce = 0.03;
      pkBase = 0.50; pkDist = 0.35; pkForce = 0.20;
    } else if (cause === "spell:smite" || cause === "spell:meteor") {
      durBase = 0.28; durDist = 0.10; durForce = 0.04;
      pkBase = 0.55; pkDist = 0.40; pkForce = 0.18;
    } else if (cause === "ranged") {
      durBase = 0.18; durDist = 0.07; durForce = 0.03;
      pkBase = 0.20; pkDist = 0.15; pkForce = 0.06;
    }
    orb.fromX = orb.x;
    orb.fromY = orb.y;
    orb.toX = toX;
    orb.toY = toY;
    orb.moveStartAt = now();
    orb.moveDuration = (durBase + dist * durDist + j1 * 0.08 + force * durForce) * wHang;
    orb.peak = (pkBase + dist * pkDist + j2 * 0.12 + force * pkForce) * wLift;
  }

  function installListeners() {
    if (world[INSTALLED_KEY]) return;
    world[INSTALLED_KEY] = true;

    world.on("damaged", (ev) => {
      captureDamageImpulse(ev || {});
    });

    world.on("died", ({ id }) => {
      spawnDeathEssence(id);
    });

    world.on("item:dropped", ({ actor, source, impulse }) => {
      if (String(source || "") !== "death" || !impulse) return;
      const actorId = Number(actor || 0) | 0;
      if (!(actorId > 0)) return;
      const idx = orbIndexByEntity.get(actorId);
      const src = {
        dx: Number(impulse?.dx || 0),
        dy: Number(impulse?.dy || 0),
        force: Math.max(0, Math.min(3, Number(impulse?.force || 0))),
        cause: String(impulse?.cause || ""),
        critical: !!impulse?.critical,
      };
      if (idx == null) {
        pendingImpulseByEntity.set(actorId, { ...src, at: now() });
        return;
      }
      const orb = orbs[idx];
      if (!orb) return;
      applyImpulse(orb, src);
    });
  }

  function tick(_dt) {
    void _dt;
  }

  /** @param {CanvasRenderingContext2D} bctx */
  function draw(bctx) {
    if (!bctx || orbs.length === 0) return;

    const tNow = now();
    bctx.save();

    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      const age = Math.max(0, tNow - o.bornAt);
      const moveT = clamp01((tNow - o.moveStartAt) / Math.max(0.001, o.moveDuration));
      const moveEase = 1 - ((1 - moveT) ** 3);
      const lift = 4 * o.peak * moveEase * (1 - moveEase);
      o.x = o.fromX + (o.toX - o.fromX) * moveEase;
      o.y = o.fromY + (o.toY - o.fromY) * moveEase;
      const arriveT = clamp01(age / ARRIVE_DURATION);
      const settle = 1 - easeOutCubic(arriveT);
      const dropOffset = o.arrivalHeight * settle;
      const pop = (arriveT < 0.45)
        ? (0.16 + 1.06 * easeOutBack(arriveT / 0.45))
        : (1.22 - 0.22 * easeOutCubic((arriveT - 0.45) / 0.55));
      const hover = age > ARRIVE_DURATION
        ? (Math.sin((age - ARRIVE_DURATION) * o.hoverSpeed + o.phase) * o.hoverAmp)
        : 0;
      const y = o.y - dropOffset - hover;

      const pulse = 0.95 + 0.05 * Math.sin(age * 2.1 + o.phase);
      const glowR = o.glowRadius * pop * pulse;
      const coreR = o.radius * pop;
      const yWithArc = y - lift;

      // ── Breathing pulse: size oscillates gently ──
      const breathe = 1 + 0.08 * Math.sin(age * 1.6 + o.phase * 2.3);
      const gR = glowR * breathe;
      const cR = coreR * breathe;

      // ── Flicker: rapid subtle alpha variation for living feel ──
      const flicker = 0.92 + 0.08 * Math.sin(age * 11.3 + o.phase * 5.1)
        * Math.sin(age * 7.7 + o.phase);

      // Blend entity color into the glow — creature identity dominates,
      // with a subtle cyan spiritual accent.
      const glR = (o.r * 0.6 + CYAN_GLOW.r * 0.4) | 0;
      const glG = (o.g * 0.6 + CYAN_GLOW.g * 0.4) | 0;
      const glB = (o.b * 0.6 + CYAN_GLOW.b * 0.4) | 0;

      // ── Outer glow (lighter blend) — creature-tinted ──
      bctx.globalCompositeOperation = "lighter";
      const glow = bctx.createRadialGradient(o.x, yWithArc, 0, o.x, yWithArc, gR);
      glow.addColorStop(0, `rgba(${glR},${glG},${glB},${(0.46 * flicker).toFixed(3)})`);
      glow.addColorStop(0.30, `rgba(${o.r},${o.g},${o.b},${(0.22 * flicker).toFixed(3)})`);
      glow.addColorStop(0.70, `rgba(${o.r},${o.g},${o.b},0.06)`);
      glow.addColorStop(1, `rgba(${o.r},${o.g},${o.b},0)`);
      bctx.fillStyle = glow;
      bctx.beginPath();
      bctx.arc(o.x, yWithArc, gR, 0, Math.PI * 2);
      bctx.fill();

      // ── Faint cyan spirit rim — the "soul" undertone beneath the identity ──
      const rimR = gR * 0.55;
      const rimA = 0.08 + 0.04 * Math.sin(age * 2.8 + o.phase);
      const rim = bctx.createRadialGradient(o.x, yWithArc, rimR * 0.6, o.x, yWithArc, rimR);
      rim.addColorStop(0, `rgba(${CYAN_GLOW.r},${CYAN_GLOW.g},${CYAN_GLOW.b},0)`);
      rim.addColorStop(0.5, `rgba(${CYAN_GLOW.r},${CYAN_GLOW.g},${CYAN_GLOW.b},${(rimA * flicker).toFixed(3)})`);
      rim.addColorStop(1, `rgba(${CYAN_GLOW.r},${CYAN_GLOW.g},${CYAN_GLOW.b},0)`);
      bctx.fillStyle = rim;
      bctx.beginPath();
      bctx.arc(o.x, yWithArc, rimR, 0, Math.PI * 2);
      bctx.fill();

      // ── Core sphere — hot white center fading to deep creature color ──
      bctx.globalCompositeOperation = "source-over";
      const darkR = Math.max(0, o.r - 50) | 0;
      const darkG = Math.max(0, o.g - 50) | 0;
      const darkB = Math.max(0, o.b - 50) | 0;
      const core = bctx.createRadialGradient(o.x, yWithArc, cR * 0.1, o.x, yWithArc, cR);
      core.addColorStop(0, `rgba(255,255,255,${(0.94 * flicker).toFixed(3)})`);
      core.addColorStop(0.35, `rgba(${Math.min(255, o.r + 60)},${Math.min(255, o.g + 60)},${Math.min(255, o.b + 60)},${(0.88 * flicker).toFixed(3)})`);
      core.addColorStop(0.7, `rgba(${o.r},${o.g},${o.b},0.82)`);
      core.addColorStop(1, `rgba(${darkR},${darkG},${darkB},0.65)`);
      bctx.fillStyle = core;
      bctx.beginPath();
      bctx.arc(o.x, yWithArc, cR, 0, Math.PI * 2);
      bctx.fill();

      // ── Orbiting spirit motes: 2-3 tiny sparks circling the orb ──
      bctx.globalCompositeOperation = "lighter";
      const moteCount = 2 + ((o.phase > 3.5) ? 1 : 0);
      for (let m = 0; m < moteCount; m++) {
        const mSpeed = 2.2 + m * 0.7 + o.hoverSpeed * 0.3;
        const mAngle = age * mSpeed + m * 2.09 + o.phase;
        const mRadius = cR * (1.6 + m * 0.5) + 0.01 * Math.sin(age * 4.3 + m);
        const mx = o.x + Math.cos(mAngle) * mRadius;
        const my = yWithArc + Math.sin(mAngle) * mRadius * 0.65;
        const mAlpha = (0.25 + 0.2 * Math.sin(age * (5.1 + m * 1.7) + o.phase)) * flicker;
        const mSize = 0.012 + 0.006 * Math.sin(age * 6.8 + m * 2.1);
        bctx.fillStyle = `rgba(${Math.min(255, o.r + 80)},${Math.min(255, o.g + 80)},${Math.min(255, o.b + 80)},${mAlpha.toFixed(3)})`;
        bctx.beginPath();
        bctx.arc(mx, my, mSize, 0, Math.PI * 2);
        bctx.fill();
      }

      // ── Wispy tendrils: two spirit-smoke trails rising from the orb ──
      const tendrilSegs = 5;
      const tendrils = [
        { freq: 3.5, amp: 0.04, phaseOff: 0, rise: 1.8, baseA: 0.16, width: 0.010 },
        { freq: 2.8, amp: 0.03, phaseOff: 2.1, rise: 1.4, baseA: 0.10, width: 0.007 },
      ];
      bctx.lineCap = "round";
      for (let ti = 0; ti < tendrils.length; ti++) {
        const td = tendrils[ti];
        bctx.lineWidth = td.width;
        let prevX = o.x;
        let prevY = yWithArc - cR * 0.3;
        for (let s = 0; s < tendrilSegs; s++) {
          const st = (s + 1) / tendrilSegs;
          const sway = td.amp * Math.sin(age * td.freq + o.phase + td.phaseOff + s * 1.3)
            * (1 + st * 0.5);
          const sx = o.x + sway;
          const sy = yWithArc - cR * (0.5 + st * td.rise);
          const sa = td.baseA * flicker * (1 - st * 0.75);
          // Fade from entity color to lighter at tips
          const tipR = Math.min(255, o.r + (st * 60) | 0);
          const tipG = Math.min(255, o.g + (st * 60) | 0);
          const tipB = Math.min(255, o.b + (st * 60) | 0);
          bctx.strokeStyle = `rgba(${tipR},${tipG},${tipB},${sa.toFixed(3)})`;
          bctx.beginPath();
          bctx.moveTo(prevX, prevY);
          bctx.lineTo(sx, sy);
          bctx.stroke();
          prevX = sx;
          prevY = sy;
        }
      }
    }

    bctx.restore();
  }

  function getActiveOrbs() {
    return orbs.map((o) => ({ ...o }));
  }

  /**
   * Return a live read-only view of the orbs array so the spirit wisp can
   * scan for nearby essences without copying every frame.
   */
  function peekOrbs() {
    return orbs;
  }

  /**
   * Remove an orb by its array index and return the removed orb (or null).
   * Used by the spirit wisp when it absorbs an essence.
   */
  function consumeOrbAt(index) {
    if (index < 0 || index >= orbs.length) return null;
    const orb = orbs[index];
    orbs.splice(index, 1);
    // Rebuild entity→index map after splice.
    orbIndexByEntity.clear();
    for (let i = 0; i < orbs.length; i++) {
      orbIndexByEntity.set(Number(orbs[i].entityId || 0) | 0, i);
    }
    return orb;
  }

  return {
    installListeners,
    tick,
    draw,
    getActiveOrbs,
    peekOrbs,
    consumeOrbAt,
  };
}
