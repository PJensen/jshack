// src/content/items/helms.js
// All slot:head definitions migrated from itemCatalogEquipment.js.

import { defineItem } from '../define.js';

defineItem('helm_iron', {
  name: 'Iron Helm', type: 'head',
  glyph: '^', color: '#a8b8c8', glow: '#8090a0', scale: 0.7,
  material: 'iron', rarity: 1,
  bonuses: { defense: 1, maxHp: 2 },
  weight: 2.0,
});

defineItem('scout_hood', {
  name: 'Scout Hood', type: 'head',
  glyph: '^', color: '#8fa26e', glow: '#5f7246', scale: 0.7,
  material: 'leather', rarity: 1,
  bonuses: { defense: 1, critChance: 0.02, maxStamina: 4 },
  weight: 0.7,
  description: 'A light hood with a reinforced brow seam for skirmishers.',
});

defineItem('helm_steel', {
  name: 'Steel Helm', type: 'head',
  glyph: '^', color: '#b8c4cf', glow: '#8d9aa6', scale: 0.7,
  material: 'steel', rarity: 2,
  bonuses: { defense: 2, bluntResist: 0.05 },
  weight: 2.2,
  description: 'A sturdy helm with a nose guard and padded lining.',
});

defineItem('helm_horned', {
  name: 'Horned Helm', type: 'head',
  glyph: '^', color: '#b0916e', glow: '#7e6549', scale: 0.7,
  material: 'iron', rarity: 3,
  bonuses: { defense: 2, attack: 1, bluntResist: 0.1 },
  weight: 2.5,
  description: 'Curved iron horns crown this battle-scarred helm.',
});

defineItem('helm_mage', {
  name: 'Circlet of Insight', type: 'head',
  glyph: '^', color: '#c6b6ff', glow: '#8f7bd1', scale: 0.7,
  material: 'silver', rarity: 3,
  bonuses: { maxMana: 12, manaRegen: 0.3 },
  weight: 0.3,
  description: 'A thin silver band that clears the fog of thought.',
  affixes: ['helmAttuned1'],
});

defineItem('helm_warhelm', {
  name: 'Great Warhelm', type: 'head',
  glyph: '^', color: '#9fa8b3', glow: '#6f7884', scale: 0.7,
  material: 'steel', rarity: 4,
  bonuses: { defense: 3, maxHp: 10, bluntResist: 0.15, slashResist: 0.1 },
  weight: 3.0,
  description: 'A full-faced helm forged for the front lines. Vision is limited, but so is incoming steel.',
  affixes: ['helmGuard1'],
});

defineItem('helm_visionary', {
  name: 'Visionary Crown', type: 'head',
  glyph: '^', color: '#e1c56e', glow: '#ad9140', scale: 0.7,
  material: 'gold', rarity: 4,
  bonuses: { maxMana: 18, manaRegen: 0.5, critChance: 0.04 },
  weight: 0.4,
  description: 'Amethyst shards orbit the crown, whispering arcane secrets.',
  affixes: ['helmAttuned1'],
});

defineItem('helm_dreadnought', {
  name: 'Dreadnought Helm', type: 'head',
  glyph: '^', color: '#9099a5', glow: '#5f6875', scale: 0.7,
  material: 'steel', rarity: 5,
  bonuses: { defense: 4, maxHp: 15, bluntResist: 0.2, slashResist: 0.15, pierceResist: 0.1 },
  weight: 3.5,
  description: 'An unyielding fortress of riveted steel. Those who wear it fear nothing.',
  affixes: ['helmGuard1'],
});

defineItem('helm_allseeing', {
  name: 'Crown of the All-Seeing', type: 'head',
  glyph: '^', color: '#f0d37a', glow: '#c0a14a', scale: 0.7,
  material: 'gold', rarity: 5,
  bonuses: { maxMana: 25, manaRegen: 0.7, critChance: 0.06, luck: 2 },
  weight: 0.5,
  description: "A third eye opens in the wearer's mind, bending fate to their will.",
  affixes: ['helmAttuned1'],
});

defineItem('tolling_greathelm', {
  name: 'Tolling Greathelm', type: 'head',
  glyph: '^', color: '#8a7ab6', glow: '#5a4a85', scale: 0.7,
  material: 'iron', rarity: 4,
  bonuses: { defense: 2, bluntResist: 0.1 },
  description: 'Three notches are scratched inside the brim. Each hit rings one. On the third toll, shadow falls.',
  procPackages: ['doomClock'],
  weight: 3.0,
});

