import { DungeonState } from '../components/DungeonState.js';
import { Player } from '../components/Player.js';
import { Score } from '../components/Score.js';
import { Vitality } from '../components/Vitality.js';
import { forEachPlayerKill } from '../utils/killCredit.js';

/**
 * Award the dead entity's maxHp to the player's score,
 * multiplied by the current floor depth.
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function scoreSystem(world) {
  forEachPlayerKill(world, (death, killer) => {
    const id = Number(death.target || 0) | 0;
    // Don't score the player's own death
    if (world.has(id, Player)) return;

    const vit = world.get(id, Vitality);
    if (!vit) return;

    const score = world.get(killer, Score);
    if (!score) return;

    let depth = 1;
    for (const [, ds] of world.query(DungeonState)) { depth = ds.currentDepth || 1; break; }

    score.current += vit.maxHp * depth;
  });
}
