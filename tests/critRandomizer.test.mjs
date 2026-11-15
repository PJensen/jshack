import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { CritRandomizerResource } from "../src/rules/resources/critRandomizer.js";
import { rollBaggedCrit } from "../src/rules/utils/critRandomizer.js";
import { mulberry32 } from "../src/rules/utils/rng.js";

Deno.test("crit bag keeps one-in-ten frequency per completed cycle", () => {
  const world = new World({ seed: 0xCAFE });
  const actor = world.create();
  const rng = mulberry32(0x1234);
  let crits = 0;

  for (let i = 0; i < 10; i++) {
    if (rollBaggedCrit(world, actor, "physical", 0.1, rng)) crits++;
  }

  assertEquals(crits, 1);
  const state = world.resource(CritRandomizerResource).get(actor);
  assertEquals(state.physicalCritsRemaining, 0);
  assertEquals(state.physicalNonCritsRemaining, 0);
  assertEquals(world.hasResource(CritRandomizerResource), true);
  assertEquals(world.resources().find((entry) => entry.resource === CritRandomizerResource)?.serializable, false);
});

Deno.test("crit bag bounds low-chance droughts and high-chance streaks", () => {
  const world = new World({ seed: 0xBEEF });
  const actor = world.create();
  const rng = mulberry32(0x5678);
  let drought = 0;
  let longestDrought = 0;
  let streak = 0;
  let longestStreak = 0;

  for (let i = 0; i < 1000; i++) {
    const isCrit = rollBaggedCrit(world, actor, "physical", 0.1, rng);
    if (isCrit) {
      longestDrought = Math.max(longestDrought, drought);
      drought = 0;
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      drought++;
      streak = 0;
    }
  }

  assert(longestDrought <= 18, `expected bounded drought, got ${longestDrought}`);
  assert(longestStreak <= 2, `expected bounded streak, got ${longestStreak}`);
});

Deno.test("crit bag tracks physical and spell channels independently", () => {
  const world = new World({ seed: 0xFACE });
  const actor = world.create();
  const rng = () => 0.99;

  assertEquals(rollBaggedCrit(world, actor, "physical", 0.5, rng), false);
  assertEquals(rollBaggedCrit(world, actor, "spell", 0.5, rng), false);
  const state = world.resource(CritRandomizerResource).get(actor);
  assertEquals(state.physicalChance, 0.5);
  assertEquals(state.spellChance, 0.5);
  assertEquals(state.physicalCritsRemaining, 1);
  assertEquals(state.spellCritsRemaining, 1);
});
