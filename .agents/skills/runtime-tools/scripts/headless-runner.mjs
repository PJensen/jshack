import "../../../../src/content/items/index.js";
import "../../../../src/content/monsters/index.js";
import "../../../../src/content/interactables/index.js";
import { installContent } from "../../../../src/content/install.js";
import { createGameRuntime } from "../../../../src/main/runtime/gameRuntime.js";

installContent();

function parseArgs(argv) {
  const out = {
    seed: 0xC0FFEE,
    classId: "outlaw",
    playerName: "Headless Hero",
    startDepth: 1,
    turns: 500,
    reportEvery: 100,
    playerWait: false,
    actionsFile: "",
    dungeonType: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    if (!raw.startsWith("--")) continue;
    const [k, inlineV] = raw.split("=", 2);
    const key = k.slice(2);
    const value = inlineV != null ? inlineV : (argv[i + 1] && !String(argv[i + 1]).startsWith("--") ? argv[++i] : "true");

    switch (key) {
      case "seed": out.seed = Number(value); break;
      case "class": out.classId = String(value); break;
      case "name": out.playerName = String(value); break;
      case "depth": out.startDepth = Number(value); break;
      case "turns": out.turns = Number(value); break;
      case "report-every": out.reportEvery = Number(value); break;
      case "player-wait": out.playerWait = String(value) !== "false"; break;
      case "actions-file": out.actionsFile = String(value); break;
      case "dungeon-type": out.dungeonType = String(value || "").trim() || null; break;
      default: break;
    }
  }

  out.turns = Math.max(1, Number.isFinite(out.turns) ? (out.turns | 0) : 500);
  out.reportEvery = Math.max(1, Number.isFinite(out.reportEvery) ? (out.reportEvery | 0) : 100);
  return out;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function fmtMs(n) {
  return `${n.toFixed(3)}ms`;
}

async function loadActionSchedule(path) {
  if (!path) return new Map();
  const raw = await Deno.readTextFile(path);
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("actions-file must be a JSON array");

  const byTurn = new Map();
  for (const row of parsed) {
    const at = Number(row?.at);
    const action = row?.action;
    if (!Number.isFinite(at) || !action || typeof action.type !== "string") continue;
    const turn = Math.max(1, at | 0);
    if (!byTurn.has(turn)) byTurn.set(turn, []);
    byTurn.get(turn).push(action);
  }
  return byTurn;
}

async function main() {
  const cfg = parseArgs(Deno.args);
  const actionSchedule = await loadActionSchedule(cfg.actionsFile);

  const runtime = await createGameRuntime({
    seed: cfg.seed,
    classId: cfg.classId,
    playerName: cfg.playerName,
    startDepth: cfg.startDepth,
    dungeonType: cfg.dungeonType,
  });

  const stepTimes = [];
  const viewTimes = [];

  console.log("headless runtime start");
  console.log(JSON.stringify({
    seed: cfg.seed >>> 0,
    classId: cfg.classId,
    playerName: cfg.playerName,
    depth: cfg.startDepth,
    turns: cfg.turns,
    reportEvery: cfg.reportEvery,
    playerWait: cfg.playerWait,
    actionsFile: cfg.actionsFile || null,
    dungeonType: cfg.dungeonType,
  }));

  for (let turn = 1; turn <= cfg.turns; turn++) {
    const scheduled = actionSchedule.get(turn) || [];

    const t0 = performance.now();
    if (scheduled.length > 0) {
      for (const action of scheduled) runtime.dispatch(action);
    } else if (cfg.playerWait) {
      runtime.dispatch({ type: "rules.wait", payload: {} });
    } else {
      runtime.tick(1);
    }
    const t1 = performance.now();
    stepTimes.push(t1 - t0);

    if (turn % cfg.reportEvery === 0 || turn === cfg.turns) {
      const v0 = performance.now();
      const view = runtime.view();
      const v1 = performance.now();
      const viewMs = v1 - v0;
      viewTimes.push(viewMs);

      const snap = runtime.snapshot();
      console.log(JSON.stringify({
        turn,
        simStepMs: Number((stepTimes[stepTimes.length - 1] || 0).toFixed(3)),
        viewMs: Number(viewMs.toFixed(3)),
        entitiesVisible: Array.isArray(view.entities) ? view.entities.length : 0,
        entitiesAlive: snap.entitiesAlive,
        depth: snap.depth,
        player: snap.player,
      }));
    }
  }

  const finalSnap = runtime.snapshot();
  console.log("headless runtime summary");
  console.log(JSON.stringify({
    turns: cfg.turns,
    stepAvgMs: Number(mean(stepTimes).toFixed(3)),
    stepP95Ms: Number(percentile(stepTimes, 95).toFixed(3)),
    stepMinMs: Number(Math.min(...stepTimes).toFixed(3)),
    stepMaxMs: Number(Math.max(...stepTimes).toFixed(3)),
    viewAvgMs: Number(mean(viewTimes).toFixed(3)),
    viewP95Ms: Number(percentile(viewTimes, 95).toFixed(3)),
    final: finalSnap,
  }));

  console.log(`step avg ${fmtMs(mean(stepTimes))} | p95 ${fmtMs(percentile(stepTimes, 95))}`);
}

main().catch((err) => {
  console.error("headless-runner failed:", err);
  Deno.exit(1);
});
