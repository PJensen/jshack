import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createFrom } from "../src/lib/ecs-js/archetype.js";
import { Position } from "../src/rules/components/Position.js";
import { Player } from "../src/rules/components/Player.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Collider } from "../src/rules/components/Collider.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Material } from "../src/rules/components/Material.js";
import { Pushable } from "../src/rules/components/Pushable.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Boulder } from "../src/rules/archetypes/Overworld.js";
import { resolveBump, BUMP_RESOLVERS } from "../src/rules/data/bumpResolvers.js";
import { loadChunk, clearAll, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import {
  CHUNK_SIZE, TILE_FLOOR, TILE_WALL, TILE_LAVA,
} from "../src/rules/environment/dungeon/constants.js";
import { getTileQuerySnapshot } from "../src/rules/utils/tileQueryCache.js";
import { installTileStepEffectListener } from "../src/rules/systems/tileStepEffectSystem.js";

function loadFloorChunk() {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
}

function makeStatue(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: "Statue", identity: "statue" });
  world.add(id, Material, { kind: "stone" });
  world.add(id, Collider, { solid: true, blocksSight: true });
  world.add(id, Pushable);
  return id;
}

function makePlayer(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Player);
  world.add(id, Vitality, { maxHp: 20, hp: 20 });
  return id;
}

function makeBumpCtx(world, overrides = {}) {
  const tiles = getTileQuerySnapshot(world);
  return { nx: 0, ny: 0, mdx: 1, mdy: 0, target: 0, tiles, ...overrides };
}

// ── basic push ──────────────────────────────────────────────────────

Deno.test("pushStatue: push statue east", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const player = makePlayer(world, 3, 3);
    const statue = makeStatue(world, 4, 3);

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    const handled = resolveBump(world, player, ctx);

    assert(handled, "push should be handled");
    const pos = world.get(statue, Position);
    assertEquals(pos.x, 5, "statue should move east");
    assertEquals(pos.y, 3);
  } finally { clearAll(); }
});

Deno.test("pushStatue: push statue north", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const player = makePlayer(world, 5, 5);
    const statue = makeStatue(world, 5, 4);

    const ctx = makeBumpCtx(world, { nx: 5, ny: 4, mdx: 0, mdy: -1, target: 0 });
    const handled = resolveBump(world, player, ctx);

    assert(handled, "push should be handled");
    const pos = world.get(statue, Position);
    assertEquals(pos.x, 5);
    assertEquals(pos.y, 3, "statue should move north");
  } finally { clearAll(); }
});

Deno.test("pushStatue: push statue south", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const player = makePlayer(world, 5, 5);
    const statue = makeStatue(world, 5, 6);

    const ctx = makeBumpCtx(world, { nx: 5, ny: 6, mdx: 0, mdy: 1, target: 0 });
    const handled = resolveBump(world, player, ctx);

    assert(handled, "push should be handled");
    const pos = world.get(statue, Position);
    assertEquals(pos.x, 5);
    assertEquals(pos.y, 7, "statue should move south");
  } finally { clearAll(); }
});

Deno.test("pushStatue: push statue west", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const player = makePlayer(world, 5, 5);
    const statue = makeStatue(world, 4, 5);

    const ctx = makeBumpCtx(world, { nx: 4, ny: 5, mdx: -1, mdy: 0, target: 0 });
    const handled = resolveBump(world, player, ctx);

    assert(handled, "push should be handled");
    const pos = world.get(statue, Position);
    assertEquals(pos.x, 3, "statue should move west");
    assertEquals(pos.y, 5);
  } finally { clearAll(); }
});

// ── blocked push ────────────────────────────────────────────────────

Deno.test("pushStatue: blocked by wall behind statue", () => {
  loadFloorChunk();
  try {
    setTile(5, 3, TILE_WALL);
    const world = new World({ seed: 42 });
    const player = makePlayer(world, 3, 3);
    const statue = makeStatue(world, 4, 3);

    let blocked = false;
    world.on("entity:push-blocked", () => { blocked = true; });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    const handled = resolveBump(world, player, ctx);

    assert(handled, "resolver should match even when blocked");
    assert(blocked, "should emit push-blocked event");
    const pos = world.get(statue, Position);
    assertEquals(pos.x, 4, "statue should not move");
    assertEquals(pos.y, 3);
  } finally { clearAll(); }
});

