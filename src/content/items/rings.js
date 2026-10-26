// src/content/items/rings.js
// All slot:ring definitions migrated from itemCatalogEquipment.js.

import { defineItem } from '../define.js';

defineItem('ring_copper', {
  name: 'Copper Ring', type: 'ring',
  glyph: '◌', color: '#c87a3a', glow: '#8a5020', scale: 0.45,
  material: 'copper', rarity: 1,
  bonuses: { defense: 1 },
  weight: 0.05,
  description: 'A simple hammered copper band, green with patina.',
});

defineItem('ring_bone', {
  name: 'Bone Ring', type: 'ring',
  glyph: '◌', color: '#d8d0c0', glow: '#a8a090', scale: 0.45,
  material: 'bone', rarity: 1,
  bonuses: { maxHp: 3 },
  weight: 0.03,
  description: 'Carved from a knuckle bone. It carries a faint warmth.',
});

defineItem('ring_health', {
  name: 'Ring of Health', type: 'ring',
  glyph: '◌', color: '#ffb347', glow: '#ffb347', scale: 0.45,
  material: 'gold', rarity: 2,
  bonuses: { maxHp: 5 },
  weight: 0.06,
});

defineItem('ring_precision', {
  name: 'Ring of Precision', type: 'ring',
  glyph: '◌', color: '#b3e6ff', glow: '#b3e6ff', scale: 0.45,
  material: 'silver', rarity: 2,
  bonuses: { dexterity: 1, critChance: 0.08 },
  weight: 0.05,
});

defineItem('ring_arcana', {
  name: 'Ring of Arcana', type: 'ring',
  glyph: '◌', color: '#a480ff', glow: '#a480ff', scale: 0.45,
  material: 'silver', rarity: 3,
  bonuses: { manaRegen: 0.5, spellHit: 1 },
  weight: 0.05,
});

defineItem('ring_polymorph_control', {
  name: 'Ring of Polymorph Control', type: 'ring',
  glyph: '◌', color: '#d88cff', glow: '#9b56d8', scale: 0.45,
  material: 'silver', rarity: 4,
  bonuses: { polymorphControl: 1 },
  weight: 0.05,
  description: 'A shifting silver band that steadies the mind when flesh forgets its shape.',
});

defineItem('ring_fire_resist', {
  name: 'Ring of Fire Resistance', type: 'ring',
  glyph: '◌', color: '#ff9a5c', glow: '#ff6f2e', scale: 0.45,
  material: 'gold', rarity: 2,
  bonuses: { fireResist: 0.3 },
  weight: 0.06,
});

defineItem('ring_poison_resist', {
  name: 'Ring of Poison Resistance', type: 'ring',
  glyph: '◌', color: '#9bdc7a', glow: '#6ca84f', scale: 0.45,
  material: 'silver', rarity: 2,
  bonuses: { poisonResist: 0.3 },
  weight: 0.05,
});

defineItem('ring_cold_resist', {
  name: 'Ring of Cold Resistance', type: 'ring',
  glyph: '◌', color: '#7ec8e3', glow: '#4a9ec0', scale: 0.45,
  material: 'silver', rarity: 2,
  bonuses: { coldResist: 0.3 },
  weight: 0.05,
});

defineItem('ring_shock_resist', {
  name: 'Ring of Shock Resistance', type: 'ring',
  glyph: '◌', color: '#ffe066', glow: '#ccb033', scale: 0.45,
  material: 'copper', rarity: 2,
  bonuses: { electricOhms: 500 },
  weight: 0.06,
});

defineItem('ring_endurance', {
  name: 'Ring of Endurance', type: 'ring',
  glyph: '◌', color: '#f0cf7c', glow: '#c8a658', scale: 0.45,
  material: 'gold', rarity: 2,
  bonuses: { maxStamina: 15, staminaRegen: 0.5 },
  weight: 0.06,
});

