// rules/utils/speedGate.js
// Canonical speed-gating check shared by all AI systems.

import { Speed } from "../components/Speed.js";
import { statusStrength } from "./statusFacade.js";

/**
 * Returns true when the entity is allowed to act this tick.
 * Accounts for base speed cadence, frozen-status slow, and hastened buff.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @returns {boolean}
 */
export function canActThisTurn(world, id) {
  // Stasis is an absolute action lock, not a cadence modifier. Keep this
  // gate authoritative for every AI producer so direct AI callbacks (for
  // example LOS abilities) cannot act before intent validation runs.
  if (statusStrength(world, id, "stasis") > 0) return false;

  const spd = world.get(id, Speed);
  let actEvery = (spd && spd.actEvery > 1) ? spd.actEvery : 1;
  const frostStacks = Math.min(3, statusStrength(world, id, "frozen"));
  if (frostStacks > 0) actEvery = actEvery * (1 + frostStacks);
  const hasteStacks = Math.min(3, statusStrength(world, id, "hastened"));
  if (hasteStacks > 0 && actEvery > 1) actEvery = Math.max(1, actEvery - hasteStacks);
  return !(actEvery > 1 && ((world.step + id) % actEvery) !== 0);
}
