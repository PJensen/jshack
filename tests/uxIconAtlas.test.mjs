import { assert, assertEquals } from "jsr:@std/assert";

import { UX_ICON_ATLAS } from "../src/display/ui/atlasIcons.js";

Deno.test("UX atlas exposes the character-sheet icon contract", () => {
  for (const id of [
    "character", "inventory", "equipment", "quests", "settings",
    "strength", "dexterity", "intelligence", "vitality",
    "health", "mana", "stamina", "damage", "accuracy", "avoidance",
    "criticalStrike", "spellPower", "moonFull",
  ]) {
    assert(UX_ICON_ATLAS.entries.has(id), `missing UX icon: ${id}`);
  }
  assertEquals(UX_ICON_ATLAS.columns, 6);
  assertEquals(UX_ICON_ATLAS.rows, 5);
});
