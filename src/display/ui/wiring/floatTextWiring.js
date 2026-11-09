// src/display/ui/wiring/floatTextWiring.js
// Float text + proc VFX wiring: vampiric, thorns, burning, fierce, healed,
// status, ranged:no-ammo, attack:insufficient-stamina, and misc float text.
// Gore VFX and pet UI bridge are in their own modules.

import { Particle } from "../../passes/vfx/particles/particlePool.js";
import { normalizeStatusEvent } from "../../../shared/events/statusEvent.js";
import { installGoreWiring, isGoreDisabled } from "./goreEngine.js";
import { installPetUiBridge } from "./petUiBridge.js";
import { defineExtension } from "../../../lib/ecs-js/index.js";

const FLOAT_TEXT_WIRING_KEY = Symbol.for('jshack:display:floatTextWiring');
const FLOAT_TEXT_CONTROLLERS = new WeakMap();

// ── Cooldown gate for non-damage float text ──────────────────────────
// Prevents spammy repeated messages (e.g. "out of stamina" every failed swing).
// Key = event tag, value = timestamp of last shown float.
const _cooldowns = new Map();
/** Returns true if the event should be shown (cooldown expired). */
function _throttle(tag, cooldownMs = 3000) {
  const now = Date.now();
  const last = _cooldowns.get(tag) || 0;
  if (now - last < cooldownMs) return false;
  _cooldowns.set(tag, now);
  return true;
}

const _staminaLines = [
  'Too exhausted!',
  'Your arms feel heavy...',
  'You can barely lift your weapon!',
  'You gasp for breath...',
  'Your muscles refuse!',
  'Not enough strength...',
  'You stagger with fatigue!',
  'Your body protests!',
];

const STATUS_LABEL_BY_KIND = Object.freeze({
  miss: 'MISS',
  immune: 'IMMUNE',
  resist: 'RESIST',
  taunt: '!',
  alert: '!',
});

const STATUS_LABEL_BY_EFFECT = Object.freeze({
  taunt: '!',
  stoneskin: 'STONESKIN',
  crit_boost: 'KEEN EDGE',
  mana_surge: 'MANA SURGE',
  lethargic: 'LETHARGIC',
  resist_fire: 'FIRE RESIST',
  resist_poison: 'POISON RESIST',
  resist_electric: 'LIGHTNING RESIST',
  resist_acid: 'ACID RESIST',
});

function resolveStatusLabel(kind, effect) {
  const effectKey = String(effect || '').trim().toLowerCase();
  if (effectKey && STATUS_LABEL_BY_EFFECT[effectKey]) return STATUS_LABEL_BY_EFFECT[effectKey];
  const kindKey = String(kind || '').trim().toLowerCase();
  if (kindKey && STATUS_LABEL_BY_KIND[kindKey]) return STATUS_LABEL_BY_KIND[kindKey];
  return kindKey ? kindKey.toUpperCase() : 'STATUS';
}

function spawnSpectralShimmerTrail(fx, from, to) {
  const dx = Number(to?.x || 0) - Number(from?.x || 0);
  const dy = Number(to?.y || 0) - Number(from?.y || 0);
  const dist = Math.hypot(dx, dy);
  if (!(dist > 0.01)) return;
  const ux = dx / dist;
  const uy = dy / dist;
  const count = Math.max(6, Math.min(14, Math.round(dist * 5)));
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 1 : i / (count - 1);
    const wobble = (Math.random() - 0.5) * 0.16;
    const px = from.x + (dx * t) + (-uy * wobble);
    const py = from.y + (dy * t) + (ux * wobble);
    fx.pool.spawn(new Particle({
      x: px + 0.5,
      y: py + 0.35,
      vx: ux * (0.18 + Math.random() * 0.12) + ((Math.random() - 0.5) * 0.08),
      vy: uy * (0.18 + Math.random() * 0.12) - 0.04 + ((Math.random() - 0.5) * 0.08),
      ax: 0,
      ay: -0.04,
      life: 0.24 + Math.random() * 0.16,
      size0: 0.11 + Math.random() * 0.03,
      size1: 0.02,
      r: 158 + ((Math.random() * 24) | 0),
      g: 232,
      b: 168 + ((Math.random() * 36) | 0),
      a0: 0.82,
      a1: 0,
    }));
  }
}

/**
 * Install float text + proc VFX event listeners.
 * @param {{
 *   world: import('../../../lib/ecs-js/index.js').World,
 *   ftext: { addStatus: Function, addHeal: Function, addDamage: Function },
 *   fx: { pool: { spawn: Function } },
 *   getPosition: (id: number) => ({ x:number, y:number } | null),
 *   isVisibleAt?: (x:number, y:number) => boolean,
 *   isPet: (id: number) => boolean,
 *   isPlayer?: (id: number) => boolean,
 * }} deps
 */
