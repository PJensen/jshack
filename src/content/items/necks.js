// src/content/items/necks.js
// All slot:neck definitions migrated from itemCatalogEquipment.js.

import { defineItem } from '../define.js';

defineItem('amulet_guarded', {
  name: 'Guarded Amulet', type: 'neck',
  glyph: '"', color: '#d5d9de', glow: '#9ba4af', scale: 0.55,
  material: 'silver', rarity: 1,
  bonuses: { defense: 1, maxHp: 3 },
  weight: 0.2,
});

defineItem('amulet_hearthwire', {
  name: 'Hearthwire Charm', type: 'neck',
  glyph: '"', color: '#d89f6d', glow: '#9c6c46', scale: 0.55,
  material: 'copper', rarity: 1,
  bonuses: { maxHp: 4, staminaRegen: 0.15 },
  weight: 0.2,
  description: 'A warm copper charm that keeps weary muscles moving.',
});

defineItem('pendant_lucky', {
  name: 'Lucky Pendant', type: 'neck',
  glyph: '"', color: '#e8d46a', glow: '#b8a44a', scale: 0.55,
  material: 'gold', rarity: 2,
  bonuses: { luck: 1 },
  weight: 0.1,
  description: 'A battered charm that has outlived every owner who wore it.',
});

defineItem('amulet_vigor', {
  name: 'Amulet of Vigor', type: 'neck',
  glyph: '"', color: '#f1c36c', glow: '#ba8f3f', scale: 0.55,
  material: 'gold', rarity: 2,
  bonuses: { maxStamina: 10, staminaRegen: 0.3 },
  weight: 0.2,
});

defineItem('amulet_warding', {
  name: 'Warding Amulet', type: 'neck',
  glyph: '"', color: '#c7d4e3', glow: '#8fa0b2', scale: 0.55,
  material: 'silver', rarity: 3,
  bonuses: { defense: 2, poisonResist: 0.15 },
  weight: 0.2,
  description: 'Runes etched into the silver hum faintly, turning aside blight.',
});

defineItem('amulet_focus', {
  name: 'Amulet of Focus', type: 'neck',
  glyph: '"', color: '#9fc7ff', glow: '#6c91c9', scale: 0.55,
  material: 'gold', rarity: 3,
  bonuses: { maxMana: 15, manaRegen: 0.4, spellHit: 1 },
  weight: 0.2,
  description: 'A pale sapphire set in gold that sharpens the mind.',
});

defineItem('pendant_soulkeeper', {
  name: 'Soulkeeper Pendant', type: 'neck',
  glyph: '"', color: '#f2a96f', glow: '#c57844', scale: 0.55,
  material: 'gold', rarity: 4,
  bonuses: { maxHp: 20, defense: 1, fireResist: 0.15 },
  weight: 0.3,
  description: 'A warm ember pulses inside the gem, anchoring the wearer\'s life force.',
});

defineItem('pendant_stormward', {
  name: 'Stormward Pendant', type: 'neck',
  glyph: '"', color: '#8fd0f2', glow: '#5d97b7', scale: 0.55,
  material: 'silver', rarity: 4,
  bonuses: { defense: 2, electricOhms: 200, acidResist: 0.15 },
  weight: 0.3,
  description: 'Crackling filaments ground lightning before it can reach the heart.',
});

defineItem('amulet_lifeblood', {
  name: 'Amulet of Lifeblood', type: 'neck',
  glyph: '"', color: '#ff8a83', glow: '#c95a54', scale: 0.55,
  material: 'gold', rarity: 5,
  bonuses: { maxHp: 25, defense: 1, staminaRegen: 0.5 },
  weight: 0.3,
  description: 'Warm to the touch, it quickens the blood and knits wounds shut between blows.',
  affixes: ['secondWind1'],
});

defineItem('amulet_arcanum', {
  name: 'Arcanum Pendant', type: 'neck',
  glyph: '"', color: '#b08fff', glow: '#7d62c9', scale: 0.55,
  material: 'gold', rarity: 5,
  bonuses: { maxMana: 30, manaRegen: 0.8, critChance: 0.05, spellHit: 3 },
  weight: 0.3,
  description: 'An ancient conduit that draws mana from the ether itself.',
});

defineItem('echo_pendant', {
  name: 'Echo Pendant', type: 'neck',
  glyph: '"', color: '#7ab0d8', glow: '#4a7aa0', scale: 0.55,
  material: 'silver', rarity: 4,
  bonuses: { attack: 1, critChance: 0.03 },
  description: 'The gem pulses once for every wound dealt. It stores the memory of the last blow and echoes it into the next.',
  procPackages: ['echoStrike'],
  weight: 0.2,
});

