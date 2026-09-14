// rules/environment/dungeon/overworld.js
// Deterministic depth-0 overworld generation (Perlin/fBM terrain + home clearing).

import { perlin2, buildPermutation, fbm01 } from "./generators/noise.js";
import { LANDMARK_DEFS } from "../../data/buildings/buildingRegistry.js";
import { applyTownPlacement } from "./townPlacement.js";
import { stampBuilding } from "./stampBuilding.js";
import { pickSpecificMonster } from "./tables.js";
import { getEncountersByKind } from "../../data/encounters.js";
import { exportRoofedChunk } from "./tileMap.js";
import {
  CHUNK_SIZE,
  TILE_FLOOR,
  TILE_WALL,
  TILE_DOOR,
  TILE_STAIR_DOWN,
  TILE_GRASS,
  TILE_GRASS_A,
  TILE_GRASS_C,
  TILE_GRASS_D,
  TILE_WATER,
  TILE_WATER_DEEP,
  TILE_MOUNTAIN,
  TILE_MOUNTAIN_B,
  TILE_MOUNTAIN_C,
  TILE_TREE,
  TILE_SHALLOW_WATER,
  TILE_FARMLAND,
  TILE_FENCE,
  TILE_COBBLESTONE,
  TILE_BEACH,
  TILE_MARSH,
  TILE_SWAMP,
  TILE_BOG,
  TILE_SAND_DUNES,
  TILE_MUD,
  TILE_TIDAL_FLAT,
  TILE_ROCKY_SHORE,
  TILE_KELP_FOREST,
  TILE_SALT_MARSH,
  TILE_SHINGLE,
  TILE_SEAGRASS,
  TILE_MOORLAND,
  TILE_SCRUBLAND,
  TILE_BADLANDS,
  TILE_GRAVEL,
  TILE_PINE_FOREST,
  TILE_PALM_FOREST,
  TILE_MANGROVE,
  TILE_CORAL_REEF,
} from "./constants.js";

export const OVERWORLD_EXTENT = Object.freeze({
  minCX: -3,
  maxCX: 3,
  minCY: -3,
  maxCY: 3,
});

function chunkKey(cx, cy) { return `${cx},${cy}`; }

/**
 * Carve ponds and lakes with irregular Perlin-shaped boundaries.
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} minX
 * @param {number} maxX
 * @param {number} minY
 * @param {number} maxY
 * @param {number} homeX
 * @param {number} homeY
 * @param {number} seed
 * @param {Uint8Array} perm
 */
function carvePondsAndLakes(chunks, minX, maxX, minY, maxY, homeX, homeY, seed, perm) {
  const pondCount = 6;
  let rngSeed = seed;
  function nextRng() {
    rngSeed = (rngSeed * 1103515245 + 12345) >>> 0;
    return (rngSeed / 0x100000000);
  }

  for (let pondIdx = 0; pondIdx < pondCount; pondIdx++) {
    // Random position, avoiding center
    let cx, cy;
    let attempts = 0;
    do {
      cx = minX + Math.floor(nextRng() * (maxX - minX + 1));
      cy = minY + Math.floor(nextRng() * (maxY - minY + 1));
      attempts++;
    } while (Math.sqrt((cx - homeX) ** 2 + (cy - homeY) ** 2) < 50 && attempts < 5);
    if (attempts >= 5) continue;

    // Size: lakes 7-10, ponds 3-6
    const baseRadius = pondIdx < 2 ? 7 + Math.floor(nextRng() * 4) : 3 + Math.floor(nextRng() * 4);
    const pondSeed = seed + pondIdx * 599;

    // Fill with Perlin-warped boundary
    for (let py = cy - baseRadius - 2; py <= cy + baseRadius + 2; py++) {
      for (let px = cx - baseRadius - 2; px <= cx + baseRadius + 2; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Perlin radial noise for jagged edges
        const angle = Math.atan2(dy, dx);
        const perlinRadial = perlin2(Math.cos(angle * 3) * 0.5, Math.sin(angle * 3) * 0.5, perm);
        const effectiveRadius = baseRadius * (1 + perlinRadial * 0.4);

        if (dist <= effectiveRadius) {
          const t = getWorldTile(chunks, px, py);
          if (t === TILE_WATER_DEEP || t === TILE_WATER) continue; // don't override existing water

          // Depth zones: center deep, edge shallow/mud
          if (dist < effectiveRadius * 0.6) {
            setWorldTile(chunks, px, py, TILE_WATER);
          } else if (dist < effectiveRadius * 0.85) {
            // Shallow zone with noise variation
            const depthNoise = perlin2(px * 0.2, py * 0.2, perm);
            setWorldTile(chunks, px, py, depthNoise > 0.3 ? TILE_WATER : TILE_SHALLOW_WATER);
          } else {
            setWorldTile(chunks, px, py, TILE_MUD);
          }
        }
      }
    }
  }
}

/**
 * Carve rivers across the overworld with Perlin-guided steering and variable width.
 * Rivers originating from high elevation carve deeper (fjords).
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} minX
 * @param {number} maxX
 * @param {number} minY
 * @param {number} maxY
 * @param {number} seed
 * @param {Uint8Array} perm
 */
