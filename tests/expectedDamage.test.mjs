import { assertEquals } from "jsr:@std/assert";
import { expectedDamageFromDice } from "../src/rules/utils/expectedDamage.js";

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
