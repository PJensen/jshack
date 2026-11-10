import { DungeonState } from "../../components/DungeonState.js";
import { DeathApplied } from "../../components/DeathApplied.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { Position } from "../../components/Position.js";
import { QuestVars } from "../../components/QuestVars.js";
import { QuestBindings } from "../../components/QuestBindings.js";
import { RunObjectiveTarget } from "../../components/RunObjectiveTarget.js";
import { attachEntityToCurrentFloor } from "../../utils/floorEntities.js";
import { buildCatalogItem } from "../../data/itemCatalogLoader.js";
import { createItemById } from "../../utils/itemFactory.js";
import { getCatalogItem } from "../../data/itemCatalog.js";
import { getMonster } from "../../data/monsters.js";
import { createRng } from "../../utils/rng.js";
import { spawnMonsterEntity } from "../../utils/spawnMonsterEntity.js";
import { consumeInventoryIdentity, inventoryHasIdentity } from "../../utils/townEconomy.js";
import { addToInventory } from "../../utils/inventoryFacade.js";
import { emit, grantSelectedReward, isSelectedReward, setVar } from "../actions.js";
import { registerQuest } from "../registry.js";
import { ensureQuestRuntimeEventRoutes, findQuestEntity, getQuestRecord, instantiateQuest } from "../runtime.js";
import { isWalkable } from "../../environment/dungeon/tileMap.js";
import { getUnderworldRegionTemplate } from "../../environment/dungeon/underworldRegions.js";
import { defineExtension } from "../../../lib/ecs-js/index.js";
import { selectedQuestRewardItemIds } from "../rewardOptions.js";

export const RUN_CONTRACT_QUEST_ID = "run.contract";

const RUN_CONTRACT_HOOKS_KEY = Symbol.for("jshack:quests:runContract");

const BOSS_POOL = Object.freeze([
  Object.freeze({ monsterId: "bandit_captain", templateId: "bandit_hideout", minDepth: 2, maxDepth: 4, hpMult: 1.6, acc: 2, dmg: 2, evade: 1 }),
  Object.freeze({ monsterId: "orc_warchief", templateId: "bandit_hideout", minDepth: 2, maxDepth: 4, hpMult: 1.7, acc: 2, dmg: 2, evade: 1 }),
  Object.freeze({ monsterId: "troll", templateId: "old_well", minDepth: 2, maxDepth: 2, hpMult: 1.65, acc: 1, dmg: 3, evade: 0 }),
  Object.freeze({ monsterId: "wraith", templateId: "graveyard_crypt", minDepth: 2, maxDepth: 2, hpMult: 1.5, acc: 2, dmg: 2, evade: 2 }),
  Object.freeze({ monsterId: "dark_acolyte", templateId: "forgotten_shrine", minDepth: 2, maxDepth: 2, hpMult: 1.45, acc: 2, dmg: 2, evade: 1 }),
  Object.freeze({ monsterId: "lich", templateId: "graveyard_crypt", minDepth: 2, maxDepth: 2, hpMult: 1.45, acc: 3, dmg: 3, evade: 2 }),
  Object.freeze({ monsterId: "demon", templateId: "forgotten_shrine", minDepth: 2, maxDepth: 2, hpMult: 1.5, acc: 3, dmg: 3, evade: 1 }),
]);

const BOSS_FIRST_NAMES = Object.freeze([
  "Kharos",
  "Mournfang",
  "Vel",
  "Grimsaint",
  "Ashknot",
  "Yrsa",
  "Torvek",
  "Nerez",
]);

const BOSS_TITLES = Object.freeze([
  "the Black",
  "the Hungering",
  "the Hollow",
  "the Grave-Bound",
  "the Collector",
  "the Ash-Eyed",
  "the Red Hand",
  "the Quiet Blade",
]);

const RELIC_POOL = Object.freeze([
  Object.freeze({
    itemId: "relic_ember_censer",
    title: "Ember Censer",
    objectiveNoun: "the Ember Censer",
  }),
  Object.freeze({
    itemId: "relic_glass_heart",
    title: "Glass Heart",
    objectiveNoun: "the Glass Heart",
  }),
  Object.freeze({
    itemId: "relic_pale_idol",
    title: "Pale Idol",
    objectiveNoun: "the Pale Idol",
  }),
  Object.freeze({
    itemId: "relic_stone_tongue",
    title: "Stone Tongue",
    objectiveNoun: "the Stone Tongue",
  }),
]);

