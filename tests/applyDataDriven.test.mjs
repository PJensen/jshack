import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Interactable } from "../src/rules/components/Interactable.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { MaterialState } from "../src/rules/components/MaterialState.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { ApplyIntent } from "../src/rules/components/Intents/ApplyIntent.js";
import { Channeling } from "../src/rules/components/Channeling.js";
import { InteractIntent } from "../src/rules/components/Intents/InteractIntent.js";
import { Position } from "../src/rules/components/Position.js";
import { TemporarySpawn } from "../src/rules/components/TemporarySpawn.js";
import { WeatherState } from "../src/rules/components/WeatherState.js";
import { applySystem } from "../src/rules/systems/applySystem.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";
import { interactionSystem } from "../src/rules/systems/interactionSystem.js";
import { temporarySpawnExpirySystem } from "../src/rules/systems/temporarySpawnExpirySystem.js";
import { TURNS_PER_DAY } from "../src/rules/data/calendar.js";
import { isIdentified, resetIdentification } from "../src/rules/data/identification.js";
import { addToInventory, inventoryContains } from "../src/rules/utils/inventoryFacade.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";

function loadFlatFloor() {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
}

function cookingFires(world) {
  const out = [];
  for (const [id, pos, identity] of world.query(Position, NamedIdentity)) {
    if (String(identity?.identity || "") === "cooking_fire") out.push({ id, pos });
  }
  return out;
}

function identitiesAt(world, x, y) {
  const out = [];
  for (const [, pos, identity] of world.query(Position, NamedIdentity)) {
    if ((pos.x | 0) === (x | 0) && (pos.y | 0) === (y | 0)) {
      out.push(String(identity?.identity || ""));
    }
  }
  return out.sort();
}

Deno.test("touchstone apply hook identifies gem targets", () => {
  resetIdentification();
  const world = new World({ seed: 1001 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });

  const touchstone = createItemById(world, "stone_touchstone");
  const gem = createItemById(world, "gem_ruby");
  assert(touchstone != null, "touchstone should be creatable");
  assert(gem != null, "gem should be creatable");
  addToInventory(world, actor, touchstone);
  addToInventory(world, actor, gem);

  world.add(actor, ApplyIntent, { itemId: touchstone, targetItemId: gem });
  applySystem(world);

  assertEquals(isIdentified("gem_ruby"), true);
  assert(world.isAlive(touchstone), "touchstone should not be consumed");
});

