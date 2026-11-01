import "../../../../src/content/items/index.js";
import "../../../../src/content/monsters/index.js";
import "../../../../src/content/interactables/index.js";
import { installContent } from "../../../../src/content/install.js";
import { getOrderedSystems } from "../../../../src/lib/ecs-js/index.js";
import { createGameRuntime } from "../../../../src/main/runtime/gameRuntime.js";
import { configureWorld } from "../../../../src/main/scheduler.js";
import { World } from "../../../../src/lib/ecs-js/index.js";

import { Player } from "../../../../src/rules/components/Player.js";
import { Position } from "../../../../src/rules/components/Position.js";
import { Vitality } from "../../../../src/rules/components/Vitality.js";
import { Equipment } from "../../../../src/rules/components/Equipment.js";
import { Faction } from "../../../../src/rules/components/Faction.js";
import { NamedIdentity } from "../../../../src/rules/components/NamedIdentity.js";
import { DungeonState } from "../../../../src/rules/components/DungeonState.js";
import { MoveIntent } from "../../../../src/rules/components/Intents/MoveIntent.js";
import { AttackIntent } from "../../../../src/rules/components/Intents/AttackIntent.js";
import { WaitIntent } from "../../../../src/rules/components/Intents/WaitIntent.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../../../../src/rules/environment/dungeon/constants.js";
import { clearAll, loadChunk } from "../../../../src/rules/environment/dungeon/tileMap.js";

const PHASES = ["ai", "intents", "effects", "scripts", "cleanup"];

installContent();

function parseArgs(argv) {
  const out = {
    scenario: "live_wait",
    ticks: 120,
    top: 20,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--scenario" && argv[i + 1]) out.scenario = String(argv[++i]);
    else if (arg === "--ticks" && argv[i + 1]) out.ticks = Math.max(1, Number(argv[++i]) | 0);
    else if (arg === "--top" && argv[i + 1]) out.top = Math.max(1, Number(argv[++i]) | 0);
  }
  return out;
}

function loadFlatChunks(radius = 2) {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  for (let cy = -radius; cy <= radius; cy++) {
    for (let cx = -radius; cx <= radius; cx++) {
      loadChunk(cx, cy, tiles);
    }
  }
}

function systemName(fn, index, phase) {
  const n = String(fn?.name || "").trim();
  if (n) return n;
  return `${phase}:sys${index}`;
}

function installProfilingScheduler(world) {
  const phaseSystems = Object.fromEntries(PHASES.map((ph) => [ph, getOrderedSystems(ph)]));
  const perSystem = new Map(); // name -> { phase, totalMs, maxMs, calls, samples[] }
  const perPhase = new Map();  // phase -> { totalMs, calls }
  let totalMs = 0;
  let ticks = 0;

  world.setScheduler((w, dt) => {
    ticks += 1;
    const t0 = performance.now();
    for (const phase of PHASES) {
      const list = phaseSystems[phase] || [];
      const p0 = performance.now();
      for (let i = 0; i < list.length; i++) {
        const fn = list[i];
        const s0 = performance.now();
        fn(w, dt);
        const ms = performance.now() - s0;
        const name = systemName(fn, i, phase);
        let rec = perSystem.get(name);
        if (!rec) {
          rec = { phase, totalMs: 0, maxMs: 0, calls: 0, samples: [] };
          perSystem.set(name, rec);
        }
        rec.totalMs += ms;
        rec.calls += 1;
        if (ms > rec.maxMs) rec.maxMs = ms;
        rec.samples.push(ms);
      }
      const pMs = performance.now() - p0;
      const pRec = perPhase.get(phase) || { totalMs: 0, calls: 0 };
      pRec.totalMs += pMs;
      pRec.calls += 1;
      perPhase.set(phase, pRec);
    }
    totalMs += performance.now() - t0;
  });

  return {
    report() {
      return { totalMs, ticks, perSystem, perPhase };
    },
  };
}

function p95(samples) {
  if (!samples.length) return 0;
  const sorted = samples.slice().sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)));
  return sorted[idx];
}

async function makeLiveWaitScenario() {
  const runtime = await createGameRuntime({
    seed: 0xC0FFEE,
    classId: "outlaw",
    playerName: "Profiler",
    startDepth: 1,
  });
  const world = runtime.world;
  const player = runtime.getPlayer();
  const actorId = player?.id || 0;
  return {
    world,
    beforeTick() {
      if (actorId > 0) world.add(actorId, WaitIntent, {});
    },
  };
}

function makeFullTickActorsScenario() {
  loadFlatChunks(2);
  const world = new World({ seed: 0xC0FFEE });
  configureWorld(world);
  world.add(world.create(), DungeonState, { currentDepth: 1, profileType: "default" });

  const player = world.create();
  world.add(player, Player, { controlled: true });
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, Vitality, { hp: 100, maxHp: 100 });
  world.add(player, Equipment, { accuracyDerived: 12, damagePowerDerived: 8, naturalDamageDice: "1d4" });
  world.add(player, Faction, { key: "player" });
  world.add(player, NamedIdentity, { name: "Player", identity: "player" });

  const actorIds = [];
  let x = 4;
  let y = 20;
  for (let i = 0; i < 256; i++) {
    const id = world.create();
    actorIds.push(id);
    world.add(id, Position, { x, y });
    world.add(id, Vitality, { hp: 24, maxHp: 24 });
    world.add(id, Equipment, { accuracyDerived: 6, damagePowerDerived: 4, naturalDamageDice: "1d2" });
    world.add(id, Faction, { key: "enemy" });
    world.add(id, NamedIdentity, { name: "Mob", identity: "mob" });
    x += 2;
    if (x > 56) {
      x = 4;
      y += 2;
    }
  }

  let iter = 0;
  return {
    world,
    beforeTick() {
      const dx = (iter & 1) === 0 ? 1 : -1;
      iter += 1;
      for (let i = 0; i < actorIds.length; i++) {
        world.add(actorIds[i], MoveIntent, { dx, dy: 0 });
      }
    },
  };
}

