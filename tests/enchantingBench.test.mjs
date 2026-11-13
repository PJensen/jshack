import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { createFrom, World } from "../src/lib/ecs-js/index.js";
import { EnchantingBench } from "../src/rules/archetypes/Overworld.js";
import { GoldStack } from "../src/rules/archetypes/Items.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { EnchantmentNode } from "../src/rules/components/EnchantmentNode.js";
import { NON_AMMO_GEAR_SLOTS } from "../src/rules/components/Equipment.js";
import { InteractIntent } from "../src/rules/components/Intents/InteractIntent.js";
import { ApplyIntent } from "../src/rules/components/Intents/ApplyIntent.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";
import { GEAR_APPLICATION_TURNS } from "../src/rules/content/useActions/gearApplicationAction.js";
import { interactionSystem } from "../src/rules/systems/interactionSystem.js";
import { applySystem } from "../src/rules/systems/applySystem.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { addToInventory, getStackCount, inventoryItems } from "../src/rules/utils/inventoryFacade.js";
import { descendantsWith } from "../src/rules/utils/topology.js";
import "../src/rules/data/affixes.js";

function makeActor(world) {
  const actor = world.create();
  world.add(actor, Inventory, { items: [], capacity: 50, weightLimit: null });
  return actor;
}

function addStackedGold(world, actor, amount) {
  const gold = createFrom(world, GoldStack, {});
  world.get(gold, ItemInfo).count = Math.max(1, Number(amount || 1) | 0);
  addToInventory(world, actor, gold);
  return gold;
}

function addCatalogItem(world, actor, identity, count = 1) {
  for (let i = 0; i < count; i++) {
    const itemId = createItemById(world, identity);
    assert(itemId > 0, `expected ${identity} to be creatable`);
    addToInventory(world, actor, itemId);
  }
}

function finishGearApplication(world) {
  for (let turn = 0; turn < GEAR_APPLICATION_TURNS; turn++) channelingSystem(world);
}

Deno.test("enchanting bench crafts a poison enchant scroll from reagents and gold", () => {
  const world = new World({ seed: 1201 });
  const actor = makeActor(world);
  addCatalogItem(world, actor, "reagent_spider_leg", 2);
  addCatalogItem(world, actor, "reagent_venom_gland", 1);
  addCatalogItem(world, actor, "reagent_resin", 1);
  addStackedGold(world, actor, 65);

  const bench = createFrom(world, EnchantingBench, { x: 4, y: 4 });
  const crafted = [];
  world.on("enchanting:crafted", (ev) => crafted.push(ev));

  world.add(actor, InteractIntent, {
    targetId: bench,
    mode: "enchant",
    recipe: "venomous_script",
  });
  interactionSystem(world);

  assertEquals(crafted.length, 1);
  assertEquals(crafted[0]?.outputIdentity, "scroll_enchant_poison");
  assertEquals(crafted[0]?.magnitude, 2);
  assertEquals(crafted[0]?.proc, "on hit");
  assertEquals(crafted[0]?.duration, 4);
  assertEquals(crafted[0]?.runtime?.affixId, "venomous1");
  assertEquals(crafted[0]?.metadata?.rarity, "magic");
  assertEquals(getStackCount(world, actor, "gold"), 0);
  assertEquals(getStackCount(world, actor, "reagent_spider_leg"), 0);
  assertEquals(getStackCount(world, actor, "reagent_venom_gland"), 0);
  assertEquals(getStackCount(world, actor, "reagent_resin"), 0);
  assert(
    inventoryItems(world, actor).some((id) => world.get(id, ItemInfo)?.type === "scroll" && crafted[0]?.itemId === id),
    "actor should receive the crafted enchant scroll",
  );
});

Deno.test("enchant scroll applies persistent affixes, supports accessories, and rejects invalid repeats", () => {
  const world = new World({ seed: 1202 });
  const actor = makeActor(world);
  const weapon = createItemById(world, "dagger_quick");
  const firstScroll = createItemById(world, "scroll_enchant_fire");
  const amulet = createItemById(world, "amulet_guarded");
  const wardScroll = createItemById(world, "scroll_enchant_flame_ward");
  assert(weapon > 0 && firstScroll > 0 && amulet > 0 && wardScroll > 0, "required test items should be creatable");
  addToInventory(world, actor, weapon);
  addToInventory(world, actor, amulet);
  addToInventory(world, actor, firstScroll);
  addToInventory(world, actor, wardScroll);

  const results = [];
  const cancelled = [];
  world.on("interaction:result", (ev) => results.push(ev));
  world.on("item:apply-cancelled", (ev) => cancelled.push(ev));

  world.add(actor, ApplyIntent, { itemId: firstScroll, targetItemId: weapon });
  applySystem(world);
  finishGearApplication(world);

  assertEquals(results.length, 1);
  assertEquals(results[0]?.ok, true);
  assertEquals(results[0]?.metrics?.consumedTool, true);
  assert(!world.isAlive(firstScroll), "successful enchant should consume the scroll");
  assert((world.get(weapon, ItemInfo)?.affixes || []).includes("firestorm1"));
  assertEquals([...descendantsWith(world, weapon, EnchantmentNode)].length, 1, "weapon enchant should create runtime topology");

  world.add(actor, ApplyIntent, { itemId: wardScroll, targetItemId: amulet });
  applySystem(world);
  finishGearApplication(world);

  assertEquals(results.length, 2);
  assertEquals(results[1]?.ok, true);
  assert((world.get(amulet, ItemInfo)?.affixes || []).includes("fireWard1"));
  assertEquals([...descendantsWith(world, amulet, EnchantmentNode)].length, 1, "ward enchant should create runtime topology");

  const secondScroll = createItemById(world, "scroll_enchant_fire");
  addToInventory(world, actor, secondScroll);
  world.add(actor, ApplyIntent, { itemId: secondScroll, targetItemId: weapon });
  applySystem(world);
  finishGearApplication(world);

  assertEquals(results.length, 3);
  assertEquals(results[2]?.ok, false);
  assertEquals(cancelled.length, 1);
  assertEquals(cancelled[0]?.code, "ENCHANT_ALREADY_PRESENT");
  assert(world.isAlive(secondScroll), "duplicate enchant should not consume the scroll");
});

