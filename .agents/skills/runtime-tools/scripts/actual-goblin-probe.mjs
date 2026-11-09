import "../../../../src/content/items/index.js";
import "../../../../src/content/monsters/index.js";
import "../../../../src/content/interactables/index.js";
import { installContent } from "../../../../src/content/install.js";
import { createGameRuntime } from "../../../../src/main/runtime/gameRuntime.js";
import { spawnMonsterEntity } from "../../../../src/rules/utils/spawnMonsterEntity.js";
import { getMonster, resolveMonsterMaxHp } from "../../../../src/rules/data/monsters.js";
import { AggroState } from "../../../../src/rules/components/AggroState.js";
import { Faction } from "../../../../src/rules/components/Faction.js";
import { Position } from "../../../../src/rules/components/Position.js";
import { Vitality } from "../../../../src/rules/components/Vitality.js";
import { MoveIntent } from "../../../../src/rules/components/Intents/MoveIntent.js";
import { Speed } from "../../../../src/rules/components/Speed.js";
import { buildBlocksVisionMap, blockedCallback } from "../../../../src/rules/utils/vision.js";
import { rebuildSpatialIndex } from "../../../../src/rules/utils/spatialIndex.js";
import { hasLOS } from "../../../../src/shared/math/gridLOS.js";
import { isWalkable } from "../../../../src/rules/environment/dungeon/tileMap.js";
import { findNextCardinalStep } from "../../../../src/rules/utils/gridPathfind.js";

installContent();

const SEED = 186;
const MAX_TURNS = 32;
const FILTER = Deno.args.find((arg) => arg.startsWith("--scenario="))?.slice(11) || "";

function distance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function goblinParams() {
  const def = getMonster("goblin");
  return {
    name: def.name,
    identity: def.id,
    maxHp: resolveMonsterMaxHp(def, 2),
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
    wielding: def.wielding || [],
    equipped: def.equipped || [],
  };
}

function clearNearbyEnemies(world, center) {
  for (const [id, pos, faction] of world.query(Position, Faction)) {
    if (faction?.key !== "enemy" || distance(pos, center) > 12) continue;
    world.destroy(id);
  }
}

function findGoblinPositions(world, center, playerId) {
  const occupied = new Set();
  for (const [, pos] of world.query(Position)) occupied.add(`${pos.x},${pos.y}`);
  const blocked = blockedCallback(buildBlocksVisionMap(world));
  const candidates = [];
  for (let radius = 2; radius <= 12; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = center.x + dx;
        const y = center.y + dy;
        if (!isWalkable(x, y) || occupied.has(`${x},${y}`)) continue;
        if (!hasLOS(center.x, center.y, x, y, blocked)) continue;
        if (!findNextCardinalStep(world, center.x, center.y, x, y, playerId, {
          goalRadius: 0,
          maxNodes: 512,
          isPassable: isWalkable,
          passThroughDoors: true,
          searchPadding: 12,
        })) continue;
        candidates.push({ x, y });
        if (candidates.length === 3) return candidates;
      }
    }
  }
  throw new Error("could not find three visible walkable goblin tiles");
}

