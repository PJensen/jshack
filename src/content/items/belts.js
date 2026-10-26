// src/content/items/belts.js
// All slot:belt definitions migrated from itemCatalogEquipment.js.

import { defineItem } from '../define.js';

defineItem('belt_leather', {
  name: 'Leather Belt', type: 'belt',
  glyph: '=', color: '#b1824f', glow: '#7e5a33', scale: 0.6,
  material: 'leather', rarity: 1,
  bonuses: { defense: 1, maxStamina: 6 },
  weight: 0.3,
});

defineItem('belt_girded', {
  name: 'Girded Belt', type: 'belt',
  glyph: '=', color: '#c1945c', glow: '#8d653a', scale: 0.6,
  material: 'leather', rarity: 2,
  bonuses: { maxStamina: 12, staminaRegen: 0.4 },
  weight: 0.4,
});

defineItem('belt_chain', {
  name: 'Chain Belt', type: 'belt',
  glyph: '=', color: '#9ea8b3', glow: '#6e7782', scale: 0.6,
  material: 'iron', rarity: 3,
  bonuses: { defense: 2, maxHp: 8 },
  weight: 1.2,
  description: 'Interlocking iron rings cinched tight around the waist.',
});

defineItem('belt_ranger', {
  name: "Ranger's Belt", type: 'belt',
  glyph: '=', color: '#8ea66a', glow: '#5d7442', scale: 0.6,
  material: 'leather', rarity: 3,
  bonuses: { attack: 1, maxStamina: 10, staminaRegen: 0.3 },
  weight: 0.4,
  description: 'A worn utility belt with loops for blades and pouches for herbs.',
});

defineItem('belt_bombardier', {
  name: "Bombardier's Belt", type: 'belt',
  glyph: '=', color: '#b58b62', glow: '#795538', scale: 0.6,
  material: 'leather', rarity: 3,
  bonuses: { maxStamina: 6, fireResist: 0.05 },
  ammoAffinities: {
    ammo_bomb_arrows: { hazardRadiusBonus: 1 },
  },
  lootBiases: { BombArrowsStack: 1.4 },
  mechanicFormats: {
    ammoAffinities: {
      ammo_bomb_arrows: {
        hazardRadiusBonus: {
          context: 'Wearing',
          format: 'Bomb arrows gain +{value} hazard radius.',
        },
      },
    },
    lootBiases: {
      BombArrowsStack: {
        context: 'Loot',
        format: 'Bomb arrows appear at {value}× weighting.',
      },
    },
  },
  weight: 0.6,
  description: 'A belt of padded bomb-pouches. Its wearer always seems to find one more explosive arrow.',
});

defineItem('belt_ironhide', {
  name: 'Ironhide Girdle', type: 'belt',
  glyph: '=', color: '#8b98a6', glow: '#5a6775', scale: 0.6,
  material: 'iron', rarity: 4,
  bonuses: { defense: 3, bluntResist: 0.15, slashResist: 0.1 },
  weight: 2.0,
  description: 'Thick plates of hammered iron overlap like dragon scales.',
});

defineItem('belt_vitality', {
  name: 'Belt of Vitality', type: 'belt',
  glyph: '=', color: '#caa06a', glow: '#937246', scale: 0.6,
  material: 'leather', rarity: 4,
  bonuses: { maxHp: 20, maxStamina: 12, staminaRegen: 0.4 },
  weight: 0.5,
  description: 'Threaded with sinew of cave trolls, it lends their stubborn endurance.',
});

defineItem('belt_titan', {
  name: "Titan's Girdle", type: 'belt',
  glyph: '=', color: '#b6bcc4', glow: '#828992', scale: 0.6,
  material: 'steel', rarity: 5,
  bonuses: { defense: 3, maxHp: 20, maxStamina: 15, staminaRegen: 0.5, bluntResist: 0.1 },
  weight: 2.5,
  description: 'Forged from the belt buckle of a fallen giant. Its weight is immense, its strength greater.',
});

defineItem('belt_serpent', {
  name: "Serpent's Coil", type: 'belt',
  glyph: '=', color: '#7db467', glow: '#4f7b3f', scale: 0.6,
  material: 'leather', rarity: 5,
  bonuses: { attack: 2, poisonResist: 0.25, luck: 2 },
  weight: 0.3,
  description: 'A living snakeskin that slithers tighter in battle, sharpening the wearer\'s instincts.',
});

defineItem('jesters_cord', {
  name: "Jester's Cord", type: 'belt',
  glyph: '=', color: '#e0b040', glow: '#b08020', scale: 0.6,
  material: 'leather', rarity: 3,
  bonuses: { luck: 2 },
  description: 'A motley cord of bells and salvaged junk. Spectacular misses bewilder everyone in range — you included.',
  procPackages: ['foolsErrand'],
  weight: 0.3,
});

defineItem('hungering_girdle', {
  name: 'Hungering Girdle', type: 'belt',
  glyph: '=', color: '#b09060', glow: '#7a5a30', scale: 0.6,
  material: 'leather', rarity: 4,
  bonuses: { maxStamina: 12, staminaRegen: 0.4, attack: 1 },
  description: 'The buckle is carved in the shape of a devouring maw. Kills stack the hunger; each swing hits harder for it.',
  procPackages: ['eternalHunger'],
  weight: 0.5,
});

defineItem('girdle_of_the_ascendant', {
  name: 'Girdle of the Death Ascendant', type: 'belt',
  glyph: '=', color: '#b57e4e', glow: '#7e5634', scale: 0.6,
  material: 'leather', rarity: 5,
  bonuses: { maxStamina: 15, staminaRegen: 0.5, attack: 1 },
  weight: 1.0,
  description: 'Each kill detonates while wearing this belt: 2 turns of invulnerability, 4 turns of berserk fury, and 10 stamina restored. Death is the fuel. This girdle is the engine.',
  procPackages: ['killTempo'],
});

defineItem('echo_duelist_cord', {
  name: "Echo Duelist's Cord", type: 'belt',
  glyph: '=', color: '#74a8cc', glow: '#4a7192', scale: 0.6,
  material: 'leather', rarity: 4,
  bonuses: { attack: 1, maxStamina: 10, staminaRegen: 0.3 },
  weight: 1.0,
  description: 'A braided cord with a resonance crystal at the clasp. Each hit stores the impact. The next swing releases all that stored force as spectral damage alongside the blow. Memory made weapon.',
  procPackages: ['missMomentum'],
});
