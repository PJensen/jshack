import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { serializeWorld } from "../src/lib/ecs-js/serialization.js";
import { ActiveEffects, Duration, EffectInstance, PeriodicEffect, Player, Position, Stamina, Vitality } from "../src/rules/components/index.js";
import { Mana } from "../src/rules/components/Mana.js";
import { EffectChanged } from "../src/events/EffectChanged.js";
import { registerEffectDefinition } from "../src/rules/data/effectInstances.js";
import { effectSystem } from "../src/rules/systems/effectSystem.js";
import { cleanupSystem } from "../src/rules/systems/cleanupSystem.js";
import { applyEffectInstance, removeEffectInstance, snapshotEffectInstances } from "../src/rules/utils/effectInstances.js";
import { statusStrength } from "../src/rules/utils/statusFacade.js";
import { buildEffectRows } from "../src/main/ui/effectRows.js";
import { getSavegameRegistryNames } from "../src/main/wiring/savegameSerializationRegistry.js";
import { restoreSnapshotFromSavegame } from "../src/main/wiring/savegameLoad.js";

registerEffectDefinition("test_composite_drain", {
  statuses: ["hastened"],
  periodic: [{ operation: "damage", amount: 2, interval: 2 }, { operation: "mana_drain", amount: 3, interval: 3 }],
});
registerEffectDefinition("test_independent", { stacking: "independent", periodic: [] });
registerEffectDefinition("test_by_source", { match: "actor", statuses: ["weakened"], periodic: [] });
registerEffectDefinition("test_stack", { stacking: "stack", maxStacks: 2, periodic: [{ operation: "heal", amount: 2 }, { operation: "mana_drain", amount: 3 }] });
registerEffectDefinition("test_extend", { stacking: "extend", periodic: [] });
registerEffectDefinition("test_replace", { stacking: "replace", periodic: [] });

function setup() {
  const world = new World({ seed: 613 });
  world.setScheduler(effectSystem);
  const actor = world.create();
  world.add(actor, Player, {});
  world.add(actor, Position, { x: -8, y: -8 });
  world.add(actor, Vitality, { hp: 10, maxHp: 100 });
  world.add(actor, Stamina, { stamina: 0, maxStamina: 100, staminaRegen: 0 });
  world.add(actor, Mana, { mana: 30, maxMana: 30 });
  return { world, actor };
}

Deno.test("effect instances retain composite identity after source consumption and clean up all children", () => {
  const { world, actor } = setup();
  const source = world.create();
  const phases = [];
  world.on(EffectChanged, (event) => phases.push(event.phase));
  const instance = applyEffectInstance(world, actor, { key: "town_stew", turnsLeft: 3, sourceId: source, sourceKey: "food_stew" });
  world.destroy(source);
  assertEquals(world.get(actor, ActiveEffects), null);
  assertEquals([...world.query(PeriodicEffect)].length, 2);
  assertEquals(buildEffectRows(world, actor).map((row) => [row.name, row.glyph, row.turns]), [["Town Stew", "%", 3]]);
  effectSystem(world); // Same application turn must not tick.
  world.tick(0);
  assertEquals(world.get(actor, Vitality).hp, 10);
  world.tick(1);
  assertEquals(world.get(actor, Vitality).hp, 11);
  assertEquals(world.get(actor, Stamina).stamina, 1);
  assertEquals(statusStrength(world, actor, "town_stew"), 1);
  assertEquals(world.get(instance, Duration).turnsLeft, 2);
  effectSystem(world); // Duplicate resolution in the same turn is harmless.
  assertEquals(world.get(actor, Vitality).hp, 11);
  world.tick(1);
  world.tick(1);
  assertEquals(world.get(actor, Vitality).hp, 13);
  assertEquals(statusStrength(world, actor, "town_stew"), 0);
  assertEquals(buildEffectRows(world, actor), []);
  assertEquals([...world.query(EffectInstance)].length, 0);
  assertEquals([...world.query(PeriodicEffect)].length, 0);
  assertEquals(phases, ["applied", "removed"]);
});

Deno.test("periodic operations have independent cadence and expiration boundaries", () => {
  const { world, actor } = setup();
  applyEffectInstance(world, actor, { key: "test_composite_drain", turnsLeft: 6 });
  for (let turn = 1; turn <= 6; turn++) {
    world.tick(1);
    assertEquals(world.get(actor, Vitality).hp, 10 - Math.floor(turn / 2) * 2);
    assertEquals(world.get(actor, Mana).mana, 30 - Math.floor(turn / 3) * 3);
  }
  assertEquals(snapshotEffectInstances(world, actor), []);
});

