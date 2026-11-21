import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { configureWorld } from "../src/main/scheduler.js";
import { generateFloor } from "../src/rules/environment/dungeon/index.js";
import { initDungeon } from "../src/rules/environment/dungeon/index.js";
import { clearFloorCache, transitionToDepth } from "../src/rules/environment/dungeon/transition.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_DOOR, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { Collider } from "../src/rules/components/Collider.js";
import { DoorKey } from "../src/rules/components/DoorKey.js";
import { DoorLock } from "../src/rules/components/DoorLock.js";
import { DoorState } from "../src/rules/components/DoorState.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Interactable } from "../src/rules/components/Interactable.js";
import { InteractIntent } from "../src/rules/components/Intents/InteractIntent.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { PickupIntent } from "../src/rules/components/Intents/PickupIntent.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { RoomMetadata } from "../src/rules/components/RoomMetadata.js";
import { Unpaid } from "../src/rules/components/Unpaid.js";
import { TownfolkJob, TOWNFOLK_STATES } from "../src/rules/components/TownfolkJob.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { addToInventory, inventoryItems } from "../src/rules/utils/inventoryFacade.js";
import { interactionSystem } from "../src/rules/systems/interactionSystem.js";
import { aiTownfolkSystem, installTownfolkDoorListener } from "../src/rules/systems/aiTownfolkSystem.js";
import { cleanupSystem } from "../src/rules/systems/cleanupSystem.js";
import { shopkeeperSystem } from "../src/rules/systems/shopkeeperSystem.js";

function createKey(world, lockId, name = "Shop Key") {
  const keyId = world.create();
  world.add(keyId, NamedIdentity, { name, identity: `${name.toLowerCase().replace(/\s+/g, "_")}_${lockId}` });
  world.add(keyId, ItemInfo, { type: "tool", weight: 0.1, count: 1, description: "A shop key." });
  world.add(keyId, DoorKey, { lockId });
  return keyId;
}

function createDoor(world, x, y, lockId, locked = true) {
  const doorId = world.create();
  world.add(doorId, Position, { x, y });
  world.add(doorId, Interactable, { action: "toggleDoor", params: null });
  world.add(doorId, DoorState, { open: false, locked });
  world.add(doorId, Collider, { solid: true, blocksSight: true });
  world.add(doorId, DoorLock, { lockId });
  return doorId;
}

function isDoorOnRoomPerimeter(pos, room) {
  if (!pos || !room) return false;
  if (pos.x < room.x || pos.x >= room.x + room.w || pos.y < room.y || pos.y >= room.y + room.h) return false;
  return pos.x === room.x
    || pos.x === room.x + room.w - 1
    || pos.y === room.y
    || pos.y === room.y + room.h - 1;
}

function isInRoom(pos, room) {
  return pos && room
    && pos.x >= room.x
    && pos.x < room.x + room.w
    && pos.y >= room.y
    && pos.y < room.y + room.h;
}

Deno.test("matching shop key unlocks and opens the locked shop door", async () => {
  const world = new World({ seed: 7 });
  const actor = world.create();
  world.add(actor, Inventory, { capacity: 5 });

  const lockId = "overworld:shop:alchemist:10,10";
  const doorId = createDoor(world, 10, 10, lockId, true);
  addToInventory(world, actor, createKey(world, lockId, "Apothecary Key"));

  world.add(actor, InteractIntent, { targetId: doorId });
  interactionSystem(world);

  const door = world.get(doorId, DoorState);
  const collider = world.get(doorId, Collider);
  assertEquals(door.open, true);
  assertEquals(door.locked, false);
  assertEquals(collider.solid, false);
  assertEquals(collider.blocksSight, false);
});

