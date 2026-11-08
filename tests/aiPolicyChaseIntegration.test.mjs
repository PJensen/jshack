import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { applyAction } from "../src/rules/ai/policyAction.js";

Deno.test("policy movement preserves an existing chase intent", () => {
  const world = new World({ seed: 186 });
  const actor = world.create();
  world.add(actor, MoveIntent, { dx: -1, dy: 0 });

  applyAction(world, actor, 0, 3, []);

  const intent = world.get(actor, MoveIntent);
  assertEquals({ dx: intent.dx, dy: intent.dy }, { dx: -1, dy: 0 });
});

Deno.test("policy movement still applies when chase produced no intent", () => {
  const world = new World({ seed: 186 });
  const actor = world.create();

  applyAction(world, actor, 0, 3, []);

  const intent = world.get(actor, MoveIntent);
  assertEquals({ dx: intent.dx, dy: intent.dy }, { dx: 1, dy: 1 });
});
