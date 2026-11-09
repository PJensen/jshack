import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { createCorpse } from "../src/rules/archetypes/Food.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { Consumable } from "../src/rules/components/Consumable.js";
import { Channeling } from "../src/rules/components/Channeling.js";
import { resolveCanonicalStats } from "../src/rules/utils/canonicalStats.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Hunger } from "../src/rules/components/Hunger.js";
import { Owner } from "../src/rules/components/Owner.js";
import { Pet } from "../src/rules/components/Pet.js";
import { Devotion } from "../src/rules/components/Devotion.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { useItemSystem } from "../src/rules/systems/useItemSystem.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";
import { FOOD_EATING_TURNS } from "../src/rules/content/useActions/foodEatingAction.js";
import { deitySystem, getDeityInstance, initDeity } from "../src/rules/systems/deitySystem.js";
import { addToInventory, inventoryContains } from "../src/rules/utils/inventoryFacade.js";

function finishEating(world, actor) {
  for (let turn = 0; turn < FOOD_EATING_TURNS; turn++) channelingSystem(world);
  assertEquals(world.has(actor, Channeling), false, "eating should complete");
}

Deno.test("eating eel corpse grants electric resistance", () => {
  const world = new World({ seed: 0xC0FFEE });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });
  assert(world.has(player, Inventory), "player should have inventory");

  const eelCorpse = createCorpse(world, {
    id: "eel",
    name: "Eel",
    sizeClass: "S",
    massKg: 6,
    tier: 1,
  }, { x: 0, y: 0 });
  const eelConsumable = world.get(eelCorpse, Consumable);
  assertEquals(eelConsumable?.effectParams?.corpseIdentity, "corpse_eel", "corpse identity should follow corpse_<monsterId> convention");
  addToInventory(world, player, eelCorpse);

  const beforeStats = resolveCanonicalStats(world, player);
  const beforeOhms = Number(beforeStats.electricOhms || 0);
  world.add(player, UseIntent, { itemId: eelCorpse, targetId: player });
  useItemSystem(world);
  assertEquals(world.isAlive(eelCorpse), true, "corpse should remain during eating");
  assertEquals(world.has(player, Channeling), true, "corpse eating should use the shared eating channel");
  finishEating(world, player);

  const afterStats = resolveCanonicalStats(world, player);
  const afterOhms = Number(afterStats.electricOhms || 0);
  assert(afterOhms > beforeOhms, "eel corpse should increase electricOhms via stat tree");
  assert(afterOhms >= 600, "eel corpse should grant substantial electric resistance");
  assertEquals(world.isAlive(eelCorpse), false);
});

Deno.test("eating bat corpse can apply disease effect", () => {
  const world = new World({ seed: 0xA77A77 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });
  assert(world.has(player, Inventory), "player should have inventory");

  const batCorpse = createCorpse(world, {
    id: "bat",
    name: "Bat",
    sizeClass: "XS",
    massKg: 1,
    tier: 0,
  }, { x: 0, y: 0 });
  addToInventory(world, player, batCorpse);

  world.add(player, UseIntent, { itemId: batCorpse, targetId: player });
  useItemSystem(world);
  finishEating(world, player);

  const ae = world.get(player, ActiveEffects);
  assert(ae && Array.isArray(ae.effects), "player should gain active effects");
  assert(ae.effects.some((e) => e.key === "disease"), "bat corpse should apply disease");
});

