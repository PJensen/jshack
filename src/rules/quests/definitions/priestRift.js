import { DeathApplied } from "../../components/DeathApplied.js";
import { DungeonState } from "../../components/DungeonState.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { Position } from "../../components/Position.js";
import { QuestState } from "../../components/QuestState.js";
import { QuestVars } from "../../components/QuestVars.js";
import { RunObjectiveTarget } from "../../components/RunObjectiveTarget.js";
import { attachEntityToCurrentFloor } from "../../utils/floorEntities.js";
import { isWalkable } from "../../environment/dungeon/tileMap.js";
import { getMonster } from "../../data/monsters.js";
import { spawnMonsterEntity } from "../../utils/spawnMonsterEntity.js";
import { activeRiftRecord, createRift } from "../../utils/riftRuntime.js";
import { emit, grantSelectedReward, isSelectedReward, setVar } from "../actions.js";
import { registerQuest } from "../registry.js";
import { ensureQuestRuntimeEventRoutes, findQuestEntity, getQuestRecord, instantiateQuest, STARTER_PRIEST_FETCH_QUEST_ID } from "../runtime.js";
import { defineExtension } from "../../../lib/ecs-js/index.js";
import { selectedQuestRewardItemIds } from "../rewardOptions.js";

export const PRIEST_RIFT_QUEST_ID = "starter.priest_rift";
export const PRIEST_RIFT_TEMPLATE_ID = "priest_rift_crypt";
export const PRIEST_RIFT_LEVELS = 3;

const PRIEST_RIFT_HOOKS_KEY = Symbol.for("jshack:quests:priestRift");
const REWARD_GOLD = 260;
const BOSS_CANDIDATES = Object.freeze(["dark_acolyte", "wraith", "lich", "skeleton"]);
const SPAWN_OFFSETS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([1, 0]),
  Object.freeze([-1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([0, -1]),
  Object.freeze([1, 1]),
  Object.freeze([1, -1]),
  Object.freeze([-1, 1]),
  Object.freeze([-1, -1]),
  Object.freeze([2, 0]),
  Object.freeze([-2, 0]),
  Object.freeze([0, 2]),
  Object.freeze([0, -2]),
]);

function currentPlayerId(world) {
  for (const [id, ni] of world.query(NamedIdentity)) {
    if (String(ni?.identity || "") === "player") return id;
  }
  return 0;
}

function currentPriestId(world) {
  for (const [id, ni] of world.query(NamedIdentity)) {
    if (String(ni?.identity || "") === "townfolk_priest") return id;
  }
  return 0;
}

function currentDepth(world) {
  for (const [, ds] of world.query(DungeonState)) return Number(ds?.currentDepth || 0) | 0;
  return 0;
}

function currentRiftTemplate(world) {
  for (const [, ds] of world.query(DungeonState)) return String(ds?.activeTemplateId || "");
  return "";
}

function currentDownStairPos(world) {
  for (const [, pos, ni] of world.query(Position, NamedIdentity)) {
    if (String(ni?.identity || "") === "stair_down") return { x: pos.x | 0, y: pos.y | 0 };
  }
  for (const [, ds] of world.query(DungeonState)) {
    if (!Array.isArray(ds?.downStairPositions) || ds.downStairPositions.length <= 0) break;
    const first = ds.downStairPositions[0];
    return { x: Number(first?.x || 0) | 0, y: Number(first?.y || 0) | 0 };
  }
  return null;
}

function findObjectiveEntity(world, role) {
  const wantRole = String(role || "");
  for (const [id, target] of world.query(RunObjectiveTarget)) {
    if (String(target?.questId || "") !== PRIEST_RIFT_QUEST_ID) continue;
    if (String(target?.role || "") !== wantRole) continue;
    return id;
  }
  return 0;
}

function pickBossMonster() {
  for (const id of BOSS_CANDIDATES) {
    const monster = getMonster(id);
    if (monster) return monster;
  }
  return null;
}

