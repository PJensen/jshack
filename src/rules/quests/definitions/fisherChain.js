import { DeathApplied } from "../../components/DeathApplied.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { QuestVars } from "../../components/QuestVars.js";
import { QuestState } from "../../components/QuestState.js";
import { createItemById } from "../../utils/itemFactory.js";
import { addToInventory } from "../../utils/inventoryFacade.js";
import { consumeInventoryIdentity, inventoryHasIdentity } from "../../utils/townEconomy.js";
import { firstPlayerId } from "../../utils/worldAccess.js";
import { emit, incVar, setVar } from "../actions.js";
import { registerQuest } from "../registry.js";
import { getQuestRecord, instantiateQuest } from "../runtime.js";
import { defineExtension } from "../../../lib/ecs-js/index.js";

export const FISHER_BAIT_QUEST_ID = "side.fisher_bait";
export const FISHER_FIRST_CATCH_QUEST_ID = "side.fisher_first_catch";
export const FISHER_CRAB_CLEANUP_QUEST_ID = "side.fisher_crab_cleanup";
export const REQUIRED_FISHER_HERBS = 5;
export const REQUIRED_FISHER_CATCHES = 3;
export const REQUIRED_FISHER_CRABS = 5;

const FISHER_HERB_ID = "food_wild_herbs";
const FISHER_REWARD_ID = "fishing_rod";
const FISHER_HOOKS_KEY = Symbol.for("jshack:quests:fisherChain");

function findFisher(world) {
  for (const [id, ni] of world.query(NamedIdentity)) {
    if (String(ni?.identity || "") === "townfolk_fisher") return id;
  }
  return 0;
}

function playerPayload(ctx) {
  return Number(ctx.payload?.playerId || ctx.payload?.actor || 0) === Number(ctx.bind.player || 0);
}

function fisherSpeaker(ctx) {
  return Number(ctx.payload?.speakerId || 0) === Number(ctx.bind.giver || 0);
}

function grantItem(itemId, count = 1) {
  return (ctx) => {
    const created = createItemById(ctx.world, itemId, { count });
    if (!(created > 0) || !addToInventory(ctx.world, Number(ctx.bind.player || 0) | 0, created)) {
      if (created > 0) {
        try { ctx.world.destroy(created); } catch {}
      }
      return false;
    }
    return true;
  };
}

function fishingCatchIdentity(world, payload) {
  if (String(payload?.itemId || "") === "food_raw_fish") return "food_raw_fish";
  const caughtId = Number(payload?.caughtId || 0) | 0;
  return String(world.get(caughtId, NamedIdentity)?.identity || "");
}

export function ensureFisherBaitQuest(world, { playerId, giverId } = {}) {
  const player = Number(playerId || firstPlayerId(world) || 0) | 0;
  const giver = Number(giverId || findFisher(world) || 0) | 0;
  if (!(player > 0) || !(giver > 0)) return 0;
  const existing = getQuestRecord(world, FISHER_BAIT_QUEST_ID, player);
  return existing?.id || instantiateQuest(world, FISHER_BAIT_QUEST_ID, { player, giver });
}

export function ensureFisherFirstCatchQuest(world, { playerId, giverId } = {}) {
  const player = Number(playerId || firstPlayerId(world) || 0) | 0;
  const giver = Number(giverId || findFisher(world) || 0) | 0;
  if (!(player > 0) || !(giver > 0)) return 0;
  const existing = getQuestRecord(world, FISHER_FIRST_CATCH_QUEST_ID, player);
  return existing?.id || instantiateQuest(world, FISHER_FIRST_CATCH_QUEST_ID, { player, giver });
}

export function ensureFisherCrabCleanupQuest(world, { playerId, giverId } = {}) {
  const player = Number(playerId || firstPlayerId(world) || 0) | 0;
  const giver = Number(giverId || findFisher(world) || 0) | 0;
  if (!(player > 0) || !(giver > 0)) return 0;
  const existing = getQuestRecord(world, FISHER_CRAB_CLEANUP_QUEST_ID, player);
  return existing?.id || instantiateQuest(world, FISHER_CRAB_CLEANUP_QUEST_ID, { player, giver });
}

export function getFisherQuest(world, playerId) {
  const player = Number(playerId || 0) | 0;
  for (const id of [FISHER_BAIT_QUEST_ID, FISHER_FIRST_CATCH_QUEST_ID, FISHER_CRAB_CLEANUP_QUEST_ID]) {
    const quest = getQuestRecord(world, id, player);
    if (quest && String(quest.state?.status || "active") !== "complete") return quest;
  }
  return getQuestRecord(world, FISHER_CRAB_CLEANUP_QUEST_ID, player)
    || getQuestRecord(world, FISHER_FIRST_CATCH_QUEST_ID, player)
    || getQuestRecord(world, FISHER_BAIT_QUEST_ID, player);
}

