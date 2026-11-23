import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { configureWorld } from "../src/main/scheduler.js";
import { initDungeon } from "../src/rules/environment/dungeon/index.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { addToInventory, findInventoryRoot, inventoryItems } from "../src/rules/utils/inventoryFacade.js";
import { serializeWorld } from "../src/lib/ecs-js/serialization.js";
import { getSavegameRegistryNames, serializeSavegameWorld } from "../src/main/wiring/savegameSerializationRegistry.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { DropIntent } from "../src/rules/components/Intents/DropIntent.js";
import { playerEntity } from "../src/rules/utils/queries.js";
import { actorWetness, wetActor } from "../src/rules/utils/actorWetness.js";
import { FloodState } from "../src/rules/components/FloodState.js";
import { startFlood } from "../src/rules/systems/floodSystem.js";
import { CHUNK_SIZE, TILE_FLOOR, TILE_SHALLOW_WATER } from "../src/rules/environment/dungeon/constants.js";
import { clearAll, getTile, loadChunk, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import {
  SAVEGAME_KEY,
  hasSavegame,
  readSavegamePayload,
  clearSavegamePayload,
  readSavedDepth,
  readSavedSeed,
  restoreSnapshotFromSavegame,
} from "../src/main/wiring/savegameLoad.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function makeSave() {
  return {
    v: 1,
    world: {
      v: 1,
      meta: { seed: 0x1234abcd, frame: 0, time: 0, store: "map" },
      alive: [7, 11],
      comps: {
        Player: [[7, {}]],
        Position: [[7, { x: 3, y: 4 }]],
        DungeonState: [[11, { worldSeed: 0x1234abcd, currentDepth: 5, floorEntityIds: [] }]],
      },
    },
    app: { activeSpellId: "spell:fireball" },
  };
}

Deno.test("fresh save load restores flood terrain, its remaining volume, and carried wetness", () => {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  try {
    const world = new World({ seed: 42 });
    world.add(world.create(), DungeonState, { floodedTiles: {} });
    const player = createPlayer(world, { x: 4, y: 4 });
    const source = world.create();
    world.add(source, Position, { x: 5, y: 4 });
    wetActor(world, player, 0.5);
    startFlood(world, source, { volume: 2 });
    const save = { v: 1, world: serializeSavegameWorld(world) };
    setTile(5, 4, TILE_FLOOR);

    const restored = new World({ seed: 42 });
    restoreSnapshotFromSavegame(restored, save);
    assertEquals(getTile(5, 4), TILE_SHALLOW_WATER);
    assertEquals(restored.get(source, FloodState).remainingVolume, 1);
    assertEquals(actorWetness(restored, player), 0.5);
  } finally {
    clearAll();
  }
});

Deno.test("savegame storage helpers round-trip payload", () => {
  const store = memoryStorage();
  assert(!hasSavegame(store), "storage should start empty");

  const payload = makeSave();
  store.setItem(SAVEGAME_KEY, JSON.stringify(payload));
  assert(hasSavegame(store), "save marker should be visible");

  const read = readSavegamePayload(store);
  assert(read && read.v === 1, "parsed save payload should be returned");
  assertEquals(read?.world?.meta?.seed, payload.world.meta.seed);

  clearSavegamePayload(store);
  assert(!hasSavegame(store), "save should be removed");
  assertEquals(readSavegamePayload(store), null);
});

Deno.test("savegame seed/depth readers handle valid payload", () => {
  const payload = makeSave();
  assertEquals(readSavedSeed(payload), payload.world.meta.seed >>> 0);
  assertEquals(readSavedDepth(payload), 5);
});

Deno.test("restoreSnapshotFromSavegame replaces world state from snapshot", () => {
  const world = new World({ seed: 1 });
  const old = world.create();
  world.add(old, Position, { x: 99, y: 99 });

  const payload = makeSave();
  const originalFromSnapshot = World.fromSnapshot;
  let fromSnapshotCalls = 0;
  World.fromSnapshot = function (...args) {
    fromSnapshotCalls += 1;
    return originalFromSnapshot.apply(this, args);
  };
  try {
    restoreSnapshotFromSavegame(world, payload);
  } finally {
    World.fromSnapshot = originalFromSnapshot;
  }

  assert(!world.isAlive(old), "existing world state should be replaced");
  assertEquals(fromSnapshotCalls, 1, "restore should use World.fromSnapshot once");
  assert(world.isAlive(7), "saved player id should exist after restore");
  assert(world.get(7, Player), "player component should be restored");

  const pos = world.get(7, Position);
  assert(pos, "player position should exist");
  assertEquals(pos?.x, 3);
  assertEquals(pos?.y, 4);

  const ds = world.get(11, DungeonState);
  assert(ds, "dungeon state should be restored");
  assertEquals(ds?.currentDepth, 5);
});

