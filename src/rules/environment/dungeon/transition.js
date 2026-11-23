// rules/environment/dungeon/transition.js
// Handles level transitions (ascending/descending stairs).

import { DungeonState } from '../../components/DungeonState.js';
import { RiftState } from '../../components/RiftState.js';
import { DungeonEntrance } from '../../components/DungeonEntrance.js';
import { Position } from '../../components/Position.js';
import { Player } from '../../components/Player.js';
import { QuestDefRef } from '../../components/QuestDefRef.js';
import { Pet } from '../../components/Pet.js';
import { PetState } from '../../components/PetState.js';
import { MonsterSpawner } from '../../components/MonsterSpawner.js';
import { NamedIdentity } from '../../components/NamedIdentity.js';
import { RoomMetadata } from '../../components/RoomMetadata.js';
import { Unpaid } from '../../components/Unpaid.js';
import { Flying } from '../../components/Flying.js';
import { Faction } from '../../components/Faction.js';
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_HUNTING_GRACE } from '../../components/AggroState.js';
import { Vitality } from '../../components/Vitality.js';
import { Collider } from '../../components/Collider.js';
import { clearAll as clearTileMap, setTile } from './tileMap.js';
import { restoreFloodedTerrain } from '../../utils/floodTerrain.js';
import { isWalkable } from './tileMap.js';
import { clearExplored, saveExplored, restoreExplored } from './exploredMap.js';
import { exploredFloorRepository } from './floorMemory.js';
import { generateFloor } from './index.js';
import { clearOverworldChunkCache } from './overworld.js';
import { clearSpatialIndex } from '../../utils/spatialIndex.js';
import { invalidateTileQueryCache } from '../../utils/tileQueryCache.js';
import { normalizeInventorySnapshot } from '../../utils/inventorySnapshotMigration.js';
import { applySnapshot, serializeEntities } from '../../../lib/ecs-js/serialization.js';
import { destroySubtree, Parent, Sibling, children } from '../../../lib/ecs-js/hierarchy.js';
import { floorRegionKey } from './underworldRegions.js';

/** @type {Map<string, { snapshot: any, order: number[] }>} floor entity snapshots keyed by sparse region key */
const _floorEntityCache = new Map();

/** Max floor entity snapshots held in the JS heap; older entries are evicted to localStorage. */
const MAX_MEMORY_FLOORS = 5;
const PURSUIT_RADIUS = 4;
const MAX_PURSUERS = 8;

function _planeKey(depth, planeId = "") {
  const id = String(planeId || "");
  if (id) return `${id}:z${Math.max(0, Number(depth || 0) | 0)}`;
  return _depthPlaneKey(depth);
}

function _planeRegionKey(depth, planeId = "") {
  const key = _planeKey(depth, planeId);
  return String(planeId || "") ? `${key}:region` : "";
}

function _stateRegionKey(ds, fallbackDepth = 0) {
  if (ds?.activePlaneId) return _planeRegionKey(Number(ds?.currentDepth ?? fallbackDepth) | 0, ds.activePlaneId);
  if (ds?.activeRegionKey) return String(ds.activeRegionKey);
  return floorRegionKey(
    Number(ds?.currentDepth ?? fallbackDepth) | 0,
    Number(ds?.regionAnchorX || 0) | 0,
    Number(ds?.regionAnchorY || 0) | 0,
    String(ds?.activeTemplateId || ""),
  );
}

function _depthPlaneKey(depth) {
  const d = Math.max(0, Number(depth || 0) | 0);
  return d === 0 ? floorRegionKey(0) : `z${d}:plane`;
}

