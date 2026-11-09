import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { Position } from '../src/rules/components/Position.js';
import { Player } from '../src/rules/components/Player.js';
import { NamedIdentity } from '../src/rules/components/NamedIdentity.js';
import { Faction } from '../src/rules/components/Faction.js';
import { MoveIntent } from '../src/rules/components/Intents/MoveIntent.js';
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_HUNTING_GRACE } from '../src/rules/components/AggroState.js';
import { Brain } from '../src/rules/components/Brain.js';
import { Vitality } from '../src/rules/components/Vitality.js';
import { Flying } from '../src/rules/components/Flying.js';
import { DungeonState } from '../src/rules/components/DungeonState.js';
import { aiChaseSystem as proposeChase, installAggroFromStealthOffenseListener } from '../src/rules/systems/aiChaseSystem.js';
import { aiChaseSystem } from "./helpers/runChaseTactics.mjs";
import { putActorToSleep } from '../src/rules/utils/sleep.js';
import { clearAll, isWalkable, loadChunk, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR, TILE_WALL } from "../src/rules/environment/dungeon/constants.js";

// Helpers ──────────────────────────────────────────────────────────────────

function addHuntingAggro(world, id, playerX, playerY) {
  world.add(id, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: playerX,
    lastKnownY: playerY,
    searchTurnsLeft: SEARCH_TURNS_HUNTING_GRACE,
    retreating: false,
  });
}

function addDungeonState(world, depth, profileType = 'default') {
  const id = world.create();
  world.add(id, DungeonState, {
    worldSeed: 1,
    currentDepth: depth,
    profileType,
    floorEntityIds: [],
    downStairPositions: [],
  });
  return id;
}

// Chase direction tests ─────────────────────────────────────────────────────