function installFloatTextListeners({ world, ftext, fx, getPosition, isVisibleAt, isPet, isPlayer, getFxTime }) {
  const canShowAt = (x, y) => (
    Number.isFinite(Number(x))
    && Number.isFinite(Number(y))
    && (typeof isVisibleAt !== 'function' || !!isVisibleAt(Number(x), Number(y)))
  );

  // ── Delegate gore VFX and pet UI bridge ─────────────────────────────
  const goreCtrl = installGoreWiring({ world, ftext, fx, getPosition, canShowAt, isPlayer, getFxTime });
  installPetUiBridge({ world, isPet });

  // ── Blood burst helper (used by bleeding/hemorrhage procs) ──────────
  function spawnBloodBurst(wx, wy, { amount = 4, hue = 'blood' } = {}) {
    if (isGoreDisabled()) return;
    const count = Math.max(10, Math.min(44, 10 + ((Number(amount) || 4) * 3) | 0));
    const bloodHue = hue === 'ichor'
      ? { r: 104, g: 165, b: 84 }
      : (hue === 'spark'
        ? { r: 240, g: 206, b: 112 }
        : { r: 168, g: 24, b: 24 });
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 2.2;
      fx.pool.spawn(new Particle({
        x: wx + 0.5 + (Math.random() - 0.5) * 0.14,
        y: wy + 0.5 + (Math.random() - 0.5) * 0.14,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 0.25,
        ay: 1.4,
        life: 0.16 + Math.random() * 0.42,
        size0: 0.07 + Math.random() * 0.08,
        size1: 0.01 + Math.random() * 0.02,
        r: Math.min(255, bloodHue.r + ((Math.random() * 34) | 0)),
        g: Math.min(255, bloodHue.g + ((Math.random() * 20) | 0)),
        b: Math.min(255, bloodHue.b + ((Math.random() * 16) | 0)),
        a0: 0.92,
        a1: 0,
      }));
    }
    const poolCount = Math.max(3, Math.min(16, 2 + ((Number(amount) || 4) | 0)));
    for (let i = 0; i < poolCount; i++) {
      fx.pool.spawn(new Particle({
        x: wx + 0.5 + (Math.random() - 0.5) * 0.34,
        y: wy + 0.5 + (Math.random() - 0.5) * 0.34,
        vx: 0,
        vy: 0,
        life: 10 + Math.random() * 14,
        size0: 0.05 + Math.random() * 0.05,
        size1: 0.14 + Math.random() * 0.16,
        r: Math.max(0, bloodHue.r - 10),
        g: Math.max(0, bloodHue.g - 8),
        b: Math.max(0, bloodHue.b - 8),
        a0: 0.72,
        a1: 0,
      }));
    }
  }

  // ── Proc VFX ────────────────────────────────────────────────────────

  world.on('proc:vampiric', ({ actor, target, amount }) => {
    const apos = getPosition(Number(actor || 0));
    const tpos = getPosition(Number(target || 0));
    if (!apos || !canShowAt(apos.x, apos.y)) return;
    if (_throttle(`vampiric:${actor}`, 3000))
      ftext.addStatus(apos.x, apos.y - 0.3, 'LIFESTEAL', { color: '#ff4040', life: 0.6 });
    if (tpos) {
      const dx = apos.x - tpos.x, dy = apos.y - tpos.y;
      const dist = Math.hypot(dx, dy) || 1;
      for (let i = 0; i < 6; i++) {
        const spd = 1.5 + Math.random() * 1.0;
        fx.pool.spawn(new Particle({
          x: tpos.x + (Math.random() - 0.5) * 0.3,
          y: tpos.y + (Math.random() - 0.5) * 0.3,
          vx: (dx / dist) * spd + (Math.random() - 0.5) * 0.5,
          vy: (dy / dist) * spd + (Math.random() - 0.5) * 0.5,
          life: 0.35 + Math.random() * 0.15,
          size0: 0.15, size1: 0.04,
          r: 200, g: 50, b: 50,
          a0: 0.85,
        }));
      }
    }
  });

  world.on('proc:thorns', ({ actor, target }) => {
    const tpos = getPosition(Number(target || 0));
    if (!tpos || !canShowAt(tpos.x, tpos.y)) return;
    if (_throttle(`thorns:${target}`, 3000))
      ftext.addStatus(tpos.x, tpos.y - 0.3, 'THORNS', { color: '#78ff78', life: 0.6 });
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 0.8 + Math.random() * 0.6;
      fx.pool.spawn(new Particle({
        x: tpos.x, y: tpos.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.2 + Math.random() * 0.15,
        size0: 0.12, size1: 0.03,
        r: 120, g: 255, b: 120,
        a0: 0.9,
      }));
    }
  });

  world.on('proc:burning', ({ actor, target }) => {
    const tpos = getPosition(Number(target || 0));
    if (!tpos || !canShowAt(tpos.x, tpos.y)) return;
    if (_throttle(`burning:${target}`, 3000))
      ftext.addStatus(tpos.x, tpos.y - 0.3, 'BURNING', { color: '#ff6600', life: 0.6 });
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.6;
      const spd = 0.6 + Math.random() * 0.8;
      fx.pool.spawn(new Particle({
        x: tpos.x + (Math.random() - 0.5) * 0.2,
        y: tpos.y + (Math.random() - 0.5) * 0.2,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        ay: -0.4,
        life: 0.3 + Math.random() * 0.2,
        size0: 0.18, size1: 0.04,
        r: 255, g: 140 + (Math.random() * 60) | 0, b: 20,
        a0: 0.9,
      }));
    }
  });

  world.on('proc:paralyzed', ({ target }) => {
    const tpos = getPosition(Number(target || 0));
    if (!tpos || !canShowAt(tpos.x, tpos.y)) return;
    ftext.addStatus(tpos.x, tpos.y - 0.3, 'PARALYZED', { color: '#ccaa44', life: 0.7 });
  });

  world.on('proc:flaming_bat:hit', ({ target }) => {
    const tpos = getPosition(Number(target || 0));
    if (!tpos || !canShowAt(tpos.x, tpos.y)) return;
    ftext.addStatus(tpos.x, tpos.y - 0.28, 'SCORCH', { color: '#ff7a38', life: 0.55 });
  });

  world.on('proc:fierce', ({ actor, target }) => {
    const tpos = getPosition(Number(target || 0));
    if (!tpos || !canShowAt(tpos.x, tpos.y)) return;
    ftext.addStatus(tpos.x, tpos.y + 0.3, '+1', { color: '#ffa040', life: 0.4 });
  });

  world.on('proc:bleeding', ({ target }) => {
    const pos = getPosition(Number(target || 0));
    if (!pos || !canShowAt(pos.x, pos.y) || !fx?.pool) return;
    spawnBloodBurst(pos.x, pos.y, { amount: 6, hue: 'blood' });
  });

  world.on('proc:hemorrhage', ({ target }) => {
    const pos = getPosition(Number(target || 0));
    if (!pos || !canShowAt(pos.x, pos.y) || !fx?.pool) return;
    spawnBloodBurst(pos.x, pos.y, { amount: 11, hue: 'blood' });
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.1 + Math.random() * 1.8;
      fx.pool.spawn(new Particle({
        x: pos.x + 0.5,
        y: pos.y + 0.5,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 0.25,
        ay: 0.10,
        life: 0.46 + Math.random() * 0.45,
        size0: 0.11 + Math.random() * 0.09,
        size1: 0.03,
        r: 182 + ((Math.random() * 40) | 0),
        g: 24 + ((Math.random() * 16) | 0),
        b: 24 + ((Math.random() * 16) | 0),
        a0: 0.95,
        a1: 0.08,
        rotVel: (Math.random() - 0.5) * 9,
      }));
    }
  });

  // ── Heal ────────────────────────────────────────────────────────────

  world.on('healed', (event) => {
    const targetId = event?.target ?? event?.id;
    const amount = Number(event?.amount);
    if (!(amount > 0) || !Number.isFinite(amount)) return;
    const pos = getPosition(Number(targetId || 0));
    if (pos && canShowAt(pos.x, pos.y)) {
      ftext.addHeal(pos.x, pos.y, amount, { color: '#7BFF7B' });
    }
  });

  // ── Status ──────────────────────────────────────────────────────────

  world.on('status', (payload) => {
    const { id, kind, effect, at, masked } = normalizeStatusEvent(payload);
    const pos = (at && typeof at.x === 'number' && typeof at.y === 'number') ? at : getPosition(Number(id || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    const kindLower = (String(kind || '')).toLowerCase();
    const style = kindLower === 'miss' ? 'miss' : (kindLower === 'immune' ? 'immune' : 'status');
    const label = masked ? kindLower.toUpperCase() || 'STATUS' : resolveStatusLabel(kind, effect);
    const opts = { style };
    if (kindLower === 'taunt' || kindLower === 'alert') opts.color = '#ffdd00';
    // Throttle repetitive combat status labels (immune, resist, miss) per target
    if ((kindLower === 'immune' || kindLower === 'resist' || kindLower === 'miss') &&
        !_throttle(`status:${kindLower}:${id}`, 3000)) return;
    ftext.addStatus(pos.x, pos.y, label, opts);
  });

  // ── Monster abilities ───────────────────────────────────────────────

  world.on('monster:ability:windup', ({ actor, at }) => {
    if (!_throttle(`windup:${actor}`, 2000)) return;
    const pos = (at && Number.isFinite(at.x) && Number.isFinite(at.y))
      ? { x: Number(at.x), y: Number(at.y) }
      : getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 0.22 + Math.random() * 0.25;
      fx.pool.spawn(new Particle({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.28 + Math.random() * 0.15,
        size0: 0.12,
        size1: 0.02,
        r: 255,
        g: 190,
        b: 90,
        a0: 0.85,
      }));
    }
  });

  world.on('monster:ability:cast', ({ actor, abilityName }) => {
    if (!_throttle(`cast:${actor}`, 2000)) return;
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    const label = String(abilityName || 'ABILITY').trim().toUpperCase();
    ftext.addStatus(pos.x, pos.y - 0.45, `${label}`, {
      color: '#ff5f5f',
      life: 0.7,
      scaleStart: 1.1,
      scaleEnd: 0.95,
    });
  });

  // ── Shield / dodge / parry combat feedback ──────────────────────────

  world.on('shield:guarded', ({ id, stacks, broken, at }) => {
    const pos = at || getPosition(Number(id || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.3, broken ? 'SHIELD BREAK!' : 'BLOCKED', {
      color: broken ? '#ff9955' : '#78d0ff',
      life: broken ? 1.2 : 0.8,
      scaleStart: broken ? 1.5 : 1.2,
      scaleEnd: 1.0,
    });
    // Spark burst for blocked hits
    const sparkColor = broken
      ? { r: 255, g: 150, b: 85 }
      : { r: 120, g: 208, b: 255 };
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 0.8;
      fx.pool.spawn(new Particle({
        x: pos.x + (Math.random() - 0.5) * 0.15,
        y: pos.y + (Math.random() - 0.5) * 0.15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.2,
        life: 0.2 + Math.random() * 0.15,
        size0: 0.09 + Math.random() * 0.05,
        size1: 0.02,
        r: sparkColor.r,
        g: sparkColor.g,
        b: sparkColor.b,
        a0: 0.9,
        a1: 0.0,
      }));
    }
  });

  world.on('shield:chip', ({ id, stacks, at }) => {
    const pos = at || getPosition(Number(id || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    // Small metallic sparks for chip
    for (let i = 0; i < 4; i++) {
      const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 0.4 + Math.random() * 0.5;
      fx.pool.spawn(new Particle({
        x: pos.x + (Math.random() - 0.5) * 0.1,
        y: pos.y + (Math.random() - 0.5) * 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ay: 1.0,
        life: 0.15 + Math.random() * 0.1,
        size0: 0.06,
        size1: 0.01,
        r: 200, g: 220, b: 255,
        a0: 0.85,
        a1: 0.0,
      }));
    }
  });

  world.on('shield:broken', ({ id, at }) => {
    const pos = at || getPosition(Number(id || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    // Shatter burst — many sparks flying outward
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.4;
      fx.pool.spawn(new Particle({
        x: pos.x + (Math.random() - 0.5) * 0.2,
        y: pos.y + (Math.random() - 0.5) * 0.2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3,
        ay: 1.2,
        life: 0.25 + Math.random() * 0.2,
        size0: 0.08 + Math.random() * 0.06,
        size1: 0.02,
        r: 255, g: 180, b: 80,
        a0: 0.95,
        a1: 0.0,
      }));
    }
  });

  world.on('combat:dodge', ({ defender, at }) => {
    const pos = at || getPosition(Number(defender || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.35, 'DODGE', {
      color: '#40e0d0',
      life: 0.9,
      scaleStart: 1.3,
      scaleEnd: 1.0,
    });
    // Quick sidestep blur — directional streak particles
    for (let i = 0; i < 5; i++) {
      const dx = (Math.random() - 0.5) * 2;
      fx.pool.spawn(new Particle({
        x: pos.x + dx * 0.15,
        y: pos.y + (Math.random() - 0.5) * 0.1,
        vx: dx * 1.5,
        vy: -0.1 + Math.random() * 0.2,
        life: 0.12 + Math.random() * 0.1,
        size0: 0.10,
        size1: 0.03,
        r: 64, g: 224, b: 208,
        a0: 0.7,
        a1: 0.0,
      }));
    }
  });

  world.on('combat:parry', ({ defender, at }) => {
    const pos = at || getPosition(Number(defender || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.35, 'PARRY!', {
      color: '#ffd700',
      life: 1.0,
      scaleStart: 1.4,
      scaleEnd: 1.0,
    });
    // Metallic clash sparks — bright yellow/white
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 1.0;
      fx.pool.spawn(new Particle({
        x: pos.x + (Math.random() - 0.5) * 0.12,
        y: pos.y + (Math.random() - 0.5) * 0.12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.2,
        ay: 0.8,
        life: 0.15 + Math.random() * 0.12,
        size0: 0.07 + Math.random() * 0.04,
        size1: 0.01,
        r: 255, g: 235, b: 130,
        a0: 0.95,
        a1: 0.0,
      }));
    }
  });

  // ── Combat text ─────────────────────────────────────────────────────

  world.on('ranged:no-ammo', ({ attacker }) => {
    if (!_throttle('no-ammo', 4000)) return;
    const pos = getPosition(Number(attacker || 0));
    if (pos && canShowAt(pos.x, pos.y)) ftext.addStatus(pos.x, pos.y, 'NO AMMO', { style: 'status' });
  });

  world.on('attack:insufficient-stamina', ({ attacker }) => {
    if (!_throttle('stamina', 4000)) return;
    const pos = getPosition(Number(attacker || 0));
    if (pos && canShowAt(pos.x, pos.y)) {
      const line = _staminaLines[Math.floor(Math.random() * _staminaLines.length)];
      ftext.addStatus(pos.x, pos.y - 0.3, line, { color: '#ff8c00', life: 1.0 });
    }
  });

  // ── Spell float text ────────────────────────────────────────────────

  world.on('spell:rampage', ({ actor }) => {
    const pos = getPosition(Number(actor || 0));
    if (pos && canShowAt(pos.x, pos.y)) {
      ftext.addStatus(pos.x, pos.y - 0.45, 'RAMPAGE!', {
        color: '#ff3a10',
        life: 1.4,
        scaleStart: 1.6,
        scaleEnd: 1.0,
      });
    }
  });

  world.on('spell:scorch', ({ at, fizzle, missed }) => {
    if (fizzle || missed) return;
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, 'SCORCHED', {
      color: '#ff6600',
      life: 1.2,
      scaleStart: 1.2,
      scaleEnd: 0.9,
    });
  });

  world.on('spell:plague_swarm', ({ at, fizzle, missed }) => {
    if (fizzle || missed) return;
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, 'SWARMED!', {
      color: '#ddb820',
      life: 1.3,
      scaleStart: 1.4,
      scaleEnd: 0.9,
    });
  });

  world.on('spell:plague_swarm:jump', ({ to }) => {
    if (!to || !canShowAt(to.x, to.y)) return;
    ftext.addStatus(to.x, to.y - 0.3, 'SWARM!', {
      color: '#ccaa10',
      life: 1.0,
      scaleStart: 1.2,
      scaleEnd: 0.8,
    });
  });

  world.on('spell:fireball', ({ to, fizzle, missed }) => {
    if (fizzle || missed) return;
    if (!to || !canShowAt(to.x, to.y)) return;
    ftext.addStatus(to.x, to.y - 0.3, 'FIREBALL!', {
      color: '#ff4400',
      life: 1.3,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
  });

  world.on('spell:earthshatter', ({ origin, enhanced }) => {
    if (!origin || !canShowAt(origin.x, origin.y)) return;
    ftext.addStatus(origin.x, origin.y - 0.45, 'EARTHQUAKE!', {
      color: enhanced ? '#ff5500' : '#8b7355',
      life: 1.3,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
  });

  world.on('spell:entangle', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, 'ENTANGLED!', {
      color: '#33cc55',
      life: 1.3,
      scaleStart: 1.4,
      scaleEnd: 1.0,
    });
  });

  world.on('spell:thorn_burst', ({ from, impacts }) => {
    if (!from || !canShowAt(from.x, from.y)) return;
    ftext.addStatus(from.x, from.y - 0.3, 'THORNS!', {
      color: '#88cc22',
      life: 1.2,
      scaleStart: 1.3,
      scaleEnd: 0.9,
    });
  });

  // ── Generator float text ──

  world.on('spell:savage_strike', ({ at, hit, staminaRestored }) => {
    if (!hit || !at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, `+${staminaRestored || 20} STAM`, {
      color: '#ffcc33', life: 0.9, scaleStart: 1.1, scaleEnd: 0.8,
    });
  });

  world.on('spell:natures_touch', ({ at, hit, manaRestored }) => {
    if (!hit || !at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, `+${manaRestored || 8} MANA`, {
      color: '#44ccaa', life: 0.9, scaleStart: 1.1, scaleEnd: 0.8,
    });
  });

  world.on('spell:cheap_shot', ({ at, hit, manaRestored }) => {
    if (!hit || !at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, `+${manaRestored || 10} MANA`, {
      color: '#88aaff', life: 0.9, scaleStart: 1.1, scaleEnd: 0.8,
    });
  });

  world.on('spell:arcane_bolt', ({ at, hit, manaRestored }) => {
    if (!hit || !at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, `+${manaRestored || 6} MANA`, {
      color: '#cc88ff', life: 0.9, scaleStart: 1.1, scaleEnd: 0.8,
    });
  });

  world.on('spell:leech_spores', ({ at, hit, manaRestored, staminaRestored }) => {
    if (!hit || !at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, `+${manaRestored || 6} MANA +${staminaRestored || 10} STAM`, {
      color: '#88cc44', life: 1.0, scaleStart: 1.1, scaleEnd: 0.8,
    });
  });

  world.on('spell:holy_strike', ({ at, hit, manaRestored }) => {
    if (!hit || !at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, `+${manaRestored || 8} MANA`, {
      color: '#ffee88', life: 0.9, scaleStart: 1.1, scaleEnd: 0.8,
    });
  });

  // ── Buff / Rotation ability floats ──

  world.on('spell:iron_flesh', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, 'IRON FLESH!', {
      color: '#aabbcc',
      life: 1.3,
      scaleStart: 1.4,
      scaleEnd: 1.0,
    });
  });

  world.on('spell:ignite_weapons', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, 'IGNITE!', {
      color: '#ff6600',
      life: 1.2,
      scaleStart: 1.3,
      scaleEnd: 0.9,
    });
  });

  world.on('spell:barkskin', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, 'BARKSKIN!', {
      color: '#66aa44',
      life: 1.2,
      scaleStart: 1.3,
      scaleEnd: 0.9,
    });
  });

  world.on('spell:quicken', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, 'QUICKEN!', {
      color: '#ffee44',
      life: 1.1,
      scaleStart: 1.3,
      scaleEnd: 0.9,
    });
  });

  world.on('spell:mark_of_death', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.3, 'MARKED!', {
      color: '#cc33ff',
      life: 1.4,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
  });

  world.on('spell:primal_roar', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.45, 'ROAR!', {
      color: '#ff8833',
      life: 1.4,
      scaleStart: 1.6,
      scaleEnd: 1.0,
    });
  });

  // ── Warden ability floats ──

  world.on('spell:war_cry', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.45, 'WAR CRY!', {
      color: '#ff4422',
      life: 1.3,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
  });

  world.on('spell:cleave', ({ at, hits }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    if (hits && hits.length > 0) {
      ftext.addStatus(at.x, at.y - 0.45, 'CLEAVE!', {
        color: '#cc3300',
        life: 1.2,
        scaleStart: 1.4,
        scaleEnd: 1.0,
      });
    }
  });

  world.on('spell:bloodthirst', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.45, 'BLOODTHIRST', {
      color: '#aa0022',
      life: 1.3,
      scaleStart: 1.3,
      scaleEnd: 1.0,
    });
  });

  world.on('proc:bloodthirst', ({ actor, healed }) => {
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addHeal(pos.x, pos.y - 0.3, `+${healed}`, { color: '#aa0022' });
  });

  // ── Cleric ability floats ──

  world.on('spell:purify', ({ at, removed }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    if (removed > 0) {
      ftext.addStatus(at.x, at.y - 0.45, 'PURIFIED', {
        color: '#ffffaa',
        life: 1.2,
        scaleStart: 1.3,
        scaleEnd: 1.0,
      });
    }
  });

  world.on('spell:divine_shield', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.45, 'DIVINE SHIELD', {
      color: '#ffdd66',
      life: 1.4,
      scaleStart: 1.4,
      scaleEnd: 1.0,
    });
  });

  world.on('spell:consecrate', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.45, 'CONSECRATE', {
      color: '#ffcc33',
      life: 1.3,
      scaleStart: 1.4,
      scaleEnd: 1.0,
    });
  });

  // ── Outlaw ability floats ──

  world.on('spell:smoke_bomb', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.45, 'SMOKE!', {
      color: '#888888',
      life: 1.3,
      scaleStart: 1.5,
      scaleEnd: 0.8,
    });
  });

  world.on('spell:poison_blade', ({ at, fizzle }) => {
    if (fizzle) return;
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.45, 'ENVENOMED', {
      color: '#44cc44',
      life: 1.2,
      scaleStart: 1.2,
      scaleEnd: 1.0,
    });
  });

  // ── Gaze stun ───────────────────────────────────────────────────────

  world.on('proc:gaze:stun', ({ target }) => {
    const pos = getPosition(Number(target || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.45, 'MIND LOCK!', {
      color: '#ff5fd2',
      life: 1.35,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 0.6;
      fx.pool.spawn(new Particle({
        x: pos.x,
        y: pos.y - 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.15,
        life: 0.25 + Math.random() * 0.2,
        size0: 0.12,
        size1: 0.03,
        r: 255,
        g: 95,
        b: 210,
        a0: 0.9,
      }));
    }
  });

  // ── Shrine proximity combat scaling ─────────────────────────────────

  world.on('shrine:combat:scaling', ({ attacker, label, mult, delta }) => {
    const pos = getPosition(Number(attacker || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    if (!_throttle(`shrine:scaling:${attacker}`, 2000)) return;
    const isBoon = mult > 1;
    const pct = Math.abs(Math.round((mult - 1) * 100));
    const text = `${label} ${isBoon ? '+' : '-'}${pct}%`;
    ftext.addStatus(pos.x, pos.y - 0.55, text, {
      color: isBoon ? '#ffd700' : '#aa44cc',
      life: 1.0,
      scaleStart: 1.2,
      scaleEnd: 0.9,
    });
  });

  // ── Fluorite charge/discharge ───────────────────────────────────────

  world.on('proc:fluorite:charge', ({ actor, charges, maxCharges, source }) => {
    if (charges < maxCharges) return;  // only show float text when fully charged
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    const label = source === 'shrine' ? 'SHRINE CHARGE' : 'CHARGED';
    ftext.addStatus(pos.x, pos.y - 0.45, label, {
      color: '#36f5c0',
      life: 1.1,
      scaleStart: 1.3,
      scaleEnd: 0.9,
    });
  });

  world.on('proc:fluorite:discharge', ({ actor, chargesSpent }) => {
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.55, 'DISCHARGE!', {
      color: '#2dffc0',
      life: 1.2,
      scaleStart: 1.6,
      scaleEnd: 1.0,
    });
  });

  // ── Spirit spell boost ──────────────────────────────────────────────

  world.on('spirit:spellBoost', ({ targetId }) => {
    const pos = getPosition(Number(targetId || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.45, 'SPIRIT SURGE!', {
      color: '#8cd2ff',
      life: 1.1,
      scaleStart: 1.3,
      scaleEnd: 1.0,
    });
  });

  world.on('inventory:gold-gained', ({ ownerId, delta, count }) => {
    const qty = Math.max(0, Number(delta ?? count ?? 0) | 0);
    if (qty <= 0) return;
    const pos = getPosition(Number(ownerId || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;

    ftext.addGold(pos.x, pos.y - 0.45, qty);
  });

  world.on('quest:progress', ({ questId, playerId, progress, target, label, at }) => {
    const qid = String(questId || '');
    const owner = Number(playerId || 0) | 0;
    const current = Math.max(0, Number(progress || 0) | 0);
    const total = Math.max(0, Number(target || 0) | 0);
    if (!qid || !(owner > 0) || total <= 0 || current <= 0) return;
    if (!_throttle(`quest:progress:vfx:${qid}:${current}`, 250)) return;
    const anchored = at && Number.isFinite(Number(at.x)) && Number.isFinite(Number(at.y))
      ? { x: Number(at.x), y: Number(at.y) }
      : null;
    const pos = anchored || getPosition(owner);
    if (!pos || !canShowAt(pos.x, pos.y)) return;

    const prefix = String(label || 'QUEST').trim().toUpperCase();
    ftext.addStatus(pos.x, pos.y - 0.95, `${prefix} ${current}/${total}`, {
      color: '#ffd85a',
      life: 1.15,
      scaleStart: 1.18,
      scaleEnd: 0.98,
    });
  });

  world.on('quest:completed', ({ questId, playerId, at }) => {
    const qid = String(questId || '');
    const owner = Number(playerId || 0) | 0;
    if (!_throttle(`quest:completed:vfx:${qid || owner}`, 1000)) return;
    const anchored = at && Number.isFinite(Number(at.x)) && Number.isFinite(Number(at.y))
      ? { x: Number(at.x), y: Number(at.y) }
      : null;
    const pos = anchored || getPosition(owner);
    if (!pos || !canShowAt(pos.x, pos.y)) return;

    ftext.addBanner(pos.x, pos.y - 0.9, 'QUEST COMPLETE!', {
      color: '#ffd85a',
      life: 3.0,
      scaleStart: 1.72,
      scaleEnd: 1.02,
    });

    for (let i = 0; i < 54; i++) {
      const t = i / 53;
      const spread = 0.08 + t * 0.86;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.0;
      const speed = 0.24 + Math.random() * 0.78;
      fx.pool.spawn(new Particle({
        x: pos.x + (Math.random() - 0.5) * spread,
        y: pos.y + 0.20 - t * 0.74 + (Math.random() - 0.5) * 0.09,
        vx: Math.cos(angle) * speed,
        vy: -0.72 - Math.random() * 1.02,
        ay: 0.66,
        life: 0.34 + Math.random() * 0.46,
        size0: 0.12 + Math.random() * 0.10,
        size1: 0.02,
        r: 255,
        g: 214 + ((Math.random() * 26) | 0),
        b: 100 + ((Math.random() * 34) | 0),
        a0: 0.98,
        a1: 0.0,
      }));
    }
  });

  // ── Misc float text ─────────────────────────────────────────────────

  world.on('mimic:revealed', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.45, 'MIMIC!', {
      color: '#ff8844',
      life: 1.4,
      scaleStart: 1.6,
      scaleEnd: 1.0,
    });
  });

  world.on('scroll:polymorph:vfx', ({ x, y }) => {
    if (!canShowAt(x, y)) return;
    ftext.addStatus(x, y - 0.45, 'POLYMORPH!', {
      color: '#dd77ff',
      life: 1.4,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.5;
      fx.pool.spawn(new Particle({
        x,
        y: y - 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.1,
        life: 0.3 + Math.random() * 0.2,
        size0: 0.10,
        size1: 0.02,
        r: 221,
        g: 119,
        b: 255,
        a0: 0.85,
      }));
    }
  });

  world.on('scroll:taming:vfx', ({ x, y }) => {
    if (!canShowAt(x, y)) return;
    ftext.addStatus(x, y - 0.45, 'TAMED!', {
      color: '#7BFF7B',
      life: 1.4,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.2 + Math.random() * 0.4;
      fx.pool.spawn(new Particle({
        x,
        y: y - 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.15,
        life: 0.3 + Math.random() * 0.2,
        size0: 0.08,
        size1: 0.02,
        r: 123,
        g: 255,
        b: 123,
        a0: 0.85,
      }));
    }
  });

  world.on('wand:stasis:vfx', ({ x, y }) => {
    if (!canShowAt(x, y)) return;
    ftext.addStatus(x, y - 0.45, 'FROZEN IN TIME!', {
      color: '#88ddff',
      life: 1.6,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.15 + Math.random() * 0.3;
      fx.pool.spawn(new Particle({
        x,
        y: y - 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.05,
        life: 0.4 + Math.random() * 0.3,
        size0: 0.10,
        size1: 0.03,
        r: 136,
        g: 221,
        b: 255,
        a0: 0.9,
      }));
    }
  });

  // sunsword:ray:vfx — migrated to content DSL presentation system

  world.on('nymph:stole', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.45, 'STOLEN!', {
      color: '#88ddaa',
      life: 1.3,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
  });

  world.on('nymph:blinked', ({ to }) => {
    if (!to || !canShowAt(to.x, to.y)) return;
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.2 + Math.random() * 0.4;
      fx.pool.spawn(new Particle({
        x: to.x, y: to.y - 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.1,
        life: 0.3 + Math.random() * 0.2,
        size0: 0.1, size1: 0.02,
        r: 136, g: 221, b: 170,
        a0: 0.8, a1: 0.0,
      }));
    }
  });

  world.on('proc:corroded', ({ target }) => {
    const pos = getPosition(Number(target || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.45, 'CORRODED!', {
      color: '#cc7744',
      life: 1.2,
      scaleStart: 1.4,
      scaleEnd: 1.0,
    });
  });

  // ── Corpse consumption ──────────────────────────────────────────────

  world.on('corpse:shocked', ({ actor }) => {
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.5, 'SHOCKED!', {
      color: '#70c0ff',
      life: 1.2,
      scaleStart: 1.4,
      scaleEnd: 0.8,
    });
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 0.8;
      fx.pool.spawn(new Particle({
        x: pos.x,
        y: pos.y - 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3,
        life: 0.15 + Math.random() * 0.2,
        size0: 0.08,
        size1: 0.01,
        r: 112,
        g: 192,
        b: 255,
        a0: 1.0,
      }));
    }
  });

  world.on('corpse:trait-gained', ({ actor, name }) => {
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    const label = String(name || 'TRAIT').toUpperCase();
    ftext.addStatus(pos.x, pos.y - 0.5, label + '!', {
      color: '#ffd966',
      life: 1.8,
      scaleStart: 1.6,
      scaleEnd: 1.0,
    });
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.5;
      fx.pool.spawn(new Particle({
        x: pos.x,
        y: pos.y - 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.2,
        life: 0.3 + Math.random() * 0.25,
        size0: 0.1,
        size1: 0.02,
        r: 255,
        g: 217,
        b: 102,
        a0: 0.9,
      }));
    }
  });

  world.on('corpse:buff-gained', ({ actor, effect }) => {
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    const label = String(effect || 'BUFF').toUpperCase().replace(/_/g, ' ');
    ftext.addStatus(pos.x, pos.y - 0.4, label, {
      color: '#7bed9f',
      life: 1.2,
      scaleStart: 1.2,
      scaleEnd: 0.9,
    });
  });

  world.on('corpse:debuff-gained', ({ actor, effect }) => {
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    const label = String(effect || 'DEBUFF').toUpperCase().replace(/_/g, ' ');
    ftext.addStatus(pos.x, pos.y - 0.4, label, {
      color: '#ff6b6b',
      life: 1.2,
      scaleStart: 1.2,
      scaleEnd: 0.9,
    });
  });

  world.on('corpse:progression', ({ actor, name, count, threshold }) => {
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.4, `${count}/${threshold}`, {
      color: '#dfe6e9',
      life: 1.0,
      scaleStart: 1.0,
      scaleEnd: 0.8,
    });
  });

  world.on('monster:corpse-eat', ({ monsterId, behavior, at }) => {
    if (!canShowAt(at?.x, at?.y)) return;
    const label = behavior === 'devour' ? 'DEVOUR!' : 'SCAVENGE';
    const color = behavior === 'devour' ? '#9370db' : '#8fbc8f';
    ftext.addStatus(at.x, at.y - 0.3, label, {
      color,
      life: behavior === 'devour' ? 1.2 : 0.8,
      scaleStart: behavior === 'devour' ? 1.4 : 1.0,
      scaleEnd: 0.9,
    });
  });

  // ── Weather / environment ───────────────────────────────────────────

  world.on('skill:campfire:spark', ({ at, success, reason }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    const ok = success === true;
    const wet = String(reason || '') === 'rain' || String(reason || '') === 'heavy_rain';
    if (!fx?.pool) return;
    const count = ok ? 30 : (wet ? 14 : 18);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = ok ? (0.75 + Math.random() * 1.65) : (0.12 + Math.random() * 0.45);
      fx.pool.spawn(new Particle({
        x: at.x + (Math.random() - 0.5) * (ok ? 0.28 : 0.22),
        y: at.y - 0.18 + (Math.random() - 0.5) * (ok ? 0.18 : 0.14),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (ok ? 0.65 : 0.12),
        ax: 0,
        ay: ok ? 1.9 : (wet ? -0.28 : -0.08),
        life: ok ? 0.18 + Math.random() * 0.28 : 0.45 + Math.random() * 0.38,
        size0: ok ? 0.06 + Math.random() * 0.05 : 0.10 + Math.random() * 0.07,
        size1: ok ? 0.01 : (wet ? 0.18 : 0.24),
        r: ok ? 255 : (wet ? 116 : 136),
        g: ok ? (160 + Math.floor(Math.random() * 70)) : (wet ? 132 : 126),
        b: ok ? 48 : (wet ? 154 : 132),
        a0: ok ? 0.98 : 0.38,
      }));
    }
  });

  world.on('weather:lightning', ({ x, y, hitCount }) => {
    if (!canShowAt(x, y)) return;
    ftext.addStatus(x, y - 0.45, (hitCount | 0) > 0 ? 'ZAP!' : 'CRACK!', {
      color: '#88ccff',
      life: 1.0,
      scaleStart: 1.6,
      scaleEnd: 0.9,
    });
  });

  world.on('bell:rung', ({ targetId }) => {
    const pos = getPosition(Number(targetId || 0));
    if (pos && canShowAt(pos.x, pos.y)) {
      ftext.addStatus(pos.x, pos.y - 0.3, 'ALARM!', { color: '#d4a017', life: 1.2 });
    }
  });

  // ── Movement ────────────────────────────────────────────────────────

  world.on('proc:fly:takeoff', ({ x, y }) => {
    if (!canShowAt(x, y)) return;
    ftext.addStatus(x, y - 0.45, 'TAKES FLIGHT!', {
      color: '#7bc8ff',
      life: 1.0,
      scaleStart: 1.2,
      scaleEnd: 0.9,
    });
  });

  world.on('proc:fly:land', ({ x, y }) => {
    if (!canShowAt(x, y)) return;
    ftext.addStatus(x, y - 0.3, 'LANDS', {
      color: '#b08050',
      life: 0.7,
    });
  });

  world.on('trap:avoided', ({ victimId }) => {
    const pos = getPosition(Number(victimId || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.4, 'DODGED!', {
      color: '#40e0d0',
      life: 0.9,
    });
  });

  // ── Wild Interactions float text ────────────────────────────────────

  world.on('combat:banish', ({ defender }) => {
    const pos = getPosition(Number(defender || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.45, 'BANISHED!', {
      color: '#ffd700',
      life: 1.5,
      scaleStart: 1.8,
      scaleEnd: 1.0,
    });
  });

  world.on('combat:shatter', ({ defender }) => {
    const pos = getPosition(Number(defender || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.45, 'SHATTER!', {
      color: '#87ceeb',
      life: 1.1,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });
  });

  world.on('combat:sunblind', ({ defender }) => {
    const pos = getPosition(Number(defender || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.45, 'BLINDED!', {
      color: '#ffffff',
      life: 1.2,
      scaleStart: 1.6,
      scaleEnd: 1.0,
    });
  });

  world.on('combat:blessed_strike', ({ defender }) => {
    const pos = getPosition(Number(defender || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.3, 'SMITE!', {
      color: '#ffd700',
      life: 0.9,
    });
  });

  world.on('combat:torch_ignite', ({ defender }) => {
    const pos = getPosition(Number(defender || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.3, 'IGNITE!', {
      color: '#ff6600',
      life: 1.0,
    });
  });

  world.on('spell:heal:undead', ({ targetId, at }) => {
    const pos = at || getPosition(Number(targetId || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.45, 'SEARED!', {
      color: '#ffd700',
      life: 1.1,
    });
  });

  world.on('trap:gas_explosion', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.5, 'BOOM!', {
      color: '#ff4500',
      life: 1.5,
      scaleStart: 2.0,
      scaleEnd: 1.0,
    });
  });

  world.on('hazard:ignited', ({ at, fromKind, toKind }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    if (String(fromKind || '').toLowerCase() !== 'gas') return;
    if (String(toKind || '').toLowerCase() !== 'fire') return;
    ftext.addStatus(at.x, at.y - 0.45, 'WHOOMPH!', {
      color: '#ff6a00',
      life: 1.2,
      scaleStart: 1.9,
      scaleEnd: 1.0,
    });
  });

  // ── Gas Spore explosion ──────────────────────────────────────────────
  world.on('monster:death:gas_spore', ({ at }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    ftext.addStatus(at.x, at.y - 0.55, 'SPORES!', {
      color: '#88ff55',
      life: 1.4,
      scaleStart: 2.1,
      scaleEnd: 1.1,
    });
    // Big radial fire burst
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const spd = 1.2 + Math.random() * 2.0;
      fx.pool.spawn(new Particle({
        x: at.x + 0.5,
        y: at.y + 0.5,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        ay: -0.3,
        life: 0.4 + Math.random() * 0.4,
        size0: 0.22, size1: 0.04,
        r: 255, g: 100 + (Math.random() * 100) | 0, b: 20,
        a0: 1.0,
      }));
    }
    // Inner flash particles
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 0.3 + Math.random() * 0.5;
      fx.pool.spawn(new Particle({
        x: at.x + 0.5 + (Math.random() - 0.5) * 0.3,
        y: at.y + 0.5 + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.15 + Math.random() * 0.15,
        size0: 0.30, size1: 0.10,
        r: 255, g: 240, b: 180,
        a0: 1.0,
      }));
    }
  });

  // ── Rot Grub burrow ──────────────────────────────────────────────────
  world.on('proc:rot_grub:burrow', ({ target }) => {
    const pos = getPosition(Number(target || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.35, 'BURROWS IN!', { color: '#cc4444', life: 0.9 });
    spawnBloodBurst(pos.x, pos.y, { amount: 8, hue: 'blood' });
  });

  world.on('proc:serpentBound:spectralSnakes', ({ actor, target, from, to }) => {
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.45, 'SPECTRAL SNAKES', {
      color: '#9fe889',
      life: 1.0,
      scaleStart: 1.35,
      scaleEnd: 0.95,
    });
    const start = (from && Number.isFinite(from.x) && Number.isFinite(from.y))
      ? { x: Number(from.x), y: Number(from.y) }
      : pos;
    const targetPos = (to && Number.isFinite(to.x) && Number.isFinite(to.y))
      ? { x: Number(to.x), y: Number(to.y) }
      : getPosition(Number(target || 0));
    if (targetPos && canShowAt(targetPos.x, targetPos.y)) {
      spawnSpectralShimmerTrail(fx, start, targetPos);
    }
  });

  world.on('hunger:choke', () => {
    const pe = playerEntity(world);
    if (!pe) return;
    const pos = getPosition(pe.id);
    if (!pos) return;
    ftext.addStatus(pos.x, pos.y - 0.4, 'CHOKE!', {
      color: '#ff6347',
      life: 1.0,
    });
  });

  world.on('spell:lifetap', ({ actor, manaGained }) => {
    const pos = getPosition(Number(actor || 0));
    if (!pos || !canShowAt(pos.x, pos.y)) return;
    ftext.addStatus(pos.x, pos.y - 0.45, 'LIFE TAP', {
      color: '#8b00ff',
      life: 1.2,
      scaleStart: 1.3,
      scaleEnd: 1.0,
    });
    if (manaGained > 0) {
      ftext.addHeal(pos.x, pos.y - 0.15, `+${manaGained} mana`, { color: '#4488ff' });
    }
  });

  // ── Wild Throw VFX ──────────────────────────────────────────────────

  const WAND_SHATTER_COLORS = Object.freeze({
    electric: { r: 120, g: 180, b: 255, label: 'SHATTER!', labelColor: '#78b4ff' },
    fire:     { r: 255, g: 140, b: 30,  label: 'SHATTER!', labelColor: '#ff8c1e' },
    cold:     { r: 140, g: 220, b: 255, label: 'SHATTER!', labelColor: '#8cdcff' },
    holy:     { r: 255, g: 240, b: 160, label: 'SHATTER!', labelColor: '#fff0a0' },
  });

  world.on('wand:shatter', ({ at, element, charges }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    const pal = WAND_SHATTER_COLORS[element] || WAND_SHATTER_COLORS.electric;
    const count = Math.min(40, 12 + charges * 4);

    ftext.addStatus(at.x, at.y - 0.4, pal.label, {
      color: pal.labelColor,
      life: 1.0,
      scaleStart: 1.5,
      scaleEnd: 1.0,
    });

    // Radial shard burst
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = 1.0 + Math.random() * 2.0;
      fx.pool.spawn(new Particle({
        x: at.x + (Math.random() - 0.5) * 0.3,
        y: at.y + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 0.3,
        ay: 0.8,
        life: 0.25 + Math.random() * 0.35,
        size0: 0.14 + Math.random() * 0.1,
        size1: 0.02,
        r: pal.r, g: pal.g, b: pal.b,
        a0: 0.95,
        rotVel: (Math.random() - 0.5) * 6,
      }));
    }

    // Inner flash — bright core burst
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      fx.pool.spawn(new Particle({
        x: at.x, y: at.y,
        vx: Math.cos(angle) * 0.3,
        vy: Math.sin(angle) * 0.3,
        life: 0.15 + Math.random() * 0.1,
        size0: 0.3, size1: 0.05,
        r: 255, g: 255, b: 255,
        a0: 0.8,
      }));
    }
  });

  const SPLASH_COLORS = Object.freeze({
    stun:           { r: 200, g: 170, b: 50 },
    hallucinating:  { r: 200, g: 100, b: 255 },
    blinded:        { r: 30,  g: 30,  b: 40 },
    weakened:       { r: 140, g: 140, b: 140 },
    poison:         { r: 80,  g: 200, b: 60 },
    confused:       { r: 220, g: 180, b: 60 },
    lethargic:      { r: 120, g: 120, b: 130 },
    berserk:        { r: 255, g: 60,  b: 40 },
    resist_fire:    { r: 255, g: 140, b: 60 },
    resist_poison:  { r: 60,  g: 180, b: 80 },
    resist_electric:{ r: 100, g: 160, b: 255 },
    resist_acid:    { r: 200, g: 180, b: 60 },
    mana_drain:     { r: 80,  g: 120, b: 255 },
  });

  world.on('potion:splash', ({ at, effectKey }) => {
    if (!at || !canShowAt(at.x, at.y)) return;
    const pal = SPLASH_COLORS[effectKey] || { r: 160, g: 160, b: 200 };

    ftext.addStatus(at.x, at.y - 0.3, 'SPLASH!', {
      color: `rgb(${pal.r},${pal.g},${pal.b})`,
      life: 0.8,
    });

    // Liquid splash — droplets arcing outward and falling
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 1.2;
      fx.pool.spawn(new Particle({
        x: at.x + (Math.random() - 0.5) * 0.15,
        y: at.y + (Math.random() - 0.5) * 0.15,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 0.6,
        ay: 2.0,
        life: 0.2 + Math.random() * 0.25,
        size0: 0.1 + Math.random() * 0.06,
        size1: 0.02,
        r: pal.r, g: pal.g, b: pal.b,
        a0: 0.85,
      }));
    }
  });

  world.on('corpse:misdirect', ({ at, misdirectedCount }) => {
    if (!at || !canShowAt(at.x, at.y)) return;

    ftext.addStatus(at.x, at.y - 0.35, 'THUD!', {
      color: '#a86c3c',
      life: 0.9,
      scaleStart: 1.3,
      scaleEnd: 1.0,
    });

    // Dirt/dust puff on impact
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 0.3 + Math.random() * 0.6;
      fx.pool.spawn(new Particle({
        x: at.x + (Math.random() - 0.5) * 0.2,
        y: at.y + (Math.random() - 0.5) * 0.2,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 0.2,
        ay: 0.4,
        life: 0.3 + Math.random() * 0.3,
        size0: 0.15 + Math.random() * 0.08,
        size1: 0.03,
        r: 140, g: 110, b: 70,
        a0: 0.6,
      }));
    }

    // Question mark particles for each misdirected mob (floating upward)
    if (misdirectedCount > 0) {
      for (let i = 0; i < Math.min(misdirectedCount, 5); i++) {
        const ox = (Math.random() - 0.5) * 2.0;
        const oy = (Math.random() - 0.5) * 2.0;
        ftext.addStatus(at.x + ox, at.y + oy - 0.3, '?', {
          color: '#ffcc44',
          life: 1.2,
          delay: 150 + i * 100,
        });
      }
    }
  });

  // ── Spirit wisp essence harvest — arcade score climb + stat bar ───

  let _harvestFt = null;
  let _harvestTarget = 0;
  let _harvestDisplay = 0;

  world.on('wisp:harvest', ({ x, y, wispX, wispY, points, score }) => {
    const sx = Number(wispX || x || 0);
    const sy = Number(wispY || y || 0);
    const pts = Math.max(1, Number(points) || 0);
    _harvestTarget += pts;

    if (_harvestFt && _harvestFt.ttl > 0) {
      _harvestFt.ttl = _harvestFt.life;
    } else {
      _harvestDisplay = 0;
      _harvestTarget = pts;
      _harvestFt = ftext.add(sx, sy - 0.25, '+0', {
        flavor: 'status',
        color: '#c8f4ff',
        life: 1.6,
        scaleStart: 0.8,
        scaleEnd: 0.7,
      });
      if (_harvestFt) { _harvestFt.vy = -0.1; _harvestFt.vx = 0; }
    }

    // Also push to stat bar
    window.dispatchEvent(new CustomEvent('ui:updateScore', {
      detail: { points: pts },
    }));
  });

  function tickHarvestCounter(dt) {
    if (!_harvestFt || _harvestFt.ttl <= 0) {
      _harvestFt = null;
      _harvestTarget = 0;
      _harvestDisplay = 0;
      return;
    }
    if (_harvestDisplay >= _harvestTarget) return;
    const gap = _harvestTarget - _harvestDisplay;
    const step = Math.max(1, Math.ceil(gap * 6 * dt));
    _harvestDisplay = Math.min(_harvestTarget, _harvestDisplay + step);
    _harvestFt.text = '+' + _harvestDisplay;
  }

  const _goreTick = goreCtrl.tick;
  return { goreTick(dt) { _goreTick(dt); tickHarvestCounter(dt); } };
}

export function installFloatTextWiring(deps) {
  const { world } = deps;
  if (!world || typeof world.install !== 'function') return { goreTick() {} };
  world.install(defineExtension('jshack:display:floatTextWiring', (installedWorld) => {
    FLOAT_TEXT_CONTROLLERS.set(installedWorld, installFloatTextListeners({ ...deps, world: installedWorld }));
  }, { key: FLOAT_TEXT_WIRING_KEY }));
  return FLOAT_TEXT_CONTROLLERS.get(world) || { goreTick() {} };
}
