import {
  BUILDING_DEFS,
  canPlaceBuilding,
} from "../../data/buildings/buildingRegistry.js";
import { TOWN_DISTRICT_DEFS } from "../../data/townDistricts.js";
import {
  CHUNK_SIZE,
  TILE_BEACH,
  TILE_BADLANDS,
  TILE_BOG,
  TILE_COBBLESTONE,
  TILE_CORAL_REEF,
  TILE_DOOR,
  TILE_FARMLAND,
  TILE_FENCE,
  TILE_FLOOR,
  TILE_GRASS,
  TILE_GRASS_A,
  TILE_GRASS_C,
  TILE_GRASS_D,
  TILE_GRAVEL,
  TILE_KELP_FOREST,
  TILE_MANGROVE,
  TILE_MARSH,
  TILE_MOORLAND,
  TILE_MOUNTAIN,
  TILE_MOUNTAIN_B,
  TILE_MOUNTAIN_C,
  TILE_MUD,
  TILE_PALM_FOREST,
  TILE_PINE_FOREST,
  TILE_ROCKY_SHORE,
  TILE_SALT_MARSH,
  TILE_SAND_DUNES,
  TILE_SCRUBLAND,
  TILE_SEAGRASS,
  TILE_SHALLOW_WATER,
  TILE_SHINGLE,
  TILE_SWAMP,
  TILE_TIDAL_FLAT,
  TILE_TREE,
  TILE_WALL,
  TILE_WATER,
  TILE_WATER_DEEP,
} from "./constants.js";
import { stampBuilding } from "./stampBuilding.js";

const ALL_ROTATIONS = Object.freeze([0, 1, 2, 3]);
const FIXED_ROTATION = Object.freeze([0]);

const NATURAL_BUILDABLE = new Set([
  TILE_GRASS, TILE_GRASS_A, TILE_GRASS_C, TILE_GRASS_D,
  TILE_BEACH, TILE_MARSH, TILE_SWAMP, TILE_BOG, TILE_SAND_DUNES,
  TILE_MUD, TILE_TIDAL_FLAT, TILE_ROCKY_SHORE, TILE_SALT_MARSH,
  TILE_SHINGLE, TILE_MOORLAND, TILE_SCRUBLAND, TILE_GRAVEL,
  TILE_PINE_FOREST, TILE_PALM_FOREST, TILE_MANGROVE,
]);

const FLAT_TILES = new Set([
  TILE_GRASS, TILE_GRASS_A, TILE_GRASS_C, TILE_GRASS_D,
  TILE_BEACH, TILE_MOORLAND, TILE_SCRUBLAND, TILE_GRAVEL,
  TILE_SHINGLE, TILE_SAND_DUNES,
]);

const WET_TILES = new Set([
  TILE_WATER, TILE_WATER_DEEP, TILE_SHALLOW_WATER,
  TILE_KELP_FOREST, TILE_SEAGRASS, TILE_CORAL_REEF,
]);

const WATER_EDGE_TILES = new Set([
  TILE_BEACH, TILE_MARSH, TILE_SWAMP, TILE_BOG, TILE_MUD,
  TILE_TIDAL_FLAT, TILE_SALT_MARSH, TILE_MANGROVE,
]);

const MOUNTAIN_TILES = new Set([
  TILE_MOUNTAIN, TILE_MOUNTAIN_B, TILE_MOUNTAIN_C, TILE_ROCKY_SHORE, TILE_BADLANDS,
]);

const FOREST_TILES = new Set([TILE_TREE, TILE_PINE_FOREST, TILE_PALM_FOREST, TILE_MANGROVE]);
const STRUCTURE_TILES = new Set([TILE_FLOOR, TILE_WALL, TILE_DOOR, TILE_FARMLAND, TILE_FENCE, TILE_COBBLESTONE]);
const HARD_WATER_TILES = new Set([TILE_WATER_DEEP, TILE_KELP_FOREST, TILE_CORAL_REEF]);
const STRUCTURAL_STAMP_TILES = new Set(["floor", "wall", "door", "stair_down", "stair_up"]);

const BUILDING_PLANS = Object.freeze([
  Object.freeze({ key: "well_plaza", district: "civic_core", coreDx: 0, coreDy: 0, wants: ["flat"], roles: [] }),
  Object.freeze({ key: "church", district: "churchyard", coreDx: 0, coreDy: -3, wants: ["quiet", "flat"], roles: ["priest"], rotations: FIXED_ROTATION, searchRadius: 24 }),
  Object.freeze({ key: "smithy", district: "workshop_row", coreDx: 12, coreDy: -4, wants: ["mountain", "flat"], roles: ["smith"], rotations: FIXED_ROTATION }),
  Object.freeze({ key: "cottage", district: "civic_core", coreDx: -20, coreDy: 20, wants: ["flat"], roles: ["villager"] }),
  Object.freeze({ key: "tavern", district: "market_green", coreDx: -8, coreDy: -3, wants: ["flat"], roles: ["barkeep"] }),
  Object.freeze({ key: "general_store", district: "market_green", coreDx: -3, coreDy: 9, wants: ["flat"], roles: ["general_vendor"] }),
  Object.freeze({ key: "apothecary", district: "workshop_row", coreDx: 4, coreDy: 13, wants: ["forest", "water"], roles: ["alchemist"] }),
  Object.freeze({ key: "enchanter_shop", district: "civic_core", coreDx: 12, coreDy: 6, wants: ["flat"], roles: ["enchantress"] }),
  Object.freeze({ key: "gem_store", district: "workshop_row", coreDx: -1, coreDy: 12, wants: ["flat"], roles: ["gem_vendor"] }),
  Object.freeze({ key: "book_shop", district: "civic_core", coreDx: 12, coreDy: -2, wants: ["flat"], roles: ["book_vendor"] }),
  Object.freeze({ key: "graveyard", district: "churchyard", coreDx: 12, coreDy: -14, wants: ["quiet", "flat"], roles: [], searchRadius: 36 }),
  Object.freeze({ key: "farm", district: "market_green", resource: "waterFlat", wants: ["flat", "water"], roles: ["farmer"] }),
  Object.freeze({ key: "windmill", district: "market_green", resource: "waterFlat", wants: ["flat"], roles: [] }),
  Object.freeze({ key: "fishery", defKey: "cottage", district: "market_green", resource: "waterFlat", wants: ["water", "flat"], roles: ["fisher"], supplies: "tavern" }),
  Object.freeze({ key: "herbalist_hut", district: "workshop_row", resource: "herbs", wants: ["forest", "water"], roles: ["herbalist"], supplies: "apothecary" }),
  Object.freeze({ key: "mine_camp", defKey: "cottage", district: "workshop_row", resource: "mine", wants: ["mountain", "flat"], roles: ["miner"], supplies: "smithy" }),
  Object.freeze({ key: "woodcutter_camp", defKey: "cottage", district: "workshop_row", resource: "forest", wants: ["forest", "flat"], roles: ["woodcutter"], supplies: "general_store" }),
]);

