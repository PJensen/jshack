import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { createCorpse } from "../src/rules/archetypes/Food.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { useItemSystem } from "../src/rules/systems/useItemSystem.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";
import { installFishingAction } from "../src/rules/content/useActions/fishingAction.js";
import { harvestRegrowthSystem } from "../src/rules/systems/harvestRegrowthSystem.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Channeling } from "../src/rules/components/Channeling.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { Position } from "../src/rules/components/Position.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { HarvestNode } from "../src/rules/components/HarvestNode.js";
import { WeatherState } from "../src/rules/components/WeatherState.js";
import { clearAll, loadChunk, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR, TILE_MARSH, TILE_WATER, TILE_WATER_DEEP } from "../src/rules/environment/dungeon/constants.js";
import { inventoryItems } from "../src/rules/utils/inventoryFacade.js";
import "../src/content/items/fishingRod.js";
import { installContent } from "../src/content/install.js";
installContent();

function installFishingAbilityRuntime(world) {
  installFishingAction(world);
}

Deno.test("use runtime resolves wand payload object and consumes one charge", () => {
  const world = new World({ seed: 3301 });
  const actor = createPlayer(world, { x: 0, y: 0, name: "Caster" });
  const wand = buildCatalogItem(world, "wand_lightning");
  addToInventory(world, actor, wand);

  const results = [];
  world.on("interaction:result", (ev) => results.push(ev));

  world.add(actor, UseIntent, { itemId: wand, targetId: actor });
  useItemSystem(world);

  assertEquals(results.length, 1);
  assertEquals(results[0].verb, "use");
  assertEquals(results[0].ok, true);
  assertEquals(results[0].metrics.path, "itemHooks");
  assertEquals(results[0].metrics.payloadMatched, true);

  const info = world.get(wand, ItemInfo);
  assert(info && Number(info.count) === 2, "wand should lose one charge");
});

Deno.test("use runtime resolves corpse consumable payload object and can cancel", () => {
  const world = new World({ seed: 3302 });
  const actor = createPlayer(world, { x: 0, y: 0, name: "Hero" });

  const corpse = createCorpse(world, {
    id: "test_cancel",
    name: "Cursed Meal",
    sizeClass: "S",
    massKg: 5,
    tier: 0,
  }, { x: 0, y: 0 });
  addToInventory(world, actor, corpse);

  const results = [];
  world.on("interaction:result", (ev) => results.push(ev));

  world.add(actor, UseIntent, { itemId: corpse, targetId: actor });
  useItemSystem(world);

  assertEquals(results.length, 1);
  assertEquals(results[0].verb, "use");
  assertEquals(results[0].metrics.path, "matcher");
  assertEquals(results[0].metrics.payloadMatched, true);
  assertEquals(results[0].canceled, true, "cursed meal should cancel through payload hooks");
});

Deno.test("equipped fishing rod use channels and rolls normal-water fishing loot", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  setTile(1, 0, TILE_WATER);

  const world = new World({ seed: 3310 });
  world.rand = () => 0.1;
  const actor = createPlayer(world, { x: 0, y: 0, name: "Angler" });
  installFishingAbilityRuntime(world);
  if (!world.has(actor, Inventory)) world.add(actor, Inventory, { capacity: 20 });
  if (!world.has(actor, Equipment)) world.add(actor, Equipment, {});

  const rod = buildCatalogItem(world, "fishing_rod");
  addToInventory(world, actor, rod);
  world.set(actor, Equipment, { ...world.get(actor, Equipment), weapon: rod });

  const events = [];
  world.on("fishing:caught", (ev) => events.push(ev));

  world.add(actor, UseIntent, { itemId: rod });
  useItemSystem(world);

  assert(world.has(actor, Channeling), "fishing should start a channel");
  for (let i = 0; i < 12; i++) channelingSystem(world);

  assertEquals(world.has(actor, Channeling), false, "fishing channel should complete");
  assertEquals(events.length, 1);
  assertEquals(events[0]?.tableId, "fishing:normal_water");
  if (events[0]?.caughtId) {
    assert(inventoryItems(world, actor).includes(events[0].caughtId), "caught item should enter inventory");
    assert(String(world.get(events[0].caughtId, NamedIdentity)?.identity || "").length > 0);
  }
});