defineItem('ring_sorcery', {
  name: 'Ring of Sorcery', type: 'ring',
  glyph: '◌', color: '#9f8dff', glow: '#7360cf', scale: 0.45,
  material: 'silver', rarity: 2,
  bonuses: { maxMana: 10 },
  weight: 0.06,
});

defineItem('ring_channeling', {
  name: 'Ring of Channeling', type: 'ring',
  glyph: '◌', color: '#7fd3ff', glow: '#4b9bc7', scale: 0.45,
  material: 'gold', rarity: 2,
  bonuses: { maxMana: 5, manaRegen: 0.08 },
  weight: 0.06,
});

defineItem('brawler_band', {
  name: "Brawler's Band", type: 'ring',
  glyph: '◌', color: '#d0a272', glow: '#9b7246', scale: 0.45,
  material: 'iron', rarity: 2,
  bonuses: {},
  description: 'A crude iron ring. Your blood runs hot when you wear it.',
  affixes: ['berserk1'],
  weight: 0.05,
});

defineItem('ring_of_fury', {
  name: 'Warband Ring', type: 'ring',
  glyph: '◌', color: '#ff7c6e', glow: '#cf4a3f', scale: 0.45,
  material: 'gold', rarity: 4,
  bonuses: { critChance: 0.05 },
  description: 'A rough gold band etched with battle runes. It pulses warmly in combat.',
  affixes: ['berserk1', 'manaSurge1'],
  weight: 0.06,
});

defineItem('serpent_ring', {
  name: 'Serpent Coil', type: 'ring',
  glyph: '◌', color: '#7cc46b', glow: '#4d8f41', scale: 0.45,
  material: 'silver', rarity: 4,
  bonuses: { manaRegen: 0.15 },
  description: 'A silver band shaped like a biting snake. Its eyes glint with cunning.',
  affixes: ['manaSurge1', 'frostbite1'],
  weight: 0.05,
});

defineItem('ring_ironwill', {
  name: 'Ring of Iron Will', type: 'ring',
  glyph: '◌', color: '#b0bcc8', glow: '#7a8694', scale: 0.45,
  material: 'gold', rarity: 5,
  bonuses: { maxHp: 15, defense: 2, bluntResist: 0.1, poisonResist: 0.1 },
  description: 'A band of hardened gold inlaid with runes of fortitude. The wearer shrugs off what would fell lesser mortals.',
  affixes: ['life1'],
  weight: 0.06,
});

defineItem('ring_fateweaver', {
  name: "Fateweaver's Band", type: 'ring',
  glyph: '◌', color: '#d4a8e0', glow: '#a070b8', scale: 0.45,
  material: 'gold', rarity: 5,
  bonuses: { critChance: 0.08, critMult: 0.15, attack: 1, luck: 3 },
  description: 'Fate bends around this ring like light around a star. Every strike finds its mark.',
  affixes: ['berserk1'],
  weight: 0.06,
});

defineItem('ring_fletcher_focus', {
  name: "Fletcher's Focus", type: 'ring',
  glyph: '◌', color: '#c6a86a', glow: '#8a6c36', scale: 0.45,
  material: 'gold', rarity: 3,
  bonuses: { accuracy: 1, critChance: 0.02 },
  ammoAffinities: {
    ammo_piercing_arrows: { damageMultiplier: 1.1 },
    ammo_bodkin_arrows: { damageMultiplier: 1.1 },
  },
  lootBiases: { PiercingArrowsStack: 1.3, BodkinArrowsStack: 1.3 },
  weight: 0.05,
  description: 'A tiny golden sight-ring that rewards armor-punching heads and makes them easier to find.',
});

defineItem('ring_voidchannel', {
  name: 'Voidchannel Ring', type: 'ring',
  glyph: '◌', color: '#6a5a8a', glow: '#3a2a5a', scale: 0.45,
  material: 'silver', rarity: 5,
  bonuses: { maxMana: 15, manaRegen: 0.4, spellHit: 2, critChance: 0.04 },
  description: 'The gem at its center is not a stone but a window into the void, from which raw mana pours.',
  affixes: ['manaSurge1'],
  weight: 0.05,
});

