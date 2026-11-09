// All fishing channel logic lives here.
// defineItem declares the rod; this file registers its channel action + installs the event listener.

import { defineUseAction } from "./useActionRegistry.js";
import { Channeling } from "../../components/Channeling.js";
import { Equipment, getEquippedSlot } from "../../components/Equipment.js";
import { HarvestNode } from "../../components/HarvestNode.js";
import { Position } from "../../components/Position.js";
import { WeatherState } from "../../components/WeatherState.js";
import { addToInventory } from "../../utils/inventoryFacade.js";
import { resolveLootTable, materializeDrop } from "../../data/lootResolver.js";
import { LOOT_TABLES } from "../../data/lootTables.js";
import { createRng } from "../../../lib/ecs-js/rng.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { getTile } from "../../environment/dungeon/tileMap.js";
import {
  TILE_CORAL_REEF,
  TILE_BOG,
  TILE_KELP_FOREST,
  TILE_MANGROVE,
  TILE_MARSH,
  TILE_SALT_MARSH,
  TILE_SEAGRASS,
  TILE_SHALLOW_WATER,
  TILE_SWAMP,
  TILE_WATER,
  TILE_WATER_DEEP,
} from "../../environment/dungeon/constants.js";

const FISHING_CAST_REQUEST_INSTALLED = Symbol.for("jshack:fishing:castRequest:installed");
const FISHING_PRESSURE_KEY = Symbol.for("jshack:fishing:tilePressure");
const FISHING_SPOT_REGROW_TURNS = 180;
const FISHING_PRESSURE_DECAY_TURNS = 80;
const FISHING_SPOT_OVERFISHED_PRESSURE = 4;

function isFishableTile(tile) {
  return tile === TILE_WATER
    || tile === TILE_WATER_DEEP
    || tile === TILE_SHALLOW_WATER
    || tile === TILE_KELP_FOREST
    || tile === TILE_SEAGRASS
    || tile === TILE_CORAL_REEF
    || tile === TILE_MARSH
    || tile === TILE_SWAMP
    || tile === TILE_BOG
    || tile === TILE_SALT_MARSH
    || tile === TILE_MANGROVE;
}

function findFishingWater(world, actor, intent) {
  const rawX = Number(intent?.x);
  const rawY = Number(intent?.y);
  if (Number.isFinite(rawX) && Number.isFinite(rawY) && isFishableTile(getTile(rawX | 0, rawY | 0))) {
    return { x: rawX | 0, y: rawY | 0 };
  }

  const pos = world.get(actor, Position);
  if (!pos) return null;
  let best = null;
  let bestDist = Infinity;
  for (let y = (pos.y | 0) - 3; y <= (pos.y | 0) + 3; y++) {
    for (let x = (pos.x | 0) - 3; x <= (pos.x | 0) + 3; x++) {
      const dist = Math.max(Math.abs(x - (pos.x | 0)), Math.abs(y - (pos.y | 0)));
      if (dist <= 0 || dist > 3 || dist >= bestDist) continue;
      if (!isFishableTile(getTile(x, y))) continue;
      best = { x, y };
      bestDist = dist;
    }
  }
  return best;
}

function findReadyFishingSpotAt(world, x, y) {
  const tx = Number(x) | 0;
  const ty = Number(y) | 0;
  for (const [id, pos, node] of world.query(Position, HarvestNode)) {
    if ((pos.x | 0) !== tx || (pos.y | 0) !== ty) continue;
    if (String(node?.kind || "") !== "fishing_spot") continue;
    if (node.ready !== true) continue;
    return id | 0;
  }
  return 0;
}

function fishingTileProfile(tile) {
  switch (tile) {
    case TILE_WATER_DEEP:
      return "deep";
    case TILE_SHALLOW_WATER:
    case TILE_SEAGRASS:
    case TILE_CORAL_REEF:
      return "shallow";
    case TILE_KELP_FOREST:
      return "kelp";
    case TILE_MARSH:
    case TILE_SWAMP:
    case TILE_BOG:
    case TILE_SALT_MARSH:
    case TILE_MANGROVE:
      return "marsh";
    default:
      return "normal";
  }
}

function isFishingRain(world) {
  for (const [, ws] of world.query(WeatherState)) {
    const current = String(ws?.current || "");
    return current === "rain" || current === "heavy_rain";
  }
  return false;
}

function fishingPressureMap(world) {
  if (!world[FISHING_PRESSURE_KEY]) world[FISHING_PRESSURE_KEY] = new Map();
  return world[FISHING_PRESSURE_KEY];
}

