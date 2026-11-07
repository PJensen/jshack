import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { attach } from "../src/lib/ecs-js/hierarchy.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Duration } from "../src/rules/components/Duration.js";
import { SleepState } from "../src/rules/components/SleepState.js";
import { Status } from "../src/rules/components/Status.js";
import { StatusEffectNode } from "../src/rules/components/StatusEffectNode.js";
import { TimedEffectNode } from "../src/rules/components/TimedEffectNode.js";
import {
  createStatusFacade,
  capabilitySources,
  capabilityStrength,
  effectStrength,
  hasAnyStatus,
  hasEffect,
  hasStatus,
  snapshotStatusState,
  statusStrength,
} from "../src/rules/utils/statusFacade.js";

Deno.test("status facade: capabilities derive from authored effect identities and expose sources", () => {
  const world = new World({ seed: 6100 });
  const actor = world.create();
  world.add(actor, ActiveEffects, {
    effects: [{ key: "frost_nova", turnsLeft: 4, potency: 2, stacks: 1 }],
  });

  assertEquals(capabilityStrength(world, actor, "immobilized"), 2);
  assertEquals(capabilityStrength(world, actor, "frozen"), 2);
  assertEquals(capabilitySources(world, actor, "immobilized"), [
    { kind: "effect", key: "frost_nova", strength: 2 },
  ]);
});

Deno.test("status facade: SleepState projects canonical sleep status with aliases", () => {
  const world = new World({ seed: 0x51EE9 });
  const actor = world.create();
  world.add(actor, SleepState, { asleep: true, wakeDifficulty: 8, wakeRadius: 2, wakeOnDamage: true });

  assertEquals(hasStatus(world, actor, "sleep"), true);
  assertEquals(statusStrength(world, actor, "sleep"), 1);
  assertEquals(statusStrength(world, actor, "asleep"), 1);
  assertEquals(statusStrength(world, actor, "sleeping"), 1);

  const snap = snapshotStatusState(world, actor);
  assert(snap, "snapshot should exist");
  assertEquals(snap.statuses.some((s) => s.type === "sleep"), false);
  assertEquals(snap.allStatuses.some((s) => s.type === "sleep"), true);
});

Deno.test("status facade: sleep aliases from legacy rows resolve to canonical sleep", () => {
  const world = new World({ seed: 0xA11A5 });
  const fromStatus = world.create();
  const fromEffect = world.create();

  world.add(fromStatus, Status, {
    statuses: [{ type: "asleep", duration: 2, potency: 1, stacks: 1 }],
  });
  world.add(fromEffect, ActiveEffects, {
    effects: [{ key: "sleeping", turnsLeft: 2, potency: 1, stacks: 1 }],
  });

  assertEquals(hasStatus(world, fromStatus, "sleep"), true);
  assertEquals(hasStatus(world, fromEffect, "sleep"), true);
  assertEquals(statusStrength(world, fromStatus, "asleep"), 1);
  assertEquals(statusStrength(world, fromEffect, "sleeping"), 1);
});

Deno.test("status facade: derives semantic statuses from active effects", () => {
  const world = new World({ seed: 6101 });
  const actor = world.create();
  world.add(actor, ActiveEffects, {
    effects: [{ key: "hangover", turnsLeft: 4, potency: 2, stacks: 1 }],
  });

  assertEquals(hasEffect(world, actor, "hangover"), true);
  assertEquals(effectStrength(world, actor, "hangover"), 2);
  assertEquals(hasStatus(world, actor, "confused"), true);
  assertEquals(statusStrength(world, actor, "confused"), 2);
  assertEquals(hasAnyStatus(world, actor, ["burning", "confused"]), true);

  const snap = snapshotStatusState(world, actor);
  assert(snap, "snapshot should exist");
  assertEquals(snap.statuses.some((s) => s.type === "confused"), true);
});

Deno.test("status facade: status snapshot remains active-effect-derived while compatibility can read Status fallback", () => {
  const world = new World({ seed: 6102 });
  const actor = world.create();
  world.add(actor, Status, {
    statuses: [{ type: "hallucinating", duration: 3, potency: 1, stacks: 1 }],
  });

  assertEquals(hasStatus(world, actor, "hallucinating"), true);
  const snap = snapshotStatusState(world, actor);
  assert(snap, "snapshot should exist");
  assertEquals(snap.statuses.length, 0, "derived status list should come from ActiveEffects only");
  assertEquals(snap.allStatuses.some((s) => s.type === "hallucinating"), true);
});

