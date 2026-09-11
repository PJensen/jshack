import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Faction } from "../src/rules/components/Faction.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { getMonster } from "../src/rules/data/monsters.js";
import { getSpell } from "../src/rules/data/spells.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { hazardSystem } from "../src/rules/systems/hazardSystem.js";

function actor(world, faction, x, y, hp = 20, maxHp = hp) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Faction, { key: faction });
  world.add(id, Vitality, { hp, maxHp });
  return id;
}

function hasEffect(world, id, key) {
  return (world.get(id, ActiveEffects)?.effects || []).some((effect) => effect?.key === key);
}

Deno.test("aura monsters are cataloged with their authored ability", () => {
  const expected = [
    ["plaguebearer", "plaguebearer_aura"],
    ["war_drummer", "war_drum"],
    ["dread_warden", "dread_warden_aura"],
    ["void_priest", "void_priest_aura"],
    ["blood_herald", "blood_herald_aura"],
  ];
  for (const [monsterId, spellId] of expected) {
    const monster = getMonster(monsterId);
    assert(monster, `${monsterId} should be in the monster catalog`);
    assert(monster.learnedSpellIds.includes(spellId), `${monsterId} should know ${spellId}`);
    assert(getSpell(spellId), `${spellId} should be in the spell catalog`);
  }
});

Deno.test("plaguebearer aura poisons nearby hostiles but not allies", () => {
  const world = new World({ seed: 0xA11A });
  const caster = actor(world, "enemy", 5, 5);
  const target = actor(world, "player", 7, 5);
  const ally = actor(world, "enemy", 6, 5);
  runSpellScript(world, caster, getSpell("plaguebearer_aura"), {});

  assert(hasEffect(world, target, "poison"));
  assert(!hasEffect(world, ally, "poison"));
  assertEquals([...world.query(HazardArea)].length, 1);
});

Deno.test("war drummer aura hastens nearby allies but not hostiles", () => {
  const world = new World({ seed: 0xD2A });
  const caster = actor(world, "enemy", 5, 5);
  const ally = actor(world, "enemy", 6, 5);
  const target = actor(world, "player", 7, 5);
  runSpellScript(world, caster, getSpell("war_drum"), {});

  assert(hasEffect(world, ally, "hastened"));
  assert(!hasEffect(world, target, "hastened"));
});

Deno.test("dread warden and void priest auras apply fear and silence", () => {
  const world = new World({ seed: 0xD2EAD });
  const warden = actor(world, "enemy", 5, 5);
  const target = actor(world, "player", 6, 5);
  runSpellScript(world, warden, getSpell("dread_warden_aura"), {});
  assert(hasEffect(world, target, "fear"));

  const priest = actor(world, "enemy", 12, 5);
  const secondTarget = actor(world, "player", 13, 5);
  runSpellScript(world, priest, getSpell("void_priest_aura"), {});
  assert(hasEffect(world, secondTarget, "silenced"));
});

Deno.test("blood herald aura enrages wounded allies only", () => {
  const world = new World({ seed: 0xB100D });
  const caster = actor(world, "enemy", 5, 5);
  const wounded = actor(world, "enemy", 6, 5, 10, 20);
  const healthy = actor(world, "enemy", 7, 5, 20, 20);
  runSpellScript(world, caster, getSpell("blood_herald_aura"), {});

  assert(hasEffect(world, wounded, "berserk"));
  assert(!hasEffect(world, healthy, "berserk"));
});

Deno.test("aura fields pulse again through the hazard system", () => {
  const world = new World({ seed: 0xA11A });
  const caster = actor(world, "enemy", 5, 5);
  runSpellScript(world, caster, getSpell("war_drum"), {});
  const lateAlly = actor(world, "enemy", 6, 5);
  world.step = 1;
  hazardSystem(world);
  assert(hasEffect(world, lateAlly, "hastened"));
});