Deno.test("shopkeeper locks their shop door behind them after moving off it", async () => {
  const world = new World({ seed: 8 });
  const actor = world.create();
  const lockId = "overworld:shop:gem_vendor:3,3";

  world.add(actor, Position, { x: 3, y: 4 });
  world.add(actor, Faction, { key: "townfolk" });
  world.add(actor, Inventory, { capacity: 5 });
  world.add(actor, TownfolkJob, {
    role: "gem_vendor",
    state: TOWNFOLK_STATES.idle,
    scheduleEnabled: false,
    homeX: 3, homeY: 4,
    bedX: 3, bedY: 4,
    workX: 3, workY: 4,
    workAuxX: 3, workAuxY: 4,
    pubX: 3, pubY: 4,
    targetX: 3, targetY: 4,
    workTurns: 0,
    idleTurns: 0,
    workSiteKind: "",
    routineKind: "",
    lastPhase: "",
    carrying: "",
    carryCount: 0,
    carryMax: 0,
    deliverX: 0,
    deliverY: 0,
    stuckTurns: 0,
  });
  addToInventory(world, actor, createKey(world, lockId, "Gem Shop Key"));

  const doorId = createDoor(world, 3, 3, lockId, false);
  world.set(doorId, DoorState, { open: true, locked: false });
  world.set(doorId, Collider, { solid: false, blocksSight: false });
  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 2,
    y: 1,
    w: 3,
    h: 3,
    shopkeeperId: actor,
  });

  installTownfolkDoorListener(world);
  world.emit("moved", { id: actor, from: { x: 3, y: 3 }, to: { x: 3, y: 4 } });

  const door = world.get(doorId, DoorState);
  const collider = world.get(doorId, Collider);
  assertEquals(door.open, false);
  assertEquals(door.locked, true);
  assertEquals(collider.solid, true);
  assertEquals(collider.blocksSight, true);
});

Deno.test("shopkeeper entering their shop closes the door without locking it", async () => {
  const world = new World({ seed: 81 });
  const actor = world.create();
  const lockId = "overworld:shop:alchemist:6,6";

  world.add(actor, Position, { x: 6, y: 5 });
  world.add(actor, Faction, { key: "townfolk" });
  world.add(actor, Inventory, { capacity: 5 });
  world.add(actor, TownfolkJob, {
    role: "alchemist",
    state: TOWNFOLK_STATES.idle,
    scheduleEnabled: false,
    homeX: 6, homeY: 5,
    bedX: 6, bedY: 5,
    workX: 6, workY: 5,
    workAuxX: 6, workAuxY: 5,
    pubX: 6, pubY: 5,
    targetX: 6, targetY: 5,
    workTurns: 0,
    idleTurns: 0,
    workSiteKind: "",
    routineKind: "",
    lastPhase: "",
    carrying: "",
    carryCount: 0,
    carryMax: 0,
    deliverX: 0,
    deliverY: 0,
    stuckTurns: 0,
  });
  addToInventory(world, actor, createKey(world, lockId, "Apothecary Key"));

  const doorId = createDoor(world, 6, 6, lockId, false);
  world.set(doorId, DoorState, { open: true, locked: false });
  world.set(doorId, Collider, { solid: false, blocksSight: false });
  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 5,
    y: 4,
    w: 3,
    h: 3,
    shopkeeperId: actor,
  });

  installTownfolkDoorListener(world);
  world.emit("moved", { id: actor, from: { x: 6, y: 6 }, to: { x: 6, y: 5 } });

  const door = world.get(doorId, DoorState);
  assertEquals(door.open, false);
  assertEquals(door.locked, false);
});

Deno.test("shopkeeper AI can unlock their own shop door with the matching key", async () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  tiles[5 * CHUNK_SIZE + 6] = TILE_DOOR;
  loadChunk(0, 0, tiles);

  const world = new World({ seed: 9 });
  const dungeonId = world.create();
  world.add(dungeonId, DungeonState, {
    worldSeed: 9,
    currentDepth: 0,
    profileType: "overworld",
    floorEntityIds: [],
    downStairPositions: [],
  });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });

  const actor = world.create();
  const lockId = "overworld:shop:alchemist:6,5";
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "townfolk" });
  world.add(actor, Inventory, { capacity: 5 });
  world.add(actor, Equipment, {});
  world.add(actor, TownfolkJob, {
    role: "alchemist",
    state: TOWNFOLK_STATES.walking,
    scheduleEnabled: false,
    homeX: 5, homeY: 5,
    bedX: 5, bedY: 5,
    workX: 7, workY: 5,
    workAuxX: 7, workAuxY: 5,
    pubX: 5, pubY: 5,
    targetX: 7,
    targetY: 5,
    workTurns: 0,
    idleTurns: 0,
    workSiteKind: "",
    routineKind: "",
    lastPhase: "",
    carrying: "",
    carryCount: 0,
    carryMax: 0,
    deliverX: 0,
    deliverY: 0,
    stuckTurns: 0,
  });
  addToInventory(world, actor, createKey(world, lockId, "Apothecary Key"));

  const doorId = createDoor(world, 6, 5, lockId, true);
  aiTownfolkSystem(world);

  const door = world.get(doorId, DoorState);
  assertEquals(door.open, true);
  assertEquals(door.locked, false);
  assert(!world.has(actor, MoveIntent), "opening the door should consume the action for this tick");
});