function _collectResidentRegions(world, depth, requestedRegion) {
  if ((depth | 0) <= 0) return [];
  const regions = [];
  const regionKeys = new Set();
  const add = (region) => {
    const templateId = String(region?.templateId || "");
    if (!templateId) return;
    const anchorX = Number(region?.anchorX || 0) | 0;
    const anchorY = Number(region?.anchorY || 0) | 0;
    const key = floorRegionKey(depth, anchorX, anchorY, templateId);
    if (regionKeys.has(key)) return;
    regionKeys.add(key);
    regions.push({ templateId, anchorX, anchorY, regionKey: key });
  };

  add(requestedRegion);
  for (const [, entrance, pos] of world.query(DungeonEntrance, Position)) {
    const targetDepth = Number(entrance?.targetDepth || 1) | 0;
    if (targetDepth !== (depth | 0)) continue;
    add({
      templateId: entrance.templateId,
      anchorX: Number.isFinite(Number(entrance.anchorX)) ? entrance.anchorX : pos.x,
      anchorY: Number.isFinite(Number(entrance.anchorY)) ? entrance.anchorY : pos.y,
    });
  }

  regions.sort((a, b) => {
    const ar = requestedRegion && a.regionKey === floorRegionKey(
      depth,
      Number(requestedRegion.anchorX || 0) | 0,
      Number(requestedRegion.anchorY || 0) | 0,
      String(requestedRegion.templateId || ""),
    ) ? 0 : 1;
    const br = requestedRegion && b.regionKey === floorRegionKey(
      depth,
      Number(requestedRegion.anchorX || 0) | 0,
      Number(requestedRegion.anchorY || 0) | 0,
      String(requestedRegion.templateId || ""),
    ) ? 0 : 1;
    if (ar !== br) return ar - br;
    if (a.anchorY !== b.anchorY) return a.anchorY - b.anchorY;
    if (a.anchorX !== b.anchorX) return a.anchorX - b.anchorX;
    return a.templateId.localeCompare(b.templateId);
  });
  return regions;
}

/** @param {number} worldSeed @param {string} key @returns {string} */
function _floorStorageKey(worldSeed, key) {
  return `jshack:floor:${(worldSeed >>> 0).toString(16)}:${key}`;
}

/** @param {number} worldSeed @param {string} key @param {object} entry */
function _persistFloor(worldSeed, key, entry) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(_floorStorageKey(worldSeed, key), JSON.stringify(entry)); } catch { /* quota exceeded — skip */ }
}

/** @param {number} worldSeed @param {string} key @returns {{ snapshot: any, order: number[] }|null} */
function _loadPersistedFloor(worldSeed, key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(_floorStorageKey(worldSeed, key));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Clear all in-memory and localStorage floor caches (call on new game). */
export function clearFloorCache() {
  _floorEntityCache.clear();
  exploredFloorRepository.clear();
  clearOverworldChunkCache();
  if (typeof localStorage === 'undefined') return;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('jshack:floor:')) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // Deno localStorage may be unavailable in isolated test environments.
    // In-memory floor caches above are still cleared, so runtime correctness is preserved.
  }
}

/** Evict in-memory entries farthest from `currentDepth` until within MAX_MEMORY_FLOORS.
 *  Evicted entries are already persisted to localStorage; just drop the heap reference.
 * @param {number} currentDepth */
function _evictMemoryFloors(currentDepth) {
  while (_floorEntityCache.size > MAX_MEMORY_FLOORS) {
    let furthestKey = null, maxDist = -1;
    for (const key of _floorEntityCache.keys()) {
      const m = /^z(\d+):/.exec(String(key));
      const depth = m ? (Number(m[1]) | 0) : 0;
      const dist = Math.abs(depth - currentDepth);
      if (dist > maxDist) { maxDist = dist; furthestKey = key; }
    }
    if (furthestKey === null) break;
    _floorEntityCache.delete(furthestKey);
  }
}

