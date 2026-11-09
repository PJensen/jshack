import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { FearSpellCast } from "../src/events/FearSpellCast.js";
import { Position } from "../src/rules/components/Position.js";
import { Player } from "../src/rules/components/Player.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_HUNTING_GRACE } from "../src/rules/components/AggroState.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { aiChaseSystem } from "./helpers/runChaseTactics.mjs";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { clearAll as clearTileMap, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";

const SPELL = { id: "fear", name: "Fear", manaCost: 6, range: 8, script: "fear" };

function loadFlatFloor() {
  clearTileMap();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
}

function makeEntity(world, x, y, hp, faction, identity = "") {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Vitality, { maxHp: hp, hp });
  if (faction) world.add(id, Faction, { key: faction });
  if (identity) world.add(id, NamedIdentity, { name: identity, identity });
  return id;
}

Deno.test("fear: applies timed fear effect to targeted hostile", () => {
  loadFlatFloor();
  const world = new World({ seed: 21 });
  const events = [];
  world.on(FearSpellCast, (event) => events.push(event));

  const caster = makeEntity(world, 2, 2, 20, "player", "player");
  const target = makeEntity(world, 6, 2, 20, "enemy", "goblin");

  runSpellScript(world, caster, SPELL, { targetId: target });

  const ae = world.get(target, ActiveEffects);
  const fear = ae?.effects?.find((effect) => effect.key === "fear");
  assert(fear, "target should have fear effect");
  assert(fear.turnsLeft >= 4, "fear should last at least the base duration");
  assertEquals(fear.sourceId, caster);
  assertEquals(events.length, 1);
  assertEquals(events[0].targetId, target);
  assertEquals(events[0].fizzle, false);
  assertEquals(events[0].missed, false);
  assertEquals(events[0].projectileDelay, 0.4);
});

Deno.test("aiChaseSystem: feared monster flees away from target", () => {
  const world = new World({ seed: 22 });

  const player = world.create();
  world.add(player, Player);
  world.add(player, Position, { x: 5, y: 5 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });

  const goblin = world.create();
  world.add(goblin, Position, { x: 8, y: 5 });
  world.add(goblin, NamedIdentity, { name: "Goblin", identity: "goblin" });
  world.add(goblin, Faction, { key: "enemy" });
  world.add(goblin, ActiveEffects, {
    effects: [{ key: "fear", turnsLeft: 4, potency: 1, stacks: 1, sourceId: player }],
  });
  world.add(goblin, AggroState, {
    alertLevel: AGGRO_LEVELS.hunting,
    lastKnownX: 5,
    lastKnownY: 5,
    searchTurnsLeft: SEARCH_TURNS_HUNTING_GRACE,
    retreating: false,
  });

  aiChaseSystem(world);

  const intent = world.get(goblin, MoveIntent);
  assert(intent, "feared monster should get a flee MoveIntent");
  assertEquals(intent.dx, 1);
  assertEquals(intent.dy, 0);
});
