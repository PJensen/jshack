// src/rules/systems/effectSystem.js
// Processes gameplay effects applied via ActiveEffects, updating Vitality and Status.
import { ActiveEffects } from '../components/ActiveEffects.js';
import { Status } from '../components/Status.js';
import { Vitality } from '../components/Vitality.js';
import { Position } from '../components/Position.js';
import { Stamina } from '../components/Stamina.js';
import { Mana } from '../components/Mana.js';
import { Brain } from '../components/Brain.js';
import { Channeling } from '../components/Channeling.js';
import { Duration } from '../components/Duration.js';
import { Faction } from '../components/Faction.js';
import { StatusEffectNode } from '../components/StatusEffectNode.js';
import { TimedEffectNode } from '../components/TimedEffectNode.js';
import { areFactionsHostile } from '../utils/factionHostility.js';
import { EFFECT_DEFS } from '../data/effectDefs.js';
import { dealDamage } from '../utils/dealDamage.js';
import { compactDotEffects } from '../utils/effectSemantics.js';
import { getPassiveBonuses } from '../utils/passiveBonuses.js';
import { applyHealing } from '../utils/applyHealing.js';
import { buildSpellDamageSpecFromContext } from '../utils/spellDamage.js';
import { computeEnvelopeValue } from '../utils/blind.js';
import { chebyshev } from '../utils/distance.js';
import { hasSpellLineOfSight } from '../utils/spellTargeting.js';
import { buildBlocksVisionMap, blockedCallback } from '../utils/vision.js';
import { forEachInRadius } from '../utils/spatialIndex.js';

/** @type {Record<string, { operation:string, operations:string[], statuses:string[] }>} */
const EFFECTS_BY_KEY = buildEffectIndex(EFFECT_DEFS);

/**
 * @param {Array<{keys?:string[], operation?:string, operations?:string[], statuses?:string[]}>} defs
 */
function buildEffectIndex(defs) {
    const map = Object.create(null);
    for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        const keys = Array.isArray(def?.keys) ? def.keys : [];
        for (let k = 0; k < keys.length; k++) {
            const key = String(keys[k] || '').toLowerCase();
            if (!key || map[key]) continue;
            const operations = Array.isArray(def?.operations) && def.operations.length > 0
                ? def.operations.map((op) => String(op || 'none'))
                : [String(def?.operation || 'none')];
            map[key] = {
                operation: operations[0] || String(def?.operation || 'none'),
                operations,
                statuses: Array.isArray(def?.statuses) ? def.statuses : [],
            };
        }
    }
    return map;
}

