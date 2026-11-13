import { assertEquals } from "jsr:@std/assert";
import { World, attach } from "../src/lib/ecs-js/index.js";
import { ActivationGate } from "../src/rules/components/ActivationGate.js";
import { BaseStats } from "../src/rules/components/BaseStats.js";
import { DerivedExpression } from "../src/rules/components/DerivedExpression.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { ProcEffect } from "../src/rules/components/ProcEffect.js";
import { ProcNode } from "../src/rules/components/ProcNode.js";
import { AuraField } from "../src/rules/components/AuraField.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Position } from "../src/rules/components/Position.js";
import { Stamina } from "../src/rules/components/Stamina.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import {
  createProcAccumulator,
  evaluateActorProcs,
  evaluateAuraProcNodes,
  projectResourceRestore,
} from "../src/rules/utils/procEvaluator.js";

function addChild(world, parentId, Comp, value = {}) {
  const id = world.create();
  world.add(id, Comp, value);
  attach(world, id, parentId);
  return id;
}

Deno.test("evaluateAuraProcNodes evaluates current allied recipients spatially", () => {
  const world = new World({ seed: 1234 });
  const captain = world.create();
  const ally = world.create();
  const enemy = world.create();
  const aura = world.create();
  const proc = world.create();

  world.add(captain, Position, { x: 5, y: 5 });
  world.add(captain, Faction, { key: "enemy" });
  world.add(captain, Vitality, { hp: 20, maxHp: 20 });
  world.add(ally, Position, { x: 6, y: 5 });
  world.add(ally, Faction, { key: "enemy" });
  world.add(ally, Vitality, { hp: 20, maxHp: 20 });
  world.add(enemy, Position, { x: 7, y: 5 });
  world.add(enemy, Faction, { key: "player" });
  world.add(enemy, Vitality, { hp: 20, maxHp: 20 });
  world.add(aura, Position, { x: 5, y: 5 });
  world.add(aura, AuraField, { sourceId: captain, radius: 2, targetRelation: "allied" });
  attach(world, aura, captain);
  world.add(proc, ProcNode, { priority: 1 });
  attach(world, proc, aura);
  const effect = addChild(world, proc, ProcEffect, { kind: "applyStatus", a: "hastened", b: 1, c: 1 });

  const inside = evaluateAuraProcNodes(world, aura);
  assertEquals(inside.map((entry) => entry.targetId), [captain, ally]);
  assertEquals(inside[1].context.aura, aura);
  assertEquals(inside[1].context.phase, "inside");
  assertEquals(inside[1].out.statusesToApply[0].target, ally);
  assertEquals(inside[1].out.statusesToApply[0].source, effect);

  const lateAlly = world.create();
  world.add(lateAlly, Position, { x: 6, y: 6 });
  world.add(lateAlly, Faction, { key: "enemy" });
  world.add(lateAlly, Vitality, { hp: 20, maxHp: 20 });
  const entered = evaluateAuraProcNodes(world, aura, { phase: "enter" });
  assertEquals(entered.map((entry) => entry.targetId), [captain, ally, lateAlly]);
  assertEquals(entered[2].context.phase, "enter");
});

Deno.test("evaluateActorProcs resolves passive source stats before gated proc effects", () => {
  const world = new World({ seed: 1234 });
  const actor = world.create();
  const target = world.create();
  const weapon = world.create();
  const sapphire = world.create();
  const topazProc = world.create();
  const opalProc = world.create();

  world.add(actor, BaseStats, {
    intelligence: 6,
    dexterity: 10,
    critChance: 0.05,
    baseDamageMin: 4,
    baseDamageMax: 8,
  });
  world.add(actor, Equipment, { weapon });
  world.add(actor, Stamina, { stamina: 8, maxStamina: 12, staminaRegen: 0 });
  world.add(target, Vitality, { hp: 20, maxHp: 20 });
  world.add(actor, Vitality, { hp: 12, maxHp: 12 });

  attach(world, sapphire, weapon);
  attach(world, topazProc, weapon);
  attach(world, opalProc, weapon);

  addChild(world, sapphire, DerivedExpression, {
    target: "intelligence",
    kind: "addConst",
    value: 4,
    stage: "base",
    priority: 10,
  });

  world.add(topazProc, ProcNode, { priority: 5 });
  addChild(world, topazProc, ActivationGate, { kind: "eventKind", a: "onHit", priority: 1 });
  addChild(world, topazProc, ActivationGate, { kind: "chance", b: 1, priority: 2 });
  addChild(world, topazProc, ProcEffect, {
    kind: "bonusDamageScaleFromSourceStat",
    a: "intelligence",
    b: 0.3,
    c: "arcane",
    priority: 10,
  });
  addChild(world, topazProc, ProcEffect, {
    kind: "restoreResource",
    a: "stamina",
    b: 4,
    c: "source",
    priority: 20,
  });

  world.add(opalProc, ProcNode, { priority: 10 });
  addChild(world, opalProc, ActivationGate, { kind: "eventKind", a: "onCrit", priority: 1 });
  addChild(world, opalProc, ProcEffect, {
    kind: "applyStatus",
    a: "bleed",
    b: 3,
    c: 1,
    priority: 10,
  });

  const onHitOut = evaluateActorProcs(world, actor, {
    kind: "onHit",
    source: actor,
    target,
    item: weapon,
    damage: { amount: 7, type: "physical", crit: false, blocked: false },
    tags: new Set(["melee"]),
    scratch: {},
  });

  assertEquals(onHitOut.bonusDamage, [
    { source: onHitOut.bonusDamage[0].source, min: 3, max: 3, type: "arcane" },
  ]);
  assertEquals(onHitOut.resourcesToRestore, [
    { source: onHitOut.resourcesToRestore[0].source, target: actor, resource: "stamina", amount: 4 },
  ]);
  assertEquals(onHitOut.statusesToApply, []);
  assertEquals(projectResourceRestore(world, actor, "stamina", 4), 4);

  const onCritOut = evaluateActorProcs(world, actor, {
    kind: "onCrit",
    source: actor,
    target,
    item: weapon,
    damage: { amount: 9, type: "physical", crit: true, blocked: false },
    tags: new Set(["melee"]),
    scratch: {},
  }, { out: createProcAccumulator() });

  assertEquals(onCritOut.statusesToApply, [
    {
      source: onCritOut.statusesToApply[0].source,
      target,
      status: { key: "bleed", turnsLeft: 3, potency: 1 },
    },
  ]);
});