Deno.test("pushStatue: blocked by another entity behind statue", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const player = makePlayer(world, 3, 3);
    const statue = makeStatue(world, 4, 3);
    // Place another blocking entity behind the statue
    const blocker = world.create();
    world.add(blocker, Position, { x: 5, y: 3 });
    world.add(blocker, Collider, { solid: true, blocksSight: false });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    resolveBump(world, player, ctx);

    const pos = world.get(statue, Position);
    assertEquals(pos.x, 4, "statue should not move when blocked by entity");
  } finally { clearAll(); }
});

// ── non-player cannot push ──────────────────────────────────────────

Deno.test("pushStatue: non-player cannot push", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const monster = world.create();
    world.add(monster, Position, { x: 3, y: 3 });
    world.add(monster, Faction, { key: "enemy" });
    const statue = makeStatue(world, 4, 3);

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    // push-entity resolver requires Player tag — monster should not match
    const pushResolver = BUMP_RESOLVERS.find(r => r.name === "push-entity");
    assertEquals(pushResolver.test(world, monster, ctx), false, "monster should not match push resolver");
  } finally { clearAll(); }
});

// ── events ──────────────────────────────────────────────────────────

Deno.test("pushStatue: emits entity:pushed and moved events", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const player = makePlayer(world, 3, 3);
    const statue = makeStatue(world, 4, 3);

    let pushEvent = null;
    let movedEvent = null;
    world.on("entity:pushed", (ev) => { pushEvent = ev; });
    world.on("moved", (ev) => { movedEvent = ev; });

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    resolveBump(world, player, ctx);

    assert(pushEvent, "should emit entity:pushed");
    assertEquals(pushEvent.actor, player);
    assertEquals(pushEvent.target, statue);
    assertEquals(pushEvent.from.x, 4);
    assertEquals(pushEvent.to.x, 5);

    assert(movedEvent, "should emit moved for pushed entity");
    assertEquals(movedEvent.id, statue);
  } finally { clearAll(); }
});

Deno.test("pushStatue: boulder archetype uses existing push resolver path", () => {
  const world = new World({ seed: 42 });
  const boulder = createFrom(world, Boulder, { x: 4, y: 3 });

  assert(world.has(boulder, Pushable), "boulders should be pushable like statues");
});

// ── entity without Pushable cannot be pushed ────────────────────────

Deno.test("pushStatue: entity without Pushable tag is not pushed", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 42 });
    const player = makePlayer(world, 3, 3);
    // Create a non-pushable blocking entity (pillar)
    const pillar = world.create();
    world.add(pillar, Position, { x: 4, y: 3 });
    world.add(pillar, Collider, { solid: true, blocksSight: true });
    // No Pushable tag

    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    const pushResolver = BUMP_RESOLVERS.find(r => r.name === "push-entity");
    assertEquals(pushResolver.test(world, player, ctx), false, "non-Pushable entity should not trigger push");
  } finally { clearAll(); }
});

// ── resolver ordering ───────────────────────────────────────────────

Deno.test("pushStatue: push-entity is in expected position in resolver list", () => {
  const names = BUMP_RESOLVERS.map(r => r.name);
  assertEquals(names, ["hostile-melee", "pet-swap", "npc-interact", "enemy-door-open", "secret-door-bump", "object-interact", "push-entity", "tile-reaction"]);
});

// ── statue bridges lava ─────────────────────────────────────────────

Deno.test("pushStatue: statue bridges lava (suppresses scorch)", () => {
  loadFloorChunk();
  try {
    // Set tile at (5,3) to lava
    setTile(5, 3, TILE_LAVA);
    const world = new World({ seed: 42 });
    installTileStepEffectListener(world);

    const player = makePlayer(world, 3, 3);
    world.add(player, ActiveEffects, { effects: [] });
    const statue = makeStatue(world, 4, 3);

    // Push statue onto lava
    const ctx = makeBumpCtx(world, { nx: 4, ny: 3, mdx: 1, mdy: 0, target: 0 });
    resolveBump(world, player, ctx);

    const statuePos = world.get(statue, Position);
    assertEquals(statuePos.x, 5, "statue should be on the lava tile");

    // Now manually move the player onto the lava tile where the statue is
    // The statue's Pushable tag should suppress the scorch effect
    let scorched = false;
    world.on("tile:scorched", () => { scorched = true; });

    // Simulate player stepping onto the bridged lava tile
    world.set(player, Position, { x: 5, y: 3 });
    world.emit("moved", { id: player, from: { x: 4, y: 3 }, to: { x: 5, y: 3 } });

    assertEquals(scorched, false, "player should not be scorched on bridged lava");
    const vit = world.get(player, Vitality);
    assertEquals(vit.hp, 20, "player hp should be unchanged");
  } finally { clearAll(); }
});