function carveRivers(chunks, minX, maxX, minY, maxY, seed, perm) {
  const riverCount = 4;
  let rngSeed = seed;
  function nextRng() {
    rngSeed = (rngSeed * 1103515245 + 12345) >>> 0;
    return (rngSeed / 0x100000000);
  }

  for (let riverIdx = 0; riverIdx < riverCount; riverIdx++) {
    // Pick high-elevation starting point (mountain source)
    let x, y;
    let attempts = 0;
    do {
      x = minX + Math.floor(nextRng() * (maxX - minX + 1));
      y = minY + Math.floor(nextRng() * (maxY - minY + 1));
      attempts++;
    } while (attempts < 10 && getWorldTile(chunks, x, y) < TILE_MOUNTAIN); // prefer mountains
    if (attempts >= 10) continue; // skip if no mountain found

    // Steering angle: flow toward ocean (low elev)
    let angle = Math.atan2(minY - y, minX - x) + (nextRng() - 0.5) * 0.5;
    const riverSeed = seed + riverIdx * 997;
    let riverLength = 0;

    // Carve until we hit ocean or boundary
    for (let step = 0; step < 500; step++) {
      if (x < minX - 5 || x > maxX + 5 || y < minY - 5 || y > maxY + 5) break;
      riverLength++;

      const tile = getWorldTile(chunks, x, y);
      if (tile === TILE_WATER_DEEP) break; // stop at deep ocean
      if (tile === TILE_WATER) break; // stop at shallow water (already carved)

      // Perlin-guided steering with downslope bias
      const steer = perlin2((x + riverSeed) * 0.08, (y + riverSeed) * 0.08, perm);
      angle += (steer - 0.5) * 0.6;

      // Width increases with length (wider as river flows) + noise variation
      const widthNoise = perlin2((x + riverSeed + 2000) * 0.1, (y + riverSeed + 2000) * 0.1, perm);
      const baseFjordWidth = 2 + (riverLength / 100) * 2; // grows as river flows
      const riverWidth = Math.max(2, Math.min(6, Math.floor(baseFjordWidth + widthNoise * 1.5)));

      // Fill river footprint (circular brush) — carve through mountains for fjords
      for (let ry = -riverWidth; ry <= riverWidth; ry++) {
        for (let rx = -riverWidth; rx <= riverWidth; rx++) {
          const dist = Math.sqrt(rx * rx + ry * ry);
          if (dist <= riverWidth) {
            const tx = Math.round(x) + rx;
            const ty = Math.round(y) + ry;
            const t = getWorldTile(chunks, tx, ty);

            // Center: always water (carves through mountains for fjords)
            if (dist < riverWidth * 0.6) {
              if (t !== TILE_WATER_DEEP) {
                setWorldTile(chunks, tx, ty, TILE_WATER);
              }
            } else if (dist <= riverWidth) {
              // River bank: mud/beach, but preserve some rocky areas
              if (t !== TILE_WATER_DEEP && t !== TILE_WATER && t !== TILE_WATER_DEEP) {
                const bankChoice = perlin2(tx * 0.15, ty * 0.15, perm);
                if (bankChoice > 0.4) {
                  setWorldTile(chunks, tx, ty, t === TILE_GRASS || t === TILE_GRASS_A || t === TILE_GRASS_C || t === TILE_GRASS_D ? TILE_MUD : TILE_BEACH);
                } else if (t === TILE_MOUNTAIN || t === TILE_MOUNTAIN_B || t === TILE_MOUNTAIN_C) {
                  setWorldTile(chunks, tx, ty, TILE_ROCKY_SHORE); // rocky fjord walls
                }
              }
            }
          }
        }
      }

      // Step in steering direction
      x += Math.cos(angle);
      y += Math.sin(angle);
    }
  }
}

/**
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} x
 * @param {number} y
 * @param {number} tile
 */
export function setWorldTile(chunks, x, y, tile) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const chunk = chunks.get(chunkKey(cx, cy));
  if (!chunk) return;
  const lx = x - cx * CHUNK_SIZE;
  const ly = y - cy * CHUNK_SIZE;
  if (lx < 0 || ly < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE) return;
  chunk.tiles[ly * CHUNK_SIZE + lx] = tile;
}

/**
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} cx
 * @param {number} cy
 */
function getChunk(chunks, cx, cy) {
  return chunks.get(chunkKey(cx, cy));
}

/**
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} x
 * @param {number} y
 */
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

/**
 * Force irregular ocean at map edges using multi-scale Perlin noise.
 * Creates jagged coastlines with fractal detail.
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} minX
 * @param {number} maxX
 * @param {number} minY
 * @param {number} maxY
 * @param {Uint8Array} perm
 */
function forceEdgeOcean(chunks, minX, maxX, minY, maxY, worldSeed, perm) {
  const baseThickness = 18;
  const wobbleFreq = 0.055; // broad shoreline curves
  const wobbleAmp = 14;
  const fractalFreq = 0.18; // smaller coves and points
  const fractalAmp = 5;

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const distFromLeft = x - minX;
      const distFromRight = maxX - x;
      const distFromTop = y - minY;
      const distFromBottom = maxY - y;

      // Multi-scale Perlin wobble: low freq + high freq for fractal detail
      const leftWobble = (perlin2((y + 1000) * wobbleFreq, 0, perm) * wobbleAmp
        + perlin2((y + 5000) * fractalFreq, 0, perm) * fractalAmp);
      const rightWobble = (perlin2((y + 2000) * wobbleFreq, 0, perm) * wobbleAmp
        + perlin2((y + 6000) * fractalFreq, 0, perm) * fractalAmp);
      const topWobble = (perlin2((x + 3000) * wobbleFreq, 0, perm) * wobbleAmp
        + perlin2((x + 7000) * fractalFreq, 0, perm) * fractalAmp);
      const bottomWobble = (perlin2((x + 4000) * wobbleFreq, 0, perm) * wobbleAmp
        + perlin2((x + 8000) * fractalFreq, 0, perm) * fractalAmp);

      const leftThresh = baseThickness + leftWobble;
      const rightThresh = baseThickness + rightWobble;
      const topThresh = baseThickness + topWobble;
      const bottomThresh = baseThickness + bottomWobble;

      const oceanDepth = Math.max(
        leftThresh - distFromLeft,
        rightThresh - distFromRight,
        topThresh - distFromTop,
        bottomThresh - distFromBottom,
      );

      if (oceanDepth > 2) {
        setWorldTile(chunks, x, y, TILE_WATER_DEEP);
      } else if (oceanDepth > 0) {
        setWorldTile(chunks, x, y, TILE_WATER);
      }
    }
  }

  // Bleed beach strip inward from water edges
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const tile = getWorldTile(chunks, x, y);
      if (tile !== TILE_WATER_DEEP) {
        // Check if adjacent to ocean; if so, replace with beach if terrain
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const near = getWorldTile(chunks, x + dx, y + dy);
            if (near === TILE_WATER_DEEP || near === TILE_WATER) {
              if (tile !== TILE_WATER && tile !== TILE_WATER_DEEP) {
                setWorldTile(chunks, x, y, TILE_BEACH);
              }
              break;
            }
          }
        }
      }
    }
  }
}

