// Stable, JSON-safe observation surface for an external game-playing agent.

import { buildWorldView } from "../../bridge/schema/worldView.js";
import { ActiveEffects } from "../../rules/components/ActiveEffects.js";
import { BaseStats } from "../../rules/components/BaseStats.js";
import { Brain } from "../../rules/components/Brain.js";
import { CombatPosture } from "../../rules/components/CombatPosture.js";
import { DoorState } from "../../rules/components/DoorState.js";
import { Equipment, GEAR_SLOTS } from "../../rules/components/Equipment.js";
import { Faction } from "../../rules/components/Faction.js";
import { Hunger } from "../../rules/components/Hunger.js";
import { Interactable } from "../../rules/components/Interactable.js";
import { Inventory } from "../../rules/components/Inventory.js";
import { ItemInfo } from "../../rules/components/ItemInfo.js";
import { Mana } from "../../rules/components/Mana.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { Position } from "../../rules/components/Position.js";
import { Settings } from "../../rules/components/Settings.js";
import { Stamina } from "../../rules/components/Stamina.js";
import { Vitality } from "../../rules/components/Vitality.js";
import { effectiveMaxHp } from "../../rules/utils/passiveBonuses.js";
import { inventoryItems } from "../../rules/utils/inventoryFacade.js";
import { getSpell } from "../../rules/data/spells.js";
import { playerEntity } from "../../rules/utils/queries.js";
import {
  TILE_VOID,
  TILE_FLOOR,
  TILE_WALL,
  TILE_DOOR,
  TILE_STAIR_DOWN,
  TILE_STAIR_UP,
  TILE_GRASS,
  TILE_WATER,
  TILE_MOUNTAIN,
  TILE_TREE,
} from "../../rules/environment/dungeon/constants.js";

export const AGENT_ACTION_CATALOG = Object.freeze([
  { type: "rules.move", payload: { dx: -1, dy: 0 }, note: "Move one tile; use any dx/dy in -1..1." },
  { type: "rules.attackDirection", payload: { dx: 1, dy: 0 }, note: "Attack or bump in a direction." },
  { type: "rules.wait", payload: {}, note: "Spend one turn waiting." },
  { type: "rules.search", payload: {}, note: "Search for hidden features." },
  { type: "rules.pickupItem", payload: { itemId: 0 }, note: "Pick up an item by entity id." },
  { type: "rules.drinkPotion", payload: { itemId: 0 }, note: "Drink an inventory potion." },
  { type: "rules.equipItem", payload: { itemId: 0, targetSlot: "" }, note: "Equip an inventory item." },
  { type: "rules.castActiveSpell", payload: { spellId: "", targetId: 0, x: null, y: null }, note: "Cast a learned spell." },
  { type: "rules.useItem", payload: { itemId: 0, targetId: 0, x: null, y: null }, note: "Use an inventory item." },
  { type: "rules.throwItem", payload: { itemId: 0, targetId: 0, x: null, y: null }, note: "Throw an inventory item." },
  { type: "rules.applyItem", payload: { itemId: 0, targetItemId: 0 }, note: "Apply one inventory item to another." },
  { type: "rules.shootRanged", payload: {}, note: "Shoot the nearest visible target with the equipped ranged item." },
  { type: "rules.rangedAttack", payload: { targetId: 0 }, note: "Shoot a specific target." },
  { type: "rules.traverseStairs", payload: {}, note: "Use stairs or a return portal underfoot." },
  { type: "rules.interact", payload: { targetId: 0 }, note: "Interact with a visible object." },
  { type: "rules.actionSelect", payload: { targetId: 0, mode: "" }, note: "Choose a mode for an interaction." },
  { type: "rules.quickInteract", payload: {}, note: "Toggle an adjacent door." },
  { type: "rules.openPickupChooser", payload: {}, note: "Pick up the best nearby ground item." },
  { type: "rules.disarmTrap", payload: { trapId: 0 }, note: "Disarm a revealed trap." },
  { type: "rules.worldTap", payload: { x: 0, y: 0 }, note: "Use the contextual interaction at a map coordinate." },
  { type: "rules.brewAlchemy", payload: { benchId: 0, recipe: "" }, note: "Brew a recipe at an alchemy bench." },
  { type: "rules.craftEnchant", payload: { benchId: 0, recipe: "" }, note: "Enchant an item at a bench." },
  { type: "rules.cookFood", payload: { fireId: 0, recipe: "" }, note: "Cook at a fire." },
  { type: "rules.forgeAtAnvil", payload: { anvilId: 0, recipe: "" }, note: "Forge a recipe at an anvil." },
  { type: "rules.altarOffer", payload: { altarId: 0, itemId: 0 }, note: "Offer an item at an altar." },
  { type: "rules.fountainDip", payload: { fountainId: 0, itemId: 0 }, note: "Dip an item in a fountain." },
  { type: "rules.lockpickDoorResult", payload: { targetId: 0, success: false }, note: "Resolve a lockpick prompt." },
  { type: "rules.dropItem", payload: { itemId: 0, count: null }, note: "Drop an inventory item." },
  { type: "rules.cyclePosture", payload: {}, note: "Cycle balanced/aggressive/guarded posture." },
  { type: "rules.pray", payload: {}, note: "Pray to the current deity." },
]);