function readFishingPressure(world, x, y) {
  const key = `${Number(x) | 0},${Number(y) | 0}`;
  const rec = fishingPressureMap(world).get(key);
  if (!rec) return 0;
  const elapsed = Math.max(0, (Number(world.step || 0) | 0) - (Number(rec.lastStep || 0) | 0));
  const decayed = Math.max(0, (Number(rec.pressure || 0) | 0) - Math.floor(elapsed / FISHING_PRESSURE_DECAY_TURNS));
  if (decayed <= 0) {
    fishingPressureMap(world).delete(key);
    return 0;
  }
  rec.pressure = decayed;
  return decayed;
}

function addFishingPressure(world, x, y) {
  const key = `${Number(x) | 0},${Number(y) | 0}`;
  const pressure = Math.min(8, readFishingPressure(world, x, y) + 1);
  fishingPressureMap(world).set(key, {
    pressure,
    lastStep: Number(world.step || 0) | 0,
  });
  return pressure;
}

function adjustedFishingEntry(entry, ctx) {
  const next = { ...(entry || {}) };
  next.weight = Number(next.weight || 0);
  if (next.type === "item") {
    const itemId = String(next.itemId || "");
    if (ctx.raining && itemId === "food_raw_fish") next.weight += 8;
    if (ctx.raining && (itemId === "food_golden_carp" || itemId === "food_moonfin")) next.weight += 5;
    if (ctx.tileProfile === "deep" && itemId === "food_moonfin") next.weight += 8;
    if (ctx.tileProfile === "deep" && itemId === "food_golden_carp") next.weight += 3;
    if (ctx.tileProfile === "shallow" && itemId === "food_golden_carp") next.weight += 5;
    if (ctx.tileProfile === "kelp" && itemId === "fishing_kelp") next.weight += 18;
    if (ctx.tileProfile === "marsh" && itemId === "fishing_kelp") next.weight += 10;
    if (ctx.tileProfile === "marsh" && itemId === "junk_soggy_boot") next.weight += 7;
  }
  if (next.type === "table" && ctx.tileProfile === "deep") next.weight += 1;
  if (next.type === "nothing") {
    if (ctx.raining) next.weight = Math.max(1, next.weight - 3);
    next.weight += Math.max(0, ctx.pressure || 0) * 8;
  }
  return next;
}

function fishingEntryToDrop(entry, rng) {
  switch (String(entry?.type || "")) {
    case "nothing":
      return null;
    case "archetype":
      return { kind: "archetype", params: { archetype: entry.archetype } };
    case "item":
      return { kind: "item", params: { itemId: entry.itemId } };
    case "equip": {
      const pool = Array.isArray(entry.pool) ? entry.pool : [];
      const equipId = rng.choice(pool);
      return equipId ? { kind: "equip", params: { equipId, affixes: [] } } : null;
    }
    case "table": {
      const nested = resolveLootTable(String(entry.tableId || ""), rng, 0);
      return nested[0] || null;
    }
    default:
      return null;
  }
}

function resolveFishingDrops(tableId, rng, ctx) {
  const table = LOOT_TABLES[tableId];
  const entries = Array.isArray(table?.entries) ? table.entries.map((entry) => adjustedFishingEntry(entry, ctx)) : [];
  const total = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight || 0)), 0);
  if (total <= 0) return [];
  let roll = rng.float(0, total);
  for (let i = 0; i < entries.length; i++) {
    roll -= Math.max(0, Number(entries[i].weight || 0));
    if (roll > 0) continue;
    const drop = fishingEntryToDrop(entries[i], rng);
    return drop ? [drop] : [];
  }
  return [];
}

function requestFishingCast(world, actor, itemId, opts = {}) {
  const turns = Math.max(1, Number(opts?.turns || 12) | 0);
  const eq = world.get(actor, Equipment);
  if (!getEquippedSlot(eq, itemId)) {
    world.emit("item:use-cancelled", {
      actor,
      itemId,
      code: "FISHING_ROD_NOT_EQUIPPED",
      message: "Equip the fishing rod before casting.",
      consumesTurn: false,
    });
    return false;
  }
  if (world.has(actor, Channeling)) {
    world.emit("item:use-cancelled", {
      actor,
      itemId,
      code: "FISHING_ALREADY_CHANNELING",
      message: "You are already channeling.",
      consumesTurn: false,
    });
    return false;
  }

  const water = findFishingWater(world, actor, opts?.intent || opts);
  if (!water) {
    world.emit("item:use-cancelled", {
      actor,
      itemId,
      code: "FISHING_NO_WATER",
      message: "There is no fishable water in casting range.",
      consumesTurn: false,
    });
    return false;
  }

  const pos = world.get(actor, Position);
  const spotId = findReadyFishingSpotAt(world, water.x, water.y);
  try {
    world.add(actor, Channeling, {
      mode: "cast",
      turnsRemaining: turns,
      turnsTotal: turns,
      spellId: "fishing",
      channelId: "fishing",
      itemActionId: "fishing_rod",
      targetId: spotId || itemId,
      x: water.x,
      y: water.y,
      breakOnMove: true,
      anchorX: pos ? (pos.x | 0) : null,
      anchorY: pos ? (pos.y | 0) : null,
    });
  } catch {}
  world.emit("channeling:start", { actor, spellId: "fishing", channelId: "fishing", channelLabel: "Fishing", castTime: turns, mode: "fish", itemId, x: water.x, y: water.y });
  world.emit("fishing:cast", { actor, itemId, x: water.x, y: water.y, turns, spotId });
  return true;
}

