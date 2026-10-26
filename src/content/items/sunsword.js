// src/content/items/sunsword.js
// ──────────────────────────────────────────────────────────────────
// Sunsword — content DSL port.
//
// The original sunsword was spread across 7+ files:
//   itemCatalogEquipment.js (catalog + on_use hook)
//   itemAbilityConstants.js (cooldown constant)
//   scrollWandWiring.js (ray handler + targeting + blind logic)
//   hudFeeds.js (hardcoded spell bar icon)
//   boltFxController.js (line VFX)
//   lighting/sources/index.js (holy beam lighting)
//   floatTextWiring.js (BLINDED! float text + particles)
//
// Now: this one file.
// ──────────────────────────────────────────────────────────────────

import { defineItem } from '../define.js';

defineItem('sunsword', {
  name:        'Sunsword',
  type:        'weapon',
  glyph:       '/',
  color:       '#ffffff',
  glow:        '#ffe8a0',
  scale:       0.8,
  weight:      1.6,
  value:       280,
  rarity:      'epic',
  material:    'gold',
  description: 'A blade of living light, warm to the touch. Undead recoil at its radiance.',
  tags:        ['sunlight'],

  // ── Equipment stats ───────────────────────────────────────────
  bonuses:     { attack: 2, damagePower: 2 },
  damageDice:  '1d8',
  damageType:  'slash',
  staminaCost: 8,

  swingProfile: {
    lengthCm:    116,
    length:      1.18,
    widthScale:  0.96,
    handleStart: 0.22,
    alphaStops: [
      [0.00, 0.22],
      [0.45, 0.60],
      [0.86, 0.95],
      [1.00, 1.00],
    ],
  },

  // ── Abilities ─────────────────────────────────────────────────
  // Declared here, shows up in the spell bar automatically.
  // Targeting, cooldown, and activation — all in one place.
  abilities: {
    blinding_ray: {
      name:        'Blinding Ray',
      icon:        '☼',
      targeting:   'enemy',
      range:       6,
      cooldown:    12,
      description: 'A searing ray of sunlight that blinds the target.',
      displayFormat: '{description} Range: {range} tiles. Cooldown: {cooldown} turns.',

      onActivate(ctx) {
        // Apply blind to the targeted enemy
        ctx.apply(ctx.target, 'blinded', 5);

        // Cooldown
        ctx.setCooldown(12);

        // Message
        ctx.message('A searing ray of light strikes {target} — it is blinded!');

        // Presentation: beam from user to target + flash
        ctx.present('blinding_ray', {
          target: ctx.target,
          user:   ctx.user,
        });
      },
    },
  },

  // ── Presentations ─────────────────────────────────────────────
  presentations: {
    blinding_ray: {
      sound: 'holy_beam',
      vfx: [
        { type: 'beam',      color: '#ffffa0' },
        { type: 'flash',     color: '#fffbe6', radius: 2 },
        { type: 'floatText', text: 'BLINDED!', color: '#ffffa0', life: 1.4 },
      ],
    },
  },
});
