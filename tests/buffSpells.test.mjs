import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { SPELL_DEFS } from "../src/rules/data/spells.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { Position } from "../src/rules/components/Position.js";
import { Brain } from "../src/rules/components/Brain.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { getEffectiveVisionRange } from "../src/rules/utils/blind.js";
import { statusStrength } from "../src/rules/utils/statusFacade.js";

function makeCaster(world, x = 5, y = 5) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Brain, { visionRange: 8, intelligence: 10, learnedSpellIds: [] });
  return id;
}

function effectKeys(world, id) {
  const ae = world.get(id, ActiveEffects);
  const list = Array.isArray(ae?.effects) ? ae.effects : [];
  return list.map((e) => String(e?.key || ""));
}

Deno.test("buff spell defs expose requested glyphs", () => {
  assertEquals(SPELL_DEFS.verdant_ward.symbol, "\u2042");
  assertEquals(SPELL_DEFS.harmony_ward.symbol, "\u262F");
  assertEquals(SPELL_DEFS.shadow_veil.symbol, "\u2307");
});

Deno.test("verdant_ward applies long regen, stoneskin, and vision stat envelope", () => {
  const world = new World({ seed: 0xC0FFEE });
  const caster = makeCaster(world);
  const events = [];
  world.on("spell:verdant_ward", (ev) => events.push(ev));

  runSpellScript(world, caster, SPELL_DEFS.verdant_ward, {});

  const keys = effectKeys(world, caster);
  assert(keys.includes("regen"), "verdant_ward should apply regen");
  assert(keys.includes("stoneskin"), "verdant_ward should apply stoneskin");
  assert(keys.includes("stat_envelope"), "verdant_ward should apply stat_envelope");

  const ae = world.get(caster, ActiveEffects);
  const regen = ae.effects.find((e) => e?.key === "regen");
  assertEquals(Number(regen?.turnsLeft || 0), 30);

  const envelope = ae.effects.find((e) => e?.key === "stat_envelope" && e?.stat === "visionRange");
  assert(envelope, "verdant_ward should include vision envelope");
  assert(Number(envelope.toValue) > Number(envelope.startValue), "verdant_ward envelope should boost vision");
  assert(events.length === 1, "verdant_ward should emit spell event");
});

Deno.test("harmony_ward applies long multi-resistance buffs", () => {
  const world = new World({ seed: 0xA77A77 });
  const caster = makeCaster(world);

  runSpellScript(world, caster, SPELL_DEFS.harmony_ward, {});

  const ae = world.get(caster, ActiveEffects);
  const keys = effectKeys(world, caster);
  assertEquals(keys, ["harmony_ward"], "harmony_ward should have one spell-owned effect");
  assertEquals(statusStrength(world, caster, "resist_fire"), 1, "harmony_ward should project fire resist");
  assertEquals(statusStrength(world, caster, "resist_poison"), 1, "harmony_ward should project poison resist");
  assertEquals(statusStrength(world, caster, "resist_electric"), 1, "harmony_ward should project electric resist");
  assertEquals(statusStrength(world, caster, "resist_acid"), 1, "harmony_ward should project acid resist");

  assertEquals(Number(ae.effects[0]?.turnsLeft || 0), 55);
});

Deno.test("shadow_veil applies long invisibility and stealth buffs", () => {
  const world = new World({ seed: 42 });
  const caster = makeCaster(world);
  const events = [];
  world.on("spell:shadow_veil", (ev) => events.push(ev));

  runSpellScript(world, caster, SPELL_DEFS.shadow_veil, {});

  const keys = effectKeys(world, caster);
  assert(keys.includes("invisible"), "shadow_veil should apply invisibility");
  assert(keys.includes("phase_shift"), "shadow_veil should apply phase_shift");
  assert(keys.includes("shadow_cloak"), "shadow_veil should apply shadow_cloak");
  assert(keys.includes("stat_envelope"), "shadow_veil should apply stat_envelope");

  const ae = world.get(caster, ActiveEffects);
  const invis = ae.effects.find((e) => e?.key === "invisible");
  assertEquals(Number(invis?.turnsLeft || 0), 45);
  assert(events.length === 1, "shadow_veil should emit spell event");
});

Deno.test("blind spell applies immediate blackout to target vision", () => {
  const world = new World({ seed: 13 });
  const caster = makeCaster(world, 5, 5);
  world.add(caster, Faction, { key: "player" });
  world.add(caster, Vitality, { maxHp: 20, hp: 20 });

  const target = world.create();
  world.add(target, Position, { x: 6, y: 5 });
  world.add(target, Brain, { visionRange: 8, intelligence: 8, learnedSpellIds: [] });
  world.add(target, Vitality, { maxHp: 20, hp: 20 });
  world.add(target, Faction, { key: "enemy" });

  runSpellScript(world, caster, SPELL_DEFS.blind, { targetId: target, x: 6, y: 5 });

  assertEquals(getEffectiveVisionRange(world, target), 0, "blind should drop effective vision to 0 immediately");
});
