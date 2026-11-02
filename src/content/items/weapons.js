// src/content/items/weapons.js
// All melee weapon (slot: weapon) definitions migrated from itemCatalogEquipment.js.
// Palette data folded in from display/palette/packs/weapons.js.

import { defineItem } from '../define.js';

// ── Basic weapons ─────────────────────────────────────────────────────────────

defineItem('staff_oak', {
  name: 'Oak Staff',
  type: 'weapon',
  glyph: '/', color: '#b88a5a', glow: '#835f3d', scale: 0.9,
  twoHanded: true,
  material: 'wood',
  rarity: 1,
  bonuses: { accuracy: 1, damagePower: 1, bluntPenetration: 1, manaRegen: 0.05 },
  damageDice: '1d6',
  damageType: 'blunt',
  staminaCost: 7,
  maxSockets: 1,
  description: 'A sturdy staff of ancient oak. Channels natural energies.',
  weight: 2.5,
});

defineItem('longsword', {
  name: 'Longsword',
  type: 'weapon',
  glyph: '/', color: '#c8cce0', glow: '#9098b8', scale: 0.8,
  twoHanded: true,
  material: 'steel',
  rarity: 1,
  bonuses: { accuracy: 2, damagePower: 3, slashPenetration: 2 },
  maxSockets: 2,
  damageDice: '1d8',
  damageType: 'slash',
  staminaCost: 12,
  description: 'A long steel blade wielded with both hands.',
  weight: 2.8,
});

defineItem('sword_plain', {
  name: 'Short Sword',
  type: 'weapon',
  glyph: ')', color: '#e8e2b0', glow: '#e8e2b0', scale: 0.8,
  material: 'steel',
  rarity: 1,
  bonuses: { accuracy: 2, damagePower: 2, slashPenetration: 1 },
  damageDice: '1d6',
  damageType: 'slash',
  staminaCost: 8,
  maxSockets: 1,
  description: 'A trusty short blade. Quick to draw and easy to wield.',
  weight: 1.2,
});

defineItem('dagger_quick', {
  name: 'Dagger',
  type: 'weapon',
  glyph: ')', color: '#f7d794', glow: '#f7d794', scale: 0.65,
  material: 'steel',
  rarity: 1,
  bonuses: { accuracy: 2, damagePower: 0, piercePenetration: 2, critChance: 0.02 },
  damageDice: '1d4',
  damageType: 'pierce',
  staminaCost: 5,
  maxSockets: 1,
  description: 'A slim steel blade, light enough to strike in a blink.',
  weight: 0.5,
});

defineItem('axe_heavy', {
  name: 'Axe',
  type: 'weapon',
  glyph: ')', color: '#e0c070', glow: '#e0c070', scale: 0.8,
  material: 'steel',
  rarity: 2,
  bonuses: { accuracy: 2, damagePower: 3, slashPenetration: 2, chop: 1 },
  damageDice: '1d8',
  damageType: 'slash',
  staminaCost: 12,
  maxSockets: 1,
  description: 'A broad-headed axe that cleaves through armor and timber alike.',
  weight: 3.0,
});

defineItem('iron_mace', {
  name: 'Iron Mace',
  type: 'weapon',
  glyph: ')', color: '#9090a0', glow: '#707080', scale: 0.8,
  material: 'iron',
  rarity: 1,
  bonuses: { accuracy: 1, damagePower: 2, bluntPenetration: 3 },
  damageDice: '1d8',
  damageType: 'blunt',
  staminaCost: 11,
  maxSockets: 1,
  description: 'A heavy iron head on a wooden haft. Favored by the faithful.',
  weight: 3.2,
  affixes: ['stunning1'],
});

defineItem('morningstar', {
  name: 'Morningstar',
  type: 'weapon',
  glyph: ')', color: '#c5bebe', glow: '#aaaaaa', scale: 0.8,
  layers: [
    { glyph: ')', fg: '#4e2c2c', glow: '#aaaaaa', dx: 0.04, dy: 0.2 },
    { glyph: '*', fg: '#c5bebe', glow: '#aaaaaa', dx: -0.04, dy: -0.02 },
  ],
  material: 'iron',
  rarity: 1,
  bonuses: { accuracy: 1, damagePower: 2, bluntPenetration: 2, piercePenetration: 1, critChance: 0.01 },
  damageDice: '1d8',
  damageType: 'blunt',
  staminaCost: 10,
  maxSockets: 1,
  description: 'A spiked iron mace built to crush through guards and punch through mail.',
  weight: 3.0,
});

