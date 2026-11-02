import { defineItem } from '../define.js';
import {
  createCastSpellFromIdentityHook,
  MAPPING_ON_USE,
} from '../../rules/data/itemCatalogHooks.js';
import { requiresIdentification } from '../../rules/data/itemAppearances.js';
import { isIdentified, identify } from '../../rules/data/identification.js';
import { Beatitude } from '../../rules/components/Beatitude.js';
import { Equipment, GEAR_SLOTS } from '../../rules/components/Equipment.js';
import { ItemCooldown } from '../../rules/components/ItemCooldown.js';
import { resolveItemCooldownRemaining } from '../../rules/utils/itemCooldowns.js';
import {
  ENCHANT_SCROLL_DEFS,
  getEnchantScrollDef,
  enchantDefSupportsSlot,
  normalizeEnchantSlot,
} from '../../rules/content/enchanting/enchantCatalog.js';
import { affixSupportsSlot } from '../../rules/data/affixes.js';
import { getSpell } from '../../rules/data/spells.js';
import {
  emitScrollReadFailure,
  getScrollReadingQualityFromContext,
} from '../../rules/utils/scrollReading.js';

function createReadableScrollHook(onRead, opts = {}) {
  return (ctx, state) => {
    const actor = Number(state?.actor || ctx.actor || 0) | 0;
    const itemId = Number(state?.itemId || ctx.primary || 0) | 0;
    const quality = getScrollReadingQualityFromContext(ctx, actor);
    if (!quality.canRead) {
      emitScrollReadFailure(ctx.io, actor, itemId, quality);
      return { consumed: true };
    }
    const fumbleChance = Number(opts.fumbleChance ?? quality.fumbleChance ?? 0);
    if (fumbleChance > 0 && ctx.helpers.chance(fumbleChance)) {
      const duration = Math.max(120, Number(opts.fumbleTurns || 150) | 0);
      ctx.mutate.pushEffect(actor, {
        key: 'confused',
        turnsLeft: duration,
        maxTurns: duration,
        potency: 1,
        stacks: 1,
        sourceId: itemId,
        sourceKind: 'scroll',
        sourceKey: String(state?.identity || ''),
      });
      ctx.io.emit('scroll:fumbled', { actor, itemId, identity: String(state?.identity || ''), effectKey: 'confused', duration });
      return { consumed: true };
    }
    return onRead(ctx, state, quality);
  };
}

function resolveApplyTargetName(ctx, state, fallback) {
  return String(ctx?.query?.name?.(state?.targetId) || state?.targetInfo?.name || fallback || 'item');
}

function canEnchantScrollTarget(state) {
  const targetInfo = state?.targetInfo;
  if (!targetInfo || String(targetInfo.type || '') !== 'equip') return false;
  const slot = normalizeEnchantSlot(targetInfo.slot);
  if (!slot || slot === 'ammo') return false;
  const scrollDef = getEnchantScrollDef(state?.toolIdentity || state?.toolId || '');
  const runtimeAffixId = scrollDef?.runtime?.affixId || scrollDef?.affixId;
  if (!runtimeAffixId) return false;
  return enchantDefSupportsSlot(scrollDef, slot) && affixSupportsSlot(runtimeAffixId, slot);
}

function createEnchantScrollUseHint(message) {
  const text = String(message || 'Choose a piece of gear to enchant.');
  return () => ({ consumed: false, cancelled: true, code: 'USE_ENCHANT_SCROLL_TARGET', message: text, consumesTurn: false });
}

