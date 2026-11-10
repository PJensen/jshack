import { DeathApplied } from "../../components/DeathApplied.js";
import { DungeonState } from "../../components/DungeonState.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { Position } from "../../components/Position.js";
import { createItemById } from "../../utils/itemFactory.js";
import { addToInventory } from "../../utils/inventoryFacade.js";
import { firstPlayerId } from "../../utils/worldAccess.js";
import { emit, setVar } from "../actions.js";
import { registerQuest } from "../registry.js";
import { getQuestRecord, instantiateQuest } from "../runtime.js";
import { defineExtension } from "../../../lib/ecs-js/index.js";

export const ROOTBOUND_GROTTO_QUEST_ID = "side.rootbound_grotto";
export const ROOTBOUND_GROTTO_TEMPLATE_ID = "rootbound_grotto";
const ROOTBOUND_HOOKS_KEY = Symbol.for("jshack:quests:rootboundGrotto");
const ROOTBOUND_HEALERS = new Set([
  "goblin_mosscaller",
  "kobold_cairnkeeper",
  "orc_bloodspeaker",
  "druid",
]);
const REWARD_ITEM_ID = "book_lifebloom";
const REWARD_GOLD = 180;

function currentHerbalistId(world) {
  for (const [id, identity] of world.query(NamedIdentity)) {
    if (String(identity?.identity || "") === "townfolk_herbalist") return id;
  }
  return 0;
}

export function ensureRootboundGrottoQuest(world, { playerId, giverId } = {}) {
  const player = Number(playerId || firstPlayerId(world) || 0) | 0;
  const giver = Number(giverId || currentHerbalistId(world) || 0) | 0;
  if (!(player > 0) || !(giver > 0)) return 0;
  const existing = getQuestRecord(world, ROOTBOUND_GROTTO_QUEST_ID, player);
  if (existing) return existing.id | 0;
  return instantiateQuest(world, ROOTBOUND_GROTTO_QUEST_ID, { player, giver });
}

function currentTemplateId(world) {
  for (const [, dungeon] of world.query(DungeonState)) {
    return String(dungeon?.activeTemplateId || "");
  }
  return "";
}

function isRootboundHealer(world, victimId) {
  const identity = String(world.get(victimId, NamedIdentity)?.identity || "");
  return ROOTBOUND_HEALERS.has(identity);
}

export function rootboundGrottoDeathSystem(world) {
  if (currentTemplateId(world) !== ROOTBOUND_GROTTO_TEMPLATE_ID) return;
  const playerId = firstPlayerId(world);
  if (!(playerId > 0)) return;
  const quest = getQuestRecord(world, ROOTBOUND_GROTTO_QUEST_ID, playerId);
  if (!quest || String(quest.state?.status || "") !== "active") return;
  if (String(quest.state?.node || "") !== "hunt") return;

  for (const [, death] of world.query(DeathApplied)) {
    if ((Number(death?.killer || 0) | 0) !== playerId) continue;
    const victimId = Number(death?.target || 0) | 0;
    if (!(victimId > 0) || !isRootboundHealer(world, victimId)) continue;
    world.emit("rootbound:healer_defeated", { playerId, victimId });
    break;
  }
}

export function installRootboundGrottoHooks(world) {
  world.install(defineExtension("jshack:quests:rootboundGrotto", (installedWorld) => {
    return installedWorld.on("dungeon:transitioned", ({ templateId }) => {
      if (String(templateId || "") !== ROOTBOUND_GROTTO_TEMPLATE_ID) return;
      const playerId = firstPlayerId(installedWorld);
      const quest = getQuestRecord(installedWorld, ROOTBOUND_GROTTO_QUEST_ID, playerId);
      if (!quest || String(quest.state?.node || "") !== "hunt") return;
      installedWorld.emit("quest:advanced", {
        questId: ROOTBOUND_GROTTO_QUEST_ID,
        playerId,
        giverId: Number(quest.bindings?.giver || 0) | 0,
        objective: "Find and defeat one of the healers in the Rootbound Grotto.",
      });
    });
  }, { key: ROOTBOUND_HOOKS_KEY }));
}

export const RootboundGrottoQuest = registerQuest({
  id: ROOTBOUND_GROTTO_QUEST_ID,
  title: "The Rootbound Grotto",
  version: 1,
  tracker: {
    destinationTemplateId: ROOTBOUND_GROTTO_TEMPLATE_ID,
  },
  journal: {
    flavorText: "The herbs are growing in patterns no human planted. Something below the Strange Grove is teaching wounded creatures how to live through anything.",
    rewardItemIds: [REWARD_ITEM_ID],
    rewardGold: REWARD_GOLD,
  },
  vars: {
    accepted: false,
    defeated: false,
    rewardGranted: false,
  },
  nodes: {
    offer: {
      on: {
        "dialog:accepted": [
          {
            guard: (ctx) => Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
              && Number(ctx.payload?.speakerId || 0) === Number(ctx.bind.giver || 0)
              && String(ctx.payload?.questId || "") === ROOTBOUND_GROTTO_QUEST_ID,
            actions: [
              setVar("accepted", true),
              emit("quest:started", (ctx) => ({
                questId: ROOTBOUND_GROTTO_QUEST_ID,
                playerId: ctx.bind.player,
                giverId: ctx.bind.giver,
                title: "The Rootbound Grotto",
              })),
            ],
            to: "hunt",
          },
        ],
      },
    },
    hunt: {
      on: {
        "rootbound:healer_defeated": [
          {
            guard: (ctx) => Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0),
            actions: [
              setVar("defeated", true),
              emit("quest:advanced", (ctx) => ({
                questId: ROOTBOUND_GROTTO_QUEST_ID,
                playerId: ctx.bind.player,
                giverId: ctx.bind.giver,
                objective: "Return to the herbalist.",
              })),
            ],
            to: "report",
          },
        ],
      },
    },
    report: {
      on: {
        "dialog:reported": [
          {
            guard: (ctx) => Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
              && Number(ctx.payload?.speakerId || 0) === Number(ctx.bind.giver || 0)
              && String(ctx.payload?.questId || "") === ROOTBOUND_GROTTO_QUEST_ID,
            actions: [
              setVar("rewardGranted", true),
              (ctx) => {
                const playerId = Number(ctx.bind.player || 0) | 0;
                const reward = createItemById(ctx.world, REWARD_ITEM_ID);
                if (reward > 0) addToInventory(ctx.world, playerId, reward);
                const gold = createItemById(ctx.world, "gold", { count: REWARD_GOLD });
                if (gold > 0) addToInventory(ctx.world, playerId, gold);
              },
              emit("quest:completed", (ctx) => ({
                questId: ROOTBOUND_GROTTO_QUEST_ID,
                playerId: ctx.bind.player,
                giverId: ctx.bind.giver,
                title: "The Rootbound Grotto",
                rewardGold: REWARD_GOLD,
                rewardItemIds: [REWARD_ITEM_ID],
              })),
            ],
            to: "complete",
          },
        ],
      },
    },
    complete: { terminal: true, on: {} },
  },
});