defineItem('deathascendant_medallion', {
  name: 'Medallion of the Death Ascendant', type: 'neck',
  glyph: '"', color: '#c86a8a', glow: '#8a3a5a', scale: 0.55,
  material: 'gold', rarity: 5,
  bonuses: { attack: 2, maxHp: 10 },
  description: 'A blackened disc etched with ascendant runes. Each kill detonates in invulnerability, berserk fury, and restored stamina.',
  procPackages: ['deathAscendant'],
  weight: 0.3,
});

defineItem('pendulum_of_three_tolls', {
  name: 'Pendulum of Three Tolls', type: 'neck',
  glyph: '"', color: '#8a72b6', glow: '#5f4a85', scale: 0.55,
  material: 'iron', rarity: 4,
  bonuses: { attack: 1 },
  weight: 1.0,
  description: 'A three-notch pendulum that advances with each hit you land on the same target. On the third toll, shadow damage detonates into them and they seize for a turn. The timer resets after 9 turns without a hit.',
  procPackages: ['tollwarden'],
});

defineItem('tithekeeper_choker', {
  name: "Tithekeeper's Choker", type: 'neck',
  glyph: '"', color: '#c98a6b', glow: '#8d5b41', scale: 0.55,
  material: 'iron', rarity: 4,
  bonuses: { defense: 1, maxHp: 8 },
  weight: 1.0,
  description: 'A flat iron band worn tight at the throat. Every wound you deal banks 10% of the damage as tithe. When you take a hit, all of that banked tithe repays as healing at once. Hit more than you\'re hit and you\'ll never need rest.',
  procPackages: ['bloodsport'],
});

defineItem('eclipse_torc', {
  name: 'Eclipse Torc', type: 'neck',
  glyph: '"', color: '#cfba7a', glow: '#8f7a45', scale: 0.55,
  material: 'gold', rarity: 5,
  bonuses: { defense: 1, fireResist: 0.1, poisonResist: 0.1 },
  weight: 1.0,
  description: 'Cast in two halves — fire-gold and frost-silver, fused at the clasp. Hits alternate: sun phase scatters 2 fire damage and burning to all adjacent enemies; moon phase scatters 2 cold damage and frost. Every swing advances the cycle automatically.',
  procPackages: ['moonfireCycle'],
});

defineItem('lantern_of_the_lost_hunt', {
  name: 'Lantern of the Lost Hunt', type: 'neck',
  glyph: '"', color: '#ffe066', glow: '#ccaa33', scale: 0.55,
  material: 'brass', rarity: 2,
  bonuses: { visionRange: 2, luck: 1 },
  weight: 0.4,
  value: 190,
  description: 'Its flame leans toward hidden danger. Use: illuminate the hunter’s senses for 20 turns. 40-turn cooldown.',
  abilities: {
    light_the_hunt: {
      name: 'Light the Hunt', icon: '☼', targeting: 'none', requiresEquipped: true,
      cooldown: 40,
      duration: 20,
      description: 'Sharpen your senses and reveal hidden danger for {duration} turns.',
      displayFormat: '{description} Cooldown: {cooldown} turns.',
      onActivate(ctx) {
        ctx.apply(ctx.user, 'spider_sense', 20, { potency: 1 });
        ctx.message('The lantern flares. Every hidden thing suddenly feels close.', 'good');
        ctx.present('light_the_hunt', { target: ctx.user });
      },
    },
  },
});

// ── Cursed amulets ────────────────────────────────────────────────────

defineItem('amulet_strangulation', {
  name: 'Amulet of Strangulation', type: 'neck',
  glyph: '"', color: '#5a4a4a', glow: '#3a2a2a', scale: 0.55,
  material: 'iron', rarity: 'magic', beatitude: 'cursed',
  bonuses: { maxHp: -3 },
  weight: 0.2,
  description: 'The chain tightens around your throat. You can feel it constricting.',
});

defineItem('amulet_aggravation', {
  name: 'Amulet of Aggravation', type: 'neck',
  glyph: '"', color: '#c8a870', glow: '#907040', scale: 0.55,
  material: 'bone', rarity: 'magic', beatitude: 'cursed',
  bonuses: { defense: -1 },
  weight: 0.1,
  description: 'A crude fetish of yellowed bone. Everything in the dungeon knows exactly where you are.',
});
