import { defineComponent } from "../../lib/ecs-js/index.js";

/**
 * Singleton component on the dungeon manager entity.
 * Tracks current floor depth and entity ownership for bulk cleanup.
 */
export const DungeonState = defineComponent('DungeonState', {
  worldSeed: 0,
  currentDepth: 1,
  profileType: 'default', // floor profile id: 'overworld','default','catacombs','caves','grottos','arenas'
  activeTemplateId: '',
  activeRegionKey: '',
  activePlaneId: '',
  activePlaneSeed: 0,
  regionAnchorX: 0,
  regionAnchorY: 0,
  floorEntityIds: [],    // all entity IDs created for this floor
  downStairPositions: [], // world {x,y} of each down-stair on the current floor
  destroyedTiles: {}, // "x,y" -> { x, y, originalTile, currentTile, destroyedAtTurn, burnedKind, cause, sourceId, sourceKind, roofTurnsLeft }
  destroyedTilesByRegion: {},
  floodedTiles: {},
  floodedTilesByRegion: {},
  wetTiles: {},       // "x,y" -> { expiresAtStep } — temporary wet floor state for elemental chaining
  wetTilesByRegion: {},
});