export const AGENT_TILE_LEGEND = Object.freeze({
  [TILE_VOID]: "void",
  [TILE_FLOOR]: "floor",
  [TILE_WALL]: "wall",
  [TILE_DOOR]: "door",
  [TILE_STAIR_DOWN]: "stair_down",
  [TILE_STAIR_UP]: "stair_up",
  [TILE_GRASS]: "grass",
  [TILE_WATER]: "water",
  [TILE_MOUNTAIN]: "mountain",
  [TILE_TREE]: "tree",
});

const ACTION_DIRECTIONS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],             [1, 0],
  [-1, 1],  [0, 1],    [1, 1],
]);

function int(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? (n | 0) : fallback;
}

function itemObservation(world, id) {
  const info = world.get(id, ItemInfo);
  if (!info) return null;
  const identity = world.get(id, NamedIdentity);
  return {
    id: int(id),
    identity: String(identity?.identity || ""),
    name: String(identity?.name || identity?.identity || "item"),
    type: String(info.type || ""),
    slot: String(info.slot || ""),
    count: Math.max(1, int(info.count, 1)),
    weight: Number(info.weight || 0),
    value: Number(info.value || 0),
    rarity: int(info.rarity, 1),
    rarityName: String(info.rarityName || "common"),
    description: String(info.description || ""),
    tags: Array.isArray(info.tags) ? info.tags.map(String) : [],
  };
}

function spellObservation(id) {
  const spell = getSpell(id);
  if (!spell) return { id: String(id) };
  return {
    id: String(spell.id || id),
    name: String(spell.name || id),
    manaCost: Number(spell.manaCost || 0),
    staminaCost: Number(spell.staminaCost || 0),
    lifeCost: Number(spell.lifeCost || 0),
    range: int(spell.range, 0),
    targeting: String(spell.targeting || "auto"),
    radius: int(spell.radius, 0),
    cooldown: int(spell.cooldown, 0),
    description: String(spell.description || ""),
  };
}

