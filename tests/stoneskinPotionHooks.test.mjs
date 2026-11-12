import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { ApplyIntent } from "../src/rules/components/Intents/ApplyIntent.js";
import { DrinkIntent } from "../src/rules/components/Intents/DrinkIntent.js";
import { ThrowIntent } from "../src/rules/components/Intents/ThrowIntent.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Material } from "../src/rules/components/Material.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Position } from "../src/rules/components/Position.js";
import { applySystem } from "../src/rules/systems/applySystem.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";
import { drinkSystem } from "../src/rules/systems/drinkSystem.js";
import { installTauntListener } from "../src/rules/systems/tauntSystem.js";
import { throwSystem } from "../src/rules/systems/throwSystem.js";
import { useItemSystem } from "../src/rules/systems/useItemSystem.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { GEAR_APPLICATION_TURNS } from "../src/rules/content/useActions/gearApplicationAction.js";

Deno.test("stoneskin potion on_drink grants temporary stoneskin effect", () => {
  const world = new World({ seed: 6101 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(actor, Position, { x: 5, y: 5 });

  const potion = createItemById(world, "potion_stoneskin");
  assert(potion != null, "stoneskin potion should be creatable");
  addToInventory(world, actor, potion);

  const results = [];
  world.on("interaction:result", (ev) => results.push(ev));

  world.add(actor, DrinkIntent, { itemId: potion, targetId: actor });
  drinkSystem(world);

  assertEquals(results.length, 1);
  assertEquals(results[0].verb, "drink");
  assertEquals(results[0].ok, true);
  assert(results[0].payload?.onDrink?.potency >= 2, "onDrink payload should expose potency");
  assert(!world.isAlive(potion), "drinking should consume the potion");

  const effects = world.get(actor, ActiveEffects);
  assert(Array.isArray(effects?.effects), "actor should have active effects");
  const stoneskin = effects.effects.find((e) => e.key === "stoneskin");
  assert(stoneskin, "stoneskin effect should be queued by on_drink");
  assert(stoneskin.turnsLeft >= 10, "stoneskin duration should be in configured range");
});

Deno.test("stoneskin potion on_throw (via throw pipeline) spawns taunting statue", () => {
  const world = new World({ seed: 6102 });
  installTauntListener(world);

  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(actor, Position, { x: 10, y: 10 });

  const enemy = world.create();
  world.add(enemy, Position, { x: 13, y: 10 });
  world.add(enemy, Faction, { key: "enemy" });

  const potion = createItemById(world, "potion_stoneskin");
  assert(potion != null, "stoneskin potion should be creatable");
  addToInventory(world, actor, potion);

  const messageEvents = [];
  const statusEvents = [];
  const thrownEvents = [];
  const results = [];
  world.on("message", (ev) => messageEvents.push(ev));
  world.on("status", (ev) => statusEvents.push(ev));
  world.on("item:thrown", (ev) => thrownEvents.push(ev));
  world.on("interaction:result", (ev) => results.push(ev));

  world.add(actor, ThrowIntent, { itemId: potion, x: 14, y: 10 });
  throwSystem(world);

  assertEquals(results.length, 1);
  assertEquals(results[0].verb, "throw");
  assertEquals(results[0].ok, true);
  assertEquals(results[0].metrics.path, "itemHooks");
  assert(!world.isAlive(potion), "throwing should consume the potion");

  let spawnedTaunter = 0;
  for (const [id, ni] of world.query(NamedIdentity)) {
    if (ni.identity === "stone_taunter") {
      spawnedTaunter = id;
      break;
    }
  }
  assert(spawnedTaunter > 0, "on_throw should spawn a stone_taunter monster");
  assertEquals(world.get(spawnedTaunter, Faction)?.key, "stone_taunter");
  const taunterPos = world.get(spawnedTaunter, Position);
  assertEquals(taunterPos?.x, 14);
  assertEquals(taunterPos?.y, 10);
  assertEquals(thrownEvents.length, 2);
  assertEquals(thrownEvents[0]?.from?.x, 10);
  assertEquals(thrownEvents[0]?.from?.y, 10);
  assertEquals(thrownEvents[0]?.to?.x, 14);
  assertEquals(thrownEvents[0]?.to?.y, 10);

  const enemyEffects = world.get(enemy, ActiveEffects);
  assert(Array.isArray(enemyEffects?.effects), "enemy should have active effects");
  const taunt = enemyEffects.effects.find((e) => e.key === "taunt");
  assert(taunt, "spawned statue should taunt nearby enemies");
  assertEquals(taunt.sourceId, spawnedTaunter);
  assert(taunt.turnsLeft >= 3, "taunt duration should match spawn pulse config");

  const tauntVfx = statusEvents.find((ev) => ev.id === enemy && ev.kind === "taunt" && ev.effect === "taunt");
  assert(tauntVfx, "taunt should emit one-shot status VFX");
  assert(messageEvents.length > 0, "throw hook should emit at least one message event");
});

Deno.test("stoneskin potion use does not route through on_throw", () => {
  const world = new World({ seed: 6104 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(actor, Position, { x: 10, y: 10 });

  const potion = createItemById(world, "potion_stoneskin");
  assert(potion != null, "stoneskin potion should be creatable");
  addToInventory(world, actor, potion);

  const results = [];
  world.on("interaction:result", (ev) => results.push(ev));

  world.add(actor, UseIntent, { itemId: potion, targetId: actor });
  useItemSystem(world);

  assertEquals(results.length, 1);
  assertEquals(results[0].verb, "use");
  assertEquals(results[0].ok, true);
  assertEquals(results[0].metrics.path, "none");
  assert(world.isAlive(potion), "use action should not consume throw-only potion");

  let spawnedTaunter = 0;
  for (const [id, ni] of world.query(NamedIdentity)) {
    if (ni.identity === "stone_taunter") {
      spawnedTaunter = id;
      break;
    }
  }
  assertEquals(spawnedTaunter, 0, "use action should not spawn throw-only effects");
});

Deno.test("stoneskin potion on_dip (via apply pipeline) petrifies target item", () => {
  const world = new World({ seed: 6103 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  const potion = createItemById(world, "potion_stoneskin");
  const weapon = createItemById(world, "dagger_quick");
  assert(potion != null && weapon != null, "required test items should be creatable");
  addToInventory(world, actor, potion);
  addToInventory(world, actor, weapon);

  const weaponInfoBefore = world.get(weapon, ItemInfo);
  const beforeDefense = Number(weaponInfoBefore?.bonuses?.defense || 0);

  const results = [];
  const appliedEvents = [];
  world.on("interaction:result", (ev) => results.push(ev));
  world.on("item:applied", (ev) => appliedEvents.push(ev));

  world.add(actor, ApplyIntent, { itemId: potion, targetItemId: weapon });
  applySystem(world);
  for (let turn = 0; turn < GEAR_APPLICATION_TURNS; turn++) channelingSystem(world);

  assertEquals(results.length, 1);
  assertEquals(results[0].verb, "apply");
  assertEquals(results[0].ok, true);
  assertEquals(results[0].metrics.path, "payload");
  assertEquals(results[0].metrics.consumedTool, true);
  assert(!world.isAlive(potion), "dipping should consume stoneskin potion");

  const weaponInfoAfter = world.get(weapon, ItemInfo);
  const afterDefense = Number(weaponInfoAfter?.bonuses?.defense || 0);
  assertEquals(afterDefense, beforeDefense + 1);
  assertEquals(appliedEvents.length, 1);
  assert(
    String(appliedEvents[0]?.result?.message || "").includes("AC +1"),
    "stoneskin apply hook should include AC bonus text in result message",
  );

  const mat = world.get(weapon, Material);
  assertEquals(String(mat?.kind || ""), "stone");
});