defineItem('iron_pickaxe', {
  name: 'Iron Pickaxe',
  type: 'weapon',
  glyph: '⛏', color: '#a0a0a0', glow: '#c0c0c0', scale: 0.9,
  weaponFamily: 'axe_large',
  material: 'iron',
  rarity: 1,
  bonuses: { accuracy: 0, damagePower: 2, piercePenetration: 4, dig: 1 },
  damageDice: '1d12',
  damageType: 'pierce',
  combatFlavor: 'brutal',
  staminaCost: 20,
  weight: 4.0,
});

defineItem('warhammer', {
  name: 'Warhammer',
  type: 'weapon',
  glyph: 'T', color: '#a8a0b8', glow: '#706880', scale: 0.9,
  material: 'iron',
  rarity: 2,
  bonuses: { attack: 2, critMult: 0.5 },
  damageDice: '1d8',
  damageType: 'blunt',
  staminaCost: 10,
  weight: 3.4,
  affixes: ['stunning1'],
});

defineItem('flail', {
  name: 'Flail',
  type: 'weapon',
  glyph: ')', color: '#a59aa8', glow: '#746b80', scale: 0.8,
  weaponFamily: 'flail',
  subtype: 'flail',
  material: 'iron',
  rarity: 2,
  bonuses: { attack: 1, damagePower: 3, bluntPenetration: 2, critChance: 0.03, critMult: 0.25 },
  damageDice: '1d8',
  damageType: 'blunt',
  staminaCost: 9,
  weight: 3.2,
  maxSockets: 1,
  description: 'A chained iron head that swings unpredictably and lands with brutal force.',
  affixes: ['stunning1'],
});

defineItem('great_axe', {
  name: 'Great Axe',
  type: 'weapon',
  glyph: ')', color: '#d09a58', glow: '#8d5d2f', scale: 0.9,
  weaponFamily: 'axe_large',
  material: 'steel',
  rarity: 2,
  twoHanded: true,
  bonuses: { accuracy: 1, damagePower: 4, slashPenetration: 2 },
  damageDice: '1d10',
  damageType: 'slash',
  staminaCost: 14,
  maxSockets: 1,
  description: 'A broad steel axe that rewards a full-bodied swing.',
  weight: 4.5,
});

defineItem('glaive', {
  name: 'Glaive',
  type: 'weapon',
  glyph: '/', color: '#b8c8d8', glow: '#71869a', scale: 0.9,
  weaponFamily: 'spear',
  material: 'steel',
  rarity: 2,
  twoHanded: true,
  bonuses: { accuracy: 2, damagePower: 2, piercePenetration: 2 },
  damageDice: '1d10',
  damageType: 'pierce',
  staminaCost: 13,
  maxSockets: 1,
  description: 'A long-shafted blade that keeps danger at the edge of reach.',
  weight: 3.5,
});

defineItem('emberstaff', {
  name: 'Emberstaff',
  type: 'weapon',
  glyph: '/', color: '#e38b56', glow: '#b84c2d', scale: 0.9,
  weaponFamily: 'wooden_staff',
  material: 'wood',
  rarity: 2,
  twoHanded: true,
  bonuses: { attack: 1, maxMana: 5, manaRegen: 0.2, fireResist: 0.1 },
  damageDice: '1d6',
  damageType: 'blunt',
  staminaCost: 8,
  maxSockets: 1,
  description: 'A charred staff with a living ember in its crown. It warms the hand and the spellbook alike.',
  weight: 2.0,
});

