import { assertEquals, assertThrows } from "jsr:@std/assert";
import { World, attach } from "../src/lib/ecs-js/index.js";
import { BaseStats } from "../src/rules/components/BaseStats.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { registerScript, ScriptVerb } from "../src/rules/scripting.js";
import {
  attachDerivedExpression,
  attachProcNode,
  attachProcScript,
  effectApplyStatus,
  effectBonusDamageFlat,
  effectRestoreResource,
  exprAddConst,
  exprAddStatScale,
  gateChance,
  gateCritOnly,
  gateEventKind,
  gateSourceStatAtLeast,
} from "../src/rules/utils/statProcAuthoring.js";
import { resolveDerivedStats } from "../src/rules/utils/derivedStats.js";
import { evaluateActorProcs } from "../src/rules/utils/procEvaluator.js";
import { Stamina } from "../src/rules/components/Stamina.js";
import { Vitality } from "../src/rules/components/Vitality.js";

Deno.test("stat/proc authoring helpers build readable passive and proc subtrees", () => {
  const world = new World({ seed: 77 });
  const actor = world.create();
  const weapon = world.create();
  const sapphire = world.create();
  const topaz = world.create();
  const bloodOpal = world.create();
  const target = world.create();

  world.add(actor, BaseStats, {
    intelligence: 6,
    dexterity: 10,
    critChance: 0.05,
    baseDamageMin: 4,
    baseDamageMax: 8,
  });
  world.add(actor, Equipment, { weapon });
  world.add(actor, Stamina, { stamina: 5, maxStamina: 10, staminaRegen: 0 });
  world.add(actor, Vitality, { hp: 12, maxHp: 12 });
  world.add(target, Vitality, { hp: 20, maxHp: 20 });

  attach(world, sapphire, weapon);
  attach(world, topaz, weapon);
  attach(world, bloodOpal, weapon);

  attachDerivedExpression(world, sapphire, exprAddConst("intelligence", 4, { stage: "base", priority: 10 }));
  attachDerivedExpression(world, sapphire, exprAddStatScale("critChance", "dexterity", 0.005, { stage: "derived", priority: 20 }));

  attachProcNode(world, topaz, {
    priority: 5,
    gates: [
      gateEventKind("onHit", { priority: 1 }),
      gateChance(1, { priority: 2 }),
      gateSourceStatAtLeast("intelligence", 10, { priority: 3 }),
    ],
    effects: [
      effectBonusDamageFlat(3, 5, "fire", { priority: 10 }),
      effectRestoreResource("stamina", 4, { target: "source", priority: 20 }),
    ],
  });

  attachProcNode(world, bloodOpal, {
    priority: 10,
    gates: [
      gateEventKind("onCrit", { priority: 1 }),
      gateCritOnly({ priority: 2 }),
    ],
    effects: [
      effectApplyStatus("bleed", 3, 1, { priority: 10 }),
    ],
  });

  const stats = resolveDerivedStats(world, actor);
  assertEquals(stats.intelligence, 10);
  assertEquals(stats.critChance, 0.1);

  const onHit = evaluateActorProcs(world, actor, {
    kind: "onHit",
    source: actor,
    target,
    item: weapon,
    damage: { amount: 7, type: "physical", crit: false, blocked: false },
    tags: new Set(["melee"]),
    scratch: {},
  });

  assertEquals(onHit.bonusDamage, [
    { source: onHit.bonusDamage[0].source, min: 3, max: 5, type: "fire" },
  ]);
  assertEquals(onHit.resourcesToRestore, [
    { source: onHit.resourcesToRestore[0].source, target: actor, resource: "stamina", amount: 4 },
  ]);

  const onCrit = evaluateActorProcs(world, actor, {
    kind: "onCrit",
    source: actor,
    target,
    item: weapon,
    damage: { amount: 9, type: "physical", crit: true, blocked: false },
    tags: new Set(["melee"]),
    scratch: {},
  });

  assertEquals(onCrit.statusesToApply, [
    {
      source: onCrit.statusesToApply[0].source,
      target,
      status: { key: "bleed", turnsLeft: 3, potency: 1 },
    },
  ]);
});

Deno.test("stat/proc authoring helpers reject invalid stat keys and chance ranges", () => {
  assertThrows(() => exprAddConst("banana", 1), Error, "unknown target stat");
  assertThrows(() => exprAddStatScale("critChance", "banana", 0.1), Error, "unknown source stat");
  assertThrows(() => gateChance(1.5), Error, "must be between 0 and 1");
});

Deno.test("proc nodes support explicit script escape hatches without bypassing the accumulator model", () => {
  registerScript("test:moonshot:oddity", {
    [ScriptVerb.ProcEvaluate]: (_world, scriptCtx) => {
      const totalHp = Number(scriptCtx.sourceStats.vitality || 0) + Number(scriptCtx.event.damage?.amount || 0);
      if ((totalHp % 2) === 0) {
        scriptCtx.proc.addBonusDamage(2, 4, "void");
        scriptCtx.proc.message("odd moon alignment");
      }
    },
  });

  const world = new World({ seed: 91 });
  const actor = world.create();
  const weapon = world.create();
  const weirdNodeParent = world.create();
  const target = world.create();

  world.add(actor, BaseStats, {
    vitality: 7,
    baseDamageMin: 3,
    baseDamageMax: 5,
  });
  world.add(actor, Equipment, { weapon });
  world.add(actor, Vitality, { hp: 10, maxHp: 10 });
  world.add(target, Vitality, { hp: 20, maxHp: 20 });

  attach(world, weirdNodeParent, weapon);

  const procNodeId = attachProcNode(world, weirdNodeParent, {
    gates: [gateEventKind("onHit")],
  });
  attachProcScript(world, procNodeId, "test:moonshot:oddity");

  const out = evaluateActorProcs(world, actor, {
    kind: "onHit",
    source: actor,
    target,
    item: weapon,
    damage: { amount: 7, type: "physical", crit: false, blocked: false },
    tags: new Set(["melee", "weird"]),
    scratch: {},
  });

  assertEquals(out.bonusDamage, [
    { source: procNodeId, min: 2, max: 4, type: "void" },
  ]);
  assertEquals(out.messages, [
    { source: procNodeId, text: "odd moon alignment", type: "system" },
  ]);
});