function createGearEnchantDipHook({ affixId, enchantType, enchantLabel, detail, allowedSlots, magnitude, proc, duration, metadata }) {
  const resolvedAffixId = String(affixId || '').trim();
  const resolvedType = String(enchantType || '').trim().toLowerCase();
  const resolvedLabel = String(enchantLabel || resolvedType || 'enchant');
  const resolvedDetail = String(detail || '');
  const scrollDef = { affixId: resolvedAffixId, allowedSlots: Array.isArray(allowedSlots) ? allowedSlots.slice() : [] };
  return (ctx, state) => {
    const targetId = Number(state?.targetId || 0) | 0;
    if (!(targetId > 0)) { ctx.cancel({ code: 'ENCHANT_INVALID_TARGET', message: 'That scroll needs a piece of gear to bind to.', consumesTurn: false }); return { applied: false, consumedTool: false, resultType: 'nothing' }; }
    const info = ctx.query.itemInfo(targetId);
    if (!info || String(info.type || '') !== 'equip') { ctx.cancel({ code: 'ENCHANT_INVALID_TARGET', message: 'Only gear can hold that enchantment.', consumesTurn: false }); return { applied: false, consumedTool: false, resultType: 'nothing' }; }
    const targetName = resolveApplyTargetName(ctx, state, 'gear');
    const slot = normalizeEnchantSlot(info.slot);
    if (!enchantDefSupportsSlot(scrollDef, slot) || !affixSupportsSlot(resolvedAffixId, slot)) { ctx.cancel({ code: 'ENCHANT_INVALID_SLOT', message: `${targetName} cannot hold ${resolvedLabel}.`, consumesTurn: false }); return { applied: false, consumedTool: false, resultType: 'nothing' }; }
    const currentAffixes = Array.isArray(info.affixes) ? info.affixes.slice() : [];
    if (currentAffixes.includes(resolvedAffixId)) { ctx.cancel({ code: 'ENCHANT_ALREADY_PRESENT', message: `${targetName} already bears ${resolvedLabel}.`, consumesTurn: false }); return { applied: false, consumedTool: false, resultType: 'nothing' }; }
    ctx.helpers.patchItemInfo(targetId, { affixes: [...currentAffixes, resolvedAffixId] });
    ctx.helpers.attachEnchantment(targetId, { defId: `ench.${resolvedAffixId}`, affixId: resolvedAffixId, level: Math.max(1, Number(magnitude || 1) | 0), sourceKind: 'scroll', sourceId: Number(state?.toolId || 0) | 0, sourceKey: String(state?.toolIdentity || '') });
    ctx.io.emit('item:applied', { actor: state.actor, toolId: state.toolId, targetId, result: { type: 'gear_enchant', enchantType: resolvedType, affixId: resolvedAffixId, magnitude, proc, duration, metadata: { ...(metadata || {}) }, message: `You bind ${resolvedLabel} into ${targetName}.${resolvedDetail ? ` ${resolvedDetail}` : ''}` } });
    return { applied: true, consumedTool: true, resultType: `${resolvedType}_gear_enchant` };
  };
}

// ── Enchant scrolls (generated from enchant catalog) ─────────────────
for (const def of ENCHANT_SCROLL_DEFS) {
  defineItem(def.itemId, {
    name: def.name, type: 'scroll', material: 'paper', rarity: 'magic', value: 120, weight: 0.1,
    description: def.description,
    hooks: {
      can_dip_target: canEnchantScrollTarget,
      on_dip: createGearEnchantDipHook({
        affixId: def.runtime?.affixId || def.affixId,
        enchantType: def.enchantType,
        enchantLabel: def.name.replace(/^Scroll of /, '').replace(/ Binding$/, ''),
        detail: def.detail,
        allowedSlots: def.allowedSlots,
        magnitude: def.magnitude,
        proc: def.proc,
        duration: def.duration,
        metadata: def.metadata,
      }),
      on_use: createEnchantScrollUseHint(`Choose a piece of gear for ${def.name.toLowerCase()}.`),
    },
  });
}

// ── Utility scrolls ───────────────────────────────────────────────────

defineItem('scroll_blastwave', {
  name: 'Scroll of Blast Wave', type: 'scroll', material: 'paper', rarity: 'magic', weight: 0.1,
  description: 'Casts Blast Wave without learning it.',
  hooks: { on_use: createCastSpellFromIdentityHook({ identityPrefix: 'scroll_', targetMode: 'self', consumeOnSuccess: true }) },
});

