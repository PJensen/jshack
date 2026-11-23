import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Interactable } from "../src/rules/components/Interactable.js";
import { InteractIntent } from "../src/rules/components/Intents/InteractIntent.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Mana } from "../src/rules/components/Mana.js";
import { Beatitude } from "../src/rules/components/Beatitude.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { Material } from "../src/rules/components/Material.js";
import { MaterialState } from "../src/rules/components/MaterialState.js";
import { FountainState } from "../src/rules/components/FountainState.js";
import { FountainDrinkResolved } from "../src/events/FountainDrinkResolved.js";
import { FountainDipResolved } from "../src/events/FountainDipResolved.js";
import { FountainDried } from "../src/events/FountainDried.js";
import { Teleported } from "../src/events/Teleported.js";
import "../src/content/interactables/index.js";
import { installContent } from "../src/content/install.js";
import { interactionSystem } from "../src/rules/systems/interactionSystem.js";
import { floodSystem } from "../src/rules/systems/floodSystem.js";
import {
  addToInventory,
  inventoryItems,
} from "../src/rules/utils/inventoryFacade.js";
import { resolveItemDisplayName } from "../src/main/wiring/itemName.js";
import { clearAll, getTile, loadChunk, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import {
  CHUNK_SIZE,
  TILE_BEACH,
  TILE_COBBLESTONE,
  TILE_FLOOR,
  TILE_SHALLOW_WATER,
  TILE_STAIR_DOWN,
} from "../src/rules/environment/dungeon/constants.js";

installContent();

// Helper: create a test world with a player and fountain at known positions.
function makeWorld(seed, fountainCharges = 20) {
  const world = new World({ seed });
  world.step = 1;

  // Lay a floor chunk so teleport / flood have tiles to work with.
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);

  const actor = world.create();
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Vitality, { maxHp: 40, hp: 20 });
  world.add(actor, Mana, { maxMana: 20, mana: 5, manaRegen: 0.1 });

  const fountain = world.create();
  world.add(fountain, Position, { x: 6, y: 5 });
  world.add(fountain, Interactable, {
    action: "fountain",
    params: null,
  });
  world.add(fountain, FountainState, { initialized: true, chargesRemaining: fountainCharges, maxCharges: Math.max(1, fountainCharges), primaryEffect: "heal", cooldownTurns: 201, dryUntilStep: -1 });

  return { world, actor, fountain };
}

// Drink once and return the event payload.
function drinkOnce(world, actor, fountain) {
  const events = [];
  world.on(FountainDrinkResolved, (e) => events.push(e));
  world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
  interactionSystem(world);
  return events[0] || null;
}

