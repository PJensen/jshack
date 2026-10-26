import { Position } from "../components/Position.js";
import { Vitality } from "../components/Vitality.js";
import { entitiesAtPoint } from "./spatialIndex.js";
import { bresenhamLine } from "../../shared/math/bresenham.js";

/**
 * Resolve the first physical projectile collision along a grid ray.
 * Actors are considered before walls on a tile so NPCs are always physical
 * projectile collisions, including friendly and neutral actors.
 */
export function resolveProjectileImpact(world, from, to, isBlocked, sourceId = 0) {
  const x0 = Number(from?.x) | 0;
  const y0 = Number(from?.y) | 0;
  const x1 = Number(to?.x) | 0;
  const y1 = Number(to?.y) | 0;

  for (const [x, y] of bresenhamLine(x0, y0, x1, y1)) {
    const ids = entitiesAtPoint(world, x, y);
    for (const id of ids) {
      if ((id | 0) === (sourceId | 0)) continue;
      const vit = world.get(id, Vitality);
      if (!vit || (Number(vit.hp) | 0) <= 0) continue;
      return { kind: "actor", actorId: id | 0, x: x | 0, y: y | 0 };
    }
    if (isBlocked(x, y)) return { kind: "wall", actorId: 0, x: x | 0, y: y | 0 };
  }

  return { kind: "ground", actorId: 0, x: x1, y: y1 };
}

