import { ActorWetness } from "../components/ActorWetness.js";
import { Flying } from "../components/Flying.js";
import { Position } from "../components/Position.js";
import { Vitality } from "../components/Vitality.js";
import { defineExtension } from "../../lib/ecs-js/index.js";
import { clamp } from "../../shared/math/math.js";
import { groundWetnessAt } from "./wetTileMap.js";

function carriedWetness(world, actorId) {
  const wet = world.get(actorId, ActorWetness);
  if (!wet || world.step >= wet.dryAtStep) return 0;
  return clamp(wet.amount * (wet.dryAtStep - world.step) / (wet.dryAtStep - wet.appliedAtStep), 0, 1);
}

/** Current wetness from ground contact or water carried on the actor. */
export function actorWetness(world, actorId) {
  const pos = world.get(actorId, Position);
  const ground = pos && !world.has(actorId, Flying) ? groundWetnessAt(world, pos.x, pos.y) : 0;
  return Math.max(ground, carriedWetness(world, actorId));
}

export function isActorWet(world, actorId) {
  return actorWetness(world, actorId) > 0;
}

export function wetActor(world, actorId, amount) {
  if (!(world.get(actorId, Vitality)?.hp > 0) || !(amount > 0)) return;
  const wetness = Math.max(carriedWetness(world, actorId), clamp(amount, 0, 1));
  const wet = {
    amount: wetness,
    appliedAtStep: world.step,
    dryAtStep: world.step + Math.ceil(4 * wetness),
  };
  if (world.has(actorId, ActorWetness)) world.set(actorId, ActorWetness, wet);
  else world.add(actorId, ActorWetness, wet);
}

export const actorWetnessExtension = defineExtension("jshack:rules:actorWetness", (world) =>
  world.on("moved", ({ id, from, to }) => {
    if (!from || !to || world.has(id, Flying)) return;
    const wetness = Math.max(groundWetnessAt(world, from.x, from.y), groundWetnessAt(world, to.x, to.y));
    wetActor(world, id, wetness);
  })
);
