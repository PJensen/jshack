import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { generateOverworldChunks } from "../src/rules/environment/dungeon/overworld.js";

const RESOURCE_KINDS = new Set([
  "harvest_iron_ore",
  "harvest_coal_ore",
  "harvest_stone",
  "harvest_herbs",
  "harvest_berries",
  "harvest_moonleaf",
  "harvest_ember_root",
  "harvest_venom_fern",
]);

function allSpawns(ow) {
  const out = [];
  for (const chunk of ow.chunks) {
    for (const spawn of chunk.spawns || []) out.push(spawn);
  }
  return out;
}

Deno.test("overworld generates biome resources in the hinterlands", async () => {
  const ow = await generateOverworldChunks(0xC0FFEE);
  const spawns = allSpawns(ow);
  const resources = spawns.filter((spawn) => RESOURCE_KINDS.has(spawn.kind));
  assert(resources.length > 0, "expected hinterland resource spawns");

  const hinterlandResources = resources.filter((spawn) => {
    const dx = (spawn.x | 0) - (ow.spawnX | 0);
    const dy = (spawn.y | 0) - (ow.spawnY | 0);
    return dx * dx + dy * dy >= 45 * 45;
  });
  assertEquals(hinterlandResources.length, resources.length, "all overworld resources should be outside the town exclusion");
});

Deno.test("overworld includes sand crab as coastal monster content", async () => {
  const ow = await generateOverworldChunks(0xC0FFEE);
  const sandCrabs = allSpawns(ow).filter((spawn) =>
    spawn.kind === "monster" && spawn.params?.identity === "sand_crab"
  );
  assert(sandCrabs.length > 0, "expected sand crab overworld spawns");
});