function nearestAlive(world, playerId, goblins) {
  const player = world.get(playerId, Position);
  let best = 0;
  let bestDistance = Infinity;
  for (const id of goblins) {
    const pos = world.get(id, Position);
    const vit = world.get(id, Vitality);
    if (!world.isAlive(id) || !pos || !vit || vit.hp <= 0) continue;
    const d = distance(player, pos);
    if (d < bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
}

function snapshot(world, playerId, goblins) {
  const playerPos = world.get(playerId, Position);
  const playerVit = world.get(playerId, Vitality);
  return {
    step: world.step | 0,
    player: { x: playerPos?.x ?? null, y: playerPos?.y ?? null, hp: playerVit?.hp ?? 0 },
    goblins: goblins.map((id) => {
      const pos = world.get(id, Position);
      const vit = world.get(id, Vitality);
      const aggro = world.get(id, AggroState);
      return {
        id,
        alive: world.isAlive(id) && (vit?.hp || 0) > 0,
        x: pos?.x ?? null,
        y: pos?.y ?? null,
        hp: vit?.hp ?? 0,
        aggro: aggro?.alertLevel || "none",
        moveQueued: world.has(id, MoveIntent),
        actEvery: world.get(id, Speed)?.actEvery ?? null,
      };
    }),
  };
}

async function runScenario({ name, classId, action }) {
  const runtime = await createGameRuntime({ seed: SEED, classId, startDepth: 1 });
  const world = runtime.world;
  const player = runtime.getPlayer();
  const playerPos = world.get(player.id, Position);
  clearNearbyEnemies(world, playerPos);
  const spawnPositions = findGoblinPositions(world, playerPos, player.id);
  const goblins = spawnPositions.map((pos) => spawnMonsterEntity(world, { ...goblinParams(), ...pos }));
  rebuildSpatialIndex(world);
  const trace = [];
  const damage = [];
  const abilities = [];
  const melee = [];
  const bumps = [];
  world.on("damaged", (event) => {
    if (event?.target === player.id || goblins.includes(event?.target)) {
      damage.push({ target: event.target, amount: event.amount });
    }
  });
  world.on("bump:attack", (event) => {
    if (goblins.includes(event?.attacker) || event?.target === player.id) {
      bumps.push({ attacker: event.attacker, target: event.target });
    }
  });
  world.on("combat:melee:attack", (event) => {
    if (goblins.includes(event?.attacker) || event?.defender === player.id) {
      melee.push({ attacker: event.attacker, target: event.defender });
    }
  });
  for (const eventName of ["monster:ability:windup", "monster:castSpellIntent", "castSpell", "spell:blind"]) {
    world.on(eventName, (event) => {
      if (goblins.includes(event?.actor)) abilities.push({ type: eventName, actor: event.actor, spellId: event.spellId });
    });
  }

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const targetId = nearestAlive(world, player.id, goblins);
    const targetPos = targetId ? world.get(targetId, Position) : null;
    action(runtime, player.id, targetId, targetPos, turn);
    trace.push({
      ...snapshot(world, player.id, goblins),
      damage: damage.splice(0),
      abilities: abilities.splice(0),
      bumps: bumps.splice(0),
      melee: melee.splice(0),
    });
    const playerVit = world.get(player.id, Vitality);
    if (!playerVit || playerVit.hp <= 0) break;
    if (trace.at(-1).goblins.every((g) => !g.alive)) break;
  }

  const final = trace.at(-1);
  const allDamage = trace.flatMap((row) => row.damage || []);
  const playerDamage = allDamage
    .filter((event) => event.target === player.id)
    .reduce((sum, event) => sum + Number(event.amount || 0), 0);
  const goblinDamage = allDamage
    .filter((event) => goblins.includes(event.target))
    .reduce((sum, event) => sum + Number(event.amount || 0), 0);
  const meleeEvents = trace.flatMap((row) => row.melee || []);
  const firstContactTurn = trace.find((row) => row.goblins.some((g) => (
    g.alive && g.x != null && distance(row.player, { x: g.x, y: g.y }) <= 1
  )))?.step || null;
  return {
    name,
    classId,
    spawnPositions,
    turns: trace.length,
    player: final.player,
    goblinsAlive: final.goblins.filter((g) => g.alive).length,
    goblinHp: final.goblins.map((g) => g.hp),
    goblinAggro: final.goblins.map((g) => g.aggro),
    firstContactTurn,
    playerDamage,
    goblinDamage,
    meleeAttempts: meleeEvents.length,
    meleeActors: [...new Set(meleeEvents.map((event) => event.attacker))],
    trace: Deno.args.includes("--trace") ? trace : undefined,
  };
}

const scenarios = [
  {
    name: "standing still",
    classId: "warden",
    action: (runtime) => runtime.dispatch({ type: "rules.wait", payload: {} }),
  },
  {
    name: "retreat",
    classId: "warden",
    action: (runtime) => runtime.dispatch({ type: "rules.move", payload: { dx: -1, dy: 0 } }),
  },
  {
    name: "disable",
    classId: "mireborn",
    action: (runtime, _playerId, targetId, targetPos, turn) => {
      if (targetId && targetPos && turn % 4 === 1) {
        runtime.dispatch({
          type: "rules.castActiveSpell",
          payload: { spellId: "entangle", targetId, x: targetPos.x, y: targetPos.y },
        });
      } else {
        runtime.dispatch({ type: "rules.wait", payload: {} });
      }
    },
  },
  {
    name: "ranged",
    classId: "outlaw",
    action: (runtime, _playerId, targetId, targetPos) => {
      if (targetId && targetPos) {
        runtime.dispatch({
          type: "rules.rangedAttack",
          payload: { targetId, toX: targetPos.x, toY: targetPos.y },
        });
      } else {
        runtime.dispatch({ type: "rules.wait", payload: {} });
      }
    },
  },
];

for (const scenario of scenarios) {
  if (FILTER && scenario.name !== FILTER) continue;
  console.log(JSON.stringify(await runScenario(scenario)));
}
