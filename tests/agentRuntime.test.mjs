import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import { createGameRuntime } from "../src/main/runtime/gameRuntime.js";

Deno.test("agent runtime exposes a bounded JSON-safe observation and advances actions", async () => {
  const runtime = await createGameRuntime({ seed: 0xA61E17, classId: "outlaw", startDepth: 1 });
  const initial = runtime.observe({ mapRadius: 4 });

  assertEquals(initial.protocol, "jshack-agent-v1");
  assertExists(initial.player);
  assertEquals(initial.map.width, 9);
  assertEquals(initial.map.height, 9);
  assertEquals(initial.map.tiles.length, 9);
  assert(initial.actionCatalog.some((action) => action.type === "rules.move"));
  assert(!initial.suggestedActions.some((action) => action.payload?.targetSlot === "bag"));
  assert(initial.suggestedActions.some((action) => action.type === "rules.wait"));
  assert(initial.suggestedActions.some((action) => action.type === "rules.traverseStairs"));
  assertEquals(JSON.parse(JSON.stringify(initial)).protocol, initial.protocol);

  const compact = runtime.observe({ mapRadius: 4, includeActionCatalog: false });
  assertEquals(compact.actionCatalog, undefined);

  const before = runtime.snapshot().step;
  runtime.dispatch({ type: "rules.wait", payload: {} });
  const after = runtime.snapshot().step;
  assert(after > before, "wait should advance the simulation");
  assertEquals(runtime.observe({ mapRadius: 4 }).turn, after);
});
