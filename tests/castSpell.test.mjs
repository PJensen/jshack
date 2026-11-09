// @ts-nocheck
import { assert } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { createPlayer } from '../src/rules/archetypes/Player.js';
import { Brain } from '../src/rules/components/Brain.js';
import { Mana } from '../src/rules/components/Mana.js';
import { Stamina } from '../src/rules/components/Stamina.js';
import { Player } from "../src/rules/components/Player.js";
import { CastSpellIntent } from '../src/rules/components/Intents/CastSpellIntent.js';
import { Status } from "../src/rules/components/Status.js";
import { castSpellSystem } from '../src/rules/systems/castSpellSystem.js';
import { channelingSystem } from '../src/rules/systems/channelingSystem.js';
import { Channeling } from '../src/rules/components/Channeling.js';

function scheduler(world) {
  try {
    channelingSystem(world);
    castSpellSystem(world);
  } catch (e) { console.error('cast system error', e); }
}

Deno.test("casting a spell costs mana and emits events", () => {
  const world = new World({ seed: 2 });
  world.setScheduler((w) => scheduler(w));

  const player = createPlayer(world, { name: 'Mage' });
  const brain = world.get(player, Brain);
  if (!Array.isArray(brain.learnedSpellIds)) brain.learnedSpellIds = [];
  brain.learnedSpellIds.push('lightning');
  let mana = world.get(player, Mana);
  if (!mana) { world.add(player, Mana, { maxMana: 10, mana: 10, manaRegen: 0 }); mana = world.get(player, Mana); }
  mana.mana = 10;

  const events = [];
  world.on('castSpell', (e) => events.push(['cast', e.spellId]));
  world.on('spell:oom', (e) => events.push(['oom', e.need]));

  world.add(player, CastSpellIntent, { spellId: 'lightning' });
  world.tick(1);

  const mana2 = world.get(player, Mana);
  assert(mana2.mana === 3, 'mana reduced by 7 for lightning');
  assert(events.some(e => e[0] === 'cast' && e[1] === 'lightning'), 'cast event raised');

  world.add(player, CastSpellIntent, { spellId: 'lightning' });
  world.tick(1);
  assert(events.some(e => e[0] === 'oom'), 'oom event raised');
});

Deno.test("castSpellSystem accepts legacy prefixed spell ids", () => {
  const world = new World({ seed: 2 });
  world.setScheduler((w) => scheduler(w));

  const player = createPlayer(world, { name: "Cleric" });
  const brain = world.get(player, Brain);
  brain.learnedSpellIds = ["spell:flash_heal"];

  const mana = world.get(player, Mana);
  mana.mana = 30;
  mana.maxMana = 30;

  const castEvents = [];
  world.on("castSpell", (e) => castEvents.push(e));

  world.add(player, CastSpellIntent, { spellId: "spell:flash_heal" });
  world.tick(1);

  const manaAfter = world.get(player, Mana);
  assert(manaAfter.mana === 16, "flash_heal mana cost should be applied from prefixed id");
  assert(world.has(player, Channeling), "flash_heal should begin its one-turn cast");
  assert(!castEvents.some((e) => e.spellId === "flash_heal"), "flash_heal should not resolve before its cast completes");
  world.tick(1);
  assert(castEvents.some((e) => e.spellId === "flash_heal"), "prefixed id should resolve to canonical spell id");
  assert(brain.learnedSpellIds[0] === "flash_heal", "learned spell ids should migrate to canonical ids");
});

Deno.test("casting is prevented by canonical interruption statuses", () => {
  const cases = ["silenced", "asleep", "stunned", "mindlocked"];
  for (let i = 0; i < cases.length; i++) {
    const status = cases[i];
    const world = new World({ seed: 100 + i });
    world.setScheduler((w) => scheduler(w));

    const player = createPlayer(world, { name: "Mage" });
    const brain = world.get(player, Brain);
    if (!Array.isArray(brain.learnedSpellIds)) brain.learnedSpellIds = [];
    if (!brain.learnedSpellIds.includes("lightning")) brain.learnedSpellIds.push("lightning");
    const mana = world.get(player, Mana);
    mana.mana = 10;
    mana.maxMana = 10;
    world.add(player, Status, { statuses: [{ type: status, duration: 2, potency: 1, stacks: 1 }] });

    const fizzles = [];
    const casts = [];
    world.on("spell:fizzle", (e) => fizzles.push(e));
    world.on("castSpell", (e) => casts.push(e));

    world.add(player, CastSpellIntent, { spellId: "lightning" });
    world.tick(1);

    assert(casts.length === 0, `${status} should block casting`);
    assert(fizzles.some((e) => e.reason === status || (status === "stunned" && e.reason === "stunned")), `${status} should report spell:fizzle reason`);
    assert(world.get(player, Mana).mana === 10, `${status} should block mana spend`);
  }
});

Deno.test("phase_strike spends stamina (not mana) and emits stamina oom metadata", () => {
  const world = new World({ seed: 303 });
  world.setScheduler((w) => scheduler(w));

  const player = createPlayer(world, { name: "Outlaw" });
  const brain = world.get(player, Brain);
  if (!Array.isArray(brain.learnedSpellIds)) brain.learnedSpellIds = [];
  if (!brain.learnedSpellIds.includes("phase_strike")) brain.learnedSpellIds.push("phase_strike");

  const mana = world.get(player, Mana);
  mana.mana = 50;
  const stamina = world.get(player, Stamina);
  stamina.stamina = 10;
  stamina.maxStamina = 10;
  world.remove(player, Player);

  const events = [];
  world.on("castSpell", (e) => events.push(["cast", e.spellId]));
  world.on("spell:oom", (e) => events.push(["oom", e]));

  world.add(player, CastSpellIntent, { spellId: "phase_strike" });
  world.tick(1);

  assert(events.some((e) => e[0] === "cast" && e[1] === "phase_strike"), "phase_strike should cast");
  assert(world.get(player, Stamina).stamina === 0, "phase_strike should spend stamina");
  assert(world.get(player, Mana).mana === 50, "phase_strike should not spend mana");

  world.add(player, CastSpellIntent, { spellId: "phase_strike" });
  world.tick(1);

  const oom = events.find((e) => e[0] === "oom")?.[1];
  assert(oom && oom.spellId === "phase_strike", "should emit oom for phase_strike");
  assert(oom && oom.costKind === "stamina", "oom should report stamina cost kind");
});
