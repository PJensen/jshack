import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import {
  Charges,
  Duration,
  Source,
  StatusEffectNode,
  TimedEffectNode,
} from "../src/rules/components/index.js";

Deno.test("runtime topology components are exported and store flat facts", () => {
  const world = new World({ seed: 0xA77A77 });
  const node = world.create();

  world.add(node, StatusEffectNode, {
    key: "poison",
    stacks: 2,
    potency: 3,
  });
  world.add(node, TimedEffectNode, { key: "poison" });
  world.add(node, Duration, {
    turnsLeft: 5,
    onsetLeft: 1,
    maxTurns: 8,
    startedAtTurn: 13,
  });
  world.add(node, Source, {
    kind: "spell",
    id: 42,
    key: "venom_dart",
  });
  world.add(node, Charges, {
    current: 1,
    max: 4,
  });

  assertEquals(world.get(node, StatusEffectNode), {
    key: "poison",
    stacks: 2,
    potency: 3,
    meta: null,
  });
  assertEquals(world.get(node, TimedEffectNode), { key: "poison" });
  assertEquals(world.get(node, Duration), {
    turnsLeft: 5,
    onsetLeft: 1,
    maxTurns: 8,
    startedAtTurn: 13,
  });
  assertEquals(world.get(node, Source), {
    kind: "spell",
    id: 42,
    key: "venom_dart",
  });
  assertEquals(world.get(node, Charges), {
    current: 1,
    max: 4,
  });
});
