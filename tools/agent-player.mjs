// JSONL bridge for a game-playing agent.
// Start it with: deno run --allow-read --allow-write tools/agent-player.mjs

import "../src/content/items/index.js";
import "../src/content/monsters/index.js";
import "../src/content/interactables/index.js";
import { installContent } from "../src/content/install.js";
import { createGameRuntime } from "../src/main/runtime/gameRuntime.js";
import { AGENT_ACTION_CATALOG } from "../src/main/runtime/agentView.js";

installContent();

function parseArgs(argv) {
  const out = {
    seed: 0xC0FFEE,
    classId: "outlaw",
    playerName: "Agent",
    startDepth: 1,
    mapRadius: 10,
    traceFile: "traces/agent-last-run.json",
    resumeFile: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    if (!raw.startsWith("--")) continue;
    const [key, inline] = raw.slice(2).split("=", 2);
    const value = inline ?? (argv[i + 1] && !String(argv[i + 1]).startsWith("--") ? argv[++i] : "true");
    if (key === "seed") out.seed = Number(value);
    else if (key === "class") out.classId = String(value);
    else if (key === "name") out.playerName = String(value);
    else if (key === "depth") out.startDepth = Number(value);
    else if (key === "map-radius") out.mapRadius = Number(value);
    else if (key === "trace-file") out.traceFile = String(value);
    else if (key === "resume") out.resumeFile = String(value);
    else if (key === "no-trace") out.traceFile = "";
  }
  return out;
}

async function readTrace(path) {
  if (!path) return null;
  const parsed = JSON.parse(await Deno.readTextFile(path));
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.actions)) {
    throw new Error("trace must be a v1 JSON object with an actions array");
  }
  return parsed;
}

async function writeTrace(path, trace) {
  if (!path) return;
  const slash = path.lastIndexOf("/");
  if (slash > 0) await Deno.mkdir(path.slice(0, slash), { recursive: true });
  await Deno.writeTextFile(path, `${JSON.stringify(trace, null, 2)}\n`);
}

function write(message) {
  console.log(JSON.stringify(message));
}

async function* inputLines() {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of Deno.stdin.readable) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield line;
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield buffer.trim();
}

const cfg = parseArgs(Deno.args);
const resume = await readTrace(cfg.resumeFile);
const runtimeOptions = resume
  ? {
      seed: cfg.seed !== 0xC0FFEE ? cfg.seed : resume.seed,
      classId: cfg.classId !== "outlaw" ? cfg.classId : resume.classId,
      playerName: cfg.playerName !== "Agent" ? cfg.playerName : resume.playerName,
      startDepth: cfg.startDepth !== 1 ? cfg.startDepth : resume.startDepth,
    }
  : cfg;
const runtime = await createGameRuntime(runtimeOptions);
if (resume) {
  for (const action of resume.actions) runtime.dispatch(action);
}
const observe = () => runtime.observe({ mapRadius: cfg.mapRadius, includeActionCatalog: false });
const trace = {
  v: 1,
  protocol: "jshack-agent-v1",
  seed: runtimeOptions.seed,
  classId: runtimeOptions.classId,
  playerName: runtimeOptions.playerName,
  startDepth: runtimeOptions.startDepth,
  actions: resume ? [...resume.actions] : [],
};
await writeTrace(cfg.traceFile, trace);

write({
  type: "ready",
  protocol: "jshack-agent-v1",
  resumedFrom: cfg.resumeFile || null,
  replayedActions: resume?.actions.length || 0,
  traceFile: cfg.traceFile || null,
  actionCatalog: AGENT_ACTION_CATALOG,
  observation: observe(),
});

for await (const line of inputLines()) {
  let command;
  try {
    command = JSON.parse(line);
  } catch (error) {
    write({ type: "error", error: `Invalid JSON: ${error.message}` });
    continue;
  }
  if (command?.type === "quit" || command?.action?.type === "quit") {
    write({ type: "bye" });
    break;
  }
  if (command?.type === "observe") {
    write({ type: "observation", observation: observe() });
    continue;
  }

  const action = command?.action || command;
  if (!action || typeof action.type !== "string") {
    write({ type: "error", error: "Expected an action object with a string type." });
    continue;
  }
  const before = runtime.snapshot();
  try {
    runtime.dispatch(action);
    trace.actions.push(action);
    await writeTrace(cfg.traceFile, trace);
    const after = runtime.snapshot();
    write({
      type: "result",
      action,
      advanced: after.step !== before.step,
      before,
      after,
      observation: observe(),
    });
  } catch (error) {
    write({ type: "error", action, error: String(error?.stack || error) });
  }
}
