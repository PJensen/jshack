// rules/utils/procPhases.js
// Shared proc-phase helpers used by melee, offhand, and ranged combat systems.

import { dealDamage } from './dealDamage.js';
import { evaluateEquippedAffixProcs } from './affixTopology.js';
import { applyProcAccumulator, rollBonusDamage } from './procApplication.js';

/**
 * Build a proc context object for affix evaluation.
 * @param {string} kind  e.g. 'onHit', 'onMiss', 'onBeforeHit'
 * @param {{source:number, target:number, item:number, damage:number, damageType?:string, crit?:boolean, tags?:string[], scratch?:object, offhand?:boolean}} p
 */
export function buildProcContext(kind, {
    source,
    target,
    item,
    damage,
    damageType,
    crit,
    tags,
    scratch,
    offhand = false,
}) {
    return {
        kind,
        source: Number(source || 0) | 0,
        target: Number(target || 0) | 0,
        item: Number(item || 0) | 0,
        damage: {
            amount: Math.max(0, Math.floor(Number(damage || 0))),
            type: String(damageType || 'physical'),
            crit: !!crit,
            blocked: false,
        },
        tags: new Set(Array.isArray(tags) ? tags : []),
        scratch: scratch || {},
        offhand: !!offhand,
    };
}

export function applyPendingDamageProcPhase(world, actorId, ctx, rng, options = {}) {
    const out = evaluateEquippedAffixProcs(world, actorId, ctx, options);
    const bonusDamage = out.cancelled ? 0 : rollBonusDamage(world, out.bonusDamage, rng);
    applyProcAccumulator(world, out, { applyDamage: dealDamage });
    return Math.max(0, Math.floor((Number(ctx?.damage?.amount || 0) + bonusDamage) * Math.max(0, Number(out.damageMultiplier || 1))));
}

export function applyReactionProcPhase(world, actorId, ctx, options = {}) {
    const out = evaluateEquippedAffixProcs(world, actorId, ctx, options);
    applyProcAccumulator(world, out, { applyDamage: dealDamage });
    return out;
}
