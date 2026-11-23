import { TILE_SHALLOW_WATER } from "../environment/dungeon/constants.js";
import { getTile, setTile } from "../environment/dungeon/tileMap.js";
import { getDungeonStateRecord } from "./destroyedTiles.js";

export function floodTile(world, x, y, originalTile) {
  if (!setTile(x, y, TILE_SHALLOW_WATER)) return false;
  const dungeon = getDungeonStateRecord(world);
  if (dungeon) {
    (dungeon.floodedTiles ??= {})[`${x},${y}`] = { x, y, originalTile };
  }
  return true;
}

export function restoreFloodedTerrain(world) {
  const dungeon = getDungeonStateRecord(world);
  for (const { x, y, originalTile } of Object.values(dungeon?.floodedTiles || {})) {
    if (getTile(x, y) === originalTile) setTile(x, y, TILE_SHALLOW_WATER);
  }
}