defineItem('scroll_homecoming', {
  name: 'Scroll of Homecoming', type: 'scroll', material: 'paper', rarity: 'magic', weight: 0.1,
  description: 'Returns you to the surface (dungeon level 0).',
  hooks: {
    on_use: createCastSpellFromIdentityHook({ identityPrefix: 'scroll_', targetMode: 'self', consumeOnSuccess: true }),
    on_loot_roll: (ctx, _state) => { if (ctx?.playerItemIds?.has('hearthstone')) return { cancel: true }; return {}; },
  },
});

defineItem('scroll_heal', {
  name: 'Scroll of Healing', type: 'scroll', material: 'paper', rarity: 'common', weight: 0.1,
  description: 'Casts a healing spell on yourself or an ally.',
  hooks: { on_use: createCastSpellFromIdentityHook({ identityPrefix: 'scroll_', targetMode: 'target', consumeOnSuccess: true }) },
});

defineItem('scroll_summon_skeleton', {
  name: 'Scroll of Summon Skeleton', type: 'scroll', material: 'paper', rarity: 'magic', weight: 0.1,
  description: 'Rip a skeleton from the earth to fight at your side.',
  hooks: { on_use: createCastSpellFromIdentityHook({ identityPrefix: 'scroll_', targetMode: 'self', consumeOnSuccess: true }) },
});

defineItem('scroll_taming', {
  name: 'Scroll of Taming', type: 'scroll', material: 'paper', rarity: 'rare', weight: 0.1,
  description: 'Soft whispers curl from the parchment. A creature that hears them becomes your devoted ally.',
  hooks: {
    on_use: createReadableScrollHook((ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; ctx.io.emit('scroll:taming', { actor }); return { consumed: true }; }),
  },
});

defineItem('scroll_mapping', {
  name: 'Scroll of Mapping', type: 'scroll', material: 'paper', rarity: 'common', value: 100, weight: 0.1,
  description: 'Reveals the entire dungeon map.',
  hooks: { on_use: MAPPING_ON_USE },
});

defineItem('scroll_identify', {
  name: 'Scroll of Identify', type: 'scroll', material: 'paper', rarity: 'common', value: 30, weight: 0.1,
  identified: true, noQuickChip: true,
  description: 'Reveals the true nature of an item.',
  hooks: {
    on_use: (ctx, state) => {
      const actor = Number(state?.actor || ctx.actor || 0) | 0;
      const scrollId = Number(state?.itemId || 0) | 0;
      ctx.io.emit('scroll:identify', { actor, scrollId });
      return { consumed: false, cancelled: true, code: 'IDENTIFY_PENDING_UI', consumesTurn: false };
    },
    can_dip_target: (state) => {
      const targetInfo = state?.targetInfo;
      if (!targetInfo) return false;
      const identity = String(state?.targetIdentity || '');
      if (!identity) return false;
      if (isIdentified(identity)) return false;
      if (String(targetInfo?.type || '') === 'gem') return true;
      return requiresIdentification(targetInfo);
    },
    on_dip: (ctx, state) => {
      const identity = String(state?.targetIdentity || '');
      if (!identity) return { applied: false, consumedTool: false };
      const wasNew = identify(identity);
      const targetName = String(ctx?.query?.name?.(state.targetId) || identity.replace(/_/g, ' '));
      ctx.io.emit('item:identified', { actor: state.actor, identity, name: targetName, category: String(state?.targetInfo?.type || state?.targetInfo?.slot || 'item'), newlyIdentified: wasNew });
      return { applied: true, consumedTool: true, resultType: 'identify' };
    },
  },
});