function findOpenSpawnPosition(world) {
  const anchor = currentDownStairPos(world);
  if (!anchor) return null;
  for (const [dx, dy] of SPAWN_OFFSETS) {
    const x = (anchor.x | 0) + (dx | 0);
    const y = (anchor.y | 0) + (dy | 0);
    if (!isWalkable(x, y)) continue;
    let blocked = false;
    for (const [, pos] of world.query(Position)) {
      if ((pos.x | 0) === x && (pos.y | 0) === y) { blocked = true; break; }
    }
    if (!blocked) return { x, y };
  }
  return anchor;
}

function createPriestRiftBoss(world, quest) {
  const monster = pickBossMonster();
  if (!monster) return 0;
  const at = findOpenSpawnPosition(world);
  if (!at) return 0;
  const depth = Math.max(1, currentDepth(world));
  const scaledHp = Math.max(
    Number(monster.baseHp || 1) + Math.round(depth * Number(monster.hpPerLevel || 0)),
    Math.round(Number(monster.baseHp || 1) * 1.75),
  );
  const bossId = spawnMonsterEntity(world, {
    x: at.x,
    y: at.y,
    name: "The Thing Behind the Psalm",
    identity: String(monster.id || "wraith"),
    maxHp: scaledHp,
    hp: scaledHp,
    faction: "enemy",
    accuracyDerived: Number(monster.attack || 0) + 2,
    damagePowerDerived: Number(monster.attack || 0) + 2,
    evadeDerived: Number(monster.defense || 0) + 1,
    naturalDamageDice: monster.damageDice,
    sizeClass: monster.sizeClass,
    massKg: monster.massKg,
    resistances: monster.resistances,
    speed: monster.speed,
    creatureType: monster.creatureType,
    learnedSpellIds: Array.isArray(monster.learnedSpellIds) ? monster.learnedSpellIds.slice() : undefined,
    equipment: monster.equipment ? { ...monster.equipment } : null,
    wielding: Array.isArray(monster.wielding) ? monster.wielding.slice() : undefined,
    equipped: Array.isArray(monster.equipped) ? monster.equipped.slice() : undefined,
    inventory: Array.isArray(monster.inventory) ? monster.inventory.slice() : undefined,
    maxMana: Number.isFinite(monster.maxMana) ? Number(monster.maxMana) : undefined,
    manaRegen: Number.isFinite(monster.manaRegen) ? Number(monster.manaRegen) : undefined,
  });
  if (!(bossId > 0)) return 0;
  world.add(bossId, RunObjectiveTarget, { questId: PRIEST_RIFT_QUEST_ID, role: "boss" });
  attachEntityToCurrentFloor(world, bossId);
  const vars = quest.vars?.data || {};
  world.set(quest.id, QuestVars, {
    data: {
      ...vars,
      bossId,
      bossName: "The Thing Behind the Psalm",
    },
  });
  world.emit("spawned", {
    id: bossId,
    at: { x: at.x | 0, y: at.y | 0 },
    kind: "priest-rift-boss",
  });
  return bossId;
}

function createQuestRift(ctx) {
  if (String(ctx.vars?.riftId || "")) return;
  const seed = ((ctx.world.seed >>> 0) ^ ((Number(ctx.bind.player || 0) * 0x9e3779b9) >>> 0) ^ 0x50524945) >>> 0;
  const result = createRift(ctx.world, {
    levels: PRIEST_RIFT_LEVELS,
    seed,
    templateId: PRIEST_RIFT_TEMPLATE_ID,
    questId: PRIEST_RIFT_QUEST_ID,
    idPrefix: "priest",
  });
  if (!result?.ok) return;
  const rec = ctx.world.get(ctx.qid, QuestVars);
  ctx.world.set(ctx.qid, QuestVars, {
    data: {
      ...(rec?.data || {}),
      riftId: result.riftId,
      portalId: result.portalId,
      riftOpened: true,
    },
  });
}