Deno.test("status facade: active effects take precedence over mirrored Status entries", () => {
  const world = new World({ seed: 6103 });
  const actor = world.create();
  world.add(actor, ActiveEffects, {
    effects: [{ key: "poison", turnsLeft: 5, potency: 2, stacks: 1 }],
  });
  world.add(actor, Status, {
    statuses: [{ type: "poisoned", duration: 5, potency: 9, stacks: 1 }],
  });

  assertEquals(statusStrength(world, actor, "poisoned"), 2);
});

Deno.test("status facade: onset effects do not project statuses until active", () => {
  const world = new World({ seed: 6104 });
  const actor = world.create();
  world.add(actor, ActiveEffects, {
    effects: [{ key: "hangover", turnsLeft: 6, onsetLeft: 2, potency: 2, stacks: 1 }],
  });

  assertEquals(hasEffect(world, actor, "hangover"), false);
  assertEquals(hasStatus(world, actor, "confused"), false);
});

Deno.test("status facade: derives statuses from topology status nodes", () => {
  const world = new World({ seed: 61041 });
  const actor = world.create();
  const statusNode = world.create();
  attach(world, statusNode, actor);
  world.add(statusNode, StatusEffectNode, {
    key: "hangover",
    potency: 3,
    stacks: 2,
  });
  world.add(statusNode, Duration, {
    turnsLeft: 4,
    onsetLeft: 0,
    maxTurns: 4,
    startedAtTurn: 9,
  });

  assertEquals(hasEffect(world, actor, "hangover"), true);
  assertEquals(effectStrength(world, actor, "hangover"), 6);
  assertEquals(statusStrength(world, actor, "confused"), 6);
});

Deno.test("status facade: topology rows take precedence over duplicate legacy active effects", () => {
  const world = new World({ seed: 61042 });
  const actor = world.create();
  const statusNode = world.create();
  attach(world, statusNode, actor);
  world.add(statusNode, StatusEffectNode, {
    key: "poison",
    potency: 2,
    stacks: 1,
  });
  world.add(statusNode, Duration, {
    turnsLeft: 4,
    onsetLeft: 0,
    maxTurns: 4,
    startedAtTurn: 0,
  });
  world.add(actor, ActiveEffects, {
    effects: [{ key: "poison", turnsLeft: 5, potency: 9, stacks: 1 }],
  });

  assertEquals(effectStrength(world, actor, "poison"), 2);
  assertEquals(statusStrength(world, actor, "poisoned"), 2);
});

Deno.test("status facade: topology timed nodes can expose effects without StatusEffectNode", () => {
  const world = new World({ seed: 61043 });
  const actor = world.create();
  const timedNode = world.create();
  attach(world, timedNode, actor);
  world.add(timedNode, TimedEffectNode, { key: "hangover" });
  world.add(timedNode, Duration, {
    turnsLeft: 2,
    onsetLeft: 0,
    maxTurns: 2,
    startedAtTurn: 0,
  });

  assertEquals(hasEffect(world, actor, "hangover"), true);
  assertEquals(statusStrength(world, actor, "confused"), 1);
});

Deno.test("createStatusFacade: exposes anchored helpers for callbacks/runtime contexts", () => {
  const world = new World({ seed: 6105 });
  const actor = world.create();
  const target = world.create();

  world.add(actor, ActiveEffects, {
    effects: [{ key: "hangover", turnsLeft: 3, potency: 1, stacks: 1 }],
  });
  world.add(target, Status, {
    statuses: [{ type: "cursed", duration: 2, potency: 1, stacks: 1 }],
  });

  const facade = createStatusFacade(world, {
    actor: () => actor,
    target: () => target,
  });

  assertEquals(facade.actorHasStatus("confused"), true);
  assertEquals(facade.targetHasStatus("cursed"), true);
  assertEquals(facade.hasAnyStatus(target, ["blessed", "cursed"]), true);
  assertEquals(facade.effectStrength(actor, "hangover"), 1);
});
