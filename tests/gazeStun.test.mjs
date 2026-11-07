import "./helpers/installContentMonsters.mjs";
// Floating eye gaze: channeled beam — 8 turns LOS → 3-turn stun + 1 mindwipe stack.
// Gaze is now a proper channeled spell (gaze_beam) with breakOnNoLos/breakOnMove.

import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { Player } from "../src/rules/components/Player.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Faction } from "../src/rules/components/Faction.js";
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_HUNTING_GRACE } from "../src/rules/components/AggroState.js";
import { Speed } from "../src/rules/components/Speed.js";
import { Brain } from "../src/rules/components/Brain.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Channeling } from "../src/rules/components/Channeling.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";
import { aiChaseSystem } from "../src/rules/systems/aiChaseSystem.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";
import { castSpellSystem } from "../src/rules/systems/castSpellSystem.js";
import { clearAll, loadChunk, setTile } from "../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR, TILE_WALL } from "../src/rules/environment/dungeon/constants.js";

function makeWorld(seed = 1) {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  return new World({ seed });
}

function placePlayer(world, x, y) {
  const id = world.create();
  world.add(id, Player);
  world.add(id, Position, { x, y });
  world.add(id, Vitality, { maxHp: 30, hp: 30 });
  world.add(id, ActiveEffects, { effects: [] });
  return id;
}

function placeEye(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: "Floating Eye", identity: "floating_eye" });
  world.add(id, Faction, { key: "enemy" });
  world.add(id, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: x,
    lastKnownY: y,
    searchTurnsLeft: SEARCH_TURNS_HUNTING_GRACE,
    retreating: false,
  });
  // Speed actEvery=1 to simplify testing (fires every tick)
  world.add(id, Speed, { actEvery: 1 });
  world.add(id, Brain, { intelligence: 2, visionRange: 6 });
  return id;
}

function gazeTurn(world, eye) {
  world.step++;
  aiChaseSystem(world);
  channelingSystem(world);
  castSpellSystem(world);
  // Clean up intents so they don't accumulate
  if (world.has(eye, MoveIntent)) world.remove(eye, MoveIntent);
  if (world.has(eye, CastSpellIntent)) world.remove(eye, CastSpellIntent);
}

function getEffect(world, entityId, key) {
  return world.get(entityId, ActiveEffects)?.effects?.find((effect) => effect.key === key) ?? null;
}

Deno.test("floating_eye: 8 turns in gaze applies stun and one mindwipe stack", () => {
  const world = makeWorld(1);
  const player = placePlayer(world, 5, 5);
  const eye = placeEye(world, 8, 5);

  for (let i = 0; i < 8; i++) gazeTurn(world, eye);

  const gaze = getEffect(world, player, "gaze_beam");
  assert(gaze && gaze.turnsLeft >= 4, `expected 3-turn gaze effect after 8 turns, got ${JSON.stringify(world.get(player, ActiveEffects)?.effects)}`);
  assertEquals(gaze.stacks, 1);
});

Deno.test("floating_eye: 7 turns in gaze is not enough", () => {
  const world = makeWorld(2);
  const player = placePlayer(world, 5, 5);
  const eye = placeEye(world, 8, 5);

  for (let i = 0; i < 7; i++) gazeTurn(world, eye);

  assertEquals(getEffect(world, player, "gaze_beam"), null);
  assertEquals(getEffect(world, player, "mindwipe"), null);
  // Eye should have an active channel
  assert(world.has(eye, Channeling), "eye should be channeling gaze_beam after 7 turns");
});

Deno.test("floating_eye: losing LOS resets the gaze charge", () => {
  const world = makeWorld(3);
  const player = placePlayer(world, 5, 5);
  const eye = placeEye(world, 8, 5);

  // Build up 5 turns of charge
  for (let i = 0; i < 5; i++) gazeTurn(world, eye);
  assert(world.has(eye, Channeling), "eye should be channeling after 5 turns");

  // Block LOS — channelingSystem should cancel the channel (breakOnNoLos)
  setTile(7, 5, TILE_WALL);
  gazeTurn(world, eye);
  assert(!world.has(eye, Channeling), "channel should be cancelled after LOS break");

  // Restore LOS and continue — needs full 8 turns from scratch
  setTile(7, 5, TILE_FLOOR);
  for (let i = 0; i < 7; i++) gazeTurn(world, eye);

  assertEquals(getEffect(world, player, "gaze_beam"), null, "7 turns after LOS break should not apply gaze effect");
  assertEquals(getEffect(world, player, "mindwipe"), null);
});

Deno.test("floating_eye: staying in gaze for 16 turns retriggers and adds a second mindwipe stack", () => {
  const world = makeWorld(4);
  const player = placePlayer(world, 5, 5);
  const eye = placeEye(world, 8, 5);

  for (let i = 0; i < 16; i++) gazeTurn(world, eye);

  const gaze = getEffect(world, player, "gaze_beam");
  assert(gaze && gaze.turnsLeft >= 4, `expected refreshed gaze effect after 16 turns, got ${JSON.stringify(world.get(player, ActiveEffects)?.effects)}`);
  assertEquals(gaze.stacks, 2);
});

Deno.test("floating_eye: stunning the eye interrupts the gaze channel", () => {
  const world = makeWorld(5);
  const player = placePlayer(world, 5, 5);
  const eye = placeEye(world, 8, 5);

  // Build up 5 turns of charge
  for (let i = 0; i < 5; i++) gazeTurn(world, eye);
  assert(world.has(eye, Channeling), "eye should be channeling after 5 turns");

  // Stun the eye
  let ae = world.get(eye, ActiveEffects);
  if (!ae) {
    world.add(eye, ActiveEffects, { effects: [] });
    ae = world.get(eye, ActiveEffects);
  }
  ae.effects.push({ key: 'stun', turnsLeft: 3, potency: 1, stacks: 1 });

  // Next tick: channelingSystem should detect stun and cancel channel
  gazeTurn(world, eye);
  assert(!world.has(eye, Channeling), "stun should cancel the gaze channel");

  // Player should NOT be stunned by gaze (only the eye is stunned)
  assertEquals(getEffect(world, player, "gaze_beam"), null, "player should not be affected — gaze was interrupted");
});