export function ensurePriestRiftQuest(world, opts = {}) {
  const playerId = Number(opts.playerId || currentPlayerId(world) || 0) | 0;
  if (!(playerId > 0)) return 0;
  const existing = findQuestEntity(world, PRIEST_RIFT_QUEST_ID, playerId);
  if (existing > 0) return existing;
  const fetch = getQuestRecord(world, STARTER_PRIEST_FETCH_QUEST_ID, playerId);
  if (opts.allowBeforeFetchComplete !== true && String(fetch?.state?.status || "") !== "complete") return 0;
  const priestId = Number(opts.giverId || currentPriestId(world) || 0) | 0;
  if (!(priestId > 0)) return 0;
  ensureQuestRuntimeEventRoutes(world, ["dialog:accepted", "dialog:reported"]);
  return instantiateQuest(
    world,
    PRIEST_RIFT_QUEST_ID,
    { player: playerId, giver: priestId, target: priestId },
    {
      accepted: false,
      riftOpened: false,
      riftId: "",
      portalId: 0,
      bossKilled: false,
      reported: false,
      bossName: "the thing in the rift",
    },
    { node: "offer", status: "active" },
  );
}

export function canOfferPriestRift(world, playerId) {
  const fetch = getQuestRecord(world, STARTER_PRIEST_FETCH_QUEST_ID, playerId);
  if (String(fetch?.state?.status || "") !== "complete") return false;
  const quest = getQuestRecord(world, PRIEST_RIFT_QUEST_ID, playerId);
  return !!quest && String(quest.state?.status || "active") === "active" && String(quest.state?.node || "") === "offer";
}

export function canAcceptPriestRift(world, playerId) {
  if (activeRiftRecord(world)) return false;
  return canOfferPriestRift(world, playerId);
}

export function ensurePriestRiftTargets(world) {
  const quest = getQuestRecord(world, PRIEST_RIFT_QUEST_ID, 0);
  if (!quest || String(quest.state?.status || "") !== "active") return 0;
  if (String(quest.state?.node || "") !== "cleanse") return 0;
  if (!quest.vars?.data?.accepted) return 0;
  if (currentDepth(world) !== PRIEST_RIFT_LEVELS) return 0;
  if (currentRiftTemplate(world) !== PRIEST_RIFT_TEMPLATE_ID) return 0;
  if (quest.vars?.data?.bossKilled) return 0;
  const existing = findObjectiveEntity(world, "boss");
  if (existing > 0) return existing;
  return createPriestRiftBoss(world, quest);
}

export function priestRiftDeathSystem(world) {
  for (const [, death] of world.query(DeathApplied)) {
    const bossId = Number(death.target || 0) | 0;
    if (!(bossId > 0)) continue;
    const marker = world.get(bossId, RunObjectiveTarget);
    if (!marker || String(marker.questId || "") !== PRIEST_RIFT_QUEST_ID || String(marker.role || "") !== "boss") continue;
    const quest = getQuestRecord(world, PRIEST_RIFT_QUEST_ID, 0);
    if (!quest || quest.vars?.data?.bossKilled) continue;
    const vars = quest.vars?.data || {};
    world.set(quest.id, QuestVars, {
      data: {
        ...vars,
        bossKilled: true,
        bossId,
        bossName: String(vars.bossName || "The Thing Behind the Psalm"),
      },
    });
    world.set(quest.id, QuestState, {
      ...quest.state,
      node: "return",
      status: "active",
    });
    world.emit?.("quest:advanced", {
      questId: PRIEST_RIFT_QUEST_ID,
      playerId: Number(quest.bindings?.player || 0) | 0,
      objective: "Return to Father Tovin and tell him the rift is quiet.",
    });
  }
}

