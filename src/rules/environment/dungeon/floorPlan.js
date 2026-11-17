// rules/environment/dungeon/floorPlan.js
// Per-depth metadata: stair positions, theme, difficulty.

import { createRng } from '../../../lib/ecs-js/rng.js';
import { floorSeed } from './seed.js';
import { CHUNK_SIZE, TILE_FLOOR } from './constants.js';
import { dungeonConfig } from './dungeonConfig.js';
import { OVERWORLD_EXTENT } from './overworld.js';
import { pickProfile } from './profiles/index.js';
import { clamp } from '../../../shared/math/math.js';
import { generateChunk } from './chunk.js';
import { floorRegionKey, getUnderworldRegionTemplate } from './underworldRegions.js';

function resolveBaseFootprintRadius(scale, depth) {
  if (scale <= 0.5) return 0;
  const multiplier = depth === 1 ? 0.8 : 2.0;
  return Math.min(12, Math.round(scale * multiplier) - 1);
}

function resolveGrowthBudget(scale, depth) {
  const delta = Math.max(0, depth - 1);
  if (delta <= 0) return 0;
  const growthFactor = 1 + Math.min(2, Math.max(0, scale)) * 0.75;
  return Math.floor(Math.sqrt(delta) * growthFactor);
}

function resolveFloorProfile(profile, depth) {
  if (!profile) return profile;
  if (profile.roomSparsity != null) return profile;

  const base = clamp(Number(dungeonConfig.roomSparsity) || 0, 0, 1);
  // Floor 1 sparser: fewer rooms keeps the first floor tight
  const sparsity = depth === 1
    ? clamp(base * 2.0, 0.05, 0.75)
    : clamp(base, 0.05, 0.75);

  return {
    ...profile,
    roomSparsity: sparsity,
  };
}

function buildExtent(chunkPositions, paddingX, paddingY) {
  return {
    minCX: Math.min(...chunkPositions.map((s) => s.chunkX)) - paddingX,
    maxCX: Math.max(...chunkPositions.map((s) => s.chunkX)) + paddingX,
    minCY: Math.min(...chunkPositions.map((s) => s.chunkY)) - paddingY,
    maxCY: Math.max(...chunkPositions.map((s) => s.chunkY)) + paddingY,
  };
}

function buildCenteredExtent(centerCX, centerCY, paddingX, paddingY) {
  return {
    minCX: centerCX - paddingX,
    maxCX: centerCX + paddingX,
    minCY: centerCY - paddingY,
    maxCY: centerCY + paddingY,
  };
}

function expandExtentToInclude(extent, chunkPositions) {
  return {
    minCX: Math.min(extent.minCX, ...chunkPositions.map((s) => s.chunkX)),
    maxCX: Math.max(extent.maxCX, ...chunkPositions.map((s) => s.chunkX)),
    minCY: Math.min(extent.minCY, ...chunkPositions.map((s) => s.chunkY)),
    maxCY: Math.max(extent.maxCY, ...chunkPositions.map((s) => s.chunkY)),
  };
}

function pickLevelOnePocketChunk(extent, occupied) {
  const candidates = [];
  for (let cy = extent.minCY; cy <= extent.maxCY; cy++) {
    for (let cx = extent.minCX; cx <= extent.maxCX; cx++) {
      if (cx === 0 && cy === 0) continue;
      const key = `${cx},${cy}`;
      if (occupied.has(key)) continue;
      candidates.push({ chunkX: cx, chunkY: cy });
    }
  }

  candidates.sort((a, b) => {
    const da = Math.abs(a.chunkX) + Math.abs(a.chunkY);
    const db = Math.abs(b.chunkX) + Math.abs(b.chunkY);
    if (da !== db) return db - da;
    if (Math.abs(a.chunkY) !== Math.abs(b.chunkY)) return Math.abs(b.chunkY) - Math.abs(a.chunkY);
    if (Math.abs(a.chunkX) !== Math.abs(b.chunkX)) return Math.abs(b.chunkX) - Math.abs(a.chunkX);
    if (a.chunkY !== b.chunkY) return a.chunkY - b.chunkY;
    return a.chunkX - b.chunkX;
  });

  return candidates[0] ?? null;
}