Deno.test("dead shopkeeper drops their shop key", async () => {
  const world = new World({ seed: 10 });
  const actor = world.create();
  const lockId = "overworld:shop:alchemist:12,9";

  world.add(actor, Position, { x: 12, y: 9 });
  world.add(actor, Inventory, { capacity: 5 });
  world.add(actor, Vitality, { maxHp: 10, hp: 0 });
  world.add(actor, NamedIdentity, { name: "Alchemist", identity: "townfolk_alchemist" });

  const keyId = createKey(world, lockId, "Apothecary Key");
  addToInventory(world, actor, keyId);

  cleanupSystem(world);

  const pos = world.get(keyId, Position);
  assert(pos, "key should be placed on the ground");
  const dx = Math.abs(pos.x - 12);
  const dy = Math.abs(pos.y - 9);
  assert(dx <= 2 && dy <= 2, `key should drop near shopkeeper (got ${pos.x},${pos.y}, expected within 2 of 12,9)`);
  assertEquals(world.get(keyId, DoorKey)?.lockId, lockId);
});

Deno.test("overworld shopkeepers get keyed locked shop doors after generation", async () => {
  clearAll();
  const world = new World({ seed: 0xC0FFEE });
  await generateFloor(world, world.seed >>> 0, 0);

  const shopkeepers = [
    ["alchemist", "townfolk_alchemist"],
    ["book_vendor", "townfolk_book_vendor"],
    ["enchantress", "townfolk_enchantress"],
    ["gem_vendor", "townfolk_gem_vendor"],
    ["general_vendor", "townfolk_general_vendor"],
  ];

  const idsByIdentity = new Map();
  for (const [id, named] of world.query(NamedIdentity)) {
    idsByIdentity.set(named.identity, id);
  }

  for (const [role, identity] of shopkeepers) {
    const shopkeeperId = idsByIdentity.get(identity) || 0;
    assert(shopkeeperId > 0, `expected ${role} to spawn`);

    const keyIds = inventoryItems(world, shopkeeperId)
      .filter((itemId) => String(world.get(itemId, DoorKey)?.lockId || "").includes(role));
    assertEquals(keyIds.length, 1, `${role} should have exactly one matching shop key`);

    let shopRoom = null;
    for (const [, room] of world.query(RoomMetadata)) {
      if (room.roomType === "shop" && room.shopkeeperId === shopkeeperId) {
        shopRoom = room;
        break;
      }
    }
    assert(shopRoom, `expected ${role} shop room metadata`);

    let shopDoorId = 0;
    const expectedLockId = world.get(keyIds[0], DoorKey)?.lockId;
    for (const [id, lock] of world.query(DoorLock)) {
      if (String(lock?.lockId || "") === String(expectedLockId || "")) {
        shopDoorId = id;
        break;
      }
    }
    assert(shopDoorId > 0, `expected a physical ${role} shop door`);

    const doorState = world.get(shopDoorId, DoorState);
    const doorLock = world.get(shopDoorId, DoorLock);
    assertEquals(doorState.open, false, `${role} shop door should start closed`);
    assertEquals(doorState.locked, true, `${role} shop door should start locked`);
    assert(doorLock?.lockId?.includes(role), `expected ${role} shop door lock to be assigned`);
    assertEquals(world.get(keyIds[0], DoorKey)?.lockId, doorLock.lockId);
  }
});