defineItem('moonroot_staff', {
  name: 'Moonroot Staff',
  type: 'weapon',
  glyph: '/', color: '#a9b9e8', glow: '#697ebd', scale: 0.9,
  weaponFamily: 'wooden_staff',
  material: 'wood',
  rarity: 3,
  twoHanded: true,
  bonuses: { attack: 1, maxMana: 10, manaRegen: 0.3, spellHit: 1, visionRange: 1 },
  damageDice: '1d8',
  damageType: 'blunt',
  staminaCost: 9,
  maxSockets: 2,
  description: 'Pale roots curl around a moonstone core, drinking in the night and returning it as quiet power.',
  weight: 2.2,
});

// ── Monster-drop weapons ──────────────────────────────────────────────────────

defineItem('goblin_shiv', {
  name: 'Goblin Shiv',
  type: 'weapon',
  glyph: ')', color: '#7a8a50', glow: '#4e5a30', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'iron',
  rarity: 1,
  bonuses: { accuracy: 1, damagePower: 0, piercePenetration: 1, critChance: 0.01 },
  damageDice: '1d4',
  damageType: 'pierce',
  staminaCost: 5,
  value: 1,
  description: 'A chipped goblin knife. Cheap, mean, and disposable.',
  weight: 0.4,
});

defineItem('goblin_jagged_shiv', {
  name: 'Goblin Jagged Shiv',
  type: 'weapon',
  glyph: ')', color: '#8a9a55', glow: '#5a6a35', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'iron',
  rarity: 1,
  bonuses: { accuracy: 1, damagePower: 0, piercePenetration: 1, critChance: 0.01 },
  damageDice: '1d4',
  damageType: 'pierce',
  staminaCost: 5,
  value: 2,
  description: 'A serrated shiv with burrs that tear flesh on the way out.',
  weight: 0.5,
  affixes: ['hemorrhage1'],
});

defineItem('hobgoblin_warblade', {
  name: 'Hobgoblin Warblade',
  type: 'weapon',
  glyph: '/', color: '#9a6a50', glow: '#6a3a28', scale: 0.8,
  weaponFamily: 'sword_large',
  material: 'steel',
  rarity: 2,
  bonuses: { accuracy: 2, damagePower: 2, slashPenetration: 1 },
  damageDice: '1d8',
  damageType: 'slash',
  staminaCost: 9,
  value: 8,
  description: 'A disciplined infantry blade balanced for drill-yard brutality.',
  weight: 2.5,
});

defineItem('hobgoblin_serrated_warblade', {
  name: 'Hobgoblin Serrated Warblade',
  type: 'weapon',
  glyph: '/', color: '#aa7050', glow: '#7a4028', scale: 0.8,
  weaponFamily: 'sword_large',
  material: 'steel',
  rarity: 2,
  bonuses: { accuracy: 2, damagePower: 2, slashPenetration: 1 },
  damageDice: '1d8',
  damageType: 'slash',
  staminaCost: 9,
  value: 9,
  description: 'Saw-backed iron made to leave ugly, lasting wounds.',
  weight: 2.6,
  affixes: ['hemorrhage1'],
});

defineItem('ogre_crushing_club', {
  name: 'Ogre Crushing Club',
  type: 'weapon',
  glyph: 'T', color: '#8a7a5a', glow: '#5a4a2a', scale: 0.9,
  weaponFamily: 'mace',
  material: 'wood',
  rarity: 2,
  bonuses: { accuracy: 0, damagePower: 3, bluntPenetration: 2 },
  damageDice: '2d8',
  damageType: 'blunt',
  staminaCost: 13,
  value: 6,
  description: 'A tree limb with iron bands and dried blood at the knots.',
  weight: 4.5,
  affixes: ['stunning1'],
});

defineItem('orc_warchief_maul', {
  name: 'Orc Warchief Maul',
  type: 'weapon',
  glyph: 'T', color: '#7a5a3a', glow: '#4a2a1a', scale: 0.9,
  weaponFamily: 'hammer_large',
  material: 'iron',
  rarity: 3,
  bonuses: { accuracy: 1, damagePower: 3, bluntPenetration: 3 },
  damageDice: '2d6',
  damageType: 'blunt',
  staminaCost: 12,
  maxSockets: 1,
  value: 14,
  description: "A commander's maul that ends arguments in one swing.",
  weight: 5.0,
  affixes: ['stunning1'],
});

// ── Specialty/magic weapons ───────────────────────────────────────────────────

