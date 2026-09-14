import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Duration } from "../src/rules/components/Duration.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { StatusEffectNode } from "../src/rules/components/StatusEffectNode.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Brain } from "../src/rules/components/Brain.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { UseIntent } from "../src/rules/components/Intents/UseIntent.js";
import { Hunger } from "../src/rules/components/Hunger.js";
import { useItemSystem } from "../src/rules/systems/useItemSystem.js";
import { aiScrollPickupSystem, aiScrollUseSystem } from "../src/rules/systems/aiScrollSystem.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { addToInventory, inventoryContains } from "../src/rules/utils/inventoryFacade.js";
import { statusStrength } from "../src/rules/utils/statusFacade.js";
import { descendantsWith } from "../src/rules/utils/topology.js";
import { evaluateScrollReadingQuality } from "../src/rules/utils/scrollReading.js";

function addLiving(world, x, y, faction = "enemy") {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Faction, { key: faction });
  world.add(id, Vitality, { hp: 10, maxHp: 10 });
  return id;
}

function effectDuration(world, entityId, key) {
  for (const [nodeId, effect] of descendantsWith(world, entityId, StatusEffectNode)) {
    if (String(effect?.key || "") !== key) continue;
    return world.get(nodeId, Duration)?.turnsLeft || 0;
  }
  return 0;
}

Deno.test("scroll reading fails when eyesight is too poor", () => {
  const world = new World({ seed: 9101 });
  world.setScheduler((w) => useItemSystem(w));
  const player = createPlayer(world, { x: 5, y: 5, name: "Reader" });
  world.get(player, Brain).visionRange = 2;
  const scroll = createItemById(world, "scroll_blastwave");
  addToInventory(world, player, scroll);

  const failed = [];
  const casts = [];
  world.on("scroll:read-failed", (e) => failed.push(e));
  world.on("castSpell", (e) => casts.push(e));

  world.add(player, UseIntent, { itemId: scroll });
  world.tick(1);

  assert(!world.isAlive(scroll), "failed reading should still consume the scroll");
  assertEquals(failed[0]?.reason, "low_vision");
  assertEquals(casts.length, 0);
});

Deno.test("scroll of mass delirium applies fixed-duration confusion in a wide area", () => {
  const world = new World({ seed: 9102 });
  world.setScheduler((w) => useItemSystem(w));
  const player = createPlayer(world, { x: 0, y: 0, name: "Reader" });
  const near = addLiving(world, 32, 0);
  const far = addLiving(world, 33, 0);
  const scroll = createItemById(world, "scroll_mass_delirium");
  addToInventory(world, player, scroll);

  const events = [];
  world.on("spell:mass_delirium", (e) => events.push(e));

  world.add(player, UseIntent, { itemId: scroll });
  world.tick(1);

  assert(!world.isAlive(scroll), "scroll should be consumed");
  assertEquals(statusStrength(world, near, "confused"), 1);
  assertEquals(effectDuration(world, near, "confused"), 50);
  assertEquals(statusStrength(world, far, "confused"), 0);
  assertEquals(statusStrength(world, player, "confused"), 0, "successful read should not confuse reader");
  assertEquals(events[0]?.duration, 50);
});

Deno.test("scroll reliability is mediated by reader condition, not spell power", () => {
  const clear = evaluateScrollReadingQuality({ effectiveVisionRange: 8 });
  const impaired = evaluateScrollReadingQuality({
    effectiveVisionRange: 3,
    confused: 2,
    hallucinating: 1,
    hungerDistraction: 3,
    woundDistraction: 3,
  });
  assertEquals(clear.fumbleChance, 0);
  assert(impaired.fumbleChance > clear.fumbleChance, "mental state, hunger, and wounds should raise fumble chance");
});

Deno.test("sapient humanoid monster can pick up and read mass delirium scroll", () => {
  const world = new World({ seed: 9103 });
  world.setScheduler((w) => {
    aiScrollPickupSystem(w);
    aiScrollUseSystem(w);
    useItemSystem(w);
  });
  const player = createPlayer(world, { x: 0, y: 0, name: "Player" });
  const lich = world.create();
  world.add(lich, Position, { x: 2, y: 0 });
  world.add(lich, Faction, { key: "enemy" });
  world.add(lich, NamedIdentity, { identity: "lich", name: "Lich" });
  world.add(lich, Brain, { learnedSpellIds: [], itemKnowledgeIdentities: [], seenTiles: new Uint8Array(), intelligence: 10, visionRange: 8 });
  world.add(lich, Inventory, { capacity: 1 });
  world.add(lich, Vitality, { hp: 20, maxHp: 20 });
  world.add(lich, AggroState, { alertLevel: AGGRO_LEVELS.hunting, lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0 });

  const scroll = createItemById(world, "scroll_mass_delirium");
  world.add(scroll, Position, { x: 2, y: 0 });

  const reads = [];
  world.on("monster:read-scroll", (e) => reads.push(e));

  world.tick(1);

  assertEquals(reads.length, 1);
  assert(!world.isAlive(scroll), "monster-read scroll should be consumed");
  assertEquals(inventoryContains(world, lich, scroll), false);
  assertEquals(statusStrength(world, player, "confused"), 1, "reader-centered AoE should affect nearby player");
  assertEquals(statusStrength(world, lich, "confused"), 0, "reader should be excluded on success");
});