function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

function getWorldTile(chunks, x, y) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const chunk = chunks.get(chunkKey(cx, cy));
  if (!chunk) return TILE_WATER;
  const lx = x - cx * CHUNK_SIZE;
  const ly = y - cy * CHUNK_SIZE;
  if (lx < 0 || ly < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE) return TILE_WATER;
  return chunk.tiles[ly * CHUNK_SIZE + lx];
}

function setChunkTile(chunks, x, y, tile) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const chunk = chunks.get(chunkKey(cx, cy));
  if (!chunk) return;
  const lx = x - cx * CHUNK_SIZE;
  const ly = y - cy * CHUNK_SIZE;
  if (lx < 0 || ly < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE) return;
  chunk.tiles[ly * CHUNK_SIZE + lx] = tile;
}

function addChunkSpawn(chunks, x, y, kind, params = {}) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const chunk = chunks.get(chunkKey(cx, cy));
  if (!chunk) return;
  chunk.spawns.push({ x, y, kind, params });
}

function xyKey(x, y) {
  return `${x},${y}`;
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rotatePoint(dx, dy, rotation) {
  switch (rotation & 3) {
    case 1: return { dx: -dy, dy: dx };
    case 2: return { dx: -dx, dy: -dy };
    case 3: return { dx: dy, dy: -dx };
    default: return { dx, dy };
  }
}

export function rotateBuildingDef(def, rotation) {
  const rot = rotation & 3;
  if (rot === 0) return def;
  const rotateEntry = (entry) => ({ ...entry, ...rotatePoint(Number(entry.dx) | 0, Number(entry.dy) | 0, rot) });
  const tiles = (def.tiles || []).map(rotateEntry);
  const spawns = (def.spawns || []).map(rotateEntry);
  const waypoints = (def.waypoints || []).map(rotateEntry);
  const rooms = (def.rooms || []).map((room) => {
    const corners = [
      rotatePoint(Number(room.dx) | 0, Number(room.dy) | 0, rot),
      rotatePoint((Number(room.dx) | 0) + (Number(room.w) | 0) - 1, Number(room.dy) | 0, rot),
      rotatePoint(Number(room.dx) | 0, (Number(room.dy) | 0) + (Number(room.h) | 0) - 1, rot),
      rotatePoint((Number(room.dx) | 0) + (Number(room.w) | 0) - 1, (Number(room.dy) | 0) + (Number(room.h) | 0) - 1, rot),
    ];
    const xs = corners.map((p) => p.dx);
    const ys = corners.map((p) => p.dy);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      ...room,
      dx: minX,
      dy: minY,
      w: Math.max(...xs) - minX + 1,
      h: Math.max(...ys) - minY + 1,
    };
  });
  return {
    ...def,
    name: def.name,
    rotation: rot,
    tiles,
    spawns,
    waypoints,
    rooms,
  };
}

function countNear(chunks, x, y, radius, predicate) {
  let count = 0;
  for (let yy = y - radius; yy <= y + radius; yy++) {
    for (let xx = x - radius; xx <= x + radius; xx++) {
      if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) > radius) continue;
      if (predicate(getWorldTile(chunks, xx, yy))) count++;
    }
  }
  return count;
}

function nearestScore(chunks, x, y, radius, predicate) {
  for (let r = 1; r <= radius; r++) {
    for (let offset = -r; offset < r; offset++) {
      if (predicate(getWorldTile(chunks, x + offset, y - r))
        || predicate(getWorldTile(chunks, x + r, y + offset))
        || predicate(getWorldTile(chunks, x - offset, y + r))
        || predicate(getWorldTile(chunks, x - r, y - offset))) return radius - r + 1;
    }
  }
  return 0;
}

function footprint(def, anchorX, anchorY, margin = 0) {
  const keys = new Set();
  for (const tile of def.tiles || []) {
    const wx = anchorX + (Number(tile.dx) | 0);
    const wy = anchorY + (Number(tile.dy) | 0);
    for (let dy = -margin; dy <= margin; dy++) {
      for (let dx = -margin; dx <= margin; dx++) {
        keys.add(xyKey(wx + dx, wy + dy));
      }
    }
  }
  return keys;
}

function spawnsCanLand(chunks, def, anchorX, anchorY, exactFootprint, occupied, canLand = canBuildOn) {
  for (const spawn of def.spawns || []) {
    const x = anchorX + (Number(spawn.dx) | 0);
    const y = anchorY + (Number(spawn.dy) | 0);
    const key = xyKey(x, y);
    if (exactFootprint.has(key)) continue;
    if (occupied.has(key) || !canLand(chunks, x, y)) return false;
  }
  return true;
}

