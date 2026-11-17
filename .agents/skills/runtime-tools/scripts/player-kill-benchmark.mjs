import "../../../../src/content/items/index.js";
import "../../../../src/content/monsters/index.js";
import "../../../../src/content/interactables/index.js";
import { installContent } from "../../../../src/content/install.js";
import { World } from "../../../../src/lib/ecs-js/index.js";
import { configureWorld } from "../../../../src/main/scheduler.js";
import { createPlayer } from "../../../../src/rules/archetypes/Player.js";
import { spawnMonsterEntity } from "../../../../src/rules/utils/spawnMonsterEntity.js";
import { getMonster, resolveMonsterMaxHp } from "../../../../src/rules/data/monsters.js";
import { AggroState, AGGRO_LEVELS } from "../../../../src/rules/components/AggroState.js";
import { Brain } from "../../../../src/rules/components/Brain.js";
import { Position } from "../../../../src/rules/components/Position.js";
import { TreasureGuardian } from "../../../../src/rules/components/TreasureGuardian.js";
import { Vitality } from "../../../../src/rules/components/Vitality.js";
import { WaitIntent } from "../../../../src/rules/components/Intents/WaitIntent.js";
import { clearAll, loadChunk } from "../../../../src/rules/environment/dungeon/tileMap.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../../../../src/rules/environment/dungeon/constants.js";

installContent();

const DEFAULT_MONSTERS = [
  "rat", "spider", "snake", "cave_bear", "goblin", "orc", "troll", "ogre",
  "dragon_whelp", "dragon", "skeleton", "wight", "wraith", "demon", "lich",
];

const config = parseArgs(Deno.args);

function parseArgs(args) {
  const out = {
    runs: 20,
    seedStart: 1,
    maxTurns: 300,
    playerHp: 20,
    depth: 1,
    raw: false,
    monsters: DEFAULT_MONSTERS,
  };
  for (const arg of args) {
    const [key, value] = arg.split("=", 2);
    if (key === "--runs") out.runs = Math.max(1, Number(value) | 0);
    else if (key === "--seed-start") out.seedStart = Number(value) >>> 0;
    else if (key === "--max-turns") out.maxTurns = Math.max(1, Number(value) | 0);
    else if (key === "--player-hp") out.playerHp = Math.max(1, Number(value) | 0);
    else if (key === "--depth") out.depth = Math.max(1, Number(value) | 0);
    else if (key === "--monsters") out.monsters = value.split(",").map((id) => id.trim()).filter(Boolean);
    else if (arg === "--raw") out.raw = true;
  }
  return out;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * (p / 100);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function round(value) {
  return value == null ? null : Number(value.toFixed(2));
}

function loadFlatRoom() {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
}

function monsterParams(def, id, depth) {
  return {
    x: 11,
    y: 10,
    name: def.name,
    identity: id,
    sleep: false,
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

function runOnce(id, seed) {
  const def = getMonster(id);
  if (!def) throw new Error(`unknown monster: ${id}`);
  loadFlatRoom();

  const world = new World({ seed });
  configureWorld(world);
  const playerId = createPlayer(world, {
    x: 10,
    y: 10,
    name: "Passive Probe",
    maxHp: config.playerHp,
  });
  const monsterId = spawnMonsterEntity(world, monsterParams(def, id, config.depth));

  const aggro = world.get(monsterId, AggroState);
  world.set(monsterId, AggroState, {
    ...aggro,
    alertLevel: AGGRO_LEVELS.hunting,
    targetId: playerId,
    lastKnownX: 10,
    lastKnownY: 10,
  });
  const brain = world.get(monsterId, Brain);
  world.set(monsterId, Brain, { ...brain, intelligence: 12, visionRange: 12 });
  const guardian = world.get(monsterId, TreasureGuardian);
  if (guardian) world.set(monsterId, TreasureGuardian, { ...guardian, disturbed: true, disturbedBy: playerId });

  let hits = 0;
  let totalDamage = 0;
  world.on("damaged", (event) => {
    if ((Number(event?.target || 0) | 0) !== playerId) return;
    hits++;
    totalDamage += Number(event?.amount || 0);
  });

  let killTurn = null;
  for (let turn = 1; turn <= config.maxTurns; turn++) {
    world.add(playerId, WaitIntent, {});
    world.tick(1);
    if ((world.get(playerId, Vitality)?.hp ?? 0) <= 0) {
      killTurn = turn;
      break;
    }
  }

  return {
    id,
    name: def.name,
    seed: seed >>> 0,
    killTurn,
    finalHp: world.get(playerId, Vitality)?.hp ?? 0,
    hits,
    totalDamage: round(totalDamage),
  };
}

function summarize(id, results) {
  const killed = results.filter((result) => result.killTurn != null);
  const turns = killed.map((result) => result.killTurn);
  return {
    id,
    name: results[0]?.name || id,
    runs: results.length,
    kills: killed.length,
    killRate: round(killed.length / Math.max(1, results.length)),
    minTurns: turns.length ? Math.min(...turns) : null,
    p25Turns: round(percentile(turns, 25)),
    medianTurns: round(percentile(turns, 50)),
    p75Turns: round(percentile(turns, 75)),
    maxTurns: turns.length ? Math.max(...turns) : null,
    unfinished: results.length - killed.length,
  };
}

const summaries = [];
const raw = [];
for (const id of config.monsters) {
  const results = [];
  for (let run = 0; run < config.runs; run++) {
    const result = runOnce(id, (config.seedStart + run) >>> 0);
    results.push(result);
    raw.push(result);
  }
  summaries.push(summarize(id, results));
}

console.log(JSON.stringify({ config, summaries, ...(config.raw ? { raw } : {}) }, null, 2));