function ensureLevelOnePocketExtent(extent, occupied) {
  if (pickLevelOnePocketChunk(extent, occupied)) return extent;

  const fallback = [
    { chunkX: extent.maxCX + 1, chunkY: 0 },
    { chunkX: extent.minCX - 1, chunkY: 0 },
    { chunkX: 0, chunkY: extent.maxCY + 1 },
    { chunkX: 0, chunkY: extent.minCY - 1 },
    { chunkX: extent.maxCX + 1, chunkY: extent.maxCY },
    { chunkX: extent.maxCX + 1, chunkY: extent.minCY },
    { chunkX: extent.minCX - 1, chunkY: extent.maxCY },
    { chunkX: extent.minCX - 1, chunkY: extent.minCY },
  ];

  for (const candidate of fallback) {
    if (candidate.chunkX === 0 && candidate.chunkY === 0) continue;
    if (occupied.has(`${candidate.chunkX},${candidate.chunkY}`)) continue;
    return expandExtentToInclude(extent, [candidate]);
  }

  return extent;
}

function collectPrefabCandidates(extent) {
  const candidates = [];
  for (let cy = extent.minCY; cy <= extent.maxCY; cy++) {
    for (let cx = extent.minCX; cx <= extent.maxCX; cx++) {
      if (cx === 0 && cy === 0) continue;
      candidates.push({ chunkX: cx, chunkY: cy });
    }
  }
  return candidates;
}

