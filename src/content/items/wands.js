import { defineItem } from '../define.js';
import { createCastSpellFromIdentityHook, createWandShatterThrowHook } from '../../rules/data/itemCatalogHooks.js';

defineItem('wand_arcane', {
  name: 'Arcane Wand',
  type: 'wand',
  slot: 'ranged',
  material: 'wood',
  subtype: 'projectile',
  rarity: 'rare',
  value: 140,
  weight: 0.4,
  damageDice: '1d4',
  damageBonus: 1,
  damageType: 'arcane',
  range: 8,
  staminaCost: 0,
  projectileStyle: 'arcane_wand',
  chargePool: { current: 100, max: 100 },
  description: 'A lightweight wand that fires small arcane motes. Instant attack; 100 charges.',
});

defineItem('wand_lightning', {
  name: 'Wand of Lightning', type: 'wand', slot: 'ranged', material: 'wood', rarity: 'rare', charges: 3, value: 120, weight: 0.4,
  description: 'Zaps a bolt of chain lightning. 3 charges.',
  hooks: {
    on_use: createCastSpellFromIdentityHook({ identityPrefix: 'wand_', targetMode: 'intentTarget', castEventSource: 'wand', consumeOnSuccess: true }),
    on_throw: createWandShatterThrowHook({ element: 'electric', damagePerCharge: 4, radius: 2, effectKey: 'shocked', effectDurationPerCharge: 2 }),
  },
});

defineItem('wand_meteor', {
  name: 'Wand of Meteor', type: 'wand', slot: 'ranged', material: 'wood', rarity: 'epic', charges: 2, value: 240, weight: 0.4,
  description: 'Calls down a meteor. 2 charges.',
  hooks: {
    on_use: createCastSpellFromIdentityHook({ identityPrefix: 'wand_', targetMode: 'intentTarget', castEventSource: 'wand', consumeOnSuccess: true }),
    on_throw: createWandShatterThrowHook({ element: 'fire', damagePerCharge: 6, radius: 2, effectKey: 'burning', effectDurationPerCharge: 2, hazardKind: 'fire', hazardTurns: 4, hazardTickDamage: 3 }),
  },
});

defineItem('wand_frost', {
  name: 'Wand of Frost', type: 'wand', slot: 'ranged', material: 'wood', rarity: 'magic', charges: 10, value: 75, weight: 0.4,
  description: 'Encases an enemy in frost, slowing them. Lighter foes freeze longer. 10 charges.',
  hooks: {
    on_use: createCastSpellFromIdentityHook({ identityPrefix: 'wand_', targetMode: 'intentTarget', castEventSource: 'wand', consumeOnSuccess: true }),
    on_throw: createWandShatterThrowHook({ element: 'cold', damagePerCharge: 2, radius: 2, effectKey: 'frozen', effectDurationPerCharge: 2 }),
  },
});

defineItem('wand_stasis', {
  name: 'Wand of Stasis', type: 'wand', slot: 'ranged', material: 'wood', rarity: 'rare', charges: 3, value: 180, weight: 0.4,
  description: 'A pale crystalline rod that hums with temporal energy. Freezes a creature outside of time.',
  hooks: {
    on_use: (ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; ctx.io.emit('wand:stasis', { actor }); return { consumed: true }; },
  },
});

defineItem('wand_heal', {
  name: 'Wand of Healing', type: 'wand', slot: 'ranged', material: 'wood', rarity: 'magic', charges: 8, value: 65, weight: 0.4,
  description: 'Restores health to yourself or an ally. 8 charges.',
  hooks: {
    on_use: createCastSpellFromIdentityHook({ identityPrefix: 'wand_', targetMode: 'target', castEventSource: 'wand', consumeOnSuccess: true }),
    on_throw: createWandShatterThrowHook({ element: 'holy', damagePerCharge: 0, healPerCharge: 3, radius: 2 }),
  },
});
