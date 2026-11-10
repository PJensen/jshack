// @ts-nocheck
import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { castSpellSystem } from "../src/rules/systems/castSpellSystem.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Brain } from "../src/rules/components/Brain.js";
import { Mana } from "../src/rules/components/Mana.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";

const FLASH_HEAL = { id: "flash_heal", name: "Flash Heal", manaCost: 14, script: "flash_heal", targeting: "self" };

function makeActor(world, x, y, hp = 10, maxHp = 10, faction = "ally") {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Vitality, { hp, maxHp });
  world.add(id, Faction, { key: faction });
  return id;
}

Deno.test("flash_heal: restores 22% max HP and emits spell:flash_heal event", () => {
  const world = new World({ seed: 0xC0FFEE });
  const actor = makeActor(world, 8, 9, 7, 30);
  world.add(actor, Brain, { intelligence: 10 });
  const events = [];
  world.on("spell:flash_heal", (e) => events.push(e));

  runSpellScript(world, actor, FLASH_HEAL, { x: 100, y: 100 });

  const vit = world.get(actor, Vitality);
  assertEquals(vit.hp, 13, "flash_heal should restore floor(maxHp * 0.22)");
  assertEquals(events.length, 1);
  assertEquals(events[0].actor, actor);
  assertEquals(events[0].targetId, actor);
  assertEquals(events[0].at, { x: 8, y: 9 });
  assertEquals(events[0].amount, 6, "event amount should match actual healed HP");
  assertEquals(events[0].spellLevel, 1, "flash_heal should report baseline spell level");
  assertEquals(events[0].splashHits, []);
});

Deno.test("flash_heal: deals small AoE damage to adjacent hostiles only", () => {
  const world = new World({ seed: 0xC0FFEE });
  const actor = makeActor(world, 5, 5, 10, 30, "player");
  const enemy = makeActor(world, 6, 5, 8, 8, "enemy");
  const ally = makeActor(world, 4, 5, 8, 8, "player");
  const neutral = makeActor(world, 5, 6, 8, 8, "neutral");
  const farEnemy = makeActor(world, 8, 5, 8, 8, "enemy");
  const events = [];
  world.on("spell:flash_heal", (e) => events.push(e));

  runSpellScript(world, actor, FLASH_HEAL, {});

  assertEquals(world.get(enemy, Vitality).hp, 6, "adjacent hostile should take 2 splash damage");
  assertEquals(world.get(ally, Vitality).hp, 8, "adjacent ally should not take splash damage");
  assertEquals(world.get(neutral, Vitality).hp, 8, "adjacent neutral should not take splash damage");
  assertEquals(world.get(farEnemy, Vitality).hp, 8, "hostiles outside radius should not take splash damage");
  assertEquals(events.length, 1);
  assertEquals(events[0].splashHits.length, 1);
  assertEquals(events[0].splashHits[0].id, enemy);
  assertEquals(events[0].splashHits[0].amount, 2);
});

Deno.test("flash_heal: healing is clamped by max HP", () => {
  const world = new World({ seed: 0xC0FFEE });
  const actor = makeActor(world, 2, 3, 28, 30);
  const events = [];
  world.on("spell:flash_heal", (e) => events.push(e));

  runSpellScript(world, actor, FLASH_HEAL, {});

  const vit = world.get(actor, Vitality);
  assertEquals(vit.hp, 30, "flash_heal should not exceed max HP");
  assertEquals(events.length, 1);
  assertEquals(events[0].amount, 2, "event amount should reflect clamped healing");
});

Deno.test("flash_heal: consumes 14 mana on cast", () => {
  const world = new World({ seed: 42 });
  world.setScheduler((w) => castSpellSystem(w));
  const actor = makeActor(world, 1, 1, 10, 20, "player");
  world.add(actor, Brain, { learnedSpellIds: ["flash_heal"], intelligence: 10 });
  world.add(actor, Mana, { maxMana: 55, mana: 55, manaRegen: 0.13 });

  world.add(actor, CastSpellIntent, { spellId: "flash_heal" });
  world.tick(1);

  const mana = world.get(actor, Mana);
  assertEquals(mana.mana, 41);
});