/**
 * Generate diverse overworld terrain with multiple biomes.
 * Elevation determines base terrain; moisture adds forests, marshes, swamps.
 * Elevation is biased by a global gradient in the direction of gradientDir.
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} cx
 * @param {number} cy
 * @param {number} seed
 * @param {Uint8Array} perm
 * @param {string} gradientDir - 'north', 'south', 'east', 'west'; gradient climbs toward this direction
 * @param {number} minX
 * @param {number} maxX
 * @param {number} minY
 * @param {number} maxY
 */
function fillChunkTerrain(chunks, cx, cy, seed, perm, gradientDir, minX, maxX, minY, maxY) {
  const chunk = getChunk(chunks, cx, cy);
  if (!chunk) return;
  const elevCfg = { scale: 0.035, oct: 4, persist: 0.55, lacun: 2.0 };
  const moistCfg = { scale: 0.060, oct: 3, persist: 0.55, lacun: 2.0 };
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  const saltX = ((seed ^ 0xA53) & 1023) - 512;
  const saltY = ((seed ^ 0xC17) & 1023) - 512;

  // Compute gradient bias: 0.3 elevation difference across world
  const worldWidth = maxX - minX;
  const worldHeight = maxY - minY;
  const gradientScale = 0.3;

  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = ox + lx;
      const wy = oy + ly;

      // Base elevation noise
      let elev = fbm01(wx + saltX, wy + saltY, perm, elevCfg);

      // Apply directional gradient (0=low, 1=high toward gradient direction)
      let gradient = 0;
      if (gradientDir === 'north') gradient = (maxY - wy) / worldHeight;
      else if (gradientDir === 'south') gradient = (wy - minY) / worldHeight;
      else if (gradientDir === 'east') gradient = (maxX - wx) / worldWidth;
      else if (gradientDir === 'west') gradient = (wx - minX) / worldWidth;

      elev = elev * 0.7 + gradient * gradientScale;
      elev = Math.max(0, Math.min(1, elev)); // clamp to [0,1]

      const ridge = Math.pow(elev, 1.35);
      const moist = fbm01(wx + 1000 + saltX, wy - 777 + saltY, perm, moistCfg);

      let tile;
      const gv = (perlin2((wx + 2000) * 0.28, (wy + 3000) * 0.28, perm) + 1) * 0.5;

      // WATER ZONES
      if (elev < 0.18) {
        // Deep ocean
        tile = moist > 0.70 ? TILE_KELP_FOREST : TILE_WATER_DEEP;
      }
      else if (elev < 0.26) {
        // Shallow water + variants
        tile = moist > 0.80 ? TILE_SEAGRASS : TILE_WATER;
      }
      // COASTAL ZONES (highly varied, tight band)
      else if (elev < 0.30) {
        if (ridge > 0.55) tile = TILE_ROCKY_SHORE;
        else if (moist > 0.80) tile = TILE_TIDAL_FLAT;
        else if (moist > 0.75) tile = TILE_MUD;
        else tile = TILE_SHINGLE;
      }
      // BEACH ZONE (tight coastal strip)
      else if (elev < 0.37) {
        if (moist > 0.65) tile = TILE_SALT_MARSH;
        else if (gv > 0.7) tile = TILE_SHINGLE;
        else tile = TILE_BEACH;
      }
      // MOUNTAINS
      else if (ridge > 0.78) {
        tile = TILE_MOUNTAIN_C;
      } else if (ridge > 0.65) {
        tile = TILE_MOUNTAIN_B;
      } else if (ridge > 0.54) {
        tile = TILE_MOUNTAIN;
      }
      // DESERT/DUNES (coastal drylands only)
      else if (moist < 0.28 && elev >= 0.37 && elev <= 0.48) {
        tile = gv > 0.6 ? TILE_BADLANDS : TILE_SAND_DUNES;
      }
      // WETLANDS (sparse, not dominant)
      else if (moist > 0.90 && elev >= 0.40 && elev <= 0.55) {
        tile = TILE_BOG;
      }
      else if (moist > 0.84 && elev >= 0.42 && elev <= 0.58) {
        tile = TILE_SWAMP;
      }
      else if (moist > 0.76 && elev >= 0.44 && elev <= 0.60) {
        tile = TILE_MARSH;
      }
      // MANGROVE: coastal forest transition
      else if (moist > 0.65 && elev >= 0.38 && elev <= 0.50) {
        tile = TILE_MANGROVE;
      }
      // FORESTS (varied types)
      else if (moist > 0.65 && elev >= 0.55 && elev <= 0.72) {
        if (elev > 0.70) tile = TILE_PINE_FOREST;
        else if (moist > 0.75) tile = TILE_PALM_FOREST;
        else tile = TILE_TREE;
      }
      // MOORLAND & SCRUBLAND (arid grassland variants)
      else if (moist < 0.50 && elev >= 0.52 && elev <= 0.65) {
        tile = moist < 0.35 ? TILE_SCRUBLAND : TILE_MOORLAND;
      }
      // DEFAULT GRASSLANDS with texture
      else {
        if (gv < 0.20) tile = TILE_GRASS_A;
        else if (gv < 0.45) tile = TILE_GRASS;
        else if (gv < 0.70) tile = TILE_GRASS_C;
        else if (gv < 0.90) tile = TILE_GRASS_D;
        else tile = TILE_GRAVEL;
      }
      chunk.tiles[ly * CHUNK_SIZE + lx] = tile;
    }
  }
}