defineItem('hollow_tide_helm', {
  name: 'Hollow Tide Helm', type: 'head',
  glyph: '^', color: '#9a8a70', glow: '#6a5a40', scale: 0.7,
  material: 'iron', rarity: 4,
  bonuses: { defense: 2, maxHp: 8 },
  description: 'Tidal runes circle the brow-plate, brightening as the wearer bleeds. The helmet knows your pain — and multiplies it outward.',
  procPackages: ['hollowTide'],
  weight: 2.5,
});

defineItem('predator_cowl', {
  name: "Predator's Cowl", type: 'head',
  glyph: '^', color: '#8cae64', glow: '#5e7a40', scale: 0.7,
  material: 'leather', rarity: 4,
  bonuses: { defense: 1, critChance: 0.04, attack: 1 },
  weight: 1.2,
  description: 'Dark leather with eye-slits only. Each hit stacks a hunting mark on the target (max 5, resets in 4 turns). Each mark past the first adds flat bonus damage to every subsequent hit on that same target.',
  procPackages: ['shrineBreaker'],
});

defineItem('blood_circlet', {
  name: 'Circlet of the Blood Covenant', type: 'head',
  glyph: '^', color: '#c87373', glow: '#8f3f3f', scale: 0.7,
  material: 'iron', rarity: 5,
  bonuses: { defense: 1, maxMana: 12, manaRegen: 0.4 },
  weight: 1.0,
  description: 'A thin iron band set with a single deep-red stone. Each attack costs 8% of your max HP (never fatal) in exchange for +5 fire damage on that swing. The circlet taps the vein automatically — you don\'t get a vote.',
  procPackages: ['ritualOverdraw'],
});

defineItem('eternal_hunger_crown', {
  name: 'Crown of Eternal Hunger', type: 'head',
  glyph: '^', color: '#c9ae65', glow: '#8f763f', scale: 0.7,
  material: 'iron', rarity: 5,
  bonuses: { defense: 1, attack: 2 },
  weight: 0.05,
  description: 'Each kill adds a hunger stack (max 10, fades over 12 turns). While hungry, every swing deals floor(stacks÷2) extra flat damage. The crown never lets the hunger fully cool.',
  procPackages: ['hungerSurge'],
});

defineItem('witch_king_circlet', {
  name: "Witch-King's Circlet", type: 'helm',
  glyph: '^', color: '#b366ff', glow: '#5a278c', scale: 0.7,
  material: 'obsidian', rarity: 5,
  bonuses: { defense: 1, maxMana: 15, spellHit: 2 },
  procPackages: ['witchKing'],
  value: 1100,
  weight: 0.3,
  description: 'Spells leave a black crown on their victims. Steel is the key that turns it.',
  abilities: {
    call_the_brood: {
      name: 'Call the Brood', icon: '🕷', targeting: 'none', requiresEquipped: true,
      cooldown: 200,
      spiderCount: 3,
      description: 'Summon {spiderCount} spiders loyal to you.',
      displayFormat: '{description} Cooldown: {cooldown} turns.',
      onActivate(ctx) {
        for (let i = 0; i < 3; i++) {
          ctx.spawnMonster('spider', null, { name: 'Bound Spider', faction: 'pet' });
        }
        ctx.message('Three spiders crawl from the circlet and bow to your will.', 'good');
        ctx.present('call_the_brood', { target: ctx.user });
      },
    },
  },
});

defineItem('crown_of_borrowed_faces', {
  name: 'Crown of Borrowed Faces', type: 'helm',
  glyph: '^', color: '#d59cff', glow: '#75439a', scale: 0.7,
  material: 'ivory', rarity: 5,
  bonuses: { defense: 1, maxMana: 10, luck: 2 },
  procPackages: ['witchKing'],
  value: 1250,
  weight: 0.4,
  description: 'Spells mark your enemies for the crown. Use: borrow the shape of shadow for 30 turns. Attacking breaks the disguise. 80-turn cooldown.',
  abilities: {
    borrowed_face: {
      name: 'Borrowed Face', icon: '◉', targeting: 'none', requiresEquipped: true,
      cooldown: 80,
      duration: 30,
      description: 'Become invisible for {duration} turns. Attacking breaks the disguise.',
      displayFormat: '{description} Cooldown: {cooldown} turns.',
      onActivate(ctx) {
        ctx.apply(ctx.user, 'invisible', 30, { potency: 1 });
        ctx.message('Your face slips sideways. For a while, the dungeon remembers someone else.', 'good');
        ctx.present('borrowed_face', { target: ctx.user });
      },
    },
  },
});