Deno.test("overworld book vendor gets a keyed locked shop door and owned stock after generation", async () => {
  clearAll();
  const world = new World({ seed: 0xC0FFEE });
  await generateFloor(world, world.seed >>> 0, 0);

  let bookVendorId = 0;
  for (const [id, named] of world.query(NamedIdentity)) {
    if (named.identity === "townfolk_book_vendor") {
      bookVendorId = id;
      break;
    }
  }
  assert(bookVendorId > 0, "expected book vendor to spawn");

  const keyIds = inventoryItems(world, bookVendorId)
    .filter((itemId) => String(world.get(itemId, DoorKey)?.lockId || "").includes("book_vendor"));
  assertEquals(keyIds.length, 1, "book vendor should have exactly one matching shop key");

  let shopRoom = null;
  for (const [, room] of world.query(RoomMetadata)) {
    if (room.roomType === "shop" && room.shopkeeperId === bookVendorId) {
      shopRoom = room;
      break;
    }
  }
  assert(shopRoom, "expected book vendor shop room metadata");

  let shopDoorId = 0;
  for (const [id, pos] of world.query(Position, DoorState)) {
    if (isDoorOnRoomPerimeter(pos, shopRoom)) {
      shopDoorId = id;
      break;
    }
  }
  assert(shopDoorId > 0, "expected a physical book shop door");

  const doorState = world.get(shopDoorId, DoorState);
  const doorLock = world.get(shopDoorId, DoorLock);
  assertEquals(doorState.open, false);
  assertEquals(doorState.locked, true);
  assert(doorLock?.lockId?.includes("book_vendor"), "expected book shop door lock to be assigned");
  assertEquals(world.get(keyIds[0], DoorKey)?.lockId, doorLock.lockId);

  let ownedBookStock = 0;
  for (const [itemId, unpaid, pos, info] of world.query(Unpaid, Position, ItemInfo)) {
    if (Number(unpaid.shopkeeperId || 0) !== bookVendorId) continue;
    if (!shopRoom) continue;
    if (pos.x < shopRoom.x || pos.x >= shopRoom.x + shopRoom.w || pos.y < shopRoom.y || pos.y >= shopRoom.y + shopRoom.h) continue;
    const kind = String(info.type || "");
    if (kind !== "book" && kind !== "learn" && kind !== "scroll") continue;
    ownedBookStock++;
  }
  assert(ownedBookStock > 0, "expected the bookseller to own unpaid book or scroll stock inside the shop");
});

Deno.test("overworld bookseller blocks leaving with unpaid stock", async () => {
  clearAll();
  const world = new World({ seed: 0xC0FFEE });
  configureWorld(world);
  await initDungeon(world, { startDepth: 0 });

  let bookVendorId = 0;
  let shopRoom = null;
  let stolenItemId = 0;
  let stolenItemPos = null;
  let doorId = 0;
  for (const [id, named] of world.query(NamedIdentity)) {
    if (named.identity === "townfolk_book_vendor") {
      bookVendorId = id;
      break;
    }
  }
  assert(bookVendorId > 0, "expected book vendor to spawn");

  for (const [, room] of world.query(RoomMetadata)) {
    if (room.roomType === "shop" && room.shopkeeperId === bookVendorId) {
      shopRoom = room;
      break;
    }
  }
  assert(shopRoom, "expected bookseller shop room");

  for (const [itemId, unpaid, pos, info] of world.query(Unpaid, Position, ItemInfo)) {
    if (Number(unpaid.shopkeeperId || 0) !== bookVendorId) continue;
    if (pos.x < shopRoom.x || pos.x >= shopRoom.x + shopRoom.w || pos.y < shopRoom.y || pos.y >= shopRoom.y + shopRoom.h) continue;
    const kind = String(info.type || "");
    if (kind !== "book" && kind !== "learn" && kind !== "scroll") continue;
    stolenItemId = itemId;
    stolenItemPos = { x: pos.x, y: pos.y };
    break;
  }
  assert(stolenItemId > 0, "expected unpaid bookseller stock");
  assert(stolenItemPos, "expected bookseller stock position");

  for (const [id, pos, , lock] of world.query(Position, DoorState, DoorLock)) {
    if (String(lock?.lockId || "").includes("book_vendor")) {
      doorId = id;
      break;
    }
  }
  assert(doorId > 0, "expected a physical book shop door");
  world.set(doorId, DoorState, { open: true, locked: false });
  world.set(doorId, Collider, { solid: false, blocksSight: false });

  const playerId = world.create();
  world.add(playerId, Player, {});
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, Position, stolenItemPos);

  const blocked = [];
  world.on("shop:exit-blocked", (ev) => blocked.push(ev));

  world.add(playerId, PickupIntent, { targetId: stolenItemId });
  world.tick(1);

  const doorPos = world.get(doorId, Position);
  assert(doorPos, "expected book shop door position");

  // Teleport player to door tile — pathfinding is not the point of this test.
  world.set(playerId, Position, { x: doorPos.x, y: doorPos.y });

  const insideDoorPos = world.get(playerId, Position);
  let exitDx = 0;
  let exitDy = 0;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = insideDoorPos.x + dx;
    const ny = insideDoorPos.y + dy;
    const stillInside = nx >= shopRoom.x && nx < shopRoom.x + shopRoom.w && ny >= shopRoom.y && ny < shopRoom.y + shopRoom.h;
    if (!stillInside) {
      exitDx = dx;
      exitDy = dy;
      break;
    }
  }
  assert(exitDx !== 0 || exitDy !== 0, "expected shop door to border an exterior tile");
  world.add(playerId, MoveIntent, { dx: exitDx, dy: exitDy });
  world.tick(1);

  assertEquals(blocked.length, 1, "bookseller should block leaving with unpaid stock");
  assertEquals(blocked[0].shopkeeperId, bookVendorId);
  assertEquals(world.get(playerId, Position), insideDoorPos, "blocked exit should keep the player on the interior door tile");
});

