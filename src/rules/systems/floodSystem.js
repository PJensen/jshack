import { FloodState } from "../components/FloodState.js";
import { Position } from "../components/Position.js";
import {
  TILE_DOOR, TILE_ICE, TILE_LAVA, TILE_PIT, TILE_SHALLOW_WATER,
  TILE_STAIR_DOWN, TILE_STAIR_UP,
} from "../environment/dungeon/constants.js";
import { getTile, isWalkable, setTile } from "../environment/dungeon/tileMap.js";

const CARDINALS = Object.freeze([
  Object.freeze({ dx: 0, dy: -1 }),
  Object.freeze({ dx: 1, dy: 0 }),
  Object.freeze({ dx: 0, dy: 1 }),
  Object.freeze({ dx: -1, dy: 0 }),
]);

// These tiles carry terrain mechanics that a water tile would erase.
const PROTECTED_TILES = new Set([
  TILE_DOOR, TILE_ICE, TILE_LAVA, TILE_PIT, TILE_STAIR_DOWN, TILE_STAIR_UP,
]);

export function canStartFloodAt(x, y) {
  return isWalkable(x, y) && !PROTECTED_TILES.has(getTile(x, y));
}

function tileKey(x, y) {
  return `${x | 0},${y | 0}`;
}

/**
 * Expand active floods from their oldest wet tiles, within a per-turn budget.
 * Water remains shallow and walkable, and spreads until its volume runs out.
 */
export function floodSystem(world) {
  for (const [id, state] of world.query(FloodState)) {
    if (world.step < state.nextStep) continue;
    const flooded = new Set(state.floodedTiles.map((tile) => tileKey(tile.x, tile.y)));
    const newlyWet = [];
    let remaining = state.remainingVolume | 0;
    let cursor = 0;

    for (; cursor < state.frontier.length && remaining > 0; cursor++) {
      const tile = state.frontier[cursor];
      for (const dir of CARDINALS) {
        const x = (tile.x | 0) + dir.dx;
        const y = (tile.y | 0) + dir.dy;
        const key = tileKey(x, y);
        if (flooded.has(key) || !canStartFloodAt(x, y) || getTile(x, y) === TILE_SHALLOW_WATER) continue;
        if (!setTile(x, y, TILE_SHALLOW_WATER)) continue;
        flooded.add(key);
        newlyWet.push({ x, y });
        remaining--;
        if (remaining <= 0 || newlyWet.length >= state.spreadPerTurn) break;
      }
      // Keep this tile queued so its remaining neighbors get another turn.
      if (newlyWet.length >= state.spreadPerTurn) break;
    }

    const nextFrontier = state.frontier.slice(cursor).concat(newlyWet);
    if (remaining <= 0 || nextFrontier.length === 0) {
      world.remove(id, FloodState);
      continue;
    }

    world.set(id, FloodState, {
      ...state,
      remainingVolume: remaining,
      nextStep: world.step + 1,
      frontier: nextFrontier,
      floodedTiles: Array.from(flooded, (key) => {
        const [x, y] = key.split(",").map(Number);
        return { x, y };
      }),
    });
  }
}

export function startFlood(world, sourceId, params = {}) {
  const pos = world.get(sourceId, Position);
  if (!pos || world.has(sourceId, FloodState)) return 0;
  const volume = Math.max(1, Number(params.volume ?? 18) | 0);
  const spreadPerTurn = Math.max(1, Number(params.spreadPerTurn ?? 3) | 0);
  const x = pos.x | 0;
  const y = pos.y | 0;
  if (!canStartFloodAt(x, y)) return 0;
  const floodedTiles = [];
  if (getTile(x, y) !== TILE_SHALLOW_WATER && setTile(x, y, TILE_SHALLOW_WATER)) {
    floodedTiles.push({ x, y });
  }
  world.add(sourceId, FloodState, {
    remainingVolume: Math.max(0, volume - floodedTiles.length),
    spreadPerTurn,
    nextStep: world.step + 1,
    frontier: [{ x, y }],
    floodedTiles,
  });
  return floodedTiles.length;
}
