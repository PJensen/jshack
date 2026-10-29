import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Beatitude } from "../src/rules/components/Beatitude.js";
import { DrinkIntent } from "../src/rules/components/Intents/DrinkIntent.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { drinkSystem } from "../src/rules/systems/drinkSystem.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";

Deno.test("cursed health potion leaves a lagging shadow", () => {
  const world = new World({ seed: 4401 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Vitality, { maxHp: 20, hp: 10 });

  const potion = createItemById(world, "potion_health");
  addToInventory(world, actor, potion);
  world.set(potion, Beatitude, { state: "cursed" });

  const messages = [];
  world.on("message", (event) => messages.push(event));
  world.add(actor, DrinkIntent, { itemId: potion, targetId: actor });
  drinkSystem(world);

  const effects = world.get(actor, ActiveEffects)?.effects || [];
  const shadowCurse = effects.find((effect) => effect.key === "confused");
  assert(shadowCurse, "cursed health potion should apply its subtle curse");
  assertEquals(shadowCurse.turnsLeft, 4);
  assertEquals(messages.at(-1)?.text, "Your shadow keeps moving after you stop.");
  assert(!world.isAlive(potion), "drinking should consume the potion");
});
