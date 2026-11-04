import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import { createGameRuntime } from "../src/main/runtime/gameRuntime.js";
import {
  applyPlayerClassLoadout,
  createConfiguredWorld,
  ensurePlayerSpawned,
} from "../src/main/runtime/gameRuntime.js";
import { Brain } from "../src/rules/components/Brain.js";
import { Devotion } from "../src/rules/components/Devotion.js";
import { Mana } from "../src/rules/components/Mana.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { getClass } from "../src/rules/data/classes.js";

Deno.test("agent runtime exposes a bounded JSON-safe observation and advances actions", async () => {
  const runtime = await createGameRuntime({ seed: 0xA61E17, classId: "outlaw", startDepth: 1 });
  const initial = runtime.observe({ mapRadius: 4 });

  assertEquals(initial.protocol, "jshack-agent-v1");
  assertExists(initial.player);
  assertEquals(initial.map.width, 9);
  assertEquals(initial.map.height, 9);
  assertEquals(initial.map.tiles.length, 9);
  assert(initial.actionCatalog.some((action) => action.type === "rules.move"));
  assert(!initial.suggestedActions.some((action) => action.payload?.targetSlot === "bag"));
  assert(initial.suggestedActions.some((action) => action.type === "rules.wait"));
  assert(initial.suggestedActions.some((action) => action.type === "rules.traverseStairs"));
  assertEquals(JSON.parse(JSON.stringify(initial)).protocol, initial.protocol);

  const compact = runtime.observe({ mapRadius: 4, includeActionCatalog: false });
  assertEquals(compact.actionCatalog, undefined);

  const before = runtime.snapshot().step;
  runtime.dispatch({ type: "rules.wait", payload: {} });
  const after = runtime.snapshot().step;
  assert(after > before, "wait should advance the simulation");
  assertEquals(runtime.observe({ mapRadius: 4 }).turn, after);
});

Deno.test("necromancer runtime starts with its class loadout", async () => {
  const runtime = await createGameRuntime({ seed: 0xC0FFEE, classId: "necromancer", startDepth: 1 });
  const player = runtime.getPlayer();
  assertExists(player);

  const brain = runtime.world.get(player.id, Brain);
  const mana = runtime.world.get(player.id, Mana);
  const devotion = runtime.world.get(player.id, Devotion);
  const identity = runtime.world.get(player.id, NamedIdentity);

  assertEquals(identity.identity, "player_necromancer");
  assertEquals(runtime.view().entities.find((entity) => entity.id === player.id)?.kind, "player_necromancer");
  assertEquals(mana.maxMana, 60);
  assertEquals(devotion.pantheon, true);
  assert(typeof devotion.deityId === "string" && devotion.deityId.length > 0);
  assert(brain.learnedSpellIds.includes("agony"));
  assert(brain.learnedSpellIds.includes("resurrection"));
});

Deno.test("class loadout repairs an existing player's class identity", () => {
  const world = createConfiguredWorld(0xC0FFEE);
  const player = ensurePlayerSpawned(world, { x: 0, y: 0 });
  applyPlayerClassLoadout(world, player.id, getClass("necromancer"));

  assertEquals(world.get(player.id, NamedIdentity).identity, "player_necromancer");
});