Deno.test("eat cancellation prevents nutrition/effects and does not consume item", () => {
  const world = new World({ seed: 0xC0DE });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });
  world.add(player, Hunger, { hunger: 120, satiation: 0 });
  assert(world.has(player, Inventory), "player should have inventory");

  const cursedMeal = createCorpse(world, {
    id: "test_cancel",
    name: "Cursed Meal",
    sizeClass: "S",
    massKg: 5,
    tier: 0,
  }, { x: 0, y: 0 });
  const cursedConsumable = world.get(cursedMeal, Consumable);
  assertEquals(cursedConsumable?.effectParams?.corpseIdentity, "corpse_test_cancel");
  addToInventory(world, player, cursedMeal);

  const cancelled = [];
  const used = [];
  world.on("item:use-cancelled", (ev) => cancelled.push(ev));
  world.on("item:used", (ev) => used.push(ev));

  const beforeHunger = world.get(player, Hunger).hunger;
  const beforeSatiation = world.get(player, Hunger).satiation;
  const beforeEffects = world.get(player, ActiveEffects)?.effects?.length || 0;

  world.add(player, UseIntent, { itemId: cursedMeal, targetId: player });
  useItemSystem(world);
  finishEating(world, player);

  assert(world.isAlive(cursedMeal), "cancelled eat should not destroy item");
  assert(inventoryContains(world, player, cursedMeal), "cancelled eat should keep item in inventory");
  assertEquals(world.get(player, Hunger).hunger, beforeHunger);
  assertEquals(world.get(player, Hunger).satiation, beforeSatiation);
  assertEquals(world.get(player, ActiveEffects).effects.length, beforeEffects);
  assertEquals(used.length, 0, "cancelled use should not emit item:used");
  assertEquals(cancelled.length, 1, "cancelled use should emit item:use-cancelled");
  assertEquals(cancelled[0].code, "FAIL");
  assertEquals(cancelled[0].message, "You cannot stomach that.");
  assertEquals(cancelled[0].consumesTurn, true);
});

Deno.test("eating your own pet corpse is horrifying and spikes wrath without instant death", () => {
  const world = new World({ seed: 0xD1E7 });
  const player = createPlayer(world, { x: 0, y: 0, name: "Hero" });
  if (world.has(player, Devotion)) world.set(player, Devotion, { deityId: "seraphine" });
  else world.add(player, Devotion, { deityId: "seraphine" });
  if (world.has(player, Vitality)) world.set(player, Vitality, { hp: 30, maxHp: 30 });
  else world.add(player, Vitality, { hp: 30, maxHp: 30 });

  initDeity("seraphine", world);
  deitySystem(world); // install listeners + baseline tick
  const deity = getDeityInstance("seraphine");
  assert(deity, "deity should be initialized");
  const wrathBefore = deity._queryPrecise().wrath;

  assert(world.has(player, Inventory), "player should have inventory");

  const kittyCorpse = createCorpse(world, {
    id: "kitty",
    name: "Kitty",
    sizeClass: "S",
    massKg: 5,
    tier: 0,
  }, { x: 0, y: 0 });
  world.add(kittyCorpse, Pet);
  world.add(kittyCorpse, Owner, { ownerId: player });
  addToInventory(world, player, kittyCorpse);

  const died = [];
  const offenses = [];
  const wrathEvents = [];
  world.on("died", (ev) => died.push(ev));
  world.on("deity:offense", (ev) => offenses.push(ev));
  world.on("deity:wrath", (ev) => wrathEvents.push(ev));

  world.add(player, UseIntent, { itemId: kittyCorpse, targetId: player });
  useItemSystem(world);
  finishEating(world, player);
  deitySystem(world); // resolve new desecration load into deity mood

  const vit = world.get(player, Vitality);
  const wrathAfter = deity._queryPrecise().wrath;
  assert((vit?.hp || 0) > 0, "deity punishment should follow deity timing, not immediate execution");
  assertEquals(died.length, 0, "corpse desecration should not instantly kill");
  assertEquals(offenses.length, 1, "should emit one deity offense event");
  assertEquals(offenses[0].offense, "pet_corpse_desecration");
  assert(wrathAfter > wrathBefore, "desecrating your own pet corpse should increase wrath sharply");
  assert(wrathAfter >= 0.45, "horrifying offense should push wrath into danger territory");
  assertEquals(wrathEvents.length, 0, "wrath effects should still respect the offense grace window");

  // Continue the same seeded run through committed turns. The first eligible
  // turn is four turns after the offense; no 30-tick immunity is required.
  world.rand = () => 0;
  world.setScheduler(deitySystem);
  for (let turn = 0; turn < 4; turn++) world.tick(1);
  assertEquals(wrathEvents.length, 1, "pet desecration should eventually deliver divine lightning");
  assert(
    (world.get(player, Vitality)?.hp || 0) < 30,
    "delivered divine wrath should use the canonical damage path",
  );
});