function doorFor(result, anchorX, anchorY) {
  return result.waypoints.shop_door
    || result.waypoints.front_door
    || result.waypoints.door
    || { x: anchorX, y: anchorY };
}

function doorOffsetForDef(def) {
  const point = (def.waypoints || []).find((entry) => entry.name === "shop_door")
    || (def.waypoints || []).find((entry) => entry.name === "front_door")
    || (def.waypoints || []).find((entry) => String(entry.name || "").includes("door"));
  if (point) return { dx: Number(point.dx) | 0, dy: Number(point.dy) | 0 };
  const tile = (def.tiles || []).find((entry) => entry.tile === "door");
  return tile ? { dx: Number(tile.dx) | 0, dy: Number(tile.dy) | 0 } : { dx: 0, dy: 0 };
}

function boundsForDef(def) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const tile of def.tiles || []) {
    const dx = Number(tile.dx) | 0;
    const dy = Number(tile.dy) | 0;
    minX = Math.min(minX, dx);
    minY = Math.min(minY, dy);
    maxX = Math.max(maxX, dx);
    maxY = Math.max(maxY, dy);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

function doorNormalForDef(def) {
  const door = doorOffsetForDef(def);
  const bounds = boundsForDef(def);
  const candidates = [
    { nx: -1, ny: 0, d: Math.abs(door.dx - bounds.minX) },
    { nx: 1, ny: 0, d: Math.abs(door.dx - bounds.maxX) },
    { nx: 0, ny: -1, d: Math.abs(door.dy - bounds.minY) },
    { nx: 0, ny: 1, d: Math.abs(door.dy - bounds.maxY) },
  ];
  candidates.sort((a, b) => a.d - b.d);
  return { x: candidates[0].nx, y: candidates[0].ny };
}

function doorFacingScore(def, anchorX, anchorY, target) {
  if (!target) return 0;
  const door = doorOffsetForDef(def);
  const doorX = anchorX + door.dx;
  const doorY = anchorY + door.dy;
  const vx = Math.sign((target.x | 0) - doorX);
  const vy = Math.sign((target.y | 0) - doorY);
  if (vx === 0 && vy === 0) return 0;
  const normal = doorNormalForDef(def);
  const dot = normal.x * vx + normal.y * vy;
  if (dot > 0) return 28;
  if (dot === 0) return 4;
  return -28;
}

function terrainScore(chunks, x, y) {
  const flat = countNear(chunks, x, y, 5, (t) => FLAT_TILES.has(t));
  const wet = nearestScore(chunks, x, y, 28, (t) => WET_TILES.has(t) || WATER_EDGE_TILES.has(t));
  const mountain = nearestScore(chunks, x, y, 36, (t) => MOUNTAIN_TILES.has(t));
  const forest = nearestScore(chunks, x, y, 24, (t) => FOREST_TILES.has(t));
  const blocked = countNear(chunks, x, y, 4, (t) => WET_TILES.has(t) || MOUNTAIN_TILES.has(t));
  return flat * 3 + wet * 5 + mountain * 4 + forest * 2 - blocked * 8;
}

function waterfrontScore(chunks, x, y) {
  const flat = countNear(chunks, x, y, 7, (t) => FLAT_TILES.has(t) || t === TILE_COBBLESTONE);
  const blocked = countNear(chunks, x, y, 7, (t) => WET_TILES.has(t) || MOUNTAIN_TILES.has(t));
  const oceanDist = nearestScore(chunks, x, y, 32, (t) => t === TILE_WATER_DEEP || t === TILE_KELP_FOREST);
  const waterDist = nearestScore(chunks, x, y, 18, (t) => t === TILE_WATER || t === TILE_SHALLOW_WATER || t === TILE_SEAGRASS || t === TILE_CORAL_REEF);
  const coastDist = nearestScore(chunks, x, y, 18, (t) => WATER_EDGE_TILES.has(t) || t === TILE_ROCKY_SHORE);
  const immediateWater = countNear(chunks, x, y, 3, (t) => WET_TILES.has(t));
  return flat * 4 + oceanDist * 13 + waterDist * 5 + coastDist * 5 - blocked * 7 - immediateWater * 18;
}

function chooseTownCenter(chunks, bounds, seed) {
  const rng = mulberry(seed ^ 0x5E77);
  const targetX = Math.floor((bounds.minX + bounds.maxX) / 2);
  const targetY = Math.floor((bounds.minY + bounds.maxY) / 2);
  // Survey the central region so expanding the wilderness does not pull
  // the starting town toward a remote stretch of coastline.
  const surveyRadius = 42;
  const smithy = BUILDING_PLANS.find((plan) => plan.key === "smithy");
  let best = null;
  for (let y = Math.max(bounds.minY + 30, targetY + 1 - surveyRadius); y <= Math.min(bounds.maxY - 30, targetY + 1 + surveyRadius); y += 2) {
    for (let x = Math.max(bounds.minX + 30, targetX + 1 - surveyRadius); x <= Math.min(bounds.maxX - 30, targetX + 1 + surveyRadius); x += 2) {
      const tile = getWorldTile(chunks, x, y);
      if (!NATURAL_BUILDABLE.has(tile)) continue;
      const centerBias = 80 - Math.max(Math.abs(x - targetX), Math.abs(y - targetY)) * 0.45;
      const workshopMountain = nearestScore(chunks, x + 10 + smithy.coreDx, y + smithy.coreDy, 36,
        (tile) => MOUNTAIN_TILES.has(tile) && tile !== TILE_BADLANDS);
      const score = waterfrontScore(chunks, x, y) + terrainScore(chunks, x, y) * 0.35
        + workshopMountain * 18 + centerBias + rng() * 0.01;
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  if (best) return { x: best.x, y: best.y };
  return {
    x: Math.floor((bounds.minX + bounds.maxX) / 2),
    y: Math.floor((bounds.minY + bounds.maxY) / 2),
  };
}

function findDirectionalAnchor(chunks, center, bounds, dx, dy, wants) {
  let best = null;
  for (let r = 10; r <= 31; r++) {
    const baseX = center.x + dx * r;
    const baseY = center.y + dy * r;
    for (let oy = -7; oy <= 7; oy++) {
      for (let ox = -7; ox <= 7; ox++) {
        const x = baseX + ox;
        const y = baseY + oy;
        if (x < bounds.minX + 18 || x > bounds.maxX - 18 || y < bounds.minY + 18 || y > bounds.maxY - 18) continue;
        const t = getWorldTile(chunks, x, y);
        if (!NATURAL_BUILDABLE.has(t)) continue;
        let score = countNear(chunks, x, y, 5, (tile) => FLAT_TILES.has(tile)) * 2;
        if (wants.includes("water")) score += nearestScore(chunks, x, y, 24, (tile) => WET_TILES.has(tile)) * 8;
        if (wants.includes("mountain")) score += nearestScore(chunks, x, y, 30, (tile) => MOUNTAIN_TILES.has(tile)) * 7;
        if (wants.includes("forest")) score += nearestScore(chunks, x, y, 20, (tile) => FOREST_TILES.has(tile)) * 5;
        if (wants.includes("quiet")) score += r * 2 - nearestScore(chunks, x, y, 16, (tile) => WET_TILES.has(tile)) * 2;
        score -= countNear(chunks, x, y, 3, (tile) => WET_TILES.has(tile) || MOUNTAIN_TILES.has(tile)) * 12;
        if (!best || score > best.score) best = { x, y, score };
      }
    }
  }
  return best || { x: center.x + dx * 14, y: center.y + dy * 14 };
}

function chooseDistricts(chunks, center, bounds) {
  const byKey = {
    civic_core: { x: center.x, y: center.y },
    market_green: { x: center.x - 6, y: center.y + 2 },
    workshop_row: { x: center.x + 10, y: center.y },
    churchyard: { x: center.x, y: center.y - 10 },
  };
  return TOWN_DISTRICT_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    radius: def.radius,
    x: byKey[def.key]?.x ?? center.x,
    y: byKey[def.key]?.y ?? center.y,
  }));
}

