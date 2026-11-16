import { assert } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { shopkeeperSystem } from "../src/rules/systems/shopkeeperSystem.js";
import { configureWorld } from "../src/main/scheduler.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { RoomMetadata } from "../src/rules/components/RoomMetadata.js";
import { Unpaid } from "../src/rules/components/Unpaid.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Brain } from "../src/rules/components/Brain.js";
import { Collider } from "../src/rules/components/Collider.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { recordShopDebt } from "../src/rules/utils/shopDebt.js";
import { Alignment, LawChaosAxis, GoodEvilAxis } from "../src/rules/components/Alignment.js";
import { SleepState } from "../src/rules/components/SleepState.js";

function addShopkeeper(world, x = 3, y = 2, visionRange = 8) {
  const shopkeeperId = world.create();
  world.add(shopkeeperId, Position, { x, y });
  world.add(shopkeeperId, Brain, { visionRange, intelligence: 10 });
  return shopkeeperId;
}

Deno.test("shopkeeperSystem blocks exiting shop with unpaid items and emits invoice bill", () => {
  const world = new World({ seed: 42 });
  const playerId = world.create();
  const itemId = world.create();
  const shopkeeperId = addShopkeeper(world);

  world.add(playerId, Player, {});
  world.add(playerId, Position, { x: 2, y: 2 });
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, MoveIntent, { dx: -1, dy: 0 }); // move to x=1, outside room

  world.add(itemId, ItemInfo, { type: "equip", count: 1, value: 50 });
  world.add(itemId, Unpaid, { shopkeeperId, price: 75 });
  addToInventory(world, playerId, itemId);

  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 2,
    y: 2,
    w: 3,
    h: 3,
    shopkeeperId,
  });

  const blocked = [];
  world.on("shop:exit-blocked", (ev) => blocked.push(ev));

  shopkeeperSystem(world);

  assert(!world.has(playerId, MoveIntent), "move intent should be consumed when bill is unpaid");
  assert(blocked.length === 1, "shopkeeper should block exit once");
  assert(blocked[0].shopkeeperId === shopkeeperId, "event should include blocking shopkeeper");
  assert(blocked[0].bill === 75, "event should report unpaid invoice total");
});

Deno.test("scheduled tick keeps the player inside the shop when carrying unpaid stock", () => {
  const world = new World({ seed: 42 });
  configureWorld(world);

  const playerId = world.create();
  const itemId = world.create();
  const shopkeeperId = addShopkeeper(world);

  world.add(playerId, Player, {});
  world.add(playerId, Position, { x: 2, y: 2 });
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, MoveIntent, { dx: -1, dy: 0 });

  world.add(itemId, ItemInfo, { type: "equip", count: 1, value: 50 });
  world.add(itemId, Unpaid, { shopkeeperId, price: 75 });
  addToInventory(world, playerId, itemId);

  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 2,
    y: 2,
    w: 3,
    h: 3,
    shopkeeperId,
  });

  const blocked = [];
  world.on("shop:exit-blocked", (ev) => blocked.push(ev));

  world.tick(1);

  const pos = world.get(playerId, Position);
  assert(pos?.x === 2 && pos?.y === 2, "player should remain inside the shop after a blocked exit");
  assert(!world.has(playerId, MoveIntent), "move intent should be stripped before movement resolves");
  assert(blocked.length === 1, "scheduled tick should emit one blocked-exit event");
  assert(blocked[0].bill === 75, "blocked event should preserve the unpaid bill");
});

Deno.test("shopkeeperSystem allows exiting shop when player has no unpaid items", () => {
  const world = new World({ seed: 42 });
  const playerId = world.create();
  const shopkeeperId = addShopkeeper(world);

  world.add(playerId, Player, {});
  world.add(playerId, Position, { x: 2, y: 2 });
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, MoveIntent, { dx: -1, dy: 0 }); // move to x=1, outside room

  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 2,
    y: 2,
    w: 3,
    h: 3,
    shopkeeperId,
  });

  let blockedCount = 0;
  world.on("shop:exit-blocked", () => blockedCount++);

  shopkeeperSystem(world);

  assert(world.has(playerId, MoveIntent), "move intent should remain when nothing is unpaid");
  assert(blockedCount === 0, "no blocked event when invoice is zero");
});