defineItem('ring_conflict', {
  name: 'Ring of Conflict', type: 'ring',
  glyph: '◌', color: '#dd5544', glow: '#aa2222', scale: 0.45,
  material: 'iron', rarity: 4,
  bonuses: {},
  tags: ['conflict'],
  description: 'A jagged band of blackened iron that hums with discord. Nearby creatures turn on each other in blind rage.',
  weight: 0.06,
});

defineItem('bloodward_signet', {
  name: 'Bloodward Signet', type: 'ring',
  glyph: '◌', color: '#c86060', glow: '#8a3030', scale: 0.45,
  material: 'gold', rarity: 4,
  bonuses: { attack: 1 },
  description: 'A heavy gold ring caked with old blood. It banks a fraction of every wound you deal and pays it back when you bleed.',
  procPackages: ['bloodTithe'],
  weight: 0.06,
});

// ── Cursed rings ──────────────────────────────────────────────────────

defineItem('ring_hunger', {
  name: 'Ring of Hunger', type: 'ring',
  glyph: '◌', color: '#7a6a5a', glow: '#4a3a2a', scale: 0.45,
  material: 'iron', rarity: 'magic', beatitude: 'cursed',
  bonuses: { hungerRate: 2 },
  weight: 0.06,
  description: 'A dull iron band that gnaws at your stomach. You feel ravenous.',
});

defineItem('ring_fumbling', {
  name: 'Ring of Fumbling', type: 'ring',
  glyph: '◌', color: '#8a7a6a', glow: '#5a4a3a', scale: 0.45,
  material: 'copper', rarity: 'magic', beatitude: 'cursed',
  bonuses: { attack: -3 },
  weight: 0.05,
  description: 'A tarnished copper ring. Your hands feel clumsy.',
});

defineItem('ring_weakness', {
  name: 'Ring of Weakness', type: 'ring',
  glyph: '◌', color: '#6a6a6a', glow: '#3a3a3a', scale: 0.45,
  material: 'lead', rarity: 'magic', beatitude: 'cursed',
  bonuses: { maxHp: -5 },
  weight: 0.09,
  description: 'A heavy leaden ring. It saps your vitality.',
});

defineItem('ring_blindness', {
  name: 'Ring of Blindness', type: 'ring',
  glyph: '◌', color: '#2a2a3a', glow: '#1a1a2a', scale: 0.45,
  material: 'obsidian', rarity: 'magic', beatitude: 'cursed',
  bonuses: { visionRange: -4 },
  weight: 0.07,
  description: 'A ring of polished obsidian. Shadows creep at the edge of your vision.',
});

defineItem('ring_teleportation', {
  name: 'Ring of Teleportation', type: 'ring',
  glyph: '◌', color: '#c0b0e0', glow: '#8080b0', scale: 0.45,
  material: 'silver', rarity: 'rare', beatitude: 'cursed',
  bonuses: { luck: -5, visionRange: -2 },
  weight: 0.05,
  description: 'A shimmering silver ring. Reality warps and shifts around you.',
});

defineItem('ring_fragility', {
  name: 'Ring of Fragility', type: 'ring',
  glyph: '◌', color: '#c0d8e8', glow: '#8090a8', scale: 0.45,
  material: 'glass', rarity: 'magic', beatitude: 'cursed',
  bonuses: { defense: -3, bluntResist: -0.15, slashResist: -0.15 },
  weight: 0.03,
  description: 'A brittle glass ring. Your skin feels paper-thin.',
});

defineItem('ring_mana_drain', {
  name: 'Ring of Mana Drain', type: 'ring',
  glyph: '◌', color: '#5a5a7a', glow: '#2a2a4a', scale: 0.45,
  material: 'lead', rarity: 'magic', beatitude: 'cursed',
  bonuses: { manaRegen: -1.0, maxMana: -10 },
  weight: 0.09,
  description: 'A dull leaden band that devours arcane energy. Your spells wither on your tongue.',
});