function resourceAnchor(chunks, center, bounds, resource) {
  if (resource === "mine") return findDirectionalAnchor(chunks, center, bounds, 1, -1, ["mountain"]);
  if (resource === "forest") return findDirectionalAnchor(chunks, center, bounds, -1, -1, ["forest"]);
  if (resource === "herbs") return findDirectionalAnchor(chunks, center, bounds, -1, 1, ["forest", "water"]);
  if (resource === "waterFlat") return findDirectionalAnchor(chunks, center, bounds, -1, 1, ["water", "flat"]);
  return center;
}

function wantsScore(chunks, x, y, wants) {
  let score = 0;
  if (wants.includes("flat")) score += countNear(chunks, x, y, 4, (t) => FLAT_TILES.has(t)) * 3;
  if (wants.includes("water")) score += nearestScore(chunks, x, y, 22, (t) => WET_TILES.has(t) || WATER_EDGE_TILES.has(t)) * 9;
  if (wants.includes("mountain")) score += nearestScore(chunks, x, y, 30, (t) => MOUNTAIN_TILES.has(t)) * 8;
  if (wants.includes("forest")) score += nearestScore(chunks, x, y, 22, (t) => FOREST_TILES.has(t)) * 6;
  if (wants.includes("quiet")) score += countNear(chunks, x, y, 8, (t) => NATURAL_BUILDABLE.has(t)) - nearestScore(chunks, x, y, 12, (t) => STRUCTURE_TILES.has(t)) * 3;
  return score;
}

function canBuildOn(chunks, x, y) {
  return NATURAL_BUILDABLE.has(getWorldTile(chunks, x, y));
}

function terrainFitScore(chunks, def, anchorX, anchorY) {
  let wet = 0;
  let rough = 0;
  let natural = 0;
  let structuralWet = 0;
  let total = 0;
  for (const tile of def.tiles || []) {
    const x = anchorX + (Number(tile.dx) | 0);
    const y = anchorY + (Number(tile.dy) | 0);
    const existing = getWorldTile(chunks, x, y);
    total++;
    if (STRUCTURE_TILES.has(existing)) return null;
    if (HARD_WATER_TILES.has(existing)) return null;
    if (WET_TILES.has(existing)) {
      wet++;
      if (STRUCTURAL_STAMP_TILES.has(tile.tile)) structuralWet++;
    }
    if (MOUNTAIN_TILES.has(existing)) rough++;
    if (NATURAL_BUILDABLE.has(existing)) natural++;
  }
  if (structuralWet > 2) return null;
  if (wet > Math.max(3, Math.floor(total * 0.16))) return null;
  return natural * 2 - wet * 18 - rough * 5;
}

function canSpawnNearBuilding(chunks, x, y) {
  const tile = getWorldTile(chunks, x, y);
  return !WET_TILES.has(tile) && !MOUNTAIN_TILES.has(tile) && !STRUCTURE_TILES.has(tile);
}

function carveBuildingPad(chunks, def, anchorX, anchorY, protectedTiles) {
  const pad = footprint(def, anchorX, anchorY, 2);
  const exact = footprint(def, anchorX, anchorY, 0);
  for (const key of pad) {
    if (exact.has(key) || protectedTiles.has(key)) continue;
    const [x, y] = key.split(",").map(Number);
    const tile = getWorldTile(chunks, x, y);
    if (STRUCTURE_TILES.has(tile) || HARD_WATER_TILES.has(tile)) continue;
    if (WET_TILES.has(tile) || MOUNTAIN_TILES.has(tile) || FOREST_TILES.has(tile) || WATER_EDGE_TILES.has(tile)) {
      setChunkTile(chunks, x, y, TILE_GRASS);
    }
  }
}

