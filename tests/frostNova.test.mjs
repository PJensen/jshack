import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Faction } from "../src/rules/components/Faction.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { effectStrength, statusStrength } from "../src/rules/utils/statusFacade.js";
import { FrostNovaCast } from "../src/events/FrostNovaCast.js";

const SPELL = { id: "frost_nova", name: "Frost Nova", manaCost: 8, script: "frost_nova", radius: 2 };

function makeEntity(world, x, y, hp, faction) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Vitality, { maxHp: hp, hp });
  if (faction) world.add(id, Faction, { key: faction });
  return id;
}

Deno.test("frost nova: freezes and roots hostile targets in radius", () => {
  const world = new World({ seed: 1 });
  const caster = makeEntity(world, 5, 5, 20, "player");
  const near = makeEntity(world, 6, 5, 20, "enemy");
  const far = makeEntity(world, 7, 5, 20, "enemy");
  const outside = makeEntity(world, 8, 5, 20, "enemy");

  runSpellScript(world, caster, SPELL, {});

  assert(effectStrength(world, near, "frost_nova") > 0, "near target frozen");
  assert(effectStrength(world, far, "frost_nova") > 0, "far target frozen");
  assertEquals(world.get(outside, ActiveEffects), null, "outside target unaffected");
});

Deno.test("frost nova: damages enemies but does not push them", () => {
  const world = new World({ seed: 1 });
  const caster = makeEntity(world, 5, 5, 20, "player");
  const near = makeEntity(world, 6, 5, 20, "enemy");
  const far = makeEntity(world, 7, 5, 20, "enemy");

  runSpellScript(world, caster, SPELL, {});

  assertEquals(world.get(near, Position), { x: 6, y: 5 });
  assertEquals(world.get(far, Position), { x: 7, y: 5 });
  assert(world.get(near, Vitality).hp < 20, "near target took damage");
  assert(world.get(far, Vitality).hp < 20, "far target took damage");
  assert(world.get(near, Vitality).hp <= world.get(far, Vitality).hp, "near target takes at least as much as far target");
});

Deno.test("frost nova: affects hostiles only", () => {
  const world = new World({ seed: 1 });
  const caster = makeEntity(world, 5, 5, 20, "player");
  const enemy = makeEntity(world, 6, 5, 20, "enemy");
  const ally = makeEntity(world, 5, 6, 20, "player");
  const neutral = makeEntity(world, 4, 5, 20, "neutral");

  runSpellScript(world, caster, SPELL, {});

  assert(effectStrength(world, enemy, "frost_nova") > 0, "enemy frost nova identity");
  assertEquals(world.get(ally, ActiveEffects), null, "ally unaffected");
  assertEquals(world.get(neutral, ActiveEffects), null, "neutral unaffected");
  assertEquals(world.get(caster, ActiveEffects), null, "caster unaffected");
});

Deno.test("frost nova: spell event includes affected targets", () => {
  const world = new World({ seed: 1 });
  const events = [];
  world.on(FrostNovaCast, (event) => events.push(event));
  const caster = makeEntity(world, 5, 5, 20, "player");
  const enemy = makeEntity(world, 6, 5, 20, "enemy");

  runSpellScript(world, caster, SPELL, {});

  assertEquals(events.length, 1);
  assert(events[0] instanceof FrostNovaCast);
  assertEquals(events[0].origin, { x: 5, y: 5 });
  assertEquals(events[0].radius, 2);
  assert(events[0].frozen.some((entry) => entry.id === enemy), "event includes frozen enemy");
});
