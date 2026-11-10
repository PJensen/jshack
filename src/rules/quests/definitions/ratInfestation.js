import { DeathApplied } from "../../components/DeathApplied.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { Position } from "../../components/Position.js";
import { QuestVars } from "../../components/QuestVars.js";
import { DungeonState } from "../../components/DungeonState.js";
import { DoorKey } from "../../components/DoorKey.js";
import { ItemInfo } from "../../components/ItemInfo.js";
import { Material } from "../../components/Material.js";
import { getMonster } from "../../data/monsters.js";
import { RAT_CELLAR_LOCK_ID } from "../../data/questLocks.js";
import { createItemById } from "../../utils/itemFactory.js";
import { addToInventory, inventoryItems } from "../../utils/inventoryFacade.js";
import { spawnMonsterEntity } from "../../utils/spawnMonsterEntity.js";
import { attachEntityToCurrentFloor } from "../../utils/floorEntities.js";
import { firstPlayerId } from "../../utils/worldAccess.js";
import { isWalkable } from "../../environment/dungeon/tileMap.js";
import { emit, grantSelectedReward, incVar, isSelectedReward, setVar } from "../actions.js";
import { registerQuest } from "../registry.js";
import { getQuestRecord } from "../runtime.js";
import { defineExtension } from "../../../lib/ecs-js/index.js";
import { selectedQuestRewardItemIds } from "../rewardOptions.js";

export const RAT_INFESTATION_QUEST_ID = "starter.rat_infestation";
export const REQUIRED_RAT_KILLS = 5;
export { RAT_CELLAR_LOCK_ID };
const REWARD_GOLD = 150;
const REWARD_ITEM_IDS = Object.freeze(["bow_mirror"]);
const DUNGEON_RAT_INFESTATION_COUNT = 10;

const RAT_HOOKS_KEY = Symbol.for("jshack:quests:ratInfestation");

// Later Rat King pass: prefer a farthest-room boss spawn first. A locked
// back-half cellar needs reachability proof before it touches generation.

function isRat(world, entityId) {
  const ni = world.get(entityId, NamedIdentity);
  return String(ni?.identity || "") === "rat";
}

function killCount(world, qid) {
  const rec = world.get(qid, QuestVars);
  return Number(rec?.data?.killCount || 0);
}

function ratProgressPayload(ctx) {
  const playerId = Number(ctx.bind.player || 0) | 0;
  const pos = playerId > 0 ? ctx.world.get(playerId, Position) : null;
  return {
    questId: RAT_INFESTATION_QUEST_ID,
    playerId,
    progress: killCount(ctx.world, ctx.qid),
    target: REQUIRED_RAT_KILLS,
    label: "RATS",
    at: pos ? { x: Number(pos.x) | 0, y: Number(pos.y) | 0 } : null,
  };
}

export function ensureRatCellarKey(world, playerId) {
  const actorId = Number(playerId || 0) | 0;
  if (!(actorId > 0)) return 0;
  for (const itemId of inventoryItems(world, actorId)) {
    if (String(world.get(itemId, DoorKey)?.lockId || "") === RAT_CELLAR_LOCK_ID) return itemId;
  }

  const keyId = world.create();
  world.add(keyId, NamedIdentity, { name: "Tavern Cellar Key", identity: "key_tavern_cellar" });
  world.add(keyId, ItemInfo, {
    type: "tool",
    slot: "",
    weight: 0.1,
    value: 0,
    description: "A heavy iron key for the tavern cellar hatch.",
    count: 1,
  });
  world.add(keyId, Material, { kind: "iron" });
  world.add(keyId, DoorKey, { lockId: RAT_CELLAR_LOCK_ID });
  return addToInventory(world, actorId, keyId) ? keyId : 0;
}

function currentDownStairPos(world) {
  for (const [, pos, ni] of world.query(Position, NamedIdentity)) {
    if (String(ni?.identity || "") !== "stair_down") continue;
    return { x: pos.x | 0, y: pos.y | 0 };
  }
  for (const [, ds] of world.query(DungeonState)) {
    if (!Array.isArray(ds?.downStairPositions) || ds.downStairPositions.length <= 0) break;
    const first = ds.downStairPositions[0];
    return { x: Number(first?.x || 0) | 0, y: Number(first?.y || 0) | 0 };
  }
  return null;
}

