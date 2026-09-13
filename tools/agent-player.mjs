// JSONL bridge for a game-playing agent.
// Start it with: deno run --allow-read tools/agent-player.mjs

import "../src/content/items/index.js";
import "../src/content/monsters/index.js";
import "../src/content/interactables/index.js";
import { installContent } from "../src/content/install.js";
import { createGameRuntime } from "../src/main/runtime/gameRuntime.js";
import { AGENT_ACTION_CATALOG } from "../src/main/runtime/agentView.js";

installContent();

function parseArgs(argv) {
  const out = { seed: 0xC0FFEE, classId: "outlaw", playerName: "Agent", startDepth: 1, mapRadius: 10 };
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
  }
  return out;
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
const runtime = await createGameRuntime(cfg);
const observe = () => runtime.observe({ mapRadius: cfg.mapRadius, includeActionCatalog: false });

write({ type: "ready", protocol: "jshack-agent-v1", actionCatalog: AGENT_ACTION_CATALOG, observation: observe() });

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
