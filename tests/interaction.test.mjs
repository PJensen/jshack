import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Interactable } from "../src/rules/components/Interactable.js";
import { InteractIntent } from "../src/rules/components/Intents/InteractIntent.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { DoorState } from "../src/rules/components/DoorState.js";
import { DoorLock } from "../src/rules/components/DoorLock.js";
import { Collider } from "../src/rules/components/Collider.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { HarvestNode } from "../src/rules/components/HarvestNode.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Mana } from "../src/rules/components/Mana.js";
import { Stamina } from "../src/rules/components/Stamina.js";
import { Hunger } from "../src/rules/components/Hunger.js";
import { Player } from "../src/rules/components/Player.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Beatitude } from "../src/rules/components/Beatitude.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { Potion } from "../src/rules/components/Potion.js";
import { Consumable } from "../src/rules/components/Consumable.js";
import { FoodDecay } from "../src/rules/components/FoodDecay.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { ObjectState } from "../src/rules/components/ObjectState.js";
import { FountainState } from "../src/rules/components/FountainState.js";
import { AltarOfferingState } from "../src/rules/components/AltarOfferingState.js";
import { ScriptRef } from "../src/rules/components/ScriptRef.js";
import { FountainDrinkResolved } from "../src/events/FountainDrinkResolved.js";
import { FountainDried } from "../src/events/FountainDried.js";
import { FountainRefilled } from "../src/events/FountainRefilled.js";
import { InteractionChoicePrompted } from "../src/events/InteractionChoicePrompted.js";
import { SarcophagusInteractionResolved } from "../src/events/SarcophagusInteractionResolved.js";
import { sarcophagusOpenRule } from "../src/content/interactables/crypt/index.js";
import { executeVerbRule } from "../src/rules/kernel/verbRule.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { Devotion } from "../src/rules/components/Devotion.js";
import { Owner } from "../src/rules/components/Owner.js";
import { Pet } from "../src/rules/components/Pet.js";
import { createFrom } from "../src/lib/ecs-js/archetype.js";
import { clearAll, loadChunk, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import {
  CHUNK_SIZE,
  TILE_FLOOR,
  TILE_WALL,
} from "../src/rules/environment/dungeon/constants.js";
import {
  EmberRoot,
  Moonleaf,
  ThornPods,
  VenomFronds,
  WildBerries,
  WildHerbs,
} from "../src/rules/archetypes/Food.js";
import {
  installBumpInteractListener,
  interactionSystem,
} from "../src/rules/systems/interactionSystem.js";
import { useItemSystem } from "../src/rules/systems/useItemSystem.js";
import { fountainRegrowthSystem } from "../src/rules/systems/fountainRegrowthSystem.js";
import {
  deitySystem,
  getDeityInstance,
  initDeity,
} from "../src/rules/systems/deitySystem.js";
import { buildWorldView } from "../src/bridge/schema/worldView.js";
import { TURNS_PER_DAY } from "../src/rules/data/calendar.js";
import { registerScript, ScriptVerb } from "../src/rules/scripting.js";
import {
  addToInventory,
  getStackCount,
  inventoryContains,
  inventoryItems,
} from "../src/rules/utils/inventoryFacade.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { LockpickPrompted } from "../src/events/LockpickPrompted.js";
import { LockpickResolved } from "../src/events/LockpickResolved.js";
import { BedSleepRequested } from "../src/events/BedSleepRequested.js";
import { snapshotEffectInstances } from "../src/rules/utils/effectInstances.js";

function makeLockedShopDoor(world, role = "gem_vendor") {
  const door = world.create();
  world.add(door, Interactable, { action: "toggleDoor", params: null });
  world.add(door, DoorState, { open: false, locked: true });
  world.add(door, DoorLock, { lockId: `overworld:shop:${role}:10,12` });
  world.add(door, Collider, { solid: true, blocksSight: true });
  return door;
}

function giveLockpicks(world, actor, count) {
  if (!world.has(actor, Inventory)) world.add(actor, Inventory, { capacity: 20 });
  const itemId = createItemById(world, "lockpick", { count });
  assert(itemId > 0, "lockpick catalog item should materialize");
  assert(addToInventory(world, actor, itemId), "actor should accept lockpick stack");
}

Deno.test("toggle door: closed → open → closed", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  const door = world.create();
  world.add(door, Interactable, { action: "toggleDoor", params: null });
  world.add(door, DoorState, { open: false, locked: false });
  world.add(door, Collider, { solid: true, blocksSight: true });

  // Open
  world.add(actor, InteractIntent, { targetId: door });
  interactionSystem(world);

  let ds = world.get(door, DoorState);
  let col = world.get(door, Collider);
  assert(ds.open === true, `door should be open, got ${ds.open}`);
  assert(col.solid === false, "open door should not be solid");
  assert(col.blocksSight === false, "open door should not block sight");
  assert(
    !world.has(actor, InteractIntent),
    "InteractIntent should be consumed",
  );

  // Close
  world.add(actor, InteractIntent, { targetId: door });
  interactionSystem(world);

  ds = world.get(door, DoorState);
  col = world.get(door, Collider);
  assert(ds.open === false, "door should be closed again");
  assert(col.solid === true, "closed door should be solid");
  assert(col.blocksSight === true, "closed door should block sight");
});

Deno.test("locked door stays closed and emits locked event", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  const door = world.create();
  world.add(door, Interactable, { action: "toggleDoor", params: null });
  world.add(door, DoorState, { open: false, locked: true });
  world.add(door, Collider, { solid: true, blocksSight: true });

  world.add(actor, InteractIntent, { targetId: door });

  const events = [];
  world.on("interaction", (e) => events.push(e));
  interactionSystem(world);

  const ds = world.get(door, DoorState);
  assert(ds.open === false, "locked door should stay closed");
  assert(
    events.some((e) => e.result === "locked"),
    "should emit locked interaction event",
  );
});

Deno.test("locked shop doors prompt lockpicking when actor has a lockpick", () => {
  for (const role of ["alchemist", "book_vendor", "enchantress", "gem_vendor", "general_vendor"]) {
    const world = new World({ seed: 1 });

    const actor = world.create();
    const door = makeLockedShopDoor(world, role);
    giveLockpicks(world, actor, 1);

    const prompts = [];
    const interactions = [];
    world.on(LockpickPrompted, (event) => prompts.push(event));
    world.on("interaction", (event) => interactions.push(event));
    world.add(actor, InteractIntent, { targetId: door });
    interactionSystem(world);

    const ds = world.get(door, DoorState);
    assertEquals(prompts.length, 1, `${role} should prompt lockpicking`);
    assertEquals(prompts[0].actor, actor);
    assertEquals(prompts[0].targetId, door);
    assertEquals(prompts[0].difficulty, "easy");
    assertEquals(prompts[0].pins, 4);
    assertEquals(ds.open, false);
    assertEquals(ds.locked, true);
    assertEquals(getStackCount(world, actor, "lockpick"), 1);
    assertEquals(interactions.some((event) => event.result === "locked"), false);
  }
});

Deno.test("locked shop door reports missing lockpick instead of opening lockpicking", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  world.add(actor, Inventory, { capacity: 20 });
  const door = makeLockedShopDoor(world);

  const prompts = [];
  const interactions = [];
  world.on(LockpickPrompted, (event) => prompts.push(event));
  world.on("interaction", (event) => interactions.push(event));
  world.add(actor, InteractIntent, { targetId: door });
  interactionSystem(world);

  const ds = world.get(door, DoorState);
  assertEquals(prompts.length, 0);
  assertEquals(ds.open, false);
  assertEquals(ds.locked, true);
  assert(interactions.some((event) => event.result === "need_lockpick"));
});

Deno.test("successful lockpick result consumes one lockpick and opens shop doors", () => {
  for (const role of ["alchemist", "book_vendor", "enchantress", "gem_vendor", "general_vendor"]) {
    const world = new World({ seed: 1 });

    const actor = world.create();
    const door = makeLockedShopDoor(world, role);
    giveLockpicks(world, actor, 2);

    const resolved = [];
    world.on(LockpickResolved, (event) => resolved.push(event));
    world.add(actor, InteractIntent, {
      targetId: door,
      mode: "lockpickResult",
      success: true,
      reason: "unlocked",
    });
    interactionSystem(world);

    const ds = world.get(door, DoorState);
    const collider = world.get(door, Collider);
    assertEquals(ds.open, true, `${role} should open after successful lockpick`);
    assertEquals(ds.locked, false);
    assertEquals(collider.solid, false);
    assertEquals(collider.blocksSight, false);
    assertEquals(getStackCount(world, actor, "lockpick"), 1);
    assertEquals(resolved.length, 1);
    assertEquals(resolved[0].success, true);
    assertEquals(resolved[0].consumed, 1);
  }
});

