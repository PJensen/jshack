import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { Burned } from "../src/rules/components/Burned.js";
import { Collider } from "../src/rules/components/Collider.js";
import { Interactable } from "../src/rules/components/Interactable.js";
import { Material } from "../src/rules/components/Material.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { PlasmaCloud } from "../src/rules/components/PlasmaCloud.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import {
  CHUNK_SIZE,
  TILE_DOOR,
  TILE_FENCE,
  TILE_FLOOR,
  TILE_GRASS,
  TILE_TREE,
  TILE_PINE_FOREST,
  TILE_PALM_FOREST,
  TILE_MANGROVE,
  TILE_WALL,
} from "../src/rules/environment/dungeon/constants.js";
import { clearAll, getTile, loadChunk, setRoofed } from "../src/rules/environment/dungeon/tileMap.js";
import { hazardSystem } from "../src/rules/systems/hazardSystem.js";
import { getDestroyedTileRecord, ROOF_BURN_TURNS } from "../src/rules/utils/destroyedTiles.js";
import { spawnHazard } from "../src/rules/utils/hazardSpawn.js";
import { spawnPlasmaCloud } from "../src/rules/utils/spawnPlasmaCloud.js";

function makeActor(world, x, y, hp, name = "Target", identity = "target") {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Vitality, { hp, maxHp: Math.max(1, hp) });
  world.add(id, NamedIdentity, { name, identity });
  return id;
}

function addOverworldState(world) {
  const dungeonId = world.create();
  world.add(dungeonId, DungeonState, {
    worldSeed: 0xC0FFEE,
    currentDepth: 0,
    profileType: "overworld",
    floorEntityIds: [],
  });
  return dungeonId;
}

Deno.test("spawnHazard tracks hazards in DungeonState.floorEntityIds", () => {
  const world = new World({ seed: 9200 });
  const dungeonId = world.create();
  world.add(dungeonId, DungeonState, {
    worldSeed: 9200,
    currentDepth: 1,
    floorEntityIds: [11, 12],
  });

  const hazardId = spawnHazard(world, {
    x: 3,
    y: 4,
    kind: "poison",
    turnsLeft: 2,
    radius: 1,
    tickDamage: 1,
  });
  assert(hazardId > 0, "spawnHazard should return a valid hazard id");

  const ds = world.get(dungeonId, DungeonState);
  assert(ds.floorEntityIds.includes(hazardId), "new hazard should be tracked on current floor");

  // Spawning a second hazard should append once, not duplicate existing IDs.
  const hazardId2 = spawnHazard(world, {
    x: 5,
    y: 6,
    kind: "poison",
    turnsLeft: 2,
    radius: 1,
    tickDamage: 1,
  });
  const ids = ds.floorEntityIds.filter((id) => id === hazardId2);
  assertEquals(ids.length, 1);
});

Deno.test("hazardSystem ticks generic floor hazard and expires it", () => {
  const world = new World({ seed: 9201 });
  const events = [];
  for (const ev of ["hazard:spawned", "hazard:pulse", "hazard:expired"]) {
    world.on(ev, (data) => events.push({ type: ev, ...data }));
  }

  const hazardId = spawnHazard(world, {
    x: 5,
    y: 5,
    kind: "poison",
    medium: "floor",
    turnsLeft: 2,
    radius: 1,
    tickDamage: 2,
    damageType: "poison",
    cause: "toxic_slick",
    sourceKind: "test",
  });
  assert(hazardId > 0, "spawnHazard should return a valid hazard id");

  const center = makeActor(world, 5, 5, 8, "Center");
  const edge = makeActor(world, 6, 5, 8, "Edge");
  const outside = makeActor(world, 7, 5, 8, "Outside");

  hazardSystem(world);
  assertEquals(world.get(center, Vitality).hp, 6);
  assertEquals(world.get(edge, Vitality).hp, 6);
  assertEquals(world.get(outside, Vitality).hp, 8);

  hazardSystem(world);
  assertEquals(world.get(center, Vitality).hp, 4);
  assertEquals(world.get(edge, Vitality).hp, 4);
  assertEquals(world.get(outside, Vitality).hp, 8);
  assert(!world.isAlive(hazardId), "hazard should expire after final pulse");

  const spawned = events.find((e) => e.type === "hazard:spawned");
  assert(spawned, "hazard:spawned should emit");
  assertEquals(spawned.kind, "poison");
  assertEquals(spawned.medium, "floor");

  const pulses = events.filter((e) => e.type === "hazard:pulse");
  assertEquals(pulses.length, 2);
  assertEquals(pulses[0].medium, "floor");
  assertEquals(pulses[0].kind, "poison");
  assertEquals(pulses[0].tickDamage, 2);

  const expired = events.filter((e) => e.type === "hazard:expired");
  assertEquals(expired.length, 1);
  assertEquals(expired[0].medium, "floor");
  assertEquals(expired[0].kind, "poison");
});

