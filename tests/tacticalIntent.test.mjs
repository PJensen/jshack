import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { configureWorld } from "../src/main/scheduler.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Brain } from "../src/rules/components/Brain.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { WaitIntent } from "../src/rules/components/Intents/WaitIntent.js";
import { TacticalIntent } from "../src/rules/components/TacticalIntent.js";
import { proposeTacticalIntent } from "../src/rules/ai/tacticalIntent.js";
import { tacticalIntentSystem } from "../src/rules/systems/tacticalIntentSystem.js";

Deno.test("chase objective wins over a later policy movement proposal", () => {
  const world = new World({ seed: 186 });
  const actor = world.create();

  proposeTacticalIntent(world, actor, {
    kind: "flank",
    source: "chase",
    dx: -1,
    dy: 0,
  });
  proposeTacticalIntent(world, actor, {
    kind: "pursue",
    source: "policy",
    dx: 1,
    dy: 1,
  });

  assertEquals(world.get(actor, TacticalIntent).kind, "flank");
  tacticalIntentSystem(world);
  assertEquals(world.get(actor, MoveIntent), {
    dx: -1,
    dy: 0,
    cancelled: false,
    cancelReason: "",
  });
});

Deno.test("hold is explicit and does not become a guarded wait", () => {
  const world = new World({ seed: 186 });
  const actor = world.create();
  proposeTacticalIntent(world, actor, { kind: "hold", source: "chase" });

  tacticalIntentSystem(world);

  assert(!world.has(actor, MoveIntent));
  assert(!world.has(actor, WaitIntent));
  assert(!world.has(actor, TacticalIntent));
});

Deno.test("hold coexists with a canonical spell action", () => {
  const world = new World({ seed: 186 });
  const actor = world.create();
  world.add(actor, CastSpellIntent, { spellId: "phase_strike", targetId: 9 });
  proposeTacticalIntent(world, actor, { kind: "hold", source: "chase" });

  tacticalIntentSystem(world);

  assert(world.has(actor, CastSpellIntent));
  assert(!world.has(actor, MoveIntent));
  assert(!world.has(actor, TacticalIntent));
});

Deno.test("expired tactical objectives are discarded without projecting an action", () => {
  const world = new World({ seed: 186 });
  const actor = world.create();
  proposeTacticalIntent(world, actor, { kind: "pursue", source: "chase", dx: 1, dy: 0 });
  world.step = 1;

  tacticalIntentSystem(world);

  assert(!world.has(actor, TacticalIntent));
  assert(!world.has(actor, MoveIntent));
});

Deno.test("configured scheduler resolves chase objective before movement", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);

  const world = new World({ seed: 186 });
  configureWorld(world);

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Faction, { key: "player" });
  world.add(player, Vitality, { maxHp: 20, hp: 20 });

  const enemy = world.create();
  world.add(enemy, Position, { x: 8, y: 5 });
  world.add(enemy, NamedIdentity, { name: "Goblin", identity: "goblin" });
  world.add(enemy, Faction, { key: "enemy" });
  world.add(enemy, Vitality, { maxHp: 20, hp: 20 });
  world.add(enemy, Brain, { intelligence: 1, visionRange: 8, learnedSpellIds: [] });
  world.add(enemy, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: 5,
    lastKnownY: 5,
    searchTurnsLeft: 10,
  });

  world.tick(1);

  assertEquals(world.get(enemy, Position).x, 7);
  assertEquals(world.get(enemy, Position).y, 5);
  assert(!world.has(enemy, TacticalIntent));
});
