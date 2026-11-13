import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { Status } from "../src/rules/components/Status.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { Channeling } from "../src/rules/components/Channeling.js";
import { movementSystem } from "../src/rules/systems/movementSystem.js";
import { loadChunk, clearAll } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";

function loadFloorChunk() {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
}

Deno.test("movementSystem: confused status causes a misstep", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 0xC0FFEE });
    const actor = world.create();

    world.add(actor, Position, { x: 5, y: 5 });
    world.add(actor, Status, {
      statuses: [{ type: "confused", duration: 3, potency: 1, stacks: 1 }],
    });
    world.add(actor, MoveIntent, { dx: 1, dy: 0 });

    movementSystem(world);

    const pos = world.get(actor, Position);
    assert(pos, "position should exist");
    assert(!(pos.x === 6 && pos.y === 5), "confused actor should not take intended step");
    assert(Math.abs(pos.x - 5) <= 1 && Math.abs(pos.y - 5) <= 1, "misstep should remain adjacent");
    assert(!(pos.x === 5 && pos.y === 5), "movement should still consume into an actual step");
    assert(!world.has(actor, MoveIntent), "move intent should be consumed");
  } finally {
    clearAll();
  }
});

Deno.test("movementSystem: active cast channel holds the caster in place", () => {
  loadFloorChunk();
  try {
    const world = new World({ seed: 0xC0FFEE });
    const actor = world.create();

    world.add(actor, Position, { x: 5, y: 5 });
    world.add(actor, Channeling, {
      mode: "cast",
      spellId: "wolf_howl",
      turnsRemaining: 2,
      turnsTotal: 3,
    });
    world.add(actor, MoveIntent, { dx: 1, dy: 0 });

    movementSystem(world);

    assertEquals(world.get(actor, Position), { x: 5, y: 5 });
    assert(!world.has(actor, MoveIntent), "channeling should consume the queued move");
  } finally {
    clearAll();
  }
});