defineItem('scroll_remove_curse', {
  name: 'Scroll of Remove Curse', type: 'scroll', material: 'paper', rarity: 'magic', value: 50, weight: 0.1,
  description: 'Holy words purge corruption from an item.',
  hooks: {
    on_use: (ctx, state) => {
      const actor = Number(state?.actor || ctx.actor || 0) | 0;
      const equip = ctx.query.get(actor, Equipment);
      let count = 0;
      if (equip) {
        for (const slot of GEAR_SLOTS) {
          const itemId = equip[slot];
          if (!(itemId > 0)) continue;
          const beat = ctx.query.get(itemId, Beatitude);
          if (!beat || beat.state !== 'cursed') continue;
          const name = String(ctx.query.name?.(itemId) || 'item');
          ctx.io.emit('curse:removed', { actor, itemId, name, source: 'scroll' });
          count++;
        }
      }
      ctx.io.emit('scroll:remove_curse', { actor, count });
      return { consumed: true };
    },
    can_dip_target: (state) => state?.targetBeatitude === 'cursed',
    on_dip: (ctx, state) => {
      const targetId = state?.targetId;
      if (!targetId) return { applied: false, consumedTool: false };
      const targetName = String(ctx?.query?.name?.(targetId) || 'item');
      ctx.io.emit('curse:removed', { actor: state.actor, itemId: targetId, name: targetName, source: 'scroll' });
      return { applied: true, consumedTool: true, resultType: 'remove_curse' };
    },
  },
});

defineItem('scroll_amnesia', {
  name: 'Scroll of Amnesia', type: 'scroll', material: 'paper', rarity: 'common', value: 5, weight: 0.1,
  description: 'The words burn away everything you know. Total oblivion.',
  hooks: {
    on_use: createReadableScrollHook((ctx, state) => {
      const actor = Number(state?.actor || ctx.actor || 0) | 0;
      const brain = ctx.query.brain(actor);
      const forgottenSpells = [];
      if (brain) {
        if (Array.isArray(brain.learnedSpellIds)) { forgottenSpells.push(...brain.learnedSpellIds); brain.learnedSpellIds.length = 0; }
        if (Array.isArray(brain.itemKnowledgeIdentities)) brain.itemKnowledgeIdentities.length = 0;
        if (brain.seenTiles) brain.seenTiles.fill(0);
      }
      ctx.io.emit('scroll:amnesia', { actor, forgottenSpells, total: true });
      return { consumed: true };
    }),
  },
});

defineItem('scroll_fire', {
  name: 'Scroll of Fire', type: 'scroll', material: 'paper', rarity: 'common', value: 5, weight: 0.1,
  description: 'The scroll erupts in flames as you read it!',
  hooks: {
    on_use: createReadableScrollHook((ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; const damage = ctx.helpers.roll('2d6'); ctx.helpers.damage(actor, damage, 'scroll_fire'); ctx.io.emit('scroll:fire', { actor, damage }); return { consumed: true }; }),
  },
});

defineItem('scroll_aggravation', {
  name: 'Scroll of Aggravation', type: 'scroll', material: 'paper', rarity: 'common', value: 5, weight: 0.1,
  description: 'A terrible shriek fills the dungeon!',
  hooks: { on_use: createReadableScrollHook((ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; ctx.io.emit('scroll:aggravation', { actor }); return { consumed: true }; }) },
});

defineItem('scroll_genocide', {
  name: 'Scroll of Genocide', type: 'scroll', material: 'paper', rarity: 'epic', value: 200, weight: 0.1,
  description: 'The parchment hums with finality. Name a creature, and it shall cease to exist.',
  hooks: { on_use: createReadableScrollHook((ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; ctx.io.emit('scroll:genocide', { actor }); return { consumed: true }; }) },
});

defineItem('scroll_teleportation', {
  name: 'Scroll of Teleportation', type: 'scroll', material: 'paper', rarity: 'common', value: 15, weight: 0.1,
  description: 'Reality lurches. You blink and find yourself somewhere else entirely.',
  hooks: { on_use: createReadableScrollHook((ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; ctx.io.emit('scroll:teleportation', { actor }); return { consumed: true }; }) },
});

defineItem('scroll_polymorph', {
  name: 'Scroll of Polymorph', type: 'scroll', material: 'paper', rarity: 'epic', value: 80, weight: 0.1,
  description: 'The words twist reality itself. Name a creature and watch the nearest foe reshape.',
  hooks: { on_use: createReadableScrollHook((ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; ctx.io.emit('scroll:polymorph', { actor }); return { consumed: true }; }) },
});

