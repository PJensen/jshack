import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { configureWorld } from "../src/main/scheduler.js";
import { makeRulesDispatcher } from "../src/main/input/rulesDispatch.js";
import { Channeling } from "../src/rules/components/Channeling.js";
import { DamageApplied } from "../src/rules/components/DamageApplied.js";
import { Position } from "../src/rules/components/Position.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { channelingDamageReactionSystem } from "../src/rules/systems/damageReactions/channelingDamageReactionSystem.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";
import { useItemSystem } from "../src/rules/systems/useItemSystem.js";
import { FOOD_EATING_TURNS, installFoodEatingAction } from "../src/rules/content/useActions/foodEatingAction.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";

function startEating(world) {
  const actor = createPlayer(world, { x: 0, y: 0, name: "Eater" });
  const food = createItemById(world, "food_ration");
  addToInventory(world, actor, food);
  world.add(actor, UseIntent, { itemId: food, targetId: actor });
  useItemSystem(world);
  return { actor, food };
}

Deno.test("food use starts a stillness-required channel and consumes on completion", () => {
  installFoodEatingAction();
  const world = new World({ seed: 7701 });
  const { actor, food } = startEating(world);
  const results = [];
  world.on("interaction:result", (event) => results.push(event));

  assert(world.has(actor, Channeling), "food should begin channeling");
  assert(world.isAlive(food), "food should remain until eating completes");
  assertEquals(world.get(actor, Channeling).breakOnMove, true);
  assertEquals(world.get(actor, Channeling).breakOnDamage, true);

  for (let turn = 1; turn < FOOD_EATING_TURNS; turn++) {
    channelingSystem(world);
    assert(world.has(actor, Channeling), `food should still be channeling after turn ${turn}`);
    assert(world.isAlive(food), "food should remain during the channel");
  }

  channelingSystem(world);
  assertEquals(world.has(actor, Channeling), false);
  assertEquals(world.isAlive(food), false, "food should be consumed after completion");
  assertEquals(results.length, 1);
  assertEquals(results[0].verb, "use");
  assertEquals(results[0].ok, true);
});

Deno.test("moving interrupts eating before the food is consumed", () => {
  installFoodEatingAction();
  const world = new World({ seed: 7702 });
  const { actor, food } = startEating(world);
  world.set(actor, Position, { x: 1, y: 0 });

  channelingSystem(world);

  assertEquals(world.has(actor, Channeling), false);
  assert(world.isAlive(food), "interrupted food should remain available");
});

Deno.test("damage interrupts eating before the food is consumed", () => {
  installFoodEatingAction();
  const world = new World({ seed: 7703 });
  const { actor, food } = startEating(world);
  world.add(actor, DamageApplied, { target: actor, source: 99, amount: 1 });

  channelingDamageReactionSystem(world);

  assertEquals(world.has(actor, Channeling), false);
  assert(world.isAlive(food), "interrupted food should remain available");
});

Deno.test("food detection does not delay potion use", () => {
  const world = new World({ seed: 7704 });
  const actor = createPlayer(world, { x: 0, y: 0, name: "Quaffer" });
  const potion = createItemById(world, "potion_health");
  addToInventory(world, actor, potion);

  world.add(actor, UseIntent, { itemId: potion, targetId: actor });
  useItemSystem(world);

  assertEquals(world.has(actor, Channeling), false);
  assertEquals(world.isAlive(potion), true);
});

Deno.test("the real rules dispatcher delays Pilgrim's Stew until the fifth tick", () => {
  const world = new World({ seed: 7705 });
  configureWorld(world);
  const actor = createPlayer(world, { x: 0, y: 0, name: "Eater" });
  const food = buildCatalogItem(world, "food_pilgrim_stew");
  addToInventory(world, actor, food);
  const dispatch = makeRulesDispatcher(world, () => actor);

  dispatch({ type: "rules.useItem", payload: { itemId: food } });
  assert(world.has(actor, Channeling), "dispatcher should start eating");
  assert(world.isAlive(food), "stew should remain after the initiating tick");

  for (let turn = 1; turn < FOOD_EATING_TURNS - 1; turn++) {
    world.tick(1);
    assert(world.isAlive(food), `stew should remain through tick ${turn}`);
  }

  world.tick(1);
  assertEquals(world.isAlive(food), false, "stew should be consumed on completion");
});