/**
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 */
function fillDisk(chunks, cx, cy, radius) {
  const rr = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rr) setWorldTile(chunks, x, y, TILE_GRASS);
    }
  }
}

/**
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function carvePath(chunks, x0, y0, x1, y1) {
  let x = x0;
  let y = y0;
  while (x !== x1) {
    setWorldTile(chunks, x, y, TILE_FLOOR);
    x += x < x1 ? 1 : -1;
  }
  while (y !== y1) {
    setWorldTile(chunks, x, y, TILE_FLOOR);
    y += y < y1 ? 1 : -1;
  }
  setWorldTile(chunks, x1, y1, TILE_FLOOR);
}

/**
 * Carve an orthogonal path that resolves vertical travel before horizontal travel.
 * Useful when a straight horizontal-first route would slice through an adjacent structure shell.
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function carvePathVerticalFirst(chunks, x0, y0, x1, y1) {
  let x = x0;
  let y = y0;
  while (y !== y1) {
    setWorldTile(chunks, x, y, TILE_FLOOR);
    y += y < y1 ? 1 : -1;
  }
  while (x !== x1) {
    setWorldTile(chunks, x, y, TILE_FLOOR);
    x += x < x1 ? 1 : -1;
  }
  setWorldTile(chunks, x1, y1, TILE_FLOOR);
}

/**
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} x
 * @param {number} y
 * @param {string} kind
 * @param {Record<string, any>} [params]
 */
export function addSpawn(chunks, x, y, kind, params = {}) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const chunk = chunks.get(chunkKey(cx, cy));
  if (!chunk) return;
  chunk.spawns.push({ x, y, kind, params });
}

function setStructureTile(chunks, x, y, tile, roofed = false) {
  setWorldTile(chunks, x, y, tile);
  if (roofed) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const chunk = chunks.get(chunkKey(cx, cy));
    if (chunk?.roofed) {
      const lx = x - cx * CHUNK_SIZE;
      const ly = y - cy * CHUNK_SIZE;
      if (lx >= 0 && ly >= 0 && lx < CHUNK_SIZE && ly < CHUNK_SIZE) {
        chunk.roofed[ly * CHUNK_SIZE + lx] = 1;
      }
    }
  }
}

/**
 * Paint a wall-bounded structure from explicit interior floor cells.
 * The wall ring is inferred from the interior, so irregular plans stay easy to author.
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {Array<{x:number, y:number}>} floorCells
 * @param {{ x:number, y:number }} door
 */
function paintStructure(chunks, floorCells, door) {
  const floorKeys = new Set(floorCells.map((cell) => xyKey(cell.x, cell.y)));
  const wallKeys = new Set();

  for (const cell of floorCells) {
    setStructureTile(chunks, cell.x, cell.y, TILE_FLOOR, true);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = cell.x + dx;
        const y = cell.y + dy;
        const key = xyKey(x, y);
        if (floorKeys.has(key)) continue;
        if (door.x === x && door.y === y) continue;
        wallKeys.add(key);
      }
    }
  }

  for (const key of wallKeys) {
    const [x, y] = key.split(",").map(Number);
    setStructureTile(chunks, x, y, TILE_WALL, true);
  }
  setStructureTile(chunks, door.x, door.y, TILE_DOOR, true);
}

/**
 * Build a compact cottage with a door and bed.
 * Returns interior anchors for assigning residents.
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} x0
 * @param {number} y0
 * @param {"north"|"south"} doorSide
 * @returns {{ doorX:number, doorY:number, sleepX:number, sleepY:number, standX:number, standY:number }}
 */
function buildCottage(chunks, x0, y0, doorSide = "south") {
  const floorCells = [];
  for (let y = y0 + 1; y <= y0 + 3; y++) {
    for (let x = x0 + 1; x <= x0 + 3; x++) {
      floorCells.push({ x, y });
    }
  }
  const doorX = x0 + 2;
  const doorY = doorSide === "north" ? y0 : y0 + 4;
  paintStructure(chunks, floorCells, { x: doorX, y: doorY });

  const sleepX = x0 + 1;
  const sleepY = y0 + 2;
  const standX = x0 + 2;
  const standY = y0 + 2;
  addSpawn(chunks, sleepX, sleepY, "home_bed");
  return { doorX, doorY, sleepX, sleepY, standX, standY };
}

function isOutdoorGroundTile(tile) {
  return tile === TILE_GRASS
      || tile === TILE_GRASS_A
      || tile === TILE_GRASS_C
      || tile === TILE_GRASS_D;
}

/**
 * Keep natural gatherables on exterior ground instead of under later-built structures.
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {number} hintX
 * @param {number} hintY
 * @param {number} maxR
 */
function findOutdoorSpawnTile(chunks, hintX, hintY, maxR = 10, predicate = null) {
  for (let r = 0; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = hintX + dx;
        const y = hintY + dy;
        if (predicate && !predicate(x, y)) continue;
        if (isOutdoorGroundTile(getWorldTile(chunks, x, y))) {
          return { x, y };
        }
      }
    }
  }
  return null;
}

