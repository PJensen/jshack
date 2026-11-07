import { Equipment } from "../components/Equipment.js";
import { effectStrength } from "./statusFacade.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { Position } from "../components/Position.js";
import { getNormalizedEntityFacing } from "./facing.js";

export const POSITION_RELATIONS = Object.freeze({
  front: "front",
  flank: "flank",
  rear: "rear",
  unknown: "unknown",
});

function normalizeDamageType(type) {
  const value = String(type || "physical").toLowerCase();
  if (value === "blunt" || value === "slash" || value === "pierce" || value === "physical") return value;
  return value;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} attackerId
 * @param {number} defenderId
 */
export function getRelativeAttackRelation(world, attackerId, defenderId) {
  const attacker = Number(attackerId || 0) | 0;
  const defender = Number(defenderId || 0) | 0;
  if (!(attacker > 0) || !(defender > 0)) return POSITION_RELATIONS.unknown;
  const apos = world.get(attacker, Position);
  const dpos = world.get(defender, Position);
  if (!apos || !dpos) return POSITION_RELATIONS.unknown;
  const facing = getNormalizedEntityFacing(world, defender);
  if (!facing) return POSITION_RELATIONS.unknown;

  const vx = Math.sign((apos.x | 0) - (dpos.x | 0));
  const vy = Math.sign((apos.y | 0) - (dpos.y | 0));
  if (vx === 0 && vy === 0) return POSITION_RELATIONS.unknown;
  const dot = (facing.dx * vx) + (facing.dy * vy);
  if (dot <= -1) return POSITION_RELATIONS.rear;
  if (dot === 0) return POSITION_RELATIONS.flank;
  return POSITION_RELATIONS.front;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} attackerId
 * @param {number} defenderId
 */
export function getPositionalAttackBonus(world, attackerId, defenderId) {
  const relation = getRelativeAttackRelation(world, attackerId, defenderId);
  if (relation === POSITION_RELATIONS.rear) {
    return { relation, attackBonus: 2, damageMult: 1.35 };
  }
  if (relation === POSITION_RELATIONS.flank) {
    return { relation, attackBonus: 1, damageMult: 1.15 };
  }
  return { relation, attackBonus: 0, damageMult: 1 };
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} defenderId
 */
export function hasOffhandShield(world, defenderId) {
  const defender = Number(defenderId || 0) | 0;
  if (!(defender > 0) || !world?.isAlive?.(defender)) return false;
  const eq = world.get(defender, Equipment);
  const offhandId = Number(eq?.offhand || 0) | 0;
  if (!(offhandId > 0) || !world.isAlive(offhandId)) return false;
  const info = world.get(offhandId, ItemInfo);
  if (!info) return false;
  const slot = String(info.slot || "").toLowerCase();
  const subtype = String(info.subtype || "").toLowerCase();
  if (subtype === "shield") return true;
  return slot === "offhand" && !info.damageDice;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} attackerId
 * @param {number} defenderId
 * @param {string} damageType
 */
export function getShieldArcMultiplier(world, attackerId, defenderId, damageType) {
  const relation = getRelativeAttackRelation(world, attackerId, defenderId);
  if (relation !== POSITION_RELATIONS.front) return 1;
  const type = normalizeDamageType(damageType);
  if (type !== "physical" && type !== "blunt" && type !== "slash" && type !== "pierce") return 1;
  if (!hasOffhandShield(world, defenderId) && effectStrength(world, defenderId, "divine_shield") <= 0) return 1;
  return 0.8;
}
