import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { defineEffect, defineItem } from "../src/content/define.js";
import { getContentItem } from "../src/content/registry.js";
import { createContentAbilityController } from "../src/main/targeting/itemAbilityController.js";
import { registerCatalogItem } from "../src/rules/data/itemCatalog.js";
import { Charges, Faction, Inventory, NamedIdentity, Position, Vitality } from "../src/rules/components/index.js";
import { ScriptState } from "../src/rules/components/ScriptState.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { ItemAbilityActivated } from "../src/events/ItemAbilityActivated.js";
import { useItemSystem } from "../src/rules/systems/useItemSystem.js";
import { addToInventory, removeFromInventory } from "../src/rules/utils/inventoryFacade.js";
import { getItemCooldownRemaining } from "../src/rules/utils/itemCooldowns.js";
import { statusStrength } from "../src/rules/utils/statusFacade.js";
import { snapshotEffectInstances } from "../src/rules/utils/effectInstances.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { clearAll, loadChunk, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import { Player } from "../src/rules/components/Player.js";
import { serializeSavegameWorld } from "../src/main/wiring/savegameSerializationRegistry.js";
import { restoreSnapshotFromSavegame } from "../src/main/wiring/savegameLoad.js";
import { CHUNK_SIZE, TILE_FLOOR, TILE_WALL } from "../src/rules/environment/dungeon/constants.js";
import { buildWorldView } from "../src/bridge/schema/worldView.js";

defineEffect("test_charm_stun", { name: "Tidal Stun", statuses: ["stunned"], periodic: [] });
defineItem("test_charged_charm", {
  name: "Test Charm", type: "tool", chargePool: { current: 2, max: 2 }, state: { invoked: false },
  abilities: {
    stun: { targeting: "enemy", range: 4, cooldown: 3, chargeCost: 1, effects: [{ key: "test_charm_stun", turnsLeft: 3 }] },
    cancel: { cooldown: 3, chargeCost: 1, onActivate(ctx) { ctx.setState({ invoked: true }); ctx.setCooldown(20); ctx.cancel({ code: "TEST_CANCEL", message: "Cancelled" }); } },
    stateful: { onActivate(ctx) { ctx.setState({ invoked: true }); ctx.setState({ count: 1 }); ctx.setState({ count: ctx.state().count + 1 }); } },
  },
});
registerCatalogItem("test_charged_charm", getContentItem("test_charged_charm"));