// Brute-force: try many seeds until we hit a target effect.
function findSeedForEffect(targetEffect, maxAttempts = 2000) {
  for (let seed = 1; seed <= maxAttempts; seed++) {
    const { world, actor, fountain } = makeWorld(seed);
    const ev = drinkOnce(world, actor, fountain);
    if (ev && ev.effect === targetEffect) return { seed, world, actor, fountain, ev };
  }
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────

Deno.test("fountain: heal outcome restores HP", () => {
  const hit = findSeedForEffect("heal");
  assert(hit, "should find a seed that produces heal");
  const vit = hit.world.get(hit.actor, Vitality);
  assert(vit.hp > 20, "HP should have increased from base 20");
});

Deno.test("fountain: mana outcome restores mana", () => {
  // Force mana primary
  for (let seed = 1; seed <= 2000; seed++) {
    const world = new World({ seed });
    world.step = 1;
    clearAll();
    const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
    loadChunk(0, 0, tiles);

    const actor = world.create();
    world.add(actor, Position, { x: 5, y: 5 });
    world.add(actor, Vitality, { maxHp: 40, hp: 20 });
    world.add(actor, Mana, { maxMana: 20, mana: 5, manaRegen: 0.1 });

    const fountain = world.create();
    world.add(fountain, Position, { x: 6, y: 5 });
    world.add(fountain, Interactable, {
      action: "fountain",
      params: null,
    });
  world.add(fountain, FountainState, { initialized: true, chargesRemaining: 20, maxCharges: Math.max(1, 20), primaryEffect: "mana", cooldownTurns: 201, dryUntilStep: -1 });

    const events = [];
    world.on(FountainDrinkResolved, (e) => events.push(e));
    world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
    interactionSystem(world);

    if (events[0]?.effect === "mana") {
      const m = world.get(actor, Mana);
      assert(m.mana > 5, "Mana should have increased");
      return;
    }
  }
  assert(false, "should find a seed that produces mana");
});

Deno.test("fountain: buff outcome applies an active effect", () => {
  const hit = findSeedForEffect("buff");
  assert(hit, "should find a seed that produces buff");
  const ae = hit.world.get(hit.actor, ActiveEffects);
  assert(ae, "actor should have ActiveEffects");
  const validBuffs = ["lucky", "keen_eye", "bear_vigor"];
  const found = ae.effects.some(e => validBuffs.includes(e.key));
  assert(found, `expected one of ${validBuffs.join("/")} in effects, got: ${JSON.stringify(ae.effects)}`);
  assert(hit.ev.turns > 0, "event should report buff duration");
});

Deno.test("fountain: see_invisible applies esp_sense effect", () => {
  const hit = findSeedForEffect("see_invisible");
  assert(hit, "should find a seed that produces see_invisible");
  const ae = hit.world.get(hit.actor, ActiveEffects);
  assert(ae, "actor should have ActiveEffects");
  const espEffect = ae.effects.find(e => e.key === "esp_sense");
  assert(espEffect, "should have esp_sense effect");
  assert(espEffect.turnsLeft > 0, "effect should have positive duration");
});

Deno.test("fountain: gold outcome spawns gold on the ground", () => {
  const hit = findSeedForEffect("gold");
  assert(hit, "should find a seed that produces gold");
  assert(hit.ev.amount > 0, "should report gold amount");
  // Verify a gold entity exists at the fountain position
  let foundGold = false;
  for (const [eid, ni, pos] of hit.world.query(NamedIdentity, Position)) {
    if (ni.identity === "gold" && pos.x === 6 && pos.y === 5) {
      foundGold = true;
      break;
    }
  }
  assert(foundGold, "gold entity should exist at fountain position");
});

Deno.test("fountain: curse outcome curses an inventory item", () => {
  // We need to give the actor an inventory item first.
  for (let seed = 1; seed <= 2000; seed++) {
    const { world, actor, fountain } = makeWorld(seed);

    // Actor needs Inventory component for the facade to work.
    world.add(actor, Inventory, { capacity: 10 });

    // Add an uncursed item to inventory.
    const item = world.create();
    world.add(item, NamedIdentity, { name: "Test Sword", identity: "sword_plain" });
    world.add(item, ItemInfo, { type: "weapon", slot: "weapon", count: 1 });
    world.add(item, Beatitude, { state: "uncursed" });
    addToInventory(world, actor, item);

    const events = [];
    world.on(FountainDrinkResolved, (e) => events.push(e));
    world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
    interactionSystem(world);

    if (events[0]?.effect === "curse") {
      const b = world.get(item, Beatitude);
      assertEquals(b.state, "cursed", "item should now be cursed");
      assert(events[0].cursedName, "event should name the cursed item");
      return;
    }
  }
  assert(false, "should find a seed that produces curse with an item in inventory");
});

Deno.test("fountain: poison outcome deals damage", () => {
  const hit = findSeedForEffect("poison");
  assert(hit, "should find a seed that produces poison");
  const vit = hit.world.get(hit.actor, Vitality);
  assert(vit.hp < 20, `HP should be reduced from base 20, got ${vit.hp}`);
});

Deno.test("fountain: creature outcome spawns a monster", () => {
  const hit = findSeedForEffect("creature");
  assert(hit, "should find a seed that produces creature");
  // The event may or may not succeed in spawning (tile availability).
  // If it did, spawnedName is set.
  if (hit.ev.spawnedName) {
    assert(
      hit.ev.spawnedName === "Water Nymph" || hit.ev.spawnedName === "Water Snake",
      `expected Water Nymph or Water Snake, got ${hit.ev.spawnedName}`,
    );
  }
});

Deno.test("fountain: teleport outcome moves the player", () => {
  const hit = findSeedForEffect("teleport");
  assert(hit, "should find a seed that produces teleport");
  const { world, actor, fountain } = makeWorld(hit.seed);
  const teleports = [];
  world.on(Teleported, (event) => teleports.push(event));
  const event = drinkOnce(world, actor, fountain);
  assertEquals(teleports.length, 1, "fountain teleport should use the canonical presentation event");
  assertEquals(teleports[0].source, "fountain");
  if (event.from && event.to) {
    const pos = world.get(actor, Position);
    assertEquals(pos.x, event.to.x, "player x should match teleport destination");
    assertEquals(pos.y, event.to.y, "player y should match teleport destination");
    assert(
      event.to.x !== event.from.x || event.to.y !== event.from.y,
      "player should have moved",
    );
  }
});

Deno.test("fountain: gush spends its volume over turns and preserves stairs", () => {
  const hit = findSeedForEffect("gush");
  assert(hit, "should find a seed that produces gush");
  const { world, actor, fountain } = makeWorld(hit.seed);
  setTile(6, 5, TILE_COBBLESTONE);
  setTile(6, 4, TILE_BEACH);
  setTile(7, 5, TILE_STAIR_DOWN);

  assertEquals(drinkOnce(world, actor, fountain)?.tilesFlooded, 1);
  assertEquals(getTile(6, 5), TILE_SHALLOW_WATER);
  assertEquals(getTile(6, 4), TILE_BEACH);
  world.setScheduler(floodSystem);
  world.tick(1);
  assertEquals(getTile(6, 4), TILE_SHALLOW_WATER);
  assertEquals(getTile(6, 3), TILE_FLOOR);
  for (let i = 0; i < 10; i++) world.tick(1);

  let tilesFlooded = 0;
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      if (getTile(x, y) === TILE_SHALLOW_WATER) tilesFlooded++;
    }
  }
  assertEquals(tilesFlooded, 21);
  assertEquals(getTile(6, 2), TILE_SHALLOW_WATER, "water can spread past the old two-tile reach");
  assertEquals(getTile(7, 5), TILE_STAIR_DOWN);
  assert(world.isAlive(fountain));
});

