// @ts-nocheck
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { BaseStats } from "../src/rules/components/BaseStats.js";
import { Brain } from "../src/rules/components/Brain.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";
import { Channeling } from "../src/rules/components/Channeling.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Mana } from "../src/rules/components/Mana.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { getSpell } from "../src/rules/data/spells.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { effectSystem } from "../src/rules/systems/effectSystem.js";
import { castSpellSystem } from "../src/rules/systems/castSpellSystem.js";
import { channelingDamageReactionSystem } from "../src/rules/systems/damageReactions/channelingDamageReactionSystem.js";
import { dealDamage } from "../src/rules/utils/dealDamage.js";

function actor(world, x, y, hp = 10, maxHp = 30, faction = "ally") {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Vitality, { hp, maxHp });
  world.add(id, Faction, { key: faction });
  return id;
}

Deno.test("renewal applies a timed heal-over-time effect", () => {
  const world = new World({ seed: 11 });
  const caster = actor(world, 0, 0, 30, 30);
  const target = actor(world, 2, 0, 5, 30);

  runSpellScript(world, caster, { id: "renewal", script: "renewal", range: 6 }, { targetId: target });

  assertEquals(world.get(target, Vitality).hp, 5, "renewal should not heal immediately");
  const effect = world.get(target, ActiveEffects)?.effects?.find((entry) => entry.key === "renewal");
  assert(effect, "renewal should leave a timed effect");
  assertEquals(effect.potency, 2, "baseline renewal should heal 2 HP per tick");
  const before = world.get(target, Vitality).hp;
  effectSystem(world);
  assert(world.get(target, Vitality).hp > before, "renewal should tick through effectSystem");
});

Deno.test("Renewal ticks can crit using the caster's snapshot", () => {
  const world = new World({ seed: 11 });
  const caster = actor(world, 0, 0, 30, 30);
  const target = actor(world, 2, 0, 5, 30);
  world.add(caster, BaseStats, { critChance: 0.95, critMultiplier: 2 });
  const healed = [];
  world.on("healed", (event) => healed.push(event));

  runSpellScript(world, caster, { id: "renewal", script: "renewal", range: 6 }, { targetId: target });
  world.remove(caster, BaseStats);
  effectSystem(world);
  effectSystem(world);

  assertEquals(healed.map((event) => [event.source, event.amount, event.critical]), [
    [caster, 5, true], [caster, 5, true],
  ]);
});

Deno.test("direct and channeled spell heals can crit and still cap at max HP", () => {
  const world = new World({ seed: 12 });
  const caster = actor(world, 0, 0, 29, 30);
  const ally = actor(world, 2, 0, 5, 30);
  world.add(caster, BaseStats, { critChance: 0.95 });
  const healed = [];
  world.on("healed", (event) => healed.push(event));

  runSpellScript(world, caster, { id: "flash_heal", script: "flash_heal" }, {});
  runSpellScript(world, caster, { id: "lifebloom", script: "lifebloom", radius: 3 }, { _channelTick: true });

  assertEquals(healed.map((event) => [event.cause, event.amount, event.critical]), [
    ["spell:flash_heal", 1, true], ["spell:lifebloom", 10, true],
  ]);
  assertEquals(world.get(ally, Vitality).hp, 15);
});

Deno.test("lifebloom heals multiple nearby allies on each sustain tick", () => {
  const world = new World({ seed: 12 });
  const caster = actor(world, 0, 0, 20, 30);
  const ally = actor(world, 2, 0, 5, 30);
  const farAlly = actor(world, 5, 0, 5, 30);

  runSpellScript(world, caster, { id: "lifebloom", script: "lifebloom", radius: 3 }, { _channelTick: true });

  assert(world.get(ally, Vitality).hp > 5);
  assertEquals(world.get(farAlly, Vitality).hp, 5);
});

