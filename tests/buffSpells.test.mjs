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
import { effectStrength, statusStrength } from "../src/rules/utils/statusFacade.js";
import { Resistances } from "../src/rules/components/Resistences.js";
import { resolveResistance } from "../src/rules/utils/dealDamage.js";
import { effectSystem } from "../src/rules/systems/effectSystem.js";

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

Deno.test("barkskin applies one authored defensive identity", () => {
  const world = new World({ seed: 0xBA7 });
  const caster = makeCaster(world);
  world.add(caster, Vitality, { maxHp: 20, hp: 10 });

  runSpellScript(world, caster, SPELL_DEFS.barkskin, {});

  const keys = effectKeys(world, caster);
  assertEquals(keys, ["barkskin"]);
  const effect = world.get(caster, ActiveEffects).effects[0];
  assertEquals(effect.potency, 2);
  assertEquals(effect.meta.recoilDamage, 1);
  assertEquals(effect.meta.tickHeal, 1);
  effectSystem(world, 1);
  assertEquals(world.get(caster, Vitality).hp, 11, "barkskin should recover one HP per tick");
});

Deno.test("barkskin reads its active mechanics from the spell definition", () => {
  const world = new World({ seed: 0xBA8 });
  const caster = makeCaster(world);
  runSpellScript(world, caster, {
    ...SPELL_DEFS.barkskin,
    activeEffect: {
      duration: 7,
      potency: 4,
      stacks: 1,
      mechanics: { recoilDamage: 3, tickHeal: 2 },
    },
  }, {});

  const effect = world.get(caster, ActiveEffects).effects[0];
  assertEquals(effect.turnsLeft, 8);
  assertEquals(effect.potency, 4);
  assertEquals(effect.meta.recoilDamage, 3);
  assertEquals(effect.meta.tickHeal, 2);
});

Deno.test("verdant_ward applies one authored recovery and perception identity", () => {
  const world = new World({ seed: 0xC0FFEE });
  const caster = makeCaster(world);
  const events = [];
  world.on("spell:verdant_ward", (ev) => events.push(ev));

  runSpellScript(world, caster, SPELL_DEFS.verdant_ward, {});

  const keys = effectKeys(world, caster);
  assertEquals(keys, ["verdant_ward"], "verdant_ward should have one spell-owned effect");

  const ae = world.get(caster, ActiveEffects);
  const ward = ae.effects.find((e) => e?.key === "verdant_ward");
  assertEquals(Number(ward?.turnsLeft || 0), 30);
  assertEquals(ward?.meta?.tickHeal, 1);
  assert(Number(ward.meta.visionTo) > Number(ward.meta.visionStart), "verdant_ward should boost vision");
  assert(events.length === 1, "verdant_ward should emit spell event");
});

Deno.test("verdant_ward reads its active mechanics from the spell definition", () => {
  const world = new World({ seed: 0xC0FFEE });
  const caster = makeCaster(world);
  runSpellScript(world, caster, {
    ...SPELL_DEFS.verdant_ward,
    activeEffect: {
      duration: 8,
      potency: 6,
      stacks: 1,
      mechanics: { tickHeal: 4, visionRampIn: 2, visionHold: 3, visionRampOut: 2 },
    },
  }, {});

  const ward = world.get(caster, ActiveEffects).effects[0];
  assertEquals(ward.turnsLeft, 8);
  assertEquals(ward.potency, 6);
  assertEquals(ward.meta.tickHeal, 4);
  assertEquals(ward.meta.visionHold, 3);
});

Deno.test("harmony_ward applies long multi-resistance buffs", () => {
  const world = new World({ seed: 0xA77A77 });
  const caster = makeCaster(world);

  runSpellScript(world, caster, SPELL_DEFS.harmony_ward, {});

  const ae = world.get(caster, ActiveEffects);
  const keys = effectKeys(world, caster);
  assertEquals(keys, ["harmony_ward"], "harmony_ward should have one spell-owned effect");
  assertEquals(effectStrength(world, caster, "harmony_ward"), 1, "harmony_ward should own its ward strength");
  assertEquals(statusStrength(world, caster, "resist_fire"), 0, "harmony_ward should not project a legacy fire status");

  assertEquals(Number(ae.effects[0]?.turnsLeft || 0), 55);
});

Deno.test("harmony_ward feeds resistance resolution without legacy statuses", () => {
  const world = new World({ seed: 0xA77A78 });
  const caster = makeCaster(world);
  world.add(caster, Resistances, { thermal: { burnMult: 1 } });

  runSpellScript(world, caster, SPELL_DEFS.harmony_ward, {});

  assertEquals(resolveResistance(world, caster, 20, "fire"), 0);
});

Deno.test("harmony_ward reads its active mechanics from the spell definition", () => {
  const world = new World({ seed: 0xA77A78 });
  const caster = makeCaster(world);
  runSpellScript(world, caster, {
    ...SPELL_DEFS.harmony_ward,
    activeEffect: {
      duration: 12,
      potency: 3,
      stacks: 2,
      mechanics: { resistances: ['fire', 'acid'] },
    },
  }, {});

  const ward = world.get(caster, ActiveEffects).effects[0];
  assertEquals(ward.turnsLeft, 12);
  assertEquals(ward.potency, 3);
  assertEquals(ward.stacks, 2);
  assertEquals(ward.meta.resistances, ['fire', 'acid']);
});

Deno.test("shadow_veil applies one authored stealth identity", () => {
  const world = new World({ seed: 42 });
  const caster = makeCaster(world);
  const events = [];
  world.on("spell:shadow_veil", (ev) => events.push(ev));

  runSpellScript(world, caster, SPELL_DEFS.shadow_veil, {});

  const keys = effectKeys(world, caster);
  assertEquals(keys, ["shadow_veil"], "shadow_veil should have one spell-owned effect");

  const ae = world.get(caster, ActiveEffects);
  const veil = ae.effects.find((e) => e?.key === "shadow_veil");
  assertEquals(Number(veil?.turnsLeft || 0), 45);
  assertEquals(veil?.meta?.ambushReady, true);
  assertEquals(Math.round(getEffectiveVisionRange(world, caster)), 10);
  assert(events.length === 1, "shadow_veil should emit spell event");
});

Deno.test("shadow_veil reads its active mechanics from the spell definition", () => {
  const world = new World({ seed: 42 });
  const caster = makeCaster(world);
  runSpellScript(world, caster, {
    ...SPELL_DEFS.shadow_veil,
    activeEffect: {
      duration: 12,
      potency: 3,
      stacks: 2,
      capabilities: ['concealed', 'phase_shift'],
      mechanics: { visionBonus: 5, visionRampIn: 1, visionHold: 8, visionRampOut: 3 },
    },
  }, {});

  const veil = world.get(caster, ActiveEffects).effects[0];
  assertEquals(veil.turnsLeft, 12);
  assertEquals(veil.potency, 3);
  assertEquals(veil.stacks, 2);
  assertEquals(veil.meta.visionTo - veil.meta.visionStart, 5);
  assertEquals(veil.meta.visionHold, 8);
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
