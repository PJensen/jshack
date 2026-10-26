import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { CreatureType } from "../src/rules/components/CreatureType.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { ScriptState } from "../src/rules/components/ScriptState.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { itemProcTickSystem } from "../src/rules/systems/itemProcTickSystem.js";

function makeActor(world, x = 2, y = 2) {
  const actor = world.create();
  world.add(actor, Player);
  world.add(actor, Inventory, { capacity: 20 });
  world.add(actor, Equipment, {});
  world.add(actor, Position, { x, y });
  world.add(actor, Vitality, { hp: 30, maxHp: 30 });
  return actor;
}

function makeUndead(world, x = 3, y = 2) {
  const undead = world.create();
  world.add(undead, CreatureType, { type: "undead" });
  world.add(undead, Position, { x, y });
  world.add(undead, Vitality, { hp: 30, maxHp: 30 });
  return undead;
}

Deno.test("Sun-Vessel carried tick runs through generic proc topology", () => {
  const world = new World({ seed: 23 });
  world.rand = () => 0;
  const actor = makeActor(world);
  const undead = makeUndead(world);
  const vessel = buildCatalogItem(world, "sun_vessel");
  assert(addToInventory(world, actor, vessel, { silent: true }));

  world.set(vessel, ScriptState, { data: { charge: 8, maxCharge: 8, stability: 2, cracked: false } });
  const lights = [];
  const presentations = [];
  world.on("content:light:set", (event) => lights.push(event));
  world.on("script:present", (event) => presentations.push(event));

  itemProcTickSystem(world);
  assertEquals(world.get(vessel, ScriptState).data.stability, 1);
  assertEquals(lights.length, 1);
  assertEquals(presentations.at(-1)?.id, "pulse");

  itemProcTickSystem(world);
  assertEquals(world.get(vessel, ScriptState).data.stability, 0);
  assertEquals(world.get(vessel, ScriptState).data.cracked, true);
  assert(presentations.some((entry) => entry.id === "crack"), "vessel should present its crack transition");

  const hpBeforeLeak = world.get(undead, Vitality).hp;
  itemProcTickSystem(world);
  assert(world.get(undead, Vitality).hp < hpBeforeLeak, "cracked vessel should damage nearby undead");
  assertEquals(world.get(vessel, ScriptState).data.charge, 7);
  assertEquals(presentations.at(-1)?.id, "leak");
});

Deno.test("equipped passive ticks share the same proc topology", () => {
  const world = new World({ seed: 29 });
  world.rand = () => 1;
  const actor = makeActor(world);
  const undead = makeUndead(world);
  const weapon = buildCatalogItem(world, "dawnbreaker");
  assert(addToInventory(world, actor, weapon, { silent: true }));
  world.mutate(actor, Equipment, (equipment) => { equipment.weapon = weapon; });
  world.set(weapon, ScriptState, { data: { radiance: 8, maxRad: 10, awakened: true, killStreak: 0 } });

  const lights = [];
  world.on("content:light:set", (event) => lights.push(event));
  const hpBeforeAura = world.get(undead, Vitality).hp;
  itemProcTickSystem(world);

  assertEquals(lights.length, 1);
  assertEquals(lights[0].entity, actor);
  assert(world.get(undead, Vitality).hp < hpBeforeAura, "awakened Dawnbreaker should sear nearby undead");
  assertEquals(world.get(weapon, ScriptState).data.radiance, 8, "rand=1 should avoid decay");
});