function placeBuilding(chunks, bounds, plan, district, occupied, protectedTiles, seed, townCenter = null) {
  const baseDef = BUILDING_DEFS[plan.defKey || plan.key];
  if (!baseDef) return null;
  const rng = mulberry((seed ^ hashKey(plan.key)) >>> 0);
  let best = null;
  let bestRadius = Infinity;
  const searchRadius = Number.isFinite(plan.searchRadius) ? Math.max(0, Number(plan.searchRadius) | 0) : (plan.resource ? 36 : 16);
  const targetX = district.x + (Number(plan.coreDx) | 0);
  const targetY = district.y + (Number(plan.coreDy) | 0);
  const facingTarget = plan.key === "well_plaza" ? null : townCenter;
  const rotations = plan.rotations || ALL_ROTATIONS;
  for (let r = 0; r <= searchRadius; r++) {
    if (best && r > bestRadius + 2) break;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const anchorX = targetX + dx;
        const anchorY = targetY + dy;
        if (anchorX < bounds.minX + 8 || anchorX > bounds.maxX - 8 || anchorY < bounds.minY + 8 || anchorY > bounds.maxY - 8) continue;
        for (const rotation of rotations) {
          const def = rotateBuildingDef(baseDef, rotation);
          if (!canPlaceBuilding(chunks, anchorX, anchorY, def, (x, y) => occupied.has(xyKey(x, y)))) continue;
          const terrainFit = terrainFitScore(chunks, def, anchorX, anchorY);
          if (terrainFit === null) continue;
          const exact = footprint(def, anchorX, anchorY, 0);
          if (!spawnsCanLand(chunks, def, anchorX, anchorY, exact, occupied, canSpawnNearBuilding)) continue;
          const dist = Math.max(Math.abs(anchorX - targetX), Math.abs(anchorY - targetY));
          const doorOffset = doorOffsetForDef(def);
          const doorDist = Math.abs(anchorX + doorOffset.dx - district.x) + Math.abs(anchorY + doorOffset.dy - district.y);
          const score = wantsScore(chunks, anchorX, anchorY, plan.wants || [])
            + terrainFit
            - dist * 4
            - doorDist * 1.5
            + doorFacingScore(def, anchorX, anchorY, facingTarget)
            + rng() * 0.01;
          if (!best || score > best.score) {
            best = { def, anchorX, anchorY, rotation, score };
            bestRadius = r;
          }
        }
      }
    }
  }
  if (!best) return null;

  carveBuildingPad(chunks, best.def, best.anchorX, best.anchorY, protectedTiles);
  const stamped = stampBuilding(chunks, best.def, best.anchorX, best.anchorY);
  const exact = footprint(best.def, best.anchorX, best.anchorY, 0);
  const margin = footprint(best.def, best.anchorX, best.anchorY, 1);
  for (const key of margin) occupied.add(key);
  for (const key of exact) protectedTiles.add(key);
  const door = doorFor(stamped, best.anchorX, best.anchorY);
  return {
    key: plan.key,
    defKey: plan.defKey || plan.key,
    district: plan.district,
    anchorX: best.anchorX,
    anchorY: best.anchorY,
    rotation: best.rotation,
    door,
    waypoints: stamped.waypoints,
    spawns: stamped.spawns,
    shop: stamped.shop,
  };
}

function hashKey(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const ROLE_DELIVERY_CHEST = {
  farmer: "mill_chest",
  woodcutter: "lumber_chest",
  miner: "smithy_chest",
  herbalist: "herb_chest",
  fisher: "tavern_chest",
};

const DEDICATED_COTTAGE_HOME_ROLES = new Set([
  "alchemist",
  "book_vendor",
  "enchantress",
  "farmer",
  "gem_vendor",
  "general_vendor",
]);

function dedicatedHomeRoles(building) {
  const plan = BUILDING_PLANS.find((entry) => entry.key === building?.key);
  const roles = Array.isArray(plan?.roles) ? plan.roles : [];
  return roles.filter((role) => DEDICATED_COTTAGE_HOME_ROLES.has(role));
}

function addDedicatedHomeCottages(chunks, bounds, buildings, occupied, protectedTiles, seed, townCenter) {
  const homes = new Map();
  const homeRequests = buildings.flatMap((building) =>
    dedicatedHomeRoles(building).map((role) => ({ building, role }))
  );
  for (const request of homeRequests) {
    const { building, role } = request;
    const placed = placeBuilding(
      chunks,
      bounds,
      {
        key: `${building.key}_${role}_home`,
        defKey: "cottage",
        district: building.district,
        coreDx: 4,
        coreDy: 5,
        wants: ["flat"],
        roles: [],
        searchRadius: 24,
      },
      building.door || townCenter,
      occupied,
      protectedTiles,
      seed ^ hashKey(`${building.key}:${role}:home`),
      townCenter,
    );
    if (!placed) continue;
    homes.set(role, placed);
    buildings.push(placed);
  }
  return homes;
}

function findChestDropTile(chunks, chest) {
  if (!chest) return null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = chest.x + dx;
    const ny = chest.y + dy;
    const t = getWorldTile(chunks, nx, ny);
    if (t === TILE_FLOOR || t === TILE_DOOR) return { x: nx, y: ny };
  }
  return chest;
}

function indexChestPositions(chunks, buildings) {
  const out = {};
  const kinds = ["smithy_chest", "lumber_chest", "herb_chest", "tavern_chest"];
  for (const b of buildings) {
    if (!b?.spawns) continue;
    for (const kind of kinds) {
      if (!out[kind] && b.spawns[kind]) out[kind] = findChestDropTile(chunks, b.spawns[kind]);
    }
  }
  return out;
}