Deno.test("shopkeeperSystem allows exiting with unpaid items when shopkeeper does not witness", () => {
  const world = new World({ seed: 42 });
  const playerId = world.create();
  const itemId = world.create();
  const shopkeeperId = addShopkeeper(world, 4, 2);
  const blocker = world.create();

  world.add(playerId, Player, {});
  world.add(playerId, Position, { x: 2, y: 2 });
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, MoveIntent, { dx: -1, dy: 0 });

  world.add(itemId, ItemInfo, { type: "equip", count: 1, value: 50 });
  world.add(itemId, Unpaid, { shopkeeperId, price: 75 });
  addToInventory(world, playerId, itemId);

  world.add(blocker, Position, { x: 3, y: 2 });
  world.add(blocker, Collider, { solid: true, blocksSight: true });

  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 2,
    y: 2,
    w: 3,
    h: 3,
    shopkeeperId,
  });

  const blocked = [];
  world.on("shop:exit-blocked", (ev) => blocked.push(ev));

  shopkeeperSystem(world);

  assert(world.has(playerId, MoveIntent), "unwitnessed shoplifting should not consume movement");
  assert(blocked.length === 0, "unwitnessed shoplifting should not emit blocked exit");
});

Deno.test("shopkeeperSystem allows leaving when the shopkeeper is asleep away from the shop", () => {
  const world = new World({ seed: 42 });
  const playerId = world.create();
  const itemId = world.create();
  const shopkeeperId = addShopkeeper(world, 4, 2);

  world.add(shopkeeperId, SleepState, { asleep: true });
  world.add(playerId, Player, {});
  world.add(playerId, Position, { x: 2, y: 2 });
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, MoveIntent, { dx: -1, dy: 0 });

  world.add(itemId, ItemInfo, { type: "equip", count: 1, value: 50 });
  world.add(itemId, Unpaid, { shopkeeperId, price: 75 });
  addToInventory(world, playerId, itemId);

  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 2,
    y: 2,
    w: 3,
    h: 3,
    shopkeeperId,
  });

  const blocked = [];
  world.on("shop:exit-blocked", (ev) => blocked.push(ev));

  shopkeeperSystem(world);

  assert(world.has(playerId, MoveIntent), "sleeping shopkeeper should not consume the exit move");
  assert(blocked.length === 0, "sleeping shopkeeper should not demand payment for an unattended shop");
});

Deno.test("shopkeeperSystem blocks exiting shop with unpaid attached debt even when item is gone", () => {
  const world = new World({ seed: 42 });
  const playerId = world.create();
  const shopkeeperId = addShopkeeper(world);

  world.add(playerId, Player, {});
  world.add(playerId, Position, { x: 2, y: 2 });
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, MoveIntent, { dx: -1, dy: 0 });

  recordShopDebt(world, {
    actorId: playerId,
    shopkeeperId,
    amount: 120,
    reason: "knowledge_theft",
    itemId: 1234,
    identity: "book_lightning",
    name: "Spellbook of Lightning",
  });

  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 2,
    y: 2,
    w: 3,
    h: 3,
    shopkeeperId,
  });

  const blocked = [];
  world.on("shop:exit-blocked", (ev) => blocked.push(ev));

  shopkeeperSystem(world);

  assert(!world.has(playerId, MoveIntent), "move intent should be consumed when attached debt is unpaid");
  assert(blocked.length === 1, "shopkeeper should block exit once");
  assert(blocked[0].shopkeeperId === shopkeeperId, "event should include blocking shopkeeper");
  assert(blocked[0].bill === 120, "event should report attached debt total");
});

Deno.test("shopkeeperSystem allows exit when shopkeeper extends credit", () => {
  const world = new World({ seed: 42 });
  const playerId = world.create();
  const shopkeeperId = addShopkeeper(world);

  world.add(playerId, Player, {});
  world.add(playerId, Position, { x: 2, y: 2 });
  world.add(playerId, Inventory, { capacity: 20 });
  world.add(playerId, Alignment, { lawChaos: LawChaosAxis.LAWFUL, goodEvil: GoodEvilAxis.GOOD });
  world.add(playerId, MoveIntent, { dx: -1, dy: 0 });

  recordShopDebt(world, {
    actorId: playerId,
    shopkeeperId,
    amount: 20,
    reason: "knowledge_theft",
    itemId: 1234,
    identity: "book_lightning",
    name: "Spellbook of Lightning",
  });

  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 2,
    y: 2,
    w: 3,
    h: 3,
    shopkeeperId,
  });

  const enforced = [];
  const blocked = [];
  const speech = [];
  world.on("shop:claim-enforced", (ev) => enforced.push(ev));
  world.on("shop:exit-blocked", (ev) => blocked.push(ev));
  world.on("npc:dialogue", (ev) => speech.push(ev));

  shopkeeperSystem(world);

  assert(world.has(playerId, MoveIntent), "move intent should remain when credit is extended");
  assert(enforced.length === 1, "credit decision should be emitted");
  assert(enforced[0].decision.kind === "credit_extended", "decision should extend credit");
  assert(blocked.length === 0, "credit should not emit blocked exit");
  assert(speech.length === 1, "shopkeeper should speak the credit decision");
  assert(speech[0].actor === shopkeeperId, "shopkeeper should be the speaker");
});