Deno.test("failed lockpick result consumes one lockpick and leaves shop door locked", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  const door = makeLockedShopDoor(world);
  giveLockpicks(world, actor, 1);

  const resolved = [];
  const interactions = [];
  world.on(LockpickResolved, (event) => resolved.push(event));
  world.on("interaction", (event) => interactions.push(event));
  world.add(actor, InteractIntent, {
    targetId: door,
    mode: "lockpickResult",
    success: false,
    reason: "jammed",
  });
  interactionSystem(world);

  const ds = world.get(door, DoorState);
  const collider = world.get(door, Collider);
  assertEquals(ds.open, false);
  assertEquals(ds.locked, true);
  assertEquals(collider.solid, true);
  assertEquals(collider.blocksSight, true);
  assertEquals(getStackCount(world, actor, "lockpick"), 0);
  assertEquals(resolved.length, 1);
  assertEquals(resolved[0].success, false);
  assertEquals(resolved[0].reason, "jammed");
  assertEquals(resolved[0].consumed, 1);
  assert(interactions.some((event) => event.result === "locked"));
});

Deno.test("open chest spills items and emits chest:burst event", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  const chest = world.create();
  world.add(chest, Interactable, { action: "openChest", params: {} });
  world.add(chest, Inventory, { capacity: 20 });
  world.add(chest, Position, { x: 10, y: 7 });
  const ci1 = world.create();
  world.add(ci1, ItemInfo, { type: "equip", count: 1 });
  const ci2 = world.create();
  world.add(ci2, ItemInfo, { type: "equip", count: 1 });
  addToInventory(world, chest, ci1);
  addToInventory(world, chest, ci2);

  world.add(actor, InteractIntent, { targetId: chest });
  const chestEvents = [];
  world.on("chest:burst", (e) => chestEvents.push(e));
  interactionSystem(world);

  assert(chestEvents.length === 1, "should emit chest:open event");
  assert(chestEvents[0].targetId === chest, "event should reference the chest");
  assert(chestEvents[0].drops.length === 2, "should include spilled drops");
  assertEquals(inventoryItems(world, chest).length, 0, "chest should be emptied");
  for (const drop of chestEvents[0].drops) {
    const pos = world.get(drop.itemId, Position);
    assert(pos, "drop should have a ground position");
    assert(
      Math.abs((pos.x | 0) - 10) <= 2 && Math.abs((pos.y | 0) - 7) <= 2,
      "drop should land near chest origin",
    );
  }
});

Deno.test("burst chest is consumed after opening", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  const chest = world.create();
  world.add(chest, Interactable, { action: "openChest", params: {} });
  world.add(chest, Collider, { solid: true, blocksSight: false });
  world.add(chest, Inventory, { capacity: 20 });
  world.add(chest, Position, { x: 4, y: 9 });
  const ci = world.create();
  world.add(ci, ItemInfo, { type: "equip", count: 1 });
  addToInventory(world, chest, ci);

  world.add(actor, InteractIntent, { targetId: chest });
  interactionSystem(world);

  assertEquals(world.has(chest, Interactable), false, "burst chest should stop being interactable");
  assertEquals(world.has(chest, Collider), false, "burst chest should stop blocking bump movement");
});

Deno.test("inventory chest mode keeps UI chest behavior", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  const chest = world.create();
  world.add(chest, Interactable, { action: "openChest", params: { inventoryChest: true } });
  world.add(chest, Collider, { solid: true, blocksSight: false });
  world.add(chest, Inventory, { capacity: 20 });
  world.add(chest, Position, { x: 4, y: 9 });

  let openCount = 0;
  let burstCount = 0;
  world.on("chest:open", () => { openCount += 1; });
  world.on("chest:burst", () => { burstCount += 1; });

  world.add(actor, InteractIntent, { targetId: chest });
  interactionSystem(world);

  assertEquals(openCount, 1, "inventory chest should emit chest:open");
  assertEquals(burstCount, 0, "inventory chest should not burst-spill");
  assertEquals(world.has(chest, Interactable), true, "inventory chest should remain interactable");
  assertEquals(world.has(chest, Collider), true, "inventory chest should remain collidable");
});

Deno.test("chest:burst event includes dropped ids and chest inventory empties", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  const chest = world.create();
  world.add(chest, Interactable, { action: "openChest", params: {} });
  world.add(chest, Inventory, { capacity: 20 });
  world.add(chest, Position, { x: 3, y: 3 });
  const ci1 = world.create();
  world.add(ci1, ItemInfo, { type: "equip", count: 1 });
  const ci2 = world.create();
  world.add(ci2, ItemInfo, { type: "equip", count: 1 });
  const ci3 = world.create();
  world.add(ci3, ItemInfo, { type: "equip", count: 1 });
  addToInventory(world, chest, ci1);
  addToInventory(world, chest, ci2);
  addToInventory(world, chest, ci3);

  const events = [];
  world.on("chest:burst", (e) => events.push(e));

  world.add(actor, InteractIntent, { targetId: chest });
  interactionSystem(world);

  assert(events.length === 1);
  assert(Array.isArray(events[0].drops));
  assertEquals(events[0].drops.length, 3);
  assertEquals(inventoryItems(world, chest).length, 0);
  for (const d of events[0].drops) {
    assert(world.isAlive(d.itemId), "dropped item should remain alive");
    assert(world.get(d.itemId, Position), "dropped item should be on the ground");
  }
});

Deno.test("chest burst avoids wall tiles when reachable floor alternatives exist", () => {
  clearAll();
  try {
    const world = new World({ seed: 11 });
    const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
    loadChunk(0, 0, tiles);

    const actor = world.create();
    const chest = world.create();
    world.add(chest, Interactable, { action: "openChest", params: {} });
    world.add(chest, Inventory, { capacity: 20 });
    world.add(chest, Position, { x: 5, y: 5 });

    // Block one nearby landing tile with a wall.
    setTile(6, 5, TILE_WALL);

    const ci1 = world.create();
    const ci2 = world.create();
    world.add(ci1, ItemInfo, { type: "equip", count: 1 });
    world.add(ci2, ItemInfo, { type: "equip", count: 1 });
    addToInventory(world, chest, ci1);
    addToInventory(world, chest, ci2);

    const events = [];
    world.on("chest:burst", (e) => events.push(e));
    world.add(actor, InteractIntent, { targetId: chest });
    interactionSystem(world);

    assertEquals(events.length, 1);
    for (const d of events[0].drops) {
      const p = world.get(d.itemId, Position);
      assert(p, "drop should be on ground");
      assertEquals(!(p.x === 6 && p.y === 5), true);
    }
  } finally {
    clearAll();
  }
});

Deno.test("read text emits event with textId", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  const sign = world.create();
  world.add(sign, Interactable, {
    action: "readText",
    params: { textId: "intro" },
  });

  world.add(actor, InteractIntent, { targetId: sign });
  const textEvents = [];
  world.on("interaction", (e) => {
    if (e.action === "readText") textEvents.push(e);
  });
  interactionSystem(world);

  assert(textEvents.length === 1, "should emit readText event");
  assert(textEvents[0].textId === "intro", `textId should be 'intro'`);
});

Deno.test("interactionSystem ignores off-floor targets", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  const chest = world.create();
  world.add(chest, Interactable, { action: "openChest", params: {} });
  world.add(chest, Inventory, { capacity: 20 });

  const dungeonState = world.create();
  world.add(dungeonState, DungeonState, {
    worldSeed: world.seed >>> 0,
    currentDepth: 1,
    floorEntityIds: [],
  });

  const chestEvents = [];
  world.on("chest:burst", (e) => chestEvents.push(e));

  world.add(actor, InteractIntent, { targetId: chest });
  interactionSystem(world);

  assert(chestEvents.length === 0, "off-floor target should not interact");
  assert(
    !world.has(actor, InteractIntent),
    "InteractIntent should still be consumed",
  );
});

Deno.test("stairs do not emit stair traversal from interactionSystem", () => {
  const world = new World({ seed: 1 });
  const actor = world.create();
  const stairDown = world.create();
  const stairUp = world.create();

  world.add(stairDown, Interactable, { action: "descendStair", params: null });
  world.add(stairUp, Interactable, { action: "ascendStair", params: null });

  const stairEvents = [];
  world.on("stair:traverse", (e) => stairEvents.push(e));

  world.add(actor, InteractIntent, { targetId: stairDown });
  interactionSystem(world);
  world.add(actor, InteractIntent, { targetId: stairUp });
  interactionSystem(world);

  assert(
    stairEvents.length === 0,
    "stairs should be traversed only by UI flow",
  );
});