defineItem('venomfang_dagger', {
  name: 'Venomfang Dagger',
  type: 'weapon',
  glyph: ')', color: '#98e070', glow: '#63c44c', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'steel',
  rarity: 2,
  bonuses: { attack: 1, critChance: 0.05 },
  damageDice: '1d4',
  staminaCost: 5,
  weight: 0.5,
  description: 'A razor-sharp blade with a hollow groove along its length that drips with acid.',
});

defineItem('nightfang_dagger', {
  name: 'Nightfang',
  type: 'weapon',
  glyph: ')', color: '#8df0a8', glow: '#52d57a', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'steel',
  rarity: 3,
  bonuses: { attack: 2, critChance: 0.08 },
  damageDice: '1d6',
  staminaCost: 5,
  weight: 0.6,
  description: 'A blackened blade that weeps venom from its edge.',
  affixes: ['venomous1'],
});

defineItem('voidmind_athame', {
  name: 'Voidmind Athame',
  type: 'weapon',
  glyph: ')', color: '#6a5a9a', glow: '#3a2a6a', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'steel',
  rarity: 4,
  bonuses: { attack: 1, maxMana: 20, manaRegen: 0.5, spellHit: 3, critChance: 0.06 },
  damageDice: '1d4',
  staminaCost: 5,
  weight: 0.5,
  description: 'A ritual blade etched with spiralling glyphs that drink in ambient mana. Casters prize it above any sword.',
});

defineItem('caustic_stiletto', {
  name: 'Caustic Stiletto',
  type: 'weapon',
  glyph: '/', color: '#a0cc40', glow: '#70a020', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'steel',
  rarity: 3,
  bonuses: { attack: 1, acidResist: 0.1 },
  damageDice: '1d4',
  staminaCost: 4,
  affixes: ['caustic1'],
  weight: 0.666,
});

defineItem('stormtouched_mace', {
  name: 'Stormtouched Mace',
  type: 'weapon',
  glyph: ')', color: '#8090e0', glow: '#4060cc', scale: 0.8,
  material: 'iron',
  rarity: 3,
  bonuses: { attack: 2 },
  damageDice: '1d6',
  damageType: 'blunt',
  staminaCost: 8,
  affixes: ['capacitive1', 'stunning1'],
  weight: 2.5,
});

defineItem('warhammer_of_fury', {
  name: 'Warhammer of Fury',
  type: 'weapon',
  glyph: 'T', color: '#c09a7a', glow: '#8d6b4f', scale: 0.9,
  material: 'iron',
  rarity: 3,
  bonuses: { attack: 1 },
  damageDice: '1d8',
  damageType: 'blunt',
  staminaCost: 7,
  affixes: ['fierce', 'stunning1'],
  weight: 5.0,
});

// ── Proc-tier weapons (tier 0-1) ──────────────────────────────────────────────

defineItem('sparking_knife', {
  name: 'Sparking Knife',
  type: 'weapon',
  glyph: ')', color: '#9cc7ff', glow: '#6da2f5', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'steel',
  rarity: 2,
  bonuses: { attack: 1 },
  damageDice: '1d4',
  staminaCost: 5,
  description: 'A tarnished blade that crackles faintly when swung.',
  affixes: ['chainLightning1'],
  weight: 0.5,
});

defineItem('smoldering_club', {
  name: 'Smoldering Club',
  type: 'weapon',
  glyph: ')', color: '#cf8b4e', glow: '#a65f2d', scale: 0.8,
  weaponFamily: 'mace',
  material: 'wood',
  rarity: 2,
  bonuses: { attack: 1 },
  damageDice: '1d6',
  damageType: 'blunt',
  staminaCost: 9,
  description: 'The charred head still glows with fading embers.',
  affixes: ['firestorm1'],
  weight: 2.5,
});

defineItem('chipped_fang', {
  name: 'Chipped Fang',
  type: 'weapon',
  glyph: ')', color: '#d2bf95', glow: '#9b865f', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'bone',
  rarity: 2,
  bonuses: { attack: 1, critChance: 0.03 },
  damageDice: '1d4',
  staminaCost: 5,
  description: 'A sharpened tooth pried from something large. It draws blood easily.',
  affixes: ['hemorrhage1'],
  weight: 0.3,
});