Deno.test("restoreSnapshotFromSavegame rejects invalid player snapshot", () => {
  const world = new World({ seed: 1 });
  const bad = makeSave();
  bad.world.comps.Player = [];
  assertThrows(() => restoreSnapshotFromSavegame(world, bad), Error, "invalid save");
});

Deno.test("overworld dropped ground items persist through save/restore", async () => {
  const seed = 0xC0FFEE;
  const source = new World({ seed });
  configureWorld(source);
  const spawn = await initDungeon(source, { startDepth: 0 });
  createPlayer(source, { x: spawn.x, y: spawn.y, name: "Hero" });

  const pe = playerEntity(source);
  assert(pe, "player should exist");
  const inv = source.get(pe.id, Inventory);
  assert(inv && typeof inv.capacity === "number", "player inventory should exist");

  const itemId = createItemById(source, "gold", { count: 10 });
  assert(Number.isInteger(itemId) && itemId > 0, "gold item should be created");
  addToInventory(source, pe.id, itemId);
  source.add(pe.id, DropIntent, { itemId, count: 3 });
  source.tick(1);

  let droppedId = 0;
  for (const [id, pos, info, ni] of source.query(Position, ItemInfo, NamedIdentity)) {
    if (pos.x !== spawn.x || pos.y !== spawn.y) continue;
    if (ni.identity !== "gold") continue;
    if ((info.count | 0) !== 3) continue;
    droppedId = id;
    break;
  }
  assert(droppedId > 0, "expected dropped gold stack on the ground before save");

  const payload = {
    v: 1,
    world: serializeWorld(source, { include: getSavegameRegistryNames(source) }),
  };

  const restored = new World({ seed: readSavedSeed(payload) ?? seed });
  configureWorld(restored);
  await initDungeon(restored, { startDepth: readSavedDepth(payload) ?? 0 });
  restoreSnapshotFromSavegame(restored, payload);

  assert(restored.isAlive(droppedId), "dropped stack should be alive after restore");
  const pos = restored.get(droppedId, Position);
  const info = restored.get(droppedId, ItemInfo);
  const ni = restored.get(droppedId, NamedIdentity);
  assert(pos && pos.x === spawn.x && pos.y === spawn.y, "dropped stack position should match saved world");
  assert(ni?.identity === "gold", "dropped stack identity should persist");
  assert((info?.count | 0) === 3, "dropped stack count should persist");
});

Deno.test("restoreSnapshotFromSavegame normalizes legacy inventory payloads", () => {
  const source = new World({ seed: 0x4242 });
  configureWorld(source);
  const playerId = createPlayer(source, { x: 4, y: 5, name: "Hero" });
  const itemId = createItemById(source, "gold", { count: 7 });
  addToInventory(source, playerId, itemId);

  const payload = {
    v: 1,
    world: serializeWorld(source, { include: getSavegameRegistryNames(source) }),
  };

  payload.world.comps.InventoryBag = payload.world.comps.InventoryRoot;
  delete payload.world.comps.InventoryRoot;
  for (const row of payload.world.comps.Inventory || []) {
    if ((Number(row?.[0] || 0) | 0) !== playerId) continue;
    row[1].items = [itemId];
    row[1].maxWeight = 99;
    row[1].weightLimit = 99;
  }

  const restored = new World({ seed: 0x4242 });
  configureWorld(restored);
  restoreSnapshotFromSavegame(restored, payload);

  const restoredInv = restored.get(playerId, Inventory);
  assert(restoredInv, "inventory should restore");
  assert(!Object.prototype.hasOwnProperty.call(restoredInv, "items"), "legacy Inventory.items should be stripped");
  assert(!Object.prototype.hasOwnProperty.call(restoredInv, "maxWeight"), "legacy maxWeight should be stripped");
  assert(!Object.prototype.hasOwnProperty.call(restoredInv, "weightLimit"), "legacy weightLimit should be stripped");
  assert(findInventoryRoot(restored, playerId) > 0, "legacy InventoryBag should normalize to InventoryRoot");
  assertEquals(inventoryItems(restored, playerId), [itemId]);
});