function addTownfolkForBuilding(chunks, building, roles, tavernDoor, chestPositions, shopkeeperHomes = null) {
  for (const role of roles) {
    const homeBuilding = shopkeeperHomes?.get(role) || null;
    const bed = homeBuilding?.spawns.home_bed
      || homeBuilding?.waypoints.resident_home
      || homeBuilding?.waypoints.front_door
      || homeBuilding?.door
      || building.spawns.home_bed
      || building.waypoints.resident_home
      || building.waypoints.front_door
      || building.door;
    const home = homeBuilding?.waypoints.resident_home
      || homeBuilding?.spawns.home_bed
      || homeBuilding?.waypoints.front_door
      || homeBuilding?.door
      || building.waypoints.resident_home
      || bed;
    const work = (role === "enchantress" ? (building.waypoints.enchantress_work || building.waypoints.vendor_work) : null)
      || building.waypoints.vendor_work
      || building.waypoints.farmer_work
      || building.waypoints.shop_door
      || building.waypoints.front_door
      || building.door;
    const chestKind = ROLE_DELIVERY_CHEST[role];
    const chest = chestKind ? chestPositions?.[chestKind] : null;
    addChunkSpawn(chunks, work.x, work.y, "townfolk", {
      townfolkId: role,
      homeX: home.x,
      homeY: home.y,
      bedX: bed.x,
      bedY: bed.y,
      workX: work.x,
      workY: work.y,
      pubX: tavernDoor?.x ?? work.x,
      pubY: tavernDoor?.y ?? work.y,
      deliverX: chest?.x ?? 0,
      deliverY: chest?.y ?? 0,
      shopDoor: building.shop?.door || null,
      shopDoorRole: building.shop?.vendorRole || role,
      shopRoom: building.shop?.room || null,
      scheduleEnabled: true,
    });
  }
}

function routePath(chunks, bounds, from, to, protectedTiles) {
  const minX = Math.max(bounds.minX, Math.min(from.x, to.x) - 54);
  const maxX = Math.min(bounds.maxX, Math.max(from.x, to.x) + 54);
  const minY = Math.max(bounds.minY, Math.min(from.y, to.y) - 54);
  const maxY = Math.min(bounds.maxY, Math.max(from.y, to.y) + 54);
  const startKey = xyKey(from.x, from.y);
  const goalKey = xyKey(to.x, to.y);
  const open = [{ x: from.x, y: from.y, f: 0, g: 0 }];
  const came = new Map();
  const cost = new Map([[startKey, 0]]);
  const closed = new Set();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let steps = 0; open.length > 0 && steps < 9000; steps++) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    if (!cur) break;
    const curKey = xyKey(cur.x, cur.y);
    if (closed.has(curKey)) continue;
    closed.add(curKey);
    if (cur.x === to.x && cur.y === to.y) break;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const nk = xyKey(nx, ny);
      const tile = getWorldTile(chunks, nx, ny);
      const endpoint = nk === goalKey || nk === startKey;
      if (!endpoint && protectedTiles.has(nk)) continue;
      if (WET_TILES.has(tile) || tile === TILE_WALL || tile === TILE_FENCE) continue;
      const step = STRUCTURE_TILES.has(tile) ? 8 : MOUNTAIN_TILES.has(tile) ? 50 : 1;
      const ng = cur.g + step;
      if (ng >= (cost.get(nk) ?? Infinity)) continue;
      cost.set(nk, ng);
      came.set(nk, xyKey(cur.x, cur.y));
      const h = Math.abs(nx - to.x) + Math.abs(ny - to.y);
      open.push({ x: nx, y: ny, g: ng, f: ng + h });
    }
  }
  if (!came.has(goalKey)) {
    // A* failed. From building door, find nearest network tile (in closed set), route to it.
    let nearestNetwork = null;
    let nearestDist = Infinity;
    for (const closedKey of closed) {
      const [cx, cy] = closedKey.split(",").map(Number);
      const dist = Math.abs(cx - to.x) + Math.abs(cy - to.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestNetwork = { x: cx, y: cy, k: closedKey };
      }
    }
    if (!nearestNetwork) return;
    // A* from building door to nearest network tile (Manhattan only)
    const fallbackOpen = [{ x: to.x, y: to.y, f: 0, g: 0 }];
    const fallbackCame = new Map();
    const fallbackCost = new Map([[xyKey(to.x, to.y), 0]]);
    const fallbackClosed = new Set();
    const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let pathFound = false;
    const targetKey = nearestNetwork.k;
    for (let steps = 0; fallbackOpen.length > 0 && steps < 5000; steps++) {
      fallbackOpen.sort((a, b) => a.f - b.f);
      const cur = fallbackOpen.shift();
      if (!cur) break;
      const curKey = xyKey(cur.x, cur.y);
      if (fallbackClosed.has(curKey)) continue;
      fallbackClosed.add(curKey);
      if (curKey === targetKey) {
        pathFound = true;
        break;
      }
      for (const [dx, dy] of dirs4) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const nk = xyKey(nx, ny);
        if (protectedTiles.has(nk)) continue;
        if (fallbackClosed.has(nk)) continue;
        const ng = cur.g + 1;
        if (ng >= (fallbackCost.get(nk) ?? Infinity)) continue;
        fallbackCost.set(nk, ng);
        fallbackCame.set(nk, curKey);
        const h = Math.abs(nx - nearestNetwork.x) + Math.abs(ny - nearestNetwork.y);
        fallbackOpen.push({ x: nx, y: ny, g: ng, f: ng + h });
      }
    }
    if (pathFound) {
      let k = targetKey;
      while (k) {
        const [x, y] = k.split(",").map(Number);
        setChunkTile(chunks, x, y, TILE_COBBLESTONE);
        k = fallbackCame.get(k);
      }
    }
    return;
  }
  let k = goalKey;
  while (k && k !== startKey) {
    const [x, y] = k.split(",").map(Number);
    const tile = getWorldTile(chunks, x, y);
    if (!protectedTiles.has(k) && NATURAL_BUILDABLE.has(tile)) setChunkTile(chunks, x, y, TILE_COBBLESTONE);
    k = came.get(k);
  }
}

