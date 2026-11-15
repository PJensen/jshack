import { ItemInfo } from "../components/ItemInfo.js";
import { Equipment } from "../components/Equipment.js";
import { Player } from "../components/Player.js";
import { resolveCombatSnapshot } from "./resolveCombatSnapshot.js";

/**
 * Parse a positive NdM dice specification.
 * @param {unknown} spec
 * @returns {{ count:number, sides:number }|null}
 */
export function parseDamageDice(spec) {
  const match = /^\s*(\d+)d(\d+)\s*$/i.exec(String(spec || ""));
  if (!match) return null;
  const count = Math.max(1, Number(match[1]) | 0);
  const sides = Math.max(2, Number(match[2]) | 0);
  return { count, sides };
}

/**
 * Return the exact sum distribution for a dice spec without consuming RNG.
 * @param {unknown} spec
 * @returns {Map<number, number>}
 */
export function damageDiceDistribution(spec) {
  const parsed = parseDamageDice(spec);
  if (!parsed) return new Map();

  let distribution = new Map([[0, 1]]);
  for (let die = 0; die < parsed.count; die++) {
    const next = new Map();
    for (const [sum, occurrences] of distribution) {
      for (let face = 1; face <= parsed.sides; face++) {
        next.set(sum + face, Number(next.get(sum + face) || 0) + occurrences);
      }
    }
    distribution = next;
  }
  return distribution;
}

/**
 * Calculate expected damage while preserving the actual integer pipeline.
 * The transform is evaluated for every possible dice result, so floor/clamp
 * ordering does not get replaced by applying a transform to the mean roll.
 *
 * @param {unknown} spec
 * @param {{ flatBonus?:number, baseMultiplier?:number, positionalMultiplier?:number, damageMultiplier?:number, minimumDamage?:number, applyDamageMultiplier?:boolean }} [options]
 */
export function expectedDamageFromDice(spec, options = {}) {
  const distribution = damageDiceDistribution(spec);
  if (distribution.size <= 0) {
    return Object.freeze({ diceAverage: 0, expectedDamage: 0, displayedDamage: 0, outcomes: 0 });
  }

  const flatBonus = Number(options.flatBonus || 0);
  const baseMultiplier = Number.isFinite(Number(options.baseMultiplier)) ? Number(options.baseMultiplier) : 1;
  const positionalMultiplier = Number.isFinite(Number(options.positionalMultiplier)) ? Number(options.positionalMultiplier) : 1;
  const damageMultiplier = Number.isFinite(Number(options.damageMultiplier)) ? Number(options.damageMultiplier) : 1;
  const minimumDamage = Math.max(0, Number(options.minimumDamage || 0));
  const applyDamageMultiplier = options.applyDamageMultiplier !== false;
  let totalWeight = 0;
  let totalDamage = 0;
  let totalRoll = 0;

  for (const [roll, weight] of distribution) {
    let damage = Math.max(minimumDamage, Math.floor((roll + flatBonus) * baseMultiplier));
    damage = Math.max(minimumDamage, Math.floor(damage * positionalMultiplier));
    if (applyDamageMultiplier && damageMultiplier > 1) {
      damage = Math.max(1, Math.floor(damage * damageMultiplier));
    }
    totalWeight += weight;
    totalRoll += roll * weight;
    totalDamage += damage * weight;
  }

  const expectedDamage = totalWeight > 0 ? totalDamage / totalWeight : 0;
  const diceAverage = totalWeight > 0 ? totalRoll / totalWeight : 0;
  return Object.freeze({
    diceAverage,
    expectedDamage,
    displayedDamage: Math.max(0, Math.round(expectedDamage)),
    outcomes: totalWeight,
  });
}

/**
 * Resolve ordinary successful-hit weapon damage for presentation.
 * This intentionally excludes hit chance, target mitigation, criticals,
 * proc damage, and target-specific conditional outcomes.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} attackerId
 * @param {number} weaponId
 * @param {{ mode?: "melee"|"ranged" }} [context]
 */
export function resolveExpectedWeaponDamage(world, attackerId, weaponId, context = {}) {
  const actor = Number(attackerId || 0) | 0;
  const itemId = Number(weaponId || 0) | 0;
  const mode = String(context.mode || "melee").toLowerCase() === "ranged" ? "ranged" : "melee";
  const eq = world.get(actor, Equipment);
  const info = itemId > 0 ? world.get(itemId, ItemInfo) : null;
  const dice = String(info?.damageDice || (world.has(actor, Player) ? "1d2" : (eq?.naturalDamageDice || "1d8")));
  const snapshot = resolveCombatSnapshot(world, actor, { mode });
  const minimumDamage = mode === "ranged" ? 1 : 0;
  return Object.freeze({
    mode,
    weaponId: itemId,
    damageDice: dice,
    ...expectedDamageFromDice(dice, {
      flatBonus: snapshot?.damageFlatBonus,
      damageMultiplier: mode === "melee" ? snapshot?.damageMult : 1,
      minimumDamage,
      applyDamageMultiplier: mode === "melee",
    }),
  });
}