Deno.test("plasma spawn remains compatible via generic hazard system", () => {
  const world = new World({ seed: 9202 });
  const events = [];
  for (const ev of [
    "hazard:spawned",
    "hazard:pulse",
    "hazard:expired",
    "plasmaCloud:spawned",
    "plasmaCloud:pulse",
    "plasmaCloud:expired",
  ]) {
    world.on(ev, (data) => events.push({ type: ev, ...data }));
  }

  const cloudId = spawnPlasmaCloud(world, {
    x: 1,
    y: 1,
    turnsLeft: 1,
    radius: 0,
    damage: 1,
    sourceKind: "compat",
  });
  assert(cloudId > 0, "spawnPlasmaCloud should return id");
  assert(world.has(cloudId, HazardArea), "plasma hazard should include HazardArea component");
  assert(world.has(cloudId, PlasmaCloud), "plasma hazard should still include legacy PlasmaCloud component");

  makeActor(world, 1, 1, 4, "Target");
  hazardSystem(world);

  const pulse = events.find((e) => e.type === "hazard:pulse");
  assert(pulse, "hazard pulse should emit");
  assertEquals(pulse.kind, "plasma");
  assertEquals(pulse.medium, "air");

  assert(events.some((e) => e.type === "plasmaCloud:spawned"), "legacy spawned event expected");
  assert(events.some((e) => e.type === "plasmaCloud:pulse"), "legacy pulse event expected");
  assert(events.some((e) => e.type === "plasmaCloud:expired"), "legacy expired event expected");
});

Deno.test("fire floor hazards burn tree tiles into grass", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  tiles[5 * CHUNK_SIZE + 5] = TILE_TREE;
  loadChunk(0, 0, tiles);

  try {
    const world = new World({ seed: 9203 });
    const burned = [];
    world.on("tile:burned", (event) => burned.push(event));

    const hazardId = spawnHazard(world, {
      x: 5,
      y: 5,
      kind: "fire",
      medium: "floor",
      turnsLeft: 2,
      radius: 0,
      tickDamage: 1,
      damageType: "fire",
      cause: "monster:firebreath",
      sourceId: 77,
      sourceKind: "dragon_whelp",
    });
    assert(hazardId > 0, "spawnHazard should return a valid hazard id");

    hazardSystem(world);

    assertEquals(getTile(5, 5), TILE_GRASS, "tree tile should become grass after a fire hazard pulse");
    assertEquals(burned.length, 1, "tile:burned should emit exactly once");
    assertEquals(burned[0].x, 5);
    assertEquals(burned[0].y, 5);
    assertEquals(burned[0].sourceKind, "dragon_whelp");
    assertEquals(burned[0].cause, "monster:firebreath");
    assertEquals(burned[0].tileBefore, TILE_TREE);
  } finally {
    clearAll();
  }
});

Deno.test("fire floor hazards can spread to adjacent trees", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  tiles[5 * CHUNK_SIZE + 5] = TILE_TREE;
  tiles[5 * CHUNK_SIZE + 6] = TILE_TREE;
  loadChunk(0, 0, tiles);

  try {
    const world = new World({ seed: 9204 });
    const spawned = [];
    const burned = [];
    world.on("hazard:spawned", (event) => spawned.push(event));
    world.on("tile:burned", (event) => burned.push(event));

    const hazardId = spawnHazard(world, {
      x: 5,
      y: 5,
      kind: "fire",
      medium: "floor",
      turnsLeft: 3,
      radius: 0,
      tickDamage: 1,
      damageType: "fire",
      cause: "monster:firebreath",
      sourceId: 77,
      sourceKind: "dragon_whelp",
      meta: { fireSpreadChance: 1, fireSpreadTurns: 2 },
    });
    assert(hazardId > 0, "spawnHazard should return a valid hazard id");

    hazardSystem(world);

    assertEquals(getTile(5, 5), TILE_GRASS, "origin tree should burn on the first pulse");
    assert(
      spawned.some((event) => event.kind === "fire" && event.at?.x === 6 && event.at?.y === 5),
      "first pulse should ignite an adjacent tree tile",
    );

    hazardSystem(world);

    assertEquals(getTile(6, 5), TILE_GRASS, "spread fire should burn the adjacent tree on its next pulse");
    assert(
      burned.some((event) => event.x === 6 && event.y === 5),
      "spread fire should emit tile:burned when the neighbor burns down",
    );
  } finally {
    clearAll();
  }
});

