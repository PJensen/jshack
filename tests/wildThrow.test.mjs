import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { Faction } from "../src/rules/components/Faction.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { CreatureType } from "../src/rules/components/CreatureType.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { ThrowIntent } from "../src/rules/components/Intents/ThrowIntent.js";
import { throwSystem } from "../src/rules/systems/throwSystem.js";
import { hazardSystem } from "../src/rules/systems/hazardSystem.js";
import { addToInventory, inventoryContains } from "../src/rules/utils/inventoryFacade.js";
import { buildEffectRows } from "../src/main/ui/effectRows.js";

// ── Wand Shatter Tests ─────────────────────────────────────────────────

Deno.test("thrown wand_lightning shatters, damages entities in radius, and is consumed", () => {
  const world = new World({ seed: 9001 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const mob = world.create();
  world.add(mob, Position, { x: 7, y: 5 });
  world.add(mob, Vitality, { hp: 50, maxHp: 50 });
  world.add(mob, Faction, { key: "enemy" });

  const wand = buildCatalogItem(world, "wand_lightning");
  addToInventory(world, actor, wand);

  const shatterEvents = [];
  const results = [];
  world.on("wand:shatter", (ev) => shatterEvents.push(ev));
  world.on("interaction:result", (ev) => results.push(ev));

  world.add(actor, ThrowIntent, { itemId: wand, x: 7, y: 5 });
  throwSystem(world);

  assertEquals(results.length, 1);
  assertEquals(results[0].ok, true);
  assertEquals(results[0].metrics.consumed, true, "wand should be consumed on shatter");

  assertEquals(shatterEvents.length, 1);
  assertEquals(shatterEvents[0].element, "electric");
  assert(shatterEvents[0].charges > 0, "should report charges");
  assert(shatterEvents[0].damage > 0, "should report damage");
});

Deno.test("thrown wand_meteor creates fire hazard at landing", () => {
  const world = new World({ seed: 9002 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const wand = buildCatalogItem(world, "wand_meteor");
  addToInventory(world, actor, wand);

  const shatterEvents = [];
  world.on("wand:shatter", (ev) => shatterEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: wand, x: 8, y: 5 });
  throwSystem(world);

  assertEquals(shatterEvents.length, 1);
  assertEquals(shatterEvents[0].element, "fire");

  // Check hazard was spawned
  let hazardFound = false;
  for (const [, ha] of world.query(HazardArea)) {
    if (ha && ha.kind === "fire") hazardFound = true;
  }
  assert(hazardFound, "wand_meteor shatter should spawn a fire hazard");
});

Deno.test("thrown wand_heal heals entities in blast radius", () => {
  const world = new World({ seed: 9003 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const ally = world.create();
  world.add(ally, Position, { x: 7, y: 5 });
  world.add(ally, Vitality, { hp: 10, maxHp: 50 });
  world.add(ally, Faction, { key: "player" });

  const wand = buildCatalogItem(world, "wand_heal");
  addToInventory(world, actor, wand);

  const shatterEvents = [];
  world.on("wand:shatter", (ev) => shatterEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: wand, x: 7, y: 5 });
  throwSystem(world);

  assertEquals(shatterEvents.length, 1);
  assertEquals(shatterEvents[0].element, "holy");
  assert(shatterEvents[0].heal > 0, "heal wand shatter should report healing");

  const vit = world.get(ally, Vitality);
  assert(vit.hp > 10, "ally should have been healed by wand_heal shatter");
});

Deno.test("thrown wand_frost applies frozen effect to entities in radius", () => {
  const world = new World({ seed: 9004 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const mob = world.create();
  world.add(mob, Position, { x: 7, y: 5 });
  world.add(mob, Vitality, { hp: 50, maxHp: 50 });
  world.add(mob, Faction, { key: "enemy" });

  const wand = buildCatalogItem(world, "wand_frost");
  addToInventory(world, actor, wand);

  const shatterEvents = [];
  world.on("wand:shatter", (ev) => shatterEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: wand, x: 7, y: 5 });
  throwSystem(world);

  assertEquals(shatterEvents.length, 1);
  assertEquals(shatterEvents[0].element, "cold");
});

// ── Potion Splash Tests ─────────────────────────────────────────────────

Deno.test("thrown potion_paralysis stuns target on landing tile", () => {
  const world = new World({ seed: 9010 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const mob = world.create();
  world.add(mob, Position, { x: 7, y: 5 });
  world.add(mob, Vitality, { hp: 30, maxHp: 30 });
  world.add(mob, Faction, { key: "enemy" });

  const pot = buildCatalogItem(world, "potion_paralysis");
  addToInventory(world, actor, pot);

  const splashEvents = [];
  world.on("potion:splash", (ev) => splashEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: pot, x: 7, y: 5 });
  throwSystem(world);

  assertEquals(splashEvents.length, 1);
  assertEquals(splashEvents[0].effectKey, "stun");
  assert(splashEvents[0].hitCount >= 1, "should hit mob on landing tile");
  assert(!inventoryContains(world, actor, pot), "potion should be consumed");
  assertEquals(buildEffectRows(world, mob).find((row) => row.key === "stunned")?.glyph, "🔒");
});

Deno.test("thrown potion_hallucination splashes confused effect", () => {
  const world = new World({ seed: 9011 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const mob = world.create();
  world.add(mob, Position, { x: 7, y: 5 });
  world.add(mob, Vitality, { hp: 30, maxHp: 30 });
  world.add(mob, Faction, { key: "enemy" });

  const pot = buildCatalogItem(world, "potion_hallucination");
  addToInventory(world, actor, pot);

  const splashEvents = [];
  world.on("potion:splash", (ev) => splashEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: pot, x: 7, y: 5 });
  throwSystem(world);

  assertEquals(splashEvents.length, 1);
  assertEquals(splashEvents[0].effectKey, "confused");
});

Deno.test("thrown potion_sickness poisons and damages target", () => {
  const world = new World({ seed: 9012 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const mob = world.create();
  world.add(mob, Position, { x: 7, y: 5 });
  world.add(mob, Vitality, { hp: 30, maxHp: 30 });
  world.add(mob, Faction, { key: "enemy" });

  const pot = buildCatalogItem(world, "potion_sickness");
  addToInventory(world, actor, pot);

  const splashEvents = [];
  world.on("potion:splash", (ev) => splashEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: pot, x: 7, y: 5 });
  throwSystem(world);

  assertEquals(splashEvents.length, 1);
  assertEquals(splashEvents[0].effectKey, "poison");
});

Deno.test("thrown potion_vigor creates blood pool that heals after hazard pulse", () => {
  const world = new World({ seed: 9013 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const mob = world.create();
  world.add(mob, Position, { x: 7, y: 5 });
  world.add(mob, Vitality, { hp: 10, maxHp: 50 });
  world.add(mob, Faction, { key: "enemy" });

  const pot = buildCatalogItem(world, "potion_vigor");
  addToInventory(world, actor, pot);

  const splashEvents = [];
  world.on("potion:splash", (ev) => splashEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: pot, x: 7, y: 5 });
  throwSystem(world);

  assertEquals(splashEvents.length, 1);
  assertEquals(splashEvents[0].effectKey, "blood_pool");
  assertEquals(splashEvents[0].hitCount, 0);
  const vit = world.get(mob, Vitality);
  assertEquals(vit.hp, 10, "mob should not be healed by initial vigor splash");

  const pools = [...world.query(Position, HazardArea)].filter(([, , hazard]) => hazard.kind === "blood_pool");
  assertEquals(pools.length, 1, "vigor throw should create one blood pool");

  hazardSystem(world);
  assert(world.get(mob, Vitality).hp > 10, "mob should be healed by blood pool pulse");
});

Deno.test("thrown potion_keen_edge shatters harmlessly (dud)", () => {
  const world = new World({ seed: 9014 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const pot = buildCatalogItem(world, "potion_keen_edge");
  addToInventory(world, actor, pot);

  const dudEvents = [];
  world.on("potion:splash:dud", (ev) => dudEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: pot, x: 8, y: 5 });
  throwSystem(world);

  assertEquals(dudEvents.length, 1, "keen_edge should emit a dud splash event");
});

// ── Corpse Misdirect Tests ──────────────────────────────────────────────

Deno.test("thrown corpse misdirects hunting mob to investigate landing tile", () => {
  const world = new World({ seed: 9020 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const mob = world.create();
  world.add(mob, Position, { x: 9, y: 5 });
  world.add(mob, Vitality, { hp: 20, maxHp: 20 });
  world.add(mob, Faction, { key: "enemy" });
  world.add(mob, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: 5, lastKnownY: 5,
    searchTurnsLeft: 0,
    retreating: false,
  });

  // Create a corpse item manually
  const corpse = world.create();
  world.add(corpse, NamedIdentity, { name: "rat corpse", identity: "corpse_rat" });
  world.add(corpse, ItemInfo, {
    type: "food", slot: "bag", weight: 2, value: 0,
    description: "A dead rat.", count: 1, bonuses: {},
    rarity: 1, rarityName: "common", affixes: [],
  });
  addToInventory(world, actor, corpse);

  const misdirectEvents = [];
  world.on("corpse:misdirect", (ev) => misdirectEvents.push(ev));

  // Throw corpse near the mob (within misdirect radius of 3)
  world.add(actor, ThrowIntent, { itemId: corpse, x: 8, y: 5 });
  throwSystem(world);

  assertEquals(misdirectEvents.length, 1);
  assertEquals(misdirectEvents[0].identity, "corpse_rat");
  assert(misdirectEvents[0].misdirectedCount >= 1, "at least one mob should be misdirected");

  const aggro = world.get(mob, AggroState);
  assertEquals(aggro.alertLevel, AGGRO_LEVELS.alerted, "mob should be downgraded to alerted");
  assertEquals(aggro.lastKnownX, 8, "mob should investigate the corpse landing position X");
  assertEquals(aggro.lastKnownY, 5, "mob should investigate the corpse landing position Y");
});

Deno.test("thrown undead corpse makes undead mobs curious instead of alerted", () => {
  const world = new World({ seed: 9021 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const undead = world.create();
  world.add(undead, Position, { x: 8, y: 5 });
  world.add(undead, Vitality, { hp: 20, maxHp: 20 });
  world.add(undead, Faction, { key: "enemy" });
  world.add(undead, CreatureType, { type: "undead" });
  world.add(undead, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: 5, lastKnownY: 5,
    searchTurnsLeft: 0,
    retreating: false,
  });

  const corpse = world.create();
  world.add(corpse, NamedIdentity, { name: "wight corpse", identity: "corpse_wight" });
  world.add(corpse, ItemInfo, {
    type: "food", slot: "bag", weight: 3, value: 0,
    description: "A dead wight.", count: 1, bonuses: {},
    rarity: 1, rarityName: "common", affixes: [],
  });
  addToInventory(world, actor, corpse);

  const misdirectEvents = [];
  world.on("corpse:misdirect", (ev) => misdirectEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: corpse, x: 8, y: 5 });
  throwSystem(world);

  assertEquals(misdirectEvents.length, 1);
  assert(misdirectEvents[0].isUndead, "should flag as undead corpse");

  const aggro = world.get(undead, AggroState);
  assertEquals(aggro.alertLevel, AGGRO_LEVELS.curious, "undead should become curious, not alerted");
});

Deno.test("thrown corpse does not misdirect unaware mobs", () => {
  const world = new World({ seed: 9022 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const mob = world.create();
  world.add(mob, Position, { x: 8, y: 5 });
  world.add(mob, Vitality, { hp: 20, maxHp: 20 });
  world.add(mob, Faction, { key: "enemy" });
  world.add(mob, AggroState, {
    alertLevel: AGGRO_LEVELS.unaware,
    lastKnownX: 0, lastKnownY: 0,
    searchTurnsLeft: 0,
    retreating: false,
  });

  const corpse = world.create();
  world.add(corpse, NamedIdentity, { name: "rat corpse", identity: "corpse_rat" });
  world.add(corpse, ItemInfo, {
    type: "food", slot: "bag", weight: 2, value: 0,
    description: "A dead rat.", count: 1, bonuses: {},
    rarity: 1, rarityName: "common", affixes: [],
  });
  addToInventory(world, actor, corpse);

  const misdirectEvents = [];
  world.on("corpse:misdirect", (ev) => misdirectEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: corpse, x: 8, y: 5 });
  throwSystem(world);

  assertEquals(misdirectEvents.length, 0, "unaware mobs should not be misdirected");

  const aggro = world.get(mob, AggroState);
  assertEquals(aggro.alertLevel, AGGRO_LEVELS.unaware, "unaware mob should stay unaware");
});

Deno.test("thrown corpse still lands on ground (not consumed)", () => {
  const world = new World({ seed: 9023 });
  const actor = world.create();
  world.add(actor, Inventory, { items: [], maxWeight: 999 });
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "player" });

  const corpse = world.create();
  world.add(corpse, NamedIdentity, { name: "rat corpse", identity: "corpse_rat" });
  world.add(corpse, ItemInfo, {
    type: "food", slot: "bag", weight: 2, value: 0,
    description: "A dead rat.", count: 1, bonuses: {},
    rarity: 1, rarityName: "common", affixes: [],
  });
  addToInventory(world, actor, corpse);

  const thrownEvents = [];
  world.on("item:thrown", (ev) => thrownEvents.push(ev));

  world.add(actor, ThrowIntent, { itemId: corpse, x: 8, y: 5 });
  throwSystem(world);

  assertEquals(thrownEvents.length, 1, "corpse should emit item:thrown (base throw)");
  assert(!inventoryContains(world, actor, corpse), "corpse should leave inventory");

  const groundPos = world.get(corpse, Position);
  assert(groundPos, "corpse should land on the ground");
});