export function fisherCrabDeathSystem(world) {
  for (const [, death] of world.query(DeathApplied)) {
    const killer = Number(death.killer || 0) | 0;
    const target = Number(death.target || 0) | 0;
    if (!(killer > 0) || !(target > 0)) continue;
    if (killer !== firstPlayerId(world)) continue;
    if (String(world.get(target, NamedIdentity)?.identity || "") !== "sand_crab") continue;
    const quest = getQuestRecord(world, FISHER_CRAB_CLEANUP_QUEST_ID, killer);
    if (!quest || String(quest.state?.node || "") !== "hunt") continue;
    const killCount = Number(quest.vars?.data?.killCount || 0) | 0;
    const nextCount = Math.min(REQUIRED_FISHER_CRABS, killCount + 1);
    world.set(quest.id, QuestVars, {
      data: {
        ...(quest.vars?.data || {}),
        killCount: nextCount,
        objective: nextCount >= REQUIRED_FISHER_CRABS
          ? "Return to the fisher."
          : `Kill ${REQUIRED_FISHER_CRABS - nextCount} more sand crabs.`,
      },
    });
    if (nextCount >= REQUIRED_FISHER_CRABS) {
      world.set(quest.id, QuestState, {
        ...quest.state,
        node: "report",
        status: "active",
      });
      world.emit("quest:advanced", {
        questId: FISHER_CRAB_CLEANUP_QUEST_ID,
        playerId: killer,
        objective: "Return to the fisher.",
      });
    } else {
      world.emit("quest:advanced", {
        questId: FISHER_CRAB_CLEANUP_QUEST_ID,
        playerId: killer,
        objective: `Kill ${REQUIRED_FISHER_CRABS - nextCount} more sand crabs.`,
      });
    }
  }
}

export function installFisherQuestHooks(world) {
  world.install(defineExtension("jshack:quests:fisherChain", (installedWorld) => {
    const offCompleted = installedWorld.on("quest:completed", (payload) => {
      const playerId = Number(payload?.playerId || 0) | 0;
      const giverId = Number(payload?.giverId || 0) | 0;
      if (String(payload?.questId || "") === FISHER_BAIT_QUEST_ID) {
        ensureFisherFirstCatchQuest(installedWorld, { playerId, giverId });
      } else if (String(payload?.questId || "") === FISHER_FIRST_CATCH_QUEST_ID) {
        ensureFisherCrabCleanupQuest(installedWorld, { playerId, giverId });
      }
    });
    return offCompleted;
  }, { key: FISHER_HOOKS_KEY }));
}

export const FisherBaitQuest = registerQuest({
  id: FISHER_BAIT_QUEST_ID,
  title: "Bait for the Fisher",
  version: 1,
  journal: {
    flavorText: "The fisher needs wild herbs to make a bait that draws small fish close to shore.",
    rewardItemIds: [FISHER_REWARD_ID],
  },
  vars: { accepted: false, objective: "Talk to the fisher.", rewardItemIds: [FISHER_REWARD_ID] },
  nodes: {
    offer: { on: { "dialog:accepted": [{
      guard: (ctx) => playerPayload(ctx) && fisherSpeaker(ctx) && String(ctx.payload?.questId || "") === FISHER_BAIT_QUEST_ID,
      actions: [setVar("accepted", true), setVar("objective", `Collect ${REQUIRED_FISHER_HERBS} bunches of wild herbs.`), emit("quest:started", (ctx) => ({ questId: FISHER_BAIT_QUEST_ID, playerId: ctx.bind.player, giverId: ctx.bind.giver, title: "Bait for the Fisher" }))],
      to: "collect",
    }] } },
    collect: { on: { "dialog:reported": [{
      guard: (ctx) => playerPayload(ctx) && fisherSpeaker(ctx) && String(ctx.payload?.questId || "") === FISHER_BAIT_QUEST_ID
        && inventoryHasIdentity(ctx.world, ctx.bind.player, FISHER_HERB_ID, REQUIRED_FISHER_HERBS),
      actions: [
        (ctx) => consumeInventoryIdentity(ctx.world, ctx.bind.player, FISHER_HERB_ID, REQUIRED_FISHER_HERBS),
        grantItem(FISHER_REWARD_ID),
        setVar("objective", "Quest complete."),
        emit("quest:completed", (ctx) => ({ questId: FISHER_BAIT_QUEST_ID, playerId: ctx.bind.player, giverId: ctx.bind.giver, title: "Bait for the Fisher", rewardItemIds: [FISHER_REWARD_ID] })),
      ],
      to: "complete",
    }] } },
    complete: { terminal: true, on: {} },
  },
});