function makeCombatHeavyScenario() {
  loadFlatChunks(2);
  const world = new World({ seed: 0xBADC0DE });
  configureWorld(world);
  world.add(world.create(), DungeonState, { currentDepth: 1, profileType: "default" });

  const pairs = [];
  let x = 2;
  let y = 2;
  for (let i = 0; i < 200; i++) {
    const attacker = world.create();
    const defender = world.create();

    world.add(attacker, Position, { x, y });
    world.add(attacker, Vitality, { hp: 100, maxHp: 100 });
    world.add(attacker, Equipment, { accuracyDerived: 100, damagePowerDerived: 12, naturalDamageDice: "1d3" });
    world.add(attacker, Faction, { key: "player" });
    world.add(attacker, NamedIdentity, { name: "Attacker", identity: `attacker_${i}` });

    world.add(defender, Position, { x: x + 1, y });
    world.add(defender, Vitality, { hp: 1000, maxHp: 1000 });
    world.add(defender, Equipment, {});
    world.add(defender, Faction, { key: "enemy" });
    world.add(defender, NamedIdentity, { name: "Defender", identity: `defender_${i}` });

    pairs.push([attacker, defender]);
    x += 3;
    if (x > 56) {
      x = 2;
      y += 1;
    }
  }

  return {
    world,
    beforeTick() {
      for (let i = 0; i < pairs.length; i++) {
        const [attacker, defender] = pairs[i];
        world.add(attacker, AttackIntent, { targetId: defender });
      }
      for (let i = 0; i < pairs.length; i++) {
        const defender = pairs[i][1];
        const vit = world.get(defender, Vitality);
        if (vit) vit.hp = vit.maxHp;
      }
    },
  };
}

async function makeScenario(name) {
  const key = String(name || "").trim().toLowerCase();
  if (key === "full_tick_actors") return makeFullTickActorsScenario();
  if (key === "combat_heavy") return makeCombatHeavyScenario();
  return await makeLiveWaitScenario();
}

function printReport(name, profile, topN) {
  const { totalMs, ticks, perSystem, perPhase } = profile;
  const rows = Array.from(perSystem.entries()).map(([system, rec]) => {
    const avg = rec.calls > 0 ? rec.totalMs / rec.calls : 0;
    const share = totalMs > 0 ? (rec.totalMs / totalMs) * 100 : 0;
    return {
      system,
      phase: rec.phase,
      totalMs: rec.totalMs,
      avgMs: avg,
      p95Ms: p95(rec.samples),
      maxMs: rec.maxMs,
      share,
    };
  });
  rows.sort((a, b) => b.totalMs - a.totalMs);

  console.log(`\nScenario: ${name}`);
  console.log(`Ticks: ${ticks}`);
  console.log(`Total scheduler time: ${totalMs.toFixed(2)} ms`);
  console.log(`Avg tick: ${(totalMs / Math.max(1, ticks)).toFixed(3)} ms`);

  const phaseRows = Array.from(perPhase.entries()).map(([phase, rec]) => ({
    phase,
    totalMs: rec.totalMs,
    avgMs: rec.calls > 0 ? rec.totalMs / rec.calls : 0,
    share: totalMs > 0 ? (rec.totalMs / totalMs) * 100 : 0,
  })).sort((a, b) => b.totalMs - a.totalMs);

  console.log("\nPhase breakdown:");
  for (const row of phaseRows) {
    console.log(`  ${row.phase.padEnd(8)} total=${row.totalMs.toFixed(2)}ms avg=${row.avgMs.toFixed(3)}ms share=${row.share.toFixed(1)}%`);
  }

  console.log(`\nTop ${Math.min(topN, rows.length)} systems by total time:`);
  for (const row of rows.slice(0, topN)) {
    console.log(
      `  ${row.system.padEnd(34)} phase=${row.phase.padEnd(8)} total=${row.totalMs.toFixed(2)}ms avg=${row.avgMs.toFixed(3)}ms p95=${row.p95Ms.toFixed(3)}ms max=${row.maxMs.toFixed(3)}ms share=${row.share.toFixed(1)}%`,
    );
  }
}

async function main() {
  const opts = parseArgs(Deno.args);
  const scenario = await makeScenario(opts.scenario);
  const profiler = installProfilingScheduler(scenario.world);

  for (let i = 0; i < opts.ticks; i++) {
    if (typeof scenario.beforeTick === "function") scenario.beforeTick(i);
    scenario.world.tick(1);
  }

  printReport(opts.scenario, profiler.report(), opts.top);
}

await main();