Deno.test("poison potion apply hook coats weapon and consumes the potion", () => {
  const world = new World({ seed: 1002 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  const appliedEvents = [];
  const usedEvents = [];
  world.on("item:applied", (ev) => appliedEvents.push(ev));
  world.on("item:used", (ev) => usedEvents.push(ev));

  const potion = createItemById(world, "potion_poison");
  assert(potion != null, "poison potion should be creatable from item catalog");

  const dagger = buildCatalogItem(world, "dagger_quick");
  const daggerInfoBefore = world.get(dagger, ItemInfo);
  daggerInfoBefore.coating = { kind: "poison", charges: 5 };
  world.set(dagger, ItemInfo, daggerInfoBefore);
  addToInventory(world, actor, potion);
  addToInventory(world, actor, dagger);

  world.add(actor, ApplyIntent, { itemId: potion, targetItemId: dagger });
  applySystem(world);

  const daggerInfo = world.get(dagger, ItemInfo);
  assert(daggerInfo?.coating, "dagger should receive a coating payload");
  assertEquals(daggerInfo.coating.kind, "poison");
  assertEquals(daggerInfo.coating.charges, 17, "poison coating should add granted charges on top of existing");
  assertEquals(appliedEvents.length, 1);
  assert(String(appliedEvents[0]?.result?.type || ""), "poison_coat");
  assert(
    String(appliedEvents[0]?.result?.message || "").includes("poison"),
    "poison apply hook should provide message text in result payload",
  );
  assertEquals(Number(appliedEvents[0]?.result?.chargesGranted || 0), 12);
  assertEquals(Number(appliedEvents[0]?.result?.chargesTotal || 0), 17);
  assert(
    String(appliedEvents[0]?.result?.message || "").includes("17"),
    "poison apply message should interpolate computed total charges",
  );
  assert(!world.isAlive(potion), "poison potion should be consumed");
  assert(!inventoryContains(world, actor, potion), "consumed potion should be removed from inventory");
  assertEquals(usedEvents.length, 1);
  assertEquals(Number(usedEvents[0]?.itemId || 0), potion);
});

Deno.test("weapon oil takes time to apply before consuming the flask", () => {
  const world = new World({ seed: 10025 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  const oil = createItemById(world, "potion_oil");
  const dagger = buildCatalogItem(world, "dagger_quick");
  addToInventory(world, actor, oil);
  addToInventory(world, actor, dagger);

  world.add(actor, ApplyIntent, { itemId: oil, targetItemId: dagger });
  applySystem(world);

  assertEquals(world.has(actor, Channeling), true);
  assertEquals(world.get(dagger, ItemInfo)?.coating, undefined);
  channelingSystem(world);
  assertEquals(world.get(dagger, ItemInfo)?.coating, undefined);
  channelingSystem(world);

  assertEquals(world.get(dagger, ItemInfo)?.coating?.kind, "oil");
  assertEquals(world.isAlive(oil), false);
});

Deno.test("flint applied to wood with wielded metal weapon creates a campfire", () => {
  loadFlatFloor();
  const world = new World({ seed: 1003 });
  const actor = world.create();
  world.add(actor, Position, { x: 4, y: 7 });
  world.add(actor, Inventory, { items: [], maxWeight: 100 });

  const flint = createItemById(world, "stone_flint");
  const wood = createItemById(world, "fuel_firewood");
  const knife = createItemById(world, "tool_kitchen_knife");
  assert(flint != null, "flint should be creatable from item catalog");
  assert(wood != null, "firewood should be creatable from item catalog");
  assert(knife != null, "metal weapon should be creatable from item catalog");
  addToInventory(world, actor, flint);
  addToInventory(world, actor, wood);
  world.add(actor, Equipment, { weapon: knife });

  const appliedEvents = [];
  const skillEvents = [];
  const openEvents = [];
  world.on("item:applied", (ev) => appliedEvents.push(ev));
  world.on("skill:campfire", (ev) => skillEvents.push(ev));
  world.on("cooking:open", (ev) => openEvents.push(ev));

  world.add(actor, ApplyIntent, { itemId: flint, targetItemId: wood });
  applySystem(world);

  assert(world.isAlive(flint), "flint should be reusable");
  assert(!world.isAlive(wood), "campfire should consume the wood");
  assert(!inventoryContains(world, actor, wood), "consumed wood should leave inventory");
  assertEquals(appliedEvents.length, 1);
  assertEquals(skillEvents.length, 1);
  assertEquals(Number(skillEvents[0]?.strikerId || 0), knife);

  const campfires = cookingFires(world);
  assertEquals(campfires.length, 1);
  assertEquals(campfires[0].pos, { x: 5, y: 7 });
  assertEquals(world.get(campfires[0].id, Interactable)?.action, "cookFood");
  const temp = world.get(campfires[0].id, TemporarySpawn);
  assert(temp, "flint-created cooking fire should be temporary");
  assert(
    temp.expiresAtTurn >= Math.floor(TURNS_PER_DAY / 2) - Math.floor(TURNS_PER_DAY / 24),
    "campfire expiry should not jitter earlier than eleven game hours",
  );
  assert(
    temp.expiresAtTurn <= Math.floor(TURNS_PER_DAY / 2) + Math.floor(TURNS_PER_DAY / 24),
    "campfire expiry should not jitter later than thirteen game hours",
  );
  assertEquals(temp.replacementKind, "ashes");
  assertEquals(temp.source, "stone_flint");

  world.add(actor, InteractIntent, { targetId: campfires[0].id });
  interactionSystem(world);
  assertEquals(openEvents.length, 1);
  assertEquals(openEvents[0].targetId, campfires[0].id);
});

Deno.test("flint campfire apply works without a wielded metal weapon", () => {
  loadFlatFloor();
  const world = new World({ seed: 1004 });
  const actor = world.create();
  world.add(actor, Position, { x: 2, y: 2 });
  world.add(actor, Inventory, { items: [], maxWeight: 100 });

  const flint = createItemById(world, "stone_flint");
  const wood = createItemById(world, "material_lumber");
  assert(flint != null, "flint should be creatable");
  assert(wood != null, "lumber should be creatable");
  addToInventory(world, actor, flint);
  addToInventory(world, actor, wood);

  const skillEvents = [];
  world.on("skill:campfire", (ev) => skillEvents.push(ev));

  world.add(actor, ApplyIntent, { itemId: flint, targetItemId: wood });
  applySystem(world);

  assert(!world.isAlive(wood), "campfire should consume wood");
  assertEquals(skillEvents.length, 1);
  assertEquals(Number(skillEvents[0]?.strikerId || 0), 0);
  const campfires = cookingFires(world);
  assertEquals(campfires.length, 1);
  assertEquals(campfires[0].pos, { x: 3, y: 2 });
  assertEquals(world.get(campfires[0].id, Interactable)?.action, "cookFood");
});

Deno.test("flint-created cooking fire expires into ashes after twelve game hours", () => {
  loadFlatFloor();
  const world = new World({ seed: 10041 });
  const actor = world.create();
  world.add(actor, Position, { x: 2, y: 2 });
  world.add(actor, Inventory, { items: [], maxWeight: 100 });

  const flint = createItemById(world, "stone_flint");
  const wood = createItemById(world, "fuel_firewood");
  assert(flint != null, "flint should be creatable");
  assert(wood != null, "firewood should be creatable");
  addToInventory(world, actor, flint);
  addToInventory(world, actor, wood);

  world.add(actor, ApplyIntent, { itemId: flint, targetItemId: wood });
  applySystem(world);

  const campfires = cookingFires(world);
  assertEquals(campfires.length, 1);
  const fireId = campfires[0].id;
  const temp = world.get(fireId, TemporarySpawn);
  assert(temp, "campfire should carry temporary metadata");
  const due = temp.expiresAtTurn | 0;
  assert(world.isAlive(fireId), "campfire should exist before expiry");

  world.step = due - 1;
  temporarySpawnExpirySystem(world);
  assert(world.isAlive(fireId), "campfire should survive until its due turn");

  world.step = due;
  temporarySpawnExpirySystem(world);
  assert(!world.isAlive(fireId), "campfire should expire on its due turn");
  assertEquals(identitiesAt(world, 3, 2), ["ashes"]);
});

Deno.test("flint campfire attempt in rain emits sparks but does not consume wood", () => {
  loadFlatFloor();
  const world = new World({ seed: 1005 });
  const actor = world.create();
  const weather = world.create();
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Inventory, { items: [], maxWeight: 100 });
  world.add(weather, WeatherState, { current: "rain", turnsRemaining: 5, transitionCooldown: 0 });

  const flint = createItemById(world, "stone_flint");
  const wood = createItemById(world, "fuel_firewood");
  const knife = createItemById(world, "tool_kitchen_knife");
  addToInventory(world, actor, flint);
  addToInventory(world, actor, wood);
  world.add(actor, Equipment, { weapon: knife });

  const sparks = [];
  const applied = [];
  world.on("skill:campfire:spark", (ev) => sparks.push(ev));
  world.on("item:applied", (ev) => applied.push(ev));

  world.add(actor, ApplyIntent, { itemId: flint, targetItemId: wood });
  applySystem(world);

  assert(world.isAlive(wood), "rainy campfire attempt should keep wood");
  assert(inventoryContains(world, actor, wood), "rainy campfire attempt should leave wood in inventory");
  assertEquals(sparks.length, 1);
  assertEquals(sparks[0].success, false);
  assertEquals(sparks[0].reason, "rain");
  assertEquals(applied[0]?.result?.type, "campfire_failed");
});

Deno.test("flint campfire attempt with wet fuel smokes out without spawning fire", () => {
  loadFlatFloor();
  const world = new World({ seed: 1006 });
  const actor = world.create();
  world.add(actor, Position, { x: 6, y: 6 });
  world.add(actor, Inventory, { items: [], maxWeight: 100 });

  const flint = createItemById(world, "stone_flint");
  const wood = createItemById(world, "material_lumber");
  const knife = createItemById(world, "tool_kitchen_knife");
  addToInventory(world, actor, flint);
  addToInventory(world, actor, wood);
  world.add(wood, MaterialState, { wetness: 0.6 });
  world.add(actor, Equipment, { weapon: knife });

  const sparks = [];
  world.on("skill:campfire:spark", (ev) => sparks.push(ev));

  world.add(actor, ApplyIntent, { itemId: flint, targetItemId: wood });
  applySystem(world);

  assert(world.isAlive(wood), "wet fuel should not be consumed");
  assertEquals(sparks.length, 1);
  assertEquals(sparks[0].success, false);
  assertEquals(sparks[0].reason, "wet_fuel");
  assertEquals(cookingFires(world).length, 0);
});
