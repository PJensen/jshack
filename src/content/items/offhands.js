// src/content/items/offhands.js
// All slot:offhand definitions migrated from itemCatalogEquipment.js.
// Note: torch (has raw on_throw hook) stays in static catalog.

import { defineItem } from '../define.js';

defineItem('shield_wood', {
  name: 'Wooden Shield', type: 'offhand',
  glyph: '[', color: '#614116', glow: '#deb887', scale: 0.85,
  material: 'wood', rarity: 1,
  bonuses: { defense: 1, maxHp: 3 },
  value: 28,
  weight: 1.5,
});

defineItem('shield_iron', {
  name: 'Iron Shield', type: 'offhand',
  glyph: '[', color: '#a8b8c8', glow: '#8090a0', scale: 0.85,
  material: 'iron', rarity: 2,
  bonuses: { defense: 2 },
  value: 58,
  weight: 3.0,
});

defineItem('lantern', {
  name: 'Lantern', type: 'offhand',
  material: 'iron', rarity: 2,
  bonuses: { visionRange: 3 },
  value: 45,
  weight: 1.0,
  description: 'A sturdy hooded lantern that casts a warm glow, illuminating the darkness ahead.',
});

defineItem('shield_fireward', {
  name: 'Fireward Shield', type: 'offhand',
  glyph: '[', color: '#d48754', glow: '#a9552d', scale: 0.85,
  material: 'iron', rarity: 3,
  bonuses: { defense: 1, fireResist: 0.2 },
  value: 110,
  weight: 2.5,
});

defineItem('shield_spiked_pavise', {
  name: 'Spiked Pavise', type: 'offhand',
  material: 'iron', rarity: 2,
  bonuses: { defense: 2, pierceResist: 0.2, bluntResist: 0.15 },
  value: 95,
  weight: 4.5,
});

defineItem('grounded_buckler', {
  name: 'Grounded Buckler', type: 'offhand',
  material: 'iron', rarity: 3,
  bonuses: { defense: 1 },
  affixes: ['insulated1'],
  value: 115,
  weight: 2.45,
});

defineItem('shield_steel', {
  name: 'Steel Shield', type: 'offhand',
  glyph: '[', color: '#b6c2cf', glow: '#818d9a', scale: 0.85,
  material: 'steel', rarity: 2,
  bonuses: { defense: 3 },
  value: 90,
  weight: 3.5,
});

defineItem('rusted_buckler', {
  name: 'Rusted Buckler', type: 'offhand',
  glyph: '[', color: '#8f6a53', glow: '#664a38', scale: 0.85,
  material: 'iron', rarity: 2,
  bonuses: { defense: 1 },
  description: 'Dented and pitted, but it still hardens when struck.',
  affixes: ['shieldWall1'],
  value: 72,
  weight: 1.5,
});

defineItem('wardkeeper_shield', {
  name: 'Wardkeeper Shield', type: 'offhand',
  glyph: '[', color: '#9eb6c8', glow: '#6f8798', scale: 0.85,
  material: 'steel', rarity: 4,
  bonuses: { defense: 2, kineticDR: 1 },
  description: 'Runes flare across its face when danger is near.',
  affixes: ['shieldWall1', 'guard1'],
  value: 420,
  weight: 4.0,
});

defineItem('aegis_of_the_ancient', {
  name: 'Aegis of the Ancient', type: 'offhand',
  glyph: '[', color: '#d7be7f', glow: '#a48a4f', scale: 0.85,
  material: 'iron', rarity: 5,
  bonuses: { defense: 3, kineticDR: 2 },
  description: 'A tower shield inscribed with forgotten wards. It hums when struck.',
  affixes: ['shieldWall1', 'secondWind1'],
  value: 850,
  weight: 5.0,
});

defineItem('soulascendant_shield', {
  name: 'Soul Ascendant Shield', type: 'offhand',
  glyph: '[', color: '#d8a0e0', glow: '#a070b0', scale: 0.85,
  material: 'iron', rarity: 5,
  bonuses: { defense: 3, kineticDR: 1, maxHp: 10 },
  description: 'The iron face is etched with harvested soul-glyphs. Each kill heals the bearer, applies regen, and hardens them against the next blow.',
  procPackages: ['soulAscendant'],
  value: 780,
  weight: 4.5,
});

