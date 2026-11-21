// src/display/ui/wiring/goreEngine.js
// Combat gore VFX: blood/ichor/spark/bone/slime splatter, directional melee
// impacts, arrow impacts, death bursts, and floor stains.

import { Particle } from "../../passes/vfx/particles/particlePool.js";
import { impactTracker } from "../../fx/projectileImpactTracker.js";

// ── Damage type → float text color ───────────────────────────────────
const DAMAGE_TYPE_COLORS = Object.freeze({
  physical: '#ffd966',
  blunt:    '#ffd966',
  slash:    '#ffd966',
  pierce:   '#ffd966',
  fire:     '#ff6a20',
  electric: '#66ccff',
  lightning:'#66ccff',
  plasma:   '#88aaff',
  poison:   '#7de87d',
  acid:     '#aadd44',
  radiation:'#ccff44',
  shadow:   '#b088e8',
  cold:     '#aaeeff',
  ice:      '#aaeeff',
});
const DAMAGE_TYPE_RESISTED_COLORS = Object.freeze({
  physical: '#b0a060',
  blunt:    '#b0a060',
  slash:    '#b0a060',
  pierce:   '#b0a060',
  fire:     '#c47030',
  electric: '#5090a0',
  lightning:'#5090a0',
  plasma:   '#607090',
  poison:   '#5a8a5a',
  acid:     '#708830',
  radiation:'#889930',
  shadow:   '#7a5aa0',
  cold:     '#7090a0',
  ice:      '#7090a0',
});

function _damageTypeColor(type, resisted) {
  const key = type.toLowerCase();
  if (resisted) return DAMAGE_TYPE_RESISTED_COLORS[key] || '#b0a060';
  return DAMAGE_TYPE_COLORS[key] || '#ffd966';
}

// ── Gore type classification ──────────────────────────────────────────

const GORE_KEYWORDS = Object.freeze({
  bone: ['skeleton', 'bone', 'skull', 'zombie'],
  slime: ['slime', 'ooze', 'gel', 'jelly', 'cube'],
  none: ['ghost', 'wisp', 'shade', 'spectral', 'spirit', 'shadow'],
});

export function normalizedGoreType(goreType, targetKind) {
  const explicit = String(goreType || '').trim().toLowerCase();
  if (explicit === 'blood' || explicit === 'ichor' || explicit === 'spark' || explicit === 'bone' || explicit === 'slime' || explicit === 'eyeburst') return explicit;
  const kind = String(targetKind || '').trim().toLowerCase();
  if (!kind) return explicit === 'none' ? 'none' : 'blood';
  for (let i = 0; i < GORE_KEYWORDS.none.length; i++) {
    if (kind.includes(GORE_KEYWORDS.none[i])) return 'none';
  }
  for (let i = 0; i < GORE_KEYWORDS.slime.length; i++) {
    if (kind.includes(GORE_KEYWORDS.slime[i])) return 'slime';
  }
  for (let i = 0; i < GORE_KEYWORDS.bone.length; i++) {
    if (kind.includes(GORE_KEYWORDS.bone[i])) return 'bone';
  }
  return explicit === 'none' ? 'none' : 'blood';
}

// ── Gore style tables ─────────────────────────────────────────────────

const GORE_STYLE = Object.freeze({
  blood: Object.freeze({
    splatBase: { r: 140, g: 18, b: 18 },
    splatVar: { r: 40, g: 12, b: 0 },
    gib: { r: 160, g: 30, b: 30 },
    stain: { r: 90, g: 10, b: 10 },
    splatLifeMin: 0.25, splatLifeSpan: 0.30,
    gibLifeMin: 0.40, gibLifeSpan: 0.40,
    stainLifeMin: 10.0, stainLifeSpan: 8.0,
    stainAlpha0: 0.52,
    allowGib: true,
    gravity: 0.08,
    gibGravity: 0.16,
  }),
  ichor: Object.freeze({
    splatBase: { r: 86, g: 160, b: 48 },
    splatVar: { r: 32, g: 44, b: 30 },
    gib: { r: 110, g: 175, b: 85 },
    stain: { r: 54, g: 94, b: 40 },
    splatLifeMin: 0.28, splatLifeSpan: 0.34,
    gibLifeMin: 0.45, gibLifeSpan: 0.38,
    stainLifeMin: 11.0, stainLifeSpan: 9.0,
    stainAlpha0: 0.48,
    allowGib: true,
    gravity: 0.06,
    gibGravity: 0.14,
  }),
  spark: Object.freeze({
    splatBase: { r: 245, g: 205, b: 90 },
    splatVar: { r: 10, g: 35, b: 45 },
    gib: { r: 255, g: 220, b: 120 },
    stain: { r: 88, g: 62, b: 28 },
    splatLifeMin: 0.22, splatLifeSpan: 0.22,
    gibLifeMin: 0.30, gibLifeSpan: 0.24,
    stainLifeMin: 8.0, stainLifeSpan: 6.0,
    stainAlpha0: 0.36,
    allowGib: false,
    gravity: 0.03,
    gibGravity: 0.08,
  }),
  bone: Object.freeze({
    splatBase: { r: 208, g: 198, b: 176 },
    splatVar: { r: 20, g: 20, b: 20 },
    gib: { r: 236, g: 226, b: 206 },
    stain: { r: 126, g: 114, b: 98 },
    splatLifeMin: 0.24, splatLifeSpan: 0.26,
    gibLifeMin: 0.46, gibLifeSpan: 0.44,
    stainLifeMin: 6.0, stainLifeSpan: 4.0,
    stainAlpha0: 0.34,
    allowGib: true,
    gravity: 0.12,
    gibGravity: 0.22,
  }),
  slime: Object.freeze({
    splatBase: { r: 84, g: 176, b: 88 },
    splatVar: { r: 35, g: 45, b: 30 },
    gib: { r: 112, g: 206, b: 120 },
    stain: { r: 48, g: 104, b: 52 },
    splatLifeMin: 0.34, splatLifeSpan: 0.42,
    gibLifeMin: 0.52, gibLifeSpan: 0.46,
    stainLifeMin: 12.0, stainLifeSpan: 8.0,
    stainAlpha0: 0.58,
    allowGib: true,
    gravity: 0.04,
    gibGravity: 0.08,
  }),
});

