import { Brain } from "../components/Brain.js";
import { Faction } from "../components/Faction.js";
import { Position } from "../components/Position.js";
import { Vitality } from "../components/Vitality.js";
import { hasLOS } from "../../shared/math/gridLOS.js";
import { hasOverworldAerialLOS } from "./flyingEligibility.js";
import { areFactionsHostile } from "./factionHostility.js";
import { forEachInRadius } from "./spatialIndex.js";
import { buildBlocksVisionMap, blockedCallback } from "./vision.js";
import { getEffectiveVisionRange } from "./blind.js";
import { sleepPreventsPerception } from "./sleep.js";

/**
 * Shared brain-backed sight query for actor cognition.
 * Returns null if the actor has no Brain: sight-based decisions should not
 * silently fall back to omniscience.
 *
 * @param {any} world
 * @param {number} actorId
 * @param {number} targetId
 * @param {{ isBlocked?: (x:number, y:number)=>boolean }} [opts]
 * @returns {{ id:number, x:number, y:number, dist:number } | null}
 */
export function perceiveEntity(world, actorId, targetId, opts = {}) {
  const actor = Number(actorId || 0) | 0;
  const target = Number(targetId || 0) | 0;
  if (!(actor > 0) || !(target > 0) || actor === target) return null;
  if (!world.has(actor, Brain)) return null;
  if (sleepPreventsPerception(world, actor)) return null;

  const actorPos = world.get(actor, Position);
  const targetPos = world.get(target, Position);
  if (!actorPos || !targetPos) return null;

  const targetVit = world.get(target, Vitality);
  if (targetVit && (targetVit.hp | 0) <= 0) return null;

  const range = Math.max(0, Math.trunc(getEffectiveVisionRange(world, actor)));
  const dist = Math.max(Math.abs((targetPos.x | 0) - (actorPos.x | 0)), Math.abs((targetPos.y | 0) - (actorPos.y | 0)));
  if (dist > range) return null;

  const isBlocked = opts.isBlocked || blockedCallback(buildBlocksVisionMap(world));
  const canSee = hasOverworldAerialLOS(world, {
    sourceId: actor,
    targetId: target,
    sourcePos: actorPos,
    targetPos,
    range,
  }) || hasLOS(actorPos.x | 0, actorPos.y | 0, targetPos.x | 0, targetPos.y | 0, isBlocked);
  if (!canSee) return null;

  return { id: target, x: targetPos.x | 0, y: targetPos.y | 0, dist };
}

/**
 * Find the nearest visible hostile entity using the actor's Brain and faction.
 *
 * @param {any} world
 * @param {number} actorId
 * @param {{ isBlocked?: (x:number, y:number)=>boolean }} [opts]
 * @returns {{ id:number, x:number, y:number, dist:number } | null}
 */
export function nearestPerceivedHostile(world, actorId, opts = {}) {
  const actor = Number(actorId || 0) | 0;
  if (!(actor > 0) || !world.has(actor, Brain)) return null;
  const actorPos = world.get(actor, Position);
  const actorFaction = world.get(actor, Faction)?.key || "";
  if (!actorPos || !actorFaction) return null;

  const range = Math.max(0, Math.trunc(getEffectiveVisionRange(world, actor)));
  const isBlocked = opts.isBlocked || blockedCallback(buildBlocksVisionMap(world));
  let best = null;
  let bestDist = Infinity;

  forEachInRadius(world, actorPos.x, actorPos.y, range, (id) => {
    if (id === actor) return;
    const targetFaction = world.get(id, Faction)?.key || "";
    if (!targetFaction) return;
    if (!areFactionsHostile(actorFaction, targetFaction)) return;
    const seen = perceiveEntity(world, actor, id, { isBlocked });
    if (!seen || seen.dist >= bestDist) return;
    best = seen;
    bestDist = seen.dist;
  });

  return best;
}