function occupiedPositions(world) {
  const occupied = new Set();
  for (const [, pos] of world.query(Position)) {
    occupied.add(`${pos.x | 0},${pos.y | 0}`);
  }
  return occupied;
}

function ratCount(world) {
  let count = 0;
  for (const [, ni] of world.query(NamedIdentity, Position)) {
    if (String(ni?.identity || "") === "rat") count++;
  }
  return count;
}

function questWantsDungeonRats(world, playerId) {
  const quest = getQuestRecord(world, RAT_INFESTATION_QUEST_ID, playerId);
  if (!quest) return false;
  if (String(quest.state?.status || "active") !== "active") return false;
  if (String(quest.state?.node || "") !== "hunt") return false;
  const vars = quest.vars?.data || {};
  if (vars.accepted !== true) return false;
  return Number(vars.killCount || 0) < REQUIRED_RAT_KILLS;
}

function isTavernBasement(world) {
  for (const [, ds] of world.query(DungeonState)) {
    return String(ds?.activeTemplateId || "") === "tavern_basement";
  }
  return false;
}

function spawnRatAt(world, x, y) {
  const def = getMonster("rat");
  if (!def) return 0;
  const id = spawnMonsterEntity(world, {
    x,
    y,
    name: def.name,
    identity: def.id,
    maxHp: def.baseHp,
    faction: "enemy",
    naturalDamageDice: def.damageDice,
    sizeClass: def.sizeClass,
    massKg: def.massKg,
    resistances: def.resistances,
    speed: def.speed,
  });
  if (id > 0) attachEntityToCurrentFloor(world, id);
  return id;
}

export function ensureRatInfestationQuestRats(world) {
  if (!isTavernBasement(world)) return 0;

  const playerId = firstPlayerId(world);
  if (!(playerId > 0)) return 0;
  if (!questWantsDungeonRats(world, playerId)) return 0;

  const existing = ratCount(world);
  if (existing >= DUNGEON_RAT_INFESTATION_COUNT) return 0;

  const anchor = currentDownStairPos(world) || world.get(playerId, Position);
  if (!anchor) return 0;

  const occupied = occupiedPositions(world);
  let spawned = 0;
  for (let radius = 1; radius <= 10 && existing + spawned < DUNGEON_RAT_INFESTATION_COUNT; radius++) {
    for (let dy = -radius; dy <= radius && existing + spawned < DUNGEON_RAT_INFESTATION_COUNT; dy++) {
      for (let dx = -radius; dx <= radius && existing + spawned < DUNGEON_RAT_INFESTATION_COUNT; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = (anchor.x | 0) + dx;
        const y = (anchor.y | 0) + dy;
        const key = `${x},${y}`;
        if (occupied.has(key)) continue;
        if (!isWalkable(x, y)) continue;
        const id = spawnRatAt(world, x, y);
        if (!(id > 0)) continue;
        occupied.add(key);
        spawned++;
      }
    }
  }
  return spawned;
}

export function installRatQuestHooks(world) {
  world.install(defineExtension("jshack:quests:ratInfestation", (installedWorld) => {
    return installedWorld.on("dungeon:transitioned", ({ templateId }) => {
      if (String(templateId || "") !== "tavern_basement") return;
      ensureRatInfestationQuestRats(installedWorld);
    });
  }, { key: RAT_HOOKS_KEY }));
}

export function ratInfestationDeathSystem(world) {
  for (const [, death] of world.query(DeathApplied)) {
    const killerId = Number(death.killer || 0) | 0;
    const victimId = Number(death.target || 0) | 0;
    if (!(killerId > 0) || !(victimId > 0)) continue;
    if (!isRat(world, victimId)) continue;

    const playerId = firstPlayerId(world);
    if (killerId !== playerId) continue;

    const quest = getQuestRecord(world, RAT_INFESTATION_QUEST_ID, playerId);
    if (!quest) continue;
    if (String(quest.state?.status || "active") !== "active") continue;
    if (String(quest.state?.node || "") !== "hunt") continue;

    world.emit("rat:killed", { playerId, victimId });
  }
}