Deno.test("fishing is a targeted channeled use-action that requires water", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  setTile(2, 0, TILE_WATER);

  const world = new World({ seed: 3312 });
  world.rand = () => 0.1;
  const actor = createPlayer(world, { x: 0, y: 0, name: "Angler" });
  if (!world.has(actor, Inventory)) world.add(actor, Inventory, { capacity: 20 });
  if (!world.has(actor, Equipment)) world.add(actor, Equipment, {});

  const rod = buildCatalogItem(world, "fishing_rod");
  addToInventory(world, actor, rod);
  world.set(actor, Equipment, { ...world.get(actor, Equipment), weapon: rod });

  installFishingAction(world);
  const casts = [];
  const caught = [];
  world.on("fishing:cast", (ev) => casts.push(ev));
  world.on("fishing:caught", (ev) => caught.push(ev));

  world.emit("fishing:cast:request", { actor, itemId: rod, turns: 12, x: 2, y: 0 });

  assert(world.has(actor, Channeling), "fishing use-action should start a channel");
  assertEquals(casts[0]?.x, 2);
  assertEquals(casts[0]?.y, 0);

  for (let i = 0; i < 12; i++) channelingSystem(world);

  assertEquals(world.has(actor, Channeling), false, "fishing use-action channel should complete");
  assertEquals(caught.length, 1);
  assertEquals(caught[0]?.tableId, "fishing:normal_water");
  if (caught[0]?.caughtId) {
    assert(inventoryItems(world, actor).includes(caught[0].caughtId), "caught item should enter inventory");
    assert(String(world.get(caught[0].caughtId, NamedIdentity)?.identity || "").length > 0);
  }
});

Deno.test("fishing spots use special loot, exhaust, and replenish on cooldown", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  setTile(2, 0, TILE_WATER);

  const world = new World({ seed: 3314 });
  const actor = createPlayer(world, { x: 0, y: 0, name: "Angler" });
  if (!world.has(actor, Inventory)) world.add(actor, Inventory, { capacity: 20 });
  if (!world.has(actor, Equipment)) world.add(actor, Equipment, {});

  const rod = buildCatalogItem(world, "fishing_rod");
  addToInventory(world, actor, rod);
  world.set(actor, Equipment, { ...world.get(actor, Equipment), weapon: rod });

  const spot = world.create();
  world.add(spot, Position, { x: 2, y: 0 });
  world.add(spot, NamedIdentity, { name: "Fishing Spot", identity: "fishing_spot" });
  world.add(spot, HarvestNode, {
    kind: "fishing_spot",
    ready: true,
    regrowTurns: 2,
    regrowCountdown: 0,
    yield: "food_raw_fish",
    yieldMin: 1,
    yieldMax: 1,
  });

  const casts = [];
  const caught = [];
  const exhausted = [];
  installFishingAction(world);
  world.on("fishing:cast", (ev) => casts.push(ev));
  world.on("fishing:caught", (ev) => caught.push(ev));
  world.on("fishing:spot:exhausted", (ev) => exhausted.push(ev));

  world.emit("fishing:cast:request", { actor, itemId: rod, turns: 12, x: 2, y: 0 });

  assertEquals(casts[0]?.spotId, spot);
  assertEquals(world.get(actor, Channeling)?.targetId, spot);

  for (let i = 0; i < 12; i++) channelingSystem(world);

  assertEquals(caught.length, 1);
  assertEquals(caught[0]?.tableId, "fishing:spot");
  assertEquals(caught[0]?.spotId, spot);
  assertEquals(caught[0]?.tileProfile, "normal");
  assertEquals(exhausted.length, 1);
  assertEquals(world.get(spot, HarvestNode)?.ready, false);
  assertEquals(world.get(spot, HarvestNode)?.regrowCountdown, 2);

  harvestRegrowthSystem(world);
  assertEquals(world.get(spot, HarvestNode)?.ready, false);
  assertEquals(world.get(spot, HarvestNode)?.regrowCountdown, 1);

  harvestRegrowthSystem(world);
  assertEquals(world.get(spot, HarvestNode)?.ready, true);
  assertEquals(world.get(spot, HarvestNode)?.regrowCountdown, 0);
});