export const FisherFirstCatchQuest = registerQuest({
  id: FISHER_FIRST_CATCH_QUEST_ID,
  title: "The First Catch",
  version: 1,
  journal: { flavorText: "Now that you have a rod, prove you can bring in a catch.", rewardItemIds: ["food_fisher_supper"], rewardGold: 40 },
  vars: { accepted: false, catchCount: 0, objective: "Talk to the fisher." },
  nodes: {
    offer: { on: { "dialog:accepted": [{
      guard: (ctx) => playerPayload(ctx) && fisherSpeaker(ctx) && String(ctx.payload?.questId || "") === FISHER_FIRST_CATCH_QUEST_ID,
      actions: [setVar("accepted", true), setVar("objective", `Catch ${REQUIRED_FISHER_CATCHES} fish.`), emit("quest:started", (ctx) => ({ questId: FISHER_FIRST_CATCH_QUEST_ID, playerId: ctx.bind.player, giverId: ctx.bind.giver, title: "The First Catch" }))],
      to: "fish",
    }] } },
    fish: { on: { "fishing:caught": [{
      guard: (ctx) => playerPayload(ctx) && fishingCatchIdentity(ctx.world, ctx.payload) === "food_raw_fish"
        && Number(ctx.vars?.catchCount || 0) < REQUIRED_FISHER_CATCHES - 1,
      actions: [incVar("catchCount"), setVar("objective", (ctx) => `Catch ${REQUIRED_FISHER_CATCHES - Number(ctx.vars?.catchCount || 0) - 1} more fish.`)],
      to: "fish",
    }, {
      guard: (ctx) => playerPayload(ctx) && fishingCatchIdentity(ctx.world, ctx.payload) === "food_raw_fish"
        && Number(ctx.vars?.catchCount || 0) === REQUIRED_FISHER_CATCHES - 1,
      actions: [incVar("catchCount"), setVar("objective", "Return to the fisher."), emit("quest:advanced", (ctx) => ({ questId: FISHER_FIRST_CATCH_QUEST_ID, playerId: ctx.bind.player, objective: "Return to the fisher." }))],
      to: "report",
    }] } },
    report: { on: { "dialog:reported": [{
      guard: (ctx) => playerPayload(ctx) && fisherSpeaker(ctx) && String(ctx.payload?.questId || "") === FISHER_FIRST_CATCH_QUEST_ID,
      actions: [grantItem("food_fisher_supper"), grantItem("gold", 40), emit("quest:completed", (ctx) => ({ questId: FISHER_FIRST_CATCH_QUEST_ID, playerId: ctx.bind.player, giverId: ctx.bind.giver, title: "The First Catch", rewardItemIds: ["food_fisher_supper"], rewardGold: 40 }))],
      to: "complete",
    }] } },
    complete: { terminal: true, on: {} },
  },
});

export const FisherCrabCleanupQuest = registerQuest({
  id: FISHER_CRAB_CLEANUP_QUEST_ID,
  title: "Crabs in the Reeds",
  version: 1,
  journal: { flavorText: "Sand crabs are tearing at the fisher's nets and eating the bait before the fish can reach it.", rewardItemIds: ["food_golden_carp"], rewardGold: 60 },
  vars: { accepted: false, killCount: 0, objective: "Talk to the fisher." },
  nodes: {
    offer: { on: { "dialog:accepted": [{
      guard: (ctx) => playerPayload(ctx) && fisherSpeaker(ctx) && String(ctx.payload?.questId || "") === FISHER_CRAB_CLEANUP_QUEST_ID,
      actions: [setVar("accepted", true), setVar("objective", `Kill ${REQUIRED_FISHER_CRABS} sand crabs.`), emit("quest:started", (ctx) => ({ questId: FISHER_CRAB_CLEANUP_QUEST_ID, playerId: ctx.bind.player, giverId: ctx.bind.giver, title: "Crabs in the Reeds" }))],
      to: "hunt",
    }] } },
    hunt: { on: {} },
    report: { on: { "dialog:reported": [{
      guard: (ctx) => playerPayload(ctx) && fisherSpeaker(ctx) && String(ctx.payload?.questId || "") === FISHER_CRAB_CLEANUP_QUEST_ID,
      actions: [grantItem("food_golden_carp"), grantItem("gold", 60), emit("quest:completed", (ctx) => ({ questId: FISHER_CRAB_CLEANUP_QUEST_ID, playerId: ctx.bind.player, giverId: ctx.bind.giver, title: "Crabs in the Reeds", rewardItemIds: ["food_golden_carp"], rewardGold: 60 }))],
      to: "complete",
    }] } },
    complete: { terminal: true, on: {} },
  },
});
