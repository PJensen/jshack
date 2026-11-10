import { assert, assertEquals } from "jsr:@std/assert";
import "./helpers/installContentCatalog.mjs";
import { World } from "../src/lib/ecs-js/index.js";
import { installInventoryDataProvider } from "../src/main/ui/inventoryDataProvider.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { QuestDefRef } from "../src/rules/components/QuestDefRef.js";
import { QuestState } from "../src/rules/components/QuestState.js";
import { QuestVars } from "../src/rules/components/QuestVars.js";
import { QuestBindings } from "../src/rules/components/QuestBindings.js";
import "../src/rules/quests/definitions/ratInfestation.js";

Deno.test("quest journal payload includes flavor, reward, and completion details for overlay sheet", () => {
  const world = new World({ seed: 5 });
  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 2, y: 3 });
  world.add(player, Inventory, { items: [], capacity: 20 });
  world.add(player, Equipment, {});

  const quest = world.create();
  world.add(quest, QuestDefRef, { id: "starter.rat_infestation", version: 1 });
  world.add(quest, QuestState, { node: "hunt", status: "active", t0: 10 });
  world.add(quest, QuestVars, {
    data: {
      objective: "Clear the tavern cellar of rats.",
      progress: 3,
      target: 5,
      checklist: [
        { text: "Kill 5 rats.", done: false },
        { text: "Report back to the barkeep.", done: false },
      ],
      rewardItemIds: ["bow_mirror"],
      rewardGold: 75,
    },
  });
  world.add(quest, QuestBindings, { player, giver: 11, target: 11 });

  installInventoryDataProvider({
    world,
    getActiveSpellId: () => null,
    isSimUiBlocked: () => false,
    getMessageLog: () => ({ getEntries: () => [] }),
    tombstoneRepo: { getAll: () => [] },
  });

  /** @type {any} */
  let payload = null;
  const onQuestData = (ev) => {
    payload = ev?.detail || null;
  };
  addEventListener("ui:questJournalData", onQuestData);
  dispatchEvent(new CustomEvent("ui:requestQuestJournalData"));
  removeEventListener("ui:questJournalData", onQuestData);

  assert(payload, "expected ui:questJournalData payload");
  const quests = Array.isArray(payload?.quests) ? payload.quests : [];
  assertEquals(quests.length, 1);
  assertEquals(String(quests[0]?.summary || ""), "Clear the tavern cellar of rats.");
  assert(String(quests[0]?.flavorText || "").includes("barkeep"), "flavor text should be journal-ready");
  assertEquals(
    String(quests[0]?.rewardText || ""),
    "Choose one: Mirror Bow, Ratward Ring, Venom Ward Binding; plus 75 gold and a hot stew from the barkeep",
  );
  assertEquals(String(quests[0]?.completionText || ""), "Clear the tavern cellar of rats.");
  assertEquals(Number(quests[0]?.progress || 0), 3);
  assertEquals(Number(quests[0]?.target || 0), 5);
});

Deno.test("quest journal excludes unknown quests and other players' quests", () => {
  const world = new World({ seed: 6 });
  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 0, y: 0 });
  const otherPlayer = world.create();
  world.add(otherPlayer, Player, {});

  const addQuest = (owner, accepted, id) => {
    const quest = world.create();
    world.add(quest, QuestDefRef, { id, version: 1 });
    world.add(quest, QuestState, { node: "offer", status: "active", t0: 1 });
    world.add(quest, QuestVars, { data: { accepted } });
    world.add(quest, QuestBindings, { player: owner, giver: 0, target: 0 });
  };
  addQuest(player, false, "unknown.quest");
  addQuest(player, true, "starter.rat_infestation");
  addQuest(otherPlayer, true, "starter.rat_infestation");

  installInventoryDataProvider({
    world,
    getActiveSpellId: () => null,
    isSimUiBlocked: () => false,
    getMessageLog: () => ({ getEntries: () => [] }),
    tombstoneRepo: { getAll: () => [] },
  });

  let payload = null;
  const onQuestData = (ev) => { payload = ev?.detail || null; };
  addEventListener("ui:questJournalData", onQuestData);
  dispatchEvent(new CustomEvent("ui:requestQuestJournalData"));
  removeEventListener("ui:questJournalData", onQuestData);

  assertEquals(payload?.quests?.length, 1);
  assertEquals(payload.quests[0].questId, "starter.rat_infestation");
});
