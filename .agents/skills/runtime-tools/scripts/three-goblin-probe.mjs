import "../../../../src/content/items/index.js";
import "../../../../src/content/monsters/index.js";
import "../../../../src/content/interactables/index.js";
import { installContent } from "../../../../src/content/install.js";
import { World } from "../../../../src/lib/ecs-js/index.js";
import { configureWorld } from "../../../../src/main/scheduler.js";
import { createPlayer } from "../../../../src/rules/archetypes/Player.js";
import { spawnMonsterEntity } from "../../../../src/rules/utils/spawnMonsterEntity.js";
import { createItemById } from "../../../../src/rules/utils/itemFactory.js";
import { getMonster, resolveMonsterMaxHp } from "../../../../src/rules/data/monsters.js";
import { Brain } from "../../../../src/rules/components/Brain.js";
import { AggroState, AGGRO_LEVELS } from "../../../../src/rules/components/AggroState.js";
import { Equipment } from "../../../../src/rules/components/Equipment.js";
import { Position } from "../../../../src/rules/components/Position.js";
import { Vitality } from "../../../../src/rules/components/Vitality.js";
import { Faction } from "../../../../src/rules/components/Faction.js";
import { MoveIntent } from "../../../../src/rules/components/Intents/MoveIntent.js";
import { WaitIntent } from "../../../../src/rules/components/Intents/WaitIntent.js";
import { AttackIntent } from "../../../../src/rules/components/Intents/AttackIntent.js";
import { CastSpellIntent } from "../../../../src/rules/components/Intents/CastSpellIntent.js";
import { RangedAttackIntent } from "../../../../src/rules/components/Intents/RangedAttackIntent.js";
import { clearAll, loadChunk } from "../../../../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR, TILE_WALL } from "../../../../src/rules/environment/dungeon/constants.js";

installContent();

const SEED = 186;
const MAX_TURNS = 32;
const ROOM_ORIGIN = { x: 0, y: 0 };
const INCLUDE_TRACE = Deno.args.includes("--trace");
const SCENARIO_FILTER = Deno.args.find((arg) => arg.startsWith("--scenario="))?.slice(11) || "";

function loadFlatRoom({ corridor = false } = {}) {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  if (corridor) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      if (y === 10) continue;
      tiles[y * CHUNK_SIZE + 11] = TILE_WALL;
      tiles[y * CHUNK_SIZE + 13] = TILE_WALL;
    }
  }
  loadChunk(ROOM_ORIGIN.x, ROOM_ORIGIN.y, tiles);
}

function monsterParams(identity, depth = 2) {
  const def = getMonster(identity);
  if (!def) throw new Error(`unknown monster: ${identity}`);
  return {
    name: def.name,
    identity: def.id,
    maxHp: resolveMonsterMaxHp(def, depth),
    faction: "enemy",
    accuracyDerived: def.attack || 0,
    damagePowerDerived: def.attack || 0,
    evadeDerived: def.defense || 0,
    naturalDamageDice: def.damageDice || "1d2",
    sizeClass: def.sizeClass,
    massKg: def.massKg || 80,
    resistances: def.resistances || {},
    speed: def.speed || 1,
    learnedSpellIds: def.learnedSpellIds || [],
  };
}

function nearestGoblin(world, playerId, goblins) {
  const player = world.get(playerId, Position);
  let best = 0;
  let bestDistance = Infinity;
  for (const id of goblins) {
    const vit = world.get(id, Vitality);
    const pos = world.get(id, Position);
    if (!world.isAlive(id) || !vit || vit.hp <= 0 || !pos) continue;
    const distance = Math.max(Math.abs(pos.x - player.x), Math.abs(pos.y - player.y));
    if (distance < bestDistance) {
      best = id;
      bestDistance = distance;
    }
  }
  return best;
}

function queueAdjacentAttack(world, playerId, targetId) {
  const player = world.get(playerId, Position);
  const target = world.get(targetId, Position);
  if (!player || !target) return false;
  const distance = Math.max(Math.abs(target.x - player.x), Math.abs(target.y - player.y));
  if (distance > 1) return false;
  world.add(playerId, AttackIntent, { targetId });
  return true;
}

function queuePlayerAction(world, playerId, goblins, strategy, turn) {
  const player = world.get(playerId, Position);
  const targetId = nearestGoblin(world, playerId, goblins);
  const target = targetId ? world.get(targetId, Position) : null;

  if (strategy === "standing") {
    if (!queueAdjacentAttack(world, playerId, targetId)) world.add(playerId, WaitIntent, {});
    return;
  }

  if (strategy === "ranged") {
    if (targetId && target) {
      world.add(playerId, RangedAttackIntent, {
        targetId,
        toX: target.x,
        toY: target.y,
      });
    } else {
      world.add(playerId, WaitIntent, {});
    }
    return;
  }

  if (strategy === "disable") {
    if (targetId && target && turn % 4 === 1) {
      world.add(playerId, CastSpellIntent, {
        spellId: "entangle",
        targetId,
        x: target.x,
        y: target.y,
      });
      return;
    }
  }

  if (strategy === "retreat") {
    world.add(playerId, MoveIntent, { dx: -1, dy: 0 });
    return;
  }

  if (targetId && queueAdjacentAttack(world, playerId, targetId)) return;
  world.add(playerId, MoveIntent, { dx: 1, dy: 0 });
}

