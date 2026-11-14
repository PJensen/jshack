import { Mana } from '../components/Mana.js';
import { resolveResourceStats } from '../utils/resourceStats.js';


/**
 * Increment mana up to maxMana using the component's manaRegen rate
 * plus any equipment-derived mana regen bonus.
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function manaRegenerationSystem(world) {
    for (const [entity, manaComp] of world.query(Mana)) {
        if (!manaComp) continue;

        // Cooldown: skip regen on turns where mana was spent
        const cd = Number(manaComp.regenCooldown ?? 0);
        if (cd > 0) {
            manaComp.regenCooldown = cd - 1;
            continue;
        }

        const resource = resolveResourceStats(world, entity, "mana");
        if (!resource) continue;

        if (resource.current < resource.max) {
            manaComp.mana = Math.min(resource.max, manaComp.mana + resource.effectiveRecovery);
        }
    }
}