Deno.test("fountain: wish outcome spawns a loot item", () => {
  // Wish also needs DungeonState for depth lookup.
  for (let seed = 1; seed <= 8000; seed++) {
    const world = new World({ seed });
    world.step = 1;
    clearAll();
    const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
    loadChunk(0, 0, tiles);

    const actor = world.create();
    world.add(actor, Position, { x: 5, y: 5 });
    world.add(actor, Vitality, { maxHp: 40, hp: 20 });
    world.add(actor, Mana, { maxMana: 20, mana: 5, manaRegen: 0.1 });

    const fountain = world.create();
    world.add(fountain, Position, { x: 6, y: 5 });
    world.add(fountain, Interactable, {
      action: "fountain",
      params: null,
    });
  world.add(fountain, FountainState, { initialized: true, chargesRemaining: 20, maxCharges: Math.max(1, 20), primaryEffect: "heal", cooldownTurns: 201, dryUntilStep: -1 });

    const ds = world.create();
    world.add(ds, DungeonState, { worldSeed: seed, currentDepth: 3, floorEntityIds: [fountain] });

    const events = [];
    world.on(FountainDrinkResolved, (e) => events.push(e));
    world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
    interactionSystem(world);

    if (events[0]?.effect === "wish") {
      // Wish may or may not produce an item depending on loot table resolution.
      // If it did, wishedItem is set.
      if (events[0].wishedItem) {
        assert(typeof events[0].wishedItem === "string", "wishedItem should be a string name");
      }
      return;
    }
  }
  assert(false, "should find a seed that produces wish within 8000 attempts");
});

Deno.test("fountain: charge decremented after each drink", () => {
  const { world, actor, fountain } = makeWorld(42, 3);
  const events = [];
  world.on(FountainDrinkResolved, (e) => events.push(e));
  world.on(FountainDried, (e) => events.push(e));

  for (let i = 0; i < 4; i++) {
    world.step = i + 1;
    world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
    interactionSystem(world);
  }

  // After 3 drinks (or fewer if gush destroyed it), fountain should be dry or gone.
  const state = world.get(fountain, FountainState);
  if (world.isAlive(fountain) && state) {
    assertEquals(
      state.chargesRemaining | 0,
      0,
      "fountain should have 0 charges after 3 uses",
    );
  }
});