function resolveFishingChannel(world, actor, ch) {
  const pos = world.get(actor, Position);
  const targetId = Number(ch?.targetId || 0) | 0;
  const node = targetId > 0 ? world.get(targetId, HarvestNode) : null;
  const useSpot = !!node && String(node.kind || "") === "fishing_spot" && node.ready === true;
  const tableId = useSpot ? "fishing:spot" : "fishing:normal_water";
  const tile = getTile(Number(ch.x || 0) | 0, Number(ch.y || 0) | 0);
  const tileProfile = fishingTileProfile(tile);
  const raining = isFishingRain(world);
  const pressureBefore = Math.max(
    readFishingPressure(world, ch.x, ch.y),
    useSpot ? (Number(node.fishingPressure || 0) | 0) : 0,
  );
  const seed = ((Number(world.seed || 0) >>> 0) ^ Math.imul(Number(world.step || 0) | 0, 0x9e3779b1) ^ Math.imul(actor | 0, 0x85ebca6b)) >>> 0;
  const rng = createRng(seed);
  const drops = resolveFishingDrops(tableId, rng, { tileProfile, raining, pressure: pressureBefore });
  let caught = 0;
  let itemId = "";
  if (drops.length > 0 && pos) {
    caught = materializeDrop(world, drops[0], { x: pos.x | 0, y: pos.y | 0 }) || 0;
    if (caught > 0) {
      itemId = String(world.get(caught, NamedIdentity)?.identity || "");
    }
  }
  let stored = false;
  if (caught > 0) {
    stored = addToInventory(world, actor, caught);
    if (!stored && pos) {
      try { world.add(caught, Position, { x: pos.x | 0, y: pos.y | 0 }); } catch {}
    }
  }
  if (useSpot) {
    world.mutate(targetId, HarvestNode, (n) => {
      n.ready = false;
      n.regrowTurns = Math.max(1, Number(n.regrowTurns || FISHING_SPOT_REGROW_TURNS) | 0);
      n.regrowCountdown = n.regrowTurns;
      n.fishingPressure = Math.min(8, Math.max(Number(n.fishingPressure || 0) | 0, pressureBefore) + 1);
      n.overfished = n.fishingPressure >= FISHING_SPOT_OVERFISHED_PRESSURE;
    });
    world.emit("fishing:spot:exhausted", {
      actor,
      targetId,
      x: ch.x,
      y: ch.y,
      regrowTurns: Number(node.regrowTurns || FISHING_SPOT_REGROW_TURNS) | 0,
      fishingPressure: Math.min(8, Math.max(Number(node.fishingPressure || 0) | 0, pressureBefore) + 1),
    });
  }
  const pressureAfter = addFishingPressure(world, ch.x, ch.y);
  world.emit("fishing:caught", {
    actor,
    itemId,
    caughtId: caught || 0,
    stored,
    x: ch.x,
    y: ch.y,
    spotId: useSpot ? targetId : 0,
    tableId,
    tile,
    tileProfile,
    raining,
    pressureBefore,
    pressureAfter,
  });
}

// Targeting config consumed by main.js to open the tile targeter.
export const FISHING_TARGETING = {
  name: 'Fishing',
  fallbackRange: 6,
  requiresLOS: true,
  requiresVisible: false,
  validateTarget(x, y) {
    return isFishableTile(getTile(x | 0, y | 0)) ? null : 'Fishing must target a water tile.';
  },
  describePrompt(range) {
    return `Choose water for Fishing (range ${range}). Tap a water tile or use arrow keys + Enter. Esc to cancel.`;
  },
  onConfirm(world, actorId, itemId, x, y) {
    world.emit('fishing:cast:request', { actor: actorId, itemId, turns: 12, x, y });
  },
};

export function installFishingAction(world) {
  if (world[FISHING_CAST_REQUEST_INSTALLED]) return;
  world[FISHING_CAST_REQUEST_INSTALLED] = true;

  world.on("fishing:cast:request", ({ actor, itemId, turns, x, y }) => {
    requestFishingCast(world, Number(actor || 0) | 0, Number(itemId || 0) | 0, { turns, x, y });
  });

  defineUseAction('fishing_rod', {
    channelTurns: 12,
    targeting: FISHING_TARGETING,
    onComplete(world, actorId, ch) {
      resolveFishingChannel(world, actorId, ch);
    },
  });
}