function snapshot(world, playerId, goblins, events = []) {
  const playerPos = world.get(playerId, Position);
  const playerVit = world.get(playerId, Vitality);
  return {
    step: world.step | 0,
    player: {
      x: playerPos?.x ?? null,
      y: playerPos?.y ?? null,
      hp: playerVit?.hp ?? 0,
    },
    goblins: goblins.map((id) => {
      const pos = world.get(id, Position);
      const vit = world.get(id, Vitality);
      return {
        id,
        alive: world.isAlive(id) && (vit?.hp || 0) > 0,
        x: pos?.x ?? null,
        y: pos?.y ?? null,
        hp: vit?.hp ?? 0,
        aggro: world.get(id, AggroState)?.alertLevel || "none",
        targetId: world.get(id, AggroState)?.targetId || 0,
      };
    }),
    events,
  };
}

function runScenario({ name, strategy, policy, corridor = false }) {
  loadFlatRoom({ corridor });
  const world = new World({ seed: SEED });
  configureWorld(world);
  world.step = 0;

  const playerId = createPlayer(world, {
    x: strategy === "retreat" ? 12 : 10,
    y: 10,
    name: "Probe",
    identity: "player_probe",
    maxHp: 33,
    maxStamina: 130,
  });
  const playerBrain = world.get(playerId, Brain);
  world.set(playerId, Brain, {
    ...playerBrain,
    intelligence: 12,
    learnedSpellIds: ["entangle"],
    visionRange: 12,
  });

  const eq = world.get(playerId, Equipment);
  if (strategy === "ranged") {
    eq.ranged = createItemById(world, "bow_short");
    eq.ammo = createItemById(world, "ammo_arrows", { count: 40 });
  } else {
    eq.weapon = createItemById(world, "axe_heavy");
  }

  const goblins = [];
  for (const [x, y] of [[15, 9], [16, 10], [15, 11]]) {
    const id = spawnMonsterEntity(world, { ...monsterParams("goblin"), x, y });
    const aggro = world.get(id, AggroState);
    world.set(id, AggroState, {
      ...aggro,
      alertLevel: AGGRO_LEVELS.hunting,
      lastKnownX: 10,
      lastKnownY: 10,
      targetId: playerId,
    });
    const brain = world.get(id, Brain);
    world.set(id, Brain, {
      ...brain,
      intelligence: policy ? 8 : 4,
      visionRange: 12,
    });
    goblins.push(id);
  }

  const events = [];
  world.on("damaged", (event) => {
    const target = Number(event?.target || 0) | 0;
    if (target === playerId || goblins.includes(target)) {
      events.push({ type: "damaged", target, amount: Number(event?.amount || 0) });
    }
  });

  const trace = [];
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    events.length = 0;
    queuePlayerAction(world, playerId, goblins, strategy, turn);
    world.tick(1);
    trace.push(snapshot(world, playerId, goblins, [...events]));
    const playerVit = world.get(playerId, Vitality);
    if (!playerVit || playerVit.hp <= 0) break;
    if (trace.at(-1).goblins.every((g) => !g.alive)) break;
  }

  return {
    name,
    strategy,
    policy,
    corridor,
    result: trace.at(-1),
    trace,
  };
}

const scenarios = [
  { name: "chase only", strategy: "chase", policy: false },
  { name: "chase plus policy", strategy: "chase", policy: true },
  { name: "standing still", strategy: "standing", policy: false },
  { name: "retreating into corridor", strategy: "retreat", policy: true, corridor: true },
  { name: "disabling option", strategy: "disable", policy: true },
  { name: "ranged option", strategy: "ranged", policy: false },
];

for (const scenario of scenarios) {
  if (SCENARIO_FILTER && scenario.name !== SCENARIO_FILTER) continue;
  const result = runScenario(scenario);
  const final = result.result;
  const report = {
    name: result.name,
    strategy: result.strategy,
    policy: result.policy,
    corridor: result.corridor,
    turns: result.trace.length,
    player: final.player,
    goblinsAlive: final.goblins.filter((g) => g.alive).length,
    goblinHp: final.goblins.map((g) => g.hp),
    goblinPositions: final.goblins.map((g) => [g.x, g.y]),
  };
  if (INCLUDE_TRACE) report.trace = result.trace;
  console.log(JSON.stringify(report));
}
