// src/content/items/gloves.js
// All slot:gloves definitions migrated from itemCatalogEquipment.js.

import { defineItem } from '../define.js';

defineItem('gloves_leather', {
  name: 'Leather Gloves', type: 'gloves',
  glyph: '"', color: '#c49c66', glow: '#8b6a3e', scale: 0.6,
  material: 'leather', rarity: 1,
  bonuses: { defense: 1, maxStamina: 4 },
  weight: 0.2,
});

defineItem('tanner_bracers', {
  name: 'Tanner Bracers', type: 'gloves',
  glyph: '"', color: '#b08a5a', glow: '#785a38', scale: 0.6,
  material: 'leather', rarity: 1,
  bonuses: { defense: 1, maxHp: 2, maxStamina: 3 },
  weight: 0.2,
  description: "Workman's bracers with reinforced stitching along the wrist.",
});

defineItem('gauntlets_iron', {
  name: 'Iron Gauntlets', type: 'gloves',
  glyph: '"', color: '#a8b8c8', glow: '#768797', scale: 0.6,
  material: 'iron', rarity: 2,
  bonuses: { defense: 2, attack: 1 },
  weight: 0.7,
});

defineItem('gauntlets_steel', {
  name: 'Steel Gauntlets', type: 'gloves',
  glyph: '"', color: '#b8c4cf', glow: '#8592a0', scale: 0.6,
  material: 'steel', rarity: 3,
  bonuses: { defense: 3, attack: 1 },
  weight: 0.8,
  description: 'Polished steel plates riveted over hardened leather.',
});

defineItem('gloves_thieves', {
  name: "Thief's Gloves", type: 'gloves',
  glyph: '"', color: '#6f7f97', glow: '#49556a', scale: 0.6,
  material: 'leather', rarity: 3,
  bonuses: { attack: 2, dexterity: 2, critChance: 0.05, luck: 1 },
  weight: 0.2,
  description: 'Supple black leather with grip-pads sewn into every finger.',
});

defineItem('gauntlets_spiked', {
  name: 'Spiked Gauntlets', type: 'gloves',
  glyph: '"', color: '#aa8a70', glow: '#7a604a', scale: 0.6,
  material: 'iron', rarity: 4,
  bonuses: { defense: 2, attack: 2 },
  weight: 0.8,
  description: 'Iron spikes jut from the knuckles, punishing anyone who strikes the wearer.',
  affixes: ['thorns1'],
});

defineItem('gloves_arcane', {
  name: 'Arcane Handwraps', type: 'gloves',
  glyph: '"', color: '#b299ff', glow: '#7f69c6', scale: 0.6,
  material: 'cloth', rarity: 4,
  bonuses: { defense: 1, maxMana: 12, manaRegen: 0.5, critChance: 0.03, spellHit: 2 },
  weight: 0.1,
  description: 'Silk wraps stitched with silver thread that steady hostile spellwork and hum with residual magic.',
});

defineItem('gauntlets_dragonscale', {
  name: 'Dragonscale Gauntlets', type: 'gloves',
  glyph: '"', color: '#bf6f57', glow: '#8a4330', scale: 0.6,
  material: 'steel', rarity: 5,
  bonuses: { defense: 4, attack: 2, fireResist: 0.2, slashResist: 0.15 },
  weight: 1.0,
  description: 'Overlapping crimson scales shed heat like water off stone.',
});

defineItem('gloves_shadow', {
  name: 'Shadowgrasp Gloves', type: 'gloves',
  glyph: '"', color: '#6b6f86', glow: '#464a5d', scale: 0.6,
  material: 'leather', rarity: 5,
  bonuses: { attack: 3, critChance: 0.1, luck: 2 },
  weight: 0.2,
  description: 'Woven from umbral thread, they guide the hand to every weakness.',
});

defineItem('plague_gauntlets', {
  name: 'Plague Gauntlets', type: 'gloves',
  glyph: '"', color: '#6abf50', glow: '#408a2a', scale: 0.6,
  material: 'iron', rarity: 4,
  bonuses: { attack: 1, poisonResist: 0.1 },
  description: 'Hollow needles run along each knuckle, coated in compound toxins. Three hits and the venom clock detonates.',
  procPackages: ['venomClock'],
  weight: 0.8,
});

defineItem('predator_wraps', {
  name: "Predator's Wraps", type: 'gloves',
  glyph: '"', color: '#8aae64', glow: '#5e7a40', scale: 0.6,
  material: 'leather', rarity: 4,
  bonuses: { attack: 2, critChance: 0.04 },
  description: 'Strips of hide from creatures that were hunted, then stitched together by the hunter. Stacks the mark with every blow.',
  procPackages: ['predatorMark'],
  weight: 0.3,
});

defineItem('emberfletch_bracers', {
  name: 'Emberfletch Bracers', type: 'gloves',
  glyph: '"', color: '#e27a4d', glow: '#a84327', scale: 0.6,
  material: 'leather', rarity: 3,
  bonuses: { accuracy: 1, fireResist: 0.05 },
  ammoAffinities: {
    ammo_fire_arrows: { damageBonus: 1, fireSpreadChanceBonus: 0.15 },
  },
  lootBiases: { FireArrowsStack: 1.35 },
  weight: 0.3,
  description: 'Charred leather bracers that teach every flaming shaft to seek dry tinder.',
});

defineItem('tithe_wrapped_fists', {
  name: 'Tithe-Wrapped Fists', type: 'gloves',
  glyph: '"', color: '#c2a38b', glow: '#8a6e57', scale: 0.6,
  material: 'cloth', rarity: 3,
  bonuses: { attack: 1 },
  weight: 1.0,
  description: 'Strips of cloth soaked in old blood and wound tight. Every wound you deal banks 10% as tithe. Take a single hit and every banked point repays as healing all at once.',
  procPackages: ['bloodsport'],
});

defineItem('soul_debt_gauntlets', {
  name: 'Soul Debt Gauntlets', type: 'gloves',
  glyph: '"', color: '#8a7aa8', glow: '#5d4f77', scale: 0.6,
  material: 'iron', rarity: 4,
  bonuses: { attack: 1 },
  weight: 1.0,
  description: 'Obsidian-backed iron gauntlets etched with debt-runes on the inside of each knuckle. Crit chance, crit multiplier, and base damage are all obscenely boosted while worn. Each hit silently adds to a soul debt. Something is counting.',
  procPackages: ['debtHarvest'],
});

defineItem('eclipse_gauntlets', {
  name: 'Eclipse Gauntlets', type: 'gloves',
  glyph: '"', color: '#d3a970', glow: '#8d6b45', scale: 0.6,
  material: 'steel', rarity: 5,
  bonuses: { defense: 1, attack: 2 },
  weight: 1.0,
  description: 'One gauntlet runs warm, the other cold. Hits alternate: sun phase scatters 2 fire damage and burning to all adjacent enemies; moon phase scatters 2 cold damage and frost to the same radius. The palms decide which half of the sky speaks.',
  procPackages: ['moonfireCycle'],
});
