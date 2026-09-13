import { World } from "../../lib/ecs-js/index.js";
import { createRng } from "../../lib/ecs-js/rng.js";
import { configureWorld } from "../scheduler.js";
import { makeRulesDispatcher } from "../input/rulesDispatch.js";
import { buildWorldView } from "../../bridge/schema/worldView.js";
import { buildAgentObservation } from "./agentView.js";

import { initDungeon } from "../../rules/environment/dungeon/index.js";
import { createPlayer } from "../../rules/archetypes/Player.js";
import { getClass } from "../../rules/data/classes.js";
import { createItemById } from "../../rules/utils/itemFactory.js";
import { addToInventory } from "../../rules/utils/inventoryFacade.js";
import { playerEntity, findNearestValidTileAround } from "../../rules/utils/queries.js";
import { initDeity } from "../../rules/systems/deitySystem.js";

import { Equipment } from "../../rules/components/Equipment.js";
import { Mana } from "../../rules/components/Mana.js";
import { Hunger } from "../../rules/components/Hunger.js";
import { Brain } from "../../rules/components/Brain.js";
import { BaseStats } from "../../rules/components/BaseStats.js";
import { Devotion } from "../../rules/components/Devotion.js";
import { Vitality } from "../../rules/components/Vitality.js";
import { DungeonState } from "../../rules/components/DungeonState.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { Position } from "../../rules/components/Position.js";
import { Faction } from "../../rules/components/Faction.js";
import { Owner } from "../../rules/components/Owner.js";
import { Inventory } from "../../rules/components/Inventory.js";
import { Settings } from "../../rules/components/Settings.js";
import { Pet } from "../../rules/components/Pet.js";
import { PetState } from "../../rules/components/PetState.js";
import { effectiveMaxHp } from "../../rules/utils/passiveBonuses.js";
import {
  identify,
  resetIdentification,
  restoreIdentification,
  setIdentificationEnabled,
} from "../../rules/data/identification.js";
import { initGemPricing, restoreGemPricing } from "../../rules/data/gemPricing.js";

import { PHASE_TURNS } from "../../rules/data/calendar.js";

const TOUCHSTONE_IDENTITY = "stone_touchstone";
const GEM_PRICING_SEED_SALT = 0x6E45;

function coerceInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? (n | 0) : fallback;
}

function gemPricingRng(world) {
  return createRng((Number(world?.seed || 0) >>> 0) ^ GEM_PRICING_SEED_SALT);
}

function upsert(world, entityId, component, value) {
  if (world.has(entityId, component)) {
    world.set(entityId, component, value);
  } else {
    world.add(entityId, component, value);
  }
}

function normalizeClassSpells(classDef) {
  /** @type {string[]} */
  const classSpells = [];
  if (Array.isArray(classDef?.startingSpells)) {
    for (const s of classDef.startingSpells) {
      if (s) classSpells.push(String(s));
    }
  } else if (classDef?.startingSpell) {
    classSpells.push(String(classDef.startingSpell));
  }
  return classSpells;
}

/**
 * @param {number} seed
 * @returns {import("../../lib/ecs-js/index.js").World}
 */
export function createConfiguredWorld(seed = 0xC0FFEE) {
  const world = new World({ seed: Number(seed) >>> 0 });
  configureWorld(world);
  return world;
}

/**
 * Initialize identification + gem pricing state for a run.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {{
 *   identifyItems?: boolean,
 *   pendingSavegame?: { identified?: unknown, gemPricing?: unknown } | null,
 * }} [opts]
 */
export function initializeRunItemState(world, opts = {}) {
  setIdentificationEnabled(opts.identifyItems !== false);
  resetIdentification();
  const pendingSavegame = opts?.pendingSavegame || null;
  if (pendingSavegame) {
    restoreIdentification(pendingSavegame.identified);
    if (!Array.isArray(pendingSavegame.identified)) identify(TOUCHSTONE_IDENTITY);
    restoreGemPricing(pendingSavegame.gemPricing);
    if (!Array.isArray(pendingSavegame.gemPricing)) initGemPricing(gemPricingRng(world));
    return;
  }
  identify(TOUCHSTONE_IDENTITY);
  initGemPricing(gemPricingRng(world));
}

/**
 * Reset run item state to a clean non-save baseline.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {{ identifyItems?: boolean }} [opts]
 */
export function reinitializeRunItemStateForFreshStart(world, opts = {}) {
  setIdentificationEnabled(opts.identifyItems !== false);
  resetIdentification();
  identify(TOUCHSTONE_IDENTITY);
  initGemPricing(gemPricingRng(world));
}

/**
 * Re-roll gem pricing for the current world seed.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 */
export function reseedRunGemPricing(world) {
  initGemPricing(gemPricingRng(world));
}

/**
 * Ensure the player entity exists at spawn using class-facing vitals defaults.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {{
 *   x: number,
 *   y: number,
 *   classDef?: any,
 *   playerName?: string,
 * }} opts
 * @returns {{ id:number, pos:{x:number,y:number} }}
 */
