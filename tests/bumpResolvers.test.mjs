import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Faction } from "../src/rules/components/Faction.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Stamina } from "../src/rules/components/Stamina.js";
import { Interactable } from "../src/rules/components/Interactable.js";
import { Collider } from "../src/rules/components/Collider.js";
import { AttackIntent } from "../src/rules/components/Intents/AttackIntent.js";
import { resolveBump, BUMP_RESOLVERS } from "../src/rules/data/bumpResolvers.js";
import { clearDialogRegistry, registerDialog } from "../src/rules/dialogues/registry.js";
import { installDialogRuntime } from "../src/rules/dialogues/runtime.js";
import { loadChunk, clearAll, getTile, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR, TILE_WALL, TILE_TREE, TILE_GRASS } from "../src/rules/environment/dungeon/constants.js";
import { getTileQuerySnapshot } from "../src/rules/utils/tileQueryCache.js";

function loadFloorChunk() {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
}

function makeBumpCtx(world, overrides = {}) {
  const tiles = getTileQuerySnapshot(world);
  return { nx: 0, ny: 0, mdx: 1, mdy: 0, target: 0, tiles, ...overrides };
}

// ── hostile melee ───────────────────────────────────────────────────

Deno.test("bumpResolvers: hostile melee emits bump:attack", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const attacker = world.create();
    world.add(attacker, Position, { x: 3, y: 3 });
    world.add(attacker, Vitality, { maxHp: 10, hp: 10 });
    world.add(attacker, Faction, { key: "player" });

    const defender = world.create();
    world.add(defender, Position, { x: 4, y: 3 });
    world.add(defender, Vitality, { maxHp: 10, hp: 10 });
    world.add(defender, Faction, { key: "enemy" });

    let attacked = false;
    world.on("bump:attack", ({ attacker: a, target: t }) => {
      if (a === attacker && t === defender) attacked = true;
    });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: defender });
    const handled = resolveBump(world, attacker, ctx);

    assert(handled, "hostile melee should be handled");
    assert(attacked, "bump:attack event should fire");
  } finally { clearAll(); }
});

Deno.test("bumpResolvers: hostile melee requires manhattan distance 1", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const attacker = world.create();
    world.add(attacker, Position, { x: 3, y: 3 });
    world.add(attacker, Faction, { key: "player" });

    const defender = world.create();
    world.add(defender, Position, { x: 5, y: 3 });
    world.add(defender, Faction, { key: "enemy" });

    let attacked = false;
    world.on("bump:attack", () => { attacked = true; });

    // Diagonal move (manhattan 2) should not trigger melee
    const ctx = makeBumpCtx(world, { nx: 5, ny: 3, mdx: 1, mdy: 1, target: defender });
    resolveBump(world, attacker, ctx);
    assertEquals(attacked, false, "diagonal bump should not trigger melee");
  } finally { clearAll(); }
});

// ── NPC interact ────────────────────────────────────────────────────

Deno.test("bumpResolvers: neutral NPC with Interactable triggers interact, not attack", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const actor = world.create();
    world.add(actor, Position, { x: 3, y: 3 });
    world.add(actor, Faction, { key: "player" });

    const npc = world.create();
    world.add(npc, Position, { x: 4, y: 3 });
    world.add(npc, Vitality, { maxHp: 10, hp: 10 });
    world.add(npc, Faction, { key: "shopkeeper" });
    world.add(npc, Interactable, { action: "shop" });

    let interacted = false;
    let attacked = false;
    world.on("bump:interact", () => { interacted = true; });
    world.on("bump:attack", () => { attacked = true; });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: npc });
    const handled = resolveBump(world, actor, ctx);

    assert(handled, "NPC interact should be handled");
    assert(interacted, "should trigger bump:interact");
    assertEquals(attacked, false, "should not trigger bump:attack");
  } finally { clearAll(); }
});

