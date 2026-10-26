// src/content/worldFacade.js
// Builds a lightweight interaction-context-shaped facade backed directly
// by world operations. Used by itemProcTickSystem and other non-interaction
// hook contexts where the full interaction runtime isn't available.

import { Position } from '../rules/components/Position.js';
import { NamedIdentity } from '../rules/components/NamedIdentity.js';
import { Faction } from '../rules/components/Faction.js';
import { ItemInfo } from '../rules/components/ItemInfo.js';
import { Vitality } from '../rules/components/Vitality.js';
import { ActiveEffects } from '../rules/components/ActiveEffects.js';
import { ScriptState } from '../rules/components/ScriptState.js';
import { forEachInRadius } from '../rules/utils/spatialIndex.js';
import { rollDice } from '../rules/utils/rng.js';
import { dealDamage } from '../rules/utils/dealDamage.js';
import { applyHealing } from '../rules/utils/applyHealing.js';
import { getMonster, monsterHasTag } from '../rules/data/monsters.js';
import { setItemCooldown, getItemCooldownRemaining, isItemOnCooldown } from '../rules/utils/itemCooldowns.js';
import { getEffectDefinition } from '../rules/data/effectInstances.js';
import { applyEffectInstance, removeEffectInstance } from '../rules/utils/effectInstances.js';
import { EffectInstance } from '../rules/components/EffectInstance.js';
import { childrenWith } from '../rules/utils/topology.js';
import { hasStatus, hasEffect } from '../rules/utils/statusFacade.js';

/**
 * Create a world-backed context suitable for ScriptCtx.
 * Provides the same interface shape as the interaction context
 * so ScriptCtx doesn't need to know the difference.
 *
 * @param {import('../lib/ecs-js/index.js').World} world
 * @param {number} actor - carrier/owner entity
 * @param {number} itemId - the scripted entity
 * @returns {object} interaction-context-shaped facade
 */
export function createWorldFacade(world, actor, itemId) {
  const identity = String(world.get(itemId, NamedIdentity)?.identity || '');

  const query = {
    get(id, Comp) { return world.get(id, Comp) || null; },
    name(id) { return String(world.get(id, NamedIdentity)?.name || ''); },
    identity(id) { return String(world.get(id, NamedIdentity)?.identity || ''); },
  };

  const helpers = {
    heal(entityId, amount) {
      return applyHealing(world, { target: entityId, amount, source: actor, cause: 'script' }).amount;
    },
    damage(entityId, amount, _source) {
      const dmg = Math.max(0, amount | 0);
      if (!(dmg > 0)) return;
      dealDamage(world, {
        target: entityId,
        amount: dmg,
        source: actor,
        cause: 'script',
        type: _source || 'script',
      });
    },
    addEffect(entityId, effect) {
      if (getEffectDefinition(effect?.key)) return applyEffectInstance(world, entityId, { ...effect, sourceActorId: actor });
      const ae = world.get(entityId, ActiveEffects);
      if (!ae) return;
      world.mutate(entityId, ActiveEffects, a => { a.effects.push({ ...effect }); });
    },
    clearEffects(entityId, keys) {
      for (const [id, instance] of [...childrenWith(world, entityId, EffectInstance)]) {
        if (keys.includes(instance.definitionId)) removeEffectInstance(world, id, 'dispelled');
      }
      const ae = world.get(entityId, ActiveEffects);
      if (!ae) return;
      const keySet = new Set(keys);
      world.mutate(entityId, ActiveEffects, a => {
        a.effects = a.effects.filter(e => !keySet.has(e.key));
      });
    },
    hasStatus(entityId, key) {
      return hasStatus(world, entityId, key);
    },
    hasEffect(entityId, key) { return hasEffect(world, entityId, key); },
    roll(expr) { return Math.max(0, rollDice(String(expr), () => world.rand())); },
    chance(pct) { const p = pct <= 1 ? pct * 100 : pct; return world.rand() * 100 < p; },
    int(min, max) { return min + Math.floor(world.rand() * (max - min + 1)); },
    pick(arr) { return arr?.length ? arr[Math.floor(world.rand() * arr.length)] : null; },
    consume() {},
    spawnItem() { return null; },
    spawnMonster() { return null; },
    hazardSpawn() {},
    emit(event, payload) { world.emit(event, payload); },
    message(text, type) { world.emit('log:message', { text, type: type || 'system' }); },
  };

  return {
    actor,
    primary: itemId,
    target: 0,
    query,
    helpers,
    io: { emit: (e, p) => world.emit(e, p) },

    // ── Extended APIs for ScriptCtx ──────────────────────────────
    _ScriptState: ScriptState,
    _ItemInfo: ItemInfo,

    _hpPercent(entityId) {
      const vit = world.get(entityId, Vitality);
      if (!vit) return 1.0;
      return vit.hp / Math.max(1, vit.maxHp);
    },

    _getScriptState(entityId) {
      const ss = world.get(entityId, ScriptState);
      return ss ? ss.data : {};
    },

    _setScriptState(entityId, patch) {
      if (!world.has(entityId, ScriptState)) return;
      world.mutate(entityId, ScriptState, ss => {
        Object.assign(ss.data, patch);
      });
    },

    _mutateScriptState(entityId, patch) {
      return this._setScriptState(entityId, patch);
    },

    _hasTag(entityId, tag) {
      // Check ItemInfo.tags
      const info = world.get(entityId, ItemInfo);
      if (info && Array.isArray(info.tags) && info.tags.includes(tag)) return true;
      // Check monster def tags
      const ni = world.get(entityId, NamedIdentity);
      if (ni?.identity) {
        const mdef = getMonster(ni.identity);
        if (mdef && Array.isArray(mdef.tags) && mdef.tags.includes(tag)) return true;
      }
      return false;
    },

    _entitiesInRadius(center, radius, filter) {
      let cx, cy;
      if (typeof center === 'number') {
        const pos = world.get(center, Position);
        if (!pos) return [];
        cx = pos.x; cy = pos.y;
      } else {
        cx = center.x; cy = center.y;
      }
      const results = [];
      forEachInRadius(world, cx, cy, radius, (id, _pos) => {
        if (id === actor || id === itemId) return; // skip self and carrier
        if (filter?.tag && !this._hasTag(id, filter.tag)) return;
        if (filter?.faction) {
          const f = world.get(id, Faction);
          if (!f || f.key !== filter.faction) return;
        }
        results.push(id);
      });
      return results;
    },

    _tileAt(_posOrEntity) {
      // Stub — would need tileMap access; implement when needed
      return null;
    },

    _setCooldown(entityId, turns) {
      setItemCooldown(world, entityId, turns);
    },
    _isOnCooldown(entityId) {
      return isItemOnCooldown(world, entityId);
    },
    _cooldownRemaining(entityId) {
      return getItemCooldownRemaining(world, entityId);
    },
  };
}