function addCivicFixtures(chunks, center, buildings) {
  const cottage = buildings.find((b) => b.key === "cottage");
  const signPos = cottage ? { x: cottage.door.x - 1, y: cottage.door.y + 1 } : { x: center.x - 1, y: center.y + 1 };
  addChunkSpawn(chunks, signPos.x, signPos.y, "home_sign");
  const chestPos = cottage?.waypoints.vendor_work || cottage?.spawns.home_bed || null;
  if (chestPos) addChunkSpawn(chunks, chestPos.x + 1, chestPos.y, "home_chest");
  addChunkSpawn(chunks, center.x - 2, center.y, "message_board");
  addChunkSpawn(chunks, center.x, center.y - 2, "mailbox");
}

function addWalkwayLanterns(chunks, center, bounds, protectedTiles) {
  const occupied = new Set();
  for (const chunk of chunks.values()) {
    for (const spawn of chunk.spawns) occupied.add(xyKey(spawn.x, spawn.y));
  }

  const candidates = [];
  const radius = 40;
  for (let y = Math.max(bounds.minY, center.y - radius); y <= Math.min(bounds.maxY, center.y + radius); y++) {
    for (let x = Math.max(bounds.minX, center.x - radius); x <= Math.min(bounds.maxX, center.x + radius); x++) {
      const key = xyKey(x, y);
      if (occupied.has(key) || protectedTiles.has(key) || !NATURAL_BUILDABLE.has(getWorldTile(chunks, x, y))) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => getWorldTile(chunks, x + dx, y + dy) === TILE_COBBLESTONE)) continue;
      candidates.push({ x, y, distance: Math.abs(x - center.x) + Math.abs(y - center.y) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);

  const placed = [];
  for (const candidate of candidates) {
    if (placed.some((other) => Math.abs(candidate.x - other.x) + Math.abs(candidate.y - other.y) < 8)) continue;
    addChunkSpawn(chunks, candidate.x, candidate.y, "lantern_post");
    placed.push(candidate);
    if (placed.length === 2) break;
  }
}

function addBuildingResourceSpawns(chunks, building, buildingPlan, bounds) {
  const kind = buildingPlan.key;
  const doorX = building.door.x;
  const doorY = building.door.y;

  // Mine and herbalist nodes are overworld resources, not town fixtures. Keep
  // the town footprint open; the overworld resource pass places their working
  // stock in the hinterlands instead.
  if (kind === "mine_camp" || kind === "herbalist_hut") return;

  const spawns = [];
  if (kind === "mine_camp") {
    spawns.push(["harvest_iron_ore", (t) => MOUNTAIN_TILES.has(t), 4]);
    spawns.push(["harvest_coal_ore", (t) => MOUNTAIN_TILES.has(t), 2]);
    spawns.push(["harvest_stone", (t) => MOUNTAIN_TILES.has(t), 2]);
  } else if (kind === "woodcutter_camp") {
    spawns.push(["tree_node", (t) => t === TILE_TREE || t === TILE_PINE_FOREST || t === TILE_PALM_FOREST, 5]);
  } else if (kind === "herbalist_hut") {
    spawns.push(["harvest_herbs", (t) => FOREST_TILES.has(t) || WATER_EDGE_TILES.has(t), 4]);
    spawns.push(["harvest_moonleaf", (t) => FOREST_TILES.has(t) || WATER_EDGE_TILES.has(t), 2]);
    spawns.push(["harvest_ember_root", (t) => FOREST_TILES.has(t) || WATER_EDGE_TILES.has(t), 2]);
  } else if (kind === "fishery") {
    spawns.push(["fishing_spot", (t) => WET_TILES.has(t), 8]);
  }

  const occupied = new Set();
  for (const [spawnKind, predicate, count] of spawns) {
    let placed = 0;
    const minR = kind === "woodcutter_camp" ? 4 : 3;
    const maxR = kind === "woodcutter_camp" ? 14 : 12;
    for (let r = minR; r <= maxR && placed < count; r++) {
      for (let dx = -r; dx <= r && placed < count; dx++) {
        for (let dy = -r; dy <= r && placed < count; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = doorX + dx;
          const y = doorY + dy;
          if (x < bounds.minX + 2 || x > bounds.maxX - 2 || y < bounds.minY + 2 || y > bounds.maxY - 2) continue;
          if (occupied.has(`${x},${y}`)) continue;
          if (!predicate(getWorldTile(chunks, x, y))) continue;
          addChunkSpawn(chunks, x, y, spawnKind);
          occupied.add(`${x},${y}`);
          placed++;
        }
      }
    }

    // A camp must always have something to work. Terrain scoring puts these
    // buildings near suitable biomes, but the stamped clearing can consume all
    // matching tiles in the local work radius. In that case, place the resource
    // entity on the nearest remaining natural ground instead.
    for (let r = minR; r <= maxR && placed < count; r++) {
      for (let dx = -r; dx <= r && placed < count; dx++) {
        for (let dy = -r; dy <= r && placed < count; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = doorX + dx;
          const y = doorY + dy;
          const key = `${x},${y}`;
          if (occupied.has(key)) continue;
          if (x < bounds.minX + 2 || x > bounds.maxX - 2 || y < bounds.minY + 2 || y > bounds.maxY - 2) continue;
          const tile = getWorldTile(chunks, x, y);
          if (!NATURAL_BUILDABLE.has(tile) || STRUCTURE_TILES.has(tile) || WET_TILES.has(tile)) continue;
          addChunkSpawn(chunks, x, y, spawnKind);
          occupied.add(key);
          placed++;
        }
      }
    }
  }
}

function addResourceSpawns(chunks, center, bounds) {
  const kinds = [
    ["fishing_spot", (t) => WET_TILES.has(t)],
    ["harvest_berries", (t) => FOREST_TILES.has(t) || FLAT_TILES.has(t)],
    ["harvest_herbs", (t) => FOREST_TILES.has(t) || WATER_EDGE_TILES.has(t)],
    ["harvest_thorn_bramble", (t) => FOREST_TILES.has(t) || t === TILE_SWAMP || t === TILE_BOG],
    ["harvest_venom_fern", (t) => FOREST_TILES.has(t) || t === TILE_MARSH || t === TILE_MANGROVE],
  ];
  for (const [kind, predicate] of kinds) {
    let placed = 0;
    const targetCount = kind === "fishing_spot" ? 6 : 3;
    for (let r = 46; r <= 72 && placed < targetCount; r++) {
      for (let dx = -r; dx <= r && placed < targetCount; dx++) {
        for (let dy = -r; dy <= r && placed < targetCount; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = center.x + dx;
          const y = center.y + dy;
          if (x < bounds.minX + 2 || x > bounds.maxX - 2 || y < bounds.minY + 2 || y > bounds.maxY - 2) continue;
          if (!predicate(getWorldTile(chunks, x, y))) continue;
          let nearStruct = false;
          for (let ox = -3; ox <= 3 && !nearStruct; ox++) {
            for (let oy = -3; oy <= 3 && !nearStruct; oy++) {
              if (STRUCTURE_TILES.has(getWorldTile(chunks, x + ox, y + oy))) nearStruct = true;
            }
          }
          if (nearStruct) continue;
          addChunkSpawn(chunks, x, y, kind);
          placed++;
        }
      }
    }
  }
}

export function planTownPlacement(chunks, bounds, seed) {
  const center = chooseTownCenter(chunks, bounds, seed);
  const districts = chooseDistricts(chunks, center, bounds);
  const byDistrict = Object.fromEntries(districts.map((district) => [district.key, district]));
  const resources = {
    mine: resourceAnchor(chunks, center, bounds, "mine"),
    forest: resourceAnchor(chunks, center, bounds, "forest"),
    herbs: resourceAnchor(chunks, center, bounds, "herbs"),
    waterFlat: resourceAnchor(chunks, center, bounds, "waterFlat"),
  };
  return { center, districts, byDistrict, resources, seed };
}

// `tick` is an optional async callback (label) => Promise. Called between
// stages so the loading panel can update its status line and the browser can
// paint. Async return type is only used when tick is provided; sync callers
// can still await the returned Promise.
export async function applyTownPlacement(chunks, bounds, seed, tick = null) {
  const _tick = typeof tick === 'function' ? tick : null;
  const plan = planTownPlacement(chunks, bounds, seed);
  if (_tick) await _tick(`Surveying town districts at (${plan.center.x}, ${plan.center.y})`);
  const occupied = new Set();
  const protectedTiles = new Set();
  const buildings = [];

  for (const buildingPlan of BUILDING_PLANS) {
    const district = buildingPlan.resource
      ? (plan.resources[buildingPlan.resource] || plan.byDistrict[buildingPlan.district] || plan.districts[0])
      : (plan.byDistrict[buildingPlan.district] || plan.districts[0]);
    const placed = placeBuilding(chunks, bounds, buildingPlan, district, occupied, protectedTiles, seed, plan.center);
    if (placed) {
      buildings.push(placed);
      addBuildingResourceSpawns(chunks, placed, buildingPlan, bounds);
      if (_tick) await _tick(`Placed ${placed.key} at (${placed.door?.x ?? '?'}, ${placed.door?.y ?? '?'})`);
    }
  }

  const tavern = buildings.find((b) => b.key === "tavern");
  const dedicatedHomes = addDedicatedHomeCottages(chunks, bounds, buildings, occupied, protectedTiles, seed, plan.center);
  const chestPositions = indexChestPositions(chunks, buildings);
  if (_tick) await _tick(`Settling ${buildings.length} townsfolk into homes`);
  for (const building of buildings) {
    const def = BUILDING_PLANS.find((entry) => entry.key === building.key);
    addTownfolkForBuilding(chunks, building, def?.roles || [], tavern?.door || null, chestPositions, dedicatedHomes);
  }

  if (_tick) await _tick(`Raising civic fixtures (well, signs, fountain)`);
  addCivicFixtures(chunks, plan.center, buildings);

  const civic = plan.byDistrict.civic_core || plan.districts[0];
  const routeCenter = { x: civic.x, y: civic.y };
  if (_tick) await _tick(`Routing roads between ${plan.districts.length} districts`);
  for (const district of plan.districts) routePath(chunks, bounds, routeCenter, district, protectedTiles);
  if (_tick) await _tick(`Routing footpaths to ${buildings.length} buildings`);
  for (const building of buildings) {
    const district = plan.byDistrict[building.district] || civic;
    routePath(chunks, bounds, district, building.door, protectedTiles);
  }
  for (const building of buildings) {
    const def = BUILDING_PLANS.find((entry) => entry.key === building.key);
    if (!def?.supplies) continue;
    const consumer = buildings.find((entry) => entry.key === def.supplies);
    if (consumer) routePath(chunks, bounds, building.door, consumer.door, protectedTiles);
  }

  addWalkwayLanterns(chunks, plan.center, bounds, protectedTiles);

  if (_tick) await _tick(`Sowing resource spawns around the town`);
  addResourceSpawns(chunks, plan.center, bounds);

  return {
    center: plan.center,
    districts: plan.districts,
    buildings,
  };
}