function setup() {
  clearAll();
  loadChunk(-1, -1, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  const world = new World({ seed: 614 });
  const actor = world.create();
  world.add(actor, Player, {});
  world.add(actor, Inventory, { capacity: 20 });
  world.add(actor, Vitality, { hp: 10, maxHp: 10 });
  world.add(actor, Faction, { key: "player" });
  world.add(actor, Position, { x: -8, y: -8 });
  const item = createItemById(world, "test_charged_charm");
  addToInventory(world, actor, item);
  const target = world.create();
  world.add(target, NamedIdentity, { identity: "goblin", name: "Goblin" });
  world.add(target, Vitality, { hp: 10, maxHp: 10 });
  world.add(target, Faction, { key: "enemy" });
  world.add(target, Position, { x: -6, y: -8 });
  world.setScheduler(useItemSystem);
  const activate = (abilityId = "stun") => {
    let result;
    const off = world.on("interaction:result", (event) => { result = event; });
    world.add(actor, UseIntent, { itemId: item, targetId: target, abilityId });
    useItemSystem(world);
    off();
    return result;
  };
  return { world, actor, item, target, activate };
}

Deno.test("named item activation applies targeted topology effects and commits charge/cooldown once", () => {
  const { world, actor, item, target, activate } = setup();
  const receipts = [];
  world.on(ItemAbilityActivated, (event) => receipts.push(event));
  assert(activate().ok);
  assertEquals(statusStrength(world, target, "stunned"), 1);
  assert(buildWorldView(world).entities.find((entry) => entry.id === target)?.tags.includes("stunned"));
  assertEquals(snapshotEffectInstances(world, target)[0].sourceId, item);
  assertEquals(world.get(item, Charges).current, 1);
  assertEquals(getItemCooldownRemaining(world, item), 3);
  assertEquals(receipts.map((event) => [event.actor, event.itemId, event.targetId, event.abilityId]), [[actor, item, target, "stun"]]);
  assertEquals(activate().reason, "ABILITY_COOLDOWN");
  assertEquals(world.get(item, Charges).current, 1);
  assertEquals(receipts.length, 1);
});

Deno.test("invalid target, range, sight, charges, and ownership reject before costs", () => {
  for (const condition of ["dead", "friendly", "range", "wall", "charges", "ownership"]) {
    const { world, item, target, actor, activate } = setup();
    if (condition === "dead") world.get(target, Vitality).hp = 0;
    if (condition === "friendly") world.get(target, Faction).key = "player";
    if (condition === "range") world.get(target, Position).x = -1;
    if (condition === "wall") setTile(-7, -8, TILE_WALL);
    if (condition === "charges") world.get(item, Charges).current = 0;
    if (condition === "ownership") removeFromInventory(world, actor, item);
    assert(!activate().ok, condition);
    assertEquals(world.get(item, Charges).current, condition === "charges" ? 0 : 2, condition);
    assertEquals(getItemCooldownRemaining(world, item), 0, condition);
    assertEquals(snapshotEffectInstances(world, target).length, 0, condition);
  }
});

Deno.test("cancelled scripted activation discards state, effects, charges, and cooldown", () => {
  const { world, item, activate } = setup();
  assertEquals(activate("cancel").reason, "TEST_CANCEL");
  assertEquals(world.get(item, ScriptState).data.invoked, false);
  assertEquals(world.get(item, Charges).current, 2);
  assertEquals(getItemCooldownRemaining(world, item), 0);
});

Deno.test("target selection spends nothing until confirmation and rules revalidate moved targets", () => {
  const { world, actor, item, target } = setup();
  let prompt;
  const request = createContentAbilityController({
    world,
    targeting: { openEnemyTargeting: (spec) => { prompt = spec; } },
    playerEntity: () => ({ id: actor, pos: world.get(actor, Position) }),
    scanVisibleEnemies: () => [{ id: target }],
  });
  assert(request(item, "stun"));
  assert(prompt);
  assertEquals(world.step, 0);
  assertEquals(world.get(item, Charges).current, 2);
  world.get(target, Position).x = -1;
  prompt.onConfirm(target);
  assertEquals(world.get(item, Charges).current, 2);
  assertEquals(getItemCooldownRemaining(world, item), 0);
  assertEquals(snapshotEffectInstances(world, target), []);
});

Deno.test("scripted activation reads its own queued state patches and commits them together", () => {
  const { world, item, activate } = setup();
  assert(activate("stateful").ok);
  assertEquals(world.get(item, ScriptState).data, { invoked: true, count: 2 });
});

Deno.test("charged ability cooldown and charges resume on the saved game turn", () => {
  const { world, actor, item, activate } = setup();
  world.step = 100;
  assert(activate().ok);
  const snapshot = JSON.parse(JSON.stringify({ world: serializeSavegameWorld(world) }));
  const restored = new World({ seed: 614 });
  restoreSnapshotFromSavegame(restored, snapshot);
  assertEquals(restored.step, 100);
  assertEquals(restored.get(item, Charges).current, 1);
  assertEquals(getItemCooldownRemaining(restored, item), 3);
  assertEquals(restored.get(item, ScriptState).data, { invoked: false });
});

Deno.test("two copies retain independent charge pools instead of merging into an item stack", () => {
  const { world, actor, item, activate } = setup();
  assert(activate().ok);
  const second = createItemById(world, "test_charged_charm");
  assert(addToInventory(world, actor, second));
  assert(world.isAlive(second));
  assertEquals(world.get(item, Charges).current, 1);
  assertEquals(world.get(second, Charges).current, 2);
});
