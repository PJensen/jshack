import { assertEquals } from "jsr:@std/assert";
import { getParent } from "../src/lib/ecs-js/hierarchy.js";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Duration } from "../src/rules/components/Duration.js";
import { Source } from "../src/rules/components/Source.js";
import { StatusEffectNode } from "../src/rules/components/StatusEffectNode.js";
import { TimedEffectNode } from "../src/rules/components/TimedEffectNode.js";
import { effectSystem } from "../src/rules/systems/effectSystem.js";
import { applyStatusEffect } from "../src/rules/utils/effects.js";
import { applyProcAccumulator } from "../src/rules/utils/procApplication.js";
import {
  effectStrength,
  statusStrength,
} from "../src/rules/utils/statusFacade.js";

Deno.test("applyStatusEffect creates a topology-only status node", () => {
  const world = new World({ seed: 6201 });
  const actor = world.create();
  const source = world.create();

  const node = applyStatusEffect(world, actor, {
    key: "hangover",
    turnsLeft: 4,
    maxTurns: 6,
    startedAtTurn: 2,
    potency: 2,
    stacks: 3,
    sourceId: source,
    sourceKind: "potion",
    sourceKey: "ale",
  });

  assertEquals(getParent(world, node), actor);
  assertEquals(world.get(node, StatusEffectNode), {
    key: "hangover",
    potency: 2,
    stacks: 3,
  });
  assertEquals(world.get(node, TimedEffectNode), { key: "hangover" });
  assertEquals(world.get(node, Duration), {
    turnsLeft: 4,
    onsetLeft: 0,
    maxTurns: 6,
    startedAtTurn: 2,
  });
  assertEquals(world.get(node, Source), {
    kind: "potion",
    id: source,
    key: "ale",
  });

  assertEquals(world.get(actor, ActiveEffects), null);
  assertEquals(effectStrength(world, actor, "hangover"), 6);
  assertEquals(statusStrength(world, actor, "confused"), 6);
});

Deno.test("applyStatusEffect never creates a legacy ActiveEffects component", () => {
  const world = new World({ seed: 6202 });
  const actor = world.create();

  applyStatusEffect(world, actor, {
    key: "poison",
    turnsLeft: 5,
    potency: 2,
    stacks: 1,
  });

  assertEquals(world.get(actor, ActiveEffects), null);
  assertEquals(effectStrength(world, actor, "poison"), 2);
  assertEquals(statusStrength(world, actor, "poisoned"), 2);
});

Deno.test("applyStatusEffect topology honors onset before projecting status", () => {
  const world = new World({ seed: 6203 });
  const actor = world.create();

  applyStatusEffect(world, actor, {
    key: "hangover",
    turnsLeft: 5,
    onsetLeft: 2,
    potency: 2,
    stacks: 1,
  });

  assertEquals(effectStrength(world, actor, "hangover"), 0);
  assertEquals(statusStrength(world, actor, "confused"), 0);
});

Deno.test("effectSystem ticks topology status durations", () => {
  const world = new World({ seed: 6204 });
  const actor = world.create();
  const node = applyStatusEffect(world, actor, {
    key: "invulnerable",
    turnsLeft: 1,
  });

  assertEquals(statusStrength(world, actor, "invulnerable"), 1);
  effectSystem(world);
  assertEquals(world.get(node, Duration).turnsLeft, 0);
  assertEquals(statusStrength(world, actor, "invulnerable"), 0);
});

Deno.test("proc application routes invulnerability through topology", () => {
  const world = new World({ seed: 6205 });
  const actor = world.create();

  applyProcAccumulator(world, {
    statusesToApply: [{
      source: 7,
      target: actor,
      status: { key: "invuln", turnsLeft: 2, potency: 1 },
    }],
    resourcesToRestore: [],
    vitalityToRestore: [],
    directDamage: [],
    messages: [],
  });

  assertEquals(statusStrength(world, actor, "invulnerable"), 1);
  assertEquals([...world.query(StatusEffectNode)].length, 1);
  assertEquals(world.get(actor, ActiveEffects), null);
});