defineItem('leech_blade', {
  name: 'Leech Blade',
  type: 'weapon',
  glyph: '/', color: '#b95a6e', glow: '#8f3a50', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'iron',
  rarity: 2,
  bonuses: { attack: 1 },
  damageDice: '1d6',
  staminaCost: 8,
  description: 'Dark stains run the length of the fuller. The grip feels oddly warm.',
  affixes: ['soulDrain1'],
  weight: 1.2,
});

// ── Flaming weapon line ───────────────────────────────────────────────────────

defineItem('ember_knife', {
  name: 'Ember Knife',
  type: 'weapon',
  glyph: ')', color: '#ff8830', glow: '#ff5500', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'iron',
  rarity: 2,
  bonuses: { attack: 1 },
  damageDice: '1d4',
  staminaCost: 5,
  description: 'The blade radiates a faint heat. Even unsheathed it casts a dim orange glow.',
  affixes: ['flaming'],
  weight: 0.5,
});

defineItem('flametongue', {
  name: 'Flametongue',
  type: 'weapon',
  glyph: '/', color: '#ff6020', glow: '#ff3300', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'steel',
  rarity: 3,
  bonuses: { attack: 2 },
  damageDice: '1d6',
  staminaCost: 8,
  description: 'Tongues of fire lick along the edge on every swing. They never go out.',
  affixes: ['flaming'],
  weight: 1.3,
});

defineItem('ashen_reaver', {
  name: 'Ashen Reaver',
  type: 'weapon',
  glyph: '/', color: '#cc3000', glow: '#ff4400', scale: 0.8,
  weaponFamily: 'axe_small',
  material: 'steel',
  rarity: 4,
  bonuses: { attack: 3, critChance: 0.04 },
  damageDice: '1d8',
  staminaCost: 11,
  description: 'Forged in a volcanic rift. The blade smoulders with a deep red glow that nothing can extinguish.',
  affixes: ['flaming'],
  weight: 2.5,
});

// ── Epic proc tier ────────────────────────────────────────────────────────────

defineItem('pyreheart_mace', {
  name: 'Pyreheart Mace',
  type: 'weapon',
  glyph: ')', color: '#e77a41', glow: '#bb4c1d', scale: 0.8,
  weaponFamily: 'mace',
  material: 'iron',
  rarity: 4,
  bonuses: { attack: 2 },
  damageDice: '1d8',
  damageType: 'blunt',
  staminaCost: 10,
  description: 'The head glows cherry-red, leaving scorch marks on everything it strikes.',
  affixes: ['firestorm1', 'stunning1'],
  weight: 3.5,
});

defineItem('glacial_edge', {
  name: 'Glacial Edge',
  type: 'weapon',
  glyph: '/', color: '#8cc9ff', glow: '#4f8fc4', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'steel',
  rarity: 4,
  bonuses: { attack: 2, critChance: 0.05 },
  damageDice: '1d6',
  staminaCost: 8,
  description: 'A blade of pale blue steel that numbs flesh and opens veins.',
  affixes: ['frostbite1', 'hemorrhage1'],
  weight: 1.2,
});

defineItem('witchfire_sword', {
  name: 'Witchfire Sword',
  type: 'weapon',
  glyph: '/', color: '#d672ff', glow: '#9a42c7', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'steel',
  rarity: 4,
  bonuses: { attack: 2, critChance: 0.03 },
  damageDice: '1d8',
  staminaCost: 9,
  description: 'Green flame licks along the edge, draining warmth from the air.',
  affixes: ['firestorm1', 'soulDrain1'],
  weight: 2.0,
});

defineItem('howling_maul', {
  name: 'Howling Maul',
  type: 'weapon',
  glyph: 'T', color: '#9aa4b8', glow: '#6a7487', scale: 0.9,
  weaponFamily: 'hammer_large',
  material: 'iron',
  rarity: 4,
  twoHanded: true,
  bonuses: { attack: 3 },
  damageDice: '1d10',
  damageType: 'blunt',
  staminaCost: 12,
  description: 'The wind screams through holes bored in the hammerhead.',
  affixes: ['hemorrhage1', 'berserk1', 'stunning1'],
  weight: 5.5,
});

