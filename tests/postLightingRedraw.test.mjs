import { assertEquals } from "jsr:@std/assert";
import { buildPalette } from "../src/display/palette/index.js";
import { shouldPostLightingRedrawKind } from "../src/display/composition/postLightingRedraw.js";

Deno.test("overworld feature tiles redraw after lighting while base terrain does not", () => {
  const palette = buildPalette();

  assertEquals(shouldPostLightingRedrawKind(palette, "tree", { isOverworld: true }), true);
  assertEquals(shouldPostLightingRedrawKind(palette, "tree_sapling", { isOverworld: true }), false);
  assertEquals(shouldPostLightingRedrawKind(palette, "tree_harvest", { isOverworld: true }), false);
  assertEquals(shouldPostLightingRedrawKind(palette, "mountain", { isOverworld: true }), true);
  assertEquals(shouldPostLightingRedrawKind(palette, "mountain_b", { isOverworld: true }), true);
  assertEquals(shouldPostLightingRedrawKind(palette, "mountain_c", { isOverworld: true }), true);
  assertEquals(shouldPostLightingRedrawKind(palette, "grass", { isOverworld: true }), false);
  assertEquals(shouldPostLightingRedrawKind(palette, "water", { isOverworld: true }), false);
  assertEquals(shouldPostLightingRedrawKind(palette, "cobblestone", { isOverworld: true }), false);
  assertEquals(shouldPostLightingRedrawKind(palette, "farmland", { isOverworld: true }), false);
  assertEquals(shouldPostLightingRedrawKind(palette, "fence", { isOverworld: true }), false);
});

Deno.test("overworld structural entities redraw after lighting but actors do not", () => {
  const palette = buildPalette();

  assertEquals(shouldPostLightingRedrawKind(palette, "door_closed", { isOverworld: true, layer: 200 }), true);
  assertEquals(shouldPostLightingRedrawKind(palette, "door_open", { isOverworld: true, layer: 200 }), true);
  assertEquals(shouldPostLightingRedrawKind(palette, "stair_down", { isOverworld: true, layer: 200 }), true);
  assertEquals(shouldPostLightingRedrawKind(palette, "tree_harvest", { isOverworld: true, layer: 300 }), false);
  assertEquals(shouldPostLightingRedrawKind(palette, "tree_sapling", { isOverworld: true, layer: 300 }), false);
  assertEquals(shouldPostLightingRedrawKind(palette, "player", { isOverworld: true, layer: 400 }), true);
});

Deno.test("player redraws after lighting in dungeon relief too", () => {
  const palette = buildPalette();

  assertEquals(shouldPostLightingRedrawKind(palette, "player", { isOverworld: false, layer: 400 }), true);
  assertEquals(shouldPostLightingRedrawKind(palette, "rat", { isOverworld: true, layer: 300 }), false);
});

Deno.test("dungeon kinds do not opt into the overworld post-lighting redraw path", () => {
  const palette = buildPalette();

  assertEquals(shouldPostLightingRedrawKind(palette, "tree", { isOverworld: false }), false);
  assertEquals(shouldPostLightingRedrawKind(palette, "door_closed", { isOverworld: false, layer: 200 }), false);
});
