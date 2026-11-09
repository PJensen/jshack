// @ts-nocheck
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Brain } from "../src/rules/components/Brain.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";
import { Channeling } from "../src/rules/components/Channeling.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Mana } from "../src/rules/components/Mana.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
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

Deno.test("renewal applies immediate healing and a timed heal-over-time effect", () => {
  const world = new World({ seed: 11 });
  const caster = actor(world, 0, 0, 30, 30);
  const target = actor(world, 2, 0, 5, 30);

  runSpellScript(world, caster, { id: "renewal", script: "renewal", range: 6 }, { targetId: target });

  assert(world.get(target, Vitality).hp > 5);
  const effect = world.get(target, ActiveEffects)?.effects?.find((entry) => entry.key === "renewal");
  assert(effect, "renewal should leave a timed effect");
  const before = world.get(target, Vitality).hp;
  effectSystem(world);
  assert(world.get(target, Vitality).hp > before, "renewal should tick through effectSystem");
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