Deno.test("fire weapon scroll rejects incompatible accessory targets", () => {
  const world = new World({ seed: 1203 });
  const actor = makeActor(world);
  const amulet = createItemById(world, "amulet_guarded");
  const fireScroll = createItemById(world, "scroll_enchant_fire");
  assert(amulet > 0 && fireScroll > 0);
  addToInventory(world, actor, amulet);
  addToInventory(world, actor, fireScroll);

  const results = [];
  world.on("interaction:result", (ev) => results.push(ev));

  world.add(actor, ApplyIntent, { itemId: fireScroll, targetItemId: amulet });
  applySystem(world);

  assertEquals(results.length, 1);
  assertEquals(results[0]?.metrics?.payloadMatched, false);
  assertEquals((world.get(amulet, ItemInfo)?.affixes || []).includes("firestorm1"), false);
  assert(world.isAlive(fireScroll), "invalid target should not consume the scroll");
});

Deno.test("enchant paths cover every non-ammo gear slot", () => {
  const slotFixtures = {
    weapon: { itemId: "dagger_quick", scrollId: "scroll_enchant_fire", affixId: "firestorm1" },
    armor: { itemId: "leather_armor", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1" },
    head: { itemId: "helm_iron", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1" },
    neck: { itemId: "amulet_guarded", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1" },
    belt: { itemId: "belt_leather", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1" },
    gloves: { itemId: "gloves_leather", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1" },
    offhand: { itemId: "shield_wood", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1" },
    ring1: { itemId: "ring_copper", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1", forceSlot: "ring1" },
    ring2: { itemId: "ring_copper", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1", forceSlot: "ring2" },
    legs: { itemId: "leggings_leather", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1" },
    feet: { itemId: "boots_leather", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1" },
    ranged: { itemId: "bow_short", scrollId: "scroll_enchant_fortified", affixId: "kineticWard1" },
  };

  for (const slot of NON_AMMO_GEAR_SLOTS) {
    assert(slotFixtures[slot], `missing enchant coverage fixture for ${slot}`);
  }

  for (const slot of NON_AMMO_GEAR_SLOTS) {
    const world = new World({ seed: 1204 });
    const actor = makeActor(world);
    const fixture = slotFixtures[slot];
    const target = createItemById(world, fixture.itemId);
    const scroll = createItemById(world, fixture.scrollId);
    assert(target > 0 && scroll > 0, `required test items should be creatable for ${slot}`);
    if (fixture.forceSlot) {
      world.get(target, ItemInfo).slot = fixture.forceSlot;
    }
    addToInventory(world, actor, target);
    addToInventory(world, actor, scroll);

    world.add(actor, ApplyIntent, { itemId: scroll, targetItemId: target });
    applySystem(world);
    finishGearApplication(world);

    assert((world.get(target, ItemInfo)?.affixes || []).includes(fixture.affixId), `${slot} should accept ${fixture.scrollId}`);
    assert(!world.isAlive(scroll), `${slot} enchant should consume the scroll`);
  }
});

Deno.test("slot normalization lets shield-labeled gear accept offhand enchants", () => {
  const world = new World({ seed: 1205 });
  const actor = makeActor(world);
  const shield = createItemById(world, "shield_wood");
  const scroll = createItemById(world, "scroll_enchant_fortified");
  assert(shield > 0 && scroll > 0);
  world.get(shield, ItemInfo).slot = "shield";
  addToInventory(world, actor, shield);
  addToInventory(world, actor, scroll);

  world.add(actor, ApplyIntent, { itemId: scroll, targetItemId: shield });
  applySystem(world);
  finishGearApplication(world);

  assert((world.get(shield, ItemInfo)?.affixes || []).includes("kineticWard1"));
  assert(!world.isAlive(scroll));
});

Deno.test("stat enchant scrolls bind their authored passive affixes", () => {
  const fixtures = [
    ["scroll_enchant_guarded", "leather_armor", "guard1"],
    ["scroll_enchant_healthy", "leather_armor", "life1"],
    ["scroll_enchant_attuned", "ring_copper", "attuned1"],
    ["scroll_enchant_lucky", "ring_copper", "lucky1"],
    ["scroll_enchant_fierce", "dagger_quick", "fierce"],
  ];

  for (const [scrollId, targetId, affixId] of fixtures) {
    const world = new World({ seed: 1206 });
    const actor = makeActor(world);
    const target = createItemById(world, targetId);
    const scroll = createItemById(world, scrollId);
    assert(target > 0 && scroll > 0, `${scrollId} should be creatable`);
    addToInventory(world, actor, target);
    addToInventory(world, actor, scroll);

    world.add(actor, ApplyIntent, { itemId: scroll, targetItemId: target });
    applySystem(world);
    finishGearApplication(world);

    assert((world.get(target, ItemInfo)?.affixes || []).includes(affixId), `${scrollId} should add ${affixId}`);
    assert(!world.isAlive(scroll), `${scrollId} should be consumed after a successful binding`);
  }
});
