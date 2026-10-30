import { assert } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { Potion } from '../src/rules/components/Potion.js';
import { Inventory } from '../src/rules/components/Inventory.js';
import { ItemInfo } from '../src/rules/components/ItemInfo.js';
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { ActiveEffects } from '../src/rules/components/ActiveEffects.js';
import { Vitality } from '../src/rules/components/Vitality.js';
import { Unpaid } from "../src/rules/components/Unpaid.js";
import { DrinkIntent } from '../src/rules/components/Intents/DrinkIntent.js';
import { drinkSystem } from '../src/rules/systems/drinkSystem.js';
import { addToInventory, inventoryContains } from "../src/rules/utils/inventoryFacade.js";
import { shopDebtRecords } from "../src/rules/utils/shopDebt.js";
import { getCatalogItem } from "../src/rules/data/itemCatalog.js";
import { createItemById, listAllItemIds } from "../src/rules/utils/itemFactory.js";

Deno.test("drinking a single-dose potion applies effect and destroys it", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  world.add(actor, Vitality, { maxHp: 50, hp: 30 });
  world.add(actor, Inventory, { items: [], maxWeight: 100 });

  const potion = world.create();
  world.add(potion, Potion, {
    name: 'Healing Potion', route: 'oral', doses: 1, channels: [],
    effects: [{ key: 'regeneration', potency: 5, onset: 0, peak: 0, duration: 3, stack: 'add' }],
    toxicity: null
  });
  world.add(potion, ItemInfo, { type: 'potion', slot: '', weight: 1, value: 10, description: '', count: 1, bonuses: {}, rarity: 1, rarityName: 'common', affixes: [] });

  addToInventory(world, actor, potion);

  world.add(actor, DrinkIntent, { itemId: potion, targetId: 0 });
  drinkSystem(world);

  assert(!world.has(actor, DrinkIntent), 'DrinkIntent should be consumed');

  const ae = world.get(actor, ActiveEffects);
  assert(ae && ae.effects.length === 1, `should have 1 effect, got ${ae?.effects?.length}`);
  assert(ae.effects[0].key === 'regeneration', `effect key should be regeneration, got ${ae.effects[0].key}`);
  assert(ae.effects[0].potency === 5, `potency should be 5, got ${ae.effects[0].potency}`);
  assert(ae.effects[0].turnsLeft === 3, `duration should be 3, got ${ae.effects[0].turnsLeft}`);

  assert(!world.isAlive(potion), 'empty potion should be destroyed');
  assert(!inventoryContains(world, actor, potion), 'potion should be removed from inventory');
});

Deno.test("quaffing an unpaid potion consumes it and records consumption theft debt", () => {
  const world = new World({ seed: 2 });

  const actor = world.create();
  world.add(actor, Vitality, { maxHp: 50, hp: 30 });
  world.add(actor, Inventory, { items: [], maxWeight: 100 });

  const shopkeeperId = 9001;
  const potion = world.create();
  world.add(potion, NamedIdentity, { identity: "potion_healing", name: "Healing Potion" });
  world.add(potion, Potion, {
    name: "Healing Potion", route: "oral", doses: 1, channels: [],
    effects: [{ key: "regeneration", potency: 5, onset: 0, peak: 0, duration: 3, stack: "add" }],
    toxicity: null,
  });
  world.add(potion, ItemInfo, { type: "potion", slot: "", weight: 1, value: 10, description: "", count: 1, bonuses: {}, rarity: 1, rarityName: "common", affixes: [] });
  world.add(potion, Unpaid, { shopkeeperId, price: 45 });

  addToInventory(world, actor, potion);

  const unauthorized = [];
  const speech = [];
  world.on("shop:unauthorized-use", (ev) => unauthorized.push(ev));
  world.on("npc:dialogue", (ev) => speech.push(ev));

  world.add(actor, DrinkIntent, { itemId: potion, targetId: 0 });
  drinkSystem(world);

  assert(!world.isAlive(potion), "single-dose unpaid potion should still be consumed");
  assert(!inventoryContains(world, actor, potion), "potion should be removed from inventory");

  const debts = shopDebtRecords(world, actor, shopkeeperId);
  assert(debts.length === 1, "one shop debt should be recorded");
  assert(debts[0].amount === 45, "debt amount should equal unpaid price");
  assert(debts[0].reason === "consumption_theft", "debt reason should classify consumed value");
  assert(debts[0].identity === "potion_healing", "debt should preserve consumed item identity");

  assert(unauthorized.length === 1, "unauthorized-use event should be emitted once");
  assert(unauthorized[0].amount === 45, "event should include amount");
  assert(unauthorized[0].reason === "consumption_theft", "event should include reason");
  assert(speech.length === 1, "shopkeeper should speak potion debt through NPC dialogue");
  assert(speech[0].actor === shopkeeperId, "shopkeeper should be the speaker");
  assert(speech[0].text.includes("You drink it, you buy it"), "speech should explain consumption theft debt");
});

