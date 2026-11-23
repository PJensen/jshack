import { assert } from "jsr:@std/assert";
import "./helpers/installContentCatalog.mjs";
import { World } from '../src/lib/ecs-js/index.js';
import { Position } from '../src/rules/components/Position.js';
import { Player } from '../src/rules/components/Player.js';
import { DungeonState } from '../src/rules/components/DungeonState.js';
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Faction } from "../src/rules/components/Faction.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Collider } from "../src/rules/components/Collider.js";
import { transitionToDepth, clearFloorCache } from '../src/rules/environment/dungeon/transition.js';
import { initDungeon, generateFloor } from '../src/rules/environment/dungeon/index.js';
import { loadedChunkCount, clearAll, getTile, isWalkable, forEachLoadedTile } from '../src/rules/environment/dungeon/tileMap.js';
import { dungeonConfig } from '../src/rules/environment/dungeon/dungeonConfig.js';
import { TILE_FLOOR, TILE_SHALLOW_WATER, TILE_STAIR_UP } from '../src/rules/environment/dungeon/constants.js';
import { startFlood, floodSystem } from "../src/rules/systems/floodSystem.js";
import { FloodState } from "../src/rules/components/FloodState.js";
import { spawnPlasmaCloud } from "../src/rules/utils/spawnPlasmaCloud.js";
import { markExplored, isExplored, clearExplored } from "../src/rules/environment/dungeon/exploredMap.js";
import { exploredFloorRepository } from "../src/rules/environment/dungeon/floorMemory.js";

function makePlayerAt(world, x, y) {
  const id = world.create();
  world.add(id, Player, {});
  world.add(id, Position, { x, y });
  return id;
}

function firstDownStair(world) {
  for (const [, ds] of world.query(DungeonState)) {
    const pos = Array.isArray(ds.downStairPositions) ? ds.downStairPositions[0] : null;
    if (pos) return { x: pos.x | 0, y: pos.y | 0 };
  }
  throw new Error("expected a down stair");
}

function makeEnemyAt(world, x, y, alertLevel = AGGRO_LEVELS.hunting) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: "Test Goblin", identity: "goblin" });
  world.add(id, Faction, { key: "enemy" });
  world.add(id, Vitality, { hp: 7, maxHp: 9 });
  world.add(id, Collider, { solid: true, blocksSight: false });
  world.add(id, AggroState, {
    alertLevel,
    lastKnownX: x,
    lastKnownY: y,
    searchTurnsLeft: 10,
  });
  return id;
}

Deno.test("floor return restores flooded terrain and resumes the saved flood", async () => {
  clearAll();
  clearFloorCache();
  try {
    const world = new World({ seed: 42 });
    const spawn = await initDungeon(world, { startDepth: 1 });
    makePlayerAt(world, spawn.x, spawn.y);
    let source;
    forEachLoadedTile((x, y, tile) => {
      if (!source && tile === TILE_FLOOR && getTile(x, y - 1) === TILE_FLOOR) source = { x, y };
    });
    assert(source);
    const id = world.create();
    world.add(id, Position, source);
    startFlood(world, id, { volume: 2, spreadPerTurn: 1 });

    await transitionToDepth(world, 2, { x: 0, y: 0 });
    await transitionToDepth(world, 1, source);
    assert(getTile(source.x, source.y) === TILE_SHALLOW_WATER);
    assert([...world.query(FloodState)].length === 1);
    world.setScheduler(floodSystem);
    world.tick(1);
    assert(getTile(source.x, source.y - 1) === TILE_SHALLOW_WATER);
    assert([...world.query(FloodState)].length === 0);
  } finally {
    clearAll();
    clearFloorCache();
  }
});

Deno.test("transitionToDepth clears and regenerates floor", async () => {
  clearAll();
  const world = new World({ seed: 42 });
  const spawn = await initDungeon(world);
  makePlayerAt(world, spawn.x, spawn.y);

  const chunksFloor1 = loadedChunkCount();
  assert(chunksFloor1 > 0, 'floor 1 has tile data');

  await transitionToDepth(world, 2, { x: 10, y: 10 });

  const chunksFloor2 = loadedChunkCount();
  assert(chunksFloor2 > 0, 'floor 2 has tile data after transition');
});

