// src/rules/utils/blind.js
// Temporal stat envelope for the vision stat.
// Implements a ramp-in / hold / ramp-out modifier that drives effective vision range
// without mutating the base Brain.visionRange value.
//
// Spell surface:
//   blind(world, target, toValue, rampIn, holdFor, rampOut, endValue?)
//
// The modifier is stored as a 'stat_envelope' entry in ActiveEffects.
// getEffectiveVisionRange() computes the canonical read of the vision stat,
// including any active envelope modifiers.

import { Brain } from '../components/Brain.js';
import { ActiveEffects } from '../components/ActiveEffects.js';
import { getPassiveBonuses } from './passiveBonuses.js';
import { ensureActiveEffects } from './effects.js';
export { computeEnvelopeValue } from '../../shared/math/envelope.js';
import { computeEnvelopeValue } from '../../shared/math/envelope.js';

/**
 * Sum the vision modifiers contributed by all active stat_envelope effects
 * that target the 'visionRange' stat on an entity.
 *
 * The modifier = currentEnvelopeValue - startValue.
 * Callers add this to the base vision to get the effective value.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 * @returns {number}
 */
export function computeVisionEnvelopeModifier(world, entityId) {
  const ae = world.get(entityId, ActiveEffects);
  if (!ae?.effects?.length) return 0;

  let total = 0;
  for (const e of ae.effects) {
    if (!e) continue;
    const ownedVisionMeta = e.meta && typeof e.meta === 'object' && Number.isFinite(Number(e.meta.visionRampIn)) ? e.meta : null;
    if (e.key !== 'stat_envelope' && !ownedVisionMeta) continue;
    if (e.key === 'stat_envelope' && e.stat !== 'visionRange') continue;
    const rampIn  = Number(ownedVisionMeta?.visionRampIn ?? e.rampIn ?? 0);
    const hold    = Number(ownedVisionMeta?.visionHold ?? e.hold ?? 0);
    const rampOut = Number(ownedVisionMeta?.visionRampOut ?? e.rampOut ?? 0);
    const totalTicks = rampIn + hold + rampOut;
    // Use elapsed+1 so a newly applied envelope is visible immediately on read.
    // This mirrors effectSystem's processing semantics and avoids a one-turn
    // perceived delay between application and gameplay/UI impact.
    const elapsed = totalTicks - (Number.isInteger(e.turnsLeft) ? e.turnsLeft : 0) + 1;
    const envelopeValue = computeEnvelopeValue(
      Number(ownedVisionMeta?.visionStart ?? e.startValue ?? 0),
      Number(ownedVisionMeta?.visionTo ?? e.toValue ?? 0),
      Number(ownedVisionMeta?.visionEnd ?? e.endValue ?? e.startValue ?? 0),
      rampIn, hold, rampOut, elapsed
    );
    total += envelopeValue - Number(ownedVisionMeta?.visionStart ?? e.startValue ?? 0);
  }
  return total;
}

/**
 * Canonical effective vision range for an entity.
 * Combines brain base, passive (equipment) bonuses, and any active envelope modifiers.
 * Always ≥ 0.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 * @returns {number}
 */
export function getEffectiveVisionRange(world, entityId) {
  const id = Number(entityId || 0) | 0;
  if (!(id > 0)) return 0;

  const brain   = world.get(id, Brain);
  const passive = getPassiveBonuses(world, id);
  const base    = Number(brain?.visionRange ?? 8);
  const equip   = Number(passive?.visionRangeDerived ?? 0);
  const modifier = computeVisionEnvelopeModifier(world, id);

  return Math.max(0, base + equip + modifier);
}

/**
 * Apply a temporal vision-pressure effect to a target entity.
 * Captures the current effective vision as startValue unless overridden via opts.
 *
 * Signature mirrors the issue spec:
 *   blind(world, target, toValue, rampIn, holdFor, rampOut, endValue?)
 *
 * endValue defaults to startValue (full recovery after ramp-out).
 * To model permanent damage: pass endValue !== startValue with rampOut = 0.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} targetId
 * @param {number} toValue    minimum vision reached at end of ramp-in / during hold
 * @param {number} rampIn     ticks to reach toValue
 * @param {number} holdFor    ticks to hold at toValue
 * @param {number} rampOut    ticks to recover from toValue to endValue
 * @param {number} [endValue] final value after recovery; defaults to captured startValue
 * @param {{ stack?: boolean }} [opts]  stack:true updates an existing visionRange envelope (deepens toValue, resets duration) instead of pushing a new one
 * @returns {boolean} false if the target has no ActiveEffects component and one could not be added
 */
export function blind(world, targetId, toValue, rampIn, holdFor, rampOut, endValue = undefined, opts = {}) {
  const id = Number(targetId || 0) | 0;
  if (!(id > 0)) return false;

  const totalTicks = (rampIn | 0) + (holdFor | 0) + (rampOut | 0);
  if (!(totalTicks > 0)) return false;

  // Capture current effective vision as start value
  const startValue = getEffectiveVisionRange(world, id);
  const resolvedEndValue = (endValue !== undefined) ? endValue : startValue;

  let ae = ensureActiveEffects(world, id);
  if (!ae) return false;

  if (opts.stack) {
    const existing = ae.effects.find(e => e && e.key === 'stat_envelope' && e.stat === 'visionRange');
    if (existing) {
      existing.startValue = startValue;
      existing.toValue    = Math.min(Number(existing.toValue), Number(toValue));
      existing.endValue   = resolvedEndValue;
      existing.rampIn     = rampIn  | 0;
      existing.hold       = holdFor | 0;
      existing.rampOut    = rampOut | 0;
      existing.turnsLeft  = totalTicks;
      return true;
    }
  }

  ae.effects.push({
    key: 'stat_envelope',
    stat: 'visionRange',
    turnsLeft: totalTicks,
    potency: 1,
    startValue,
    toValue: Number(toValue),
    endValue: resolvedEndValue,
    rampIn:  rampIn  | 0,
    hold:    holdFor | 0,
    rampOut: rampOut | 0,
  });
  return true;
}