defineItem('predator_buckler', {
  name: "Predator's Buckler", type: 'offhand',
  glyph: '[', color: '#8aae64', glow: '#5e7a40', scale: 0.85,
  material: 'steel', rarity: 4,
  bonuses: { defense: 2, attack: 1 },
  description: 'A light buckler inlaid with claw-marks. Each hit stacks the predator\'s mark, amplifying every subsequent blow on the same target.',
  procPackages: ['predatorMark'],
  value: 430,
  weight: 2.0,
});

defineItem('glacier_sigil', {
  name: 'Glacier Sigil', type: 'offhand',
  material: 'crystal', rarity: 3,
  bonuses: { maxMana: 8, spellHit: 2 },
  weight: 1,
  description: 'A palm-sized sigil of deep ice. Frost spells can lock struck enemies in place for a turn.',
  dropRequirement: ({ knownSpells }) => !!knownSpells?.has?.('frost') || !!knownSpells?.has?.('blizzard'),
  procPackages: ['glacierSigil'],
  value: 260,
});

defineItem('conduction_lens', {
  name: 'Conduction Lens', type: 'offhand',
  material: 'glass', rarity: 4,
  bonuses: { maxMana: 10, spellHit: 3 },
  weight: 1,
  description: 'A prismatic lens wound in copper wire. Lightning spells jump to one extra nearby foe at reduced spill damage.',
  dropRequirement: ({ knownSpells }) => !!knownSpells?.has?.('lightning'),
  procPackages: ['conductionLens'],
  value: 380,
});

defineItem('echo_grimoire', {
  name: 'Echo Grimoire', type: 'offhand',
  material: 'paper', rarity: 4,
  bonuses: { maxMana: 12, manaRegen: 0.4, spellHit: 2 },
  weight: 2,
  description: 'A spellbook that remembers your cadence. Repeat a spell within 3 turns to cast it for free at reduced power.',
  dropRequirement: ({ knownSpells }) => !!knownSpells && knownSpells.size > 0,
  procPackages: ['echoGrimoire'],
  value: 520,
});

defineItem('portent_focus', {
  name: 'Portent Focus', type: 'offhand',
  glyph: '*', color: '#8e89d9', glow: '#5d58a8', scale: 0.5,
  material: 'iron', rarity: 4,
  bonuses: { defense: 1, maxMana: 10, manaRegen: 0.3 },
  weight: 1.0,
  description: 'A cracked orb with three concentric rings inside. Each hit you land advances one ring. On the third, shadow detonates into the target and seizes them. Hold it in the off-hand and count the toll.',
  maxCharges: 8,
  charges: 0,
  procPackages: ['omenDrive', 'graveCurrent'],
  value: 480,
});

defineItem('cataclysm_aegis', {
  name: 'Cataclysm Aegis', type: 'offhand',
  glyph: '[', color: '#c4b084', glow: '#86744f', scale: 0.85,
  material: 'steel', rarity: 5,
  bonuses: { defense: 3, kineticDR: 2 },
  weight: 4.77,
  description: 'Critical kills cascade through this shield: a hazard erupts, a shockwave marks all adjacents, and those marked explode on the next hit. It was forged for someone who treats each death as the beginning of a chain.',
  procPackages: ['cataclysmGuard'],
  value: 820,
});

defineItem('bloodpact_orb', {
  name: 'Bloodpact Orb', type: 'offhand',
  glyph: '*', color: '#cc6666', glow: '#913b3b', scale: 0.5,
  material: 'iron', rarity: 5,
  bonuses: { defense: 1, maxMana: 15, manaRegen: 0.5 },
  weight: 1.33,
  description: 'A sphere of crystallised blood that pulses red with each swing. Each attack costs 8% of your max HP (never fatal) and adds +5 fire damage to that hit. The orb takes what it needs — with or without permission.',
  maxCharges: 6,
  charges: 0,
  procPackages: ['ritualOverdraw', 'graveCurrent'],
  value: 600,
});
