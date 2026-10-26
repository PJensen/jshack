// src/content/items/rangedWeapons.js
// All ranged weapon (slot: ranged) definitions migrated from itemCatalogEquipment.js.
// Palette data folded in from display/palette/packs/weapons.js.

import { defineItem } from '../define.js';

defineItem('bow_short', {
  name: 'Short Bow',
  type: 'ranged',
  glyph: '}', color: '#c4a46c', glow: '#a08050', scale: 0.9,
  material: 'wood',
  subtype: 'bow',
  rarity: 1,
  bonuses: { attack: 1, maxStamina: 4 },
  damageDice: '1d6',
  range: 8,
  staminaCost: 6,
  weight: 1.5,
});

defineItem('bow_recurve', {
  name: 'Recurve Bow',
  type: 'ranged',
  glyph: '}', color: '#c8b37a', glow: '#8b7245', scale: 0.9,
  material: 'wood',
  subtype: 'bow',
  rarity: 1,
  bonuses: { attack: 1, maxStamina: 6 },
  damageDice: '1d6',
  range: 8,
  staminaCost: 5,
  weight: 1.8,
  description: 'A field bow with a tight draw and efficient release.',
});

defineItem('goblin_barbed_shortbow', {
  name: 'Goblin Barbed Shortbow',
  type: 'ranged',
  glyph: '}', color: '#8a7a50', glow: '#5a4a30', scale: 0.9,
  material: 'wood',
  subtype: 'bow',
  rarity: 1,
  bonuses: { attack: 1 },
  damageDice: '1d6',
  range: 8,
  staminaCost: 6,
  value: 3,
  weight: 1.7,
  description: 'A crude shortbow tuned for barbed shafts and dirty kills.',
  affixes: ['hemorrhage1'],
});

defineItem('bow_mirror', {
  name: 'Mirror Bow',
  type: 'ranged',
  glyph: '}', color: '#d0d8e8', glow: '#a0a8b8', scale: 0.9,
  material: 'wood',
  subtype: 'bow',
  rarity: 3,
  bonuses: { attack: 2 },
  damageDice: '1d6',
  range: 8,
  staminaCost: 6,
  weight: 1.8,
  description: 'A polished bow that throws wall-side impacts into nearby hostiles.',
  procPackages: ['ricochetTheology'],
});

defineItem('bow_long', {
  name: 'Longbow',
  type: 'ranged',
  glyph: '}', color: '#b09060', glow: '#887050', scale: 0.9,
  material: 'wood',
  subtype: 'bow',
  rarity: 2,
  bonuses: { attack: 2 },
  damageDice: '1d8',
  range: 10,
  weight: 2.0,
  staminaCost: 8,
});

defineItem('bow_flaming', {
  name: 'Flamebound Bow',
  type: 'ranged',
  glyph: '}', color: '#ff8a3c', glow: '#ff4a1f', scale: 0.9,
  material: 'wood',
  subtype: 'bow',
  rarity: 2,
  bonuses: { attack: 2 },
  damageDice: '1d8',
  range: 9,
  staminaCost: 7,
  weight: 1.9,
  description: 'Its string hums like a forge draft. Shots land hot enough to ignite flesh.',
  affixes: ['flaming'],
  ammoAffinities: {
    ammo_fire_arrows: { damageBonus: 1, fireSpreadChanceBonus: 0.15 },
  },
  lootBiases: { FireArrowsStack: 1.35 },
});

defineItem('bow_composite', {
  name: 'Composite Bow',
  type: 'ranged',
  glyph: '}', color: '#d4a8e0', glow: '#a070b8', scale: 0.9,
  material: 'wood',
  subtype: 'bow',
  rarity: 4,
  bonuses: { attack: 3 },
  damageDice: '1d10',
  range: 10,
  staminaCost: 7,
  weight: 2.1,
});

defineItem('bow_shadow', {
  name: 'Shadowstring Bow',
  type: 'ranged',
  glyph: '}', color: '#7088cc', glow: '#4060a8', scale: 0.9,
  material: 'wood',
  subtype: 'bow',
  rarity: 5,
  bonuses: { attack: 4 },
  damageDice: '1d10',
  range: 12,
  staminaCost: 6,
  weight: 2.1,
});

defineItem('predator_stakebow', {
  name: 'Stakebow of the Predator',
  type: 'ranged',
  glyph: '}', color: '#9bcf68', glow: '#67943c', scale: 0.9,
  material: 'wood',
  subtype: 'bow',
  rarity: 4,
  bonuses: { attack: 2, critChance: 0.04 },
  damageDice: '1d6',
  range: 9,
  staminaCost: 7,
  weight: 3.0,
  description: 'Each arrow brands the quarry with a hunter\'s mark (stacks to 5, fades in 4 turns). Each mark past the first adds flat bonus damage to every subsequent hit on that target. Five marks and the prey is a kill waiting to happen.',
  procPackages: ['arrowInstinct'],
});

defineItem('doom_crossbow', {
  name: 'Three-Toll Crossbow',
  type: 'ranged',
  glyph: '}', color: '#7f6aa8', glow: '#524079', scale: 0.9,
  material: 'steel',
  subtype: 'crossbow',
  rarity: 4,
  bonuses: { attack: 2 },
  damageDice: '1d8',
  range: 10,
  staminaCost: 8,
  weight: 3.0,
  description: 'Each bolt carves a notch into the target\'s fate. Three hits ring the toll — shadow damage detonates and the target seizes for a turn.',
  procPackages: ['tollwarden'],
});
