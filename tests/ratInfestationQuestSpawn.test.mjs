import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import {
  ensureRatInfestationQuestRats,
  RAT_INFESTATION_QUEST_ID,
} from "../src/rules/quests/definitions/ratInfestation.js";
import { instantiateQuest } from "../src/rules/quests/runtime.js";
import {
  CHUNK_SIZE,
  TILE_FLOOR,
  TILE_WALL,
} from "../src/rules/environment/dungeon/constants.js";
import {
  clearAll as clearTileMap,
  loadChunk,
} from "../src/rules/environment/dungeon/tileMap.js";

function loadRatTestFloor() {
  clearTileMap();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_WALL);
  for (let y = 4; y <= 14; y++) {
    for (let x = 4; x <= 14; x++) {
      tiles[y * CHUNK_SIZE + x] = TILE_FLOOR;
    }
  }
  loadChunk(0, 0, tiles);
}

function countRats(world) {
  let rats = 0;
  for (const [, named] of world.query(NamedIdentity)) {
    if (named.identity === "rat") rats++;
  }
  return rats;
}

function setupWorld({ activeTemplateId = "" } = {}) {
  loadRatTestFloor();
  const world = new World({ seed: 123 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 8, y: 8 });

  const barkeep = world.create();
  world.add(barkeep, NamedIdentity, { name: "Barkeep", identity: "townfolk_barkeep" });

  const stair = world.create();
  world.add(stair, Position, { x: 8, y: 8 });
  world.add(stair, NamedIdentity, { name: "Staircase Down", identity: "stair_down" });

  const dungeon = world.create();
  world.add(dungeon, DungeonState, {
    worldSeed: 123,
    currentDepth: 1,
    activeTemplateId,
    floorEntityIds: [player, stair],
    downStairPositions: [{ x: 8, y: 8 }],
  });

  instantiateQuest(world, RAT_INFESTATION_QUEST_ID, {
    player,
    giver: barkeep,
    target: barkeep,
  }, {
    accepted: true,
    killCount: 0,
  }, { node: "hunt" });

  return { world, dungeon };
}

Deno.test("accepted rat quest does not seed rats on generic depth 1", () => {
  const { world } = setupWorld();

  assertEquals(ensureRatInfestationQuestRats(world), 0);
});

Deno.test("accepted rat quest seeds tavern basement rats without duplication", () => {
  const { world, dungeon } = setupWorld({ activeTemplateId: "tavern_basement" });

  const first = ensureRatInfestationQuestRats(world);
  const second = ensureRatInfestationQuestRats(world);

  assert(first >= 5, `expected quest seeding to add many rats, got ${first}`);
  assertEquals(second, 0);
  assert(countRats(world) >= 10);
  assert(world.get(dungeon, DungeonState).floorEntityIds.length >= 10);
});