Deno.test("fishing loot context records rain, tile profile, and repeat pressure", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  setTile(2, 0, TILE_WATER_DEEP);
  setTile(3, 0, TILE_MARSH);

  const world = new World({ seed: 3315 });
  const weather = world.create();
  world.add(weather, WeatherState, { current: "rain", turnsRemaining: 20, transitionCooldown: 0 });
  const actor = createPlayer(world, { x: 0, y: 0, name: "Angler" });
  if (!world.has(actor, Inventory)) world.add(actor, Inventory, { capacity: 20 });
  if (!world.has(actor, Equipment)) world.add(actor, Equipment, {});

  const rod = buildCatalogItem(world, "fishing_rod");
  addToInventory(world, actor, rod);
  world.set(actor, Equipment, { ...world.get(actor, Equipment), weapon: rod });

  installFishingAction(world);
  const caught = [];
  world.on("fishing:caught", (ev) => caught.push(ev));

  world.emit("fishing:cast:request", { actor, itemId: rod, turns: 12, x: 2, y: 0 });
  for (let i = 0; i < 12; i++) channelingSystem(world);

  assertEquals(caught[0]?.raining, true);
  assertEquals(caught[0]?.tileProfile, "deep");
  assertEquals(caught[0]?.pressureBefore, 0);
  assertEquals(caught[0]?.pressureAfter, 1);

  world.emit("fishing:cast:request", { actor, itemId: rod, turns: 12, x: 2, y: 0 });
  for (let i = 0; i < 12; i++) channelingSystem(world);

  assertEquals(caught[1]?.pressureBefore, 1);
  assertEquals(caught[1]?.pressureAfter, 2);

  world.emit("fishing:cast:request", { actor, itemId: rod, turns: 12, x: 3, y: 0 });
  for (let i = 0; i < 12; i++) channelingSystem(world);

  assertEquals(caught[2]?.tileProfile, "marsh");
  assertEquals(caught[2]?.pressureBefore, 0);
});

Deno.test("fishing use-action refuses non-water tiles", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);

  const world = new World({ seed: 3313 });
  const actor = createPlayer(world, { x: 0, y: 0, name: "Angler" });
  if (!world.has(actor, Inventory)) world.add(actor, Inventory, { capacity: 20 });
  if (!world.has(actor, Equipment)) world.add(actor, Equipment, {});

  const rod = buildCatalogItem(world, "fishing_rod");
  addToInventory(world, actor, rod);
  world.set(actor, Equipment, { ...world.get(actor, Equipment), weapon: rod });

  installFishingAction(world);
  const cancelled = [];
  world.on("item:use-cancelled", (ev) => cancelled.push(ev));

  world.emit("fishing:cast:request", { actor, itemId: rod, turns: 12, x: 1, y: 0 });

  assertEquals(world.has(actor, Channeling), false);
  assertEquals(cancelled[0]?.code, "FISHING_NO_WATER");
});

Deno.test("fishing rod use requires the rod to be equipped", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  setTile(1, 0, TILE_WATER);

  const world = new World({ seed: 3311 });
  const actor = createPlayer(world, { x: 0, y: 0, name: "Angler" });
  installFishingAbilityRuntime(world, actor);
  const rod = buildCatalogItem(world, "fishing_rod");
  addToInventory(world, actor, rod);

  const cancelled = [];
  world.on("item:use-cancelled", (ev) => cancelled.push(ev));

  world.add(actor, UseIntent, { itemId: rod });
  useItemSystem(world);

  assertEquals(world.has(actor, Channeling), false);
  assertEquals(cancelled[0]?.code, "FISHING_ROD_NOT_EQUIPPED");
});
