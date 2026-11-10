import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createPlayer } from "../src/rules/archetypes/Player.js";
import { Brain } from "../src/rules/components/Brain.js";
import { Mana } from "../src/rules/components/Mana.js";
import { Status } from "../src/rules/components/Status.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";
import { castSpellSystem } from "../src/rules/systems/castSpellSystem.js";
import { channelingSystem } from "../src/rules/systems/channelingSystem.js";

function configureCaster(world, learnedSpellIds) {
  const caster = createPlayer(world, { name: "Mage" });
  const brain = world.get(caster, Brain);
  brain.learnedSpellIds = [...learnedSpellIds];

  const mana = world.get(caster, Mana);
  mana.mana = 30;
  mana.maxMana = 30;

  world.add(caster, Status, {
    statuses: [{ type: "confused", duration: 5, potency: 1, stacks: 1 }],
  });

  return caster;
}

Deno.test("castSpellSystem: confused caster miscasts to a different learned spell", () => {
  const world = new World({ seed: 0xC0FFEE });
  world.setScheduler((w) => castSpellSystem(w));
  const caster = configureCaster(world, ["lightning", "frost"]);

  const castEvents = [];
  const miscastEvents = [];
  const fizzleEvents = [];
  world.on("castSpell", (e) => castEvents.push(e));
  world.on("spell:miscast", (e) => miscastEvents.push(e));
  world.on("spell:fizzle", (e) => fizzleEvents.push(e));

  world.add(caster, CastSpellIntent, { spellId: "lightning" });
  world.tick(1);

  assertEquals(fizzleEvents.length, 0, "should miscast instead of fizzle when alternate spell exists");
  assertEquals(miscastEvents.length, 1, "miscast event should be emitted");
  assertEquals(miscastEvents[0].fromSpellId, "lightning");
  assertEquals(miscastEvents[0].toSpellId, "frost");

  assertEquals(castEvents.length, 1, "miscast should still produce cast event");
  assertEquals(castEvents[0].spellId, "frost");
  assertEquals(castEvents[0].miscast, true);

  const mana = world.get(caster, Mana);
  assertEquals(mana.mana, 25, "miscast should consume mana for the actual spell (frost costs 5)");
});

Deno.test("castSpellSystem: confused caster fizzles when no alternate learned spell exists", () => {
  const world = new World({ seed: 0xA77A77 });
  world.setScheduler((w) => castSpellSystem(w));
  const caster = configureCaster(world, ["lightning"]);

  const castEvents = [];
  const fizzleEvents = [];
  world.on("castSpell", (e) => castEvents.push(e));
  world.on("spell:fizzle", (e) => fizzleEvents.push(e));

  world.add(caster, CastSpellIntent, { spellId: "lightning" });
  world.tick(1);

  assertEquals(castEvents.length, 0, "fizzle should not emit castSpell");
  assertEquals(fizzleEvents.length, 1, "fizzle event should be emitted");
  assertEquals(fizzleEvents[0].spellId, "lightning");

  const mana = world.get(caster, Mana);
  assertEquals(mana.mana, 23, "fizzle should still consume mana for the attempted spell");
});

Deno.test("castSpellSystem: blink is not replaced by confusion miscast logic", () => {
  const world = new World({ seed: 0xC0FFEE });
  world.setScheduler((w) => castSpellSystem(w));
  const caster = configureCaster(world, ["blink", "lightning"]);

  const castEvents = [];
  const miscastEvents = [];
  world.on("castSpell", (e) => castEvents.push(e));
  world.on("spell:miscast", (e) => miscastEvents.push(e));

  world.add(caster, CastSpellIntent, { spellId: "blink", x: 3, y: 3 });
  world.tick(1);

  assertEquals(miscastEvents.length, 0, "blink should preserve its script-driven confusion behavior");
  assertEquals(castEvents.length, 1);
  assertEquals(castEvents[0].spellId, "blink");
});

Deno.test("castSpellSystem: flash_heal remains reliable while confused", () => {
  const world = new World({ seed: 0xC0FFEE });
  world.setScheduler((w) => {
    channelingSystem(w);
    castSpellSystem(w);
  });
  const caster = configureCaster(world, ["flash_heal", "lightning"]);

  const vit = world.get(caster, Vitality);
  vit.maxHp = 30;
  vit.hp = 6;

  const castEvents = [];
  const miscastEvents = [];
  const fizzleEvents = [];
  world.on("castSpell", (e) => castEvents.push(e));
  world.on("spell:miscast", (e) => miscastEvents.push(e));
  world.on("spell:fizzle", (e) => fizzleEvents.push(e));

  world.add(caster, CastSpellIntent, { spellId: "flash_heal" });
  world.tick(1);
  world.tick(1);

  assertEquals(miscastEvents.length, 0, "flash_heal should not miscast while confused");
  assertEquals(fizzleEvents.length, 0, "flash_heal should not fizzle while confused");
  assertEquals(castEvents.length, 1, "flash_heal should emit castSpell");
  assertEquals(castEvents[0].spellId, "flash_heal");

  const afterVit = world.get(caster, Vitality);
  assertEquals(afterVit.hp, 12, "flash_heal should restore 22% max HP while confused");

  const mana = world.get(caster, Mana);
  assertEquals(mana.mana, 16, "flash_heal should consume its own mana cost");
});
