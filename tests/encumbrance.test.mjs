import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Encumbrance } from "../src/rules/components/Encumbrance.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Position } from "../src/rules/components/Position.js";
import { Stamina } from "../src/rules/components/Stamina.js";
import { PickupIntent } from "../src/rules/components/Intents/PickupIntent.js";
import { encumbranceSystem } from "../src/rules/systems/encumbranceSystem.js";
import { itemPickupSystem } from "../src/rules/systems/itemPickupSystem.js";
import { staminaRegenerationSystem } from "../src/rules/systems/staminaRegenerationSystem.js";
import { addToInventory, getCarriedWeight, inventoryContains } from "../src/rules/utils/inventoryFacade.js";
import { setEquippedSlotTopology } from "../src/rules/utils/equipmentTopology.js";
import { snapshotStatusState } from "../src/rules/utils/statusFacade.js";

function actor(world, maxStamina = 100) {
  const id = world.create();
  world.add(id, Inventory, { capacity: 50 });
  world.add(id, Equipment, {});
  world.add(id, Position, { x: 0, y: 0 });
  world.add(id, Stamina, { maxStamina, stamina: 50, staminaRegen: 4, regenCooldown: 0 });
  world.add(id, Encumbrance);
  return id;
}

function item(world, weight, count = 1) {
  const id = world.create();
  world.add(id, ItemInfo, { type: "misc", slot: "", weight, count, value: 0, description: "" });
  return id;
}

Deno.test("encumbrance derives realistic capacity and graduated load tiers", () => {
  const world = new World({ seed: 1 });
  const id = actor(world);
  const load = item(world, 52);
  addToInventory(world, id, load);

  encumbranceSystem(world);
  let enc = world.get(id, Encumbrance);
  assertEquals(enc.limit, 60);
  assertEquals(enc.hardLimit, 60);
  assertEquals(enc.heavilyLoaded, true);
  assertEquals(enc.overloaded, false);
  assertEquals(snapshotStatusState(world, id).allStatuses.some((status) => status.type === "encumbered"), true);

  staminaRegenerationSystem(world);
  assertEquals(world.get(id, Stamina).stamina, 52, "burdened actors retain half stamina regeneration");

  world.get(load, ItemInfo).weight = 61;
  encumbranceSystem(world);
  enc = world.get(id, Encumbrance);
  assertEquals(enc.overloaded, true);
  staminaRegenerationSystem(world);
  assertEquals(world.get(id, Stamina).stamina, 52, "overloaded actors cannot regenerate stamina");

  world.get(load, ItemInfo).weight = 0;
  encumbranceSystem(world);
  assertEquals(snapshotStatusState(world, id).allStatuses.some((status) => status.type === "encumbered"), false);
});

Deno.test("equipped plate and a greatsword consume carrying capacity", () => {
  const world = new World({ seed: 2 });
  const id = actor(world, 130);
  const plate = item(world, 15);
  const greatsword = item(world, 4);
  setEquippedSlotTopology(world, id, "armor", plate);
  setEquippedSlotTopology(world, id, "weapon", greatsword);

  assertEquals(getCarriedWeight(world, id), 19);
  encumbranceSystem(world);
  assertEquals(world.get(id, Encumbrance).limit, 78);
});

Deno.test("pickup refuses weight beyond normal carrying capacity", () => {
  const world = new World({ seed: 3 });
  const id = actor(world);
  addToInventory(world, id, item(world, 60));
  const rock = item(world, 20);
  world.add(rock, Position, { x: 0, y: 0 });
  world.add(id, PickupIntent, { targetId: rock, count: 1 });
  const denied = [];
  world.on("item:pickup-denied", (event) => denied.push(event));

  itemPickupSystem(world);

  assertEquals(inventoryContains(world, id, rock), false);
  assertEquals(denied[0]?.reason, "weight");
  assertEquals(denied[0]?.limit, 60);
});
