import { NamedIdentity } from "../../components/NamedIdentity.js";
import { consumeInventoryIdentity, inventoryHasIdentity } from "../../utils/townEconomy.js";
import { firstPlayerId } from "../../utils/worldAccess.js";
import { emit, grantSelectedReward, isSelectedReward, setVar } from "../actions.js";
import { registerQuest } from "../registry.js";
import { getQuestRecord, instantiateQuest } from "../runtime.js";

export const FARMER_MILL_RUN_QUEST_ID = "side.farmer_mill_run";
export const FARMER_MILL_RUN_REWARD_IDS = Object.freeze([
  "bow_mirror",
  "tool_hatchet",
  "potion_vigor",
]);

const REWARD_GOLD = 85;

function findTownfolk(world, identity) {
  for (const [id, ni] of world.query(NamedIdentity)) {
    if (String(ni?.identity || "") === identity) return id;
  }
  return 0;
}

export function ensureFarmerMillRunQuest(world, { playerId, giverId } = {}) {
  const player = Number(playerId || firstPlayerId(world) || 0) | 0;
  const giver = Number(giverId || findTownfolk(world, "townfolk_farmer") || 0) | 0;
  if (!(player > 0) || !(giver > 0)) return 0;
  const existing = getQuestRecord(world, FARMER_MILL_RUN_QUEST_ID, player);
  if (existing) return existing.id | 0;
  return instantiateQuest(world, FARMER_MILL_RUN_QUEST_ID, { player, giver });
}

function isPlayerPayload(ctx) {
  return Number(ctx.payload?.playerId || ctx.payload?.actor || 0) === Number(ctx.bind.player || 0);
}

function isSpeaker(ctx, identity) {
  const speakerId = Number(ctx.payload?.speakerId || 0) | 0;
  return speakerId > 0 && String(ctx.world.get(speakerId, NamedIdentity)?.identity || "") === identity;
}

export const FarmerMillRunQuest = registerQuest({
  id: FARMER_MILL_RUN_QUEST_ID,
  title: "From Field to Table",
  version: 1,
  journal: {
    flavorText: "The farmer has grain in the field, the mill has stone, and the tavern has hungry travelers. Carry one small harvest through the whole town.",
    rewardItemIds: FARMER_MILL_RUN_REWARD_IDS,
    rewardChoice: true,
    rewardGold: REWARD_GOLD,
    rewardItems: [
      { itemId: "bow_mirror", count: 1 },
      { itemId: "tool_hatchet", count: 1 },
      { itemId: "potion_vigor", count: 1 },
    ],
  },
  vars: {
    accepted: false,
    wheatCollected: false,
    flourMilled: false,
    flourDelivered: false,
    rewardItemIds: FARMER_MILL_RUN_REWARD_IDS,
    rewardGranted: false,
    rewardGold: REWARD_GOLD,
    rewardChoice: "",
    objective: "Talk to the farmer.",
    checklist: [
      { text: "Harvest wheat.", done: false },
      { text: "Grind the wheat into flour.", done: false },
      { text: "Give the flour to the barkeep.", done: false },
      { text: "Return to the farmer.", done: false },
    ],
  },
  nodes: {
    offer: {
      on: {
        "dialog:accepted": [{
          guard: (ctx) => isPlayerPayload(ctx)
            && String(ctx.payload?.questId || "") === FARMER_MILL_RUN_QUEST_ID
            && isSpeaker(ctx, "townfolk_farmer"),
          actions: [
            setVar("accepted", true),
            setVar("objective", "Harvest wheat for the farmer."),
            emit("quest:started", (ctx) => ({ questId: FARMER_MILL_RUN_QUEST_ID, playerId: ctx.bind.player, giverId: ctx.bind.giver, title: "From Field to Table" })),
          ],
          to: "harvest",
        }],
      },
    },
    harvest: {
      on: {
        "harvest:picked": [{
          guard: (ctx) => isPlayerPayload(ctx) && String(ctx.payload?.kind || "") === "wheat"
            && String(ctx.payload?.itemId || "") === "food_wheat",
          actions: [
            setVar("wheatCollected", true),
            setVar("objective", "Grind the wheat into flour at the millstone."),
          ],
          to: "mill",
        }],
      },
    },
    mill: {
      on: {
        "mill:milled": [{
          guard: (ctx) => isPlayerPayload(ctx) && String(ctx.payload?.outputIdentity || "") === "food_flour",
          actions: [
            setVar("flourMilled", true),
            setVar("objective", "Give the flour to the barkeep."),
          ],
          to: "barkeep",
        }],
      },
    },
    barkeep: {
      on: {
        "dialog:reported": [{
          guard: (ctx) => isPlayerPayload(ctx)
            && String(ctx.payload?.questId || "") === FARMER_MILL_RUN_QUEST_ID
            && isSpeaker(ctx, "townfolk_barkeep")
            && inventoryHasIdentity(ctx.world, ctx.bind.player, "food_flour", 1),
          actions: [
            (ctx) => consumeInventoryIdentity(ctx.world, ctx.bind.player, "food_flour", 1),
            setVar("flourDelivered", true),
            setVar("objective", "Return to the farmer."),
            emit("quest:advanced", (ctx) => ({ questId: FARMER_MILL_RUN_QUEST_ID, playerId: ctx.bind.player, objective: "Return to the farmer for your reward." })),
          ],
          to: "return",
        }],
      },
    },
    return: {
      on: {
        "dialog:reported": [{
          guard: (ctx) => isPlayerPayload(ctx)
            && String(ctx.payload?.questId || "") === FARMER_MILL_RUN_QUEST_ID
            && isSpeaker(ctx, "townfolk_farmer"),
          actions: [
            setVar("objective", "Choose your reward."),
            emit("quest:advanced", (ctx) => ({ questId: FARMER_MILL_RUN_QUEST_ID, playerId: ctx.bind.player, objective: "Choose one reward from the farmer." })),
          ],
          to: "reward",
        }],
      },
    },
    reward: {
      on: {
        "quest:reward_selected": [{
          guard: (ctx) => isPlayerPayload(ctx) && isSelectedReward(ctx),
          actions: [
            grantSelectedReward(),
            setVar("objective", "Quest complete."),
            emit("quest:completed", (ctx) => ({ questId: FARMER_MILL_RUN_QUEST_ID, playerId: ctx.bind.player, giverId: ctx.bind.giver, rewardItemIds: [ctx.payload?.rewardId], rewardGold: REWARD_GOLD })),
          ],
          to: "complete",
        }],
      },
    },
    complete: { terminal: true, on: {} },
  },
});