Deno.test("restored overworld shop retains witness and unpaid ownership links", async () => {
  clearAll();
  clearFloorCache();
  const world = new World({ seed: 0xC0FFEE });
  configureWorld(world);
  await initDungeon(world, { startDepth: 0 });

  const playerId = world.create();
  world.add(playerId, Player, {});
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, Position, { x: 0, y: 0 });

  await transitionToDepth(world, 1, { x: 0, y: 0 });
  await transitionToDepth(world, 0, { x: 0, y: 0 });

  let bookVendorId = 0;
  for (const [id, named] of world.query(NamedIdentity)) {
    if (named.identity === "townfolk_book_vendor") {
      bookVendorId = id;
      break;
    }
  }
  assert(bookVendorId > 0, "expected restored book vendor");

  let shopRoom = null;
  for (const [, room] of world.query(RoomMetadata)) {
    if (room.roomType === "shop" && room.shopkeeperId === bookVendorId) {
      shopRoom = room;
      break;
    }
  }
  assert(shopRoom, "restored shop room should reference the restored vendor id");

  let unpaidItemId = 0;
  for (const [itemId, unpaid] of world.query(Unpaid)) {
    if (unpaid.shopkeeperId !== bookVendorId) continue;
    unpaidItemId = itemId;
    break;
  }
  assert(unpaidItemId > 0, "restored unpaid stock should reference the restored vendor id");

  let doorId = 0;
  for (const [id, pos] of world.query(Position, DoorState)) {
    if (!isDoorOnRoomPerimeter(pos, shopRoom)) continue;
    doorId = id;
    break;
  }
  assert(doorId > 0, "expected restored shop door");
  world.set(doorId, DoorState, { open: true, locked: false });
  world.set(doorId, Collider, { solid: false, blocksSight: false });
  addToInventory(world, playerId, unpaidItemId);

  const doorPos = world.get(doorId, Position);
  world.set(playerId, Position, { x: doorPos.x, y: doorPos.y });
  let exitDx = 0;
  let exitDy = 0;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = doorPos.x + dx;
    const ny = doorPos.y + dy;
    if (nx >= shopRoom.x && nx < shopRoom.x + shopRoom.w && ny >= shopRoom.y && ny < shopRoom.y + shopRoom.h) continue;
    exitDx = dx;
    exitDy = dy;
    break;
  }
  world.add(playerId, MoveIntent, { dx: exitDx, dy: exitDy });

  shopkeeperSystem(world);

  assert(!world.has(playerId, MoveIntent), "restored visible vendor should block an unpaid exit");
});

