// src/content/items/legs.js
// All slot:legs definitions migrated from itemCatalogEquipment.js.

import { defineItem } from '../define.js';

defineItem('leggings_leather', {
  name: 'Leather Leggings', type: 'legs',
  glyph: ']', color: '#c49c66', glow: '#8b6a3e', scale: 0.75,
  material: 'leather', rarity: 1,
  bonuses: { defense: 1, maxStamina: 5 },
  value: 40,
  weight: 0.7,
});

defineItem('greaves_steel', {
  name: 'Steel Cuisses', type: 'legs',
  glyph: ']', color: '#b8c4cf', glow: '#8592a0', scale: 0.75,
  material: 'steel', rarity: 2,
  bonuses: { defense: 2, bluntResist: 0.15 },
  value: 100,
  weight: 2.0,
});

defineItem('legguards_plated', {
  name: 'Plated Legguards', type: 'legs',
  glyph: ']', color: '#b0b8c0', glow: '#7e868e', scale: 0.75,
  material: 'iron', rarity: 3,
  bonuses: { defense: 3, maxHp: 8 },
  value: 150,
  weight: 2.5,
  description: 'Overlapping iron plates secured with heavy rivets protect from knee to thigh.',
});

defineItem('leggings_scout', {
  name: "Scout's Leggings", type: 'legs',
  glyph: ']', color: '#8aaa6a', glow: '#5e7a44', scale: 0.75,
  material: 'leather', rarity: 3,
  bonuses: { defense: 1, attack: 1, dexterity: 2, maxStamina: 10, staminaRegen: 0.3 },
  value: 160,
  weight: 0.8,
  description: 'Supple hide trousers with reinforced knees for long marches and quick sprints.',
});

defineItem('legguards_fortress', {
  name: 'Fortress Greaves', type: 'legs',
  glyph: ']', color: '#a8b4c0', glow: '#768290', scale: 0.75,
  material: 'steel', rarity: 4,
  bonuses: { defense: 3, maxHp: 12, bluntResist: 0.15, slashResist: 0.1 },
  value: 360,
  weight: 3.0,
  description: 'Steel leg-plates shaped to deflect blows downward, anchoring the wearer like a tower.',
  affixes: ['kineticWard1'],
});

defineItem('leggings_prowler', {
  name: "Prowler's Breeches", type: 'legs',
  glyph: ']', color: '#7a8a6a', glow: '#4e5e44', scale: 0.75,
  material: 'leather', rarity: 4,
  bonuses: { defense: 2, attack: 1, critChance: 0.04, maxStamina: 12, staminaRegen: 0.3 },
  value: 400,
  weight: 0.9,
  description: 'Fitted with silent-step soles and hidden blade sheaths along each thigh.',
  affixes: ['guard1'],
});

defineItem('leggings_mystic', {
  name: 'Mystic Breeches', type: 'legs',
  glyph: ']', color: '#a88cc8', glow: '#765e98', scale: 0.75,
  material: 'cloth', rarity: 4,
  bonuses: { defense: 1, maxMana: 15, manaRegen: 0.4, spellHit: 1 },
  value: 380,
  weight: 0.2,
  description: 'Embroidered with sigils of containment that keep volatile mana from leaking.',
  affixes: ['life1'],
});

defineItem('legguards_colossus', {
  name: 'Colossus Legguards', type: 'legs',
  glyph: ']', color: '#c0c8d0', glow: '#8a929a', scale: 0.75,
  material: 'steel', rarity: 5,
  bonuses: { defense: 4, maxHp: 20, bluntResist: 0.2, slashResist: 0.15, pierceResist: 0.1 },
  value: 700,
  weight: 3.5,
  description: 'Scaled in titan-forged steel, each step shakes the ground.',
  affixes: ['shieldWall1'],
});

defineItem('leggings_wraith', {
  name: 'Wraithweave Leggings', type: 'legs',
  glyph: ']', color: '#8888b0', glow: '#5a5a80', scale: 0.75,
  material: 'leather', rarity: 5,
  bonuses: { defense: 2, attack: 2, critChance: 0.08, maxStamina: 15, staminaRegen: 0.4, luck: 1 },
  value: 650,
  weight: 0.7,
  description: "Woven from fibers that absorb light, the wearer's footfalls make no sound.",
  affixes: ['guard1'],
});

defineItem('cataclysm_greaves', {
  name: 'Cataclysm Greaves', type: 'legs',
  glyph: ']', color: '#c0a870', glow: '#8a7040', scale: 0.75,
  material: 'iron', rarity: 5,
  bonuses: { defense: 3, critChance: 0.04 },
  value: 600,
  description: 'Forged from the wreckage of something that used to be a battlefield. Crit kills fork into hazards, waves, and spreading marks.',
  procPackages: ['cataclysmChain'],
  weight: 2.5,
});

defineItem('soul_debt_greaves', {
  name: 'Soul Debt Greaves', type: 'legs',
  glyph: ']', color: '#8a7aa8', glow: '#5d4f77', scale: 0.75,
  material: 'iron', rarity: 4,
  bonuses: { defense: 2, critChance: 0.08, critMult: 0.5 },
  value: 500,
  description: 'Every step accrues a debt in silence. The crit power is obscene. Something will come to collect.',
  procPackages: ['soulMortgage'],
  weight: 2.0,
});

defineItem('plagueweaver_legwraps', {
  name: "Plagueweaver's Legwraps", type: 'legs',
  glyph: ']', color: '#7eb96c', glow: '#4f7d42', scale: 0.75,
  material: 'leather', rarity: 4,
  bonuses: { defense: 2, poisonResist: 0.1 },
  value: 500,
  weight: 1.0,
  description: 'Close-fitting leather with venom vials stitched into each knee-pad. Three consecutive hits on one target trigger the clock: shadow burst, virulent poison for 4 turns, disease for 3. The third hit is never just a third hit.',
  procPackages: ['venomLedger'],
});

defineItem('hungering_chainskirt', {
  name: 'Hungering Chainskirt', type: 'legs',
  glyph: ']', color: '#b59a67', glow: '#7c6843', scale: 0.75,
  material: 'iron', rarity: 4,
  bonuses: { defense: 2, maxStamina: 10 },
  value: 500,
  weight: 1.0,
  description: 'Heavy iron rings that clink with each new kill stacked. Kills feed the hunger (max 10 stacks, 12 turns). While hungry, each swing deals floor(stacks÷2) extra flat damage. Wear this into a mob and let it count.',
  procPackages: ['hungerSurge'],
});

defineItem('cataclysm_greaves_war', {
  name: "Warbreaker's Greaves", type: 'legs',
  glyph: ']', color: '#c0b08e', glow: '#847555', scale: 0.75,
  material: 'steel', rarity: 5,
  bonuses: { defense: 3, critChance: 0.03, maxHp: 10 },
  value: 750,
  weight: 4.5,
  description: 'Each critical kill erupts outward: a hazard spawns on the corpse, a shockwave brands all nearby enemies with a mark, and branded enemies detonate on the next strike. The kill is just the opening act.',
  procPackages: ['executionRipple'],
});