Deno.test("monster east of player chases west", () => {
  const world = new World({ seed: 1 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const m1 = world.create();
  world.add(m1, Position, { x: 8, y: 5 });
  world.add(m1, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
  world.add(m1, Faction, { key: 'enemy' });
  addHuntingAggro(world, m1, 5, 5);

  aiChaseSystem(world);

  const intent = world.get(m1, MoveIntent);
  assert(intent, 'monster should have MoveIntent');
  assert(intent.dx === -1 && intent.dy === 0, `m1 should move west, got dx=${intent.dx} dy=${intent.dy}`);
});

Deno.test("monster north of player chases south", () => {
  const world = new World({ seed: 1 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const m2 = world.create();
  world.add(m2, Position, { x: 5, y: 2 });
  world.add(m2, NamedIdentity, { name: 'Orc', identity: 'orc' });
  world.add(m2, Faction, { key: 'enemy' });
  addHuntingAggro(world, m2, 5, 5);

  aiChaseSystem(world);

  const i2 = world.get(m2, MoveIntent);
  assert(i2, 'm2 should have MoveIntent');
  assert(i2.dx === 0 && i2.dy === 1, `m2 should move south, got dx=${i2.dx} dy=${i2.dy}`);
});

Deno.test("smart monster routes around a wall with A*", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  tiles[5 * CHUNK_SIZE + 7] = TILE_WALL;
  loadChunk(0, 0, tiles);

  try {
    const world = new World({ seed: 101 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: "Hero", identity: "player" });

    const goblin = world.create();
    world.add(goblin, Position, { x: 8, y: 5 });
    world.add(goblin, NamedIdentity, { name: "Goblin", identity: "goblin" });
    world.add(goblin, Faction, { key: "enemy" });
    addHuntingAggro(world, goblin, 5, 5);

    aiChaseSystem(world);

    const intent = world.get(goblin, MoveIntent);
    assert(intent, "smart monster should still get a MoveIntent");
    assertEquals(intent.dx, 0, "smart monster should route around the wall instead of bumping it");
    assertEquals(intent.dy, -1, "smart monster should take the north detour first");
  } finally {
    clearAll();
  }
});

Deno.test("dumb monster keeps greedy chase when a wall blocks the direct step", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  tiles[5 * CHUNK_SIZE + 7] = TILE_WALL;
  loadChunk(0, 0, tiles);

  try {
    const world = new World({ seed: 102 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: "Hero", identity: "player" });

    const rat = world.create();
    world.add(rat, Position, { x: 8, y: 5 });
    world.add(rat, NamedIdentity, { name: "Rat", identity: "rat" });
    world.add(rat, Faction, { key: "enemy" });
    addHuntingAggro(world, rat, 5, 5);

    aiChaseSystem(world);

    const intent = world.get(rat, MoveIntent);
    assert(intent, "dumb monster should still get a MoveIntent");
    assertEquals(intent.dx, -1, "dumb monster should keep the simple greedy step");
    assertEquals(intent.dy, 0, "dumb monster should not A* around the wall");
  } finally {
    clearAll();
  }
});

Deno.test("diagonal chase: equal distance prefers x-axis", () => {
  const world = new World({ seed: 1 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const m3 = world.create();
  world.add(m3, Position, { x: 8, y: 2 });
  world.add(m3, NamedIdentity, { name: 'Troll', identity: 'troll' });
  world.add(m3, Faction, { key: 'enemy' });
  addHuntingAggro(world, m3, 5, 5);

  aiChaseSystem(world);

  const i3 = world.get(m3, MoveIntent);
  assert(i3, 'm3 should have MoveIntent');
  assert(i3.dx === -1 && i3.dy === 0, `m3 should move along x-axis, got dx=${i3.dx} dy=${i3.dy}`);
});

Deno.test("pre-existing MoveIntent is not overwritten", () => {
  const world = new World({ seed: 1 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const m4 = world.create();
  world.add(m4, Position, { x: 3, y: 5 });
  world.add(m4, NamedIdentity, { name: 'Imp', identity: 'imp' });
  world.add(m4, Faction, { key: 'enemy' });
  addHuntingAggro(world, m4, 5, 5);
  world.add(m4, MoveIntent, { dx: 0, dy: -1 });

  aiChaseSystem(world);

  const i4 = world.get(m4, MoveIntent);
  assert(i4.dx === 0 && i4.dy === -1, 'pre-existing MoveIntent should not be overwritten');
});

Deno.test("monster on same tile as player does not move", () => {
  const world = new World({ seed: 1 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const m5 = world.create();
  world.add(m5, Position, { x: 5, y: 5 });
  world.add(m5, NamedIdentity, { name: 'Shade', identity: 'shade' });
  world.add(m5, Faction, { key: 'enemy' });
  addHuntingAggro(world, m5, 5, 5);

  aiChaseSystem(world);

  assert(!world.has(m5, MoveIntent), 'monster on player tile should not get MoveIntent');
});

Deno.test("non-monster entity is ignored by AI chase", () => {
  const world = new World({ seed: 1 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const npc = world.create();
  world.add(npc, Position, { x: 0, y: 0 });
  world.add(npc, NamedIdentity, { name: 'Villager', identity: 'npc' });
  world.add(npc, Faction, { key: 'neutral' });

  aiChaseSystem(world);

  assert(!world.has(npc, MoveIntent), 'non-monster should not get MoveIntent');
});

Deno.test("entity without AggroState is skipped by AI chase", () => {
  const world = new World({ seed: 2 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });

  const bare = world.create();
  world.add(bare, Position, { x: 7, y: 5 });
  world.add(bare, Faction, { key: 'enemy' });
  // No AggroState added intentionally

  aiChaseSystem(world);
  assert(!world.has(bare, MoveIntent), 'entity without AggroState should be skipped');
});

Deno.test("no player → AI chase is a no-op", () => {
  const world = new World({ seed: 2 });
  const lonely = world.create();
  world.add(lonely, Position, { x: 0, y: 0 });
  world.add(lonely, NamedIdentity, { name: 'Bat', identity: 'bat' });
  world.add(lonely, Faction, { key: 'enemy' });
  addHuntingAggro(world, lonely, 0, 0);
  aiChaseSystem(world);
  assert(!world.has(lonely, MoveIntent), 'no player means no chase');
});

Deno.test("flying enemy in overworld keeps LOS through terrain blockers", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  tiles[0 * CHUNK_SIZE + 2] = TILE_WALL;
  loadChunk(0, 0, tiles);

  const world = new World({ seed: 4 });
  addDungeonState(world, 0, 'overworld');

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 0, y: 0 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const flyer = world.create();
  world.add(flyer, Position, { x: 4, y: 0 });
  world.add(flyer, NamedIdentity, { name: 'Dragon Whelp', identity: 'dragon_whelp' });
  world.add(flyer, Faction, { key: 'enemy' });
  world.add(flyer, Flying, {});
  world.add(flyer, Brain, { visionRange: 8 });
  world.add(flyer, AggroState, {
    alertLevel: AGGRO_LEVELS.unaware,
    lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
  });

  aiChaseSystem(world);

  const aggro = world.get(flyer, AggroState);
  assertEquals(aggro.alertLevel, AGGRO_LEVELS.hunting, 'overworld flyer should acquire player despite wall cover');
});

Deno.test("flying enemy in caves still respects blocked LOS", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  tiles[0 * CHUNK_SIZE + 2] = TILE_WALL;
  loadChunk(0, 0, tiles);

  const world = new World({ seed: 5 });
  addDungeonState(world, 5, 'caves');

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 0, y: 0 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const flyer = world.create();
  world.add(flyer, Position, { x: 4, y: 0 });
  world.add(flyer, NamedIdentity, { name: 'Dragon Whelp', identity: 'dragon_whelp' });
  world.add(flyer, Faction, { key: 'enemy' });
  world.add(flyer, Flying, {});
  world.add(flyer, Brain, { visionRange: 8 });
  world.add(flyer, AggroState, {
    alertLevel: AGGRO_LEVELS.unaware,
    lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
  });

  aiChaseSystem(world);

  const aggro = world.get(flyer, AggroState);
  assertEquals(aggro.alertLevel, AGGRO_LEVELS.unaware, 'cave flyer should not see through bedrock corners');
});

// Passive aggro ─────────────────────────────────────────────────────────────

Deno.test("passive creature (cave_snake) does not aggro by sight while unaware", () => {
  const world = new World({ seed: 3 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const snake = world.create();
  world.add(snake, Position, { x: 7, y: 5 });
  world.add(snake, NamedIdentity, { name: 'Cave Snake', identity: 'cave_snake' });
  world.add(snake, Faction, { key: 'enemy' });
  world.add(snake, AggroState, {
    alertLevel: AGGRO_LEVELS.unaware,
    lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
  });

  aiChaseSystem(world);

  // Passive + unaware: should NOT transition to hunting even though it has LOS.
  assert(!world.has(snake, MoveIntent), 'passive snake should not chase on sight');
  const aggro = world.get(snake, AggroState);
  assertEquals(aggro.alertLevel, AGGRO_LEVELS.unaware, 'passive snake should remain unaware');
});

Deno.test("passive creature fights back once alerted (via damage path)", () => {
  const world = new World({ seed: 3 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const snake = world.create();
  world.add(snake, Position, { x: 7, y: 5 });
  world.add(snake, NamedIdentity, { name: 'Cave Snake', identity: 'cave_snake' });
  world.add(snake, Faction, { key: 'enemy' });
  // Already alerted (simulates a damage-triggered aggro)
  world.add(snake, AggroState, {
    alertLevel: AGGRO_LEVELS.alerted,
    lastKnownX: 5, lastKnownY: 5, searchTurnsLeft: 10, retreating: false,
  });

  aiChaseSystem(world);

  // Passive + already alerted: normal hunting resumes.
  assert(world.has(snake, MoveIntent), 'alerted passive snake should chase');
});

// Retreat ───────────────────────────────────────────────────────────────────

Deno.test("wraith with low HP sets retreating flag and flees", () => {
  const world = new World({ seed: 4 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const wraith = world.create();
  world.add(wraith, Position, { x: 8, y: 5 }); // east of player
  world.add(wraith, NamedIdentity, { name: 'Wraith', identity: 'wraith' });
  world.add(wraith, Faction, { key: 'enemy' });
  addHuntingAggro(world, wraith, 5, 5);
  // Wraith retreatHpPct = 0.25; set HP to 10% so it should retreat
  world.add(wraith, Vitality, { maxHp: 18, hp: 2 });

  aiChaseSystem(world);

  const intent = world.get(wraith, MoveIntent);
  assert(intent, 'retreating wraith should still get a MoveIntent (fleeing)');
  // Wraith is east of player (x=8 vs x=5); retreating means moving EAST (+x), away from player.
  assertEquals(intent.dx, 1, 'retreating wraith should flee east (away from player)');
});

// Pack alerting ─────────────────────────────────────────────────────────────

Deno.test("goblin first sighting alerts nearby goblins", () => {
  // Use a tile map so we can block the pack mate's direct LOS to the player.
  // Without walls the pack mate would also see the player and go straight to hunting.
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  try {
    // Wall at (11, 5) blocks pack mate (12,5) → player (5,5) LOS.
    // Scout (8,5) → player (5,5) is unobstructed.
    setTile(11, 5, TILE_WALL);

    const world = new World({ seed: 5 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

    // Scout goblin: will see the player first.
    const scout = world.create();
    world.add(scout, Position, { x: 8, y: 5 });
    world.add(scout, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
    world.add(scout, Faction, { key: 'enemy' });
    world.add(scout, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
    });

    // Pack mate within packRadius (8 tiles), same species, but no direct LOS.
    const packMate = world.create();
    world.add(packMate, Position, { x: 12, y: 5 });
    world.add(packMate, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
    world.add(packMate, Faction, { key: 'enemy' });
    world.add(packMate, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
    });

    aiChaseSystem(world);

    const packAggro = world.get(packMate, AggroState);
    assertEquals(
      packAggro.alertLevel,
      AGGRO_LEVELS.alerted,
      'pack mate should be alerted by scout sighting',
    );
    assertEquals(packAggro.lastKnownX, 5, 'pack mate should know player X');
    assertEquals(packAggro.lastKnownY, 5, 'pack mate should know player Y');
  } finally {
    clearAll();
  }
});

Deno.test("neutral alertOnSight monsters emit canonical alert audio without chasing", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);

  const world = new World({ seed: 0x5151 });
  const alerts = [];

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const ratatoskr = world.create();
  world.add(ratatoskr, Position, { x: 8, y: 5 });
  world.add(ratatoskr, NamedIdentity, { name: 'Ratatoskr', identity: 'ratatoskr' });
  world.add(ratatoskr, Faction, { key: 'neutral' });
  world.add(ratatoskr, Brain, { learnedSpellIds: [], itemKnowledgeIdentities: [], seenTiles: new Uint8Array(), intelligence: 8, visionRange: 7 });
  world.add(ratatoskr, AggroState, { alertLevel: AGGRO_LEVELS.unaware });
  world.on("status", (ev) => {
    if (ev.kind === "alert") alerts.push(ev);
  });

  world.step = 0;
  aiChaseSystem(world);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].id, ratatoskr);
  assertEquals(alerts[0].at, { x: 8, y: 5 });
  assertEquals(world.get(ratatoskr, AggroState).alertLevel, AGGRO_LEVELS.unaware);
  assert(!world.has(ratatoskr, MoveIntent), "neutral Ratatoskr should not chase from sight");

  world.step = 300;
  aiChaseSystem(world);
  assertEquals(alerts.length, 1, "Ratatoskr sight alert should still be on cooldown after 300 turns");

  world.step = 320;
  aiChaseSystem(world);
  assertEquals(alerts.length, 2);
});

// Pack courage (safety in numbers) ──────────────────────────────────────────

Deno.test("lone pack creature does not aggro on sight", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  try {
    const world = new World({ seed: 10 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

    // A lone goblin with packSense — no allies nearby.
    const loner = world.create();
    world.add(loner, Position, { x: 8, y: 5 });
    world.add(loner, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
    world.add(loner, Faction, { key: 'enemy' });
    world.add(loner, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
    });

    aiChaseSystem(world);

    const aggro = world.get(loner, AggroState);
    assertEquals(aggro.alertLevel, AGGRO_LEVELS.unaware,
      'lone pack creature should stay unaware when no allies nearby');
    assert(!world.has(loner, MoveIntent),
      'lone pack creature should not move');
  } finally {
    clearAll();
  }
});

Deno.test("pack creature with nearby ally aggros on sight", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  try {
    const world = new World({ seed: 11 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

    // Two goblins near each other — safety in numbers.
    const g1 = world.create();
    world.add(g1, Position, { x: 8, y: 5 });
    world.add(g1, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
    world.add(g1, Faction, { key: 'enemy' });
    world.add(g1, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
    });

    const g2 = world.create();
    world.add(g2, Position, { x: 9, y: 5 });
    world.add(g2, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
    world.add(g2, Faction, { key: 'enemy' });
    world.add(g2, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
    });

    aiChaseSystem(world);

    const a1 = world.get(g1, AggroState);
    assertEquals(a1.alertLevel, AGGRO_LEVELS.hunting,
      'pack creature with ally should aggro to hunting');
  } finally {
    clearAll();
  }
});

Deno.test("already-alerted lone pack creature still chases", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  try {
    const world = new World({ seed: 12 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

    // A lone goblin that is already alerted (e.g. from damage).
    const loner = world.create();
    world.add(loner, Position, { x: 8, y: 5 });
    world.add(loner, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
    world.add(loner, Faction, { key: 'enemy' });
    world.add(loner, AggroState, {
      alertLevel: AGGRO_LEVELS.alerted,
      lastKnownX: 5, lastKnownY: 5, searchTurnsLeft: 10, retreating: false,
    });

    aiChaseSystem(world);

    const aggro = world.get(loner, AggroState);
    assertEquals(aggro.alertLevel, AGGRO_LEVELS.hunting,
      'already-alerted lone creature should escalate to hunting on sight');
    assert(world.has(loner, MoveIntent),
      'already-alerted lone creature should move');
  } finally {
    clearAll();
  }
});

// Ambush ────────────────────────────────────────────────────────────────────

Deno.test("ambusher (floating_eye) holds position when player is > 1 tile away", () => {
  const world = new World({ seed: 6 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const eye = world.create();
  world.add(eye, Position, { x: 10, y: 5 }); // 5 tiles away
  world.add(eye, NamedIdentity, { name: 'Floating Eye', identity: 'floating_eye' });
  world.add(eye, Faction, { key: 'enemy' });
  addHuntingAggro(world, eye, 5, 5);

  aiChaseSystem(world);

  assert(!world.has(eye, MoveIntent), 'floating eye should not move while player is far away');
});

Deno.test("floating_eye uses brain sight range before aggroing", () => {
  const world = new World({ seed: 7 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });

  const eye = world.create();
  world.add(eye, Position, { x: 12, y: 5 }); // 7 tiles away, beyond floating eye visionRange=6
  world.add(eye, NamedIdentity, { name: 'Floating Eye', identity: 'floating_eye' });
  world.add(eye, Faction, { key: 'enemy' });
  world.add(eye, Brain, { intelligence: 2, visionRange: 6 });
  world.add(eye, AggroState, {
    alertLevel: AGGRO_LEVELS.unaware,
    lastKnownX: 0,
    lastKnownY: 0,
    searchTurnsLeft: 0,
    retreating: false,
  });

  aiChaseSystem(world);

  const aggro = world.get(eye, AggroState);
  assertEquals(aggro.alertLevel, AGGRO_LEVELS.unaware,
    'floating eye should stay unaware outside its sight range');
  assertEquals(world.has(eye, MoveIntent), false);
});

// Spider onSeen tests (pre-existing; updated to include AggroState) ──────────

Deno.test("spider onSeen self-throws near player, not on player, and not into walls", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  try {
    setTile(5, 4, TILE_WALL);
    setTile(5, 6, TILE_WALL);

    const world = new World({ seed: 1 });
    world.rand = () => 0.0;
    const thrown = [];
    const bumps = [];
    world.on("item:thrown", (ev) => thrown.push(ev));
    world.on("bump:attack", (ev) => bumps.push(ev));

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: "Hero", identity: "player" });

    const spider = world.create();
    world.add(spider, Position, { x: 9, y: 5 });
    world.add(spider, NamedIdentity, { name: "Spider", identity: "spider" });
    world.add(spider, Faction, { key: "enemy" });
    world.add(spider, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
    });

    // Pack ally so safety-in-numbers allows aggro (already hunting to avoid
    // double-triggering onSeen hooks).
    const ally = world.create();
    world.add(ally, Position, { x: 10, y: 5 });
    world.add(ally, NamedIdentity, { name: "Spider", identity: "spider" });
    world.add(ally, Faction, { key: "enemy" });
    world.add(ally, AggroState, {
      alertLevel: AGGRO_LEVELS.hunting,
      lastKnownX: 5, lastKnownY: 5, searchTurnsLeft: 10, retreating: false,
    });

    aiChaseSystem(world);

    const spiderPos = world.get(spider, Position);
    assert(spiderPos, "spider should still have a position");
    assertEquals(spiderPos.x, 4, "spider should land near player (west tile)");
    assertEquals(spiderPos.y, 5, "spider should land near player (west tile)");
    assert(!(spiderPos.x === 5 && spiderPos.y === 5), "spider should not land on top of player");
    assert(isWalkable(spiderPos.x, spiderPos.y), "spider landing tile should be walkable");

    assertEquals(thrown.length, 1, "onSeen self-throw should emit one throw event");
    assertEquals(thrown[0]?.itemId, spider);
    assertEquals(thrown[0]?.to?.x, 4);
    assertEquals(thrown[0]?.to?.y, 5);

    assertEquals(bumps.length, 1, "landing adjacent should emit a collision-style bump attack");
    assertEquals(bumps[0]?.attacker, spider);
    assertEquals(bumps[0]?.target, player);

    // Second call: spider is now hunting (wasHunting = true) so no re-trigger.
    aiChaseSystem(world);
    assertEquals(thrown.length, 1, "onSeen should only trigger once while target remains seen");
  } finally {
    clearAll();
  }
});

Deno.test("spider onSeen self-throw is cooldown-gated for 3 turns", () => {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
  try {
    const world = new World({ seed: 1 });
    world.rand = () => 0.0;
    const thrown = [];
    world.on("item:thrown", (ev) => thrown.push(ev));

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: "Hero", identity: "player" });

    const spider = world.create();
    world.add(spider, Position, { x: 9, y: 5 });
    world.add(spider, NamedIdentity, { name: "Spider", identity: "spider" });
    world.add(spider, Faction, { key: "enemy" });
    world.add(spider, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
    });

    // Pack ally so safety-in-numbers allows aggro (already hunting to avoid
    // double-triggering onSeen hooks).
    const ally = world.create();
    world.add(ally, Position, { x: 10, y: 5 });
    world.add(ally, NamedIdentity, { name: "Spider", identity: "spider" });
    world.add(ally, Faction, { key: "enemy" });
    world.add(ally, AggroState, {
      alertLevel: AGGRO_LEVELS.hunting,
      lastKnownX: 5, lastKnownY: 5, searchTurnsLeft: 10, retreating: false,
    });

    world.step = 0;
    proposeChase(world);
    assertEquals(thrown.length, 1, "spider should jump on first seen trigger");

    // Block LOS so spider loses track and its alertLevel decays.
    world.set(spider, Position, { x: 9, y: 5 });
    try { world.remove(spider, MoveIntent); } catch {}
    setTile(7, 5, TILE_WALL);

    world.step = 1;
    proposeChase(world);
    assertEquals(thrown.length, 1, "losing LOS should not trigger self-throw");

    // Restore LOS — spider is alerted (not unaware), so !wasHunting = false, no re-trigger.
    world.set(spider, Position, { x: 9, y: 5 });
    try { world.remove(spider, MoveIntent); } catch {}
    setTile(7, 5, TILE_FLOOR);

    world.step = 2;
    proposeChase(world);
    assertEquals(thrown.length, 1, "cooldown should block re-jump before 3 turns");

    // Break LOS again to reset state back toward unaware.
    world.set(spider, Position, { x: 9, y: 5 });
    try { world.remove(spider, MoveIntent); } catch {}
    setTile(7, 5, TILE_WALL);

    world.step = 3;
    proposeChase(world);
    assertEquals(thrown.length, 1, "second LOS break should only reset seen state");

    // Restore LOS at step 4, cooldown (3 turns from step 0) has expired.
    // Force spider back to unaware so !wasHunting fires again.
    world.set(spider, Position, { x: 9, y: 5 });
    world.set(spider, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0, lastKnownY: 0, searchTurnsLeft: 0, retreating: false,
    });
    try { world.remove(spider, MoveIntent); } catch {}
    setTile(7, 5, TILE_FLOOR);

    world.step = 4;
    aiChaseSystem(world);
    assertEquals(thrown.length, 2, "spider should jump again after cooldown window");
  } finally {
    clearAll();
  }
});

Deno.test("sleeping enemy does not acquire LOS aggro or chase movement", () => {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  try {
    const world = new World({ seed: 0x51EE9 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: "Hero", identity: "player" });

    const enemy = world.create();
    world.add(enemy, Position, { x: 8, y: 5 });
    world.add(enemy, NamedIdentity, { name: "Warlock", identity: "warlock" });
    world.add(enemy, Faction, { key: "enemy" });
    world.add(enemy, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0,
      lastKnownY: 0,
      searchTurnsLeft: 0,
      retreating: false,
    });
    putActorToSleep(world, enemy, { suppressEvent: true });

    aiChaseSystem(world);

    const aggro = world.get(enemy, AggroState);
    assertEquals(aggro.alertLevel, AGGRO_LEVELS.unaware);
    assertEquals(world.has(enemy, MoveIntent), false);
  } finally {
    clearAll();
  }
});

Deno.test("sleeping witnesses ignore stealth offense", () => {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  try {
    const world = new World({ seed: 0x57EA17 });
    installAggroFromStealthOffenseListener(world);

    const attacker = world.create();
    world.add(attacker, Player);
    world.add(attacker, Position, { x: 5, y: 5 });

    const witness = world.create();
    world.add(witness, Position, { x: 6, y: 5 });
    world.add(witness, NamedIdentity, { name: "Goblin", identity: "goblin" });
    world.add(witness, Faction, { key: "enemy" });
    world.add(witness, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0,
      lastKnownY: 0,
      searchTurnsLeft: 0,
      retreating: false,
    });
    putActorToSleep(world, witness, { suppressEvent: true });

    world.emit("stealth:offense", { entityId: attacker, at: { x: 5, y: 5 } });

    const aggro = world.get(witness, AggroState);
    assertEquals(aggro.alertLevel, AGGRO_LEVELS.unaware);
    assertEquals(aggro.lastKnownX, 0);
    assertEquals(aggro.lastKnownY, 0);
  } finally {
    clearAll();
  }
});

Deno.test("pack alerting skips sleeping allies", () => {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  try {
    const world = new World({ seed: 0xA11E7 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 5, y: 5 });
    world.add(player, NamedIdentity, { name: "Hero", identity: "player" });

    const scout = world.create();
    world.add(scout, Position, { x: 8, y: 5 });
    world.add(scout, NamedIdentity, { name: "Goblin", identity: "goblin" });
    world.add(scout, Faction, { key: "enemy" });
    world.add(scout, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0,
      lastKnownY: 0,
      searchTurnsLeft: 0,
      retreating: false,
    });

    const ally = world.create();
    world.add(ally, Position, { x: 9, y: 5 });
    world.add(ally, NamedIdentity, { name: "Goblin", identity: "goblin" });
    world.add(ally, Faction, { key: "enemy" });
    world.add(ally, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0,
      lastKnownY: 0,
      searchTurnsLeft: 0,
      retreating: false,
    });
    putActorToSleep(world, ally, { suppressEvent: true });

    aiChaseSystem(world);

    assertEquals(world.get(scout, AggroState).alertLevel, AGGRO_LEVELS.unaware);
    assertEquals(world.get(ally, AggroState).alertLevel, AGGRO_LEVELS.unaware);
  } finally {
    clearAll();
  }
});
