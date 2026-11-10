import { assert, assertEquals } from "jsr:@std/assert";
import "./helpers/installContentCatalog.mjs";
import { World } from "../src/lib/ecs-js/index.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { QuestState } from "../src/rules/components/QuestState.js";
import { QuestVars } from "../src/rules/components/QuestVars.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { addToInventory, inventoryItems } from "../src/rules/utils/inventoryFacade.js";
import { installQuestRuntime } from "../src/rules/quests/runtime.js";
import {
  ensureFarmerMillRunQuest,
  FARMER_MILL_RUN_QUEST_ID,
  FARMER_MILL_RUN_REWARD_IDS,
} from "../src/rules/quests/definitions/farmerMillRun.js";
import { getQuestRecord } from "../src/rules/quests/runtime.js";
import { listQuestRewardItems, questRewardDetailText, questRewardPreviewText } from "../src/main/ui/questRewards.js";

function addTownfolk(world, identity) {
  const id = world.create();
  world.add(id, NamedIdentity, { identity });
  return id;
}

function countItem(world, owner, identity) {
  return inventoryItems(world, owner).reduce((total, itemId) => {
    if (String(world.get(itemId, NamedIdentity)?.identity || "") !== identity) return total;
    return total + Math.max(1, Number(world.get(itemId, ItemInfo)?.count || 1) | 0);
  }, 0);
}

Deno.test("farmer mill run advances through harvest, milling, delivery, return, and one reward", () => {
  const world = new World({ seed: 51 });
  const player = world.create();
  world.add(player, NamedIdentity, { identity: "player" });
  world.add(player, Inventory, { items: [], capacity: 30, weightLimit: null });
  const farmer = addTownfolk(world, "townfolk_farmer");
  const barkeep = addTownfolk(world, "townfolk_barkeep");

  installQuestRuntime(world);
  const questId = ensureFarmerMillRunQuest(world, { playerId: player, giverId: farmer });
  assert(questId > 0);

  world.emit("dialog:accepted", { questId: FARMER_MILL_RUN_QUEST_ID, playerId: player, speakerId: farmer });
  assertEquals(world.get(questId, QuestState)?.node, "harvest");

  world.emit("harvest:picked", { actor: player, kind: "wheat", itemId: "food_wheat", count: 1 });
  assertEquals(world.get(questId, QuestState)?.node, "mill");

  world.emit("mill:milled", { actor: player, outputIdentity: "food_flour" });
  assertEquals(world.get(questId, QuestState)?.node, "barkeep");
  const flour = createItemById(world, "food_flour");
  assert(addToInventory(world, player, flour));

  world.emit("dialog:reported", { questId: FARMER_MILL_RUN_QUEST_ID, playerId: player, speakerId: barkeep });
  assertEquals(world.get(questId, QuestState)?.node, "return");
  assertEquals(countItem(world, player, "food_flour"), 0);

  world.emit("dialog:reported", { questId: FARMER_MILL_RUN_QUEST_ID, playerId: player, speakerId: farmer });
  assertEquals(world.get(questId, QuestState)?.node, "reward");

  world.emit("quest:reward_selected", {
    questId: FARMER_MILL_RUN_QUEST_ID,
    playerId: player,
    rewardId: "bow_mirror",
  });
  assertEquals(world.get(questId, QuestState)?.status, "complete");
  assertEquals(world.get(questId, QuestVars)?.data?.rewardChoice, "bow_mirror");
  assertEquals(countItem(world, player, "bow_mirror"), 1);
  assertEquals(FARMER_MILL_RUN_REWARD_IDS.length, 3);
});

Deno.test("farmer mill run reward is presented as a choice in the journal", () => {
  const quest = {
    journal: {
      rewardChoice: true,
      rewardItemIds: ["bow_mirror", "tool_hatchet", "potion_vigor"],
      rewardGold: 85,
    },
  };
  assert(questRewardPreviewText(quest, {}).includes("Choose one:"));
  assert(questRewardPreviewText(quest, {}).includes("Mirror Bow"));
  assertEquals(
    questRewardDetailText(quest, {}),
    "Choose one: Mirror Bow, Work Hatchet, Health Potion; plus 85 gold",
  );
  const mirrorBow = listQuestRewardItems(quest, {})[0];
  assertEquals(mirrorBow.tooltip.identity, "bow_mirror");
  assertEquals(mirrorBow.tooltip.iconId, "bow_mirror");
  assertEquals(mirrorBow.tooltip.damageDice, "1d6");
  assertEquals(mirrorBow.tooltip.bonuses.attack, 2);
  assert(mirrorBow.tooltip.mechanics.some((entry) => String(entry.text).includes("Wall-adjacent")));
});