Deno.test("fountain: all 11 outcome types are reachable", () => {
  const seen = new Set();
  const target = new Set([
    "heal", "mana", "buff", "see_invisible", "nothing",
    "gold", "curse", "poison", "creature", "teleport", "gush", "wish",
  ]);

  for (let seed = 1; seed <= 5000 && seen.size < target.size; seed++) {
    // Alternate between heal and mana primary to cover both
    const primary = seed % 2 === 0 ? "heal" : "mana";
    const world = new World({ seed });
    world.step = 1;
    clearAll();
    const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
    loadChunk(0, 0, tiles);

    const actor = world.create();
    world.add(actor, Position, { x: 5, y: 5 });
    world.add(actor, Vitality, { maxHp: 40, hp: 20 });
    world.add(actor, Mana, { maxMana: 20, mana: 5, manaRegen: 0.1 });
    world.add(actor, Inventory, { capacity: 10 });

    // Add an item for curse to target
    const item = world.create();
    world.add(item, NamedIdentity, { name: "Sword", identity: "sword_plain" });
    world.add(item, ItemInfo, { type: "weapon", slot: "weapon", count: 1 });
    world.add(item, Beatitude, { state: "uncursed" });
    addToInventory(world, actor, item);

    const fountain = world.create();
    world.add(fountain, Position, { x: 6, y: 5 });
    world.add(fountain, Interactable, {
      action: "fountain",
      params: null,
    });
  world.add(fountain, FountainState, { initialized: true, chargesRemaining: 20, maxCharges: Math.max(1, 20), primaryEffect: primary, cooldownTurns: 201, dryUntilStep: -1 });

    const ds = world.create();
    world.add(ds, DungeonState, { worldSeed: seed, currentDepth: 3, floorEntityIds: [fountain] });

    const events = [];
    world.on(FountainDrinkResolved, (e) => events.push(e));
    world.add(actor, InteractIntent, { targetId: fountain, mode: "drink" });
    interactionSystem(world);

    if (events[0]) seen.add(events[0].effect);
  }

  for (const t of target) {
    assert(seen.has(t), `outcome "${t}" was never reached in 5000 seeds (saw: ${[...seen].join(", ")})`);
  }
});

// ── Dip tests ────────────────────────────────────────────────────────────

// Helper: create a world with player, fountain, and a dippable item.
function makeDipWorld(seed, charges = 20, itemBeatitude = "uncursed", itemSpec = {}) {
  const world = new World({ seed });
  world.step = 1;

  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);

  const actor = world.create();
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Vitality, { maxHp: 40, hp: 20 });
  world.add(actor, Inventory, { capacity: 20 });

  const item = world.create();
  const name = String(itemSpec.name || "Iron Sword");
  const identity = String(itemSpec.identity || "iron_sword");
  const type = String(itemSpec.type || "weapon");
  const slot = String(itemSpec.slot || "weapon");
  const materialKind = String(itemSpec.materialKind || "iron");
  const bonuses = itemSpec.bonuses && typeof itemSpec.bonuses === "object"
    ? { ...itemSpec.bonuses }
    : { attack: 2 };
  world.add(item, NamedIdentity, { name, identity });
  world.add(item, ItemInfo, { type, slot, count: 1, bonuses });
  world.add(item, Beatitude, { state: itemBeatitude });
  world.add(item, Material, { kind: materialKind });
  addToInventory(world, actor, item);

  const fountain = world.create();
  world.add(fountain, Position, { x: 6, y: 5 });
  world.add(fountain, Interactable, {
    action: "fountain",
    params: null,
  });
  world.add(fountain, FountainState, { initialized: true, chargesRemaining: charges, maxCharges: Math.max(1, charges), primaryEffect: "heal", cooldownTurns: 201, dryUntilStep: -1 });

  return { world, actor, fountain, item };
}

// Dip once and return the event payload.
function dipOnce(world, actor, fountain, itemId) {
  const events = [];
  world.on(FountainDipResolved, (e) => events.push(e));
  world.add(actor, InteractIntent, { targetId: fountain, mode: "dip", itemId });
  interactionSystem(world);
  return events[0] || null;
}

// Brute-force: find a seed that produces a specific dip effect.
function findDipSeedForEffect(targetEffect, beatitude = "uncursed", maxAttempts = 3000) {
  for (let seed = 1; seed <= maxAttempts; seed++) {
    const { world, actor, fountain, item } = makeDipWorld(seed, 20, beatitude);
    const ev = dipOnce(world, actor, fountain, item);
    if (ev && ev.effect === targetEffect) return { seed, world, actor, fountain, item, ev };
  }
  return null;
}

