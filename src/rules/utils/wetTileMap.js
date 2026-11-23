import { DungeonState } from "../components/DungeonState.js";
import { getTile } from "../environment/dungeon/tileMap.js";
import {
  TILE_CORAL_REEF, TILE_KELP_FOREST, TILE_SEAGRASS,
  TILE_SHALLOW_WATER, TILE_WATER, TILE_WATER_DEEP,
} from "../environment/dungeon/constants.js";

const WET_TILE_TYPES = new Set([
  TILE_WATER, TILE_SHALLOW_WATER, TILE_WATER_DEEP, TILE_KELP_FOREST, TILE_SEAGRASS, TILE_CORAL_REEF,
]);

function getWetMap(world, create = false) {
  for (const [, ds] of world.query(DungeonState)) {
    if (create) ds.wetTiles ??= {};
    return ds.wetTiles;
  }
  return null;
}

export function markWet(world, x, y, turns) {
  const map = getWetMap(world, true);
  if (!map) return;
  const key = `${x | 0},${y | 0}`;
  map[key] = { expiresAtStep: (world.step | 0) + Math.max(1, turns | 0) };
}

export function isWaterAt(x, y) {
  return WET_TILE_TYPES.has(getTile(x | 0, y | 0));
}

export function groundWetnessAt(world, x, y) {
  if (isWaterAt(x, y)) return 1;
  const map = getWetMap(world);
  if (!map) return 0;
  const key = `${x | 0},${y | 0}`;
  const rec = map[key];
  return rec && (world.step | 0) <= rec.expiresAtStep ? 0.35 : 0;
}

export function isWetAt(world, x, y) {
  return groundWetnessAt(world, x, y) > 0;
}