// ── Legendary tier ────────────────────────────────────────────────────────────

defineItem('stormcaller_blade', {
  name: 'Stormcaller',
  type: 'weapon',
  glyph: '/', color: '#7fb4ff', glow: '#4f79d1', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'steel',
  rarity: 5,
  bonuses: { attack: 3, critChance: 0.05 },
  damageDice: '1d8',
  staminaCost: 9,
  description: 'Arcs of lightning dance along the blade. Thunder rumbles with each swing.',
  affixes: ['chainLightning1', 'capacitive1'],
  weight: 1.8,
});

defineItem('soulreaver_axe', {
  name: 'Soulreaver',
  type: 'weapon',
  glyph: ')', color: '#d45f8e', glow: '#9d3e68', scale: 0.8,
  weaponFamily: 'axe_large',
  material: 'iron',
  rarity: 5,
  twoHanded: true,
  bonuses: { attack: 4 },
  damageDice: '2d6',
  staminaCost: 14,
  description: 'A blackened axe that drinks deeply from the wounded.',
  affixes: ['soulDrain1', 'executioner1'],
  weight: 4.5,
});

// ── Proc-package weapons (epic / legendary) ───────────────────────────────────

defineItem('blade_of_echoes', {
  name: 'Blade of Echoes',
  type: 'weapon',
  glyph: '/', color: '#7ab0d8', glow: '#4a7aa0', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'steel',
  rarity: 4,
  bonuses: { attack: 2, critChance: 0.03 },
  damageDice: '1d6',
  staminaCost: 8,
  description: 'Each strike reverberates. The blade remembers the last wound it dealt and echoes it back on the next swing.',
  procPackages: ['echoStrike'],
  weight: 1.3,
});

defineItem('tolling_blade', {
  name: 'Tolling Blade',
  type: 'weapon',
  glyph: '/', color: '#8a7ab6', glow: '#5a4a85', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'iron',
  rarity: 4,
  bonuses: { attack: 2 },
  damageDice: '1d8',
  staminaCost: 10,
  description: 'Three ticks. Then judgment. It counts each wound in shadow, and on the third toll, the reckoning arrives.',
  procPackages: ['doomClock'],
  weight: 2.0,
});

defineItem('debtbringer', {
  name: 'Debtbringer',
  type: 'weapon',
  glyph: '/', color: '#c9a06b', glow: '#8f6a3f', scale: 0.8,
  weaponFamily: 'mace',
  material: 'iron',
  rarity: 4,
  bonuses: { attack: 1 },
  damageDice: '1d6',
  staminaCost: 9,
  description: 'Obscene power up front, a debt accrued in silence. The reckoning comes later — and it comes for everything.',
  procPackages: ['soulMortgage'],
  weight: 1.5,
});

defineItem('cataclysm_axe', {
  name: 'Cataclysm Axe',
  type: 'weapon',
  glyph: ')', color: '#c0a870', glow: '#8a7040', scale: 0.9,
  weaponFamily: 'axe_large',
  material: 'iron',
  rarity: 5,
  twoHanded: true,
  bonuses: { attack: 4, critChance: 0.06 },
  damageDice: '2d6',
  staminaCost: 14,
  description: 'Crit kills split outward: a hazard spawns, a wave breaks, marks spread. The massacre cascades.',
  procPackages: ['cataclysmChain'],
  weight: 5.0,
});

defineItem('jesters_stiletto', {
  name: "Jester's Stiletto",
  type: 'weapon',
  glyph: ')', color: '#e0b040', glow: '#b08020', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'steel',
  rarity: 3,
  bonuses: { attack: 1 },
  damageDice: '1d4',
  staminaCost: 6,
  description: 'A slender blade for ridiculous situations. Spectacular misses bewilder everyone present — you included.',
  procPackages: ['foolsErrand'],
  weight: 0.4,
});

defineItem('plague_fang', {
  name: 'Plague Fang',
  type: 'weapon',
  glyph: ')', color: '#6abf50', glow: '#408a2a', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'iron',
  rarity: 4,
  bonuses: { attack: 2 },
  damageDice: '1d6',
  staminaCost: 8,
  description: 'A hollow assassin\'s blade packed with virulent compounds. Three hits and the clock detonates in shadow, poison, and disease.',
  procPackages: ['venomClock'],
  weight: 0.6,
});