Deno.test("spell recovery ticks can crit while ordinary regeneration keeps its fixed amount", () => {
  const world = new World({ seed: 13 });
  const caster = actor(world, 0, 0, 5, 30);
  world.add(caster, BaseStats, { critChance: 0.95 });
  const healed = [];
  world.on("healed", (event) => healed.push(event));

  runSpellScript(world, caster, getSpell("verdant_ward"), {});
  runSpellScript(world, caster, getSpell("consecrate"), {});
  world.get(caster, ActiveEffects).effects.push({ key: "regen", potency: 1, turnsLeft: 2, sourceId: caster });
  effectSystem(world);

  assertEquals(healed.map((event) => [event.cause, event.amount, !!event.critical]), [
    ["verdant_ward:recovery", 2, true], ["consecrate:recovery", 4, true], ["regen", 1, false],
  ]);
});

Deno.test("sacred restoration is a damage-interruptible cast", () => {
  const world = new World({ seed: 13 });
  const caster = actor(world, 0, 0, 30, 30);
  const target = actor(world, 2, 0, 5, 30);
  world.add(caster, Brain, { learnedSpellIds: ["sacred_restoration"], intelligence: 10 });
  world.add(caster, Mana, { mana: 40, maxMana: 40 });
  world.add(caster, CastSpellIntent, { spellId: "sacred_restoration", targetId: target, x: 2, y: 0 });

  castSpellSystem(world);
  assert(world.has(caster, Channeling));
  assertEquals(world.get(caster, Channeling).breakOnDamage, true);

  dealDamage(world, { target: caster, source: target, amount: 1, type: "physical", cause: "test" });
  channelingDamageReactionSystem(world);
  assert(!world.has(caster, Channeling), "damage should interrupt the long heal");
  assertEquals(world.get(target, Vitality).hp, 5, "interrupted cast should not heal");
});

Deno.test("cast damage can be authored as a setback instead of a break", () => {
  const world = new World({ seed: 14 });
  const caster = actor(world, 0, 0, 30, 30);
  const source = actor(world, 1, 0, 30, 30, "enemy");
  world.add(caster, Channeling, {
    mode: "cast",
    spellId: "test_setback",
    turnsRemaining: 2,
    damageSetbackTurns: 1,
  });

  dealDamage(world, { target: caster, source, amount: 1, type: "physical", cause: "test" });
  channelingDamageReactionSystem(world);
  assert(world.has(caster, Channeling));
  assertEquals(world.get(caster, Channeling).turnsRemaining, 3);
});

Deno.test("healing spell strength uses the caster's intelligence", () => {
  const world = new World({ seed: 15 });
  const low = actor(world, 0, 0, 1, 40);
  const high = actor(world, 0, 0, 1, 40);
  world.add(low, Brain, { intelligence: 10 });
  world.add(high, Brain, { intelligence: 18 });

  const flashEvents = [];
  world.on("spell:flash_heal", (event) => flashEvents.push(event));
  runSpellScript(world, low, { id: "flash_heal", script: "flash_heal" }, {});
  runSpellScript(world, high, { id: "flash_heal", script: "flash_heal" }, {});
  assert(flashEvents[1].amount > flashEvents[0].amount, "Flash Heal should scale with caster INT");

  const lowTarget = actor(world, 2, 0, 1, 40);
  const highTarget = actor(world, 2, 0, 1, 40);
  runSpellScript(world, low, { id: "renewal", script: "renewal", range: 6 }, { targetId: lowTarget });
  runSpellScript(world, high, { id: "renewal", script: "renewal", range: 6 }, { targetId: highTarget });
  const lowEffect = world.get(lowTarget, ActiveEffects).effects.find((entry) => entry.key === "renewal");
  const highEffect = world.get(highTarget, ActiveEffects).effects.find((entry) => entry.key === "renewal");
  assert(highEffect.potency > lowEffect.potency, "Renewal should snapshot caster INT into its HoT");
});
