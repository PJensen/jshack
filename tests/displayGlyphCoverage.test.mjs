import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { buildPalette } from "../src/display/palette/index.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { listClassIds } from "../src/rules/data/classes.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Position } from "../src/rules/components/Position.js";
import { buildWorldView } from "../src/bridge/schema/worldView.js";

Deno.test("palette includes shock trap and special weapon glyph keys", () => {
  const palette = buildPalette();
  for (const key of [
    "trap_shock",
    "trap_pit",
    "trap_siphon",
    "trap_rust",
    "trap_swarm",
    "trap_arrow",
    "dragon_whelp",
    "ember_knife",
    "flametongue",
    "ashen_reaver",
    "morningstar",
    "flail",
    "bow_flaming",
    "nightfang_dagger",
    "venomfang_dagger",
    "nightfang",
    "venomfang",
    "mill_chest",
    "smithy_chest",
    "lumber_chest",
    "herb_chest",
    "tavern_chest",
    "enchanter_shop_sign",
    "general_store_sign",
    "flayed_man",
    "hanging_chains",
    "book_drain_life",
  ]) {
    assert(palette[key], `missing palette key: ${key}`);
  }
});

Deno.test("palette includes in-game player glyphs for every class identity", () => {
  const palette = buildPalette();
  for (const classId of listClassIds()) {
    const key = `player_${classId}`;
    assert(palette[key], `missing palette key: ${key}`);
    assertEquals(palette[key].glyph, "@");
  }
});

Deno.test("world-view preserves every class identity for player glyph lookup", () => {
  const world = new World({ seed: 0xC0FFEE });
  const players = listClassIds().map((classId, index) => ({
    classId,
    id: createPlayer(world, {
      x: index % 4,
      y: Math.floor(index / 4),
      identity: `player_${classId}`,
    }),
  }));
  const view = buildWorldView(world);

  for (const { classId, id } of players) {
    const entity = view.entities.find((record) => record.id === id);
    assert(entity, `missing player entity for ${classId}`);
    assertEquals(entity.kind, `player_${classId}`);
  }
});

Deno.test("town chest identities survive world-view projection", () => {
  const world = new World({ seed: 0xC0FFEE });
  createPlayer(world, { x: 10, y: 10 });

  const chestIds = [
    ["mill_chest", 11],
    ["smithy_chest", 12],
    ["lumber_chest", 13],
    ["herb_chest", 14],
    ["tavern_chest", 15],
  ];

  for (const [identity, x] of chestIds) {
    const id = world.create();
    world.add(id, NamedIdentity, { name: identity, identity });
    world.add(id, Position, { x, y: 10 });
  }

  const view = buildWorldView(world);
  for (const [identity] of chestIds) {
    const rec = view.entities.find((entity) => entity.kind === identity);
    assert(rec, `missing projected chest kind: ${identity}`);
  }
});

Deno.test("flaming weapon is projected with glowing display tag", () => {
  const world = new World({ seed: 0xC0FFEE });
  createPlayer(world, { x: 10, y: 10 });
  const itemId = buildCatalogItem(world, "ember_knife");
  world.add(itemId, Position, { x: 11, y: 10 });

  const view = buildWorldView(world);
  const rec = view.entities.find((e) => e.id === itemId);

  assert(rec, "item not present in world view");
  assertEquals(rec.kind, "ember_knife");
  assert(Array.isArray(rec.tags) && rec.tags.includes("glowing"), "item should include glowing tag");
});

Deno.test("venomous weapon is projected with venom glow display tag", () => {
  const world = new World({ seed: 0xC0FFEE });
  createPlayer(world, { x: 10, y: 10 });
  const itemId = buildCatalogItem(world, "nightfang_dagger");
  world.add(itemId, Position, { x: 11, y: 10 });

  const view = buildWorldView(world);
  const rec = view.entities.find((e) => e.id === itemId);

  assert(rec, "item not present in world view");
  assertEquals(rec.kind, "nightfang_dagger");
  assert(Array.isArray(rec.tags) && rec.tags.includes("venom_glowing"), "item should include venom_glowing tag");
});

Deno.test("venomfang dagger is projected with venom glow display tag", () => {
  const world = new World({ seed: 0xC0FFEE });
  createPlayer(world, { x: 10, y: 10 });
  const itemId = buildCatalogItem(world, "venomfang_dagger");
  world.add(itemId, Position, { x: 11, y: 10 });

  const view = buildWorldView(world);
  const rec = view.entities.find((e) => e.id === itemId);

  assert(rec, "item not present in world view");
  assertEquals(rec.kind, "venomfang_dagger");
  assert(Array.isArray(rec.tags) && rec.tags.includes("venom_glowing"), "item should include venom_glowing tag");
});
