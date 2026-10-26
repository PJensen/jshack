// src/content/items/dawnbreaker.js
// ──────────────────────────────────────────────────────────────────
// Dawnbreaker — a blade that accumulates radiance through violence.
//
// The Sun-Vessel stores light and spends it.
// The Barrow Wight steals essence and hoards it.
// Dawnbreaker EARNS radiance through combat and chooses when to
// release it. Three artifacts, three different arcs of power.
//
// One file. Identity, stats, state, every hook, every presentation.
// ──────────────────────────────────────────────────────────────────

import { defineItem } from '../define.js';

defineItem('dawnbreaker', {
  name:        'Dawnbreaker',
  type:        'weapon',
  glyph:       ')',
  color:       '#f0c040',
  glow:        '#cc9920',
  scale:       0.8,
  weight:      2.2,
  value:       400,
  rarity:      'legendary',
  material:    'gold',
  description: 'A slender blade of white gold. Faint warmth radiates from the hilt when drawn.',
  tags:        ['sunlight', 'holy'],

  // ── Equipment stats ───────────────────────────────────────────
  bonuses:     { attack: 3, accuracy: 2, damagePower: 2, slashPenetration: 2 },
  damageDice:  '1d8',
  damageType:  'slash',
  staminaCost: 10,
  maxSockets:  1,
  procPackages: ['dawnbreaker'],

  // ── Swing identity ────────────────────────────────────────────
  swingProfile: {
    tint:       '#f0c040',
    lengthCm:   98,
    widthScale:  0.9,
    handleStart: 0.18,
    alphaStops: [[0, 0.3], [0.5, 0.7], [0.9, 1.0], [1, 1.0]],
  },

  // ── Local persistent state ────────────────────────────────────
  state: {
    radiance:   0,         // accumulated through hits (0–10)
    maxRad:     10,
    awakened:   false,     // flips when radiance reaches threshold
    killStreak: 0,         // consecutive kills without sheathing
  },

  // ── TOOLTIP STATUS ────────────────────────────────────────────
  status(st) {
    const lines = [];
    const pips = '◈'.repeat(st.radiance) + '◇'.repeat(st.maxRad - st.radiance);
    lines.push({
      text: `Radiance: ${pips} ${st.radiance}/${st.maxRad}`,
      color: st.awakened ? '#ffe577' : st.radiance > 0 ? '#f0c040' : '#666666',
    });
    if (st.awakened) {
      lines.push({ text: 'AWAKENED — bonus radiant damage', color: '#ffe577' });
    }
    return lines;
  },

  // ═════════════════════════════════════════════════════════════
  //  ON USE — release stored radiance as a holy nova
  // ═════════════════════════════════════════════════════════════
  // Spend all radiance for a burst. More radiance = more damage.
  // Reverts to dormant after release.
  onUse(ctx) {
    const st = ctx.state();

    if (st.radiance < 3) {
      ctx.message('Dawnbreaker hums faintly — not enough radiance to release.', 'system');
      return;
    }

    const rad = st.radiance;
    ctx.setState({ radiance: 0, awakened: false, killStreak: 0 });

    // Damage scales with stored radiance
    const novaDmg = 4 + rad * 2;
    const radius = rad >= 8 ? 3 : 2;

    const undead = ctx.entitiesInRadius(ctx.user, radius, { tag: 'undead' });
    const others = ctx.entitiesInRadius(ctx.user, radius, { faction: 'enemy' });

    for (const uid of undead) {
      ctx.damage(uid, novaDmg, 'radiant');
    }
    for (const oid of others) {
      if (!undead.includes(oid)) {
        ctx.damage(oid, Math.floor(novaDmg / 2), 'radiant');
        ctx.apply(oid, 'blind', 2);
      }
    }

    const totalTargets = new Set([...undead, ...others]).size;
    ctx.message(
      rad >= 8
        ? '{user} sweeps Dawnbreaker overhead — a ring of white fire erupts!'
        : '{user} releases Dawnbreaker\'s stored light in a flash.',
      'good'
    );
    ctx.present('nova_release', {
      target: ctx.user,
      radiance: rad,
      radius,
      targets: totalTargets,
    });
    ctx.sound('holy_chime');
  },

  // ═════════════════════════════════════════════════════════════
  //  AI HINTS
  // ═════════════════════════════════════════════════════════════
  aiHints: {
    threatIfSeenBy: {
      undead: 'high',
      thief: 'high_value',
    },
  },

  // ═════════════════════════════════════════════════════════════
  //  PRESENTATIONS
  // ═════════════════════════════════════════════════════════════
  presentations: {
    awaken: {
      sound: 'blade_ignite',
      vfx: [
        { type: 'burst', color: '#f0c040', count: 12, speed: 1.5, life: 0.5 },
        { type: 'glow', color: '#ffe577', radius: 1.5, life: 2.0 },
        { type: 'floatText', text: 'AWAKENED', color: '#ffe577' },
      ],
    },
    radiant_strike: {
      vfx: [
        { type: 'burst', color: '#ffe577', count: 4, speed: 0.8, life: 0.2 },
      ],
    },
    radiance_gain: {
      vfx: [
        { type: 'glow', color: '#f0c040', radius: 0.4, life: 0.3 },
      ],
    },
    nova_release: {
      sound: 'holy_chime',
      vfx: [
        { type: 'flash', color: '#fffbe6', radius: 5 },
        { type: 'burst', color: '#f0c040', count: 20, speed: 2.5, life: 0.5 },
        { type: 'glow', color: '#ffe577', radius: 2.0, life: 1.5 },
      ],
      message: 'Radiance detonates — {radiance} charges of light unleashed!',
      messageType: 'good',
    },
    aura_glow: {
      vfx: [
        { type: 'glow', color: '#f0c040', radius: 0.8, life: 0.4 },
      ],
    },
    aura_sear: {
      vfx: [
        { type: 'burst', color: '#ffe577', count: 3, speed: 0.5, life: 0.15 },
      ],
    },
    dormant: {
      vfx: [
        { type: 'floatText', text: 'dormant', color: '#997730' },
      ],
    },
  },
});
