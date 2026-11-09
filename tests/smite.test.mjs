import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Brain } from "../src/rules/components/Brain.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { getSpell } from "../src/rules/data/spells.js";
import { getEffectiveVisionRange } from "../src/rules/utils/blind.js";
import { effectSystem } from "../src/rules/systems/effectSystem.js";

const SMITE = {
  id: "smite",
  name: "Smite",
  manaCost: 6,
  range: 8,
  script: "smite",
  targeting: "target",
};

Deno.test("smite has a two-turn cast time", () => {
  assertEquals(getSpell("smite")?.castTime, 2);
});

function makeActor(world, x, y, hp = 10, maxHp = 10, faction = "player", spellAvoidDerived = 0) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Brain, { visionRange: 8, intelligence: 10, learnedSpellIds: [] });
  world.add(id, Vitality, { hp, maxHp });
  world.add(id, Faction, { key: faction });
  world.add(id, Equipment, { spellAvoidDerived });
  return id;
}

Deno.test("smite damages the targeted hostile and emits spell:smite", () => {
  const world = new World({ seed: 0x51A7 });
  const cleric = makeActor(world, 1, 1, 20, 20, "player");
  const target = makeActor(world, 3, 1, 20, 20, "enemy");
  const events = [];
  world.on("spell:smite", (event) => events.push(event));

  runSpellScript(world, cleric, SMITE, { targetId: target, x: 3, y: 1 });

  assert(world.get(target, Vitality).hp < 20, "smite should damage a hostile target");
  assertEquals(events.length, 1);
  assertEquals(events[0].targetId, target);
  assertEquals(events[0].missed, false);
});

Deno.test("smite misses when target spellAvoid overwhelms spell hit", () => {
  const world = new World({ seed: 0x51A8 });
  const cleric = makeActor(world, 1, 1, 20, 20, "player");
  const target = makeActor(world, 3, 1, 20, 20, "enemy", 200);
  const missEvents = [];
  world.on("spell:miss", (event) => missEvents.push(event));

  runSpellScript(world, cleric, SMITE, { targetId: target, x: 3, y: 1 });

  assertEquals(world.get(target, Vitality).hp, 20);
  assertEquals(missEvents.length, 1);
  assertEquals(missEvents[0].spellId, "smite");
  assertEquals(missEvents[0].targetId, target);
});

Deno.test("smite dazzle collapses vision for two turns", () => {
  const world = new World({ seed: 0x51A9 });
  const cleric = makeActor(world, 1, 1, 20, 20, "player");
  const target = makeActor(world, 3, 1, 20, 20, "enemy");

  runSpellScript(world, cleric, SMITE, { targetId: target, x: 3, y: 1 });
  effectSystem(world);

  assertEquals(getEffectiveVisionRange(world, cleric), 0);
});