defineItem('hollow_greatsword', {
  name: 'Hollow Tide Greatsword',
  type: 'weapon',
  glyph: '/', color: '#9a8a70', glow: '#6a5a40', scale: 0.9,
  material: 'iron',
  rarity: 4,
  twoHanded: true,
  bonuses: { attack: 3 },
  damageDice: '1d10',
  staminaCost: 12,
  description: 'Etched with tidal runes that grow brighter as the wielder bleeds. The closer to death, the more ruinous each swing.',
  procPackages: ['hollowTide'],
  weight: 4.0,
});

defineItem('deathascendant_blade', {
  name: 'Blade of the Death Ascendant',
  type: 'weapon',
  glyph: '/', color: '#c86a8a', glow: '#8a3a5a', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'steel',
  rarity: 5,
  bonuses: { attack: 3, critChance: 0.05 },
  damageDice: '1d8',
  staminaCost: 11,
  description: 'Each kill detonates in invulnerability, berserk fury, and restored stamina. Death itself is the fuel.',
  procPackages: ['deathAscendant'],
  weight: 1.8,
});

defineItem('thundergod_maul', {
  name: "Thunder God's Maul",
  type: 'weapon',
  glyph: 'T', color: '#7aaae8', glow: '#4a78b8', scale: 0.9,
  material: 'iron',
  rarity: 5,
  twoHanded: true,
  bonuses: { attack: 4, critChance: 0.05 },
  damageDice: '2d6',
  damageType: 'blunt',
  staminaCost: 14,
  description: 'Crits arc 3 electric damage and shock through every hostile nearby. A single critical blow speaks for the heavens.',
  procPackages: ['thunderGod'],
  weight: 6.0,
});

defineItem('blood_covenant_sword', {
  name: 'Blood Covenant',
  type: 'weapon',
  glyph: '/', color: '#cc5a5a', glow: '#8a2a2a', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'steel',
  rarity: 5,
  bonuses: { attack: 3 },
  damageDice: '1d8',
  staminaCost: 10,
  description: 'Each swing costs 8% of your maximum HP in exchange for a burst of fire. The blade drinks first. Always.',
  procPackages: ['bloodCovenant'],
  weight: 2.0,
});

defineItem('hunters_edge', {
  name: "Hunter's Edge",
  type: 'weapon',
  glyph: '/', color: '#8ab86a', glow: '#5a8a3a', scale: 0.8,
  weaponFamily: 'sword_small',
  material: 'steel',
  rarity: 4,
  bonuses: { attack: 2, critChance: 0.04 },
  damageDice: '1d6',
  staminaCost: 8,
  description: 'Each consecutive hit stacks a predator\'s mark. Five stacks and your prey is simply prey.',
  procPackages: ['predatorMark'],
  weight: 1.2,
});

defineItem('soul_ascendant_scythe', {
  name: 'Soul Ascendant Scythe',
  type: 'weapon',
  glyph: '/', color: '#d8a0e0', glow: '#a070b0', scale: 0.9,
  weaponFamily: 'spear',
  material: 'iron',
  rarity: 5,
  twoHanded: true,
  bonuses: { attack: 3 },
  damageDice: '1d10',
  staminaCost: 13,
  description: 'Kills heal 8 HP and leave the wielder wrapped in regen and stoneskin. Each soul consumed leaves you fuller and harder.',
  procPackages: ['soulAscendant'],
  weight: 4.0,
});

defineItem('hungering_cleaver', {
  name: 'Hungering Cleaver',
  type: 'weapon',
  glyph: ')', color: '#b09060', glow: '#7a5a30', scale: 0.8,
  weaponFamily: 'axe_small',
  material: 'iron',
  rarity: 4,
  bonuses: { attack: 2 },
  damageDice: '1d8',
  staminaCost: 10,
  description: 'Each kill stacks the hunger. It never fully fades, and each swing hits harder for it. The hunger can never be sated.',
  procPackages: ['eternalHunger'],
  weight: 2.2,
});

