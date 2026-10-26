import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Faction } from "../src/rules/components/Faction.js";
import { TargetLock } from "../src/rules/components/TargetLock.js";
import { targetLockSystem } from "../src/rules/systems/targetLockSystem.js";

function setupTarget(key = "enemy", hp = 10) {
  const world = new World({ seed: 12 });
  const actor = world.create();
  const target = world.create();
  world.add(actor, TargetLock, { targetId: target });
  world.add(target, Position, { x: 3, y: 0 });
  world.add(target, Vitality, { hp, maxHp: 10 });
  world.add(target, Faction, { key });
  return { world, actor, target };
}

Deno.test("targetLockSystem preserves a valid hostile lock", () => {
  const { world, actor, target } = setupTarget();
  targetLockSystem(world);
  assertEquals(world.get(actor, TargetLock)?.targetId, target);
});

Deno.test("targetLockSystem clears dead and non-hostile locks", () => {
  for (const [key, hp] of [["neutral", 10], ["enemy", 0]]) {
    const { world, actor } = setupTarget(key, hp);
    targetLockSystem(world);
    assertEquals(world.has(actor, TargetLock), false);
  }
});