function entityObservation(world, rec) {
  const tags = Array.isArray(rec.tags) ? rec.tags.map(String) : [];
  const hiddenDetail = tags.some((tag) => (
    tag === "memory_recent" || tag === "memory_fixed" ||
    tag === "memory_tampered" || tag === "esp_sensed" || tag === "thermal_sensed"
  ));
  const out = {
    id: int(rec.id),
    kind: String(rec.kind || "default"),
    pos: { x: int(rec.pos?.x), y: int(rec.pos?.y) },
    tags,
    hp: Number(rec.hp || 0),
    maxHp: Number(rec.maxHp || 0),
    layer: int(rec.layer, 0),
    isPet: rec.isPet === true,
  };
  if (hiddenDetail || !world.isAlive(rec.id)) return out;

  const identity = world.get(rec.id, NamedIdentity);
  const faction = world.get(rec.id, Faction);
  const interactable = world.get(rec.id, Interactable);
  const item = itemObservation(world, rec.id);
  const door = world.get(rec.id, DoorState);
  out.name = String(identity?.name || identity?.identity || out.kind);
  out.identity = String(identity?.identity || "");
  if (faction?.key) out.faction = String(faction.key);
  if (item) out.item = item;
  if (interactable) {
    out.interactable = {
      action: String(interactable.action || ""),
      params: interactable.params && typeof interactable.params === "object"
        ? structuredClone(interactable.params)
        : null,
    };
  }
  if (door) out.door = { open: door.open === true };
  if (rec.facing) out.facing = { dx: int(rec.facing.dx), dy: int(rec.facing.dy) };
  return out;
}

function playerObservation(world, id) {
  const pos = world.get(id, Position) || { x: 0, y: 0 };
  const vitality = world.get(id, Vitality);
  const mana = world.get(id, Mana);
  const stamina = world.get(id, Stamina);
  const hunger = world.get(id, Hunger);
  const inventory = world.get(id, Inventory);
  const equipment = world.get(id, Equipment) || {};
  const brain = world.get(id, Brain);
  const baseStats = world.get(id, BaseStats);
  const settings = world.get(id, Settings);
  const posture = world.get(id, CombatPosture);
  const effects = world.get(id, ActiveEffects);
  const inventoryIds = inventoryItems(world, id);
  const inventoryById = new Map(inventoryIds.map((itemId) => [itemId, itemObservation(world, itemId)]));
  const equipped = {};
  for (const slot of GEAR_SLOTS) {
    const itemId = int(equipment[slot]);
    equipped[slot] = itemId > 0 ? (inventoryById.get(itemId) || itemObservation(world, itemId)) : null;
  }

  const derived = {};
  for (const key of [
    "accuracyDerived", "damagePowerDerived", "evadeDerived", "mitigationDerived",
    "maxHpDerived", "critChanceDerived", "spellHitDerived", "visionRangeDerived",
  ]) {
    if (equipment[key] != null) derived[key] = Number(equipment[key] || 0);
  }

  return {
    id,
    name: String(world.get(id, NamedIdentity)?.name || "Hero"),
    pos: { x: int(pos.x), y: int(pos.y) },
    hp: Number(vitality?.hp || 0),
    maxHp: Number(vitality ? effectiveMaxHp(world, id, vitality) : 0),
    mana: mana ? { current: Number(mana.mana || 0), max: Number(mana.maxMana || 0) } : null,
    stamina: stamina ? { current: Number(stamina.stamina || 0), max: Number(stamina.maxStamina || 0) } : null,
    hunger: hunger ? { hunger: Number(hunger.hunger || 0), satiation: Number(hunger.satiation || 0) } : null,
    faction: String(world.get(id, Faction)?.key || "player"),
    posture: String(posture?.stance || "balanced"),
    stats: baseStats ? {
      strength: Number(baseStats.strength || 0),
      intelligence: Number(baseStats.intelligence || 0),
      dexterity: Number(baseStats.dexterity || 0),
      vitality: Number(baseStats.vitality || 0),
      perception: Number(baseStats.perception || 0),
      derived,
    } : { derived },
    effects: Array.isArray(effects?.effects) ? effects.effects.map((effect) => ({
      key: String(effect.key || ""),
      turnsLeft: int(effect.turnsLeft),
      potency: Number(effect.potency || 0),
      stacks: int(effect.stacks, 1),
    })) : [],
    inventory: inventoryIds.map((itemId) => inventoryById.get(itemId)).filter(Boolean),
    capacity: inventory ? int(inventory.capacity, 0) : 0,
    equipment: equipped,
    spells: Array.isArray(brain?.learnedSpellIds) ? brain.learnedSpellIds.map(spellObservation) : [],
    settings: settings ? {
      autoPickup: settings.autoPickup === true,
      pickupRange: Number(settings.pickupRange || 0),
    } : null,
  };
}