defineItem('eclipse_maul', {
  name: 'Eclipse Maul',
  type: 'weapon',
  glyph: 'T', color: '#d0b070', glow: '#9a7a40', scale: 0.9,
  weaponFamily: 'hammer_large',
  material: 'iron',
  rarity: 5,
  twoHanded: true,
  bonuses: { attack: 3 },
  damageDice: '1d10',
  damageType: 'blunt',
  staminaCost: 13,
  description: 'Alternates between sun and moon on every hit, scattering fire and frost through adjacent enemies. Light and dark answer in turn.',
  procPackages: ['eclipseHammer'],
  weight: 5.5,
});

defineItem('resonant_quarterstaff', {
  name: 'Resonant Quarterstaff',
  type: 'weapon',
  glyph: '/', color: '#6eb7de', glow: '#3e7f9f', scale: 0.9,
  weaponFamily: 'wooden_staff',
  material: 'wood',
  rarity: 4,
  bonuses: { attack: 1, maxMana: 10, manaRegen: 0.4 },
  damageDice: '1d6',
  twoHanded: true,
  staminaCost: 8,
  weight: 1.0,
  description: 'A staff topped with a resonance crystal that pulses once per hit, storing the blow\'s force. The next swing releases that stored impact as spectral damage alongside the strike.',
  procPackages: ['kineticBattery'],
});

defineItem('venom_kris', {
  name: 'Venom Kris',
  type: 'weapon',
  glyph: ')', color: '#8adf6c', glow: '#56a640', scale: 0.65,
  weaponFamily: 'dagger',
  material: 'steel',
  rarity: 3,
  bonuses: { attack: 1 },
  damageDice: '1d4',
  damageType: 'pierce',
  staminaCost: 5,
  weight: 0.77,
  description: 'A wavy-bladed dagger designed for rapid repeated stabs. Three consecutive hits on the same target trigger detonation: shadow burst, virulent poison for 4 turns, disease for 3.',
  procPackages: ['venomLedger'],
});

defineItem('never_sated_warclub', {
  name: 'Never-Sated Warclub',
  type: 'weapon',
  glyph: 'T', color: '#b08f62', glow: '#7a5f3f', scale: 0.9,
  weaponFamily: 'mace',
  material: 'iron',
  rarity: 4,
  twoHanded: true,
  bonuses: { attack: 2 },
  damageDice: '1d10',
  damageType: 'blunt',
  staminaCost: 12,
  weight: 3.75,
  description: 'A crude bludgeon that grows more dangerous with every kill. Each kill stacks the hunger (max 10, fading over 12 turns). While hungry, each hit deals floor(stacks÷2) extra flat damage.',
  procPackages: ['hungerSurge'],
});

defineItem('blood_covenant_rapier', {
  name: 'Rapier of the Blood Covenant',
  type: 'weapon',
  glyph: '/', color: '#d06c6c', glow: '#9a3f3f', scale: 0.8,
  weaponFamily: 'spear',
  material: 'steel',
  rarity: 5,
  bonuses: { attack: 2, critChance: 0.05 },
  damageDice: '1d6',
  damageType: 'pierce',
  staminaCost: 8,
  weight: 3.0,
  description: 'A slender blade in a blackened guard. Each thrust costs 8% of your max HP (never fatal) and adds +5 fire damage to that swing. It demands blood before every blow. The rapier decides the price.',
  procPackages: ['ritualOverdraw'],
});

defineItem('cataclysm_warspear', {
  name: 'Cataclysm Warspear',
  type: 'weapon',
  glyph: '/', color: '#c9b27e', glow: '#8e774c', scale: 0.9,
  weaponFamily: 'spear',
  material: 'steel',
  rarity: 5,
  twoHanded: true,
  bonuses: { attack: 3, critChance: 0.06 },
  damageDice: '1d10',
  damageType: 'pierce',
  staminaCost: 12,
  weight: 1.0,
  description: 'Critical kills don\'t end the fight — they extend it. A hazard erupts on the corpse, a shockwave marks all adjacent hostiles, and marked foes detonate on the next hit.',
  procPackages: ['executionRipple'],
});