// Floating eye: cacodemon-style pressurized pop.
// High velocity, big chunks, wide radial spread, low gravity so debris
// hangs in the air a beat before falling. The thing was full of something.
const EYEBURST_STYLE = Object.freeze({
  splatBase: { r: 130, g: 65, b: 175 },   // vitreous — deep violet
  splatVar:  { r: 45,  g: 35, b: 30 },
  gib:       { r: 180, g: 50, b: 220 },   // flesh chunks — bright violet-pink
  stain:     { r: 80,  g: 40, b: 120 },   // violet puddle
  splatLifeMin: 0.22, splatLifeSpan: 0.35,
  gibLifeMin: 0.55, gibLifeSpan: 0.60,
  stainLifeMin: 18.0, stainLifeSpan: 14.0,
  stainAlpha0: 0.60,
  allowGib: true,
  gravity: 0.02,      // very low — debris hangs in the air
  gibGravity: 0.04,   // flesh chunks float before dropping
});

function pickGoreStyle(goreType) {
  const key = String(goreType || 'blood').toLowerCase();
  if (key === 'eyeburst') return EYEBURST_STYLE;
  return GORE_STYLE[key] || GORE_STYLE.blood;
}

// ── Pure damage classification helpers ────────────────────────────────

function isGoreImpactCause(cause) {
  const c = String(cause || '').toLowerCase();
  if (!c) return false;
  if (c === 'melee' || c === 'retaliation' || c === 'offhand' || c === 'ranged') return true;
  if (c === 'spike_trap' || c === 'shock_trap') return true;
  if (c.startsWith('spell:') && !c.endsWith(':tick') && c !== 'spell:flash_heal') return true;
  return false;
}

function classifyDamage(damageType) {
  const k = String(damageType || 'physical').toLowerCase();
  return Object.freeze({
    slashLike: k.includes('slash') || k.includes('cut'),
    pierceLike: k.includes('pierce') || k.includes('stab'),
    bluntLike: k.includes('blunt') || k.includes('bash') || k.includes('crush'),
    fireLike: k.includes('fire') || k.includes('burn'),
    acidLike: k.includes('acid') || k.includes('poison') || k.includes('toxic'),
    shockLike: k.includes('electric') || k.includes('lightning') || k.includes('shock'),
    coldLike: k.includes('cold') || k.includes('frost') || k.includes('ice'),
  });
}

function tintForDamage(color, damageType) {
  const t = classifyDamage(damageType);
  if (t.fireLike) return { r: Math.min(255, color.r + 24), g: Math.min(255, color.g + 12), b: Math.max(0, color.b - 8) };
  if (t.acidLike) return { r: Math.max(0, color.r - 14), g: Math.min(255, color.g + 24), b: Math.max(0, color.b - 16) };
  if (t.shockLike) return { r: Math.min(255, color.r + 20), g: Math.min(255, color.g + 22), b: Math.min(255, color.b + 8) };
  if (t.coldLike) return { r: Math.max(0, color.r - 20), g: Math.max(0, color.g - 6), b: Math.min(255, color.b + 24) };
  return color;
}

// ── Melee impact profile ──────────────────────────────────────────────

function normalizedPhysicalSignature(signature, damageType) {
  const bluntIn = Math.max(0, Number(signature?.blunt || 0));
  const pierceIn = Math.max(0, Number(signature?.pierce || 0));
  const slashIn = Math.max(0, Number(signature?.slash || 0));
  const kind = String(damageType || 'physical').toLowerCase();
  const seeded = (bluntIn + pierceIn + slashIn) > 0
    ? { blunt: bluntIn, pierce: pierceIn, slash: slashIn }
    : (kind === 'blunt'
      ? { blunt: 1, pierce: 0, slash: 0 }
      : (kind === 'pierce'
        ? { blunt: 0, pierce: 1, slash: 0 }
        : (kind === 'slash'
          ? { blunt: 0, pierce: 0, slash: 1 }
          : { blunt: 0.34, pierce: 0.33, slash: 0.33 })));
  const total = seeded.blunt + seeded.pierce + seeded.slash;
  if (!(total > 0)) return { blunt: 0.34, pierce: 0.33, slash: 0.33 };
  return {
    blunt: seeded.blunt / total,
    pierce: seeded.pierce / total,
    slash: seeded.slash / total,
  };
}

