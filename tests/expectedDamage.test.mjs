import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { BaseStats } from "../src/rules/components/BaseStats.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { resolveExpectedWeaponDamage, expectedDamageFromDice } from "../src/rules/utils/expectedDamage.js";

Deno.test("expected weapon damage preserves dice means and rounds for display", () => {
  const cases = [
    ["1d4", 2.5, 3],
    ["1d6", 3.5, 4],
    ["1d8", 4.5, 5],
    ["1d12", 6.5, 7],
    ["2d6", 7, 7],
  ];

  for (const [dice, average, displayed] of cases) {
    const projection = expectedDamageFromDice(dice);
    assertEquals(projection.diceAverage, average, dice);
    assertEquals(projection.expectedDamage, average, dice);
    assertEquals(projection.displayedDamage, displayed, dice);
  }
});

Deno.test("expected damage applies floors and multipliers per roll, not to the mean", () => {
  const projection = expectedDamageFromDice("1d4", {
    flatBonus: 1,
    damageMultiplier: 1.5,
  });

  assertEquals(projection.outcomes, 4);
  assertEquals(projection.expectedDamage, 5);
  assertEquals(projection.displayedDamage, 5);
});

Deno.test("expected weapon damage compares a hypothetical replacement without mutating equipment", () => {
  const world = new World({ seed: 187 });
  const actorId = world.create();
  const currentId = world.create();
  const candidateId = world.create();
  world.add(actorId, BaseStats, { strength: 10 });
  world.add(actorId, Equipment, { weapon: currentId });
  world.add(currentId, ItemInfo, { type: "equip", slot: "weapon", damageDice: "1d6" });
  world.add(candidateId, ItemInfo, {
    type: "equip",
    slot: "weapon",
    damageDice: "1d6",
    bonuses: { damagePower: 4 },
  });

  const current = resolveExpectedWeaponDamage(world, actorId, currentId, { mode: "melee" });
  const candidate = resolveExpectedWeaponDamage(world, actorId, candidateId, {
    mode: "melee",
    equipmentOverride: { ...world.get(actorId, Equipment), weapon: candidateId },
  });

  assertEquals(current.displayedDamage, 4);
  assertEquals(candidate.displayedDamage, 6);
  assertEquals(world.get(actorId, Equipment).weapon, currentId);
});
