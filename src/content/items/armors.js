// src/content/items/armors.js
// All slot:armor definitions migrated from itemCatalogEquipment.js.

import { defineItem } from '../define.js';

defineItem('leather_armor', {
  name: 'Leather Armor', type: 'armor',
  glyph: '[', color: '#c49c66', glow: '#c49c66', scale: 0.85,
  material: 'leather', rarity: 1,
  bonuses: { defense: 1, maxHp: 4, maxStamina: 4 },
  weight: 5.0,
});

defineItem('scavenger_jerkin', {
  name: 'Scavenger Jerkin', type: 'armor',
  glyph: '[', color: '#b79264', glow: '#7d5f3f', scale: 0.85,
  material: 'leather', rarity: 1,
  bonuses: { defense: 1, maxHp: 6, maxStamina: 3, staminaRegen: 0.15 },
  weight: 5.5,
  description: 'Patchwork leather stitched from road-finds. Ugly, tough, and practical.',
});

defineItem('chain_armor', {
  name: 'Chainmail', type: 'armor',
  glyph: '[', color: '#b0c4de', glow: '#b0c4de', scale: 0.85,
  material: 'iron', rarity: 2,
  bonuses: { defense: 2 },
  weight: 10.0,
});

defineItem('leadweave_mantle', {
  name: 'Leadweave Mantle', type: 'armor',
  glyph: '[', color: '#93939f', glow: '#666677', scale: 0.85,
  material: 'iron', rarity: 3,
  bonuses: { defense: 1, slashResist: 0.2, electricOhms: 150, acidResist: 0.15 },
  weight: 6.5,
});

defineItem('plate_armor', {
  name: 'Plate Armor', type: 'armor',
  glyph: '[', color: '#c0c6cf', glow: '#8a919b', scale: 0.85,
  material: 'steel', rarity: 3,
  bonuses: { defense: 3 },
  weight: 15.0,
});

defineItem('armor_vanguard', {
  name: 'Vanguard Plate', type: 'armor',
  glyph: '[', color: '#b8c4d0', glow: '#848e9a', scale: 0.85,
  material: 'steel', rarity: 4,
  bonuses: { defense: 4, maxHp: 15, bluntResist: 0.15, slashResist: 0.1 },
  description: 'Forged in layers of folded steel, each plate interlocks to seal every gap.',
  affixes: ['shieldWall1'],
  weight: 16.0,
});

defineItem('armor_nightstalker', {
  name: 'Nightstalker Vest', type: 'armor',
  glyph: '[', color: '#6a6a88', glow: '#44445c', scale: 0.85,
  material: 'leather', rarity: 4,
  bonuses: { defense: 2, attack: 2, critChance: 0.05, maxStamina: 10 },
  description: 'Blackened leather fitted with hidden pockets and reinforced seams for silent kills.',
  affixes: ['lucky1'],
  weight: 4.5,
});

defineItem('armor_arcanist', {
  name: "Arcanist's Vestments", type: 'armor',
  glyph: '[', color: '#a080c8', glow: '#705098', scale: 0.85,
  material: 'cloth', rarity: 4,
  bonuses: { defense: 1, maxMana: 18, manaRegen: 0.5, spellHit: 2 },
  description: 'Woven from thread soaked in moonwell water, it hums with latent power.',
  affixes: ['poisonWard1'],
  weight: 2.0,
});

defineItem('armor_bulwark', {
  name: 'Bulwark of the Fallen King', type: 'armor',
  glyph: '[', color: '#c8ccd4', glow: '#969aa0', scale: 0.85,
  material: 'steel', rarity: 5,
  bonuses: { defense: 5, maxHp: 25, bluntResist: 0.2, slashResist: 0.15, pierceResist: 0.1 },
  description: 'A relic of a kingdom lost beneath the earth. Its bearer becomes an immovable wall.',
  affixes: ['shieldWall1', 'kineticWard1'],
  weight: 18.0,
});