function meleeProfileForImpact(impactProfile, damageType, critHit) {
  const weaponClass = String(impactProfile?.weaponClass || '').toLowerCase();
  const attackKind = String(impactProfile?.attackKind || '').toLowerCase();
  const sig = normalizedPhysicalSignature(impactProfile?.signature, damageType);
  const sideSign = Math.random() < 0.5 ? -1 : 1;

  const classSideScale = weaponClass === 'mace' ? 0.35
    : (weaponClass === 'morningstar' ? 0.75
      : (weaponClass === 'dagger' ? 0.70 : 1.0));
  const classForward = weaponClass === 'dagger' ? 0.62
    : (weaponClass === 'mace' ? 0.45
      : (weaponClass === 'morningstar' ? 0.55 : 0.52));
  const classFanBonus = weaponClass === 'sword' ? 0.10
    : (weaponClass === 'axe' ? 0.08
      : (weaponClass === 'mace' ? -0.08 : 0));
  const kindFanBonus = attackKind === 'slash' ? 0.08 : (attackKind === 'stab' ? -0.04 : -0.06);

  const fan = 0.16
    + sig.slash * 0.64
    + sig.pierce * 0.24
    + sig.blunt * 0.10
    + classFanBonus
    + kindFanBonus
    + (critHit ? 0.08 : 0);
  const baseSpeed = 0.65
    + sig.pierce * 0.95
    + sig.slash * 0.55
    + sig.blunt * 0.25
    + (weaponClass === 'morningstar' ? 0.10 : 0);
  const speedSpan = 0.80
    + sig.slash * 0.85
    + sig.pierce * 0.70
    + sig.blunt * 0.25
    + (critHit ? 0.30 : 0);
  const sideShift = (0.05 + sig.slash * 0.18 + sig.pierce * 0.12 + sig.blunt * 0.04) * classSideScale;
  const originForward = classForward;
  const splatScale = 0.74 + sig.slash * 0.40 + sig.pierce * 0.14 + sig.blunt * 0.04 + (critHit ? 0.16 : 0);
  const lifeScale = 0.86 + sig.blunt * 0.34 + sig.slash * 0.12 + sig.pierce * 0.06 + (critHit ? 0.10 : 0);
  const stainScale = 0.78 + sig.blunt * 0.52 + sig.slash * 0.16 + sig.pierce * 0.08;
  const gibScale = 0.64 + sig.blunt * 0.28 + sig.slash * 0.32 + sig.pierce * 0.10 + (critHit ? 0.20 : 0);
  const backwardBias = Math.max(
    0,
    Math.min(
      0.78,
      sig.blunt * 0.55
        + (attackKind === 'blunt' ? 0.22 : 0)
        + (weaponClass === 'mace' ? 0.12 : 0),
    ),
  );

  return {
    sideSign,
    fan: Math.max(0.08, fan),
    baseSpeed: Math.max(0.4, baseSpeed),
    speedSpan: Math.max(0.3, speedSpan),
    sideShift: Math.max(0.02, sideShift),
    originForward: Math.max(0.4, originForward),
    splatScale: Math.max(0.4, splatScale),
    lifeScale: Math.max(0.6, lifeScale),
    stainScale: Math.max(0.4, stainScale),
    gibScale: Math.max(0.35, gibScale),
    backwardBias,
    signature: sig,
    weaponClass,
    attackKind,
  };
}

// ── Particle spawn functions ──────────────────────────────────────────

function spawnGore(pool, wx, wy, dx, dy, dmg, isCrit, goreType, damageType) {
  const style = pickGoreStyle(goreType);
  const dmgFlags = classifyDamage(damageType);
  const slashLike = dmgFlags.slashLike || dmgFlags.pierceLike;
  const bluntLike = dmgFlags.bluntLike;
  const isSpark = style === GORE_STYLE.spark;
  const splatColor = tintForDamage(style.splatBase, damageType);
  const gibColor = tintForDamage(style.gib, damageType);
  const stainColor = tintForDamage(style.stain, damageType);
  // Perpendicular to impact direction for side-spray
  const perpx = -dy, perpy = dx;

  const splatCount = Math.min(28, 7 + ((dmg * 1.5) | 0) + (slashLike ? 5 : 0) + (isCrit ? 8 : 0));
  for (let i = 0; i < splatCount; i++) {
    const sideSpread = (Math.random() - 0.5) * (slashLike ? 1.4 : 2.0);
    const speed = (slashLike ? 1.25 : 0.95) + Math.random() * (slashLike ? 2.0 : 1.8) + (isCrit ? 0.45 : 0);
    // Symmetric vx/vy: impact direction + perpendicular spread
    pool.spawn(new Particle({
      x: wx + (Math.random() - 0.5) * 0.3,
      y: wy + (Math.random() - 0.5) * 0.3,
      vx: dx * speed + perpx * sideSpread,
      vy: dy * speed + perpy * sideSpread,
      ax: 0, ay: style.gravity * 0.5,
      life: style.splatLifeMin + Math.random() * style.splatLifeSpan,
      size0: isSpark ? (0.05 + Math.random() * 0.03) : (0.08 + Math.random() * 0.06),
      size1: isSpark ? 0.01 : 0.02,
      r: Math.min(255, splatColor.r + ((Math.random() * style.splatVar.r) | 0)),
      g: Math.min(255, splatColor.g + ((Math.random() * style.splatVar.g) | 0)),
      b: Math.min(255, splatColor.b + ((Math.random() * style.splatVar.b) | 0)),
      a0: isSpark ? 0.95 : 0.85,
      a1: 0,
    }));
  }

  if (style.allowGib && (isCrit || dmg >= 8)) {
    const gibCount = isCrit ? 8 + ((Math.random() * 5) | 0) : 3 + ((Math.random() * 2) | 0);
    for (let i = 0; i < gibCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.6 + Math.random() * 1.2;
      pool.spawn(new Particle({
        x: wx + (Math.random() - 0.5) * 0.2,
        y: wy + (Math.random() - 0.5) * 0.2,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        ax: 0, ay: style.gibGravity * 0.5,
        life: style.gibLifeMin + Math.random() * style.gibLifeSpan,
        size0: 0.11 + Math.random() * 0.10,
        size1: 0.04,
        r: gibColor.r, g: gibColor.g, b: gibColor.b,
        a0: 0.9, a1: 0.1,
        rotVel: (Math.random() - 0.5) * 8,
      }));
    }
  }

  const stainCount = bluntLike ? (dmg >= 5 ? 9 : 4) : (dmg >= 5 ? 7 : 3);
  for (let i = 0; i < stainCount; i++) {
    // Stains spread along impact direction and perpendicular — not just centered
    const fwd = (Math.random() - 0.5) * 0.7;
    const side = (Math.random() - 0.5) * 0.7;
    pool.spawn(new Particle({
      x: wx + dx * fwd + perpx * side,
      y: wy + dy * fwd + perpy * side,
      vx: 0, vy: 0,
      life: style.stainLifeMin + 4 + Math.random() * (style.stainLifeSpan + 8),
      size0: 0.05 + Math.random() * 0.07,
      size1: 0.16 + Math.random() * 0.16,
      r: stainColor.r, g: stainColor.g, b: stainColor.b,
      a0: Math.min(0.9, style.stainAlpha0 + 0.18), a1: 0,
    }));
  }
}