/**
 * @param {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} chunks
 * @param {{ x:number, y:number }} pos
 * @param {string} kind
 */
function addOutdoorSpawn(chunks, pos, kind, predicate = null) {
  const target = findOutdoorSpawnTile(chunks, pos.x, pos.y, 10, predicate) ?? pos;
  if (!isOutdoorGroundTile(getWorldTile(chunks, target.x, target.y))) {
    setWorldTile(chunks, target.x, target.y, TILE_GRASS);
  }
  addSpawn(chunks, target.x, target.y, kind);
}

const BIOME = {
  MOUNTAIN: new Set([TILE_MOUNTAIN, TILE_MOUNTAIN_B, TILE_MOUNTAIN_C, TILE_BADLANDS, TILE_GRAVEL]),
  FOREST: new Set([TILE_TREE, TILE_PINE_FOREST, TILE_PALM_FOREST, TILE_MANGROVE]),
  WETLAND: new Set([TILE_MARSH, TILE_SWAMP, TILE_BOG, TILE_MUD, TILE_TIDAL_FLAT, TILE_SALT_MARSH]),
  COASTAL: new Set([TILE_BEACH, TILE_SHINGLE, TILE_ROCKY_SHORE, TILE_SAND_DUNES]),
  GRASSLAND: new Set([TILE_GRASS, TILE_GRASS_A, TILE_GRASS_C, TILE_GRASS_D, TILE_MOORLAND, TILE_SCRUBLAND]),
  WATER: new Set([TILE_WATER, TILE_WATER_DEEP, TILE_SHALLOW_WATER, TILE_KELP_FOREST, TILE_SEAGRASS, TILE_CORAL_REEF]),
};

const WALKABLE_OVERWORLD_SPAWN_TILES = new Set([
  TILE_FLOOR,
  TILE_DOOR,
  TILE_STAIR_DOWN,
  TILE_GRASS,
  TILE_GRASS_A,
  TILE_GRASS_C,
  TILE_GRASS_D,
  TILE_SHALLOW_WATER,
  TILE_FARMLAND,
  TILE_COBBLESTONE,
  TILE_BEACH,
  TILE_MARSH,
  TILE_SWAMP,
  TILE_BOG,
  TILE_SAND_DUNES,
  TILE_MUD,
  TILE_TIDAL_FLAT,
  TILE_ROCKY_SHORE,
  TILE_SALT_MARSH,
  TILE_SHINGLE,
  TILE_MOORLAND,
  TILE_SCRUBLAND,
  TILE_BADLANDS,
  TILE_GRAVEL,
  TILE_PINE_FOREST,
  TILE_PALM_FOREST,
  TILE_MANGROVE,
]);

function getTileBiomeId(tile) {
  for (const [biomeId, tiles] of Object.entries(BIOME)) {
    if (tiles.has(tile)) return biomeId;
  }
  return null;
}

function isOverworldSpawnTile(tile) {
  return WALKABLE_OVERWORLD_SPAWN_TILES.has(tile);
}

function hasSpawnAt(chunks, x, y) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const chunk = chunks.get(chunkKey(cx, cy));
  if (!chunk || !Array.isArray(chunk.spawns)) return false;
  return chunk.spawns.some((spawn) => (spawn.x | 0) === (x | 0) && (spawn.y | 0) === (y | 0));
}

function addSpawnIfOpen(chunks, x, y, kind, params = {}) {
  if (hasSpawnAt(chunks, x, y)) return false;
  if (!isOverworldSpawnTile(getWorldTile(chunks, x, y))) return false;
  addSpawn(chunks, x, y, kind, params);
  return true;
}

function addWaterSpawnIfOpen(chunks, x, y, kind, params = {}) {
  if (hasSpawnAt(chunks, x, y)) return false;
  const biomeId = getTileBiomeId(getWorldTile(chunks, x, y));
  if (biomeId !== 'WATER') return false;
  addSpawn(chunks, x, y, kind, params);
  return true;
}

function createLocalRng(seed) {
  return new (function(seedValue) {
    this.seed = seedValue >>> 0;
    this.next = function() {
      this.seed = (this.seed * 1103515245 + 12345) >>> 0;
      return this.seed / 4294967296;
    };
  })(seed);
}

function collectLandmarkCandidates(chunks, townCenter, bounds, biomeIds) {
  const result = [];
  const wanted = new Set(biomeIds);
  const townExclusionRadiusSq = 52 * 52;

  for (let x = bounds.minX + 12; x <= bounds.maxX - 12; x++) {
    for (let y = bounds.minY + 12; y <= bounds.maxY - 12; y++) {
      const dx = x - townCenter.x;
      const dy = y - townCenter.y;
      if (dx * dx + dy * dy < townExclusionRadiusSq) continue;
      if (hasSpawnAt(chunks, x, y)) continue;
      const tile = getWorldTile(chunks, x, y);
      if (!isOverworldSpawnTile(tile)) continue;
      const biomeId = getTileBiomeId(tile);
      if (wanted.has(biomeId)) result.push({ x, y });
    }
  }

  return result;
}

