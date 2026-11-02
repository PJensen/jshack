import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Faction } from "../src/rules/components/Faction.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { PROC_PACKAGE_KEYS } from "../src/rules/data/procPackages.js";
import { runScript, ScriptVerb } from "../src/rules/scripting.js";

function makeContext(overrides = {}) {
  const directDamage = [];
  const statuses = [];
  const messages = [];
  let multiplier = 1;
  return {
    source: overrides.source ?? 1,
    target: overrides.target ?? 2,
    kind: overrides.kind ?? "onHit",
    damage: overrides.damage ?? { amount: 10, type: "physical", crit: false },
    tags: overrides.tags ?? new Set(),
    from: overrides.from,
    proc: {
      multiplyDamage(value) { multiplier *= Number(value); },
      addBonusDamage() {},
      dealDamage(target, amount, type, options = {}) { directDamage.push({ target, amount, type, ...options }); },
      applyStatus(target, key, turnsLeft, potency) { statuses.push({ target, key, turnsLeft, potency }); },
      message(text) { messages.push(text); },
      entitiesInRadius() { return overrides.entitiesInRadius || []; },
    },
    get multiplier() { return multiplier; },
    directDamage,
    statuses,
    messages,
  };
}

Deno.test("special gear packages trigger their authored moments", () => {
  const world = new World({ seed: 41 });
  const actor = world.create();
  const target = world.create();
  const nearby = world.create();
  world.add(actor, Vitality, { maxHp: 30, hp: 30 });
  world.add(target, Vitality, { maxHp: 30, hp: 30 });
  world.add(nearby, Vitality, { maxHp: 30, hp: 30 });
  world.add(actor, Faction, { key: "player" });
  world.add(target, Faction, { key: "enemy" });
  world.add(nearby, Faction, { key: "enemy" });
  world.add(target, ActiveEffects, { effects: [] });
  world.add(actor, ActiveEffects, { effects: [] });
  world.add(actor, Position, { x: 2, y: 2 });
  world.add(target, Position, { x: 3, y: 2 });
  world.add(nearby, Position, { x: 4, y: 2 });

  runScript(PROC_PACKAGE_KEYS.BracersReversal, ScriptVerb.ProcEvaluate, world, makeContext({ source: actor, kind: "onDodge" }));
  const reversal = makeContext({ source: actor, target, kind: "onBeforeHit", damage: { amount: 10, crit: false } });
  runScript(PROC_PACKAGE_KEYS.BracersReversal, ScriptVerb.ProcEvaluate, world, reversal);
  assertEquals(reversal.multiplier, 2);

  for (let i = 0; i < 3; i++) {
    runScript(PROC_PACKAGE_KEYS.DeadeyeLoop, ScriptVerb.ProcEvaluate, world, makeContext({
      source: actor,
      target,
      kind: "onHit",
      tags: new Set(["ranged"]),
      entitiesInRadius: [nearby],
    }));
  }
  assert(world.get(actor, ActiveEffects).effects.every((entry) => entry.key !== "deadeye_count"));

  const mark = makeContext({ source: actor, target, kind: "onSpellHit" });
  runScript(PROC_PACKAGE_KEYS.WitchKing, ScriptVerb.ProcEvaluate, world, mark);
  const detonate = makeContext({ source: actor, target, kind: "onBeforeHit" });
  runScript(PROC_PACKAGE_KEYS.WitchKing, ScriptVerb.ProcEvaluate, world, detonate);
  assert(detonate.directDamage.some((entry) => entry.type === "shadow"));
  assert(detonate.statuses.some((entry) => entry.key === "weaken"));

  const gambler = makeContext({ source: actor, target, kind: "onBeforeHit", damage: { amount: 10, crit: false } });
  runScript(PROC_PACKAGE_KEYS.GamblerMantle, ScriptVerb.ProcEvaluate, world, gambler);
  assertEquals(gambler.multiplier, 0.85);
});

Deno.test("cinderwake leaves fire at the tile just left", () => {
  const world = new World({ seed: 43 });
  const actor = world.create();
  world.add(actor, Position, { x: 5, y: 5 });
  const ctx = makeContext({ source: actor, kind: "onStep", from: { x: 4, y: 5 }, tags: new Set() });
  runScript(PROC_PACKAGE_KEYS.Cinderwake, ScriptVerb.ProcEvaluate, world, ctx);
  const hazards = [...world.query(Position, HazardArea)];
  assertEquals(hazards.length, 1);
  assertEquals(hazards[0][1].x, 4);
  assertEquals(hazards[0][2].kind, "fire");
});