Deno.test("held unpaid stock remaps to restored shopkeeper after dungeon round-trip", async () => {
  clearAll();
  clearFloorCache();
  const world = new World({ seed: 0xC0FFEE });
  configureWorld(world);
  await initDungeon(world, { startDepth: 0 });

  const playerId = world.create();
  world.add(playerId, Player, {});
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, Position, { x: 0, y: 0 });

  let originalBookVendorId = 0;
  for (const [id, named] of world.query(NamedIdentity)) {
    if (named.identity === "townfolk_book_vendor") {
      originalBookVendorId = id;
      break;
    }
  }
  assert(originalBookVendorId > 0, "expected original book vendor");

  let heldItemId = 0;
  for (const [itemId, unpaid] of world.query(Unpaid)) {
    if (unpaid.shopkeeperId !== originalBookVendorId) continue;
    heldItemId = itemId;
    break;
  }
  assert(heldItemId > 0, "expected book stock owned by the original vendor");
  addToInventory(world, playerId, heldItemId);

  await transitionToDepth(world, 1, { x: 0, y: 0 });
  await transitionToDepth(world, 0, { x: 0, y: 0 });

  const restoredUnpaid = world.get(heldItemId, Unpaid);
  assert(restoredUnpaid, "held stock should remain unpaid after transition");
  assert(restoredUnpaid.shopkeeperId !== originalBookVendorId, "held stock should remap away from the destroyed vendor id");

  const restoredBookVendorId = restoredUnpaid.shopkeeperId;
  let shopRoom = null;
  for (const [, room] of world.query(RoomMetadata)) {
    if (room.roomType === "shop" && room.shopkeeperId === restoredBookVendorId) {
      shopRoom = room;
      break;
    }
  }
  assert(shopRoom, "restored shop room should reference the remapped vendor");

  let doorId = 0;
  for (const [id, pos] of world.query(Position, DoorState)) {
    if (!isDoorOnRoomPerimeter(pos, shopRoom)) continue;
    doorId = id;
    break;
  }
  assert(doorId > 0, "expected restored shop door");
  world.set(doorId, DoorState, { open: true, locked: false });
  world.set(doorId, Collider, { solid: false, blocksSight: false });

  const doorPos = world.get(doorId, Position);
  world.set(playerId, Position, { x: doorPos.x, y: doorPos.y });
  let exitDx = 0;
  let exitDy = 0;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const next = { x: doorPos.x + dx, y: doorPos.y + dy };
    if (isInRoom(next, shopRoom)) continue;
    exitDx = dx;
    exitDy = dy;
    break;
  }
  assert(exitDx !== 0 || exitDy !== 0, "expected shop door to border an exterior tile");

  const blocked = [];
  world.on("shop:exit-blocked", (ev) => blocked.push(ev));
  world.add(playerId, MoveIntent, { dx: exitDx, dy: exitDy });
  world.tick(1);

  assertEquals(blocked.length, 1, "restored shopkeeper should block held unpaid stock");
  assertEquals(blocked[0].shopkeeperId, restoredBookVendorId);
  assertEquals(world.get(playerId, Position), doorPos, "scheduled movement should keep the player inside the restored shop");
});

Deno.test("overworld shopkeepers sleep in cottage homes outside their shops", async () => {
  clearAll();
  clearFloorCache();
  const world = new World({ seed: 0xC0FFEE });
  await generateFloor(world, world.seed >>> 0, 0);

  const shopkeeperRoles = new Set(["alchemist", "gem_vendor", "book_vendor", "general_vendor", "enchantress"]);
  let checked = 0;
  for (const [id, job] of world.query(TownfolkJob)) {
    if (!shopkeeperRoles.has(job.role)) continue;
    let shopRoom = null;
    for (const [, room] of world.query(RoomMetadata)) {
      if (room.roomType === "shop" && room.shopkeeperId === id) {
        shopRoom = room;
        break;
      }
    }
    assert(shopRoom, `expected shop room for ${job.role}`);
    assert(!isInRoom({ x: job.homeX, y: job.homeY }, shopRoom), `${job.role} home should be outside the shop`);
    assert(!isInRoom({ x: job.bedX, y: job.bedY }, shopRoom), `${job.role} bed should be outside the shop`);
    checked++;
  }
  assert(checked >= 5, "expected all overworld shopkeepers to be checked");
});

