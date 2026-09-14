import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { createConfiguredWorld } from "../src/main/runtime/gameRuntime.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { spawnDebugMonsterNearPlayer } from "../src/main/debug/spawnDebugMonster.js";
import { applyWandStasis } from "../src/rules/utils/stasis.js";
import { statusStrength } from "../src/rules/utils/statusFacade.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";

Deno.test("configured runtime freezes a debug-spawned war drummer", () => {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  try {
    const world = createConfiguredWorld(0x57A51);
    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 10, y: 10 });
    world.add(player, Vitality, { hp: 30, maxHp: 30 });

    const spawned = spawnDebugMonsterNearPlayer(world, "war_drummer");
    assert(spawned.ok, spawned.error || "war drummer should spawn");
    const drummer = [...world.query(NamedIdentity)]
      .find(([id, identity]) => identity.identity === "war_drummer")?.[0];
    assert(drummer, "spawned war drummer should be discoverable");

    const before = { ...world.get(drummer, Position) };
    const casts = [];
    world.on("monster:ability:cast", (event) => casts.push(event));
    assertEquals(applyWandStasis(world, drummer), true);
    assertEquals(statusStrength(world, drummer, "stasis"), 1);

    // Debug-console commands call world.tick(0) to refresh projections. Those
    // refreshes are not turns, so they do not consume stasis duration.
    for (let i = 0; i < 8; i++) world.tick(0);
    assertEquals(statusStrength(world, drummer, "stasis"), 1);

    for (let i = 0; i < 20; i++) world.tick(1);

    assertEquals(world.get(drummer, Position), before);
    assertEquals(casts.length, 0);
    assert(!world.has(drummer, CastSpellIntent));
  } finally {
    clearAll();
  }
});
