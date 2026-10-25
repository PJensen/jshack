import { defineEffect, defineItem } from '../define.js';
import { createBuffFoodOnUseHook } from '../../rules/data/itemCatalogHooks.js';

defineEffect('pilgrims_supper', {
  name: "Pilgrim's Supper", visualIdentity: 'food_pilgrim_stew',
  description: 'Slow barley warmth for sore feet and old wounds. Another bowl refreshes the blessing.',
  periodic: [
    { operation: 'heal', amount: 1, interval: 5 },
    { operation: 'stamina_restore', amount: 2, interval: 3 },
  ],
});

defineItem('food_pilgrim_stew', {
  name: "Pilgrim's Barley Stew", type: 'food', material: 'organic', rarity: 'uncommon',
  glyph: '♨', color: '#e0b778', glow: '#9e7040', scale: 0.7,
  value: 24, weight: 0.6, nutrition: 300, shelfLife: 1440, identified: true,
  tags: ['cooked_food'],
  description: 'Eat: restore 1 HP every 5 turns and 2 stamina every 3 turns for 60 turns. Another bowl refreshes the duration. Barley, carrots, and a small stubborn hope.',
  hooks: { on_use: createBuffFoodOnUseHook({ key: 'pilgrims_supper', turnsLeft: 60 }) },
});

defineEffect('moonmilk_comfort', {
  name: 'Moonmilk Comfort', visualIdentity: 'food_moonmilk_chowder',
  description: 'The pale chowder mends flesh and drinks a little of your magic.',
  periodic: [
    { operation: 'heal', amount: 2, interval: 3 },
    { operation: 'mana_drain', amount: 1, interval: 4 },
  ],
});

defineItem('food_moonmilk_chowder', {
  name: 'Moonmilk Chowder', type: 'food', material: 'organic', rarity: 'uncommon',
  glyph: '♨', color: '#d9ceff', glow: '#9a83ce', scale: 0.7,
  value: 28, weight: 0.5, nutrition: 240, shelfLife: 1080, identified: true,
  tags: ['cooked_food'],
  description: 'Eat: restore 2 HP every 3 turns, but lose 1 mana every 4 turns, for 24 turns. Another bowl refreshes the duration. Thick with cave clams; the spoon casts two shadows.',
  hooks: { on_use: createBuffFoodOnUseHook({ key: 'moonmilk_comfort', turnsLeft: 24 }) },
});

defineEffect('witchlight_aftertaste', {
  name: 'Witchlight Aftertaste', visualIdentity: 'food_witchlight_broth',
  description: 'Hot blue sparks refill the mind and burn on the way down.',
  periodic: [
    { operation: 'mana_restore', amount: 3, interval: 2 },
    { operation: 'damage', amount: 1, interval: 3, damageType: 'generic' },
  ],
});

defineItem('food_witchlight_broth', {
  name: 'Witchlight Broth', type: 'food', material: 'organic', rarity: 'rare',
  glyph: '♨', color: '#77ddd4', glow: '#398e9c', scale: 0.7,
  value: 32, weight: 0.4, nutrition: 180, shelfLife: 1080, identified: true,
  tags: ['cooked_food'],
  description: 'Eat: restore 3 mana every 2 turns, but take 1 damage every 3 turns, for 12 turns. Another bowl refreshes the duration. Do not ask what keeps the bowl glowing.',
  hooks: { on_use: createBuffFoodOnUseHook({ key: 'witchlight_aftertaste', turnsLeft: 12 }) },
});
