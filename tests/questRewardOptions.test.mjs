import { assert, assertEquals } from "jsr:@std/assert";
import "../src/content/items/index.js";
import { installContent } from "../src/content/install.js";
import { isValidItemId } from "../src/rules/utils/itemFactory.js";
import { listQuestRewardOptions } from "../src/rules/quests/rewardOptions.js";
import { listQuestDefs } from "../src/rules/quests/registry.js";
import "../src/rules/quests/definitions/graveyardWatch.js";
import "../src/rules/quests/definitions/ratInfestation.js";
import "../src/rules/quests/definitions/priestRift.js";
import "../src/rules/quests/definitions/rootboundGrotto.js";
import "../src/rules/quests/definitions/farmerMillRun.js";
import "../src/rules/quests/definitions/runContract.js";

installContent();

Deno.test("authored quest reward packages use valid canonical item ids", () => {
  const authored = listQuestDefs()
    .flatMap((def) => listQuestRewardOptions(def, def.vars))
    .flatMap((choice) => choice.items.map((item) => item.itemId));
  assert(authored.length > 0);
  for (const itemId of new Set(authored)) {
    assert(isValidItemId(itemId), `unknown quest reward item: ${itemId}`);
  }
});

Deno.test("reward packages preserve thematic multi-item choices", () => {
  const farmer = listQuestDefs().find((def) => def.id === "side.farmer_mill_run");
  const choices = listQuestRewardOptions(farmer, farmer.vars);
  assertEquals(choices.length, 3);
  assertEquals(choices.find((choice) => choice.id === "field_medic_kit")?.items, [
    { itemId: "potion_vigor", count: 3 },
    { itemId: "scroll_heal", count: 1 },
  ]);
});
