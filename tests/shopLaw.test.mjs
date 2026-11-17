import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { RoomMetadata } from "../src/rules/components/RoomMetadata.js";
import { Unpaid } from "../src/rules/components/Unpaid.js";
import { Brain } from "../src/rules/components/Brain.js";
import { DrinkIntent } from "../src/rules/components/Intents/DrinkIntent.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { ThrowIntent } from "../src/rules/components/Intents/ThrowIntent.js";
import { Potion } from "../src/rules/components/Potion.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { drinkSystem } from "../src/rules/systems/drinkSystem.js";
import { shopkeeperSystem } from "../src/rules/systems/shopkeeperSystem.js";
import { throwSystem } from "../src/rules/systems/throwSystem.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { calculateShopDebt } from "../src/rules/utils/shopDebt.js";
import {
  installShopLawListeners,
  shopClaimRecords,
  shopIncidentRecords,
} from "../src/rules/utils/shopLaw.js";

function addShop(world, shopkeeperId) {
  world.add(shopkeeperId, Position, { x: 1, y: 2 });
  world.add(shopkeeperId, Brain, { visionRange: 8, intelligence: 10 });
  const roomId = world.create();
  world.add(roomId, RoomMetadata, {
    roomType: "shop",
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    shopkeeperId,
  });
  return roomId;
}

function addActor(world, x = 2, y = 2) {
  const actor = world.create();
  world.add(actor, Player, {});
  world.add(actor, Position, { x, y });
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  return actor;
}

function addTestItem(world, identity, name, value = 100) {
  const item = world.create();
  world.add(item, NamedIdentity, { identity, name });
  world.add(item, ItemInfo, {
    type: "item",
    slot: "",
    weight: 1,
    value,
    description: name,
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  return item;
}

Deno.test("shop law records claim and incident without debt when unpaid stock is thrown outside", () => {
  const world = new World({ seed: 9101 });
  installShopLawListeners(world);

  const shopkeeper = world.create();
  addShop(world, shopkeeper);
  const actor = addActor(world);

  const gem = addTestItem(world, "test_ruby", "Ruby", 250);
  world.add(gem, Unpaid, { shopkeeperId: shopkeeper, price: 250 });
  addToInventory(world, actor, gem);

  const escaped = [];
  const pursuit = [];
  world.on("shop:theft-escaped", (ev) => escaped.push(ev));
  world.on("shop:pursuit-requested", (ev) => pursuit.push(ev));

  world.add(actor, ThrowIntent, { itemId: gem, x: 6, y: 2 });
  throwSystem(world);

  assertEquals(calculateShopDebt(world, actor, shopkeeper), 0);
  const claims = shopClaimRecords(world, shopkeeper);
  assertEquals(claims.length, 1);
  assertEquals(claims[0].claimKind, "thrown_out");
  assertEquals(claims[0].debtId, 0);
  const incidents = shopIncidentRecords(world, shopkeeper);
  assertEquals(incidents.length, 1);
  assertEquals(incidents[0].reason, "thrown_out");
  assertEquals(incidents[0].evidence, "seen");
  assertEquals(escaped.length, 1);
  assertEquals(pursuit.length, 0);
});

Deno.test("shop law records a thrown unpaid stack unit without debt", () => {
  const world = new World({ seed: 9102 });
  installShopLawListeners(world);

  const shopkeeper = world.create();
  addShop(world, shopkeeper);
  const actor = addActor(world);

  const scrolls = buildCatalogItem(world, "scroll_mapping", { count: 3 });
  world.add(scrolls, Unpaid, { shopkeeperId: shopkeeper, price: 90 });
  addToInventory(world, actor, scrolls);

  world.add(actor, ThrowIntent, { itemId: scrolls, x: 6, y: 2 });
  throwSystem(world);

  const info = world.get(scrolls, ItemInfo);
  assertEquals(info.count, 2, "throw should remove one unit from the stack");
  assertEquals(calculateShopDebt(world, actor, shopkeeper), 0);
  const claims = shopClaimRecords(world, shopkeeper);
  assertEquals(claims.length, 1);
  assertEquals(claims[0].debtId, 0);
  const incidents = shopIncidentRecords(world, shopkeeper);
  assertEquals(incidents.length, 1);
  assertEquals(incidents[0].reason, "thrown_out");
});

Deno.test("shop law records an incident for unpaid potion consumption", () => {
  const world = new World({ seed: 9103 });
  installShopLawListeners(world);

  const shopkeeper = world.create();
  addShop(world, shopkeeper);
  const actor = addActor(world);

  const potion = world.create();
  world.add(potion, NamedIdentity, {
    identity: "potion_healing",
    name: "Healing Potion",
  });
  world.add(potion, Potion, {
    name: "Healing Potion",
    route: "oral",
    doses: 1,
    channels: [],
    effects: [],
    toxicity: null,
  });
  world.add(potion, ItemInfo, {
    type: "potion",
    slot: "",
    weight: 1,
    value: 10,
    description: "",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  world.add(potion, Unpaid, { shopkeeperId: shopkeeper, price: 45 });
  addToInventory(world, actor, potion);

  world.add(actor, DrinkIntent, { itemId: potion, targetId: 0 });
  drinkSystem(world);

  assertEquals(calculateShopDebt(world, actor, shopkeeper), 45);
  const incidents = shopIncidentRecords(world, shopkeeper);
  assertEquals(incidents.length, 1);
  assertEquals(incidents[0].reason, "consumed");
  assertEquals(incidents[0].evidence, "arcane_mark");
});

Deno.test("shop law records teleport exit with carried unpaid stock", () => {
  const world = new World({ seed: 9104 });
  installShopLawListeners(world);

  const shopkeeper = world.create();
  addShop(world, shopkeeper);
  const actor = addActor(world);

  const gem = addTestItem(world, "test_emerald", "Emerald", 300);
  world.add(gem, Unpaid, { shopkeeperId: shopkeeper, price: 300 });
  addToInventory(world, actor, gem);

  const escaped = [];
  world.on("shop:theft-escaped", (ev) => escaped.push(ev));
  world.emit("moved", { id: actor, from: { x: 2, y: 2 }, to: { x: 8, y: 2 } });

  const incidents = shopIncidentRecords(world, shopkeeper);
  assertEquals(incidents.length, 1);
  assertEquals(incidents[0].reason, "teleport_exit");
  assertEquals(incidents[0].amount, 300);
  assertEquals(escaped.length, 1);
});

Deno.test("walking exit behavior still blocks unpaid carried stock before movement", () => {
  const world = new World({ seed: 9105 });
  installShopLawListeners(world);

  const shopkeeper = world.create();
  addShop(world, shopkeeper);
  const actor = addActor(world, 0, 2);

  const gem = addTestItem(world, "test_ruby", "Ruby", 250);
  world.add(gem, Unpaid, { shopkeeperId: shopkeeper, price: 250 });
  addToInventory(world, actor, gem);

  world.add(actor, MoveIntent, { dx: -1, dy: 0 });
  shopkeeperSystem(world);

  assert(
    !world.has(actor, MoveIntent),
    "shopkeeper should still remove the move intent",
  );
  assertEquals(
    calculateShopDebt(world, actor, shopkeeper),
    0,
    "blocked walking exit should not create extraction debt",
  );
  assertEquals(
    shopIncidentRecords(world, shopkeeper).length,
    0,
    "blocked walking exit should not record an escape incident",
  );
});