function spawnArrowImpactGore(pool, wx, wy, dx, dy, dmg, isCrit, goreType, damageType) {
  const style = pickGoreStyle(goreType);
  const dmgFlags = classifyDamage(damageType);
  const slashLike = dmgFlags.slashLike || dmgFlags.pierceLike;
  const isSpark = style === GORE_STYLE.spark;
  const splatColor = tintForDamage(style.splatBase, damageType);
  const gibColor = tintForDamage(style.gib, damageType);
  const stainColor = tintForDamage(style.stain, damageType);

  const splatCount = Math.min(26, 6 + ((dmg * 1.2) | 0) + (isCrit ? 6 : 0));
  for (let i = 0; i < splatCount; i++) {
    const forward = 0.14 + Math.random() * 0.42;
    const side = (Math.random() - 0.5) * (slashLike ? 0.26 : 0.34);
    const drift = (Math.random() - 0.5) * (slashLike ? 0.28 : 0.38);
    const speed = 1.0 + Math.random() * 1.9 + (isCrit ? 0.3 : 0);
    pool.spawn(new Particle({
      x: wx + dx * forward - dy * side + (Math.random() - 0.5) * 0.15,
      y: wy + dy * forward + dx * side + (Math.random() - 0.5) * 0.15,
      vx: dx * speed - dy * drift,
      vy: dy * speed + dx * drift,
      ax: 0,
      ay: style.gravity * 0.4,
      life: style.splatLifeMin + Math.random() * style.splatLifeSpan,
      size0: isSpark ? (0.05 + Math.random() * 0.03) : (0.08 + Math.random() * 0.06),
      size1: isSpark ? 0.01 : 0.02,
      r: Math.min(255, splatColor.r + ((Math.random() * style.splatVar.r) | 0)),
      g: Math.min(255, splatColor.g + ((Math.random() * style.splatVar.g) | 0)),
      b: Math.min(255, splatColor.b + ((Math.random() * style.splatVar.b) | 0)),
      a0: isSpark ? 0.95 : 0.85,
      a1: 0,
    }));
  }

  if (style.allowGib && (isCrit || dmg >= 10)) {
    const gibCount = isCrit ? 5 + ((Math.random() * 3) | 0) : 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < gibCount; i++) {
      const side = (Math.random() - 0.5) * 0.40;
      const speed = 0.7 + Math.random() * 1.1;
      pool.spawn(new Particle({
        x: wx + dx * 0.2 + (Math.random() - 0.5) * 0.15,
        y: wy + dy * 0.2 + (Math.random() - 0.5) * 0.15,
        vx: dx * speed - dy * side,
        vy: dy * speed + dx * side,
        ax: 0,
        ay: style.gibGravity * 0.4,
        life: style.gibLifeMin + Math.random() * style.gibLifeSpan,
        size0: 0.11 + Math.random() * 0.10,
        size1: 0.04,
        r: gibColor.r,
        g: gibColor.g,
        b: gibColor.b,
        a0: 0.9,
        a1: 0.1,
        rotVel: (Math.random() - 0.5) * 8,
      }));
    }
  }

  const stainCount = dmg >= 5 ? 6 : 3;
  for (let i = 0; i < stainCount; i++) {
    const forward = (Math.random() - 0.3) * 0.55;
    const side = (Math.random() - 0.5) * 0.50;
    pool.spawn(new Particle({
      x: wx + dx * forward - dy * side,
      y: wy + dy * forward + dx * side,
      vx: 0,
      vy: 0,
      life: style.stainLifeMin + 3 + Math.random() * (style.stainLifeSpan + 6),
      size0: 0.05 + Math.random() * 0.07,
      size1: 0.14 + Math.random() * 0.14,
      r: stainColor.r,
      g: stainColor.g,
      b: stainColor.b,
      a0: Math.min(0.9, style.stainAlpha0 + 0.15),
      a1: 0,
    }));
  }
}

