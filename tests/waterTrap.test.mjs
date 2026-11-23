import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { buildWorldView } from "../src/bridge/schema/worldView.js";
import { configureWorld } from "../src/main/scheduler.js";
import { registerBuiltinCommands } from "../src/main/debug/consoleCommands.js";
import { FloodState } from "../src/rules/components/FloodState.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { Trap } from "../src/rules/components/Trap.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { trapStepListenerExtension, trapSystem } from "../src/rules/systems/trapSystem.js";
import { floodSystem } from "../src/rules/systems/floodSystem.js";
import { clearAll, getTile, loadChunk, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_DOOR, TILE_FLOOR, TILE_MARSH, TILE_PIT, TILE_SHALLOW_WATER } from "../src/rules/environment/dungeon/constants.js";
import "../src/rules/scripts/traps.js";

function setupFloor() {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
}

Deno.test("spawntrap water floods marsh ground while preserving doors and pits", () => {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_MARSH));
  setTile(9, 8, TILE_DOOR);
  setTile(7, 8, TILE_PIT);
  try {
    const world = new World({ seed: 42 });
    configureWorld(world);
    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 8, y: 8 });
    world.add(player, Vitality, { maxHp: 100, hp: 100 });
    const commands = new Map();
    registerBuiltinCommands({
      registerCommand(name, _help, handler) { commands.set(name, handler); },
    }, { world, messageLog: { log() {} } });

    const spawnTrap = commands.get("spawntrap");
    assertStringIncludes(spawnTrap("water"), "Triggered water trap");
    assertEquals(getTile(8, 8), TILE_SHALLOW_WATER);
    assertEquals(getTile(8, 7), TILE_MARSH);
    const [[trapId, trap]] = [...world.query(Trap)];
    assertEquals(trap.type, "water");
    assertEquals(trap.revealed, true);
    assertEquals(trap.armed, false);
    assert(world.has(trapId, FloodState));
    assertEquals(buildWorldView(world).entities.find((entity) => entity.id === trapId)?.kind, "trap_water");

    world.tick(1);
    assertEquals(getTile(8, 7), TILE_SHALLOW_WATER);
    assertEquals(getTile(9, 8), TILE_DOOR);
    assertEquals(getTile(7, 8), TILE_PIT);
    assertStringIncludes(spawnTrap("water 16 16"), "Spawned water trap");
    assertEquals(getTile(16, 16), TILE_MARSH);
  } finally {
    clearAll();
  }
});

Deno.test("water trap opens a shallow flood and spreads it over turns", () => {
  setupFloor();
  try {
    const world = new World({ seed: 42 });
    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 8, y: 8 });
    world.add(player, Vitality, { maxHp: 100, hp: 100 });

    const trap = world.create();
    world.add(trap, Position, { x: 8, y: 8 });
    world.add(trap, Trap, {
      type: "water",
      armed: true,
      revealed: false,
      script: "trap_water",
      params: { volume: 5, spreadPerTurn: 2 },
      difficulty: 21,
    });

    world.install(trapStepListenerExtension);
    world.emit("moved", { id: player, from: { x: 8, y: 9 }, to: { x: 8, y: 8 } });
    trapSystem(world);

    assertEquals(getTile(8, 8), TILE_SHALLOW_WATER);
    assert(world.has(trap, FloodState), "trigger should create active flood state");

    floodSystem(world);
    assertEquals(getTile(8, 7), TILE_FLOOR, "spread should wait until the next turn");

    world.step++;
    floodSystem(world);
    assertEquals(getTile(8, 7), TILE_SHALLOW_WATER);
    assertEquals(getTile(9, 8), TILE_SHALLOW_WATER);
    assertEquals(getTile(8, 9), TILE_FLOOR);

    world.step++;
    floodSystem(world);
    assertEquals(getTile(8, 9), TILE_SHALLOW_WATER);
    assertEquals(getTile(7, 8), TILE_SHALLOW_WATER);
    assert(!world.has(trap, FloodState), "flood should expire after its volume is placed");
  } finally {
    clearAll();
  }
});
