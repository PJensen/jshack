// src/content/items/sunVessel.js
// ──────────────────────────────────────────────────────────────────
// The Sun-Vessel — a complex stateful artifact.
//
// A sealed reliquary of captive daylight. Carries charge that can be
// invoked for holy bursts, or thrown for a devastating explosion.
// While carried, it pulses near undead, draining stability.
// When cracked, it leaks radiance that scorches the dead.
//
// One file. Everything the thing is, does, and looks like.
// ──────────────────────────────────────────────────────────────────

import { defineItem } from '../define.js';

defineItem('sun_vessel', {
  name:        'Sun-Vessel',
  type:        'tool',
  glyph:       '{',
  color:       '#f6d365',
  glow:        '#ffb347',
  scale:       0.55,
  weight:      1.5,
  value:       350,
  rarity:      'legendary',
  material:    'bronze',
  description: 'A sealed reliquary of captive daylight. It hums with quiet warmth.',
  tags:        ['light', 'holy', 'volatile'],
  procPackages: ['sunVessel'],

  // ── Local persistent state ──────────────────────────────────────
  state: {
    charge:     8,
    maxCharge:  8,
    stability:  10,
    cracked:    false,
  },

  // ── TOOLTIP STATUS ──────────────────────────────────────────────
  // Receives live ScriptState.data, returns lines for the item tooltip.
  status(st) {
    const lines = [];
    const chargePct = st.charge / st.maxCharge;
    lines.push({
      text: `Charges: ${'◈'.repeat(st.charge)}${'◇'.repeat(st.maxCharge - st.charge)} ${st.charge}/${st.maxCharge}`,
      color: chargePct > 0.5 ? '#f6d365' : chargePct > 0 ? '#ffb347' : '#666666',
    });
    if (st.cracked) {
      lines.push({ text: 'CRACKED — leaking radiance', color: '#ff6644' });
    } else if (st.stability < 10) {
      lines.push({ text: `Stability: ${st.stability}/10`, color: st.stability < 4 ? '#ff9944' : '#aaaaaa' });
    }
    return lines;
  },

  // ── USE: Invoke ─────────────────────────────────────────────────
  // Spend one charge for a holy burst: damages nearby undead,
  // heals the bearer slightly, emits light.
  onUse(ctx) {
    const st = ctx.state();

    if (st.charge <= 0) {
      ctx.message('The {item} is spent — only cold glass remains.', 'system');
      return;
    }

    // Spend charge
    ctx.setState({ charge: st.charge - 1 });

    // Holy burst: find undead in radius 3
    const undead = ctx.entitiesInRadius(ctx.user, 3, { tag: 'undead' });
    let totalDmg = 0;
    for (const uid of undead) {
      totalDmg += ctx.damage(uid, '2d6', 'radiant');
    }

    // Heal bearer
    const healed = ctx.heal(ctx.user, '1d6+2');

    // Message
    if (undead.length > 0) {
      ctx.message('{user} raises the {item} — golden fire lashes the dead!', 'good');
    } else {
      ctx.message('{user} raises the {item} — warm light floods outward.', 'system');
    }

    // Presentation
    ctx.present('invoke', {
      target: ctx.user,
      healed,
      damaged: totalDmg,
      undeadHit: undead.length,
      remaining: st.charge - 1,
    });
  },

  // ── THROW: Shatter ──────────────────────────────────────────────
  // Shatters the vessel, releasing ALL remaining charge at once.
  // Massive radiant explosion proportional to stored charge.
  onThrow(ctx) {
    const st = ctx.state();
    const chargeLeft = Math.max(0, st.charge);
    const landing = ctx.targetPos;

    if (chargeLeft === 0) {
      ctx.message('The empty {item} shatters harmlessly.', 'system');
      ctx.consume();
      return;
    }

    // Release all charge
    ctx.setState({ charge: 0, cracked: true });

    // Scale damage with remaining charge
    const baseDmg = 2 + chargeLeft * 3;
    const undead = landing ? ctx.entitiesInRadius(landing, 4, { tag: 'undead' }) : [];
    for (const uid of undead) {
      ctx.damage(uid, baseDmg, 'radiant');
    }

    // Also damages non-undead nearby, but less
    const others = landing ? ctx.entitiesInRadius(landing, 2, { faction: 'enemy' }) : [];
    for (const oid of others) {
      if (!undead.includes(oid)) {
        ctx.damage(oid, Math.floor(baseDmg / 2), 'radiant');
        ctx.apply(oid, 'blind', 3);
      }
    }

    ctx.message('The {item} detonates — a pillar of captured sunlight erupts!', 'danger');
    ctx.present('shatter', {
      at: landing,
      charge: chargeLeft,
    });
    ctx.consume();
  },

  // ── AI HINTS ────────────────────────────────────────────────────
  aiHints: {
    threatIfSeenBy: {
      undead: 'extreme',
      thief: 'high_value',
    },
  },

  // ── PRESENTATIONS ───────────────────────────────────────────────
  // Co-located. One file. Simulation calls ctx.present(id, payload),
  // display reads these specs. In headless mode, ignored entirely.
  presentations: {
    // USE: holy burst — golden explosion of light + particles + heal text
    invoke: {
      sound: 'holy_chime',
      vfx: [
        { type: 'lightPulse', color: '#f6d365', radius: 5, duration: 0.5 },
        { type: 'burst', color: '#f6d365', count: 14, speed: 1.4, life: 0.4 },
        { type: 'glow', color: '#ffb347', radius: 1.8, life: 1.5 },
        { type: 'floatText', text: '+{healed} HP', color: '#f6d365' },
      ],
    },

    // THROW: full detonation — massive flash + radiant cascade
    shatter: {
      sound: 'glass_shatter',
      vfx: [
        { type: 'lightPulse', color: '#fffbe6', radius: 8, duration: 0.6 },
        { type: 'flash', color: '#fffbe6', radius: 6 },
        { type: 'burst', color: '#f6d365', count: 24, speed: 3.0, life: 0.6 },
        { type: 'glow', color: '#ffb347', radius: 2.5, life: 1.0 },
      ],
      message: 'Radiant energy cascades outward — {charge} charges released!',
      messageType: 'danger',
    },

    // TICK: undead sensed — vessel pulses, brief light flare
    pulse: {
      vfx: [
        { type: 'lightPulse', color: '#f6d365', radius: 3, duration: 0.25 },
        { type: 'glow', color: '#f6d365', radius: 0.8, life: 0.4 },
      ],
    },

    // TICK: stability hits zero — vessel cracks, sharp flash + text
    crack: {
      sound: 'glass_crack',
      vfx: [
        { type: 'lightPulse', color: '#ff9933', radius: 4, duration: 0.35 },
        { type: 'burst', color: '#ffb347', count: 8, speed: 0.6, life: 0.25 },
        { type: 'floatText', text: 'CRACKED', color: '#ff8844' },
      ],
    },

    // TICK: cracked vessel leaking — dim pulse each turn, fading warmth
    leak: {
      vfx: [
        { type: 'lightPulse', color: '#ffb347', radius: 2, duration: 0.2 },
        { type: 'burst', color: '#ff9933', count: 3, speed: 0.3, life: 0.15 },
      ],
    },
  },
});
