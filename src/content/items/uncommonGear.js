// A small authored band of green gear between plain finds and rare treasures.

import { defineItem } from '../define.js';

defineItem('briarbound_blade', {
  name: 'Briarbound Blade', type: 'weapon',
  glyph: ')', color: '#78b85a', glow: '#4e7d38', scale: 0.8,
  material: 'steel', rarity: 'uncommon',
  bonuses: { attack: 1, critChance: 0.03, slashPenetration: 1 },
  damageDice: '1d7', damageType: 'slash', staminaCost: 8,
  value: 90, weight: 1.3,
  description: 'A serviceable blade wrapped in living briars. The thorns tighten when a strike finds a gap.',
});

defineItem('mossguard_mail', {
  name: 'Mossguard Mail', type: 'armor',
  glyph: '[', color: '#6fa36a', glow: '#416b43', scale: 0.85,
  material: 'iron', rarity: 'uncommon',
  bonuses: { defense: 2, maxHp: 4, poisonResist: 0.05 },
  value: 110, weight: 8.0,
  description: 'Iron rings gone green with living moss. It smells like rain and turns aside more than it should.',
});

defineItem('greenwarden_hood', {
  name: "Greenwarden's Hood", type: 'head',
  glyph: '^', color: '#79b86a', glow: '#4c7d42', scale: 0.7,
  material: 'leather', rarity: 'uncommon',
  bonuses: { defense: 1, visionRange: 1, poisonResist: 0.1 },
  value: 78, weight: 0.7,
  description: 'A leaf-lined hood that sharpens the eye and keeps the dungeon’s lesser venoms at bay.',
});

defineItem('thornwall_buckler', {
  name: 'Thornwall Buckler', type: 'offhand',
  glyph: '[', color: '#70a95d', glow: '#436f3d', scale: 0.85,
  material: 'wood', rarity: 'uncommon',
  bonuses: { defense: 2, attack: 1 },
  value: 95, weight: 1.8,
  description: 'A round shield grown from a single stubborn root. Enemies learn quickly not to lean on it.',
});

defineItem('suregrip_gauntlets', {
  name: 'Suregrip Gauntlets', type: 'gloves',
  glyph: '"', color: '#83b866', glow: '#527a40', scale: 0.6,
  material: 'leather', rarity: 'uncommon',
  bonuses: { attack: 1, maxStamina: 5, dig: 1 },
  value: 72, weight: 0.4,
  description: 'Rough green gloves that make a weapon, a ledge, or a pickaxe feel briefly inevitable.',
});

defineItem('swiftroot_boots', {
  name: 'Swiftroot Boots', type: 'boots',
  glyph: 'u', color: '#77ad5e', glow: '#456f3c', scale: 0.65,
  material: 'leather', rarity: 'uncommon',
  bonuses: { defense: 1, maxStamina: 6, staminaRegen: 0.3 },
  value: 82, weight: 0.9,
  description: 'Flexible boots with root-fiber soles that bite into loose stone when a retreat gets urgent.',
});

defineItem('trailblazer_belt', {
  name: 'Trailblazer Belt', type: 'belt',
  glyph: '=', color: '#80b464', glow: '#4f773e', scale: 0.6,
  material: 'leather', rarity: 'uncommon',
  bonuses: { maxStamina: 8, staminaRegen: 0.2, luck: 1 },
  value: 86, weight: 0.5,
  description: 'A practical belt marked with every route its wearer survived. The next path always seems a little clearer.',
});

defineItem('emerald_oath_ring', {
  name: 'Emerald Oath Ring', type: 'ring',
  glyph: '◌', color: '#6ee28a', glow: '#3c9b59', scale: 0.45,
  material: 'silver', rarity: 'uncommon',
  bonuses: { maxHp: 4, maxMana: 4, poisonResist: 0.1 },
  value: 105, weight: 0.05,
  description: 'A silver ring set with a cloudy green stone. It rewards stubbornness with one more breath.',
});