Deno.test("fire spreads through all overworld forest tile variants", () => {
  const forestTiles = [TILE_PINE_FOREST, TILE_PALM_FOREST, TILE_MANGROVE];
  for (const forestTile of forestTiles) {
    clearAll();
    const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_GRASS);
    tiles[5 * CHUNK_SIZE + 5] = forestTile;
    tiles[5 * CHUNK_SIZE + 6] = forestTile;
    loadChunk(0, 0, tiles);
    const world = new World({ seed: 9211 });
    spawnHazard(world, {
      x: 5,
      y: 5,
      kind: "fire",
      medium: "floor",
      turnsLeft: 3,
      radius: 0,
      meta: { fireSpreadChance: 1, fireSpreadTurns: 2 },
    });
    hazardSystem(world);
    assertEquals(getTile(5, 5), TILE_GRASS, "forest origin should burn");
    assert(
      [...world.query(Position, HazardArea)].some(([, pos]) => pos.x === 6 && pos.y === 5),
      "fire should spread to adjacent forest variants",
    );
  }
  clearAll();
});

Deno.test("overworld fire hazards burn wooden structure tiles into ruin tiles", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_GRASS);
  tiles[5 * CHUNK_SIZE + 5] = TILE_WALL;
  tiles[5 * CHUNK_SIZE + 6] = TILE_DOOR;
  tiles[5 * CHUNK_SIZE + 7] = TILE_FENCE;
  loadChunk(0, 0, tiles);

  try {
    const world = new World({ seed: 9205 });
    addOverworldState(world);
    const burned = [];
    world.on("tile:burned", (event) => burned.push(event));

    spawnHazard(world, {
      x: 5,
      y: 5,
      kind: "fire",
      medium: "floor",
      turnsLeft: 3,
      radius: 0,
      tickDamage: 0,
      damageType: "fire",
      cause: "wildfire",
      meta: { fireSpreadChance: 1, fireSpreadTurns: 2 },
    });

    hazardSystem(world);
    assertEquals(getTile(5, 5), TILE_FLOOR, "wooden wall should collapse to floor");
    const wallScar = getDestroyedTileRecord(world, 5, 5);
    assert(wallScar, "wall burn should persist its original tile");
    assertEquals(wallScar.originalTile, TILE_WALL);
    assertEquals(wallScar.roofTurnsLeft, ROOF_BURN_TURNS);

    hazardSystem(world);
    assertEquals(getTile(6, 5), TILE_FLOOR, "wooden door should burn open to floor");
    const doorScar = getDestroyedTileRecord(world, 6, 5);
    assert(doorScar, "door burn should persist its original tile");
    assertEquals(doorScar.originalTile, TILE_DOOR);
    assertEquals(doorScar.roofTurnsLeft, ROOF_BURN_TURNS);

    hazardSystem(world);
    assertEquals(getTile(7, 5), TILE_GRASS, "fence should burn away to grass");
    assert(burned.some((event) => event.x === 5 && event.y === 5), "wall burn should emit tile:burned");
    assert(burned.some((event) => event.x === 6 && event.y === 5), "door burn should emit tile:burned");
    assert(burned.some((event) => event.x === 7 && event.y === 5), "fence burn should emit tile:burned");
    const fenceScar = getDestroyedTileRecord(world, 7, 5);
    assert(fenceScar, "fence burn should persist its original tile");
    assertEquals(fenceScar.originalTile, TILE_FENCE);
    assertEquals(fenceScar.roofTurnsLeft, 0);
  } finally {
    clearAll();
  }
});

