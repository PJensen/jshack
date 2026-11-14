// staminaRegenerationSystem.js
// Regenerate stamina each turn using base regen + derived bonuses from equipment/status
import { Stamina } from '../components/Stamina.js';
import { resolveResourceStats } from '../utils/resourceStats.js';

/**
 * Regenerate stamina each turn based on base rate plus equipment bonuses.
 * Caps at effective max stamina (base + equipment bonuses).
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function staminaRegenerationSystem(world) {
  for (const [entity, staminaComp] of world.query(Stamina)) {
    if (!staminaComp) continue;

    // Cooldown: skip regen on turns where stamina was spent.
    // Direct mutation — world.set() defers during ticks and would
    // spread stale values, clobbering combat/dig deductions.
    const cd = Number(staminaComp.regenCooldown ?? 0);
    if (cd > 0) {
      staminaComp.regenCooldown = cd - 1;
      continue;
    }

    const resource = resolveResourceStats(world, entity, "stamina");
    if (!resource) continue;

    if (resource.current < resource.max) {
      staminaComp.stamina = Math.min(resource.max, staminaComp.stamina + resource.effectiveRecovery);
    }
  }
}