Deno.test("drinking from a stacked potion decrements count", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  world.add(actor, Vitality, { maxHp: 50, hp: 50 });
  world.add(actor, Inventory, { items: [], maxWeight: 100 });

  const stack = world.create();
  world.add(stack, Potion, {
    name: 'Mana Flask', route: 'oral', doses: 1, channels: [],
    effects: [{ key: 'mana_restore', potency: 10, onset: 0, peak: 0, duration: 1, stack: 'add' }],
    toxicity: null
  });
  world.add(stack, ItemInfo, { type: 'potion', slot: '', weight: 1, value: 5, description: '', count: 3, bonuses: {}, rarity: 1, rarityName: 'common', affixes: [] });

  addToInventory(world, actor, stack);

  world.add(actor, DrinkIntent, { itemId: stack, targetId: 0 });
  drinkSystem(world);

  const info = world.get(stack, ItemInfo);
  assert(world.isAlive(stack), 'stacked potion should still exist');
  assert(info.count === 2, `stack count should be 2, got ${info.count}`);
});

Deno.test("DrinkIntent on non-Potion item is consumed harmlessly", () => {
  const world = new World({ seed: 1 });

  const rock = world.create();
  const actor = world.create();
  world.add(actor, DrinkIntent, { itemId: rock, targetId: 0 });
  drinkSystem(world);
  assert(!world.has(actor, DrinkIntent), 'invalid drink intent should be consumed');
});

Deno.test("toxic potion schedules hangover effect", () => {
  const world = new World({ seed: 1 });

  const actor = world.create();
  world.add(actor, Vitality, { maxHp: 100, hp: 100 });
  world.add(actor, Inventory, { items: [], maxWeight: 100 });

  const toxicBrew = world.create();
  world.add(toxicBrew, Potion, {
    name: 'Toxic Brew', route: 'oral', doses: 1, channels: [],
    effects: [{ key: 'strength', potency: 10, onset: 0, peak: 0, duration: 10, stack: 'add' }],
    toxicity: { hangover: 3 }
  });
  world.add(toxicBrew, ItemInfo, { type: 'potion', slot: '', weight: 1, value: 5, description: '', count: 1, bonuses: {}, rarity: 1, rarityName: 'common', affixes: [] });

  addToInventory(world, actor, toxicBrew);

  world.add(actor, DrinkIntent, { itemId: toxicBrew, targetId: 0 });
  drinkSystem(world);

  const ae = world.get(actor, ActiveEffects);
  const hangover = ae.effects.find(e => e.key === 'hangover');
  assert(hangover, 'should schedule a hangover effect');
  assert(hangover.potency === 3, `hangover potency should be 3, got ${hangover.potency}`);
});

Deno.test("every catalog potion remains drinkable through the canonical path", () => {
  for (const itemId of listAllItemIds().filter((id) => getCatalogItem(id)?.type === "potion")) {
    const world = new World({ seed: 150 });
    const actor = world.create();
    world.add(actor, Vitality, { maxHp: 100, hp: 100 });
    world.add(actor, Inventory, { items: [], maxWeight: 100 });

    const potion = createItemById(world, itemId);
    assert(potion > 0, `${itemId} should be creatable`);
    addToInventory(world, actor, potion);

    const results = [];
    world.on("interaction:result", (event) => results.push(event));
    world.add(actor, DrinkIntent, { itemId: potion, targetId: actor });
    drinkSystem(world);

    assertEquals(results.length, 1, `${itemId} should produce one interaction result`);
    assertEquals(results[0].ok, true, `${itemId} should be drinkable`);
    assert(!world.isAlive(potion), `${itemId} should be consumed after drinking`);
  }
});