Deno.test("bumpResolvers: player bumping townfolk with active dialog swaps positions instead of interacting", () => {
  loadFloorChunk();
  try {
    clearDialogRegistry();
    const world = new World({ seed: 44 });
    installDialogRuntime(world);
    const actor = world.create();
    world.add(actor, Player, {});
    world.add(actor, Position, { x: 3, y: 3 });
    world.add(actor, Faction, { key: "player" });

    const npc = world.create();
    world.add(npc, Position, { x: 4, y: 3 });
    world.add(npc, NamedIdentity, { name: "Villager", identity: "townfolk_villager" });
    world.add(npc, Faction, { key: "townfolk" });
    world.add(npc, Interactable, { action: "talkToNPC" });

    registerDialog({
      id: "test:npc_swap_dialog",
      start: "root",
      nodes: {
        root: {
          text: "Hello.",
          choices: [{ id: "bye", label: "Bye", close: true }],
        },
      },
    });
    world.emit("dialog:openRequest", { actorId: actor, targetId: npc, dialogId: "test:npc_swap_dialog" });

    let interacted = false;
    world.on("bump:interact", () => { interacted = true; });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: npc });
    const handled = resolveBump(world, actor, ctx);

    assert(handled, "townfolk bump should be handled");
    assertEquals(interacted, false, "swap should not also trigger interaction");
    assertEquals(world.get(actor, Position), { x: 4, y: 3 });
    assertEquals(world.get(npc, Position), { x: 3, y: 3 });
  } finally { clearAll(); }
});

// ── object interact ─────────────────────────────────────────────────

Deno.test("bumpResolvers: player bumps door (interactable, no living target)", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const actor = world.create();
    world.add(actor, Position, { x: 3, y: 3 });
    world.add(actor, Player);

    const door = world.create();
    world.add(door, Position, { x: 4, y: 3 });
    world.add(door, Interactable, { action: "toggleDoor" });

    let interacted = false;
    world.on("bump:interact", () => { interacted = true; });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    const handled = resolveBump(world, actor, ctx);

    assert(handled, "object interact should be handled");
    assert(interacted, "should trigger bump:interact for door");
  } finally { clearAll(); }
});

Deno.test("bumpResolvers: object interact tolerates target matching the interactable id", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 43 });
    const actor = world.create();
    world.add(actor, Position, { x: 3, y: 3 });
    world.add(actor, Player);

    const anvil = world.create();
    world.add(anvil, Position, { x: 4, y: 3 });
    world.add(anvil, Interactable, { action: "forgeTools" });
    world.add(anvil, Collider, { solid: true, blocksSight: false });

    let interacted = false;
    world.on("bump:interact", () => { interacted = true; });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: anvil });
    const handled = resolveBump(world, actor, ctx);

    assert(handled, "solid interactable should still be handled");
    assert(interacted, "should trigger bump:interact for anvil");
  } finally { clearAll(); }
});

Deno.test("bumpResolvers: non-player cannot interact with objects", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const monster = world.create();
    world.add(monster, Position, { x: 3, y: 3 });
    world.add(monster, Faction, { key: "enemy" });

    const door = world.create();
    world.add(door, Position, { x: 4, y: 3 });
    world.add(door, Interactable, { action: "toggleDoor" });

    let interacted = false;
    world.on("bump:interact", () => { interacted = true; });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    const handled = resolveBump(world, monster, ctx);

    assertEquals(handled, false, "non-player should not trigger object interact");
    assertEquals(interacted, false);
  } finally { clearAll(); }
});

// ── tile reaction ───────────────────────────────────────────────────

