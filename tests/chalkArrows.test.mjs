import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { runAmmoScripts } from "../src/rules/utils/projectileScriptDispatch.js";

function frame(world, phase, attacker, defender, impact) {
  return runAmmoScripts(world, "ammo_chalk_arrows", phase, {
    phase: `projectile-${phase}`,
    attacker, defender, ammoId: 0, ammoIdentity: "ammo_chalk_arrows", impact,
    rng: () => 0.5,
  });
}

Deno.test("Chalk Arrows branch actor, wall, ground, and miss impacts through tile-owned marks", () => {
  const world = new World({ seed: 37 });
  const attacker = world.create();
  const defender = world.create();
  world.add(attacker, Position, { x: 2, y: 2 });
  world.add(defender, Position, { x: 5, y: 2 });
  world.add(defender, Vitality, { hp: 10, maxHp: 10 });

  const hit = frame(world, "onProjectileActorImpact", attacker, defender, { x: 5, y: 2 });
  hit.resolveDamageResult({ applied: true, killed: false });
  hit.flushResolved();
  assert(world.get(defender, ActiveEffects));

  frame(world, "onProjectileWallImpact", attacker, defender, { x: 4, y: 2 });
  frame(world, "onProjectileGroundImpact", attacker, defender, { x: 7, y: 2 });
  frame(world, "onProjectileMiss", attacker, defender, { x: 6, y: 3 });
  const marks = [...world.query(Position, HazardArea)].map(([, pos, hazard]) => ({ pos, hazard }));
  assertEquals(marks.length, 3);
  assert(marks.some(({ pos }) => pos.x === 4 && pos.y === 2));
  assert(marks.some(({ pos }) => pos.x === 7 && pos.y === 2));
  assert(marks.some(({ pos }) => pos.x === 6 && pos.y === 3));
});
