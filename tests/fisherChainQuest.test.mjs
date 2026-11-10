import { assert, assertEquals } from "jsr:@std/assert";
import "./helpers/installContentCatalog.mjs";
import { World } from "../src/lib/ecs-js/index.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { QuestState } from "../src/rules/components/QuestState.js";
import { QuestVars } from "../src/rules/components/QuestVars.js";
import { DeathApplied } from "../src/rules/components/DeathApplied.js";
import { Player } from "../src/rules/components/Player.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { addToInventory, inventoryItems } from "../src/rules/utils/inventoryFacade.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { installQuestRuntime, getQuestRecord } from "../src/rules/quests/runtime.js";
import {
  ensureFisherBaitQuest,
  FISHER_BAIT_QUEST_ID,
  FISHER_FIRST_CATCH_QUEST_ID,
  FISHER_CRAB_CLEANUP_QUEST_ID,
  fisherCrabDeathSystem,
  installFisherQuestHooks,
} from "../src/rules/quests/definitions/fisherChain.js";

function countItem(world, owner, identity) {
  return inventoryItems(world, owner).reduce((total, itemId) => {
    if (String(world.get(itemId, NamedIdentity)?.identity || "") !== identity) return total;
    return total + Math.max(1, Number(world.get(itemId, ItemInfo)?.count || 1) | 0);
  }, 0);
}

function addTownfolk(world) {
  const fisher = world.create();
  world.add(fisher, NamedIdentity, { identity: "townfolk_fisher" });
  return fisher;
}

Deno.test("fisher chain collects herbs, awards the rod, and unlocks first catch", () => {
  const world = new World({ seed: 91 });
  const player = world.create();
  world.add(player, NamedIdentity, { identity: "player" });
  world.add(player, Player, {});
  world.add(player, Inventory, { items: [], capacity: 30, weightLimit: null });
  const fisher = addTownfolk(world);
  installQuestRuntime(world);
  installFisherQuestHooks(world);
  const bait = ensureFisherBaitQuest(world, { playerId: player, giverId: fisher });

  world.emit("dialog:accepted", { questId: FISHER_BAIT_QUEST_ID, playerId: player, speakerId: fisher });
  assertEquals(world.get(bait, QuestState)?.node, "collect");
  for (let i = 0; i < 5; i++) {
    const herb = createItemById(world, "food_wild_herbs");
    assert(addToInventory(world, player, herb));
  }
  world.emit("dialog:reported", { questId: FISHER_BAIT_QUEST_ID, playerId: player, speakerId: fisher });

  assertEquals(world.get(bait, QuestState)?.status, "complete");
  assertEquals(countItem(world, player, "food_wild_herbs"), 0);
  assertEquals(countItem(world, player, "fishing_rod"), 1);
  assert(getQuestRecord(world, FISHER_FIRST_CATCH_QUEST_ID, player));
});

Deno.test("fisher chain counts fish, then sand crab deaths unlock the final turn-in", () => {
  const world = new World({ seed: 92 });
  const player = world.create();
  world.add(player, NamedIdentity, { identity: "player" });
  world.add(player, Player, {});
  world.add(player, Inventory, { items: [], capacity: 30, weightLimit: null });
  const fisher = addTownfolk(world);
  installQuestRuntime(world);
  installFisherQuestHooks(world);
  const bait = ensureFisherBaitQuest(world, { playerId: player, giverId: fisher });
  world.emit("dialog:accepted", { questId: FISHER_BAIT_QUEST_ID, playerId: player, speakerId: fisher });
  for (let i = 0; i < 5; i++) addToInventory(world, player, createItemById(world, "food_wild_herbs"));
  world.emit("dialog:reported", { questId: FISHER_BAIT_QUEST_ID, playerId: player, speakerId: fisher });

  const first = getQuestRecord(world, FISHER_FIRST_CATCH_QUEST_ID, player);
  world.emit("dialog:accepted", { questId: FISHER_FIRST_CATCH_QUEST_ID, playerId: player, speakerId: fisher });
  for (let i = 0; i < 3; i++) world.emit("fishing:caught", { actor: player, itemId: "food_raw_fish" });
  assertEquals(world.get(first.id, QuestState)?.node, "report");
  world.emit("dialog:reported", { questId: FISHER_FIRST_CATCH_QUEST_ID, playerId: player, speakerId: fisher });
  assert(getQuestRecord(world, FISHER_CRAB_CLEANUP_QUEST_ID, player));

  const crabQuest = getQuestRecord(world, FISHER_CRAB_CLEANUP_QUEST_ID, player);
  world.emit("dialog:accepted", { questId: FISHER_CRAB_CLEANUP_QUEST_ID, playerId: player, speakerId: fisher });
  for (let i = 0; i < 5; i++) {
    const crab = world.create();
    world.add(crab, NamedIdentity, { identity: "sand_crab" });
    const death = world.create();
    world.add(death, DeathApplied, { target: crab, killer: player });
    fisherCrabDeathSystem(world);
    world.destroy(death);
  }
  assertEquals(world.get(crabQuest.id, QuestState)?.node, "report");
  world.emit("dialog:reported", { questId: FISHER_CRAB_CLEANUP_QUEST_ID, playerId: player, speakerId: fisher });
  assertEquals(world.get(crabQuest.id, QuestState)?.status, "complete");
  assertEquals(world.get(crabQuest.id, QuestVars)?.data?.killCount, 5);
});