function _collectStairPursuers(world, currentDepth, newDepth, stairPos) {
  if (!stairPos) return [];
  if (Math.abs((newDepth | 0) - (currentDepth | 0)) !== 1) return [];

  const sx = stairPos.x | 0;
  const sy = stairPos.y | 0;
  const pursuers = [];
  for (const [id, pos, fac, aggro] of world.query(Position, Faction, AggroState)) {
    if (fac?.key !== 'enemy') continue;
    if (aggro.alertLevel !== AGGRO_LEVELS.hunting) continue;
    if (aggro.retreating) continue;
    const vit = world.get(id, Vitality);
    if (vit && (vit.hp | 0) <= 0) continue;
    const dist = Math.max(Math.abs((pos.x | 0) - sx), Math.abs((pos.y | 0) - sy));
    if (dist > PURSUIT_RADIUS) continue;
    pursuers.push({ id, dist });
  }
  pursuers.sort((a, b) => a.dist - b.dist || a.id - b.id);
  return pursuers.slice(0, MAX_PURSUERS).map((p) => p.id);
}

function _tileHasSolid(world, x, y, ignoreIds) {
  for (const [id, pos, col] of world.query(Position, Collider)) {
    if (ignoreIds?.has(id)) continue;
    if (!col?.solid) continue;
    if ((pos.x | 0) === x && (pos.y | 0) === y) return true;
  }
  return false;
}

function _findPursuerLanding(world, origin, used, ignoreIds) {
  const ox = origin.x | 0;
  const oy = origin.y | 0;
  for (let r = 1; r <= 5; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = ox + dx;
        const y = oy + dy;
        const key = `${x},${y}`;
        if (used.has(key)) continue;
        if (!isWalkable(x, y)) continue;
        if (_tileHasSolid(world, x, y, ignoreIds)) continue;
        used.add(key);
        return { x, y };
      }
    }
  }
  return null;
}

function _resolveValidatedDestination(destinationPos, fallbackPos) {
  const ox = destinationPos.x | 0;
  const oy = destinationPos.y | 0;
  if (isWalkable(ox, oy)) return { x: ox, y: oy };

  for (let r = 1; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = ox + dx;
        const y = oy + dy;
        if (isWalkable(x, y)) return { x, y };
      }
    }
  }

  const fx = fallbackPos.x | 0;
  const fy = fallbackPos.y | 0;
  if (isWalkable(fx, fy)) return { x: fx, y: fy };
  return { x: ox, y: oy };
}

function _placeStairPursuers(world, pursuerIds, destinationPos, entityIds) {
  if (!Array.isArray(pursuerIds) || pursuerIds.length <= 0) return [];
  const carried = pursuerIds.filter((id) => world.isAlive(id) && world.has(id, Position));
  if (carried.length <= 0) return [];

  const ignoreIds = new Set(carried);
  for (const [id] of world.query(Player)) ignoreIds.add(id);
  for (const [id] of world.query(Pet)) ignoreIds.add(id);

  const used = new Set([`${destinationPos.x | 0},${destinationPos.y | 0}`]);
  const placed = [];
  for (const id of carried) {
    const landing = _findPursuerLanding(world, destinationPos, used, ignoreIds);
    if (!landing) {
      try { world.destroy(id); } catch {}
      continue;
    }
    world.set(id, Position, landing);
    const aggro = world.get(id, AggroState);
    if (aggro) {
      aggro.alertLevel = AGGRO_LEVELS.hunting;
      aggro.lastKnownX = destinationPos.x | 0;
      aggro.lastKnownY = destinationPos.y | 0;
      aggro.searchTurnsLeft = SEARCH_TURNS_HUNTING_GRACE;
      aggro.retreating = false;
    }
    if (!entityIds.includes(id)) entityIds.push(id);
    placed.push(id);
  }
  return placed;
}

/**
 * Build a runtime component registry from currently known stores.
 * @param {import('../../../lib/ecs-js/index.js').World} world
 * @returns {Map<string, any>}
 */
function _buildSnapshotRegistry(world) {
  const reg = new Map();
  for (const [, comp] of world._components) {
    if (!comp || typeof comp.name !== 'string' || !comp.name) continue;
    reg.set(comp.name, comp);
  }
  return reg;
}