defineItem('scroll_mass_delirium', {
  name: 'Scroll of Mass Delirium', type: 'scroll', material: 'paper', rarity: 'epic', value: 160, weight: 0.1,
  description: 'Impossible script blooms into a vast delirious field. Misread it and the words stay in your head for a very long time.',
  hooks: {
    on_use: createReadableScrollHook((ctx, state) => {
      const actor = Number(state?.actor || ctx.actor || 0) | 0;
      const spell = getSpell('mass_delirium');
      if (!spell || typeof ctx?.rules?.runSpell !== 'function') return { consumed: false };
      ctx.rules.runSpell(actor, spell, {});
      ctx.io.emit('castSpell', { actor, spellId: spell.id, targetId: actor, source: 'scroll' });
      ctx.io.emit('scroll:mass_delirium', { actor });
      return { consumed: true, spellId: spell.id };
    }, { fumbleTurns: 150 }),
  },
});

defineItem('scroll_cursing', {
  name: 'Scroll of Cursing', type: 'scroll', material: 'paper', rarity: 'magic', value: 5, weight: 0.1,
  description: 'Dark words slither off the page and weld your gear to your body.',
  hooks: {
    on_use: createReadableScrollHook((ctx, state) => {
      const actor = Number(state?.actor || ctx.actor || 0) | 0;
      const equip = ctx.query.get(actor, Equipment);
      let cursed = 0;
      if (equip) {
        for (const slot of GEAR_SLOTS) {
          const itemId = equip[slot];
          if (!(itemId > 0)) continue;
          const beat = ctx.query.get(itemId, Beatitude);
          if (beat && beat.state === 'cursed') continue;
          cursed++;
          ctx.io.emit('curse:equipment', { actor, itemId, source: 'scroll_cursing' });
          if (cursed >= 3) break;
        }
      }
      ctx.io.emit('scroll:cursing', { actor, count: cursed });
      return { consumed: true };
    }),
  },
});

defineItem('scroll_summoning', {
  name: 'Scroll of Summoning', type: 'scroll', material: 'paper', rarity: 'magic', value: 5, weight: 0.1,
  description: 'The words screech and claw shapes pour from the parchment.',
  hooks: { on_use: createReadableScrollHook((ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; ctx.io.emit('scroll:summoning', { actor }); return { consumed: true }; }) },
});

defineItem('scroll_decay', {
  name: 'Scroll of Decay', type: 'scroll', material: 'paper', rarity: 'common', value: 5, weight: 0.1,
  description: 'The scroll crumbles and a wave of rot spreads through your pack.',
  hooks: { on_use: createReadableScrollHook((ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; ctx.io.emit('scroll:decay', { actor }); return { consumed: true }; }) },
});

// ── Hearthstone (tool) ────────────────────────────────────────────────
defineItem('hearthstone', {
  name: 'Hearthstone', type: 'tool', material: 'mineral', rarity: 'rare', tags: ['unique'], value: 88, weight: 0.5,
  description: 'A warm stone that remembers the way home. Channel your will to return to the surface.',
  hooks: (() => {
    const _castHook = createCastSpellFromIdentityHook({ identityPrefix: '', targetMode: 'self', consumeOnSuccess: false });
    return {
      on_use: (ctx, state) => {
        const cd = ctx.query.get(state.itemId, ItemCooldown);
        const turns = resolveItemCooldownRemaining(cd, ctx.query.worldStep());
        if (turns > 0) { ctx.io.message(`The hearthstone is still cooling down (${turns} turns).`, 'warning'); return { consumed: false, cancelled: true, consumesTurn: false, code: 'ITEM_ON_COOLDOWN', message: 'Hearthstone is on cooldown.' }; }
        return _castHook(ctx, state);
      },
      after_use: (ctx, state) => { ctx.mutate.queue({ type: 'setItemCooldown', entityId: state.itemId | 0, turns: 500 }); return {}; },
    };
  })(),
});
