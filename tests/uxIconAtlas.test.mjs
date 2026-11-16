import { assert, assertEquals } from "jsr:@std/assert";

import { UX_ICON_ATLAS } from "../src/display/ui/atlasIcons.js";

Deno.test("UX atlas exposes the character-sheet icon contract", () => {
  for (const id of [
    "character", "inventory", "equipment", "quests", "settings",
    "strength", "dexterity", "intelligence", "vitality",
    "health", "mana", "stamina", "damage", "accuracy", "avoidance",
    "criticalStrike", "spellPower", "moonFull",
    "damagePower", "mitigation", "luck", "critMultiplier", "damageBonus", "carry",
    "maxHpBonus", "speed", "gold", "hunger", "depth", "turn",
    "petFollowing", "petStaying", "petFetching", "petReturning", "petGuarding", "petAggressive", "petFleeing", "petIdle",
    "stanceBalanced", "stanceAggressive", "stanceGuarded", "pray", "search", "attack",
  ]) {
    assert(UX_ICON_ATLAS.entries.has(id), `missing UX icon: ${id}`);
  }
  assertEquals(UX_ICON_ATLAS.columns, 6);
  assertEquals(UX_ICON_ATLAS.rows, 10);
  assert(new URL(UX_ICON_ATLAS.sheetUrl).searchParams.has("v"), "UX sheet should be versioned");
});