export function installPriestRiftHooks(world) {
  world.install(defineExtension("jshack:quests:priestRift", (installedWorld) => {
    const offCompleted = installedWorld.on("quest:completed", (payload) => {
      if (String(payload?.questId || "") !== STARTER_PRIEST_FETCH_QUEST_ID) return;
      ensurePriestRiftQuest(installedWorld, {
        playerId: Number(payload?.playerId || 0) | 0,
        giverId: Number(payload?.giverId || 0) | 0,
        allowBeforeFetchComplete: true,
      });
    });
    const offTransitioned = installedWorld.on("dungeon:transitioned", ({ depth, templateId }) => {
      if ((Number(depth || 0) | 0) !== PRIEST_RIFT_LEVELS) return;
      if (String(templateId || "") !== PRIEST_RIFT_TEMPLATE_ID) return;
      ensurePriestRiftTargets(installedWorld);
    });
    return () => {
      offCompleted();
      offTransitioned();
    };
  }, { key: PRIEST_RIFT_HOOKS_KEY }));
}

export const PriestRiftQuest = registerQuest({
  id: PRIEST_RIFT_QUEST_ID,
  title: "The Rift Below",
  version: 1,
  journal: {
    flavorText: "The returned funerary book did not end Father Tovin's worries. It showed him where the next wound would open.",
    rewardChoice: true,
    rewardChoices: [
      { id: "book_smite", label: "Spellbook of Smite", items: [{ itemId: "book_smite" }] },
      { id: "ring_arcana", label: "Ring of Arcana", items: [{ itemId: "ring_arcana" }] },
      { id: "cursebreaker", label: "Cursebreaker's Kit", items: [{ itemId: "scroll_remove_curse" }, { itemId: "potion_holy_water", count: 2 }] },
    ],
    rewardGold: REWARD_GOLD,
  },
  vars: {
    accepted: false,
    riftOpened: false,
    riftId: "",
    portalId: 0,
    bossKilled: false,
    reported: false,
    bossName: "the thing in the rift",
  },
  nodes: {
    offer: {
      on: {
        "dialog:accepted": [
          {
            guard: (ctx) => (
              Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
              && Number(ctx.payload?.speakerId || 0) === Number(ctx.bind.giver || 0)
              && String(ctx.payload?.questId || "") === PRIEST_RIFT_QUEST_ID
              && !activeRiftRecord(ctx.world)
            ),
            actions: [
              setVar("accepted", true),
              createQuestRift,
              emit("quest:started", (ctx) => ({
                questId: PRIEST_RIFT_QUEST_ID,
                playerId: ctx.bind.player,
                giverId: ctx.bind.giver,
                title: "The Rift Below",
              })),
            ],
            to: "cleanse",
          },
        ],
      },
    },
    cleanse: {
      on: {},
    },
    return: {
      on: {
        "dialog:reported": [
          {
            guard: (ctx) => (
              Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
              && Number(ctx.payload?.speakerId || 0) === Number(ctx.bind.giver || 0)
              && String(ctx.payload?.questId || "") === PRIEST_RIFT_QUEST_ID
              && ctx.vars?.bossKilled === true
            ),
            actions: [
              setVar("objective", "Choose your reward."),
              emit("quest:advanced", (ctx) => ({ questId: PRIEST_RIFT_QUEST_ID, playerId: ctx.bind.player, giverId: ctx.bind.giver, objective: "Choose your reward." })),
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
            && Number(ctx.payload?.speakerId || 0) === Number(ctx.bind.giver || 0)
            && String(ctx.payload?.questId || "") === PRIEST_RIFT_QUEST_ID
            && isSelectedReward(ctx),
          actions: [
            setVar("reported", true),
            grantSelectedReward(),
            emit("quest:completed", (ctx) => ({
              questId: PRIEST_RIFT_QUEST_ID,
              playerId: ctx.bind.player,
              giverId: ctx.bind.giver,
              title: "The Rift Below",
              rewardGold: REWARD_GOLD,
              rewardItemIds: selectedQuestRewardItemIds(ctx.def, ctx.vars, ctx.payload?.rewardId),
              at: (() => {
                const p = ctx.world.get(Number(ctx.bind.player || 0) | 0, Position);
                return p ? { x: Number(p.x) | 0, y: Number(p.y) | 0 } : null;
              })(),
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
