import { assert, assertEquals } from "jsr:@std/assert";
import "./helpers/installContentCatalog.mjs";
import { World } from "../src/lib/ecs-js/index.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { QuestState } from "../src/rules/components/QuestState.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import { installInventoryDataProvider } from "../src/main/ui/inventoryDataProvider.js";
import {
  ensureFarmerMillRunQuest,
  FARMER_MILL_RUN_QUEST_ID,
} from "../src/rules/quests/definitions/farmerMillRun.js";
import { installQuestRuntime } from "../src/rules/quests/runtime.js";

function setupRewardScenario(capacity) {
  const world = new World({ seed: 5201 + capacity });
  const player = world.create();
  world.add(player, Player, {});
  world.add(player, NamedIdentity, { identity: "player" });
  world.add(player, Position, { x: 2, y: 2 });
  world.add(player, Inventory, { items: [], capacity, weightLimit: null });
  world.add(player, Equipment, {});
  const farmer = world.create();
  world.add(farmer, NamedIdentity, { identity: "townfolk_farmer" });
  const barkeep = world.create();
  world.add(barkeep, NamedIdentity, { identity: "townfolk_barkeep" });

  installQuestRuntime(world);
  const questId = ensureFarmerMillRunQuest(world, { playerId: player, giverId: farmer });
  world.emit("dialog:accepted", { questId: FARMER_MILL_RUN_QUEST_ID, playerId: player, speakerId: farmer });
  world.emit("harvest:picked", { actor: player, kind: "wheat", itemId: "food_wheat", count: 1 });
  world.emit("mill:milled", { actor: player, outputIdentity: "food_flour" });
  addToInventory(world, player, createItemById(world, "food_flour"));
  world.emit("dialog:reported", { questId: FARMER_MILL_RUN_QUEST_ID, playerId: player, speakerId: barkeep });
  world.emit("dialog:reported", { questId: FARMER_MILL_RUN_QUEST_ID, playerId: player, speakerId: farmer });
  assertEquals(world.get(questId, QuestState)?.node, "reward");

  const eventTarget = new EventTarget();
  installInventoryDataProvider({
    world,
    eventTarget,
    getActiveSpellId: () => null,
    isSimUiBlocked: () => false,
    getMessageLog: () => ({ getEntries: () => [] }),
    tombstoneRepo: { getAll: () => [] },
  });
  return { world, player, questId, eventTarget };
}

Deno.test("quest reward completion emits once and repeated requests do not duplicate grants", () => {
  const { world, player, questId, eventTarget } = setupRewardScenario(20);
  let completed = 0;
  const onCompleted = () => { completed += 1; };
  eventTarget.addEventListener("ui:questRewardCompleted", onCompleted);

  const request = () => eventTarget.dispatchEvent(new CustomEvent("ui:requestQuestReward", {
    detail: { questId: FARMER_MILL_RUN_QUEST_ID, playerId: player, rewardId: "bow_mirror" },
  }));
  request();
  request();
  eventTarget.removeEventListener("ui:questRewardCompleted", onCompleted);

  assertEquals(world.get(questId, QuestState)?.status, "complete");
  assertEquals(completed, 1);
});

Deno.test("failed quest reward claim stays pending and reports an error", () => {
  const { world, questId, player, eventTarget } = setupRewardScenario(0);
  let errors = 0;
  let completed = 0;
  const onError = () => { errors += 1; };
  const onCompleted = () => { completed += 1; };
  eventTarget.addEventListener("ui:questRewardError", onError);
  eventTarget.addEventListener("ui:questRewardCompleted", onCompleted);

  eventTarget.dispatchEvent(new CustomEvent("ui:requestQuestReward", {
    detail: { questId: FARMER_MILL_RUN_QUEST_ID, playerId: player, rewardId: "bow_mirror" },
  }));
  eventTarget.removeEventListener("ui:questRewardError", onError);
  eventTarget.removeEventListener("ui:questRewardCompleted", onCompleted);

  assertEquals(world.get(questId, QuestState)?.node, "reward");
  assertEquals(errors, 1);
  assertEquals(completed, 0);
});