Deno.test("transitionToDepth updates DungeonState.currentDepth", async () => {
  clearAll();
  const world = new World({ seed: 42 });
  await initDungeon(world);
  makePlayerAt(world, 0, 0);

  await transitionToDepth(world, 5, { x: 0, y: 0 });

  for (const [_id, ds] of world.query(DungeonState)) {
    assert(ds.currentDepth === 5, `depth updated to 5, got ${ds.currentDepth}`);
  }
});

Deno.test("transitionToDepth moves player to destination", async () => {
  clearAll();
  const world = new World({ seed: 42 });
  await initDungeon(world);
  makePlayerAt(world, 0, 0);

  await transitionToDepth(world, 2, { x: 100, y: -50 });

  for (const [id] of world.query(Player)) {
    const pos = world.get(id, Position);
    assert(pos.x === 100 && pos.y === -50, `player at (100,-50), got (${pos.x},${pos.y})`);
  }
});

Deno.test("transitionToDepth validated destination falls back to a real walkable tile", async () => {
  clearAll();
  const world = new World({ seed: 42 });
  await initDungeon(world);
  makePlayerAt(world, 0, 0);

  await transitionToDepth(world, 2, { x: 9999, y: 9999 }, { validateDestination: true });

  for (const [id] of world.query(Player)) {
    const pos = world.get(id, Position);
    assert(pos.x !== 9999 || pos.y !== 9999, "validated transition should not keep an unloaded void destination");
    assert(isWalkable(pos.x, pos.y), `validated destination (${pos.x},${pos.y}) should be walkable`);
  }
});

Deno.test("transitionToDepth emits dungeon:transitioned event", async () => {
  clearAll();
  const world = new World({ seed: 42 });
  await initDungeon(world);
  makePlayerAt(world, 0, 0);

  const events = [];
  world.on('dungeon:transitioned', e => events.push(e));

  await transitionToDepth(world, 3, { x: 5, y: 5 });

  assert(events.length === 1, 'event emitted');
  assert(events[0].depth === 3, 'correct depth');
  assert(events[0].pos.x === 5 && events[0].pos.y === 5, 'correct pos');
});

Deno.test("transitionToDepth updates floorEntityIds", async () => {
  clearAll();
  const world = new World({ seed: 42 });
  await initDungeon(world);
  makePlayerAt(world, 0, 0);

  await transitionToDepth(world, 2, { x: 0, y: 0 });

  for (const [_id, ds] of world.query(DungeonState)) {
    assert(Array.isArray(ds.floorEntityIds), 'floorEntityIds is array');
    assert(ds.floorEntityIds.length > 0, 'new floor has entities');
  }
});

Deno.test("hunting monsters near stairs follow across dungeon levels", async () => {
  clearAll();
  clearFloorCache();
  const world = new World({ seed: 42 });
  await initDungeon(world);
  const stair = firstDownStair(world);
  makePlayerAt(world, stair.x, stair.y);
  const enemy = makeEnemyAt(world, stair.x + 1, stair.y);

  const events = [];
  world.on("dungeon:pursuit", (ev) => events.push(ev));

  await transitionToDepth(world, 2, { x: 0, y: 0 }, { direction: "down", stairPos: stair });

  assert(world.isAlive(enemy), "hunting enemy should survive transition");
  assert(world.get(enemy, Vitality)?.hp === 7, "hunting enemy should keep its runtime state");
  const pos = world.get(enemy, Position);
  assert(pos, "hunting enemy should have a new floor position");
  assert(Math.max(Math.abs(pos.x - stair.x), Math.abs(pos.y - stair.y)) <= 5, "hunting enemy should land near arrival stair");
  assert(pos.x !== stair.x || pos.y !== stair.y, "hunting enemy should not land on the player");

  let dsSeen = null;
  for (const [, ds] of world.query(DungeonState)) { dsSeen = ds; break; }
  assert(dsSeen?.currentDepth === 2, "transition should reach target depth");
  assert(dsSeen.floorEntityIds.includes(enemy), "hunting enemy should be tracked on new floor");
  assert(events.length === 1, "pursuit event should be emitted");
  assert(events[0].pursuerIds.includes(enemy), "pursuit event should name carried enemy");
});