Deno.test("harvest node creates food and enters regrow cooldown", () => {
  const world = new World({ seed: 17 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const node = world.create();
  world.add(node, Interactable, {
    action: "harvestNode",
    params: { kind: "berries" },
  });
  world.add(node, HarvestNode, {
    kind: "berries",
    ready: true,
    regrowTurns: 9,
    regrowCountdown: 0,
    yield: "food_wild_berries",
    yieldMin: 1,
    yieldMax: 3,
  });
  world.add(node, Position, { x: 1, y: 1 });

  const events = [];
  world.on("harvest:picked", (e) => events.push(e));

  world.add(actor, InteractIntent, { targetId: node });
  interactionSystem(world);

  assert(events.length === 1, "harvest should emit picked event");
  const hn = world.get(node, HarvestNode);
  assert(hn.ready === false, "node should become unready");
  assert(hn.regrowCountdown === 9, "node should start regrow countdown");

  const actorItems = inventoryItems(world, actor);
  assert(actorItems.length >= 1, "actor should receive harvested item");
  const first = actorItems[0];
  const ni = world.get(first, NamedIdentity);
  const info = world.get(first, ItemInfo);
  assert(
    ni.identity === "food_wild_berries",
    `expected berries, got ${ni.identity}`,
  );
  assert((info.count || 0) >= 1, "harvest count should be at least 1");
});

Deno.test("dungeon mushrooms harvest into item and visually disappear", () => {
  const world = new World({ seed: 171 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const node = world.create();
  world.add(node, Interactable, {
    action: "harvestNode",
    params: { kind: "mushrooms" },
  });
  world.add(node, HarvestNode, {
    kind: "mushrooms",
    ready: true,
    regrowTurns: 9,
    regrowCountdown: 0,
    yield: "food_mushrooms",
    yieldMin: 1,
    yieldMax: 3,
  });
  world.add(node, Position, { x: 2, y: 2 });
  world.add(node, NamedIdentity, { name: "Mushrooms", identity: "mushrooms" });
  world.add(node, Collider, { solid: true, blocksSight: false });

  world.add(actor, InteractIntent, { targetId: node });
  interactionSystem(world);

  const hn = world.get(node, HarvestNode);
  assert(hn.ready === false, "mushroom node should be depleted");
  const ni = world.get(node, NamedIdentity);
  assertEquals(ni.identity, "mushrooms_picked", "picked mushrooms should hide visuals");
  const col = world.get(node, Collider);
  assertEquals(col.solid, false, "picked mushrooms should be walkable");
  assertEquals(col.blocksSight, false, "picked mushrooms should not block sight");

  const actorItems = inventoryItems(world, actor);
  assert(actorItems.length >= 1, "actor should receive mushroom item");
  const itemNi = world.get(actorItems[0], NamedIdentity);
  assertEquals(itemNi.identity, "food_mushrooms", "harvest should yield dungeon mushrooms item");
});

Deno.test("harvest node reports empty while regrowing", () => {
  const world = new World({ seed: 19 });
  const actor = world.create();
  const node = world.create();
  world.add(node, Interactable, {
    action: "harvestNode",
    params: { kind: "herbs" },
  });
  world.add(node, HarvestNode, {
    kind: "herbs",
    ready: false,
    regrowTurns: 7,
    regrowCountdown: 5,
  });

  const events = [];
  world.on("harvest:empty", (e) => events.push(e));

  world.add(actor, InteractIntent, { targetId: node });
  interactionSystem(world);

  assert(events.length === 1, "should emit empty harvest event");
  assert(
    events[0].regrowCountdown === 5,
    "should include remaining regrow time",
  );
});

Deno.test("restAtBed requests bed sleep", () => {
  const world = new World({ seed: 23 });
  const actor = world.create();
  const bed = world.create();
  world.add(actor, Vitality, { maxHp: 20, hp: 3 });
  world.add(actor, Mana, { maxMana: 12, mana: 1, manaRegen: 0.1 });
  world.add(actor, Stamina, {
    maxStamina: 100,
    stamina: 4,
    staminaRegen: 2,
    regenCooldown: 9,
  });
  world.add(bed, Interactable, { action: "restAtBed", params: null });

  let requested = null;
  world.on(BedSleepRequested, (event) => {
    requested = event;
  });

  world.add(actor, InteractIntent, { targetId: bed });
  interactionSystem(world);

  const v = world.get(actor, Vitality);
  const m = world.get(actor, Mana);
  const s = world.get(actor, Stamina);
  assertEquals(v.hp, 3);
  assertEquals(m.mana, 1);
  assertEquals(s.stamina, 4);
  assertEquals(s.regenCooldown, 9);
  assertEquals(requested?.actor, actor);
  assertEquals(requested?.targetId, bed);
});

Deno.test("thorn bramble harvest hurts actor and yields thorn pods", () => {
  const world = new World({ seed: 81 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });
  world.add(actor, Position, { x: 4, y: 4 });
  world.add(actor, Vitality, { maxHp: 20, hp: 20 });

  const node = world.create();
  world.add(node, Interactable, {
    action: "harvestNode",
    params: { kind: "thorn_bramble" },
  });
  world.add(node, HarvestNode, {
    kind: "thorn_bramble",
    ready: true,
    regrowTurns: 11,
    regrowCountdown: 0,
    yield: "reagent_thorn_pod",
    yieldMin: 2,
    yieldMax: 4,
    danger: { type: "physical", dmgMin: 1, dmgMax: 3, cause: "thorn_bramble" },
  });
  world.add(node, Position, { x: 5, y: 4 });

  const dangerEvents = [];
  world.on("harvest:danger", (e) => dangerEvents.push(e));

  world.add(actor, InteractIntent, { targetId: node });
  interactionSystem(world);

  assert(
    dangerEvents.some((e) => e.effect === "physical"),
    "thorn harvest should emit physical danger event",
  );
  const vit = world.get(actor, Vitality);
  assert(vit.hp < vit.maxHp, "thorn harvest should damage actor");

  const actorItems = inventoryItems(world, actor);
  assert(actorItems.length >= 1, "actor should receive harvested item");
  const first = actorItems[0];
  const ni = world.get(first, NamedIdentity);
  assert(
    ni.identity === "reagent_thorn_pod",
    `expected thorn pods, got ${ni.identity}`,
  );
});

Deno.test("venom fern harvest spawns poison hazard and hurts actor", () => {
  const world = new World({ seed: 82 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });
  world.add(actor, Position, { x: 6, y: 6 });
  world.add(actor, Vitality, { maxHp: 18, hp: 18 });

  const node = world.create();
  world.add(node, Interactable, {
    action: "harvestNode",
    params: { kind: "venom_fern" },
  });
  world.add(node, HarvestNode, {
    kind: "venom_fern",
    ready: true,
    regrowTurns: 14,
    regrowCountdown: 0,
    yield: "reagent_venom_frond",
    yieldMin: 2,
    yieldMax: 3,
    danger: { type: "poison", dmgMin: 1, dmgMax: 2, cause: "venom_fern" },
    hazard: {
      kind: "poison",
      turnsLeft: 2,
      tickDamage: 1,
      identity: "venom_spores",
      name: "Venom Spores",
    },
  });
  world.add(node, Position, { x: 7, y: 6 });

  const dangerEvents = [];
  world.on("harvest:danger", (e) => dangerEvents.push(e));

  world.add(actor, InteractIntent, { targetId: node });
  interactionSystem(world);

  assert(
    dangerEvents.some((e) => e.effect === "poison"),
    "venom fern should emit poison danger event",
  );
  const vit = world.get(actor, Vitality);
  assert(vit.hp < vit.maxHp, "venom fern harvest should damage actor");

  let foundHazard = false;
  for (const [, ni, hazard] of world.query(NamedIdentity, HazardArea)) {
    if (ni.identity === "venom_spores" && String(hazard.kind) === "poison") {
      foundHazard = true;
      break;
    }
  }
  assert(foundHazard, "venom fern harvest should create poison hazard");

  const actorItems = inventoryItems(world, actor);
  assert(actorItems.length >= 1, "venom fern should yield a harvested item");
  const first = actorItems[0];
  const ni = world.get(first, NamedIdentity);
  assert(
    ni.identity === "reagent_venom_frond",
    `expected venom fronds, got ${ni.identity}`,
  );
});

Deno.test("alchemy bench opens minigame data, brews legitimate poison, and consumes ingredients", () => {
  const world = new World({ seed: 93 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });
  world.add(actor, Position, { x: 3, y: 3 });

  const berries = createFrom(world, WildBerries, {});
  world.mutate(berries, ItemInfo, (r) => {
    r.count = 3;
  });
  const herbs = createFrom(world, WildHerbs, {});
  world.mutate(herbs, ItemInfo, (r) => {
    r.count = 4;
  });
  const thornPods = createFrom(world, ThornPods, {});
  world.mutate(thornPods, ItemInfo, (r) => {
    r.count = 1;
  });
  const venomFronds = createFrom(world, VenomFronds, {});
  world.mutate(venomFronds, ItemInfo, (r) => {
    r.count = 2;
  });
  addToInventory(world, actor, berries);
  addToInventory(world, actor, herbs);
  addToInventory(world, actor, thornPods);
  addToInventory(world, actor, venomFronds);

  const bench = world.create();
  world.add(bench, Interactable, { action: "brewAlchemy", params: null });
  world.add(bench, Position, { x: 4, y: 3 });

  const openEvents = [];
  const crafted = [];
  world.on("alchemy:open", (e) => openEvents.push(e));
  world.on("alchemy:crafted", (e) => crafted.push(e));

  world.add(actor, InteractIntent, { targetId: bench });
  interactionSystem(world);
  assert(openEvents.length === 1, "bench interaction should emit alchemy:open");
  const venomRecipe = openEvents[0].recipes.find((r) =>
    r.key === "venom_draft"
  );
  assert(venomRecipe, "venom recipe should be offered");
  assert(
    (venomRecipe.requirements?.venomFronds || 0) >= 1,
    "venom recipe should require venom fronds",
  );

  function countIdentity(identity) {
    let total = 0;
    for (const id of inventoryItems(world, actor)) {
      const ni = world.get(id, NamedIdentity);
      if (ni?.identity !== identity) continue;
      const info = world.get(id, ItemInfo);
      total += Math.max(1, Number(info?.count || 1) | 0);
    }
    return total;
  }
  const thornBefore = countIdentity("reagent_thorn_pod");
  const venomBefore = countIdentity("reagent_venom_frond");

  world.add(actor, InteractIntent, {
    targetId: bench,
    mode: "brew",
    recipe: "venom_draft",
  });
  interactionSystem(world);
  assert(crafted.length === 1, "brew mode should craft a potion");
  assert(
    crafted[0].outputIdentity === "potion_poison",
    "should craft poison potion",
  );

  let poisonId = 0;
  for (const id of inventoryItems(world, actor)) {
    const ni = world.get(id, NamedIdentity);
    if (ni?.identity === "potion_poison") {
      poisonId = id;
      break;
    }
  }
  assert(poisonId > 0, "inventory should contain crafted poison potion");
  assert(
    world.has(poisonId, Potion),
    "crafted poison should be a legitimate potion entity",
  );
  assert(
    world.get(poisonId, ItemInfo)?.type === "potion",
    "crafted poison item type should be potion",
  );

  const thornAfter = countIdentity("reagent_thorn_pod");
  const venomAfter = countIdentity("reagent_venom_frond");
  assert(thornAfter < thornBefore, "thorn pod inventory should be consumed");
  assert(venomAfter < venomBefore, "venom frond inventory should be consumed");
});

// ── Sarcophagus ───────────────────────────────────────────────────────────────

Deno.test("sarcophagus: spawns skeleton on first interaction", () => {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  const world = new World({ seed: 42 });

  const actor = world.create();
  world.add(actor, Vitality, { maxHp: 40, hp: 40 });
  world.add(actor, Position, { x: 4, y: 5 });
  const sarc = world.create();
  world.add(sarc, Interactable, { action: "openSarcophagus", params: null });
  world.add(sarc, Position, { x: 5, y: 5 });
  world.add(sarc, Collider, { solid: true, blocksSight: false });

  const events = [];
  world.on(SarcophagusInteractionResolved, (e) => events.push(e));

  executeVerbRule(world, sarcophagusOpenRule, {
    actor,
    primary: sarc,
    target: sarc,
    params: { forceOutcomeId: "skeleton" },
  });

  assert(events.length === 1, "should emit sarcophagus interaction event");
  assert(events[0].targetId === sarc, "event should reference the sarcophagus");

  let skeletonFound = false;
  let skeletonOnSarcophagus = false;
  const sarcPos = world.get(sarc, Position);
  for (const [sid, ni] of world.query(NamedIdentity)) {
    if (ni.identity === "skeleton" || ni.identity === "skeleton_archer") {
      skeletonFound = true;
      const skPos = world.get(sid, Position);
      if (skPos && skPos.x === sarcPos.x && skPos.y === sarcPos.y) {
        skeletonOnSarcophagus = true;
      }
      break;
    }
  }
  assert(skeletonFound, "a skeleton should be spawned");
  assert(
    !skeletonOnSarcophagus,
    "skeleton should spawn adjacent to the sarcophagus, not on top of it",
  );
});

Deno.test("sarcophagus: becomes inert after opening (one-time use)", () => {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  const world = new World({ seed: 43 });

  const actor = world.create();
  const sarc = world.create();
  world.add(sarc, Interactable, { action: "openSarcophagus", params: null });
  world.add(sarc, Position, { x: 3, y: 3 });
  world.add(sarc, Collider, { solid: true, blocksSight: false });

  executeVerbRule(world, sarcophagusOpenRule, {
    actor,
    primary: sarc,
    target: sarc,
    params: { forceOutcomeId: "empty" },
  });

  assert(
    !world.has(sarc, Interactable),
    "sarcophagus should lose Interactable after opening",
  );

  // Second interaction should be a no-op (no Interactable component).
  const events = [];
  world.on(SarcophagusInteractionResolved, (e) => events.push(e));
  world.add(actor, InteractIntent, { targetId: sarc });
  interactionSystem(world);

  assert(events.length === 0, "second interaction should do nothing");
});

// ── Altar — two-phase offering ────────────────────────────────────────────────

Deno.test("altar: phase 1 emits Pray / Offer action chooser", () => {
  const world = new World({ seed: 50 });

  const actor = world.create();
  const altar = world.create();
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  // Put an item in inventory.
  const itemId = world.create();
  world.add(itemId, ItemInfo, {
    type: "potion",
    slot: "bag",
    weight: 1,
    value: 50,
    description: "test",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, itemId);

  const chooser = [];
  world.on(InteractionChoicePrompted, (e) => chooser.push(e));

  world.add(actor, InteractIntent, { targetId: altar });
  interactionSystem(world);

  assertEquals(chooser.length, 1, "should emit action chooser");
  assertEquals(chooser[0].action, "prayAltar");
  assertEquals(chooser[0].options.map((opt) => opt.mode), ["pray", "offer"]);
});

Deno.test("altar: Offer verb emits offer prompt with inventory items", () => {
  const world = new World({ seed: 5001 });

  const actor = world.create();
  const altar = world.create();
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  const itemId = world.create();
  world.add(itemId, ItemInfo, {
    type: "potion",
    slot: "bag",
    weight: 1,
    value: 50,
    description: "test",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, itemId);

  const prompts = [];
  world.on("altar:offerPrompt", (e) => prompts.push(e));

  world.add(actor, InteractIntent, { targetId: altar, mode: "offer" });
  interactionSystem(world);

  assertEquals(prompts.length, 1, "Offer verb should emit altar:offerPrompt");
  assert(
    prompts[0].items.includes(itemId),
    "prompt should include the offerable item",
  );
});

Deno.test("altar: Pray verb prays without opening the offer chooser", () => {
  const world = new World({ seed: 5002 });

  const actor = world.create();
  const altar = world.create();
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  const prompts = [];
  const prayers = [];
  world.on("altar:offerPrompt", (e) => prompts.push(e));
  world.on("altar:pray", (e) => prayers.push(e));

  world.add(actor, InteractIntent, { targetId: altar, mode: "pray" });
  interactionSystem(world);

  assertEquals(prompts.length, 0, "Pray verb should not open the offering chooser");
  assertEquals(prayers.length, 1, "Pray verb should pray at the altar");
});

Deno.test("altar: phase 2 consumes item and emits altar:offer", () => {
  const world = new World({ seed: 51 });

  const actor = world.create();
  const altar = world.create();
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  const itemId = world.create();
  world.add(itemId, ItemInfo, {
    type: "potion",
    slot: "bag",
    weight: 1,
    value: 50,
    description: "test",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, itemId);

  const offers = [];
  world.on("altar:offer", (e) => offers.push(e));

  // Phase 2: offer the selected item.
  world.add(actor, InteractIntent, { targetId: altar, mode: "offer", itemId });
  interactionSystem(world);

  assert(offers.length === 1, "should emit altar:offer");
  assert(offers[0].value === 0.25, "should report normalized value (50/200)");
  assert(offers[0].itemName === "test", "should report item name");
  assert(
    !inventoryContains(world, actor, itemId),
    "offered item should be removed from inventory",
  );
  const altarState = world.get(altar, AltarOfferingState);
  assertEquals(altarState?.lastOfferedDay, 0);
  assertEquals(altarState?.offeredItemName, "test");
});

Deno.test("altar: bump interaction opens the verb chooser without offering an item", () => {
  const world = new World({ seed: 5101 });

  const actor = world.create();
  const altar = world.create();
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  const itemId = world.create();
  world.add(itemId, ItemInfo, {
    type: "potion",
    slot: "bag",
    weight: 1,
    value: 50,
    description: "test",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, itemId);

  const chooser = [];
  const offers = [];
  world.on(InteractionChoicePrompted, (e) => chooser.push(e));
  world.on("altar:offer", (e) => offers.push(e));
  installBumpInteractListener(world);

  world.emit("bump:interact", { actor, target: altar });

  assertEquals(chooser.length, 1, "bump should open the action chooser");
  assertEquals(chooser[0].options.map((opt) => opt.mode), ["pray", "offer"]);
  assertEquals(offers.length, 0, "bump should not offer an item");
  assert(inventoryContains(world, actor, itemId), "bump should not offer an item");
});

Deno.test("altar: only one offering per altar per day", () => {
  const world = new World({ seed: 5102 });

  const actor = world.create();
  const altar = world.create();
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  const first = world.create();
  world.add(first, ItemInfo, {
    type: "potion",
    slot: "bag",
    weight: 1,
    value: 50,
    description: "first",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, first);

  const second = world.create();
  world.add(second, ItemInfo, {
    type: "potion",
    slot: "bag",
    weight: 1,
    value: 50,
    description: "second",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, second);

  const failures = [];
  world.on("altar:offerFailed", (e) => failures.push(e));

  world.add(actor, InteractIntent, { targetId: altar, mode: "offer", itemId: first });
  interactionSystem(world);
  world.add(actor, InteractIntent, { targetId: altar, mode: "offer", itemId: second });
  interactionSystem(world);

  assertEquals(failures[0]?.reason, "already_offered_today");
  assert(inventoryContains(world, actor, second), "same-day rejected item should remain owned");

  world.step = TURNS_PER_DAY;
  world.add(actor, InteractIntent, { targetId: altar, mode: "offer", itemId: second });
  interactionSystem(world);

  assert(!inventoryContains(world, actor, second), "next-day offering should be accepted");
  assertEquals(world.get(altar, AltarOfferingState)?.lastOfferedDay, 1);
});

Deno.test("altar: active offering disables Offer action until it expires", () => {
  const world = new World({ seed: 51021 });

  const actor = world.create();
  const altar = world.create();
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  const itemId = world.create();
  world.add(itemId, ItemInfo, {
    type: "potion",
    slot: "bag",
    weight: 1,
    value: 50,
    description: "active",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, itemId);

  world.add(actor, InteractIntent, { targetId: altar, mode: "offer", itemId });
  interactionSystem(world);

  const chooser = [];
  world.on(InteractionChoicePrompted, (e) => chooser.push(e));
  world.add(actor, InteractIntent, { targetId: altar });
  interactionSystem(world);

  const offer = chooser[0]?.options?.find((opt) => opt.mode === "offer");
  assertEquals(offer?.disabled, true);

  world.step = TURNS_PER_DAY;
  world.add(actor, InteractIntent, { targetId: altar });
  interactionSystem(world);

  const nextOffer = chooser[1]?.options?.find((opt) => opt.mode === "offer");
  assertEquals(nextOffer?.disabled, false);
});

Deno.test("altar: offered item kind is projected on top of the altar", () => {
  const world = new World({ seed: 5103 });

  const actor = world.create();
  const altar = world.create();
  world.add(actor, Player, {});
  world.add(actor, Position, { x: 5, y: 6 });
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(altar, Position, { x: 5, y: 5 });
  world.add(altar, NamedIdentity, { name: "Altar", identity: "altar" });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  const itemId = world.create();
  world.add(itemId, NamedIdentity, { name: "Ruby", identity: "gem_ruby" });
  world.add(itemId, Beatitude, { state: "blessed" });
  world.add(itemId, ItemInfo, {
    type: "gem",
    slot: "bag",
    weight: 1,
    value: 50,
    description: "Ruby",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, itemId);

  world.add(actor, InteractIntent, { targetId: altar, mode: "offer", itemId });
  interactionSystem(world);

  const view = buildWorldView(world);
  const offering = view.entities.find((entity) => entity.tags?.includes("altar_offering"));
  assert(offering, "WorldView should include an altar offering overlay");
  assertEquals(offering.kind, "gem_ruby");
  assertEquals(offering.pos.x, 5);
  assert(offering.pos.y < 5, "offering should render visually atop the altar");
  assert(offering.tags.includes("sunlight"), "blessed offering should alter altar light character");

  world.step = TURNS_PER_DAY;
  const expiredView = buildWorldView(world);
  assertEquals(
    expiredView.entities.some((entity) => entity.tags?.includes("altar_offering")),
    false,
    "offering overlay should expire at the next day boundary",
  );
});

Deno.test("altar: on-offered script hook runs before the item entity is destroyed", () => {
  const world = new World({ seed: 5104 });

  const actor = world.create();
  const altar = world.create();
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(altar, ScriptRef, { ref: "test:altar:on_offered" });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  const itemId = world.create();
  world.add(itemId, NamedIdentity, { name: "Ruby", identity: "gem_ruby" });
  world.add(itemId, ItemInfo, {
    type: "gem",
    slot: "bag",
    weight: 1,
    value: 50,
    description: "Ruby",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, itemId);

  const calls = [];
  registerScript("test:altar:on_offered", {
    [ScriptVerb.AltarOffered]: (scriptWorld, ctx) => {
      calls.push({
        actor: ctx.actor,
        targetId: ctx.targetId,
        itemId: ctx.itemId,
        itemAlive: scriptWorld.isAlive(ctx.itemId),
        identity: scriptWorld.get(ctx.itemId, NamedIdentity)?.identity,
      });
    },
  });

  world.add(actor, InteractIntent, { targetId: altar, mode: "offer", itemId });
  interactionSystem(world);

  assertEquals(calls.length, 1);
  assertEquals(calls[0], {
    actor,
    targetId: altar,
    itemId,
    itemAlive: true,
    identity: "gem_ruby",
  });
  assert(!world.isAlive(itemId), "offered item should still be consumed after the hook");
});

Deno.test("altar: offer fails gracefully when item is not in inventory", () => {
  const world = new World({ seed: 52 });

  const actor = world.create();
  const altar = world.create();
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });

  const failures = [];
  world.on("altar:offerFailed", (e) => failures.push(e));

  // Try to offer an item that isn't in inventory.
  world.add(actor, InteractIntent, {
    targetId: altar,
    mode: "offer",
    itemId: 9999,
  });
  interactionSystem(world);

  assert(failures.length === 1, "should emit altar:offerFailed");
  assert(
    failures[0].reason === "not_owned",
    "should explain the failure reason",
  );
});

Deno.test("altar: offering your pet corpse can resurrect it when the deity still favors you", () => {
  const world = new World({ seed: 0xCA7A17 });

  const actor = world.create();
  const altar = world.create();
  world.add(actor, Player, {});
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });
  world.add(actor, Position, { x: 4, y: 4 });
  world.add(actor, Devotion, { deityId: "seraphine" });
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(altar, Position, { x: 5, y: 4 });

  initDeity("seraphine", world);
  deitySystem(world);

  const corpseId = world.create();
  world.add(corpseId, Pet);
  world.add(corpseId, Owner, { ownerId: actor });
  world.add(corpseId, NamedIdentity, {
    name: "Kitty Corpse",
    identity: "corpse_kitty",
  });
  world.add(corpseId, ItemInfo, {
    type: "food",
    slot: "bag",
    weight: 2,
    value: 25,
    description: "pet remains",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, corpseId);

  const resurrected = [];
  world.on("pet:resurrected", (e) => resurrected.push(e));

  world.add(actor, InteractIntent, {
    targetId: altar,
    mode: "offer",
    itemId: corpseId,
  });
  interactionSystem(world);

  assertEquals(resurrected.length, 1, "should emit pet:resurrected");
  assert(
    !inventoryContains(world, actor, corpseId),
    "offered corpse should leave inventory",
  );
  assert(
    world.has(resurrected[0].petId, Pet),
    "a pet entity should be restored",
  );
  assertEquals(
    world.get(resurrected[0].petId, NamedIdentity)?.identity,
    "kitty",
  );
  assertEquals(world.get(resurrected[0].petId, Owner)?.ownerId, actor);
});

Deno.test("altar: pet resurrection is denied when the deity is displeased", () => {
  const world = new World({ seed: 0xBAD777 });

  const actor = world.create();
  const altar = world.create();
  world.add(actor, Player, {});
  world.add(actor, Inventory, { items: [], capacity: 10, weightLimit: null });
  world.add(actor, Position, { x: 4, y: 4 });
  world.add(actor, Devotion, { deityId: "seraphine" });
  world.add(altar, Interactable, { action: "prayAltar", params: null });
  world.add(altar, Position, { x: 5, y: 4 });

  const deity = initDeity("seraphine", world);
  deitySystem(world);
  for (let i = 0; i < 10; i++) {
    deity.desecrate("test");
    deity.tick(1);
  }
  const mood = getDeityInstance("seraphine")._queryPrecise();
  assert(
    mood.wrath >= 0.34 || mood.serenity < mood.wrath,
    "test setup should produce poor standing",
  );

  const corpseId = world.create();
  world.add(corpseId, Pet);
  world.add(corpseId, Owner, { ownerId: actor });
  world.add(corpseId, NamedIdentity, {
    name: "Kitty Corpse",
    identity: "corpse_kitty",
  });
  world.add(corpseId, ItemInfo, {
    type: "food",
    slot: "bag",
    weight: 2,
    value: 25,
    description: "pet remains",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
  });
  addToInventory(world, actor, corpseId);

  const denied = [];
  world.on("altar:resurrectionDenied", (e) => denied.push(e));

  world.add(actor, InteractIntent, {
    targetId: altar,
    mode: "offer",
    itemId: corpseId,
  });
  interactionSystem(world);

  assertEquals(denied.length, 1, "should emit altar:resurrectionDenied");
  assertEquals(denied[0].reason, "standing");
  const livingPets = [];
  for (const [id, _pet, vit] of world.query(Pet, Vitality)) {
    if ((vit?.hp || 0) > 0) livingPets.push(id);
  }
  assertEquals(livingPets.length, 0, "no living pet should be created");
});

// ── Cooking fire ──────────────────────────────────────────────────────────────

Deno.test("cooking fire: phase 1 emits cooking:open with corpses and herbs", () => {
  const world = new World({ seed: 70 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });
  world.add(actor, Position, { x: 3, y: 3 });

  // Add a corpse to inventory.
  const corpse = world.create();
  world.add(corpse, NamedIdentity, {
    name: "Rat Corpse",
    identity: "corpse_rat",
  });
  world.add(corpse, ItemInfo, { type: "food", weight: 2, value: 5, count: 1 });
  world.add(corpse, Consumable, {
    effectParams: { nutrition: 150, corpseIdentity: "corpse_rat" },
    remainingUses: 1,
    potency: 0,
  });
  world.add(corpse, FoodDecay, { turnsHeld: 20, shelfLife: 150 });
  addToInventory(world, actor, corpse);

  // Add herbs to inventory.
  const herbs = createFrom(world, WildHerbs, {});
  world.mutate(herbs, ItemInfo, (r) => {
    r.count = 3;
  });
  addToInventory(world, actor, herbs);

  const fire = world.create();
  world.add(fire, Interactable, { action: "cookFood", params: null });
  world.add(fire, Position, { x: 4, y: 3 });

  const openEvents = [];
  world.on("cooking:open", (e) => openEvents.push(e));

  world.add(actor, InteractIntent, { targetId: fire });
  interactionSystem(world);

  assert(openEvents.length === 1, "should emit cooking:open");
  assert(Array.isArray(openEvents[0].corpses), "should include corpses array");
  assert(openEvents[0].corpses.length === 1, "should list the one corpse");
  assert(openEvents[0].corpses[0] === corpse, "corpse entity id should match");
  assert(openEvents[0].herbs.count === 3, "should count herbs");
});

Deno.test("cooking fire: phase 2 transmogrifies corpse into ration", () => {
  const world = new World({ seed: 71 });
  world.setScheduler((w) => {
    interactionSystem(w);
  });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });
  world.add(actor, Position, { x: 3, y: 3 });

  // Add a corpse to inventory.
  const corpse = world.create();
  world.add(corpse, NamedIdentity, {
    name: "Orc Corpse",
    identity: "corpse_orc",
  });
  world.add(corpse, ItemInfo, { type: "food", weight: 4, value: 10, count: 1 });
  world.add(corpse, Consumable, {
    effectParams: { nutrition: 300, corpseIdentity: "corpse_orc" },
    remainingUses: 1,
    potency: 0,
  });
  world.add(corpse, FoodDecay, { turnsHeld: 50, shelfLife: 150 });
  addToInventory(world, actor, corpse);

  const fire = world.create();
  world.add(fire, Interactable, { action: "cookFood", params: null });
  world.add(fire, Position, { x: 4, y: 3 });

  const cooked = [];
  world.on("cooking:cooked", (e) => cooked.push(e));

  // Dispatch through tick() like the real game does, so ECS deferral is active.
  world.add(actor, InteractIntent, {
    targetId: fire,
    mode: "cook",
    itemId: corpse,
  });
  world.tick(1);

  assert(cooked.length === 1, "should emit cooking:cooked");
  assert(cooked[0].itemId === corpse, "cooked event should reference the item");

  // The corpse entity should now be a ration (same entity id, new identity).
  const ni = world.get(corpse, NamedIdentity);
  assert(
    ni.identity === "food_ration",
    `expected food_ration, got ${ni.identity}`,
  );
  assert(
    inventoryContains(world, actor, corpse),
    "ration should still be in inventory",
  );

  // FoodDecay should be reset to fresh with ration shelf life.
  const fd = world.get(corpse, FoodDecay);
  assert(fd.turnsHeld === 0, "turnsHeld should be reset to 0");
  assert(
    fd.shelfLife === 5040,
    `shelfLife should be 5040 (ration = 7 days), got ${fd.shelfLife}`,
  );
});

Deno.test("cooking fire: recipe cooking creates long-buff food from dungeon ingredients", () => {
  const world = new World({ seed: 172 });
  world.setScheduler((w) => {
    interactionSystem(w);
  });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });
  world.add(actor, Position, { x: 3, y: 3 });
  world.add(actor, ActiveEffects, { effects: [] });

  const corpse = world.create();
  world.add(corpse, NamedIdentity, { name: "Rat Corpse", identity: "corpse_rat" });
  world.add(corpse, ItemInfo, { type: "food", weight: 2, value: 5, count: 1 });
  world.add(corpse, Consumable, { effectParams: { nutrition: 150 }, remainingUses: 1, potency: 0 });
  addToInventory(world, actor, corpse);

  for (const itemId of ["food_wild_herbs", "food_carrot", "water_bucket", "fuel_firewood", "tool_kitchen_knife"]) {
    addToInventory(world, actor, createItemById(world, itemId));
  }

  const fire = world.create();
  world.add(fire, Interactable, { action: "cookFood", params: null });
  world.add(fire, Position, { x: 4, y: 3 });

  const openEvents = [];
  const cooked = [];
  world.on("cooking:open", (e) => openEvents.push(e));
  world.on("cooking:cooked", (e) => cooked.push(e));

  world.add(actor, InteractIntent, { targetId: fire });
  world.tick(1);

  const hearty = openEvents[0].recipes.find((recipe) => recipe.key === "hearty_stew");
  assert(hearty?.canCraft === true, "hearty stew should be craftable with corpse and pantry ingredients");
  assertEquals(openEvents[0].ingredients.corpse, 1);
  assertEquals(openEvents[0].ingredients.knife, 1);

  world.add(actor, InteractIntent, { targetId: fire, mode: "cook", recipe: "hearty_stew" });
  world.tick(1);

  assertEquals(cooked.length, 1, "recipe should emit cooking:cooked");
  assertEquals(cooked[0].outputIdentity, "food_hearty_stew");
  assertEquals(getStackCount(world, actor, "food_hearty_stew"), 1);
  assertEquals(getStackCount(world, actor, "tool_kitchen_knife"), 1, "kitchen knife should be reusable");
  assertEquals(getStackCount(world, actor, "water_bucket"), 1, "water bucket should be reusable");
  assertEquals(getStackCount(world, actor, "fuel_firewood"), 0, "firewood should be consumed");

  const stewId = inventoryItems(world, actor).find((id) => world.get(id, NamedIdentity)?.identity === "food_hearty_stew");
  assert(stewId > 0, "crafted stew should be in inventory");
  const def = world.get(stewId, ItemInfo);
  assert(Array.isArray(def.tags) && def.tags.includes("cooked_food"), "crafted meal should be tagged as cooked food");
});

Deno.test("cooked buff food feeds actor and applies long duration effect", () => {
  const world = new World({ seed: 173 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });
  world.add(actor, ActiveEffects, { effects: [] });

  const stew = createItemById(world, "food_hearty_stew");
  addToInventory(world, actor, stew);

  const results = [];
  world.on("interaction:result", (event) => results.push(event));

  world.add(actor, UseIntent, { itemId: stew, targetId: actor });
  useItemSystem(world);

  assert(results[0]?.ok === true, "buff food use should succeed");
  const regen = world.get(actor, ActiveEffects)?.effects?.find((effect) => effect.key === "regen");
  assert(regen, "hearty stew should apply regen");
  assert(regen.turnsLeft >= 180, "cooked food buff should be long duration");
});

Deno.test("town stew feeds actor and applies one direct composite effect", () => {
  const world = new World({ seed: 174 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });
  world.add(actor, Hunger, { hunger: 250, satiation: 0 });
  world.add(actor, ActiveEffects, { effects: [] });

  const stew = createItemById(world, "food_stew");
  addToInventory(world, actor, stew);

  const results = [];
  world.on("interaction:result", (event) => results.push(event));

  world.add(actor, UseIntent, { itemId: stew, targetId: actor });
  useItemSystem(world);

  assert(results[0]?.ok === true, "town stew use should succeed");
  assert(!inventoryContains(world, actor, stew), "town stew should be consumed");
  assert(!world.isAlive(stew), "consumed town stew entity should be destroyed");
  assertEquals(world.get(actor, Hunger)?.hunger, 30, "town stew should feed via normal nutrition");

  const effects = world.get(actor, ActiveEffects)?.effects || [];
  const stewEffects = snapshotEffectInstances(world, actor).filter((effect) => effect.key === "town_stew");
  assertEquals(stewEffects.length, 1, "town stew should create one direct composite effect row");
  assert(stewEffects[0].turns >= 300, "town stew should last several hundred turns");
  assert(!effects.some((effect) => effect.key === "town_stew"), "topology must be the only source of truth");
  assert(!effects.some((effect) => effect.key === "regen"), "town stew should not expose regen as a separate effect");
  assert(!effects.some((effect) => effect.key === "stamina_restore"), "town stew should not expose stamina restoration as a separate effect");
});

Deno.test("millstone mills wheat into flour", () => {
  const world = new World({ seed: 74 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const wheat = world.create();
  world.add(wheat, NamedIdentity, { name: "Wheat", identity: "food_wheat" });
  world.add(wheat, ItemInfo, {
    type: "ingredient",
    weight: 1,
    value: 2,
    count: 2,
  });
  addToInventory(world, actor, wheat);

  const millstone = world.create();
  world.add(millstone, Interactable, {
    action: "millGrain",
    params: { idleState: "idle", activeState: "working", activeDuration: 4 },
  });
  world.add(millstone, Position, { x: 11, y: 12 });
  world.add(millstone, ObjectState, { state: "idle" });

  const milled = [];
  const audio = [];
  world.on("mill:milled", (e) => milled.push(e));
  world.on("audio:play", (e) => audio.push(e));

  world.add(actor, InteractIntent, { targetId: millstone });
  interactionSystem(world);

  assert(milled.length === 1, "millstone should emit a milling event");
  assertEquals(audio.length, 1, "player milling should emit one grind sound");
  assertEquals(audio[0].key, "action:millstone_grind");
  assertEquals(audio[0].at, { x: 11, y: 12 });
  assert(
    world.get(millstone, ObjectState)?.state === "working",
    "millstone should enter working state",
  );
  assert(
    inventoryItems(world, actor).some((id) =>
      world.get(id, NamedIdentity)?.identity === "food_flour"
    ),
    "actor should receive flour",
  );
});

Deno.test("millstone mills corn into cornmeal", () => {
  const world = new World({ seed: 75 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const corn = world.create();
  world.add(corn, NamedIdentity, { name: "Corn", identity: "food_corn" });
  world.add(corn, ItemInfo, {
    type: "food",
    weight: 1,
    value: 8,
    count: 1,
  });
  addToInventory(world, actor, corn);

  const millstone = world.create();
  world.add(millstone, Interactable, {
    action: "millGrain",
    params: { idleState: "idle", activeState: "working", activeDuration: 4 },
  });
  world.add(millstone, ObjectState, { state: "idle" });

  const milled = [];
  world.on("mill:milled", (e) => milled.push(e));

  world.add(actor, InteractIntent, { targetId: millstone });
  interactionSystem(world);

  assert(milled.length === 1, "millstone should emit a milling event");
  assertEquals(milled[0].inputIdentity, "food_corn");
  assertEquals(milled[0].outputIdentity, "food_cornmeal");
  assert(
    inventoryItems(world, actor).some((id) =>
      world.get(id, NamedIdentity)?.identity === "food_cornmeal"
    ),
    "actor should receive cornmeal",
  );
});

Deno.test("furnace smelts ore into iron ingots", () => {
  const world = new World({ seed: 75 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const ore = world.create();
  world.add(ore, NamedIdentity, { name: "Iron Ore", identity: "ore_iron" });
  world.add(ore, ItemInfo, { type: "material", weight: 1, value: 4, count: 1 });
  const coal = world.create();
  world.add(coal, NamedIdentity, { name: "Coal", identity: "ore_coal" });
  world.add(coal, ItemInfo, { type: "fuel", weight: 1, value: 2, count: 1 });
  addToInventory(world, actor, ore);
  addToInventory(world, actor, coal);

  const furnace = world.create();
  world.add(furnace, Interactable, {
    action: "smeltOre",
    params: { idleState: "unlit", activeState: "lit", activeDuration: 5 },
  });
  world.add(furnace, ObjectState, { state: "unlit" });

  const smelted = [];
  world.on("smithy:smelted", (e) => smelted.push(e));

  world.add(actor, InteractIntent, { targetId: furnace });
  interactionSystem(world);

  assert(smelted.length === 1, "furnace should emit a smelting event");
  assert(
    world.get(furnace, ObjectState)?.state === "lit",
    "furnace should light while operating",
  );
  assert(
    inventoryItems(world, actor).some((id) =>
      world.get(id, NamedIdentity)?.identity === "material_iron"
    ),
    "actor should receive an iron ingot",
  );
});

Deno.test("anvil forges carried iron and lumber into a tool", () => {
  const world = new World({ seed: 76 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const iron = world.create();
  world.add(iron, NamedIdentity, {
    name: "Iron Ingot",
    identity: "material_iron",
  });
  world.add(iron, ItemInfo, {
    type: "material",
    weight: 1,
    value: 9,
    count: 1,
  });
  const lumber = world.create();
  world.add(lumber, NamedIdentity, {
    name: "Lumber",
    identity: "material_lumber",
  });
  world.add(lumber, ItemInfo, {
    type: "material",
    weight: 1,
    value: 6,
    count: 1,
  });
  addToInventory(world, actor, iron);
  addToInventory(world, actor, lumber);

  const anvil = world.create();
  world.add(anvil, Interactable, {
    action: "forgeTools",
    params: { idleState: "idle", activeState: "working", activeDuration: 4 },
  });
  world.add(anvil, ObjectState, { state: "idle" });

  const forged = [];
  const opened = [];
  world.on("smithy:forged", (e) => forged.push(e));
  world.on("smithy:open", (e) => opened.push(e));

  world.add(actor, InteractIntent, {
    targetId: anvil,
    mode: "forge",
    recipe: "kitchen_knife",
  });
  interactionSystem(world);

  assert(forged.length === 1, "anvil should emit a forge event");
  assert(
    opened.length === 1,
    "anvil should refresh smithing panel data after forging",
  );
  assert(
    world.get(anvil, ObjectState)?.state === "working",
    "anvil should enter working state",
  );
  assert(
    inventoryItems(world, actor).some((id) => {
      const identity = world.get(id, NamedIdentity)?.identity;
      return identity === "tool_kitchen_knife" ||
        identity === "tool_hatchet" ||
        identity === "iron_pickaxe" ||
        identity === "shield_iron" ||
        identity === "warhammer";
    }),
    "actor should receive a forged tool",
  );
});

Deno.test("anvil opens smithing panel instead of forging immediately", () => {
  const world = new World({ seed: 93 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const anvil = world.create();
  world.add(anvil, Interactable, {
    action: "forgeTools",
    params: { idleState: "idle", activeState: "working", activeDuration: 4 },
  });
  world.add(anvil, ObjectState, { state: "idle" });

  const opened = [];
  const forged = [];
  world.on("smithy:open", (e) => opened.push(e));
  world.on("smithy:forged", (e) => forged.push(e));

  world.add(actor, InteractIntent, { targetId: anvil });
  interactionSystem(world);

  assert(opened.length === 1, "anvil should open smithing data");
  assert(
    forged.length === 0,
    "anvil should not forge without a selected recipe",
  );
  assert(
    world.get(anvil, ObjectState)?.state === "idle",
    "anvil should stay idle while choosing",
  );
});

Deno.test("alchemy bench crafts moon tonic from herbs and moonleaf", () => {
  const world = new World({ seed: 91 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const herbs = createFrom(world, WildHerbs, {});
  const moonleafA = createFrom(world, Moonleaf, {});
  const moonleafB = createFrom(world, Moonleaf, {});
  addToInventory(world, actor, herbs);
  addToInventory(world, actor, moonleafA);
  addToInventory(world, actor, moonleafB);

  const bench = world.create();
  world.add(bench, Interactable, { action: "brewAlchemy", params: null });

  const crafted = [];
  world.on("alchemy:crafted", (e) => crafted.push(e));

  world.add(actor, InteractIntent, {
    targetId: bench,
    mode: "brew",
    recipe: "moon_tonic",
  });
  interactionSystem(world);

  assert(crafted.length === 1, "moon tonic recipe should craft");
  assert(
    crafted[0].outputIdentity === "potion_mana",
    "moon tonic should craft a mana potion",
  );
});

Deno.test("alchemy bench crafts fireward distillate from ember root and thorn pods", () => {
  const world = new World({ seed: 92 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const emberA = createFrom(world, EmberRoot, {});
  const emberB = createFrom(world, EmberRoot, {});
  const thorn = createFrom(world, ThornPods, {});
  addToInventory(world, actor, emberA);
  addToInventory(world, actor, emberB);
  addToInventory(world, actor, thorn);

  const bench = world.create();
  world.add(bench, Interactable, { action: "brewAlchemy", params: null });

  const crafted = [];
  world.on("alchemy:crafted", (e) => crafted.push(e));

  world.add(actor, InteractIntent, {
    targetId: bench,
    mode: "brew",
    recipe: "fireward_distillate",
  });
  interactionSystem(world);

  assert(crafted.length === 1, "fireward recipe should craft");
  assert(
    crafted[0].outputIdentity === "potion_resist_fire",
    "fireward recipe should craft fire resist potion",
  );
});

Deno.test("cooking fire: no corpses emits cooking:open with empty list", () => {
  const world = new World({ seed: 72 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const fire = world.create();
  world.add(fire, Interactable, { action: "cookFood", params: null });

  const openEvents = [];
  world.on("cooking:open", (e) => openEvents.push(e));

  world.add(actor, InteractIntent, { targetId: fire });
  interactionSystem(world);

  assert(openEvents.length === 1, "should emit cooking:open");
  assert(openEvents[0].corpses.length === 0, "corpses should be empty");
});

Deno.test("cooking fire: cooking item not in inventory emits cooking:failed", () => {
  const world = new World({ seed: 73 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 20, weightLimit: null });

  const fire = world.create();
  world.add(fire, Interactable, { action: "cookFood", params: null });

  const failures = [];
  world.on("cooking:failed", (e) => failures.push(e));

  world.add(actor, InteractIntent, {
    targetId: fire,
    mode: "cook",
    itemId: 9999,
  });
  interactionSystem(world);

  assert(failures.length === 1, "should emit cooking:failed");
  assert(failures[0].reason === "not_owned", "reason should be not_owned");
});

Deno.test("fountain has finite uses and becomes dry", () => {
  const world = new World({ seed: 88 });
  const actor = world.create();
  world.add(actor, Vitality, { maxHp: 20, hp: 8 });

  const fountain = world.create();
  world.add(fountain, Interactable, {
    action: "fountain",
    params: null,
  });
  world.add(fountain, FountainState, { initialized: true, chargesRemaining: 2, maxCharges: Math.max(1, 2), primaryEffect: "heal", cooldownTurns: 201, dryUntilStep: -1 });

  const drinks = [];
  const dry = [];
  world.on(FountainDrinkResolved, (e) => drinks.push(e));
  world.on(FountainDried, (e) => dry.push(e));

  world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
  interactionSystem(world);
  world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
  interactionSystem(world);
  world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
  interactionSystem(world);

  assert(
    world.get(fountain, FountainState).chargesRemaining === 0,
    "fountain should have no charges left",
  );
  assert(
    drinks.length === 2,
    `expected 2 successful drinks, got ${drinks.length}`,
  );
  assert(dry.length >= 1, "dry event should be emitted once depleted");
});

Deno.test("dry fountain does not emit Drink / Dip chooser", () => {
  const world = new World({ seed: 91 });
  const actor = world.create();
  const fountain = world.create();

  world.add(actor, Vitality, { maxHp: 20, hp: 10 });
  world.add(fountain, Interactable, {
    action: "fountain",
    params: null,
  });
  world.add(fountain, FountainState, {
    initialized: true,
    chargesRemaining: 0,
    maxCharges: 2,
    primaryEffect: "heal",
    cooldownTurns: 201,
    dryUntilStep: 205,
  });

  const chooser = [];
  const dry = [];
  world.on(InteractionChoicePrompted, (e) => chooser.push(e));
  world.on(FountainDried, (e) => dry.push(e));

  world.add(actor, InteractIntent, { targetId: fountain });
  interactionSystem(world);

  assertEquals(
    chooser.length,
    0,
    "dry fountain should not open the action chooser",
  );
  assertEquals(dry.length, 1, "dry fountain should still emit fountain:dry");
  assertEquals(dry[0].targetId, fountain);
});

Deno.test("fountain beneficial effect is stable per fountain", () => {
  const world = new World({ seed: 89 });
  const actor = world.create();
  world.add(actor, Vitality, { maxHp: 20, hp: 20 });
  world.add(actor, Mana, { maxMana: 12, mana: 1, manaRegen: 0.1 });

  const fountain = world.create();
  world.add(fountain, Interactable, {
    action: "fountain",
    params: null,
  });
  world.add(fountain, FountainState, { initialized: true, chargesRemaining: 20, maxCharges: Math.max(1, 20), primaryEffect: "mana", cooldownTurns: 201, dryUntilStep: -1 });

  const drinks = [];
  world.on(FountainDrinkResolved, (e) => drinks.push(e));

  for (let i = 0; i < 12; i++) {
    world.step = i;
    world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
    interactionSystem(world);
  }

  const beneficial = drinks.filter((e) =>
    e.effect === "heal" || e.effect === "mana"
  );
  assert(
    beneficial.length > 0,
    "expected at least one beneficial fountain roll",
  );
  assert(
    beneficial.every((e) => e.effect === "mana"),
    "mana fountain should never emit heal effect",
  );
});

Deno.test("dry fountain refills after cooldown and can be used again", () => {
  const world = new World({ seed: 90 });
  const actor = world.create();
  world.add(actor, Vitality, { maxHp: 20, hp: 10 });

  const fountain = world.create();
  world.add(fountain, Interactable, {
    action: "fountain",
    params: null,
  });
  world.add(fountain, FountainState, {
    initialized: true,
    chargesRemaining: 0,
    maxCharges: 2,
    primaryEffect: "heal",
    cooldownTurns: 201,
    dryUntilStep: 205,
  });
  world.add(fountain, Position, { x: 8, y: 8 });

  const drinks = [];
  const dry = [];
  const refilled = [];
  world.on(FountainDrinkResolved, (e) => drinks.push(e));
  world.on(FountainDried, (e) => dry.push(e));
  world.on(FountainRefilled, (e) => refilled.push(e));

  world.step = 204;
  world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
  interactionSystem(world);
  assert(
    drinks.length === 0,
    "dry fountain should not be usable before cooldown",
  );
  assert(dry.length >= 1, "should emit dry while still cooling down");

  world.step = 205;
  fountainRegrowthSystem(world);
  world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
  interactionSystem(world);

  assert(
    refilled.length === 1,
    "fountain should emit refilled event at cooldown completion",
  );
  assert(
    drinks.length === 1,
    "fountain should be drinkable again after refill",
  );
  assert(
    world.get(fountain, FountainState).chargesRemaining === 1,
    "one charge should remain after the first post-refill drink",
  );
});