function pickSeparatedCandidate(candidates, rng, placed, minDistanceSq = 28 * 28) {
  if (!candidates.length) return null;
  const start = Math.floor(rng.next() * candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[(start + i) % candidates.length];
    let tooClose = false;
    for (const other of placed) {
      const dx = candidate.x - other.x;
      const dy = candidate.y - other.y;
      if (dx * dx + dy * dy < minDistanceSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) return candidate;
  }
  return null;
}

async function placeOverworldLandmarks(chunks, townCenter, bounds, worldSeed, tick = null) {
  const _tick = typeof tick === 'function' ? tick : null;
  const rng = createLocalRng((worldSeed ^ 0x1a4d0a9) >>> 0);
  const placed = [];
  const specs = [
    { id: "ruined_watchtower", biomes: ["MOUNTAIN", "GRASSLAND"] },
    { id: "wayside_shrine", biomes: ["GRASSLAND", "FOREST"] },
    { id: "abandoned_camp", biomes: ["FOREST", "GRASSLAND", "COASTAL"] },
    { id: "strange_grove", biomes: ["FOREST", "WETLAND"] },
    { id: "bear_cave", biomes: ["MOUNTAIN", "FOREST"] },
    { id: "bat_cave", biomes: ["MOUNTAIN", "FOREST"] },
    { id: "human_mine", biomes: ["MOUNTAIN"] },
    { id: "bandit_hideout", biomes: ["FOREST", "GRASSLAND", "COASTAL"] },
    { id: "old_well", biomes: ["GRASSLAND", "WETLAND"] },
    { id: "collapsed_cellar", biomes: ["GRASSLAND", "FOREST"] },
    { id: "wolf_den", biomes: ["FOREST", "GRASSLAND"] },
    { id: "forgotten_shrine", biomes: ["GRASSLAND", "FOREST", "WETLAND"] },
  ];

  for (const spec of specs) {
    const candidates = collectLandmarkCandidates(chunks, townCenter, bounds, spec.biomes);
    const center = pickSeparatedCandidate(candidates, rng, placed);
    if (!center) continue;
    const def = LANDMARK_DEFS[spec.id];
    if (!def) continue;
    stampBuilding(chunks, def, center.x, center.y);
    placed.push({ ...center, id: spec.id });
    if (_tick) await _tick(`Raised ${spec.id.replaceAll("_", " ")}`);
  }
}

async function spawnOverworldCreatures(chunks, townCenter, bounds, worldSeed, tick = null) {
  const _tick = typeof tick === 'function' ? tick : null;
  const TOWN_EXCLUSION_RADIUS_SQ = 45 * 45; // covers districts up to r=36 + footprint

  const rng = new (function(seed) {
    this.seed = seed >>> 0;
    this.next = function() {
      this.seed = (this.seed * 1103515245 + 12345) >>> 0;
      return this.seed / 4294967296;
    };
  })(worldSeed);

  // Collect candidate tiles per biome
  const biomePositions = {};
  for (const [biomeId, _] of Object.entries(BIOME)) {
    biomePositions[biomeId] = [];
  }

  for (let x = bounds.minX + 5; x <= bounds.maxX - 5; x++) {
    for (let y = bounds.minY + 5; y <= bounds.maxY - 5; y++) {
      // Skip town exclusion zone
      const dx = x - townCenter.x;
      const dy = y - townCenter.y;
      if (dx * dx + dy * dy < TOWN_EXCLUSION_RADIUS_SQ) continue;

      const tile = getWorldTile(chunks, x, y);
      if (!isOverworldSpawnTile(tile)) continue;
      const biomeId = getTileBiomeId(tile);
      if (biomeId) {
        biomePositions[biomeId].push({ x, y });
      }
    }
  }

  // Spawn each creature type
  for (const creatureType of getEncountersByKind("overworld_population")) {
    let placed = 0;

    // Collect all candidate positions for this creature's biomes
    const candidates = [];
    for (const biomeId of creatureType.biomes) {
      candidates.push(...biomePositions[biomeId]);
    }

    if (candidates.length === 0) continue;

    // Pick ~2-3 anchor clusters per creature type
    const numClusters = Math.max(1, Math.floor(creatureType.count / 2));
    const anchors = [];
    for (let i = 0; i < numClusters && anchors.length < numClusters; i++) {
      const idx = Math.floor(rng.next() * candidates.length);
      anchors.push(candidates[idx]);
    }

    // Compute monster params once for all placements
    const monsterParams = pickSpecificMonster(creatureType.creatureId, 0);
    if (!monsterParams) continue; // creature ID doesn't exist

    // Spawn creatures around each anchor
    for (const anchor of anchors) {
      const perCluster = Math.ceil(creatureType.count / numClusters);
      for (let s = 0; s < perCluster && placed < creatureType.count; s++) {
        let attempts = 0;
        while (attempts < 10) {
          const angle = rng.next() * Math.PI * 2;
          const dist = rng.next() * creatureType.clusterR;
          const x = Math.round(anchor.x + Math.cos(angle) * dist);
          const y = Math.round(anchor.y + Math.sin(angle) * dist);

          const tile = getWorldTile(chunks, x, y);
          if (!isOverworldSpawnTile(tile)) {
            attempts++;
            continue;
          }
          const biomeId = getTileBiomeId(tile);
          if (creatureType.biomes.includes(biomeId) && addSpawnIfOpen(chunks, x, y, 'monster', monsterParams)) {
            placed++;
            break;
          }
          attempts++;
        }
      }
    }
    if (_tick && placed > 0) await _tick(`Spawned ${creatureType.creatureId} ×${placed}`);
  }
}

async function spawnOverworldResources(chunks, townCenter, bounds, worldSeed, tick = null) {
  const _tick = typeof tick === 'function' ? tick : null;
  const TOWN_EXCLUSION_RADIUS_SQ = 45 * 45;

  const OVERWORLD_RESOURCES = [
    // Water harvest nodes
    { kind: 'fishing_spot', biomes: ['WATER'], count: 18, clusterR: 7, nearMountain: false, waterSpawn: true },
    // Mining
    { kind: 'harvest_iron_ore', biomes: ['MOUNTAIN'], count: 12, clusterR: 5, nearMountain: true },
    { kind: 'harvest_coal_ore', biomes: ['MOUNTAIN'], count: 8, clusterR: 4, nearMountain: true },
    { kind: 'harvest_stone', biomes: ['MOUNTAIN', 'COASTAL'], count: 10, clusterR: 6, nearMountain: false },
    // Plants
    { kind: 'harvest_herbs', biomes: ['FOREST', 'WETLAND'], count: 10, clusterR: 5, nearMountain: false },
    { kind: 'harvest_berries', biomes: ['FOREST', 'GRASSLAND'], count: 8, clusterR: 4, nearMountain: false },
    { kind: 'harvest_moonleaf', biomes: ['WETLAND'], count: 4, clusterR: 3, nearMountain: false },
    { kind: 'harvest_ember_root', biomes: ['MOUNTAIN'], count: 3, clusterR: 2, nearMountain: true },
    { kind: 'harvest_venom_fern', biomes: ['WETLAND', 'FOREST'], count: 5, clusterR: 4, nearMountain: false },
  ];

  const rng = new (function(seed) {
    this.seed = (seed ^ 0xDEADBEEF) >>> 0;
    this.next = function() {
      this.seed = (this.seed * 1103515245 + 12345) >>> 0;
      return this.seed / 4294967296;
    };
  })(worldSeed);

  // Collect candidate tiles per biome
  const biomePositions = {};
  for (const [biomeId, _] of Object.entries(BIOME)) {
    biomePositions[biomeId] = [];
  }

  for (let x = bounds.minX + 5; x <= bounds.maxX - 5; x++) {
    for (let y = bounds.minY + 5; y <= bounds.maxY - 5; y++) {
      const dx = x - townCenter.x;
      const dy = y - townCenter.y;
      if (dx * dx + dy * dy < TOWN_EXCLUSION_RADIUS_SQ) continue;

      const tile = getWorldTile(chunks, x, y);
      const biomeId = getTileBiomeId(tile);
      if (biomeId) {
        biomePositions[biomeId].push({ x, y });
      }
    }
  }

  // Spawn each resource type
  for (const resourceType of OVERWORLD_RESOURCES) {
    let placed = 0;

    const candidates = [];
    for (const biomeId of resourceType.biomes) {
      candidates.push(...biomePositions[biomeId]);
    }

    if (candidates.length === 0) continue;

    const numClusters = Math.max(1, Math.floor(resourceType.count / 3));
    const anchors = [];
    for (let i = 0; i < numClusters && anchors.length < numClusters; i++) {
      const idx = Math.floor(rng.next() * candidates.length);
      anchors.push(candidates[idx]);
    }

    for (const anchor of anchors) {
      const perCluster = Math.ceil(resourceType.count / numClusters);
      for (let s = 0; s < perCluster && placed < resourceType.count; s++) {
        let attempts = 0;
        while (attempts < 10 && placed < resourceType.count) {
          const angle = rng.next() * Math.PI * 2;
          const dist = rng.next() * resourceType.clusterR;
          const x = Math.round(anchor.x + Math.cos(angle) * dist);
          const y = Math.round(anchor.y + Math.sin(angle) * dist);

          const tile = getWorldTile(chunks, x, y);
          const biomeId = getTileBiomeId(tile);

          if (resourceType.nearMountain) {
            // Ore must be on adjacent tile to mountain, not on mountain itself
            if (biomeId === 'MOUNTAIN') {
              for (let dx = -1; dx <= 1 && placed < resourceType.count; dx++) {
                for (let dy = -1; dy <= 1 && placed < resourceType.count; dy++) {
                  if (dx === 0 && dy === 0) continue;
                  const nx = x + dx;
                  const ny = y + dy;
                  const nt = getWorldTile(chunks, nx, ny);
                  const nb = getTileBiomeId(nt);
                  if (nb && nb !== 'WATER' && nb !== 'MOUNTAIN' && addSpawnIfOpen(chunks, nx, ny, resourceType.kind)) {
                    placed++;
                    break;
                  }
                }
              }
              break; // anchor attempt done
            }
          } else {
            if (!resourceType.biomes.includes(biomeId)) {
              attempts++;
              continue;
            }
            const placedHere = resourceType.waterSpawn
              ? addWaterSpawnIfOpen(chunks, x, y, resourceType.kind)
              : addSpawnIfOpen(chunks, x, y, resourceType.kind);
            if (placedHere) {
              placed++;
              break;
            }
          }
          attempts++;
        }
      }
    }
    if (_tick && placed > 0) await _tick(`Sowed ${resourceType.kind} ×${placed}`);
  }
}

/**
 * @param {number} worldSeed
 * @returns {{ extent:{minCX:number,maxCX:number,minCY:number,maxCY:number}, chunks:Array<{chunkX:number,chunkY:number,depth:number,seed:number,tiles:Uint8Array,rooms:any[],doors:any[],spawns:any[]}>, spawnX:number, spawnY:number }}
 */
// Cooperative yield used between planning phases so the loading UI can repaint.
// Returns a Promise resolved on next animation frame (or microtask in non-DOM
// environments like Deno tests).
const _yieldFrame = () => {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }
  return Promise.resolve();
};