const SPAWN_OFFSETS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([1, 0]),
  Object.freeze([-1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([0, -1]),
  Object.freeze([2, 0]),
  Object.freeze([-2, 0]),
  Object.freeze([0, 2]),
  Object.freeze([0, -2]),
  Object.freeze([1, 1]),
  Object.freeze([1, -1]),
  Object.freeze([-1, 1]),
  Object.freeze([-1, -1]),
  Object.freeze([2, 1]),
  Object.freeze([2, -1]),
  Object.freeze([-2, 1]),
  Object.freeze([-2, -1]),
]);

function clampInt(value, min, max) {
  const n = Number(value) | 0;
  return Math.max(min, Math.min(max, n));
}

function buildChecklist(spec, state = {}) {
  const bossDone = !!state.bossKilled;
  const relicDone = !!state.relicDelivered;
  return Object.freeze([
    Object.freeze({
      text: `Kill ${spec.bossName} on floor ${spec.bossDepth} of ${spec.entranceLabel}.`,
      done: bossDone,
    }),
    Object.freeze({
      text: `Bring ${spec.relicTitle} back to town.`,
      done: relicDone,
    }),
  ]);
}

function buildObjectiveText(spec, state = {}) {
  if (!state.bossKilled) {
    return `Enter ${spec.entranceLabel} and kill ${spec.bossName} on floor ${spec.bossDepth}, then recover ${spec.relicTitle}.`;
  }
  if (!state.relicRecovered) {
    return `Recover ${spec.relicTitle} from ${spec.bossName}'s remains.`;
  }
  if (!state.relicDelivered) {
    return `Return to town with ${spec.relicTitle}.`;
  }
  return `The town has reclaimed ${spec.relicTitle}.`;
}

function currentDepth(world, fallback = 0) {
  for (const [, ds] of world.query(DungeonState)) return Number(ds?.currentDepth ?? fallback) | 0;
  return fallback;
}

