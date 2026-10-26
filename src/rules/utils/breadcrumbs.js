import { Position } from "../components/Position.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Lifespan } from "../components/Lifespan.js";
import { LightEmitter } from "../components/LightEmitter.js";
import { InvestigationSignal, Breadcrumb } from "../components/InvestigationSignal.js";
import { findNearestValidTileAround } from "./queries.js";

/** Create one short-lived, visible trail marker with a reusable investigation signal. */
export function leaveBreadcrumb(world, { actorId, itemId, x, y, kind = "trail" }) {
  if (!world || !world.isAlive(actorId) || !world.isAlive(itemId)) return 0;
  const point = { x: Number.isFinite(x) ? x | 0 : 0, y: Number.isFinite(y) ? y | 0 : 0 };
  const createdAt = world.step | 0;
  const id = world.create();
  world.add(id, Position, point);
  world.add(id, NamedIdentity, { identity: "breadcrumb", name: "Enchanted Breadcrumb" });
  world.add(id, Breadcrumb, { sourceActorId: actorId, sourceItemId: itemId, kind, createdAt });
  world.add(id, InvestigationSignal, {
    range: 8,
    priority: 1,
    createdAt,
    sourceActorId: actorId,
    sourceItemId: itemId,
    kind: "trail_lure",
  });
  world.add(id, LightEmitter, {
    radius: 1.25,
    baseColor: "#f3c86a",
    temporalPattern: "biolum",
    shadowSoftness: 8,
    intensityScale: 0.45,
  });
  world.add(id, Lifespan, { turnsLeft: 8 });
  return id;
}

/** Scatter a small trail around the wearer, skipping blocked or duplicate tiles. */
export function scatterBreadcrumbs(world, actorId, itemId, count = 4) {
  const origin = world.get(actorId, Position);
  if (!origin) return 0;
  const anchors = [
    { x: origin.x + 2, y: origin.y },
    { x: origin.x - 2, y: origin.y },
    { x: origin.x, y: origin.y + 2 },
    { x: origin.x, y: origin.y - 2 },
  ];
  const placed = [];
  const total = Math.max(0, Math.min(4, Number(count) | 0));
  for (let i = 0; i < total; i++) {
    const point = findNearestValidTileAround(world, anchors[i], { maxDistance: 1, exclude: placed });
    if (!point) continue;
    const id = leaveBreadcrumb(world, { actorId, itemId, ...point, kind: "scatter" });
    if (id > 0) placed.push(point);
  }
  return placed.length;
}