defineItem('armor_phantom', {
  name: 'Phantom Harness', type: 'armor',
  glyph: '[', color: '#8a88b0', glow: '#5c5a80', scale: 0.85,
  material: 'leather', rarity: 5,
  bonuses: { defense: 3, attack: 3, critChance: 0.08, maxStamina: 12, luck: 2 },
  description: 'Stitched from the hides of shadow panthers, it shifts with the wearer like a second skin.',
  affixes: ['secondWind1'],
  weight: 4.0,
});

defineItem('tithekeeper_breastplate', {
  name: "Tithekeeper's Breastplate", type: 'armor',
  glyph: '[', color: '#c8a870', glow: '#8a7040', scale: 0.85,
  material: 'iron', rarity: 4,
  bonuses: { defense: 3, maxHp: 10 },
  description: 'Every wound you deal is silently banked. When you bleed, the debt repays all at once.',
  procPackages: ['bloodTithe'],
  weight: 12.0,
});

defineItem('blood_covenant_plate', {
  name: 'Blood Covenant Plate', type: 'armor',
  glyph: '[', color: '#c86a6a', glow: '#8a3a3a', scale: 0.85,
  material: 'steel', rarity: 5,
  bonuses: { defense: 4, maxHp: 12 },
  description: "The plate is warm to the touch — it's always drinking. Each swing costs 8% max HP and pays it back as fire.",
  procPackages: ['bloodCovenant'],
  weight: 16.0,
});

defineItem('plagueweaver_leathers', {
  name: "Plagueweaver's Leathers", type: 'armor',
  glyph: '[', color: '#78b06a', glow: '#4e7a42', scale: 0.85,
  material: 'leather', rarity: 4,
  bonuses: { defense: 2, poisonResist: 0.1 },
  weight: 1.0,
  description: 'Supple darkened hide stitched with compound-soaked knuckle-guards. Three consecutive hits on the same target trigger the clock: shadow burst, virulent poison for 4 turns, disease for 3.',
  procPackages: ['wardedRetort'],
});

defineItem('storm_channeler_robe', {
  name: "Storm Channeler's Robe", type: 'armor',
  glyph: '[', color: '#7da8e8', glow: '#4c72b6', scale: 0.85,
  material: 'cloth', rarity: 5,
  bonuses: { defense: 1, maxMana: 20, manaRegen: 0.6, critChance: 0.04 },
  weight: 4.5,
  description: 'Silken robes threaded with copper filament that arcs ceaselessly. Every critical hit sends 3 electric damage and shock through all hostiles within 2 tiles. The robe routes the bolt through you, not into you.',
  procPackages: ['kineticBattery'],
});

defineItem('hollow_berserker_plate', {
  name: "Hollow Berserker's Plate", type: 'armor',
  glyph: '[', color: '#b7a07d', glow: '#7f6848', scale: 0.85,
  material: 'iron', rarity: 4,
  bonuses: { defense: 3, maxHp: 12 },
  weight: 4.5,
  description: 'Tidal runes carved inside each plate press against the wearer\'s skin. Below 75% HP, hits gain +1. Below 50%, +3. Below 25%, +6 and targets weaken. It was built for someone who intended to bleed.',
  procPackages: ['bloodsport'],
});

defineItem('echo_ringmail', {
  name: 'Echo Ringmail', type: 'armor',
  glyph: '[', color: '#8aa3c7', glow: '#5a7296', scale: 0.85,
  material: 'iron', rarity: 4,
  bonuses: { defense: 3, attack: 1 },
  weight: 4.5,
  description: 'Hundreds of small rings, each one carved with a resonance rune. The mail stores the weight of the last hit landed. The next swing releases that stored force as spectral damage alongside the blow.',
  procPackages: ['shadowParry'],
});

defineItem('gamblers_mantle', {
  name: "Gambler's Mantle", type: 'armor',
  glyph: '[', color: '#d6a45d', glow: '#825b2b', scale: 0.85,
  material: 'cloth', rarity: 4,
  bonuses: { defense: 1, critChance: 0.05, luck: 2 },
  procPackages: ['gamblerMantle'],
  value: 650,
  weight: 0.5,
  description: 'A velvet mantle stitched with loaded dice. Ordinary blows disappoint it; critical blows make it laugh.',
});