function ensurePrefabCandidates(candidates, needed) {
  const seen = new Set(candidates.map((c) => `${c.chunkX},${c.chunkY}`));
  const fallback = [
    { chunkX: 1, chunkY: 0 },
    { chunkX: -1, chunkY: 0 },
    { chunkX: 0, chunkY: 1 },
    { chunkX: 0, chunkY: -1 },
    { chunkX: 2, chunkY: 0 },
    { chunkX: -2, chunkY: 0 },
    { chunkX: 0, chunkY: 2 },
    { chunkX: 0, chunkY: -2 },
  ];
  for (const candidate of fallback) {
    if (candidates.length >= needed) break;
    const key = `${candidate.chunkX},${candidate.chunkY}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

/**
 * @typedef {Object} StairPlacement
 * @property {number} chunkX
 * @property {number} chunkY
 * @property {number} localX - chunk-local tile X
 * @property {number} localY - chunk-local tile Y
 */

/**
 * @typedef {Object} FloorPlan
 * @property {number} depth
 * @property {number} seed
 * @property {StairPlacement[]} downStairs
 * @property {StairPlacement[]} upStairs
 * @property {number} difficultyMult
 * @property {string} theme
 * @property {import('./profiles/default.js').DungeonProfile} profile
 */

/**
 * Generate the floor plan for a given depth.
 * Called once when entering a new floor.
 * @param {number} worldSeed
 * @param {number} depth
 * @param {{x:number,y:number}[]|null} [priorDownStairPositions]
 *   Actual world positions of down-stairs on the floor above.
 *   When provided, up-stairs are placed at those exact positions (positional-identity
 *   contract) rather than being independently computed.
 * @param {{dungeonType?: string|null}} [opts]
 * @returns {FloorPlan}
 */
export function generateFloorPlan(worldSeed, depth, priorDownStairPositions = null, opts = {}) {
  if (depth === 0) {
    return {
      depth,
      seed: floorSeed(worldSeed, depth),
      downStairs: [{
        chunkX: 0,
        chunkY: 0,
        localX: Math.floor(CHUNK_SIZE * 0.75),
        localY: Math.floor(CHUNK_SIZE * 0.5),
      }],
      upStairs: [],
      extent: { ...OVERWORLD_EXTENT },
      difficultyMult: 0,
      theme: 'overworld',
    };
  }

  const seed = floorSeed(worldSeed, depth);
  const rng = createRng(seed);
  const template = getUnderworldRegionTemplate(opts.templateId);
  const anchorX = Number.isFinite(Number(opts.anchorX)) ? (Number(opts.anchorX) | 0) : 0;
  const anchorY = Number.isFinite(Number(opts.anchorY)) ? (Number(opts.anchorY) | 0) : 0;
  const anchorChunkX = Math.floor(anchorX / CHUNK_SIZE);
  const anchorChunkY = Math.floor(anchorY / CHUNK_SIZE);

  const scale = Math.max(0.1, Number(dungeonConfig.dungeonScale) || 0.3);
  const baseRadius = resolveBaseFootprintRadius(scale, depth);
  const growthBudget = resolveGrowthBudget(scale, depth);
  const paddingX = growthBudget <= 0
    ? baseRadius
    : Math.min(12, baseRadius + Math.floor((growthBudget + 2) / 2));
  const paddingY = growthBudget <= 0
    ? baseRadius
    : Math.min(12, baseRadius + Math.floor((growthBudget + 1) / 2));

  // Footprint and stair spread are both driven from dungeonScale so the knob
  // changes the actual floor size instead of only nudging stair placement.
  const stairOffset = Math.floor(growthBudget / 2);

  // Down stairs: generate minDownStairs–maxDownStairs per floor, each with an independent
  // chunk offset so they spread across the floor on deeper floors.
  // At shallow depths (stairOffset = 0) they share chunk (0,0) and land in different rooms.
  const templateFloors = Math.max(1, Number(template?.floors ?? 1) | 0);
  const isTemplateTerminalFloor = !!template && depth >= templateFloors;
  const count = template
    ? (isTemplateTerminalFloor ? 0 : 1)
    : rng.int(dungeonConfig.minDownStairs, dungeonConfig.maxDownStairs);
  const downStairs = [];
  const _usedChunks = new Set();
  for (let i = 0; i < count; i++) {
    let cX = anchorChunkX, cY = anchorChunkY;
    if (stairOffset > 0) {
      // Retry up to 8 times to avoid placing two down-stairs in the same chunk.
      let attempts = 0;
      do {
        cX = anchorChunkX + rng.int(1, stairOffset) * (rng.next() < 0.5 ? 1 : -1);
        cY = anchorChunkY + rng.int(0, stairOffset) * (rng.next() < 0.5 ? 1 : -1);
        attempts++;
      } while (_usedChunks.has(`${cX},${cY}`) && attempts < 8);
      _usedChunks.add(`${cX},${cY}`);
    }
    downStairs.push({
      chunkX: cX,
      chunkY: cY,
      localX: rng.int(4, CHUNK_SIZE - 5),
      localY: rng.int(4, CHUNK_SIZE - 5),
    });
  }

  // Up stairs: inherit the prior floor's down-stair positions (positional-identity
  // contract) when available, otherwise place independently near origin.
  const upStairs = [];
  if (depth >= 1) {
    if (Array.isArray(priorDownStairPositions) && priorDownStairPositions.length > 0) {
      for (const { x, y } of priorDownStairPositions) {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkY = Math.floor(y / CHUNK_SIZE);
        upStairs.push({
          chunkX,
          chunkY,
          localX: x - chunkX * CHUNK_SIZE,
          localY: y - chunkY * CHUNK_SIZE,
          forced: true,
        });
      }
    } else {
      upStairs.push({
        chunkX: anchorChunkX,
        chunkY: anchorChunkY,
        localX: rng.int(4, CHUNK_SIZE - 5),
        localY: rng.int(4, CHUNK_SIZE - 5),
      });
    }
  }

  const prefabRules = [];
  if (!template && depth === 1) {
    prefabRules.push("room_boulder_puzzle");
    prefabRules.push("room_lava_puzzle_dead_end");
  }
  if (!template && depth >= 3 && depth <= 6) {
    prefabRules.push("room_shaman_dark_shrine");
  }

  // Derive chunk extent from the furthest stair plus a scale-driven footprint
  // radius.
  const allChunkPositions = [...downStairs, ...upStairs, { chunkX: anchorChunkX, chunkY: anchorChunkY }];
  let extent = expandExtentToInclude(buildCenteredExtent(anchorChunkX, anchorChunkY, paddingX, paddingY), allChunkPositions);
  if (template) {
    const radius = Math.max(0, Math.ceil(Math.max(1, Number(template.floors || 1)) / 6) - 1);
    extent = {
      minCX: anchorChunkX - radius,
      maxCX: anchorChunkX + radius,
      minCY: anchorChunkY - radius,
      maxCY: anchorChunkY + radius,
    };
  }
  const occupiedChunks = new Set(allChunkPositions.map((s) => `${s.chunkX},${s.chunkY}`));
  if (!template && depth === 1) {
    extent = ensureLevelOnePocketExtent(extent, occupiedChunks);
  }

  const profile = resolveFloorProfile(template?.profile || pickProfile(rng, depth, opts.dungeonType ?? null), depth);
  const disconnectedPocket = (!template && depth === 1) ? pickLevelOnePocketChunk(extent, occupiedChunks) : null;

  // Prefab rooms: hand-authored set pieces placed in non-origin chunks.
  // Only place if there's ample space (don't force extent expansion).
  const prefabRooms = [];
  const extentSize = (extent.maxCX - extent.minCX + 1) * (extent.maxCY - extent.minCY + 1);
  const hasAmpleSpace = extentSize >= 9; // at least 3x3 chunks

  if (prefabRules.length > 0 && hasAmpleSpace) {
    const candidates = ensurePrefabCandidates(collectPrefabCandidates(extent), prefabRules.length);
    const orderedCandidates = candidates
      .slice()
      .sort((a, b) => {
        const da = Math.abs(a.chunkX) + Math.abs(a.chunkY);
        const db = Math.abs(b.chunkX) + Math.abs(b.chunkY);
        if (da !== db) return da - db;
        if (Math.abs(a.chunkY) !== Math.abs(b.chunkY)) return Math.abs(a.chunkY) - Math.abs(b.chunkY);
        if (Math.abs(a.chunkX) !== Math.abs(b.chunkX)) return Math.abs(a.chunkX) - Math.abs(b.chunkX);
        if (a.chunkY !== b.chunkY) return a.chunkY - b.chunkY;
        return a.chunkX - b.chunkX;
      });
    for (let i = 0; i < prefabRules.length && i < orderedCandidates.length; i++) {
      const pick = orderedCandidates[i];
      // Only include if it's already within the planned extent
      if (pick.chunkX >= extent.minCX && pick.chunkX <= extent.maxCX &&
          pick.chunkY >= extent.minCY && pick.chunkY <= extent.maxCY) {
        const roomId = prefabRules[i];
        prefabRooms.push({ chunkX: pick.chunkX, chunkY: pick.chunkY, roomId });
      }
    }
  }

  return {
    depth,
    seed,
    downStairs,
    upStairs,
    extent,
    difficultyMult: 1.0 + (depth - 1) * 0.017,
    theme: profile.theme,
    profile,
    prefabRooms,
    disconnectedPocket,
    activeTemplateId: template?.templateId || "",
    regionAnchorX: anchorX,
    regionAnchorY: anchorY,
    regionKey: floorRegionKey(depth, anchorX, anchorY, template?.templateId || ""),
    roomTarget: Number(template?.roomTarget || 0) | 0,
    floors: templateFloors,
  };
}

/**
 * Get the world-coordinate position of a stair placement.
 * @param {StairPlacement} stair
 * @returns {{x: number, y: number}}
 */
export function stairWorldPos(stair) {
  return {
    x: stair.chunkX * CHUNK_SIZE + stair.localX,
    y: stair.chunkY * CHUNK_SIZE + stair.localY,
  };
}

/**
 * Read-only tile probe — does NOT load into the global tileMap.
 * Used for pit-trap N+1 lookahead: verify the landing tile on the next floor
 * is TILE_FLOOR before allowing placement.
 * @param {number} worldSeed
 * @param {number} depth  — the floor to probe (i.e. currentDepth + 1)
 * @param {number} worldX
 * @param {number} worldY
 * @param {{x:number,y:number}[]|null} [priorDownStairPositions]
 * @returns {number} tile constant at (worldX, worldY) on that floor
 */
export function probeFloorTile(worldSeed, depth, worldX, worldY, priorDownStairPositions = null) {
  const cx = Math.floor(worldX / CHUNK_SIZE);
  const cy = Math.floor(worldY / CHUNK_SIZE);
  const lx = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const ly = ((worldY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const plan = generateFloorPlan(worldSeed, depth, priorDownStairPositions);
  const chunkData = generateChunk(worldSeed, depth, cx, cy, plan.profile ?? null, plan);
  return chunkData.tiles[ly * CHUNK_SIZE + lx];
}

/** Convenience: returns true only if the tile at (worldX, worldY) on `depth` is walkable floor. */
export function isPitLandingViable(worldSeed, depth, worldX, worldY, priorDownStairPositions = null) {
  if (!(worldSeed > 0) || depth < 1) return false;
  const cx = Math.floor(worldX / CHUNK_SIZE);
  const cy = Math.floor(worldY / CHUNK_SIZE);
  const plan = generateFloorPlan(worldSeed, depth, priorDownStairPositions);
  const extent = plan?.extent;
  if (!extent
      || cx < extent.minCX || cx > extent.maxCX
      || cy < extent.minCY || cy > extent.maxCY) {
    return false;
  }
  return probeFloorTile(worldSeed, depth, worldX, worldY, priorDownStairPositions) === TILE_FLOOR;
}
