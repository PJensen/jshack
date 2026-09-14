import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { EncounterActivated } from "../src/events/EncounterActivated.js";
import { DeathApplied } from "../src/rules/components/DeathApplied.js";
import { EncounterState } from "../src/rules/components/EncounterState.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import {
  encounterListenerExtension,
  encounterSystem,
} from "../src/rules/systems/encounterSystem.js";
import { ratatoskrSystem } from "../src/rules/systems/ratatoskrSystem.js";

function setupWorld(depth = 0) {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  const world = new World({ seed: 0x5a17 });
  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  const dungeon = world.create();
  world.add(dungeon, DungeonState, {
    worldSeed: 0x5a17,
    currentDepth: depth,
    floorEntityIds: [player],
  });
  world.install(encounterListenerExtension);
  return { world, player };
}

function encounterState(world, encounterId) {
  for (const [id, state] of world.query(EncounterState)) {
    if (state.encounterId === encounterId) return { id, state };
  }
  return null;
}

Deno.test("encounter activation is declarative and creates one ECS state per encounter", () => {
  const { world, player } = setupWorld();
  const activated = [];
  world.on(EncounterActivated, (event) => activated.push(event));

  world.emit("quest:completed", { questId: "starter.priest_fetch", playerId: player });

  assert(encounterState(world, "norse:ratatoskr"));
  assert(encounterState(world, "norse:draugr"));
  assertEquals(activated.length, 2);
  world.emit("quest:completed", { questId: "starter.priest_fetch", playerId: player });
  assertEquals([...world.query(EncounterState)].length, 2);
});

Deno.test("activated singleton encounters materialize according to their own placement", () => {
  const { world, player } = setupWorld(4);
  world.emit("quest:completed", { questId: "starter.priest_fetch", playerId: player });
  encounterSystem(world);

  const draugrState = encounterState(world, "norse:draugr");
  assert(draugrState);
  assert(draugrState.state.activeEntityId > 0);
  assertEquals(world.get(draugrState.state.activeEntityId, NamedIdentity)?.identity, "draugr");
  assert(world.has(draugrState.state.activeEntityId, Position));

  const ratatoskrState = encounterState(world, "norse:ratatoskr");
  assert(ratatoskrState);
  assertEquals(ratatoskrState.state.activeEntityId, 0, "Ratatoskr uses its roaming controller for materialization");
});

Deno.test("Ratatoskr remains absent until its encounter is activated", () => {
  const { world, player } = setupWorld();
  encounterSystem(world);
  ratatoskrSystem(world);
  assertEquals([...world.query(NamedIdentity)].filter(([, ni]) => ni.identity === "ratatoskr").length, 0);

  world.emit("quest:completed", { questId: "starter.rat_infestation", playerId: player });
  world.step = 2;
  encounterSystem(world);
  ratatoskrSystem(world);
  assertEquals([...world.query(NamedIdentity)].filter(([, ni]) => ni.identity === "ratatoskr").length, 1);
});

Deno.test("run-unique encounters resolve when their creature is defeated", () => {
  const { world, player } = setupWorld(4);
  world.emit("quest:completed", { questId: "starter.priest_fetch", playerId: player });
  encounterSystem(world);

  const state = encounterState(world, "norse:draugr");
  assert(state);
  const draugrId = state.state.activeEntityId;
  world.add(draugrId, DeathApplied, { target: draugrId });
  encounterSystem(world);

  assertEquals(state.state.status, "resolved");
});
