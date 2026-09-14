import { KnockbackPending } from "../components/KnockbackPending.js";
import { Position } from "../components/Position.js";
import { isWalkable } from "../environment/dungeon/tileMap.js";
import { getTileQuerySnapshot } from "../utils/tileQueryCache.js";
import { statusStrength } from "../utils/statusFacade.js";

/**
 * Resolves pending knockback vectors into grid movement.
 *
 * Phase: intents (registered before movementSystem so knockback positions
 * are committed before the spatial index and blocking set are used by
 * movement resolution this tick).
 *
 * Each step of force attempts one tile of movement in (dx, dy).
 * Stops on the first blocked tile (solid terrain or solid entity).
 * Emits "moved" for each tile displaced and "knockback:stopped" if a
 * blocker was hit before force was exhausted.
 *
 * Consumes (removes) KnockbackPending after resolution.
 */
export function knockbackSystem(world) {
  const tiles = getTileQuerySnapshot(world);

  for (const [id, pos, kb] of world.query(Position, KnockbackPending)) {
    if (statusStrength(world, id, "stasis") > 0) {
      try { world.remove(id, KnockbackPending); } catch { /* */ }
      continue;
    }

    const dx    = Math.sign(kb.dx | 0);
    const dy    = Math.sign(kb.dy | 0);
    const force = Math.max(1, Math.min(5, kb.force | 0));

    let startX = pos.x | 0;
    let startY = pos.y | 0;
    let curX   = startX;
    let curY   = startY;
    let hitBlocker = false;

    for (let step = 0; step < force; step++) {
      const nx = curX + dx;
      const ny = curY + dy;
      const k  = `${nx},${ny}`;

      if (!isWalkable(nx, ny) || tiles.blockedByCell.has(k)) {
        hitBlocker = true;
        break;
      }

      curX = nx;
      curY = ny;
    }

    if (curX !== startX || curY !== startY) {
      const from = { x: startX, y: startY };
      const to   = { x: curX,   y: curY   };
      world.set(id, Position, to);
      world.emit("moved", { id, from, to });
    }

    if (hitBlocker) {
      world.emit("knockback:stopped", {
        id,
        at: { x: curX, y: curY },
        blockedAt: { x: curX + dx, y: curY + dy },
      });
    }

    try { world.remove(id, KnockbackPending); } catch { /* */ }
  }
}