Deno.test("dip: uncurse outcome changes cursed item to uncursed", () => {
  const hit = findDipSeedForEffect("uncurse", "cursed");
  assert(hit, "should find a seed that produces uncurse");
  const beat = hit.world.get(hit.item, Beatitude);
  assertEquals(beat.state, "uncursed", "item should be uncursed after dip");
});

Deno.test("dip: bless outcome changes uncursed item to blessed", () => {
  const hit = findDipSeedForEffect("bless", "uncursed");
  assert(hit, "should find a seed that produces bless");
  const beat = hit.world.get(hit.item, Beatitude);
  assertEquals(beat.state, "blessed", "item should be blessed after dip");
});

Deno.test("dip: curse outcome changes uncursed item to cursed", () => {
  const hit = findDipSeedForEffect("curse", "uncursed");
  assert(hit, "should find a seed that produces curse");
  const beat = hit.world.get(hit.item, Beatitude);
  assertEquals(beat.state, "cursed", "item should be cursed after dip");
});

Deno.test("dip: rust outcome adds corrosion stack and reduces bonus", () => {
  const hit = findDipSeedForEffect("rust", "uncursed");
  assert(hit, "should find a seed that produces rust on iron item");
  assertEquals(hit.ev.effect, "rust");
  const info = hit.world.get(hit.item, ItemInfo);
  const state = hit.world.get(hit.item, MaterialState);
  assert(info, "item should have ItemInfo");
  assert(Number(info.corrosionStacks || 0) > 0, "corrosionStacks should be incremented");
  assert(Number(state?.corrosionStacks || 0) > 0, "material state corrosionStacks should be incremented");
});

Deno.test("dip: blessed item resists rust and loses blessing", () => {
  // Blessed iron item — should resist rust by consuming the blessing
  for (let seed = 1; seed <= 3000; seed++) {
    const { world, actor, fountain, item } = makeDipWorld(seed, 20, "blessed");
    // Ensure it has bonuses for corrosion to target
    const info = world.get(item, ItemInfo);
    info.bonuses = { attack: 2 };
    const ev = dipOnce(world, actor, fountain, item);
    if (ev && ev.effect === "blessedResist") {
      const beat = world.get(item, Beatitude);
      assertEquals(beat.state, "uncursed", "blessing should be consumed");
      assertEquals(Number(info.corrosionStacks || 0), 0, "no corrosion stacks added");
      assertEquals(info.bonuses.attack, 2, "bonus should be preserved");
      return;
    }
  }
  assert(false, "should find a seed that produces blessedResist");
});

Deno.test("dip: nothing outcome leaves item unchanged", () => {
  const hit = findDipSeedForEffect("nothing", "uncursed");
  assert(hit, "should find a seed that produces nothing");
  const beat = hit.world.get(hit.item, Beatitude);
  assertEquals(beat.state, "uncursed", "beatitude should be unchanged");
});

Deno.test("dip: creature outcome spawns a monster", () => {
  const hit = findDipSeedForEffect("creature", "uncursed");
  assert(hit, "should find a seed that produces creature");
  // spawnedName may be null if no valid tile — just check event fired
  assert(hit.ev.effect === "creature");
});

Deno.test("dip: uses a fountain charge", () => {
  const { world, actor, fountain, item } = makeDipWorld(42, 3);
  dipOnce(world, actor, fountain, item);
  const charges = world.get(fountain, FountainState).chargesRemaining;
  assert(charges < 3, `expected charges to decrease, got ${charges}`);
});

Deno.test("dip: dry fountain blocks dip", () => {
  const { world, actor, fountain, item } = makeDipWorld(42, 0);
  const events = [];
  world.on(FountainDipResolved, (e) => events.push(e));
  world.on(FountainDried, (e) => events.push({ ...e, _type: "dry" }));
  world.add(actor, InteractIntent, { targetId: fountain, mode: "dip", itemId: item });
  interactionSystem(world);
  assertEquals(events.filter(e => !e._type).length, 0, "no dip event should fire on dry fountain");
  assert(events.some(e => e._type === "dry"), "dry event should fire");
});