Deno.test("refresh preserves periodic cadence, source matching isolates casters, independent instances remain inspectable", () => {
  const { world, actor } = setup();
  const first = applyEffectInstance(world, actor, { key: "town_stew", turnsLeft: 3 });
  world.tick(1);
  assertEquals(applyEffectInstance(world, actor, { key: "town_stew", turnsLeft: 5 }), first);
  assertEquals(world.get(first, Duration).turnsLeft, 5);
  applyEffectInstance(world, actor, { key: "test_by_source", turnsLeft: 2, sourceActorId: 7 });
  applyEffectInstance(world, actor, { key: "test_by_source", turnsLeft: 2, sourceActorId: 8 });
  applyEffectInstance(world, actor, { key: "test_independent", turnsLeft: 2 });
  applyEffectInstance(world, actor, { key: "test_independent", turnsLeft: 2 });
  assertEquals(snapshotEffectInstances(world, actor).length, 5);
  assertEquals(statusStrength(world, actor, "weakened"), 2);
  removeEffectInstance(world, first, "dispelled");
  assertEquals(statusStrength(world, actor, "town_stew"), 0);
});

Deno.test("JSON save/load continues finite and permanent effects with the same tick outcomes and visuals", () => {
  const { world, actor } = setup();
  applyEffectInstance(world, actor, { key: "town_stew", turnsLeft: 5 });
  applyEffectInstance(world, actor, { key: "test_composite_drain", turnsLeft: Infinity });
  world.tick(1);
  world.tick(1);
  const saved = JSON.parse(JSON.stringify({ world: serializeWorld(world, { include: getSavegameRegistryNames(world) }) }));
  const restored = new World({ seed: 613 });
  restoreSnapshotFromSavegame(restored, saved);
  restored.setScheduler(effectSystem);
  assertEquals(buildEffectRows(restored, actor), buildEffectRows(world, actor));
  for (let i = 0; i < 4; i++) {
    world.tick(1);
    restored.tick(1);
    assertEquals(restored.get(actor, Vitality), world.get(actor, Vitality));
    assertEquals(restored.get(actor, Mana), world.get(actor, Mana));
    assertEquals(buildEffectRows(restored, actor), buildEffectRows(world, actor));
  }
  assertEquals(snapshotEffectInstances(restored, actor)[0].turns, Infinity);
});

Deno.test("legacy stew migrates once, onset delays operations, and worlds remain independent", () => {
  const { world, actor } = setup();
  const other = setup();
  world.add(actor, ActiveEffects, { effects: [{ key: "town_stew", turnsLeft: 3, potency: 1, onsetLeft: 1 }] });
  world.tick(1);
  assertEquals(world.get(actor, ActiveEffects).effects, []);
  assertEquals([...world.query(EffectInstance)].length, 1);
  world.tick(1);
  assertEquals(world.get(actor, Vitality).hp, 10);
  world.tick(1);
  assertEquals(world.get(actor, Vitality).hp, 11);
  assertEquals(other.world.get(other.actor, Vitality).hp, 10);
  assertEquals([...other.world.query(EffectInstance)].length, 0);
});

Deno.test("effect definitions reject invalid operations and timing before runtime", () => {
  assertThrows(() => registerEffectDefinition("test_bad_op", { periodic: [{ operation: "typo", amount: 1 }] }));
  assertThrows(() => registerEffectDefinition("test_bad_time", { periodic: [{ operation: "heal", amount: 1, interval: 0 }] }));
  assertThrows(() => applyEffectInstance(setup().world, 1, { key: "town_stew", turnsLeft: 0 }));
});

Deno.test("death after the effects phase removes the complete package before actor IDs can be reused", () => {
  const { world, actor } = setup();
  applyEffectInstance(world, actor, { key: "town_stew", turnsLeft: 5 });
  world.get(actor, Vitality).hp = 0;
  applyEffectInstance(world, actor, { key: "test_independent", turnsLeft: 5 });
  cleanupSystem(world);
  assert(!world.isAlive(actor));
  assertEquals([...world.query(EffectInstance)].length, 0);
  assertEquals([...world.query(PeriodicEffect)].length, 0);
});

Deno.test("stack caps scale each operation correctly while extension and replacement have distinct lifetimes", () => {
  const { world, actor } = setup();
  for (let i = 0; i < 3; i++) applyEffectInstance(world, actor, { key: "test_stack", turnsLeft: 5 });
  world.tick(1);
  assertEquals(world.get(actor, Vitality).hp, 14);
  assertEquals(world.get(actor, Mana).mana, 24);
  const extension = applyEffectInstance(world, actor, { key: "test_extend", turnsLeft: 2 });
  applyEffectInstance(world, actor, { key: "test_extend", turnsLeft: 3 });
  assertEquals(world.get(extension, Duration).turnsLeft, 5);
  const replaced = applyEffectInstance(world, actor, { key: "test_replace", turnsLeft: 5 });
  const removals = [];
  world.on(EffectChanged, (event) => { if (event.phase === "removed") removals.push(event); });
  const replacement = applyEffectInstance(world, actor, { key: "test_replace", turnsLeft: 2 });
  assertEquals(removals.map((event) => [event.instanceId, event.reason]), [[replaced, "replaced"]]);
  assertEquals(world.get(replacement, Duration).turnsLeft, 2);
});
