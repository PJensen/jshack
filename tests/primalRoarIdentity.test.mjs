import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { SPELL_DEFS } from "../src/rules/data/spells.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Brain } from "../src/rules/components/Brain.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { resolveCombatSnapshot } from "../src/rules/utils/resolveCombatSnapshot.js";
import { statusStrength } from "../src/rules/utils/statusFacade.js";

function makeActor(world, x, y, faction) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Faction, { key: faction });
  world.add(id, Vitality, { hp: 30, maxHp: 30 });
  world.add(id, Brain, { intelligence: 10, visionRange: 8, learnedSpellIds: [] });
  return id;
}

function keys(world, id) {
  return (world.get(id, ActiveEffects)?.effects || []).map((effect) => effect.key);
}

Deno.test("primal roar has one spell-owned active identity", () => {
  const world = new World({ seed: 0xBEEF });
  const caster = makeActor(world, 5, 5, "player");
  const enemy = makeActor(world, 6, 5, "enemy");

  runSpellScript(world, caster, SPELL_DEFS.primal_roar, {});

  assertEquals(keys(world, caster), ["primal_roar"]);
  assert(!keys(world, caster).includes("berserk"));
  assert(!keys(world, caster).includes("battle_fury"));
  assert(keys(world, enemy).includes("stagger"));
});

Deno.test("primal roar uses its own combat mechanics", () => {
  const world = new World({ seed: 0xCAFE });
  const caster = makeActor(world, 5, 5, "player");

  const before = resolveCombatSnapshot(world, caster);
  runSpellScript(world, caster, SPELL_DEFS.primal_roar, {});
  const after = resolveCombatSnapshot(world, caster);

  assertEquals(after.status.primal_roar, 1);
  assertEquals(statusStrength(world, caster, "primal_roar"), 0);
  assertEquals(after.status.berserk, 0);
  assertEquals(after.status.battle_fury, 0);
  assertEquals(after.attackBonus - before.attackBonus, 5);
  assertEquals(after.damageMult, before.damageMult * 1.5);
});