Deno.test("overworld herbalist does not get the apothecary key", async () => {
  clearAll();
  const world = new World({ seed: 0xC0FFEE });
  await generateFloor(world, world.seed >>> 0, 0);

  let herbalistId = 0;
  let alchemistId = 0;
  for (const [id, named] of world.query(NamedIdentity)) {
    if (named.identity === "townfolk_herbalist") herbalistId = id;
    if (named.identity === "townfolk_alchemist") alchemistId = id;
  }
  assert(herbalistId > 0, "expected herbalist to spawn");
  assert(alchemistId > 0, "expected alchemist to spawn");

  let shopRoom = null;
  for (const [, room] of world.query(RoomMetadata)) {
    if (room.roomType === "shop" && room.shopkeeperId === alchemistId) {
      shopRoom = room;
      break;
    }
  }
  assert(shopRoom, "expected apothecary shop room metadata");

  let shopDoorId = 0;
  for (const [id, pos] of world.query(Position, DoorState)) {
    if (isDoorOnRoomPerimeter(pos, shopRoom)) {
      shopDoorId = id;
      break;
    }
  }
  assert(shopDoorId > 0, "expected a physical apothecary door");

  const doorLock = world.get(shopDoorId, DoorLock);
  const matchingKeyIds = inventoryItems(world, herbalistId)
    .filter((itemId) => String(world.get(itemId, DoorKey)?.lockId || "") === String(doorLock?.lockId || ""));
  assertEquals(matchingKeyIds.length, 0, "herbalist should not have apothecary access");
});

function addScheduledGemVendorShop(step) {
  const world = new World({ seed: 11 });
  const dungeonId = world.create();
  world.add(dungeonId, DungeonState, {
    worldSeed: 11,
    currentDepth: 0,
    profileType: "overworld",
    floorEntityIds: [],
    downStairPositions: [],
  });
  world.step = step;

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 11, y: 11 });

  const actor = world.create();
  world.add(actor, Faction, { key: "townfolk" });
  world.add(actor, Position, { x: 10, y: 10 });
  world.add(actor, TownfolkJob, {
    role: "gem_vendor",
    state: TOWNFOLK_STATES.idle,
    scheduleEnabled: true,
    homeX: 2, homeY: 2,
    bedX: 2, bedY: 2,
    workX: 10, workY: 10,
    workAuxX: 10, workAuxY: 10,
    pubX: 20, pubY: 20,
    targetX: 2, targetY: 2,
    workTurns: 0,
    idleTurns: 0,
    workSiteKind: "",
    routineKind: "",
    lastPhase: "",
    carrying: "",
    carryCount: 0,
    carryMax: 0,
    deliverX: 0,
    deliverY: 0,
    stuckTurns: 0,
  });

  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 9,
    y: 9,
    w: 4,
    h: 4,
    shopkeeperId: actor,
  });

  return { world, actor };
}

Deno.test("scheduled gem vendor stays in the shop while the player is inside during shop hours", async () => {
  const { world, actor } = addScheduledGemVendorShop(222);

  aiTownfolkSystem(world);

  const job = world.get(actor, TownfolkJob);
  assertEquals(world.has(actor, MoveIntent), false, "gem vendor should not leave while serving a customer");
  assertEquals(job.targetX, 10);
  assertEquals(job.targetY, 10);
  assertEquals(job.routineKind, "tend_stall");
});

Deno.test("scheduled gem vendor follows after-hours schedule when not already serving", async () => {
  const { world, actor } = addScheduledGemVendorShop(100);

  aiTownfolkSystem(world);

  const job = world.get(actor, TownfolkJob);
  assertEquals(world.has(actor, MoveIntent), true, "after-hours gem vendor should leave the shop for schedule");
  assertEquals(job.targetX, 2);
  assertEquals(job.targetY, 2);
  assertEquals(job.routineKind, "sleep");
});
