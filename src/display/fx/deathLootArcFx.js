// src/display/fx/deathLootArcFx.js
// Death loot arc physics — items arc through the air when monsters die.
// Pure display-side VFX; reads ItemInfo.weight but does no rules mutations.

function seededUnit(seed) {
  const s = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0;
  return (s & 0xffff) / 0xffff;
}

/**
 * @param {object} deps
 * @param {object} deps.world
 * @param {(id:number) => (object|null)} deps.getItemInfo  returns ItemInfo component or null
 * @param {() => number} deps.getFxTime  current display-side time
 * @param {(x:number, y:number) => boolean} deps.isWalkable  tile walkability check (injected to avoid rules import)
 */
export function createDeathLootArcFx({ world, getItemInfo, getFxTime, isWalkable }) {
  /** @type {Map<number, {fromX:number,fromY:number,toX:number,toY:number,start:number,duration:number,peak:number}>} */
  const arcs = new Map();
  /** @type {Map<number, {x:number,y:number}>} */
  const restPositions = new Map();

  function clear() {
    arcs.clear();
    restPositions.clear();
  }

  function removeItem(itemId) {
    arcs.delete(itemId);
    restPositions.delete(itemId);
  }

  /**
   * Get the current visual position of a loot item (if it has an arc or rest pos).
   * @param {number} itemId
   * @returns {{ x:number, y:number, airborne:boolean }|null}
   */
  function getPosition(itemId) {
    const id = Number(itemId || 0) | 0;
    if (!(id > 0)) return null;
    const rec = arcs.get(id);
    if (!rec) {
      const rest = restPositions.get(id);
      return rest ? { x: rest.x, y: rest.y, airborne: false } : null;
    }
    const fxTime = getFxTime();
    const t = (Math.max(0, fxTime - rec.start)) / Math.max(0.001, rec.duration);
    if (t >= 1) {
      arcs.delete(id);
      restPositions.set(id, { x: rec.toX, y: rec.toY });
      return { x: rec.toX, y: rec.toY, airborne: false };
    }
    const ease = 1 - Math.pow(1 - t, 3);
    const lift = 4 * rec.peak * ease * (1 - ease);
    return {
      x: rec.fromX + (rec.toX - rec.fromX) * ease,
      y: rec.fromY + (rec.toY - rec.fromY) * ease - lift,
      airborne: true,
    };
  }

  /**
   * Schedule a loot arc for an item.
   */
  function schedule(itemId, origin, at, delayOffset, impulse) {
    const id = Number(itemId || 0) | 0;
    if (!(id > 0)) return 0;
    const fxTime = getFxTime();
    const fx = fxTime + (Number(delayOffset) || 0);
    const fromX = Number(origin?.x);
    const fromY = Number(origin?.y);
    let toX = Number(at?.x);
    let toY = Number(at?.y);
    if (![fromX, fromY, toX, toY].every(Number.isFinite)) return 0;

    const j1 = seededUnit(id ^ (world.step | 0));
    const j2 = seededUnit((id * 0x9e3779b9) ^ (world.step | 0));

    // ── Weight physics ──────────────────────────────────────────────
    const itemInfo = getItemInfo(id);
    const weight = Math.max(0, Number(itemInfo?.weight || 0));
    const wRaw = 1 / (1 + weight * 0.7);
    const feather = weight < 0.3 ? 1.3 - weight : 1;
    const wt = Math.min(1.5, wRaw * feather);

    const crit = !!(impulse?.critical);
    const critAmp = crit ? 1.55 : 1;
    const critLift = crit ? 1.7 : 1;
    const critHang = crit ? 1.35 : 1;
    const wScatter = wt * critAmp;
    const wLift = Math.min(2.8, wt * (weight < 0.5 ? 1.4 : 1.0) * critLift);
    const wHang = Math.min(2.2, wt * (weight < 0.5 ? 1.3 : weight > 5 ? 0.7 : 1.0) * critHang);

    // ── Impulse ─────────────────────────────────────────────────────
    const idx = Number(impulse?.dx || 0);
    const idy = Number(impulse?.dy || 0);
    const force = Math.max(0, Math.min(3, Number(impulse?.force || 0)));
    const cause = String(impulse?.cause || '');

    // ── Scatter profiles ────────────────────────────────────────────
    let pushBase = 0.60, pushPerF = 0.45;
    let fanBase = 0.80, fanPerF = 0.55;
    let drift = 0.25;

    if (cause === 'melee' || cause === 'retaliation') {
      pushBase = 0.70; pushPerF = 0.55;
      fanBase = 1.00; fanPerF = 0.70;
    } else if (cause === 'ranged') {
      pushBase = 1.00; pushPerF = 0.65;
      fanBase = 0.35; fanPerF = 0.20;
    } else if (cause === 'spell:phase_strike') {
      pushBase = 1.20; pushPerF = 0.80;
      fanBase = 1.30; fanPerF = 0.90;
    } else if (cause === 'spell:smite' || cause === 'spell:meteor') {
      const angle = (j1 * 2 - 1) * Math.PI;
      const radial = (0.80 + 0.70 * force) * wScatter;
      toX += Math.cos(angle) * radial;
      toY += Math.sin(angle) * radial;
      toX += (j2 - 0.5) * 0.4 * wScatter;
      toY += (j1 - 0.5) * 0.4 * wScatter;
      pushBase = 0; pushPerF = 0; fanBase = 0; fanPerF = 0;
    } else if (cause === 'spell:agony' || cause === 'spell:drain_life:tick') {
      pushBase = 0.15; pushPerF = 0.08;
      fanBase = 0.20; fanPerF = 0.10;
      drift = 0.12;
    } else if (cause.startsWith('spell:')) {
      pushBase = 0.85; pushPerF = 0.60;
      fanBase = 0.90; fanPerF = 0.60;
    } else if (!cause || cause === 'starvation') {
      pushBase = 0; pushPerF = 0;
      fanBase = 0; fanPerF = 0;
      drift = 0.15;
    }

    if (cause.includes('burn') || cause === 'spike_trap' || cause === 'shock_trap') {
      pushBase = 0.10; pushPerF = 0.05;
      fanBase = 0.15; fanPerF = 0.08;
      drift = 0.10;
    }

    // Apply directional scatter
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

    // ── Wall clamping ───────────────────────────────────────────────
    const landTileX = Math.round(toX);
    const landTileY = Math.round(toY);
    if (!isWalkable(landTileX, landTileY)) {
      let lo = 0, hi = 1;
      for (let step = 0; step < 8; step++) {
        const mid = (lo + hi) * 0.5;
        const mx = Math.round(fromX + (toX - fromX) * mid);
        const my = Math.round(fromY + (toY - fromY) * mid);
        if (isWalkable(mx, my)) lo = mid; else hi = mid;
      }
      toX = fromX + (toX - fromX) * lo;
      toY = fromY + (toY - fromY) * lo;
    }

    const fdx = toX - fromX;
    const fdy = toY - fromY;
    const dist = Math.sqrt(fdx * fdx + fdy * fdy);
    if (dist > 5) return 0;

    // ── Arc timing ──────────────────────────────────────────────────
    let durBase = 0.30, durDist = 0.12, durForce = 0.05;
    let pkBase = 0.30, pkDist = 0.25, pkForce = 0.12;

    if (cause === 'spell:phase_strike') {
      durBase = 0.22; durDist = 0.08; durForce = 0.03;
      pkBase = 0.50; pkDist = 0.35; pkForce = 0.20;
    } else if (cause === 'spell:smite' || cause === 'spell:meteor') {
      durBase = 0.28; durDist = 0.10; durForce = 0.04;
      pkBase = 0.55; pkDist = 0.40; pkForce = 0.18;
    } else if (cause === 'spell:agony' || cause === 'spell:drain_life:tick') {
      durBase = 0.55; durDist = 0.18; durForce = 0.08;
      pkBase = 0.12; pkDist = 0.08; pkForce = 0.04;
    } else if (cause.includes('burn')) {
      durBase = 0.45; durDist = 0.14; durForce = 0.05;
      pkBase = 0.10; pkDist = 0.06; pkForce = 0.03;
    } else if (cause === 'ranged') {
      durBase = 0.18; durDist = 0.07; durForce = 0.03;
      pkBase = 0.20; pkDist = 0.15; pkForce = 0.06;
    } else if (cause === 'melee' || cause === 'retaliation') {
      durBase = 0.28; durDist = 0.10; durForce = 0.04;
      pkBase = 0.35; pkDist = 0.28; pkForce = 0.14;
    } else if (cause.startsWith('spell:')) {
      durBase = 0.30; durDist = 0.10; durForce = 0.04;
      pkBase = 0.40; pkDist = 0.30; pkForce = 0.14;
    }

    const duration = (durBase + dist * durDist + j1 * 0.08 + force * durForce) * wHang;
    const peak = (pkBase + dist * pkDist + j2 * 0.12 + force * pkForce) * wLift;
    arcs.set(id, { fromX, fromY, toX, toY, start: fx, duration, peak });
    return Math.max(0, Number(delayOffset) || 0) + duration;
  }

  return { clear, removeItem, getPosition, schedule };
}