Deno.test("bumpResolvers: player with dig weapon digs wall", () => {
  loadFloorChunk();
  try {
    setTile(4, 3, TILE_WALL);
    const world = new World({ seed: 42 });

    const weapon = world.create();
    world.add(weapon, ItemInfo, { type: "weapon", bonuses: { dig: true }, staminaCost: 5 });

    const actor = world.create();
    world.add(actor, Position, { x: 3, y: 3 });
    world.add(actor, Player);
    world.add(actor, Equipment, { weapon });
    world.add(actor, Stamina, { maxStamina: 100, stamina: 100, staminaRegen: 2, regenCooldown: 0 });

    let dugEvent = false;
    world.on("tile:dug", () => { dugEvent = true; });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    const handled = resolveBump(world, actor, ctx);

    assert(handled, "tile reaction should be handled");
    assert(dugEvent, "tile:dug event should fire");
    assertEquals(getTile(4, 3), TILE_FLOOR, "wall should become floor");

    const stam = world.get(actor, Stamina);
    assertEquals(stam.stamina, 95, "stamina should be reduced by dig cost");
  } finally { clearAll(); }
});

Deno.test("bumpResolvers: player with chop weapon chops tree", () => {
  loadFloorChunk();
  try {
    setTile(4, 3, TILE_TREE);
    const world = new World({ seed: 42 });

    const weapon = world.create();
    world.add(weapon, ItemInfo, { type: "weapon", bonuses: { chop: true }, staminaCost: 10 });

    const actor = world.create();
    world.add(actor, Position, { x: 3, y: 3 });
    world.add(actor, Player);
    world.add(actor, Equipment, { weapon });
    world.add(actor, Stamina, { maxStamina: 100, stamina: 100, staminaRegen: 2, regenCooldown: 0 });

    let chopEvent = false;
    const audio = [];
    world.on("tile:chopped", () => { chopEvent = true; });
    world.on("audio:play", (ev) => audio.push(ev));

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    const handled = resolveBump(world, actor, ctx);

    assert(handled, "tile reaction should be handled");
    assert(chopEvent, "tile:chopped event should fire");
    assertEquals(getTile(4, 3), TILE_GRASS, "tree should become grass");
    assertEquals(audio.length, 1, "chopping should emit one audio event");
    assertEquals(audio[0].key, "action:wood_chop");
    assertEquals(audio[0].at, { x: 4, y: 3 });
  } finally { clearAll(); }
});

Deno.test("bumpResolvers: insufficient stamina emits event, does not modify tile", () => {
  loadFloorChunk();
  try {
    setTile(4, 3, TILE_WALL);
    const world = new World({ seed: 42 });

    const weapon = world.create();
    world.add(weapon, ItemInfo, { type: "weapon", bonuses: { dig: true }, staminaCost: 5 });

    const actor = world.create();
    world.add(actor, Position, { x: 3, y: 3 });
    world.add(actor, Player);
    world.add(actor, Equipment, { weapon });
    world.add(actor, Stamina, { maxStamina: 100, stamina: 2, staminaRegen: 2, regenCooldown: 0 });

    let insufficientEvent = false;
    world.on("attack:insufficient-stamina", () => { insufficientEvent = true; });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    resolveBump(world, actor, ctx);

    assert(insufficientEvent, "should emit insufficient-stamina event");
    assertEquals(getTile(4, 3), TILE_WALL, "wall should remain unchanged");
  } finally { clearAll(); }
});

// ── resolver ordering ───────────────────────────────────────────────

Deno.test("bumpResolvers: resolvers are in expected priority order", () => {
  const names = BUMP_RESOLVERS.map(r => r.name);
  assertEquals(names, ["hostile-melee", "pet-swap", "npc-interact", "enemy-door-open", "secret-door-bump", "object-interact", "push-entity", "tile-reaction"]);
});

// ── no match ────────────────────────────────────────────────────────

Deno.test("bumpResolvers: returns false when no resolver matches", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const actor = world.create();
    world.add(actor, Position, { x: 3, y: 3 });
    // No Player tag, no weapon — nothing can match
    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    assertEquals(resolveBump(world, actor, ctx), false);
  } finally { clearAll(); }
});