export const RatInfestationQuest = registerQuest({
  id: RAT_INFESTATION_QUEST_ID,
  title: "Rat Infestation",
  version: 1,
  journal: {
    flavorText: "The barkeep is tired of hearing claws in the cellar walls. He wants the infestation culled before the tavern loses its stores.",
    rewardChoice: true,
    rewardGold: REWARD_GOLD,
    rewardChoices: [
      { id: "bow_mirror", label: "Mirror Bow", items: [{ itemId: "bow_mirror" }] },
      { id: "ratward_ring", label: "Ratward Ring", items: [{ itemId: "ring_poison_resist" }] },
      { id: "venom_ward", label: "Venom Ward Binding", items: [{ itemId: "scroll_enchant_venom_ward" }] },
    ],
    rewardBonusItems: [{ itemId: "food_stew", count: 1, label: "a hot stew from the barkeep" }],
  },
  vars: {
    accepted: false,
    killCount: 0,
    reported: false,
    rewardItemIds: REWARD_ITEM_IDS,
    rewardGold: REWARD_GOLD,
    rewardGranted: false,
    ratsGenocided: false,
    resolution: "",
    worldOutcome: "",
    objective: "",
    completionText: "",
  },
  nodes: {
    offer: {
      on: {
        "dialog:accepted": [
          {
            guard: (ctx) => {
              return Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
                && String(ctx.payload?.questId || "") === RAT_INFESTATION_QUEST_ID;
            },
            actions: [
              setVar("accepted", true),
              setVar("killCount", 0),
              setVar("rewardItemIds", REWARD_ITEM_IDS),
              setVar("rewardGold", REWARD_GOLD),
              setVar("ratsGenocided", false),
              setVar("resolution", ""),
              setVar("worldOutcome", ""),
              setVar("objective", "Clear the tavern cellar"),
              setVar("completionText", ""),
              (ctx) => {
                const giverId = Number(ctx.bind.giver || 0);
                const playerId = Number(ctx.bind.player || 0) | 0;
                if (!(giverId > 0) || !(playerId > 0)) return;
                ensureRatCellarKey(ctx.world, playerId);
                const giverPos = ctx.world.get(giverId, Position);
                if (!giverPos) return;
                if (!Number.isFinite(giverPos.x) || !Number.isFinite(giverPos.y)) return;
                const x = giverPos.x | 0;
                const y = giverPos.y | 0;

                const bowId = createItemById(ctx.world, "bow_short");
                if (bowId > 0) addToInventory(ctx.world, playerId, bowId);

                const arrowsId = createItemById(ctx.world, "ammo_arrows", { count: 20 });
                if (arrowsId > 0) addToInventory(ctx.world, playerId, arrowsId);

                // Beat 1: hand over the gear
                ctx.world.emit("npc:dialogue", {
                  actor: giverId,
                  targetId: playerId,
                  text: "take this — there are bats down there too.",
                });

                // Spawn a rat inside the tavern near the barkeep
                if (Number.isFinite(x) && Number.isFinite(y)) {
                  const offsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
                  for (const [dx, dy] of offsets) {
                    const rx = x + dx;
                    const ry = y + dy;
                    if (isWalkable(rx, ry)) {
                      const def = getMonster("rat");
                      if (def) {
                        spawnMonsterEntity(ctx.world, {
                          x: rx, y: ry,
                          name: def.name,
                          identity: def.id,
                          maxHp: def.baseHp,
                          faction: "enemy",
                          naturalDamageDice: def.damageDice,
                          sizeClass: def.sizeClass,
                          massKg: def.massKg,
                          resistances: def.resistances,
                          speed: def.speed,
                        });
                      }
                      break;
                    }
                  }
                }

                // Beat 2: react to the rat
                if (Number.isFinite(x) && Number.isFinite(y)) {
                  ctx.world.emit("npc:dialogue", {
                    actor: giverId,
                    targetId: playerId,
                    text: "there's one! Kill it!",
                  });
                }
                ensureRatInfestationQuestRats(ctx.world);
              },
              emit("quest:started", (ctx) => ({
                questId: RAT_INFESTATION_QUEST_ID,
                playerId: ctx.bind.player,
                giverId: ctx.bind.giver,
                title: "Rat Infestation",
              })),
            ],
            to: "hunt",
          },
        ],
      },
    },
    hunt: {
      on: {
        "rat:killed": [
          // Threshold reached — transition to report
          {
            guard: (ctx) => {
              return Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
                && killCount(ctx.world, ctx.qid) >= REQUIRED_RAT_KILLS - 1;
            },
            actions: [
              incVar("killCount", 1),
              setVar("resolution", "culled_rats"),
              setVar("worldOutcome", "rats_culled"),
              setVar("objective", "Return to the barkeep."),
              emit("quest:progress", ratProgressPayload),
              emit("quest:advanced", (ctx) => ({
                questId: RAT_INFESTATION_QUEST_ID,
                playerId: ctx.bind.player,
                giverId: ctx.bind.giver,
                objective: "Return to the barkeep.",
              })),
            ],
            to: "report",
          },
          // Not enough yet — stay in hunt
          {
            guard: (ctx) => {
              return Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0);
            },
            actions: [
              incVar("killCount", 1),
              emit("quest:progress", ratProgressPayload),
            ],
            to: "hunt",
          },
        ],
        "scroll:genocide:success": [
          {
            guard: (ctx) => {
              const actor = Number(ctx.payload?.actor || 0) | 0;
              return String(ctx.payload?.identity || "") === "rat"
                && Number(ctx.bind.player || 0) === actor;
            },
            actions: [
              setVar("ratsGenocided", true),
              setVar("resolution", "genocide"),
              setVar("worldOutcome", "rats_erased"),
              setVar("objective", "Return to the barkeep."),
              setVar("completionText", "The cellar fell silent after rat-kind was erased from the run."),
              emit("quest:advanced", (ctx) => ({
                questId: RAT_INFESTATION_QUEST_ID,
                playerId: ctx.bind.player,
                giverId: ctx.bind.giver,
                objective: "Return to the barkeep.",
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
            guard: (ctx) => {
              return Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
                && String(ctx.payload?.questId || "") === RAT_INFESTATION_QUEST_ID
                && Number(ctx.payload?.speakerId || 0) > 0;
            },
            actions: [
              setVar("objective", "Choose your reward."),
              emit("quest:advanced", (ctx) => ({
                questId: RAT_INFESTATION_QUEST_ID,
                playerId: ctx.bind.player,
                giverId: ctx.bind.giver,
                objective: "Choose your reward.",
              })),
            ],
            to: "reward",
          },
        ],
      },
    },
    reward: {
      on: {
        "quest:reward_selected": [{
          guard: (ctx) => Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
            && String(ctx.payload?.questId || "") === RAT_INFESTATION_QUEST_ID
            && isSelectedReward(ctx),
          actions: [
            setVar("reported", true),
            setVar("rewardGranted", true),
            grantSelectedReward(),
            setVar("completionText", (ctx) => String(ctx.vars?.resolution || "") === "genocide"
              ? "The cellar fell silent after rat-kind was erased from the run."
              : "The tavern cellar is clear, at least for now."),
            emit("quest:completed", (ctx) => ({
              questId: RAT_INFESTATION_QUEST_ID,
              playerId: ctx.bind.player,
              giverId: ctx.bind.giver,
              title: "Rat Infestation",
              rewardGold: REWARD_GOLD,
              rewardItemIds: selectedQuestRewardItemIds(ctx.def, ctx.vars, ctx.payload?.rewardId),
              resolution: String(ctx.vars?.resolution || "culled_rats"),
              worldOutcome: String(ctx.vars?.worldOutcome || "rats_culled"),
            })),
          ],
          to: "complete",
        }],
      },
    },
    complete: {
      terminal: true,
    },
  },
});