/** Map effect keys to damage types for the pipeline. */
function effectKeyToType(key) {
    switch (key) {
        case 'burn': case 'burning': return 'fire';
        case 'poison': case 'poisoned': return 'poison';
        case 'bleed': case 'bleeding': return 'generic';
        case 'shock': case 'shocked': return 'lightning';
        case 'agony': return 'shadow';
        case 'swarm': case 'swarmed': return 'nature';
        default: return 'generic';
    }
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @param {{hp:number,maxHp:number}|null} vit
 * @param {"none"|"damage"|"heal"|string} operation
 * @param {number} potency
 * @param {number} stacks
 * @param {string} key - effect key for damage type mapping
 */
function applyEffectOperation(world, id, vit, operation, potency, stacks, key) {
    if (!vit) return;
    const amount = Math.max(0, potency * stacks);

    if (operation === 'damage') {
        dealDamage(world, {
            target: id,
            amount,
            type: effectKeyToType(key),
            cause: key || 'effect',
        });
        return;
    }

    if (operation === 'heal') {
        applyHealing(world, { target: id, amount, source: id, cause: key || 'effect' });
        return;
    }

    if (operation === 'stamina_restore') {
        const stam = world.get(id, Stamina);
        if (!stam) return;
        const passive = getPassiveBonuses(world, id);
        const maxBonus = Number(passive?.maxStaminaDerived ?? 0);
        const cap = stam.maxStamina + maxBonus;
        const before = stam.stamina;
        stam.stamina = Math.min(cap, stam.stamina + amount);
        const delta = stam.stamina - before;
        if (delta > 0) { world.emit('stamina_restored', { id, amount: delta }); }
    }

    if (operation === 'mana_restore') {
        const mana = world.get(id, Mana);
        if (!mana) return;
        const passive = getPassiveBonuses(world, id);
        const maxBonus = Number(passive?.maxManaDerived ?? 0);
        const cap = mana.maxMana + maxBonus;
        const before = mana.mana;
        mana.mana = Math.min(cap, mana.mana + amount);
        const delta = mana.mana - before;
        if (delta > 0) { world.emit('mana_restored', { id, amount: delta }); }
    }
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @param {any} effect
 * @returns {boolean}
 */
function applySpellEffectDamage(world, id, effect) {
    const spellDamage = (effect?.meta && typeof effect.meta === 'object') ? effect.meta.spellDamage : null;
    if (!spellDamage || typeof spellDamage !== 'object') return false;
    const key = String(effect?.key || '').toLowerCase();
    const amount = Math.max(0, (Number(effect?.potency) || 0) * Math.max(1, Number(effect?.stacks) || 1));
    if (!(amount > 0)) return true;
    dealDamage(world, buildSpellDamageSpecFromContext(world, id, {
        ...spellDamage,
        sourceId: Number(spellDamage?.sourceId ?? effect?.sourceId ?? 0) | 0,
        spellId: String(spellDamage?.spellId || effect?.spellId || key || 'spell'),
        cause: String(spellDamage?.cause || `spell:${String(effect?.spellId || key || 'effect')}`),
        type: String(spellDamage?.type || effectKeyToType(key)),
    }, {
        baseAmount: amount,
        salt: world.step ^ (Number(effect?.startedAtTurn || 0) << 8),
    }));
    return true;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @returns {(x:number, y:number) => boolean}
 */
function createLOSBlocker(world) {
    return blockedCallback(buildBlocksVisionMap(world));
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} casterId
 * @param {any} effect
 * @returns {"keep"|"remove"}
 */
function tickDrainLifeChannel(world, casterId, effect) {
    const ch = world.has(casterId, Channeling) ? world.get(casterId, Channeling) : null;
    if (!ch || String(ch.spellId || '') !== String(effect?.spellId || 'drain_life')) return 'remove';

    const casterPos = /** @type any */ (world.get(casterId, Position));
    const casterVit = /** @type any */ (world.get(casterId, Vitality));
    if (!casterPos || !casterVit || (casterVit.hp | 0) <= 0) return 'remove';

    const channel = effect?.meta?.channel || {};
    const targetId = Number(channel.targetId) | 0;
    const targetPos = /** @type any */ (world.get(targetId, Position));
    const targetVit = /** @type any */ (world.get(targetId, Vitality));
    if (!targetId || !targetPos || !targetVit || (targetVit.hp | 0) <= 0) return 'remove';

    const range = Math.max(1, Number(channel.range || 6) | 0);
    const isBlocked = createLOSBlocker(world);

    if (channel.breakOnMove) {
        const anchorX = Number(channel.anchorX) | 0;
        const anchorY = Number(channel.anchorY) | 0;
        if ((casterPos.x | 0) !== anchorX || (casterPos.y | 0) !== anchorY) {
            world.emit('spell:drain_life:break', {
                actor: casterId,
                targetId,
                spellId: effect?.spellId,
                reason: 'caster_moved',
            });
            return 'remove';
        }
    }

    if (channel.breakOnOutOfRange && chebyshev(casterPos, targetPos) > range) {
        world.emit('spell:drain_life:break', {
            actor: casterId,
            targetId,
            spellId: effect?.spellId,
            reason: 'out_of_range',
        });
        return 'remove';
    }

    if (channel.breakOnNoLos && !hasSpellLineOfSight(world, {
        sourceId: casterId,
        targetId,
        sourcePos: casterPos,
        targetPos,
        range,
        isBlocked,
    })) {
        world.emit('spell:drain_life:break', {
            actor: casterId,
            targetId,
            spellId: effect?.spellId,
            reason: 'blocked_los',
        });
        return 'remove';
    }

    const spellDamage = (effect?.meta && typeof effect.meta === 'object') ? effect.meta.spellDamage : null;
    const potency = Math.max(1, Number(effect?.potency || 1) | 0);
    const result = spellDamage
        ? dealDamage(world, buildSpellDamageSpecFromContext(world, targetId, {
            ...spellDamage,
            sourceId: Number(spellDamage?.sourceId ?? casterId) | 0,
            spellId: String(spellDamage?.spellId || effect?.spellId || 'drain_life'),
            cause: 'spell:drain_life:tick',
            type: 'shadow',
        }, {
            baseAmount: potency,
            salt: ((world.step | 0) ^ (casterId * 131) ^ (targetId * 977)) >>> 0,
        }))
        : dealDamage(world, {
            target: targetId,
            source: casterId,
            amount: potency,
            type: 'shadow',
            cause: 'spell:drain_life:tick',
        });

    if (result?.applied) {
        const healFraction = Math.max(0, Number(channel.healFraction || 0.75));
        const drained = Math.max(1, Number(result.amount || potency) | 0);
        const healAmount = Math.max(1, Math.floor(drained * healFraction));
        const appliedHeal = applyHealing(world, {
            target: casterId,
            amount: healAmount,
            source: casterId,
            cause: 'spell:drain_life:tick',
        }).amount;

        world.emit('spell:drain_life:tick', {
            actor: casterId,
            targetId,
            spellId: effect?.spellId,
            amount: drained,
            heal: appliedHeal,
            from: { x: casterPos.x | 0, y: casterPos.y | 0 },
            to: { x: targetPos.x | 0, y: targetPos.y | 0 },
        });
    }

    if (!result?.applied) {
        world.emit('spell:drain_life:break', {
            actor: casterId,
            targetId,
            spellId: effect?.spellId,
            reason: String(result?.reason || 'no_damage'),
        });
        return 'remove';
    }

    return 'keep';
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} casterId
 * @param {any} effect
 * @param {string} [reason]
 */
function stopDrainLifeChannel(world, casterId, effect, reason = 'ended') {
    if (!world.has(casterId, Channeling)) return;
    const ch = world.get(casterId, Channeling);
    if (String(ch?.spellId || '') !== String(effect?.spellId || 'drain_life')) return;
    try { world.remove(casterId, Channeling); } catch {}
    if (reason === 'duration_complete') {
        world.emit('channeling:complete', {
            actor: casterId,
            spellId: String(effect?.spellId || 'drain_life'),
        });
    } else {
        world.emit('channeling:cancelled', {
            actor: casterId,
            spellId: String(effect?.spellId || 'drain_life'),
            reason,
        });
    }
}

/**
 * effectSystem — per-tick effect resolver.
 * - Iterates entities with ActiveEffects
 * - Applies on-tick impacts (e.g., poison damage, regeneration)
 * - Derives Status from currently active effects (e.g., poisoned, burning)
 * - Expires effects when their turnsLeft reach 0
 */
export function effectSystem(world, dt = 1) {
    // A zero-delta tick is used by UI/debug wiring to flush projections. It
    // must not advance turn-based effects; otherwise repeated refresh ticks
    // can consume statuses without advancing the simulation.
    if (!(Number(dt) > 0)) return;

    /** @type {Array<{sourceId:number, effect:any}>} */
    const _pendingSwarmJumps = [];

    tickTopologyStatusDurations(world);

    for (const [id, ae] of world.query(ActiveEffects)) {
        if (!ae || !Array.isArray(ae.effects)) continue;
        compactDotEffects(ae.effects);
        if (ae.effects.length === 0) {
            // If no active effects, clear Status if present
            if (world.has(id, Status)) {
                try { world.set(id, Status, { statuses: [] }); } catch {} // ECS: component may not exist
            }
            continue;
        }

        // Ensure targets have Vitality/Status if needed
        let vit = world.get(id, Vitality);
        if (!vit) {
            // Add a default Vitality if missing to make effects universal
            try { world.add(id, Vitality, { maxHp: 10, hp: 10 }); } catch {} // ECS: may already exist
            vit = world.get(id, Vitality);
        }
        const hadStatus = world.has(id, Status);

        // Aggregate next Status view from active effects (kept in sync with effects)
        const nextStatuses = new Map(); // type -> { type, duration, potency, stacks }

        // Process effects (mutate in place); remove expired afterwards
        for (const e of ae.effects) {
            if (!e || typeof e !== 'object') continue;

            // Onset delay handling (optional field)
            if (Number.isInteger(e.onsetLeft) && e.onsetLeft > 0) {
                e.onsetLeft -= 1;
                continue;
            }

            // Stat envelope effect (temporal stat pressure: ramp-in / hold / ramp-out)
            if (e.key === 'stat_envelope') {
                if (!Number.isInteger(e.turnsLeft) || e.turnsLeft < 0) e.turnsLeft = 0;
                processStatEnvelopeEffect(world, id, e, nextStatuses);
                e.turnsLeft -= 1;
                continue;
            }

            if (String(e.key || '').toLowerCase() === 'drain_life_channel') {
                if (!Number.isInteger(e.turnsLeft) || e.turnsLeft < 0) e.turnsLeft = 0;
                const mode = tickDrainLifeChannel(world, id, e);
                if (mode === 'remove') {
                    stopDrainLifeChannel(world, id, e, 'channel_broken');
                    e.turnsLeft = 0;
                    continue;
                }
                e.turnsLeft -= 1;
                continue;
            }

            // Defensive defaults
            e.turnsLeft = Number.isInteger(e.turnsLeft) ? e.turnsLeft : 0;
            const stacks = (e.stacks && e.stacks > 0) ? e.stacks : 1;
            const potency = (typeof e.potency === 'number') ? e.potency : 1;
            const key = String(e.key || '').toLowerCase();
            const def = EFFECTS_BY_KEY[key];

            if (def) {
                const operations = Array.isArray(def.operations) && def.operations.length > 0 ? def.operations : [def.operation];
                for (let oi = 0; oi < operations.length; oi++) {
                    const operation = String(operations[oi] || 'none');
                    const handledBySpellDamage = (operation === 'damage') && applySpellEffectDamage(world, id, e);
                    if (!handledBySpellDamage) {
                        applyEffectOperation(world, id, vit, operation, potency, stacks, key);
                    }
                }
                for (let i = 0; i < def.statuses.length; i++) {
                    const statusType = String(def.statuses[i] || '');
                    if (!statusType) continue;
                    upsertStatus(nextStatuses, {
                        type: statusType,
                        duration: e.turnsLeft,
                        potency,
                        stacks,
                    });
                }
            } else {
                // Fallback: optional callback dispatch by name (future-friendly)
                if (e.cbKey && typeof effectCallbacks[e.cbKey] === 'function') {
                    try { effectCallbacks[e.cbKey]({ world, id, e, vit, statusMap: nextStatuses }); } catch (err) { console.error('[effectSystem] callback "' + e.cbKey + '" failed:', err); }
                }
                // Unknown types still tick down but do nothing by default
            }

            // Age the effect at the end of its tick
            e.turnsLeft -= 1;

            // ── Swarm jump: every jumpInterval ticks, spread to a nearby enemy ──
            if (key === 'swarm' && e.meta?.jumpInterval && e.meta?.jumpsLeft > 0) {
                const elapsed = (Number(e.meta.startTurns || 0) || (e.turnsLeft + 1)) - e.turnsLeft;
                if (!e.meta.startTurns) e.meta.startTurns = e.turnsLeft + 1;
                if (elapsed > 0 && elapsed % e.meta.jumpInterval === 0) {
                    _pendingSwarmJumps.push({ sourceId: id, effect: e });
                }
            }
        }

        // Destroy DerivedExpression entities owned by expiring effects
        for (let ei = 0; ei < ae.effects.length; ei++) {
            const ex = ae.effects[ei];
            if (!ex) continue;
            const tl = Number.isInteger(ex.turnsLeft) ? ex.turnsLeft : 0;
            if (tl > 0) continue;
            if (Number.isInteger(ex.onsetLeft) && ex.onsetLeft > 0) continue;
            const exprId = ex?.meta?.exprEntityId;
            if (typeof exprId === 'number' && exprId > 0) {
                try { world.destroy(exprId); } catch {}
            }
        }

        // Cull expired effects
        ae.effects = ae.effects.filter((e) => (
            (e && Number.isInteger(e.turnsLeft) ? e.turnsLeft : 0) > 0
            || (Number.isInteger(e.onsetLeft) && e.onsetLeft > 0)
        ));

        // Sync Status with active effects snapshot
        const statuses = Array.from(nextStatuses.values())
            .map((s) => ({
                type: s.type,
                duration: Math.max(0, ~~s.duration),
                potency: s.potency,
                stacks: s.stacks,
            }))
            .filter((s) => s.duration > 0);
        try {
            if (hadStatus || world.has(id, Status)) world.set(id, Status, { statuses });
            else world.add(id, Status, { statuses });
        } catch { /* deferred during tick; will flush post-tick */ }
    }

    // ── Process pending swarm jumps ─────────────────────────────────────
    if (_pendingSwarmJumps.length > 0) {
        _processSwarmJumps(world, _pendingSwarmJumps);
    }
}

function tickTopologyStatusDurations(world) {
    for (const [nodeId, duration] of world.query(Duration)) {
        if (!world.has(nodeId, StatusEffectNode) && !world.has(nodeId, TimedEffectNode)) continue;
        if (!duration) continue;

        const onsetLeft = Number(duration.onsetLeft || 0) | 0;
        if (duration.turnsLeft === Infinity) continue;
        const turnsLeft = Number(duration.turnsLeft || 0) | 0;
        if (onsetLeft > 0) {
            world.set(nodeId, Duration, { ...duration, onsetLeft: Math.max(0, onsetLeft - 1) });
            continue;
        }
        if (turnsLeft > 0) {
            world.set(nodeId, Duration, { ...duration, turnsLeft: Math.max(0, turnsLeft - 1) });
        }
    }
}

/** @param {import('../../lib/ecs-js/index.js').World} world */
function _processSwarmJumps(world, jumps) {
    const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

    for (const { sourceId, effect } of jumps) {
        const spos = world.get(sourceId, Position);
        if (!spos) continue;
        const radius = Number(effect.meta?.jumpRadius || 6);

        // Find nearest living hostile without an active swarm effect
        // Use spatial index to avoid scanning all entities in the world
        let bestId = 0, bestD2 = Infinity;
        forEachInRadius(world, spos.x, spos.y, radius, (cid, cp) => {
            if (cid === sourceId) return;
            const vit = world.get(cid, Vitality);
            if (!vit || (vit.hp | 0) <= 0) return;
            const fac = world.get(cid, /** @type any */ (Faction));
            if (!fac || !areFactionsHostile('player', String(fac.key || ''))) return;
            const cdist2 = d2(spos.x, spos.y, cp.x, cp.y);
            if (cdist2 > radius * radius || cdist2 >= bestD2) return;
            // Skip if already swarmed
            const cae = world.get(cid, ActiveEffects);
            if (cae && Array.isArray(cae.effects) && cae.effects.some(e => e && e.key === 'swarm' && e.turnsLeft > 0)) return;
            bestId = cid;
            bestD2 = cdist2;
        });
        if (!bestId) continue;

        // Clone the swarm effect onto the new target
        const jumpEffect = {
            key: 'swarm',
            turnsLeft: Math.max(1, effect.turnsLeft),
            potency: effect.potency || 1,
            stacks: 1,
            startedAtTurn: world.step,
            sourceId: effect.sourceId,
            spellId: effect.spellId,
            meta: {
                ...(effect.meta || {}),
                spellDamage: effect.meta?.spellDamage || null,
                jumpInterval: effect.meta.jumpInterval,
                jumpRadius: effect.meta.jumpRadius,
                jumpsLeft: Math.max(0, (effect.meta.jumpsLeft || 0) - 1),
                startTurns: null,
            },
        };

        // Decrement jumps on the source effect
        effect.meta.jumpsLeft = Math.max(0, (effect.meta.jumpsLeft || 0) - 1);

        const tae = world.get(bestId, ActiveEffects);
        if (tae && Array.isArray(tae.effects)) {
            tae.effects.push(jumpEffect);
        } else {
            try { world.add(bestId, ActiveEffects, { effects: [jumpEffect] }); } catch {}
        }

        const tpos = world.get(bestId, Position);
        world.emit('spell:plague_swarm:jump', {
            sourceId,
            targetId: bestId,
            from: { x: spos.x, y: spos.y },
            to: { x: tpos?.x || 0, y: tpos?.y || 0 },
        });
    }
}

// ===== helpers =====
function upsertStatus(map, rec) {
    const k = rec.type;
    const cur = map.get(k);
    if (!cur) { map.set(k, { ...rec }); return; }
    // Merge: keep max duration, max potency, add stacks
    cur.duration = Math.max(cur.duration ?? 0, rec.duration ?? 0);
    cur.potency = Math.max(cur.potency ?? 0, rec.potency ?? 0);
    cur.stacks = Math.max(cur.stacks ?? 1, rec.stacks ?? 1);
}

// Optional callback registry for script-driven effects
const effectCallbacks = Object.create(null);
export function registerEffectCallback(key, fn) { if (key) effectCallbacks[key] = fn; }

/**
 * Process one tick of a 'stat_envelope' effect.
 *
 * - Reports 'blinded' status when a visionRange envelope is reducing vision below its start value.
 * - On the final tick (turnsLeft will reach 0 after decrement), applies permanent injury to
 *   Brain.visionRange when endValue !== startValue — this models lasting damage from the effect.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 * @param {any} e
 * @param {Map<string,any>} nextStatuses
 */
function processStatEnvelopeEffect(world, entityId, e, nextStatuses) {
    const rampIn  = Number(e.rampIn  || 0);
    const hold    = Number(e.hold    || 0);
    const rampOut = Number(e.rampOut || 0);
    const totalTicks = rampIn + hold + rampOut;
    const turnsLeft  = Number.isInteger(e.turnsLeft) ? e.turnsLeft : 0;
    // Use elapsed+1 so the effect starts on the tick it is processed, consistent
    // with how getEffectiveVisionRange reads the post-decrement turnsLeft.
    const elapsed    = totalTicks - turnsLeft + 1;

    const startValue = Number(e.startValue ?? 0);
    const toValue    = Number(e.toValue    ?? 0);
    const endValue   = Number(e.endValue   ?? startValue);

    const currentValue = computeEnvelopeValue(startValue, toValue, endValue, rampIn, hold, rampOut, elapsed);

    if (e.stat === 'visionRange') {
        // Report blinded status whenever the envelope is actively reducing vision
        if (currentValue < startValue) {
            upsertStatus(nextStatuses, {
                type: 'blinded',
                duration: turnsLeft,
                potency: Math.max(0, startValue - currentValue),
                stacks: 1,
            });
        }

        // Apply permanent injury on the final tick (turnsLeft will become 0 after decrement)
        if (turnsLeft === 1 && endValue !== startValue) {
            const brain = world.get(entityId, Brain);
            if (brain) brain.visionRange = Math.max(0, Math.round(endValue));
        }
    } else if (e.stat === 'hearingImpairment') {
        // Report deafened status whenever impairment > 0
        // potency reflects severity (0–1); 0 = no impairment, 1 = completely deaf
        if (currentValue > 0) {
            upsertStatus(nextStatuses, {
                type: 'deafened',
                duration: turnsLeft,
                potency: Math.max(0, currentValue),
                stacks: 1,
            });
        }
        // No permanent hearing injury applied per design.
    }
}