function suggestions(world, view, player) {
  const out = ACTION_DIRECTIONS.map(([dx, dy]) => ({
    type: "rules.move",
    payload: { dx, dy },
  }));
  out.push({ type: "rules.wait", payload: {} });
  out.push({ type: "rules.search", payload: {} });
  out.push({ type: "rules.cyclePosture", payload: {} });

  const px = player.pos.x;
  const py = player.pos.y;
  for (const rec of view.entities || []) {
    const entity = entityObservation(world, rec);
    const ex = int(entity.pos?.x);
    const ey = int(entity.pos?.y);
    const distance = Math.max(Math.abs(ex - px), Math.abs(ey - py));
    if (entity.item && distance <= 1) {
      out.push({ type: "rules.pickupItem", payload: { itemId: int(entity.id) } });
    }
    if (entity.faction === "enemy" && distance <= 1 && distance > 0) {
      out.push({ type: "rules.attackDirection", payload: { dx: Math.sign(ex - px), dy: Math.sign(ey - py) } });
    }
    if (entity.identity === "stair_down" || entity.identity === "stair_up" || entity.identity === "return_portal") {
      if (distance === 0) out.push({ type: "rules.traverseStairs", payload: {} });
    } else if (entity.interactable && distance <= 1) {
      out.push({ type: "rules.interact", payload: { targetId: int(entity.id) } });
    }
  }
  for (const item of player.inventory) {
    if (item.type === "potion") {
      out.push({ type: "rules.drinkPotion", payload: { itemId: item.id } });
    }
    if ((item.type === "equip" || item.type === "ammo") && GEAR_SLOTS.includes(item.slot)) {
      out.push({ type: "rules.equipItem", payload: { itemId: item.id, targetSlot: item.slot } });
    }
  }
  for (const spell of player.spells) {
    if (spell.targeting === "self" || spell.targeting === "auto") {
      out.push({ type: "rules.castActiveSpell", payload: { spellId: spell.id } });
    }
  }
  return out;
}

/**
 * Build the complete bounded observation sent to an external game-playing agent.
 * Hidden tiles and entities remain hidden; only explored tiles are included.
 */
export function buildAgentObservation(world, opts = {}) {
  const view = buildWorldView(world);
  const playerRef = playerEntity(world);
  const playerId = int(playerRef?.id);
  const player = playerId > 0 ? playerObservation(world, playerId) : null;
  const radius = Math.max(1, int(opts.mapRadius, Math.max(8, int(view.playerVisionRadius, 8) + 2)));
  const origin = player?.pos || { x: 0, y: 0 };
  const x0 = origin.x - radius;
  const y0 = origin.y - radius;
  const width = radius * 2 + 1;
  const tiles = [];
  const visible = [];
  const explored = [];
  for (let y = y0; y <= origin.y + radius; y++) {
    const tileRow = [];
    const visibleRow = [];
    const exploredRow = [];
    for (let x = x0; x <= origin.x + radius; x++) {
      const isVisible = view.isVisible ? view.isVisible(x, y) === true : false;
      const isExplored = view.isExplored ? view.isExplored(x, y) === true : false;
      tileRow.push(isVisible || isExplored ? view.tileGrid?.getTile(x, y) ?? null : null);
      visibleRow.push(isVisible);
      exploredRow.push(isExplored);
    }
    tiles.push(tileRow);
    visible.push(visibleRow);
    explored.push(exploredRow);
  }

  const entityList = (view.entities || []).map((rec) => entityObservation(world, rec));
  const observation = {
    protocol: "jshack-agent-v1",
    turn: int(world.step),
    seed: world.seed >>> 0,
    depth: int(view.currentDepth),
    player,
    map: { x0, y0, width, height: width, tiles, visible, explored, tileLegend: AGENT_TILE_LEGEND },
    entities: entityList,
    suggestedActions: player ? suggestions(world, view, player) : [],
  };
  if (opts.includeActionCatalog !== false) observation.actionCatalog = AGENT_ACTION_CATALOG;
  return observation;
}