Deno.test("overworld roof fuel burns through roofed floors without turning floors into endless fuel", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_GRASS);
  tiles[5 * CHUNK_SIZE + 5] = TILE_WALL;
  tiles[5 * CHUNK_SIZE + 6] = TILE_FLOOR;
  loadChunk(0, 0, tiles);
  setRoofed(5, 5, true);
  setRoofed(6, 5, true);

  try {
    const world = new World({ seed: 9210 });
    addOverworldState(world);
    const spawned = [];
    const burned = [];
    world.on("hazard:spawned", (event) => spawned.push(event));
    world.on("tile:burned", (event) => burned.push(event));

    spawnHazard(world, {
      x: 5,
      y: 5,
      kind: "fire",
      medium: "floor",
      turnsLeft: 3,
      radius: 0,
      tickDamage: 0,
      damageType: "fire",
      cause: "wildfire",
      meta: { fireSpreadChance: 1, fireSpreadTurns: 2 },
    });

    hazardSystem(world);
    assert(
      spawned.some((event) => event.kind === "fire" && event.at?.x === 6 && event.at?.y === 5),
      "fire should spread from the shell onto the roof fuel above the interior floor",
    );

    hazardSystem(world);
    const roofScar = getDestroyedTileRecord(world, 6, 5);
    assert(roofScar, "roofed floor should record a burned roof cell");
    assertEquals(roofScar.originalTile, TILE_FLOOR);
    assertEquals(roofScar.currentTile, TILE_FLOOR);
    assertEquals(roofScar.burnedKind, "roof");
    assertEquals(roofScar.roofTurnsLeft, ROOF_BURN_TURNS);
    assertEquals(getTile(6, 5), TILE_FLOOR, "interior floor should remain floor while the roof burns away");
    assert(burned.some((event) => event.x === 6 && event.y === 5 && event.burnedKind === "roof"));

    const spawnedBefore = spawned.length;
    for (let i = 0; i < 4; i++) hazardSystem(world);
    assertEquals(
      spawned.length,
      spawnedBefore,
      "a burned-through roof cell should not keep reigniting as infinite fuel",
    );
  } finally {
    clearAll();
  }
});

Deno.test("fire floor hazards burn away flammable overworld props on their tile", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_GRASS);
  loadChunk(0, 0, tiles);

  try {
    const world = new World({ seed: 9206 });
    addOverworldState(world);
    const burned = [];
    world.on("entity:burned", (event) => burned.push(event));

    const sign = world.create();
    world.add(sign, Position, { x: 8, y: 8 });
    world.add(sign, NamedIdentity, { name: "Tavern Sign", identity: "tavern_sign" });
    world.add(sign, Material, { kind: "wood" });

    spawnHazard(world, {
      x: 8,
      y: 8,
      kind: "fire",
      medium: "floor",
      turnsLeft: 1,
      radius: 0,
      tickDamage: 0,
      damageType: "fire",
      cause: "wildfire",
    });

    hazardSystem(world);

    assert(world.isAlive(sign), "burned prop should remain in-world so it can be rebuilt later");
    assert(world.has(sign, Burned), "burned prop should be marked with Burned");
    assertEquals(burned.length, 1);
    assertEquals(burned[0].identity, "tavern_sign");
    const ashes = [];
    for (const [, ident, pos] of world.query(NamedIdentity, Position)) {
      if (ident.identity === "ashes") ashes.push(`${pos.x},${pos.y}`);
    }
    assertEquals(ashes, ["8,8"]);
  } finally {
    clearAll();
  }
});

Deno.test("fire floor hazards burn web entities and spread aggressively between webs", () => {
  const world = new World({ seed: 9211 });
  const spawned = [];
  const burned = [];
  world.on("hazard:spawned", (event) => spawned.push(event));
  world.on("entity:burned", (event) => burned.push(event));

  const webA = world.create();
  world.add(webA, Position, { x: 5, y: 5 });
  world.add(webA, NamedIdentity, { name: "Web", identity: "web" });
  world.add(webA, Material, { kind: "organic" });
  world.add(webA, Collider, { solid: true, blocksSight: false });
  world.add(webA, Interactable, { action: "clearWeb", params: null });

  const webB = world.create();
  world.add(webB, Position, { x: 6, y: 5 });
  world.add(webB, NamedIdentity, { name: "Web", identity: "web" });
  world.add(webB, Material, { kind: "organic" });
  world.add(webB, Collider, { solid: true, blocksSight: false });
  world.add(webB, Interactable, { action: "clearWeb", params: null });

  spawnHazard(world, {
    x: 5,
    y: 5,
    kind: "fire",
    medium: "floor",
    turnsLeft: 2,
    radius: 0,
    tickDamage: 0,
    damageType: "fire",
    cause: "thrown_torch",
  });

  hazardSystem(world);

  assert(world.has(webA, Burned), "web at fire origin should burn on first pulse");
  assert(
    burned.some((event) => event.entityId === webA && event.identity === "web"),
    "burning a web should emit entity:burned",
  );
  assert(
    spawned.some((event) => event.kind === "fire" && event.at?.x === 6 && event.at?.y === 5),
    "fire should spread from one web tile to an adjacent web tile",
  );

  hazardSystem(world);

  assert(world.has(webB, Burned), "adjacent web should burn after spread pulse");
  assert(
    burned.some((event) => event.entityId === webB && event.identity === "web"),
    "spread fire should burn the neighboring web entity",
  );
});
