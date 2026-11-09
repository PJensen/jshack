import { assert, assertEquals } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { Position } from '../src/rules/components/Position.js';
import { Player } from '../src/rules/components/Player.js';
import { NamedIdentity } from '../src/rules/components/NamedIdentity.js';
import { Faction } from '../src/rules/components/Faction.js';
import { Equipment } from '../src/rules/components/Equipment.js';
import { MoveIntent } from '../src/rules/components/Intents/MoveIntent.js';
import { Vitality } from '../src/rules/components/Vitality.js';
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_HUNTING_GRACE } from '../src/rules/components/AggroState.js';
import { ItemInfo } from '../src/rules/components/ItemInfo.js';
import { aiChaseSystem } from "./helpers/runChaseTactics.mjs";
import { areFactionsHostile } from '../src/rules/utils/factionHostility.js';
import { hasEquippedTag } from '../src/rules/utils/equipTags.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function addHuntingAggro(world, id, playerX, playerY) {
  world.add(id, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: playerX,
    lastKnownY: playerY,
    searchTurnsLeft: SEARCH_TURNS_HUNTING_GRACE,
    retreating: false,
  });
}

function makePlayer(world, x, y) {
  const id = world.create();
  world.add(id, Player);
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: 'Hero', identity: 'player' });
  world.add(id, Equipment, {});
  return id;
}

function equipConflictRing(world, playerId) {
  const ringId = world.create();
  world.add(ringId, NamedIdentity, { name: 'Ring of Conflict', identity: 'ring_conflict' });
  world.add(ringId, ItemInfo, { type: 'equip', slot: 'ring', tags: ['conflict'] });
  const eq = world.get(playerId, Equipment);
  eq.ring1 = ringId;
  return ringId;
}

function makeEnemy(world, x, y, identity, playerX, playerY) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: identity, identity });
  world.add(id, Faction, { key: 'enemy' });
  world.add(id, Vitality, { hp: 10, maxHp: 10 });
  addHuntingAggro(world, id, playerX, playerY);
  return id;
}

// ── hasEquippedTag utility ───────────────────────────────────────────────────

Deno.test("hasEquippedTag returns true when ring with tag is equipped", () => {
  const world = new World({ seed: 1 });
  const player = makePlayer(world, 5, 5);
  equipConflictRing(world, player);
  assert(hasEquippedTag(world, player, "conflict"), "should detect conflict tag");
});

Deno.test("hasEquippedTag returns false when no tagged item equipped", () => {
  const world = new World({ seed: 1 });
  const player = makePlayer(world, 5, 5);
  assert(!hasEquippedTag(world, player, "conflict"), "no ring = no conflict");
});

// ── Faction hostility ───────────────────────────────────────────────────────

Deno.test("enemy faction is not self-hostile without an explicit conflict source", () => {
  assert(!areFactionsHostile("enemy", "enemy"),
    "enemy-enemy should not create ambient infighting");
});

Deno.test("player faction is still not self-hostile", () => {
  assert(!areFactionsHostile("player", "player"),
    "player-player should not be hostile");
});

Deno.test("pet faction is still not self-hostile", () => {
  assert(!areFactionsHostile("pet", "pet"),
    "pet-pet should not be hostile");
});

// ── AI targeting with Ring of Conflict ──────────────────────────────────────

Deno.test("conflict ring: enemy chases nearest rival instead of player", () => {
  const world = new World({ seed: 42 });

  // Player at (5,5) with conflict ring
  const playerId = makePlayer(world, 5, 5);
  equipConflictRing(world, playerId);

  // Enemy A at (8,5) — hunting player at (5,5)
  const enemyA = makeEnemy(world, 8, 5, 'goblin', 5, 5);

  // Enemy B at (10,5) — another enemy, closer rival for A than the player
  const enemyB = makeEnemy(world, 10, 5, 'orc', 5, 5);

  aiChaseSystem(world);

  const intentA = world.get(enemyA, MoveIntent);
  assert(intentA, 'enemyA should have a MoveIntent');
  // Enemy A at (8,5), rival B at (10,5) → should chase east (+1, 0)
  assertEquals(intentA.dx, 1, 'enemyA should chase toward rival B (east)');
  assertEquals(intentA.dy, 0, 'enemyA should not move vertically');
});

Deno.test("conflict ring: enemy falls back to player when no rival in sight", () => {
  const world = new World({ seed: 43 });

  // Player at (5,5) with conflict ring
  const playerId = makePlayer(world, 5, 5);
  equipConflictRing(world, playerId);

  // Single enemy at (8,5) — no other enemies nearby
  const enemyA = makeEnemy(world, 8, 5, 'goblin', 5, 5);

  aiChaseSystem(world);

  const intent = world.get(enemyA, MoveIntent);
  assert(intent, 'enemy should have a MoveIntent');
  // No rival → falls back to chasing player at (5,5) → west (-1, 0)
  assertEquals(intent.dx, -1, 'lone enemy should chase player (west)');
  assertEquals(intent.dy, 0);
});

Deno.test("no conflict ring: enemies chase player normally", () => {
  const world = new World({ seed: 44 });

  // Player at (5,5) without conflict ring
  const playerId = makePlayer(world, 5, 5);

  // Two enemies
  const enemyA = makeEnemy(world, 8, 5, 'goblin', 5, 5);
  const enemyB = makeEnemy(world, 10, 5, 'orc', 5, 5);

  aiChaseSystem(world);

  const intentA = world.get(enemyA, MoveIntent);
  assert(intentA, 'enemyA should have MoveIntent');
  // Should chase player at (5,5) → west (-1, 0)
  assertEquals(intentA.dx, -1, 'enemyA should chase player (west) without conflict ring');
  assertEquals(intentA.dy, 0);
});

Deno.test("conflict ring: enemy targets closest rival, not farthest", () => {
  const world = new World({ seed: 45 });

  const playerId = makePlayer(world, 0, 5);
  equipConflictRing(world, playerId);

  // Enemy A at (5,5)
  const enemyA = makeEnemy(world, 5, 5, 'goblin', 0, 5);

  // Enemy B at (9,5) — far rival (dist 4)
  const enemyB = makeEnemy(world, 9, 5, 'orc', 0, 5);

  // Enemy C at (3,5) — close rival (dist 2)
  const enemyC = makeEnemy(world, 3, 5, 'rat', 0, 5);

  aiChaseSystem(world);

  const intentA = world.get(enemyA, MoveIntent);
  assert(intentA, 'enemyA should have MoveIntent');
  // Closest rival is C at (3,5) → west (-1, 0)
  assertEquals(intentA.dx, -1, 'enemyA should chase nearest rival C (west)');
  assertEquals(intentA.dy, 0);
});

Deno.test("conflict ring unequipped: enemies revert to chasing player", () => {
  const world = new World({ seed: 46 });

  // Player at (5,5) — ring equipped then removed
  const playerId = makePlayer(world, 5, 5);
  const ringId = equipConflictRing(world, playerId);

  const enemyA = makeEnemy(world, 8, 5, 'goblin', 5, 5);
  const enemyB = makeEnemy(world, 10, 5, 'orc', 5, 5);

  // Remove the ring
  const eq = world.get(playerId, Equipment);
  eq.ring1 = 0;

  aiChaseSystem(world);

  const intent = world.get(enemyA, MoveIntent);
  assert(intent, 'enemyA should have MoveIntent');
  assertEquals(intent.dx, -1, 'enemyA should revert to chasing player (west)');
  assertEquals(intent.dy, 0);
});