function spawnMeleeImpactGore(pool, wx, wy, dx, dy, dmg, isCrit, goreType, damageType, impactProfile) {
  const style = pickGoreStyle(goreType);
  const view = meleeProfileForImpact(impactProfile, damageType, isCrit);
  const splatColor = tintForDamage(style.splatBase, damageType);
  const gibColor = tintForDamage(style.gib, damageType);
  const stainColor = tintForDamage(style.stain, damageType);
  const isSpark = style === GORE_STYLE.spark;
  const _fx = Number(impactProfile?.facingVector?.dx);
  const _fy = Number(impactProfile?.facingVector?.dy);
  const fMag = Math.hypot(_fx, _fy);
  const fwdx = fMag > 0 ? (_fx / fMag) : dx;
  const fwdy = fMag > 0 ? (_fy / fMag) : dy;
  const sidex = -fwdy;
  const sidey = fwdx;

  const jitter = (Math.random() - 0.5) * (0.06 + view.signature.slash * 0.04);
  const sideOffset = view.sideSign * view.sideShift + jitter;
  const ox = wx + fwdx * view.originForward + sidex * sideOffset;
  const oy = wy + fwdy * view.originForward + sidey * sideOffset;

  // ── Damage intensity tier: bigger hits = more gore ──
  const isHeavy = dmg >= 12;
  const isBrutal = dmg >= 20 || (isCrit && dmg >= 10);
  const dmgBoost = isBrutal ? 1.5 : (isHeavy ? 1.2 : 1.0);

  // ── Splats: directional spray with wide perpendicular spread ──
  // fwdx/fwdy = impact direction, sidex/sidey = perpendicular axis.
  // Particles spray forward, sideways, and some behind — combat is messy.
  const splatCount = Math.min(48, Math.max(5, Math.floor((8 + dmg * 1.8 + (isCrit ? 10 : 0) + (isBrutal ? 8 : 0)) * view.splatScale)));
  for (let i = 0; i < splatCount; i++) {
    const sideThrow = (Math.random() - 0.5) * view.fan * dmgBoost * 1.3 + (view.sideSign * 0.08 * view.signature.slash);
    const speed = (view.baseSpeed + Math.random() * view.speedSpan) * dmgBoost;
    const backward = Math.random() * view.backwardBias;
    const travel = speed * (1 - backward * (1.1 + Math.random() * 0.6));
    // Symmetric: both axes use full travel/sideThrow — no vy crushing
    pool.spawn(new Particle({
      x: ox + (Math.random() - 0.5) * 0.2,
      y: oy + (Math.random() - 0.5) * 0.2,
      vx: fwdx * travel + sidex * sideThrow,
      vy: fwdy * travel + sidey * sideThrow,
      ax: 0,
      ay: style.gravity * 0.4,
      life: (style.splatLifeMin + Math.random() * style.splatLifeSpan) * view.lifeScale * dmgBoost,
      size0: isSpark ? (0.05 + Math.random() * 0.03) : (0.08 + Math.random() * 0.07 + (isBrutal ? 0.03 : 0)),
      size1: isSpark ? 0.01 : 0.02,
      r: Math.min(255, splatColor.r + ((Math.random() * style.splatVar.r) | 0)),
      g: Math.min(255, splatColor.g + ((Math.random() * style.splatVar.g) | 0)),
      b: Math.min(255, splatColor.b + ((Math.random() * style.splatVar.b) | 0)),
      a0: isSpark ? 0.95 : 0.88,
      a1: 0,
    }));
  }

  // ── Back-spray: some splatter flies back TOWARD the attacker ──
  const backSprayCount = Math.min(12, Math.floor((2 + dmg * 0.4 + (isCrit ? 4 : 0)) * view.splatScale));
  for (let i = 0; i < backSprayCount; i++) {
    const sideThrow = (Math.random() - 0.5) * view.fan * 1.5;
    const speed = (0.4 + Math.random() * 0.6) * dmgBoost;
    pool.spawn(new Particle({
      x: ox + (Math.random() - 0.5) * 0.15,
      y: oy + (Math.random() - 0.5) * 0.15,
      vx: -fwdx * speed + sidex * sideThrow,
      vy: -fwdy * speed + sidey * sideThrow,
      ax: 0,
      ay: style.gravity * 0.3,
      life: style.splatLifeMin + Math.random() * style.splatLifeSpan * 0.8,
      size0: 0.06 + Math.random() * 0.05,
      size1: 0.01,
      r: Math.min(255, splatColor.r + ((Math.random() * style.splatVar.r) | 0)),
      g: Math.min(255, splatColor.g + ((Math.random() * style.splatVar.g) | 0)),
      b: Math.min(255, splatColor.b + ((Math.random() * style.splatVar.b) | 0)),
      a0: 0.80,
      a1: 0,
    }));
  }

  // ── Gibs: chunks of flesh/bone/material — full radial scatter ──
  if (style.allowGib && (isCrit || dmg >= 6)) {
    const gibCountBase = isCrit
      ? (isBrutal ? 14 : 10) + ((Math.random() * 6) | 0)
      : (isHeavy ? 6 : 3) + ((Math.random() * 3) | 0);
    const gibCount = Math.max(1, Math.min(20, Math.floor(gibCountBase * view.gibScale)));
    for (let i = 0; i < gibCount; i++) {
      const sideThrow = (Math.random() - 0.5) * (0.50 + view.signature.slash * 0.30) * dmgBoost;
      const speed = (0.6 + Math.random() * (1.1 + view.signature.pierce * 0.3 + view.signature.blunt * 0.15)) * dmgBoost;
      const travel = speed * (1 - Math.random() * view.backwardBias);
      // Some gibs fly backward (20% chance)
      const flipDir = Math.random() < 0.2 ? -1 : 1;
      pool.spawn(new Particle({
        x: ox + (Math.random() - 0.5) * 0.2,
        y: oy + (Math.random() - 0.5) * 0.2,
        vx: fwdx * travel * flipDir + sidex * sideThrow,
        vy: fwdy * travel * flipDir + sidey * sideThrow,
        ax: 0,
        ay: style.gibGravity * 0.4,
        life: (style.gibLifeMin + Math.random() * style.gibLifeSpan) * view.lifeScale * dmgBoost,
        size0: 0.11 + Math.random() * (0.12 + (isBrutal ? 0.06 : 0)),
        size1: 0.04,
        r: gibColor.r,
        g: gibColor.g,
        b: gibColor.b,
        a0: 0.92,
        a1: 0.1,
        rotVel: (Math.random() - 0.5) * (10 + (isBrutal ? 6 : 0)),
      }));
    }
  }

  // ── Crushing blow: blunt damage gets backward splatter + ground-pound ring ──
  if (view.signature.blunt > 0.35 && dmg >= 5) {
    const crushCount = Math.min(16, 4 + ((dmg * 0.6) | 0) + (isCrit ? 6 : 0));
    for (let i = 0; i < crushCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.4 + Math.random() * 0.8 * dmgBoost;
      pool.spawn(new Particle({
        x: ox + (Math.random() - 0.5) * 0.15,
        y: oy + (Math.random() - 0.5) * 0.15,
        vx: -fwdx * spd * 0.5 + Math.cos(ang) * spd * 0.7,
        vy: -fwdy * spd * 0.5 + Math.sin(ang) * spd * 0.7,
        ax: 0, ay: style.gravity * 0.6,
        life: 0.22 + Math.random() * 0.28,
        size0: 0.09 + Math.random() * 0.08,
        size1: 0.02,
        r: Math.min(255, splatColor.r + ((Math.random() * style.splatVar.r * 1.3) | 0)),
        g: Math.min(255, splatColor.g + ((Math.random() * style.splatVar.g) | 0)),
        b: Math.min(255, splatColor.b + ((Math.random() * style.splatVar.b) | 0)),
        a0: 0.90, a1: 0,
      }));
    }
    // Ground-pound stain ring — wider radius, reaches into adjacent tiles
    const ringCount = Math.min(14, 3 + ((dmg * 0.3) | 0) + (isCrit ? 4 : 0));
    for (let i = 0; i < ringCount; i++) {
      const rAng = (i / ringCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const rDist = 0.28 + Math.random() * 0.45;
      pool.spawn(new Particle({
        x: wx + Math.cos(rAng) * rDist,
        y: wy + Math.sin(rAng) * rDist,
        vx: 0, vy: 0,
        life: style.stainLifeMin + 6 + Math.random() * style.stainLifeSpan,
        size0: 0.06 + Math.random() * 0.06,
        size1: 0.22 + Math.random() * 0.16,
        r: stainColor.r, g: stainColor.g, b: stainColor.b,
        a0: Math.min(0.9, style.stainAlpha0 + 0.22), a1: 0,
      }));
    }
  }

  // ── Floor stains — spread along BOTH axes (forward/back + left/right) ──
  const stainCountBase = view.signature.blunt > 0.45
    ? (dmg >= 5 ? 11 : 5)
    : (dmg >= 5 ? 8 : 3);
  const stainCount = Math.max(2, Math.min(18, Math.floor(stainCountBase * view.stainScale * dmgBoost)));
  for (let i = 0; i < stainCount; i++) {
    // Forward/backward spread: some stains behind the defender, some ahead
    const forward = (Math.random() - 0.35) * (0.55 + view.signature.pierce * 0.25);
    // Side spread: reaches into adjacent tiles
    const side = (Math.random() - 0.5) * (0.60 + view.signature.slash * 0.20);
    pool.spawn(new Particle({
      x: wx + fwdx * forward + sidex * side,
      y: wy + fwdy * forward + sidey * side,
      vx: 0,
      vy: 0,
      life: style.stainLifeMin + 4 + Math.random() * (style.stainLifeSpan + 8),
      size0: 0.05 + Math.random() * 0.08,
      size1: 0.18 + Math.random() * 0.18,
      r: stainColor.r,
      g: stainColor.g,
      b: stainColor.b,
      a0: Math.min(0.9, style.stainAlpha0 + 0.20),
      a1: 0,
    }));
  }
}

function spawnDeathGore(pool, wx, wy, dx, dy, amount, goreType, damageType, critical, sizeClass) {
  const style = pickGoreStyle(goreType);
  const d = Math.max(4, Number(amount) || 4);
  const crit = !!critical;

  // Size-class scaling: bigger creatures = bigger death bursts
  const sizeScale = sizeClass === 'XL' ? 1.8 : (sizeClass === 'L' ? 1.4 : (sizeClass === 'S' ? 0.75 : (sizeClass === 'XS' ? 0.5 : 1.0)));
  const burstScale = (crit ? 1.5 : 1.0) * sizeScale;
  const dmgFlags = classifyDamage(damageType);

  // Perpendicular to killing blow for side-spray
  const perpx = -dy, perpy = dx;

  // ── Directional spray — the killing blow's exit wound ──
  // Symmetric vx/vy: uses impact direction + perpendicular, no axis crushing
  const sprayColor = tintForDamage(style.splatBase, damageType);
  const baseSpray = Math.min(72, Math.floor((14 + d * 1.6 + (crit ? 12 : 0)) * sizeScale));
  for (let i = 0; i < baseSpray; i++) {
    const forward = (0.14 + Math.random() * 0.44) * burstScale;
    const side = (Math.random() - 0.5) * 0.50 * burstScale;
    pool.spawn(new Particle({
      x: wx + (Math.random() - 0.5) * 0.30,
      y: wy + (Math.random() - 0.5) * 0.30,
      vx: dx * forward + perpx * side,
      vy: dy * forward + perpy * side,
      ay: style.gravity * 0.4,
      life: 0.16 + Math.random() * 0.26,
      size0: (0.09 + Math.random() * 0.09) * Math.max(1, sizeScale * 0.8),
      size1: 0.01,
      r: Math.min(255, sprayColor.r + ((Math.random() * style.splatVar.r) | 0)),
      g: Math.min(255, sprayColor.g + ((Math.random() * style.splatVar.g) | 0)),
      b: Math.min(255, sprayColor.b + ((Math.random() * style.splatVar.b) | 0)),
      a0: 0.95,
      a1: 0,
    }));
  }

  // ── Radial burst — the body giving up its contents in ALL directions ──
  // Full symmetric radial: no vy crushing, low gravity so particles travel far
  const radialCount = Math.min(40, Math.floor((6 + d * 0.8 + (crit ? 8 : 0)) * sizeScale));
  for (let i = 0; i < radialCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = (0.18 + Math.random() * 0.55) * burstScale;
    pool.spawn(new Particle({
      x: wx + (Math.random() - 0.5) * 0.22,
      y: wy + (Math.random() - 0.5) * 0.22,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      ay: style.gravity * 0.3,
      life: 0.14 + Math.random() * 0.24,
      size0: (0.07 + Math.random() * 0.07) * Math.max(1, sizeScale * 0.7),
      size1: 0.01,
      r: Math.min(255, sprayColor.r + ((Math.random() * style.splatVar.r * 1.2) | 0)),
      g: Math.min(255, sprayColor.g + ((Math.random() * style.splatVar.g) | 0)),
      b: Math.min(255, sprayColor.b + ((Math.random() * style.splatVar.b) | 0)),
      a0: 0.90,
      a1: 0,
    }));
  }

  // ── Guts / gibs — big chunks that tumble and spin in all directions ──
  const gutsColor = tintForDamage(style.gib, damageType);
  const gutsCount = Math.min(28, Math.floor((6 + d * 0.7 + (crit ? 6 : 0)) * sizeScale));
  for (let i = 0; i < gutsCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const radial = (0.08 + Math.random() * 0.28) * burstScale;
    const directed = (0.04 + Math.random() * 0.14) * burstScale;
    pool.spawn(new Particle({
      x: wx + (Math.random() - 0.5) * 0.24,
      y: wy + (Math.random() - 0.5) * 0.24,
      vx: Math.cos(ang) * radial + dx * directed,
      vy: Math.sin(ang) * radial + dy * directed,
      ay: style.gibGravity * 0.35,
      life: 0.40 + Math.random() * 0.70,
      size0: (0.13 + Math.random() * 0.14) * Math.max(1, sizeScale * 0.7),
      size1: 0.03 + Math.random() * 0.03,
      r: gutsColor.r,
      g: gutsColor.g,
      b: gutsColor.b,
      a0: 0.94,
      a1: 0.05,
      rotVel: (Math.random() - 0.5) * (8 + (crit ? 6 : 0)),
    }));
  }

  // ── Crushing death bonus: blunt kills get a symmetric ground-pound shockwave ──
  if (dmgFlags.bluntLike && d >= 6) {
    const smashCount = Math.min(20, Math.floor((5 + d * 0.5) * sizeScale));
    for (let i = 0; i < smashCount; i++) {
      const ang = (i / smashCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd = (0.35 + Math.random() * 0.55) * burstScale;
      pool.spawn(new Particle({
        x: wx + (Math.random() - 0.5) * 0.12,
        y: wy + (Math.random() - 0.5) * 0.12,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        ay: style.gravity * 0.5,
        life: 0.12 + Math.random() * 0.18,
        size0: 0.10 + Math.random() * 0.08,
        size1: 0.02,
        r: Math.min(255, sprayColor.r + 20),
        g: Math.min(255, sprayColor.g + 10),
        b: Math.min(255, sprayColor.b + 5),
        a0: 0.92, a1: 0,
      }));
    }
  }

  // ── Blood pool / puddles — spread symmetrically around the corpse ──
  const poolColor = tintForDamage(style.stain, damageType);
  const puddles = Math.min(36, Math.floor((12 + d * 0.9 + (crit ? 8 : 0)) * sizeScale));
  for (let i = 0; i < puddles; i++) {
    const spread = 0.35 + sizeScale * 0.20;
    pool.spawn(new Particle({
      x: wx + (Math.random() - 0.5) * spread * 2,
      y: wy + (Math.random() - 0.5) * spread * 2,
      vx: 0,
      vy: 0,
      life: 20 + Math.random() * 28,
      size0: 0.05 + Math.random() * 0.09,
      size1: 0.20 + Math.random() * 0.20,
      r: poolColor.r,
      g: poolColor.g,
      b: poolColor.b,
      a0: Math.min(0.90, style.stainAlpha0 + 0.24),
      a1: 0,
    }));
  }

  // ── Eyeburst special: cacodemon pop ─────────────────────────────
  // Pressurized radial explosion. Everything flies outward from center.
  if (goreType === 'eyeburst') {
    const cx = wx, cy = wy;

    // Heavy flesh chunks — big, slow spin, radial burst
    // These are the "it popped" pieces — the deflated body
    const fleshCount = 8 + (crit ? 4 : 0);
    for (let i = 0; i < fleshCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.12 + Math.random() * 0.16;
      pool.spawn(new Particle({
        x: cx + (Math.random() - 0.5) * 0.12,
        y: cy + (Math.random() - 0.5) * 0.10,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.25 - 0.02,
        ay: 0.6 + Math.random() * 0.4,
        life: 0.7 + Math.random() * 0.8,
        size0: 0.20 + Math.random() * 0.16,
        size1: 0.06 + Math.random() * 0.04,
        r: 150 + ((Math.random() * 50) | 0),
        g: 40 + ((Math.random() * 30) | 0),
        b: 80 + ((Math.random() * 40) | 0),
        a0: 0.90,
        a1: 0.08,
        rotVel: (Math.random() - 0.5) * 5,
      }));
    }

    // Psychic flash ring — fast sparks expanding outward
    // The stored psychic energy releasing on death
    const ringCount = 20 + (crit ? 10 : 0);
    for (let i = 0; i < ringCount; i++) {
      const ang = (i / ringCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const spd = 0.55 + Math.random() * 0.55;
      pool.spawn(new Particle({
        x: cx + (Math.random() - 0.5) * 0.08,
        y: cy + (Math.random() - 0.5) * 0.08,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.28 - 0.04,
        ay: 0.3,
        life: 0.15 + Math.random() * 0.12,
        size0: 0.05 + Math.random() * 0.04,
        size1: 0.01,
        r: 220 + ((Math.random() * 35) | 0),
        g: 150 + ((Math.random() * 70) | 0),
        b: 255,
        a0: 0.95,
        a1: 0,
      }));
    }

    // Vitreous blobs — large translucent jelly, drift outward slowly
    const blobCount = 5 + (crit ? 2 : 0);
    for (let i = 0; i < blobCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.04 + Math.random() * 0.07;
      pool.spawn(new Particle({
        x: cx + (Math.random() - 0.5) * 0.15,
        y: cy + (Math.random() - 0.5) * 0.12,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.25 - 0.01,
        ay: 0.12 + Math.random() * 0.08,
        life: 1.0 + Math.random() * 0.8,
        size0: 0.16 + Math.random() * 0.14,
        size1: 0.03,
        r: 110 + ((Math.random() * 30) | 0),
        g: 65 + ((Math.random() * 25) | 0),
        b: 175 + ((Math.random() * 35) | 0),
        a0: 0.55,
        a1: 0,
        rotVel: (Math.random() - 0.5) * 1.5,
      }));
    }

    // Center flash — the pop. Brief, bright, white-violet.
    for (let i = 0; i < 4; i++) {
      pool.spawn(new Particle({
        x: cx + (Math.random() - 0.5) * 0.06,
        y: cy + (Math.random() - 0.5) * 0.04,
        vx: (Math.random() - 0.5) * 0.03,
        vy: (Math.random() - 0.5) * 0.02,
        life: 0.08 + Math.random() * 0.06,
        size0: 0.26 + Math.random() * 0.12,
        size1: 0.02,
        r: 255,
        g: 210,
        b: 255,
        a0: 0.92,
        a1: 0,
      }));
    }
  }
}

// ── Public: install gore event handlers ───────────────────────────────

/**
 * Install gore VFX handlers for `damaged` and `died` events.
 * @param {{
 *   world: import('../../../lib/ecs-js/index.js').World,
 *   ftext: { addDamage: Function },
 *   fx: { pool: { spawn: Function } },
 *   getPosition: (id: number) => ({ x:number, y:number } | null),
 *   canShowAt: (x:number, y:number) => boolean,
 *   isPlayer?: (id: number) => boolean,
 *   getFxTime?: () => number,
 * }} deps
 */
/** @returns {boolean} */
export function isGoreDisabled() {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem('jshack.disableGore') === 'true'; } catch { return false; }
}

export function installGoreWiring({ world, ftext, fx, getPosition, canShowAt, isPlayer, getFxTime }) {
  /** @type {Map<number, { goreType:string, damageType:string, amount:number, critical:boolean, dx:number, dy:number }>} */
  const lastImpactByTarget = new Map();
  /** @type {Array<{ fireAt:number, fn:()=>void }>} */
  const pendingGore = [];
  const now = () => Math.max(0, Number(getFxTime?.() || 0));

  world.on('damaged', ({ target, source, amount, rawAmount, type, cause, critical, at, offhand, projectileDelay, impactVector, projectileKind, impactProfile, targetKind, goreType, sizeClass, visibility }) => {
    const t = Number(target || 0) || 0;
    const pos = (at && typeof at.x === 'number' && typeof at.y === 'number') ? at : getPosition(t);
    const hitIsPlayer = typeof isPlayer === 'function' ? !!isPlayer(t) : false;
    const sourceKnown = String(visibility || 'visible') === 'source-known'
      && typeof isPlayer === 'function'
      && !!isPlayer(Number(source || 0));
    if (pos && (canShowAt(pos.x, pos.y) || sourceKnown) && Number.isFinite(amount)) {
      const isCrit = !!critical;
      const resisted = Number.isFinite(rawAmount) && rawAmount > amount;
      const col = hitIsPlayer
        ? '#ff6060'
        : _damageTypeColor(String(type || 'physical'), resisted);
      const delay = Number(projectileDelay) || (offhand ? 0.15 : 0);
      // Offset damage text to the side of the target so it doesn't obscure the action
      let fx = pos.x + 0.5, fy = pos.y - 0.3;
      const iv = impactVector;
      if (iv && Number.isFinite(iv.dx) && Number.isFinite(iv.dy)) {
        // Nudge perpendicular to the attack vector so text stays out of the way
        fx += iv.dy * 0.25;
        fy -= Math.abs(iv.dx) * 0.15;
      }
      ftext.addDamage(fx, fy, amount, {
        dmg: amount, color: col, crit: isCrit, delay,
        // Non-crits: readable pop. Crits: linger for impact.
        life: isCrit ? 1.1 : 0.65,
        scaleStart: isCrit ? undefined : 0.85,
        scaleEnd: isCrit ? undefined : 0.55,
      });
    }
    const resolvedGoreType = normalizedGoreType(goreType, targetKind);

    const causeStr = String(cause || '');
    if (pos && fx?.pool && amount > 0
        && isGoreImpactCause(causeStr)
        && resolvedGoreType !== 'none'
        && !isGoreDisabled()) {
      const srcPos = getPosition(Number(source || 0));
      let dx = 0, dy = 0;
      if (srcPos) {
        dx = pos.x - srcPos.x; dy = pos.y - srcPos.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= len; dy /= len;
      } else {
        const a = Math.random() * Math.PI * 2;
        dx = Math.cos(a); dy = Math.sin(a);
      }
      const impact = impactVector && Number.isFinite(Number(impactVector.dx)) && Number.isFinite(Number(impactVector.dy))
        ? { dx: Number(impactVector.dx), dy: Number(impactVector.dy) }
        : null;
      if (impact) {
        const len = Math.hypot(impact.dx, impact.dy) || 1;
        dx = impact.dx / len;
        dy = impact.dy / len;
      }
      const critHit = !!critical;
      const lcCause = String(causeStr).toLowerCase();
      const goreDelay = Number(projectileDelay) || 0;
      const doSpawn = () => {
        if (lcCause === 'ranged' && String(projectileKind || '').toLowerCase() === 'arrow') {
          spawnArrowImpactGore(fx.pool, pos.x, pos.y, dx, dy, amount, critHit, resolvedGoreType, type);
        } else if (lcCause === 'melee') {
          spawnMeleeImpactGore(fx.pool, pos.x, pos.y, dx, dy, amount, critHit, resolvedGoreType, type, impactProfile);
        } else {
          spawnGore(fx.pool, pos.x, pos.y, dx, dy, amount, critHit, resolvedGoreType, type);
        }
      };
      if (goreDelay > 0) {
        const fireAt = now() + goreDelay;
        pendingGore.push({ fireAt, fn: doSpawn });
      } else {
        doSpawn();
      }
      lastImpactByTarget.set(t, {
        goreType: resolvedGoreType,
        damageType: String(type || 'physical'),
        amount: Math.max(1, Number(amount) || 1),
        critical: critHit,
        dx,
        dy,
        sizeClass: String(sizeClass || 'M'),
      });
    } else if (t > 0) {
      lastImpactByTarget.delete(t);
    }
  });

  world.on('died', ({ id }) => {
    const deadId = Number(id || 0) | 0;
    if (!(deadId > 0) || !fx?.pool) return;
    const pos = getPosition(deadId);
    const rec = lastImpactByTarget.get(deadId);
    lastImpactByTarget.delete(deadId);
    if (!pos || !canShowAt(pos.x, pos.y) || !rec || rec.goreType === 'none' || isGoreDisabled()) return;
    const deathFireAt = impactTracker.impactTimeFor(deadId, now());
    impactTracker.clear(deadId);
    const doDeathGore = () => {
      spawnDeathGore(
        fx.pool,
        pos.x,
        pos.y,
        rec.dx,
        rec.dy,
        rec.amount + 4,
        rec.goreType,
        rec.damageType,
        rec.critical,
        rec.sizeClass || 'M',
      );
    };
    if (deathFireAt > now()) {
      pendingGore.push({ fireAt: deathFireAt, fn: doDeathGore });
    } else {
      doDeathGore();
    }
  });

  /** Flush deferred gore spawns whose delay has elapsed. */
  function tick() {
    if (!pendingGore.length) return;
    const t = now();
    for (let i = pendingGore.length - 1; i >= 0; i--) {
      if (t >= pendingGore[i].fireAt) {
        pendingGore[i].fn();
        pendingGore.splice(i, 1);
      }
    }
  }

  return { tick };
}