Deno.test("hunting monsters can follow upstairs to a cached dungeon level", async () => {
  clearAll();
  clearFloorCache();
  const world = new World({ seed: 44 });
  await initDungeon(world);
  const stair = firstDownStair(world);
  const player = makePlayerAt(world, stair.x, stair.y);

  await transitionToDepth(world, 2, { x: 0, y: 0 }, { direction: "down", stairPos: stair });
  world.set(player, Position, { x: stair.x, y: stair.y });
  const enemy = makeEnemyAt(world, stair.x + 1, stair.y);

  const events = [];
  world.on("dungeon:pursuit", (ev) => events.push(ev));

  await transitionToDepth(world, 1, { x: 0, y: 0 }, { direction: "up", stairPos: stair });

  let dsSeen = null;
  for (const [, ds] of world.query(DungeonState)) { dsSeen = ds; break; }
  assert(dsSeen?.currentDepth === 1, "transition should return to prior depth");
  assert(world.isAlive(enemy), "upstairs pursuer should survive transition");
  assert(world.get(enemy, Vitality)?.hp === 7, "upstairs pursuer should keep runtime state");
  const pos = world.get(enemy, Position);
  assert(pos, "upstairs pursuer should have a position");
  assert(Math.max(Math.abs(pos.x - stair.x), Math.abs(pos.y - stair.y)) <= 5, "upstairs pursuer should land near arrival stair");
  assert(dsSeen.floorEntityIds.includes(enemy), "upstairs pursuer should be tracked on restored floor");
  assert(events.length === 1, "upstairs pursuit event should be emitted");
});

Deno.test("non-hunting monsters do not follow across stairs", async () => {
  clearAll();
  clearFloorCache();
  const world = new World({ seed: 43 });
  await initDungeon(world);
  const stair = firstDownStair(world);
  makePlayerAt(world, stair.x, stair.y);
  const enemy = makeEnemyAt(world, stair.x + 1, stair.y, AGGRO_LEVELS.alerted);

  const events = [];
  world.on("dungeon:pursuit", (ev) => events.push(ev));

  await transitionToDepth(world, 2, { x: 0, y: 0 }, { direction: "down", stairPos: stair });

  for (const [, ident] of world.query(NamedIdentity)) {
    assert(ident.identity !== "goblin" || ident.name !== "Test Goblin", "non-hunting enemy should not be carried onto the new floor");
  }
  assert(events.length === 0, "non-hunting enemy should not emit pursuit");
});

Deno.test("transitionToDepth destroys tracked hazards from prior floor", async () => {
  clearAll();
  const world = new World({ seed: 42 });
  const spawn = await initDungeon(world);
  makePlayerAt(world, spawn.x, spawn.y);

  const cloudId = spawnPlasmaCloud(world, {
    x: spawn.x + 1,
    y: spawn.y,
    turnsLeft: 3,
    radius: 1,
    damage: 2,
  });
  assert(cloudId > 0, "plasma cloud should spawn");
  assert(world.isAlive(cloudId), "cloud should be alive before transition");

  let tracked = false;
  for (const [, ds] of world.query(DungeonState)) {
    tracked = Array.isArray(ds.floorEntityIds) && ds.floorEntityIds.includes(cloudId);
    break;
  }
  assert(tracked, "spawned cloud should be tracked on current floor");

  await transitionToDepth(world, 2, { x: spawn.x, y: spawn.y });

  let plasmaHazards = 0;
  for (const [, hazard, ident] of world.query(HazardArea, NamedIdentity)) {
    const kind = String(hazard?.kind || "").toLowerCase();
    const identity = String(ident?.identity || "");
    if (kind === "plasma" || identity === "plasma_cloud") plasmaHazards++;
  }
  assert(plasmaHazards === 0, "tracked cloud hazards should not survive transition");
});