export function ensurePlayerSpawned(world, opts) {
  const existing = playerEntity(world);
  if (existing) return existing;
  const classDef = opts?.classDef || null;
  const stats = classDef?.stats || {};
  createPlayer(world, {
    x: Number(opts?.x || 0) | 0,
    y: Number(opts?.y || 0) | 0,
    name: String(opts?.playerName || "Hero"),
    identity: classDef ? `player_${classDef.id}` : "player",
    maxHp: stats.maxHp ?? 20,
    maxStamina: stats.maxStamina ?? 100,
    staminaRegen: stats.staminaRegen ?? 3.0,
  });
  const pe = playerEntity(world);
  if (!pe) throw new Error("ensurePlayerSpawned: failed to create player entity");
  return pe;
}

/**
 * Apply canonical class-derived runtime loadout to an existing player.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} playerId
 * @param {any} classDef
 * @param {{
 *   identifyStarterItems?: boolean,
 *   onStarterItem?: (itemId:string, createdId:number)=>void,
 * }} [opts]
 * @returns {{ classSpells: string[] }}
 */
export function applyPlayerClassLoadout(world, playerId, classDef, opts = {}) {
  const stats = classDef?.stats || {};
  const identifyStarterItems = opts?.identifyStarterItems === true;
  const onStarterItem = typeof opts?.onStarterItem === "function" ? opts.onStarterItem : null;

  upsert(world, playerId, Mana, {
    mana: stats.maxMana ?? 50,
    maxMana: stats.maxMana ?? 50,
    manaRegen: stats.manaRegen ?? 0.1,
  });

  upsert(world, playerId, Hunger, {
    hunger: 0,
    satiation: 100,
  });

  const baseStats = world.has(playerId, BaseStats) ? (world.get(playerId, BaseStats) || {}) : {};
  upsert(world, playerId, BaseStats, {
    ...baseStats,
    strength: stats.strength ?? baseStats.strength ?? 10,
    intelligence: stats.intelligence ?? baseStats.intelligence ?? 10,
    dexterity: stats.dexterity ?? baseStats.dexterity ?? 10,
    vitality: stats.vitality ?? baseStats.vitality ?? 10,
    perception: stats.perception ?? baseStats.perception ?? 5,
  });

  const brain = world.get(playerId, Brain);
  if (brain) {
    if (stats.intelligence != null) brain.intelligence = stats.intelligence;
    if (stats.visionRange != null) brain.visionRange = stats.visionRange;
    upsert(world, playerId, Brain, brain);
  }

  const addStarterItem = (itemId, opts = {}) => {
    const createdId = createItemById(world, itemId, opts);
    if (!(createdId > 0)) return 0;
    const ok = addToInventory(world, playerId, createdId, { silent: true });
    if (ok && identifyStarterItems) {
      const identity = String(world.get(createdId, NamedIdentity)?.identity || itemId || "").trim();
      if (identity) identify(identity);
    }
    if (ok && onStarterItem) {
      try { onStarterItem(String(itemId || ""), createdId); } catch {}
    }
    return ok ? createdId : 0;
  };

  const eq = world.get(playerId, Equipment) || {};
  for (const [slot, itemId] of Object.entries(classDef?.equipment || {})) {
    if (!(slot in eq)) continue;
    eq[slot] = itemId ? (addStarterItem(itemId) || null) : null;
  }
  upsert(world, playerId, Equipment, eq);

  const invItems = Array.isArray(classDef?.inventoryItems) ? classDef.inventoryItems : [];
  for (const row of invItems) {
    if (!row || !row.itemId) continue;
    addStarterItem(row.itemId, { count: coerceInt(row.count, 1) || 1 });
  }

  const classSpells = normalizeClassSpells(classDef);
  if (classSpells.length > 0) {
    const brain = world.get(playerId, Brain);
    if (brain) {
      const existing = Array.isArray(brain.learnedSpellIds)
        ? brain.learnedSpellIds.filter((id) => !classSpells.includes(id))
        : [];
      brain.learnedSpellIds = [...classSpells, ...existing];
      upsert(world, playerId, Brain, brain);
    }
  }

  const deityId = String(classDef?.deityId || "").trim();
  if (deityId) {
    upsert(world, playerId, Devotion, {
      deityId,
      pantheon: true,
    });
    initDeity(deityId, world);
  }
  return { classSpells };
}

/**
 * Ensure player devotion/deity state is initialized for this run.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} playerId
 * @param {{ classDef?: any, fallbackDeityId?: string }} [opts]
 */
export function ensurePlayerDeityState(world, playerId, opts = {}) {
  if (!(playerId > 0)) return;
  const classDef = opts?.classDef || null;
  const fallbackDeityId = String(opts?.fallbackDeityId || "");
  const dev = world.get(playerId, Devotion);
  const deityId = String(dev?.deityId || classDef?.deityId || fallbackDeityId || "");
  if (!deityId) return;
  if (!dev) {
    upsert(world, playerId, Devotion, { deityId, pantheon: true });
  } else if (dev?.pantheon == null) {
    dev.pantheon = true;
  }
  initDeity(deityId, world);
}

/**
 * Spawn the default companion near the player.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} playerId
 * @param {any} classDef
 * @returns {number}
 */