/**
 * Transition the dungeon to a new depth.
 *
 * Steps:
 * 1. Save explored state for the current floor
 * 2. Destroy all floor entities
 * 3. Clear tile data and fog-of-war
 * 4. Generate new floor
 * 5. Restore explored state if the floor was previously visited
 * 6. Move player to destination position
 *
 * @param {import('../../../lib/ecs-js/index.js').World} world
 * @param {number} newDepth
 * @param {{x: number, y: number}} destinationPos - world coords for player placement
 * @param {{direction?: 'up'|'down', stairPos?: {x:number,y:number}|null, tombstoneRepo?: Object, getHighscores?: () => any[]|null, validateDestination?: boolean, onProgress?: (progress: { phase: 'chunks', depth: number, processed: number, total: number, cx?: number, cy?: number }) => void, planeId?: string, planeSeed?: number}} [opts]
 */
export async function transitionToDepth(world, newDepth, destinationPos, opts = {}) {
  // Find dungeon state
  let dungeonId = null;
  let ds = null;
  for (const [id, state] of world.query(DungeonState)) {
    dungeonId = id;
    ds = state;
    break;
  }

  // Compute worldSeed early — needed for floor cache persistence keys.
  const worldSeed = ds ? ds.worldSeed : (world.seed >>> 0);
  const currentPlaneId = String(ds?.activePlaneId || "");
  const targetPlaneId = String(opts.planeId || "");
  const currentPlaneSeed = Number(ds?.activePlaneSeed || 0) >>> 0 || worldSeed;
  const targetPlaneSeed = Number(opts.planeSeed || 0) >>> 0 || worldSeed;

  // Save explored map for the current floor before clearing
  const currentDepth = ds ? ds.currentDepth : 0;
  const currentRegionKey = _stateRegionKey(ds, currentDepth);
  const currentPlaneKey = _planeKey(currentDepth, currentPlaneId);
  const requestedTemplateId = String(opts.templateId || "");
  const requestedAnchorX = Number.isFinite(Number(opts.anchorX))
    ? (Number(opts.anchorX) | 0)
    : (newDepth > currentDepth ? (Number(opts.stairPos?.x || ds?.regionAnchorX || 0) | 0) : (Number(ds?.regionAnchorX || opts.stairPos?.x || 0) | 0));
  const requestedAnchorY = Number.isFinite(Number(opts.anchorY))
    ? (Number(opts.anchorY) | 0)
    : (newDepth > currentDepth ? (Number(opts.stairPos?.y || ds?.regionAnchorY || 0) | 0) : (Number(ds?.regionAnchorY || opts.stairPos?.y || 0) | 0));
  const destinationRegionKey = targetPlaneId
    ? _planeRegionKey(newDepth, targetPlaneId)
    : floorRegionKey(newDepth, requestedAnchorX, requestedAnchorY, requestedTemplateId);
  const destinationPlaneKey = _planeKey(newDepth, targetPlaneId);
  const stairPursuerIds = _collectStairPursuers(world, currentDepth, newDepth, opts.stairPos || null);
  const residentRegions = targetPlaneId
    ? []
    : _collectResidentRegions(world, newDepth, {
      templateId: requestedTemplateId,
      anchorX: requestedAnchorX,
      anchorY: requestedAnchorY,
    });

  // Build the permanent-entity set once and reuse it for both snapshot saving
  // and the destroy phase. This prevents picked-up floor items (whose entity IDs
  // remain in floorEntityIds after pickup) from being destroyed on transition.
  const _permanentIds = new Set();
  for (const [id] of world.query(Player)) _permanentIds.add(id);
  for (const [id] of world.query(Pet)) _permanentIds.add(id);
  for (const [id] of world.query(DungeonState)) _permanentIds.add(id);
  for (const [id] of world.query(RiftState)) _permanentIds.add(id);
  for (const [id] of world.query(QuestDefRef)) _permanentIds.add(id);
  for (const id of stairPursuerIds) _permanentIds.add(id);
  // Walk full hierarchy: InventoryRoot, inventory items, equipment, etc.
  for (const root of [..._permanentIds]) {
    const stack = [root];
    while (stack.length) {
      const cur = stack.pop();
      for (const cid of children(world, cur)) {
        if (!_permanentIds.has(cid)) { _permanentIds.add(cid); stack.push(cid); }
      }
    }
  }

  if (ds && Array.isArray(ds.floorEntityIds)) {
    if (currentDepth > 0) exploredFloorRepository.setSnapshot(currentPlaneKey, saveExplored());
    if (!ds.destroyedTilesByRegion || typeof ds.destroyedTilesByRegion !== "object") ds.destroyedTilesByRegion = {};
    if (!ds.wetTilesByRegion || typeof ds.wetTilesByRegion !== "object") ds.wetTilesByRegion = {};
    ds.destroyedTilesByRegion[currentRegionKey] = { ...(ds.destroyedTiles || {}) };
    ds.floodedTilesByRegion ??= {};
    ds.floodedTilesByRegion[currentRegionKey] = { ...(ds.floodedTiles || {}) };
    ds.wetTilesByRegion[currentRegionKey] = Object.fromEntries(
      Object.entries(ds.wetTiles || {}).filter(([, rec]) => rec.expiresAtStep >= world.step),
    );
    // Capture ALL non-permanent alive entities so that chest inventory items
    // (no Position, not in floorEntityIds) and runtime-spawned monsters are
    // included in the snapshot.
    const floorIds = Array.from(world.alive)
      .filter(id => Number.isInteger(id) && id > 0 && !_permanentIds.has(id));
    const entry = {
      snapshot: serializeEntities(world, floorIds, { note: `floor_${currentPlaneKey}` }),
      order: floorIds.slice(),
    };
    _persistFloor(currentPlaneSeed, currentPlaneKey, entry);
    _floorEntityCache.set(currentPlaneKey, entry);
    _evictMemoryFloors(newDepth);
  }

  // Destroy all entities from the current floor (destroySubtree cascades to
  // hierarchy children, e.g. monsters spawned at runtime by spawner nests).
  // Skip any entity that is now part of the player's permanent hierarchy
  // (e.g. floor items that were picked up — their IDs remain in floorEntityIds).
  if (ds && Array.isArray(ds.floorEntityIds)) {
    for (const eid of ds.floorEntityIds) {
      if (_permanentIds.has(eid)) continue;
      try { destroySubtree(world, eid); } catch (_) { /* already gone */ }
    }
  }

  // Sweep orphaned floor-local entities not captured in floorEntityIds:
  // runtime-spawned monsters whose spawner was killed, web trail entities,
  // sarcophagus skeletons, loot drops, etc. The player, DungeonState,
  // and pet entities are permanent and must be preserved.
  for (const [eid] of world.query(Position)) {
    if (_permanentIds.has(eid)) continue;
    try { if (world.isAlive(eid)) destroySubtree(world, eid); } catch (_) {}
  }

  // Clear tile data and fog-of-war
  clearTileMap();
  clearExplored();
  clearSpatialIndex(world);
  invalidateTileQueryCache(world);

  // Generate the new floor, inheriting down-stair positions from the current floor
  // when descending so up-stairs land at the same world coordinates.
  const tombstoneRepo = opts.tombstoneRepo || null;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const isDescending = newDepth > currentDepth || (targetPlaneId && opts.stairPos);
  const priorDownStairPositions = (isDescending && opts.stairPos)
    ? [opts.stairPos]
    : ((isDescending && Array.isArray(ds?.downStairPositions) && ds.downStairPositions.length > 0)
      ? ds.downStairPositions
      : null);
  const generatedEntityIds = [];
  const newDownStairPositions = [];
  let spawnX = destinationPos?.x | 0;
  let spawnY = destinationPos?.y | 0;
  let newProfileType = "default";
  let newRegionKey = destinationRegionKey;
  let newTemplateId = requestedTemplateId;
  let newRegionAnchorX = requestedAnchorX;
  let newRegionAnchorY = requestedAnchorY;

  const generatedRegions = residentRegions.length > 0
    ? residentRegions
    : [{ templateId: requestedTemplateId, anchorX: requestedAnchorX, anchorY: requestedAnchorY, regionKey: destinationRegionKey }];

  for (let i = 0; i < generatedRegions.length; i++) {
    const region = generatedRegions[i];
    const isRequested = region.regionKey === destinationRegionKey || i === 0;
    const regionPriorDownStairs = (newDepth > 0 && region.templateId)
      ? ((isRequested && priorDownStairPositions?.length > 0)
        ? priorDownStairPositions
        : [{ x: region.anchorX, y: region.anchorY }])
      : priorDownStairPositions;
    const result = await generateFloor(world, targetPlaneSeed, newDepth, tombstoneRepo, onProgress, regionPriorDownStairs, {
      dungeonType: opts.dungeonType ?? null,
      getHighscores: typeof opts.getHighscores === 'function' ? opts.getHighscores : null,
      templateId: region.templateId,
      anchorX: region.anchorX,
      anchorY: region.anchorY,
    });
    generatedEntityIds.push(...result.entityIds);
    newDownStairPositions.push(...(result.downStairPositions || []));
    if (isRequested) {
      spawnX = result.spawnX;
      spawnY = result.spawnY;
      newProfileType = result.profileType || "default";
      newRegionKey = targetPlaneId ? destinationRegionKey : (result.regionKey || region.regionKey);
      newTemplateId = result.activeTemplateId || region.templateId || "";
      newRegionAnchorX = targetPlaneId ? 0 : (Number(result.regionAnchorX || region.anchorX || 0) | 0);
      newRegionAnchorY = targetPlaneId ? 0 : (Number(result.regionAnchorY || region.anchorY || 0) | 0);
    }
  }
  let entityIds = generatedEntityIds;
  const restoredRegionKey = newRegionKey || destinationRegionKey;
  const restoredPlaneKey = destinationPlaneKey;

  if (ds) {
    const regionKeys = targetPlaneId
      ? [destinationRegionKey]
      : generatedRegions.map((region) => region.regionKey || floorRegionKey(newDepth, region.anchorX, region.anchorY, region.templateId));
    const destroyedTiles = {};
    const floodedTiles = {};
    const wetTiles = {};
    for (const key of regionKeys) {
      Object.assign(destroyedTiles, (ds.destroyedTilesByRegion && ds.destroyedTilesByRegion[key]) || {});
      Object.assign(floodedTiles, ds.floodedTilesByRegion?.[key] || {});
      Object.assign(wetTiles, (ds.wetTilesByRegion && ds.wetTilesByRegion[key]) || {});
    }
    ds.destroyedTiles = destroyedTiles;
    ds.floodedTiles = floodedTiles;
    ds.wetTiles = wetTiles;
  }

  // Re-apply destroyed tiles from the ledger so burned walls stay destroyed
  // after the tile map is regenerated from scratch.
  if (ds && ds.destroyedTiles && typeof ds.destroyedTiles === 'object') {
    for (const rec of Object.values(ds.destroyedTiles)) {
      if (rec && Number.isFinite(rec.x) && Number.isFinite(rec.y) && Number.isFinite(rec.currentTile)) {
        setTile(rec.x, rec.y, rec.currentTile);
      }
    }
  }

  restoreFloodedTerrain(world);

  const cachedFloor = _floorEntityCache.get(restoredPlaneKey) ?? _loadPersistedFloor(targetPlaneSeed, restoredPlaneKey);
  const normalizedSnapshot = normalizeInventorySnapshot(cachedFloor?.snapshot);
  if (normalizedSnapshot?.v === 1 && normalizedSnapshot.comps) {
    // Generation is required to rebuild the tile map, but its entities are
    // placeholders when a cached floor snapshot exists. Capture every generated
    // floor-local entity, including children/helpers omitted from entityIds, so
    // a successful restore can remove the complete placeholder graph.
    const generatedFloorIds = Array.from(world.alive)
      .filter((eid) => !_permanentIds.has(eid));
    /** @type {number[]} */
    const createdIds = [];
    try {
      /** @type {Map<number, number>} */
      const oldToNew = new Map();
      const prevTime = +world.time || 0;
      const prevFrame = world.frame | 0;

      applySnapshot(world, normalizedSnapshot, _buildSnapshotRegistry(world), {
        mode: 'append',
        skipUnknown: true,
        remapId(oldId) {
          const id = world.create();
          oldToNew.set(oldId, id);
          createdIds.push(id);
          return id;
        },
      });

      // Remap entity ID cross-references embedded in component payloads.
      // applySnapshot(append) assigns new IDs but does not walk payload values,
      // so payloads like MonsterSpawner.activeChildren still contain the old IDs.
      const _restoredSet = new Set(oldToNew.values());
      for (const [eid] of world.query(MonsterSpawner)) {
        if (!_restoredSet.has(eid)) continue;
        world.mutate(eid, MonsterSpawner, r => {
          r.activeChildren = (r.activeChildren || [])
            .map(id => oldToNew.get(id) ?? id)
            .filter(id => world.isAlive(id));
        });
      }
      for (const [eid] of world.query(RoomMetadata)) {
        if (!_restoredSet.has(eid)) continue;
        world.mutate(eid, RoomMetadata, r => {
          if (r.shopkeeperId) r.shopkeeperId = oldToNew.get(r.shopkeeperId) ?? r.shopkeeperId;
        });
      }
      for (const [eid] of world.query(Unpaid)) {
        world.mutate(eid, Unpaid, r => {
          if (r.shopkeeperId) r.shopkeeperId = oldToNew.get(r.shopkeeperId) ?? r.shopkeeperId;
        });
      }
      // Remap hierarchy (Parent/Sibling) entity-ID cross-references.
      for (const eid of createdIds) {
        if (world.has(eid, Parent)) {
          world.mutate(eid, Parent, r => {
            if (r.first) r.first = oldToNew.get(r.first) ?? r.first;
            if (r.last) r.last = oldToNew.get(r.last) ?? r.last;
          });
        }
        if (world.has(eid, Sibling)) {
          world.mutate(eid, Sibling, r => {
            if (r.parent) r.parent = oldToNew.get(r.parent) ?? r.parent;
            if (r.prev) r.prev = oldToNew.get(r.prev) ?? r.prev;
            if (r.next) r.next = oldToNew.get(r.next) ?? r.next;
          });
        }
      }

      world.time = prevTime;
      world.frame = prevFrame;

      const order = Array.isArray(cachedFloor.order) && cachedFloor.order.length
        ? cachedFloor.order
        : (Array.isArray(cachedFloor.snapshot.alive) ? cachedFloor.snapshot.alive : []);
      const restoredIds = [];
      for (const oldId of order) {
        const eid = oldToNew.get(Number(oldId) | 0) || 0;
        if (eid > 0 && world.isAlive(eid)) restoredIds.push(eid);
      }
      if (restoredIds.length <= 0) throw new Error('restored floor is empty');

      const hasStairAnchor = restoredIds.some((eid) => {
        const ni = world.get(eid, NamedIdentity);
        return ni?.identity === 'stair_up' || ni?.identity === 'stair_down';
      });
      if (!hasStairAnchor) throw new Error('restored floor missing stair anchor');

      for (const eid of generatedFloorIds) {
        try { if (world.isAlive(eid)) destroySubtree(world, eid); } catch {}
      }

      entityIds = restoredIds;
    } catch {
      for (const eid of createdIds) {
        try { world.destroy(eid); } catch {} // ECS: entity may already be destroyed
      }
      entityIds = generatedEntityIds;
    }
  }

  // Restore explored state if this floor was previously visited
  const savedExplored = exploredFloorRepository.getSnapshot(restoredPlaneKey);
  if (savedExplored) {
    restoreExplored(savedExplored);
  }

  // Determine arrival position on the new floor.
  if (opts.stairPos) {
    // Positional-identity contract: the matching stair is at the exact same world
    // coordinates as the one the player stepped on (guaranteed by generateFloorPlan
    // when priorDownStairPositions is passed, or by snapshot restoration).
    destinationPos = opts.stairPos;
  } else if (opts.direction) {
    // Fallback for single-stair floors or callers that don't supply stairPos:
    // find the first stair of the matching type on the new floor.
    const arrivalIdentity = opts.direction === 'down' ? 'stair_up' : 'stair_down';
    let found = false;
    for (const [, pos, ni] of world.query(Position, NamedIdentity)) {
      if (ni.identity === arrivalIdentity) {
        destinationPos = { x: pos.x, y: pos.y };
        found = true;
        break;
      }
    }
    if (!found) {
      destinationPos = { x: spawnX, y: spawnY };
    }
  }
  if (opts.validateDestination === true) {
    destinationPos = _resolveValidatedDestination(destinationPos, { x: spawnX, y: spawnY });
  }

  // Strip Flying from any surviving entities (player, pets) — AI re-evaluates next tick
  for (const [eid] of world.query(Flying)) {
    try { world.remove(eid, Flying); } catch {}
  }

  // Update dungeon state
  if (dungeonId != null) {
    world.mutate(dungeonId, DungeonState, r => {
      r.currentDepth = newDepth;
      r.profileType = newProfileType || 'default';
      r.activeTemplateId = newTemplateId || "";
      r.activeRegionKey = restoredRegionKey;
      r.activePlaneId = targetPlaneId;
      r.activePlaneSeed = targetPlaneSeed;
      r.regionAnchorX = Number(newRegionAnchorX || 0) | 0;
      r.regionAnchorY = Number(newRegionAnchorY || 0) | 0;
      r.floorEntityIds = entityIds;
      r.downStairPositions = newDownStairPositions || [];
    });
  }

  // Move player to destination
  for (const [id] of world.query(Player)) {
    world.set(id, Position, { x: destinationPos.x, y: destinationPos.y });
    break;
  }

  // Move pets to destination and reset floor-specific state
  for (const [id] of world.query(Pet, PetState)) {
    world.set(id, Position, { x: destinationPos.x, y: destinationPos.y });
    world.mutate(id, PetState, r => {
      if (r.state === 'fetching' || r.state === 'returning' || r.state === 'guarding' || r.state === 'staying') {
        r.state = 'following';
      }
      r.targetX = null;
      r.targetY = null;
      r.targetItemId = 0;
      r.lastPlayerX = destinationPos.x;
      r.lastPlayerY = destinationPos.y;
    });
  }

  const placedPursuerIds = _placeStairPursuers(world, stairPursuerIds, destinationPos, entityIds);
  if (placedPursuerIds.length > 0) {
    world.emit?.('dungeon:pursuit', {
      depth: newDepth,
      templateId: newTemplateId || "",
      regionKey: restoredRegionKey,
      fromDepth: currentDepth,
      pos: destinationPos,
      pursuerIds: placedPursuerIds,
      count: placedPursuerIds.length,
    });
  }

  world.emit?.('dungeon:transitioned', {
    depth: newDepth,
    templateId: newTemplateId || "",
    regionKey: restoredRegionKey,
    anchor: { x: Number(newRegionAnchorX || 0) | 0, y: Number(newRegionAnchorY || 0) | 0 },
    profileType: newProfileType || "default",
    planeId: targetPlaneId,
    pos: destinationPos,
  });
  invalidateTileQueryCache(world);
  // Transition can run in isolated tests/worlds with no scheduler installed.
  if (typeof world.scheduler === 'function') {
    world.tick(1);
  }
}

// degradeFloorMemory moved to floorMemory.js to avoid circular imports.
export { degradeFloorMemory } from './floorMemory.js';