const _owCache = new Map();

function _copyCachedOverworld(cached) {
  return { ...cached, chunks: cached.chunks.map(c => ({ ...c, tiles: Uint8Array.from(c.tiles), roofed: c.roofed ? Uint8Array.from(c.roofed) : null })) };
}

export function prewarmOverworldChunks(worldSeed) {
  const key = worldSeed >>> 0;
  if (!_owCache.has(key)) {
    _owCache.set(key, _generateOverworldChunks(worldSeed, () => {}));
  }
  return _owCache.get(key);
}

export function clearOverworldChunkCache() {
  _owCache.clear();
}

export async function generateOverworldChunks(worldSeed, onPlanProgress = null) {
  const key = worldSeed >>> 0;
  if (_owCache.has(key)) {
    return _copyCachedOverworld(await _owCache.get(key));
  }
  if (!onPlanProgress) return _copyCachedOverworld(await prewarmOverworldChunks(worldSeed));
  const generated = await _generateOverworldChunks(worldSeed, onPlanProgress);
  _owCache.set(key, Promise.resolve(_copyCachedOverworld(generated)));
  return generated;
}

async function _generateOverworldChunks(worldSeed, onPlanProgress) {
  const _emit = (label, step, total) => {
    if (typeof onPlanProgress === 'function') {
      onPlanProgress({ phase: 'plan', label, step, total });
    }
  };
  const _yield = onPlanProgress ? _yieldFrame : null;

  const extent = { ...OVERWORLD_EXTENT };
  const perm = buildPermutation(worldSeed >>> 0);
  /** @type {Map<string, { chunkX:number, chunkY:number, tiles:Uint8Array, spawns:any[] }>} */
  const chunks = new Map();

  const minX = extent.minCX * CHUNK_SIZE;
  const maxX = (extent.maxCX + 1) * CHUNK_SIZE - 1;
  const minY = extent.minCY * CHUNK_SIZE;
  const maxY = (extent.maxCY + 1) * CHUNK_SIZE - 1;

  // Pick random cardinal direction for elevation gradient
  const directions = ['north', 'south', 'east', 'west'];
  let rngSeed = worldSeed;
  rngSeed = (rngSeed * 1103515245 + 12345) >>> 0;
  const gradientDir = directions[rngSeed % 4];

  const PLAN_TOTAL = 7;
  _emit('Generating terrain', 0, PLAN_TOTAL);
  if (_yield) await _yield();
  let _terrainCount = 0;
  for (let cy = extent.minCY; cy <= extent.maxCY; cy++) {
    for (let cx = extent.minCX; cx <= extent.maxCX; cx++) {
      const rec = {
        chunkX: cx,
        chunkY: cy,
        tiles: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
        spawns: [],
      };
      chunks.set(chunkKey(cx, cy), rec);
      fillChunkTerrain(chunks, cx, cy, worldSeed >>> 0, perm, gradientDir, minX, maxX, minY, maxY);
      _terrainCount++;
      // Yield every few chunks so the loading-screen background animation
      // (flames, particles) can continue ticking during heavy terrain fill.
      if (_yield && (_terrainCount & 3) === 0) await _yield();
    }
  }

  _emit('Carving coastline', 1, PLAN_TOTAL);
  if (_yield) await _yield();
  forceEdgeOcean(chunks, minX, maxX, minY, maxY, worldSeed >>> 0, perm);

  // Default spawn point at center of overworld
  const homeX = Math.floor((minX + maxX) / 2);
  const homeY = Math.floor((minY + maxY) / 2);
  let spawnX = homeX;
  let spawnY = homeY;

  _emit('Carving rivers and ponds', 2, PLAN_TOTAL);
  if (_yield) await _yield();
  carveRivers(chunks, minX, maxX, minY, maxY, worldSeed >>> 0, perm);
  carvePondsAndLakes(chunks, minX, maxX, minY, maxY, homeX, homeY, worldSeed >>> 0, perm);

  _emit('Placing buildings', 3, PLAN_TOTAL);
  if (_yield) await _yield();
  const _townTick = onPlanProgress
    ? async (label) => {
        onPlanProgress({ phase: 'plan', label, step: 3, total: PLAN_TOTAL });
        await _yieldFrame();
      }
    : null;
  const townPlan = await applyTownPlacement(chunks, { minX, maxX, minY, maxY }, worldSeed >>> 0, _townTick);
  if (townPlan?.center) {
    spawnX = townPlan.center.x;
    spawnY = townPlan.center.y;
  }

  _emit('Placing landmarks', 4, PLAN_TOTAL);
  if (_yield) await _yield();
  const _landmarkTick = onPlanProgress
    ? async (label) => {
        onPlanProgress({ phase: 'plan', label, step: 4, total: PLAN_TOTAL });
        await _yieldFrame();
      }
    : null;
  await placeOverworldLandmarks(chunks, townPlan?.center || { x: spawnX, y: spawnY }, { minX, maxX, minY, maxY }, worldSeed >>> 0, _landmarkTick);

  _emit('Spawning creatures', 5, PLAN_TOTAL);
  if (_yield) await _yield();
  const _creatureTick = onPlanProgress
    ? async (label) => {
        onPlanProgress({ phase: 'plan', label, step: 5, total: PLAN_TOTAL });
        await _yieldFrame();
      }
    : null;
  await spawnOverworldCreatures(chunks, townPlan?.center || { x: spawnX, y: spawnY }, { minX, maxX, minY, maxY }, worldSeed >>> 0, _creatureTick);

  _emit('Placing resources', 6, PLAN_TOTAL);
  if (_yield) await _yield();
  const _resourceTick = onPlanProgress
    ? async (label) => {
        onPlanProgress({ phase: 'plan', label, step: 6, total: PLAN_TOTAL });
        await _yieldFrame();
      }
    : null;
  await spawnOverworldResources(chunks, townPlan?.center || { x: spawnX, y: spawnY }, { minX, maxX, minY, maxY }, worldSeed >>> 0, _resourceTick);

  const outChunks = [];
  for (const rec of chunks.values()) {
    outChunks.push({
      chunkX: rec.chunkX,
      chunkY: rec.chunkY,
      depth: 0,
      seed: worldSeed >>> 0,
      tiles: rec.tiles,
      roofed: exportRoofedChunk(rec.chunkX, rec.chunkY),
      rooms: [],
      doors: [],
      spawns: rec.spawns,
    });
  }

  return { extent, chunks: outChunks, spawnX, spawnY, townPlan };
}