function currentDownStairPos(world) {
  let anchorX = 0;
  let anchorY = 0;
  let hasAnchor = false;
  for (const [, ds] of world.query(DungeonState)) {
    anchorX = Number(ds?.regionAnchorX || 0) | 0;
    anchorY = Number(ds?.regionAnchorY || 0) | 0;
    hasAnchor = true;
    break;
  }
  let best = null;
  let bestDist = Infinity;
  for (const [, pos, ni] of world.query(Position, NamedIdentity)) {
    if (String(ni?.identity || "") !== "stair_down") continue;
    const candidate = { x: pos.x | 0, y: pos.y | 0 };
    const dist = hasAnchor ? Math.max(Math.abs(candidate.x - anchorX), Math.abs(candidate.y - anchorY)) : 0;
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  if (best) return best;
  for (const [, ds] of world.query(DungeonState)) {
    if (!Array.isArray(ds?.downStairPositions) || ds.downStairPositions.length <= 0) break;
    for (const stair of ds.downStairPositions) {
      const candidate = { x: Number(stair?.x || 0) | 0, y: Number(stair?.y || 0) | 0 };
      const dist = hasAnchor ? Math.max(Math.abs(candidate.x - anchorX), Math.abs(candidate.y - anchorY)) : 0;
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }
    return best;
  }
  return null;
}

function currentPlayerId(world) {
  for (const [id, ni] of world.query(NamedIdentity)) {
    if (String(ni?.identity || "") === "player") return id;
  }
  return 0;
}

function rewardGoldForDepth(depth) {
  return clampInt(180 + (Number(depth || 1) | 0) * 40, 240, 420);
}

function rewardChoicesForRelic(relicItemId) {
  const choices = {
    relic_ember_censer: [
      { id: "flameward_ring", label: "Flameward Ring", items: [{ itemId: "ring_fire_resist" }] },
      { id: "fire_binding", label: "Firestorm Binding", items: [{ itemId: "scroll_enchant_fire" }] },
      { id: "ruby_socket", label: "Ruby Socket Stone", items: [{ itemId: "gem_ruby" }] },
    ],
    relic_glass_heart: [
      { id: "heartward_ring", label: "Heartward Ring", items: [{ itemId: "ring_health" }] },
      { id: "fortified_binding", label: "Fortified Binding", items: [{ itemId: "scroll_enchant_fortified" }] },
      { id: "diamond_socket", label: "Diamond Socket Stone", items: [{ itemId: "gem_diamond" }] },
    ],
    relic_pale_idol: [
      { id: "graveward_ring", label: "Graveward Ring", items: [{ itemId: "ring_poison_resist" }] },
      { id: "venomward_binding", label: "Venom Ward Binding", items: [{ itemId: "scroll_enchant_venom_ward" }] },
      { id: "obsidian_socket", label: "Obsidian Socket Stone", items: [{ itemId: "gem_obsidian" }] },
    ],
    relic_stone_tongue: [
      { id: "arcana_ring", label: "Ring of Arcana", items: [{ itemId: "ring_arcana" }] },
      { id: "frost_binding", label: "Frost Binding", items: [{ itemId: "scroll_enchant_frost" }] },
      { id: "amethyst_socket", label: "Amethyst Socket Stone", items: [{ itemId: "gem_amethyst" }] },
    ],
  };
  return choices[String(relicItemId || "")] || choices.relic_glass_heart;
}

export function buildRunContractSpec(world, opts = {}) {
  const worldSeed = Number(opts.worldSeed ?? world?.seed ?? 0) >>> 0;
  const playerId = Number(opts.playerId || 1) | 0;
  const rng = createRng((worldSeed ^ ((playerId * 0x9e3779b9) >>> 0) ^ 0x72756e71) >>> 0);
  const bossBase = BOSS_POOL[rng.int(0, BOSS_POOL.length - 1)] || BOSS_POOL[0];
  const monster = getMonster(bossBase.monsterId) || { id: bossBase.monsterId, name: bossBase.monsterId };
  const relic = RELIC_POOL[rng.int(0, RELIC_POOL.length - 1)] || RELIC_POOL[0];
  const entrance = getUnderworldRegionTemplate(bossBase.templateId);
  const bossDepth = rng.int(bossBase.minDepth, bossBase.maxDepth);
  const bossName = `${String(rng.choice(BOSS_FIRST_NAMES) || "Kharos")} ${String(rng.choice(BOSS_TITLES) || "the Black")}`;
  return Object.freeze({
    questId: RUN_CONTRACT_QUEST_ID,
    bossMonsterId: String(monster.id || bossBase.monsterId),
    bossMonsterName: String(monster.name || bossBase.monsterId),
    bossName,
    bossDepth,
    entranceTemplateId: String(entrance?.templateId || bossBase.templateId || ""),
    entranceLabel: String(entrance?.label || "the marked dungeon"),
    relicItemId: String(relic.itemId),
    relicTitle: String(relic.title),
    relicObjectiveNoun: String(relic.objectiveNoun || relic.title),
    rewardGold: rewardGoldForDepth(bossDepth),
    rewardChoices: rewardChoicesForRelic(relic.itemId),
    bossHpMult: Number(bossBase.hpMult || 1.5),
    bossAcc: Number(bossBase.acc || 0),
    bossDmg: Number(bossBase.dmg || 0),
    bossEvade: Number(bossBase.evade || 0),
  });
}

function findObjectiveEntity(world, role) {
  const wantRole = String(role || "");
  for (const [id, target] of world.query(RunObjectiveTarget)) {
    if (String(target?.questId || "") !== RUN_CONTRACT_QUEST_ID) continue;
    if (String(target?.role || "") !== wantRole) continue;
    return id;
  }
  return 0;
}

function relicInInventory(world, playerId, spec) {
  return inventoryHasIdentity(world, playerId, String(spec?.relicItemId || ""), 1);
}

export function canTurnInRunContract(world, playerId) {
  const quest = getQuestRecord(world, RUN_CONTRACT_QUEST_ID, Number(playerId || 0) | 0);
  return !!quest && relicInInventory(world, Number(playerId || 0) | 0, quest.vars?.data || {});
}

function findOpenSpawnPosition(world, seed) {
  const anchor = currentDownStairPos(world);
  if (!anchor) return null;
  const rng = createRng((Number(seed || 0) ^ 0x9e3779b9) >>> 0);
  const start = rng.int(0, SPAWN_OFFSETS.length - 1);
  for (let i = 0; i < SPAWN_OFFSETS.length; i++) {
    const [dx, dy] = SPAWN_OFFSETS[(start + i) % SPAWN_OFFSETS.length];
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

function createRelicDrop(world, spec, at) {
  const relicId = buildCatalogItem(world, spec.relicItemId, { count: 1 });
  if (!(relicId > 0)) return 0;
  world.add(relicId, Position, { x: Number(at?.x || 0) | 0, y: Number(at?.y || 0) | 0 });
  world.add(relicId, RunObjectiveTarget, { questId: RUN_CONTRACT_QUEST_ID, role: "relic" });
  attachEntityToCurrentFloor(world, relicId);
  world.emit("item:dropped", {
    itemId: relicId,
    count: 1,
    at: { x: Number(at?.x || 0) | 0, y: Number(at?.y || 0) | 0 },
  });
  return relicId;
}

function createBoss(world, spec) {
  const monster = getMonster(spec.bossMonsterId);
  if (!monster) return 0;
  const depth = Math.max(1, Number(spec.bossDepth || 1) | 0);
  const at = findOpenSpawnPosition(world, ((world.seed >>> 0) ^ ((depth * 0x85ebca6b) >>> 0)) >>> 0);
  if (!at) return 0;
  const scaledHp = Math.max(
    monster.baseHp + Math.round(Math.max(0, depth - 1) * Number(monster.hpPerLevel || 0)),
    Math.round(monster.baseHp * Number(spec.bossHpMult || 1.5)),
  );
  const bossId = spawnMonsterEntity(world, {
    x: at.x,
    y: at.y,
    name: spec.bossName,
    identity: spec.bossMonsterId,
    maxHp: scaledHp,
    hp: scaledHp,
    faction: "enemy",
    accuracyDerived: Number(monster.attack || 0) + Number(spec.bossAcc || 0),
    damagePowerDerived: Number(monster.attack || 0) + Number(spec.bossDmg || 0),
    evadeDerived: Number(monster.defense || 0) + Number(spec.bossEvade || 0),
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
  world.add(bossId, RunObjectiveTarget, { questId: RUN_CONTRACT_QUEST_ID, role: "boss" });
  attachEntityToCurrentFloor(world, bossId);
  world.emit("spawned", {
    id: bossId,
    at: { x: at.x | 0, y: at.y | 0 },
    kind: "run-contract-boss",
  });
  return bossId;
}

export function ensureRunContractTargets(world) {
  const quest = getQuestRecord(world, RUN_CONTRACT_QUEST_ID, 0);
  if (!quest || String(quest.state?.status || "") === "complete") return 0;
  const spec = quest.vars?.data || {};
  if (!spec.accepted) return 0;
  if ((currentDepth(world, 0) | 0) !== (Number(spec.bossDepth || 0) | 0)) return 0;
  for (const [, ds] of world.query(DungeonState)) {
    if (String(ds?.activeTemplateId || "") !== String(spec.entranceTemplateId || "")) return 0;
    break;
  }
  if (quest.vars?.data?.bossKilled) return 0;
  const existing = findObjectiveEntity(world, "boss");
  if (existing > 0) return existing;
  return createBoss(world, spec);
}

export function installRunContractHooks(world) {
  world.install(defineExtension("jshack:quests:runContract", (installedWorld) => {
    return installedWorld.on("dungeon:transitioned", ({ depth, templateId }) => {
      const q = getQuestRecord(installedWorld, RUN_CONTRACT_QUEST_ID, 0);
      if (!q || String(q.state?.status || "") === "complete") return;
      const spec = q.vars?.data || {};
      if ((Number(depth || 0) | 0) !== (Number(spec.bossDepth || 0) | 0)) return;
      if (String(templateId || "") !== String(spec.entranceTemplateId || "")) return;
      ensureRunContractTargets(installedWorld);
    });
  }, { key: RUN_CONTRACT_HOOKS_KEY }));
}

export function runContractDeathSystem(world) {
  for (const [, death] of world.query(DeathApplied)) {
    const bossId = Number(death.target || 0) | 0;
    if (!(bossId > 0)) continue;
    const marker = world.get(bossId, RunObjectiveTarget);
    if (!marker || String(marker.questId || "") !== RUN_CONTRACT_QUEST_ID || String(marker.role || "") !== "boss") continue;
    const quest = getQuestRecord(world, RUN_CONTRACT_QUEST_ID, 0);
    if (!quest || quest.vars?.data?.bossKilled) continue;
    const spec = quest.vars?.data || {};
    const playerId = Number(quest.bindings?.player || 0) | 0;
    if (findObjectiveEntity(world, "relic") <= 0 && !relicInInventory(world, playerId, spec)) {
      createRelicDrop(world, spec, death.at || world.get(bossId, Position) || null);
    }
    world.emit?.("runContract:bossKilled", {
      questId: RUN_CONTRACT_QUEST_ID,
      playerId,
      bossId,
    });
  }
}

export const RunContractQuest = registerQuest({
  id: RUN_CONTRACT_QUEST_ID,
  title: "The Town Wants a Trophy",
  version: 1,
  journal: {
    flavorText: "A standing contract from town leadership: kill the marked threat, recover its relic, and bring home something the whole settlement can point to.",
    rewardChoice: true,
  },
  vars: {
    accepted: false,
    progress: 0,
    target: 2,
    bossKilled: false,
    relicRecovered: false,
    relicDelivered: false,
    objective: "",
    checklist: [],
  },
  nodes: {
    offer: {
      on: {
        "dialog:accepted": [
          {
            guard: (ctx) => (
              Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
              && Number(ctx.payload?.speakerId || 0) === Number(ctx.bind.giver || 0)
              && String(ctx.payload?.questId || "") === RUN_CONTRACT_QUEST_ID
            ),
            actions: [
              setVar("accepted", true),
              setVar("objective", (ctx) => buildObjectiveText(ctx.vars, ctx.vars)),
              setVar("checklist", (ctx) => buildChecklist(ctx.vars, ctx.vars)),
              emit("quest:started", (ctx) => ({
                questId: RUN_CONTRACT_QUEST_ID,
                playerId: ctx.bind.player,
                giverId: ctx.bind.giver,
                title: "The Town Wants a Trophy",
              })),
            ],
            to: "hunt",
          },
        ],
      },
    },
    hunt: {
      on: {
        "runContract:bossKilled": [
          {
            guard: (ctx) => (
              Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
              && String(ctx.payload?.questId || "") === RUN_CONTRACT_QUEST_ID
            ),
            actions: [
              setVar("bossKilled", true),
              setVar("progress", 1),
              setVar("objective", (ctx) => buildObjectiveText(ctx.vars, { ...ctx.vars, bossKilled: true })),
              setVar("checklist", (ctx) => buildChecklist(ctx.vars, { ...ctx.vars, bossKilled: true })),
              emit("quest:advanced", (ctx) => ({
                questId: RUN_CONTRACT_QUEST_ID,
                playerId: ctx.bind.player,
                objective: `Recover ${String(ctx.vars?.relicTitle || "the relic")} and bring it back to town.`,
              })),
            ],
            to: "recover",
          },
        ],
      },
    },
    recover: {
      on: {
        "item:pickup": [
          {
            guard: (ctx) => {
              const itemId = Number(ctx.payload?.itemId || 0) | 0;
              const marker = itemId > 0 ? ctx.world.get(itemId, RunObjectiveTarget) : null;
              return Number(ctx.payload?.actor || 0) === Number(ctx.bind.player || 0)
                && String(marker?.questId || "") === RUN_CONTRACT_QUEST_ID
                && String(marker?.role || "") === "relic";
            },
            actions: [
              setVar("relicRecovered", true),
              setVar("objective", (ctx) => buildObjectiveText(ctx.vars, { ...ctx.vars, bossKilled: true, relicRecovered: true })),
              setVar("checklist", (ctx) => buildChecklist(ctx.vars, { ...ctx.vars, bossKilled: true, relicRecovered: true })),
              emit("quest:advanced", (ctx) => ({
                questId: RUN_CONTRACT_QUEST_ID,
                playerId: ctx.bind.player,
                objective: `Return to town with ${String(ctx.vars?.relicTitle || "the relic")}.`,
              })),
            ],
            to: "return",
          },
        ],
      },
    },
    return: {
      on: {
        "dialog:reported": [
          {
            guard: (ctx) => (
              Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
              && Number(ctx.payload?.speakerId || 0) === Number(ctx.bind.giver || 0)
              && String(ctx.payload?.questId || "") === RUN_CONTRACT_QUEST_ID
              && inventoryHasIdentity(ctx.world, Number(ctx.bind.player || 0) | 0, String(ctx.vars?.relicItemId || ""), 1)
            ),
            actions: [
              (ctx) => {
                consumeInventoryIdentity(ctx.world, Number(ctx.bind.player || 0) | 0, String(ctx.vars?.relicItemId || ""), 1);
              },
              setVar("relicDelivered", true),
              setVar("progress", 2),
              setVar("checklist", (ctx) => buildChecklist(ctx.vars, {
                ...ctx.vars,
                bossKilled: true,
                relicRecovered: true,
                relicDelivered: true,
              })),
              setVar("objective", "Choose your town reward."),
              emit("quest:advanced", (ctx) => ({
                questId: RUN_CONTRACT_QUEST_ID,
                playerId: ctx.bind.player,
                objective: "Choose your town reward.",
              })),
            ],
            to: "reward",
          },
        ],
      },
    },
    reward: {
      on: {
        "quest:reward_selected": [
          {
            guard: (ctx) => (
              Number(ctx.payload?.playerId || 0) === Number(ctx.bind.player || 0)
              && String(ctx.payload?.questId || "") === RUN_CONTRACT_QUEST_ID
              && isSelectedReward(ctx)
            ),
            actions: [
              grantSelectedReward(),
              setVar("objective", "The town has reclaimed the trophy."),
              emit("quest:completed", (ctx) => ({
                questId: RUN_CONTRACT_QUEST_ID,
                playerId: ctx.bind.player,
                title: "The Town Wants a Trophy",
                rewardGold: Math.max(0, Number(ctx.vars?.rewardGold || 0) | 0),
                rewardItemIds: selectedQuestRewardItemIds(ctx.def, ctx.vars, ctx.payload?.rewardId),
                at: (() => {
                  const p = ctx.world.get(Number(ctx.bind.player || 0) | 0, Position);
                  return p ? { x: Number(p.x) | 0, y: Number(p.y) | 0 } : null;
                })(),
              })),
            ],
            to: "complete",
          },
        ],
      },
    },
    complete: {
      terminal: true,
    },
  },
});

export function ensureRunContractQuest(world, opts = {}) {
  const playerId = Number(opts.playerId || currentPlayerId(world) || 1) | 0;
  if (!(playerId > 0)) return 0;

  let giverId = 0;
  for (const [id, ni] of world.query(NamedIdentity)) {
    if (String(ni?.identity || "") === "townfolk_mason") { giverId = id; break; }
  }
  ensureQuestRuntimeEventRoutes(world, ["dialog:accepted", "runContract:bossKilled", "item:pickup", "dialog:reported", "quest:reward_selected"]);

  const existing = findQuestEntity(world, RUN_CONTRACT_QUEST_ID, playerId);
  if (existing > 0) {
    const quest = getQuestRecord(world, RUN_CONTRACT_QUEST_ID, playerId);
    const generated = buildRunContractSpec(world, { ...opts, playerId });
    const oldVars = quest?.vars?.data || {};
    if (!oldVars.entranceTemplateId || !(Number(quest?.bindings?.giver || 0) > 0)) {
      const migrated = {
        ...generated,
        ...oldVars,
        accepted: oldVars.accepted !== false || String(quest?.state?.node || "") !== "offer",
        bossDepth: oldVars.entranceTemplateId ? oldVars.bossDepth : generated.bossDepth,
        entranceTemplateId: String(oldVars.entranceTemplateId || generated.entranceTemplateId),
        entranceLabel: String(oldVars.entranceLabel || generated.entranceLabel),
      };
      if (!oldVars.entranceTemplateId) {
        migrated.objective = buildObjectiveText(migrated, migrated);
        migrated.checklist = buildChecklist(migrated, migrated);
      }
      world.set(existing, QuestVars, {
        data: migrated,
      });
      if (giverId > 0) {
        world.set(existing, QuestBindings, { player: playerId, giver: giverId, target: giverId });
      }
    }
    return existing;
  }

  const spec = buildRunContractSpec(world, { ...opts, playerId });
  if (!(giverId > 0)) return 0;

  const qid = instantiateQuest(
    world,
    RUN_CONTRACT_QUEST_ID,
    { player: playerId, giver: giverId, target: giverId },
    {
      ...spec,
      progress: 0,
      target: 2,
      bossKilled: false,
      relicRecovered: false,
      relicDelivered: false,
      accepted: false,
      objective: `Ask the mason about the town's trophy contract.`,
      checklist: [],
    },
    { node: "offer", status: "active" },
  );

  return qid;
}