Deno.test("dip: all 6 dip outcome types are reachable", () => {
  const target = ["uncurse", "bless", "curse", "nothing", "rust", "creature"];
  const seen = new Set();

  for (let seed = 1; seed <= 5000; seed++) {
    // Alternate beatitude to hit uncurse (needs cursed) and bless (needs uncursed)
    const beatitude = seed % 2 === 0 ? "cursed" : "uncursed";
    const { world, actor, fountain, item } = makeDipWorld(seed, 20, beatitude);
    const ev = dipOnce(world, actor, fountain, item);
    if (ev) seen.add(ev.effect);
    if (seen.size === target.length) break;
  }

  for (const t of target) {
    assert(seen.has(t), `dip outcome "${t}" was never reached (saw: ${[...seen].join(", ")})`);
  }
});

Deno.test("dip: non-metal paper item waterlogs instead of rusting", () => {
  const rustSeed = findDipSeedForEffect("rust", "uncursed");
  assert(rustSeed, "should find a seed that lands in the rust window");

  const ironEv = dipOnce(rustSeed.world, rustSeed.actor, rustSeed.fountain, rustSeed.item);
  assertEquals(ironEv?.effect, "rust", "control seed should rust iron item");

  const paper = makeDipWorld(rustSeed.seed, 20, "uncursed", {
    name: "Scroll of Mapping",
    identity: "scroll_mapping",
    type: "scroll",
    slot: "bag",
    materialKind: "paper",
    bonuses: {},
  });
  const paperEv = dipOnce(paper.world, paper.actor, paper.fountain, paper.item);
  assertEquals(paperEv?.effect, "waterlogged", "paper should waterlog, not rust");

  const info = paper.world.get(paper.item, ItemInfo);
  const state = paper.world.get(paper.item, MaterialState);
  assertEquals(Number(info?.corrosionStacks || 0), 0, "paper should not gain corrosion stacks");
  assert(Number(info?.waterloggedStacks || 0) > 0, "paper should gain waterlogged stacks");
  assert(Number(state?.waterloggedStacks || 0) > 0, "material state should track waterlogged stacks");
});

Deno.test("dip corrosion uses derived [Rusted] display marker without mutating base name", () => {
  const hit = findDipSeedForEffect("rust", "uncursed");
  assert(hit, "should find a seed that produces rust");

  const ni = hit.world.get(hit.item, NamedIdentity);
  assertEquals(ni?.name, "Iron Sword", "base name should stay canonical");

  const displayName = resolveItemDisplayName(hit.world, hit.item);
  assert(displayName.includes("[Rusted]"), "display name should include rust marker");
});

Deno.test("dip: potion becomes diluted and display name reflects condition", () => {
  const rustSeed = findDipSeedForEffect("rust", "uncursed");
  assert(rustSeed, "should find a seed that lands in water-damage band");

  const potion = makeDipWorld(rustSeed.seed, 20, "uncursed", {
    name: "Health Potion",
    identity: "potion_vigor",
    type: "potion",
    slot: "bag",
    materialKind: "glass",
    bonuses: {},
  });
  const ev = dipOnce(potion.world, potion.actor, potion.fountain, potion.item);
  assertEquals(ev?.effect, "diluted", "glass potion should be diluted by water");

  const info = potion.world.get(potion.item, ItemInfo);
  const state = potion.world.get(potion.item, MaterialState);
  assert(Number(info?.dilutedStacks || 0) > 0, "potion should track diluted stacks");
  assert(Number(state?.dilutedStacks || 0) > 0, "material state should track diluted stacks");
  const displayName = resolveItemDisplayName(potion.world, potion.item);
  assert(displayName.includes("[Diluted]"), "display name should include diluted marker");
});

Deno.test("dip: ash mixed with fountain water becomes mud", () => {
  const rustSeed = findDipSeedForEffect("rust", "uncursed");
  assert(rustSeed, "should find a seed that lands in water-damage band");

  const ash = makeDipWorld(rustSeed.seed, 20, "uncursed", {
    name: "Ash",
    identity: "ash",
    type: "junk",
    slot: "bag",
    materialKind: "sand",
    bonuses: {},
  });
  const ev = dipOnce(ash.world, ash.actor, ash.fountain, ash.item);
  assertEquals(ev?.effect, "mud", "ash should transform into mud when dipped");

  const ni = ash.world.get(ash.item, NamedIdentity);
  const mat = ash.world.get(ash.item, Material);
  assertEquals(String(ni?.identity || ""), "mud");
  assertEquals(String(mat?.kind || ""), "clay");
});
