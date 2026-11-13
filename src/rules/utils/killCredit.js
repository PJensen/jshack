import { Owner } from "../components/Owner.js";
import { Player } from "../components/Player.js";
import { DeathApplied } from "../components/DeathApplied.js";

/**
 * Resolve an attacking entity to the player who should receive kill credit.
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} killerId
 * @returns {number}
 */
export function resolvePlayerKillCredit(world, killerId) {
  const id = Number(killerId || 0) | 0;
  if (id > 0 && world.has(id, Player)) return id;
  const ownerId = Number(world.get(id, Owner)?.ownerId || 0) | 0;
  return ownerId > 0 && world.has(ownerId, Player) ? ownerId : 0;
}

/**
 * Invoke a callback once for every death credited to a player this step.
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {(death: object, playerId: number) => void} callback
 */
export function forEachPlayerKill(world, callback) {
  for (const [, death] of world.query(DeathApplied)) {
    const playerId = resolvePlayerKillCredit(world, death.killer);
    if (!playerId) continue;
    callback(death, playerId);
  }
}