export function spawnStarterPet(world, playerId, classDef) {
  if (!(playerId > 0)) return 0;
  const playerPos = world.get(playerId, Position);
  if (!playerPos) return 0;
  const spawnTile = findNearestValidTileAround(world, playerPos, {
    maxDistance: 1,
    exclude: [{ x: playerPos.x, y: playerPos.y }],
  });
  const isWarlock = classDef?.id === "warlock";
  const petId = world.create();
  world.add(petId, Pet);
  world.add(petId, Position, spawnTile || { x: playerPos.x, y: playerPos.y });
  world.add(petId, NamedIdentity, {
    name: isWarlock ? "Familiar" : "Kitty",
    identity: isWarlock ? "familiar" : "kitty",
  });
  world.add(petId, Faction, { key: "pet" });
  world.add(petId, Owner, { ownerId: playerId });
  world.add(petId, Inventory, { items: [], capacity: 1 });
  world.add(petId, Settings, { autoPickup: true, autoPickupKinds: ["currency", "potion", "ammo", "scroll", "equip"] });
  world.add(petId, Vitality, { maxHp: 30, hp: 30 });
  world.add(petId, Equipment, {
    accuracyDerived: 2,
    damagePowerDerived: 2,
    evadeDerived: 2,
  });
  world.add(petId, PetState, {
    state: "following",
    targetX: null,
    targetY: null,
    targetItemId: 0,
    stateEnteredTurn: world.step,
    lastPlayerX: playerPos.x,
    lastPlayerY: playerPos.y,
    commandCooldown: 0,
    rangedCooldown: 0,
  });
  return petId;
}

/**
 * Build a shared runtime facade around an existing world.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {{
 *   getActorId?: ()=>number,
 *   onAction?: (turn:number, type:string, payload:object)=>void,
 * }} [opts]
 */
export function createRuntimeFacade(world, opts = {}) {
  const getActorId = typeof opts.getActorId === "function"
    ? opts.getActorId
    : (() => (playerEntity(world)?.id || 0));
  const dispatch = makeRulesDispatcher(world, getActorId, {
    onAction: typeof opts.onAction === "function" ? opts.onAction : undefined,
  });

  function getDepth() {
    for (const [, ds] of world.query(DungeonState)) {
      return Number(ds.currentDepth || 0) | 0;
    }
    return 0;
  }

  function snapshot() {
    const player = playerEntity(world);
    const vit = player ? world.get(player.id, Vitality) : null;
    const maxHpEffective = (player && vit) ? Number(effectiveMaxHp(world, player.id, vit) || 0) : 0;
    return {
      step: world.step | 0,
      seed: world.seed >>> 0,
      depth: getDepth(),
      entitiesAlive: world.alive.size,
      player: player
        ? {
            id: player.id,
            pos: player.pos,
            hp: Number(vit?.hp || 0),
            maxHp: maxHpEffective,
          }
        : null,
    };
  }

  return {
    world,
    dispatch,
    tick(turns = 1) {
      const n = Math.max(0, coerceInt(turns, 1));
      if (n > 0) world.tick(n);
    },
    view() {
      return buildWorldView(world);
    },
    observe(opts = {}) {
      return buildAgentObservation(world, opts);
    },
    snapshot,
    getPlayer() {
      return playerEntity(world);
    },
  };
}

/**
 * Create a headless-capable runtime facade around the live world.
 *
 * @param {{
 *   seed?: number,
 *   classId?: string,
  *   playerName?: string,
  *   startDepth?: number,
  *   dungeonType?: string | null,
 *   identifyItems?: boolean,
 *   pendingSavegame?: { identified?: unknown, gemPricing?: unknown } | null,
 *   onAction?: (turn:number, type:string, payload:object)=>void,
 * }} [opts]
 */
export async function createGameRuntime(opts = {}) {
  const seed = Number.isFinite(Number(opts.seed)) ? (Number(opts.seed) >>> 0) : 0xC0FFEE;
  const classId = String(opts.classId || "outlaw");
  const classDef = getClass(classId) || getClass("outlaw");
  const playerName = String(opts.playerName || "Headless Hero");
  const startDepth = Math.max(0, coerceInt(opts.startDepth, 1));

  const world = createConfiguredWorld(seed);
  initializeRunItemState(world, {
    identifyItems: opts.identifyItems !== false,
    pendingSavegame: opts.pendingSavegame || null,
  });

  const spawnPos = await initDungeon(world, {
    startDepth,
    dungeonType: opts.dungeonType ?? null,
    tombstoneRepo: null,
  });

  world.step = PHASE_TURNS.sleep + PHASE_TURNS.breakfast;

  const pe = ensurePlayerSpawned(world, {
    x: spawnPos.x,
    y: spawnPos.y,
    classDef,
    playerName,
  });
  applyPlayerClassLoadout(world, pe.id, classDef);

  // Initial resolve pass for derived systems before first external step.
  world.tick(1);
  return createRuntimeFacade(world, {
    getActorId: () => (playerEntity(world)?.id || 0),
    onAction: typeof opts.onAction === "function" ? opts.onAction : undefined,
  });
}