Deno.test("transition caches and restores explored tiles through repository", async () => {
  clearAll();
  clearExplored();
  clearFloorCache();
  const world = new World({ seed: 42 });
  const spawn = await initDungeon(world);
  makePlayerAt(world, spawn.x, spawn.y);

  markExplored(spawn.x, spawn.y);
  assert(isExplored(spawn.x, spawn.y), "tile should start explored");

  await transitionToDepth(world, 2, { x: spawn.x, y: spawn.y });
  assert(exploredFloorRepository.getSnapshot(1) instanceof Map, "depth 1 explored snapshot should be cached");
  assert(!isExplored(spawn.x, spawn.y), "depth 2 starts with different explored state");

  await transitionToDepth(world, 1, { x: spawn.x, y: spawn.y });
  assert(isExplored(spawn.x, spawn.y), "returning restores explored tiles from repository cache");
});

Deno.test("clearFloorCache clears explored repository snapshots", async () => {
  clearAll();
  clearExplored();
  clearFloorCache();
  const world = new World({ seed: 42 });
  const spawn = await initDungeon(world);
  makePlayerAt(world, spawn.x, spawn.y);

  markExplored(spawn.x, spawn.y);
  await transitionToDepth(world, 2, { x: spawn.x, y: spawn.y });
  assert(exploredFloorRepository.listDepths().length === 1, "precondition: one cached explored depth");

  clearFloorCache();
  assert(exploredFloorRepository.listDepths().length === 0, "clearFloorCache should clear explored repository");
});

Deno.test("inherited up stairs preserve exact world coordinates across dungeon scales", async () => {
  const previousScale = dungeonConfig.dungeonScale;
  const scales = [0.1, 0.3, 1.0, 2.0];
  const seeds = [42, 777, 9999];

  try {
    for (const scale of scales) {
      dungeonConfig.dungeonScale = scale;
      for (const seed of seeds) {
        clearAll();
        const upperWorld = new World({ seed });
        const upperFloor = await generateFloor(upperWorld, seed, 1);
        const priorDownStairPositions = upperFloor.downStairPositions.slice();

        clearAll();
        const lowerWorld = new World({ seed });
        const lowerFloor = await generateFloor(lowerWorld, seed, 2, null, null, priorDownStairPositions);

        const reachable = new Set();
        const queue = [[lowerFloor.spawnX, lowerFloor.spawnY]];
        reachable.add(`${lowerFloor.spawnX},${lowerFloor.spawnY}`);
        while (queue.length > 0) {
          const [cx, cy] = queue.shift();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            const key = `${nx},${ny}`;
            if (reachable.has(key)) continue;
            if (!isWalkable(nx, ny)) continue;
            reachable.add(key);
            queue.push([nx, ny]);
          }
        }

        for (const pos of priorDownStairPositions) {
          const tile = getTile(pos.x, pos.y);
          assert(tile === TILE_STAIR_UP, `scale ${scale} seed ${seed}: expected up stair at (${pos.x},${pos.y}), got tile ${tile}`);
          assert(isWalkable(pos.x, pos.y), `scale ${scale} seed ${seed}: inherited up stair at (${pos.x},${pos.y}) must be walkable`);
          assert(reachable.has(`${pos.x},${pos.y}`), `scale ${scale} seed ${seed}: inherited up stair at (${pos.x},${pos.y}) must be reachable`);
        }

        let inheritedCount = 0;
        forEachLoadedTile((x, y, tile) => {
          if (tile !== TILE_STAIR_UP) return;
          if (priorDownStairPositions.some((pos) => pos.x === x && pos.y === y)) inheritedCount++;
        });
        assert(inheritedCount === priorDownStairPositions.length, `scale ${scale} seed ${seed}: expected ${priorDownStairPositions.length} inherited up stairs, got ${inheritedCount}`);
      }
    }
  } finally {
    dungeonConfig.dungeonScale = previousScale;
    clearAll();
  }
});
