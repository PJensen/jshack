// display/lighting/engine.js
// Sub-tile SDF lighting engine.
// 8×8 lighting cells per game tile — smooth quadratic falloff, wall-face
// catch-lights via SDF normals.  Ported from js-hack-arena's torchPass and
// adapted to JSHack's discrete tile grid.

const SUB = 8;             // sub-cells per tile edge  (64 cells/tile)
const INV_SUB = 1 / SUB;   // tile-units per sub-cell
const SQRT2 = 1.4142;

// How much player vision lifts darkness (0=pitch black in sight, 1=fully revealed).
// Lava uses a lower value so the below-grade depression profile stays legible.
const VIS_LIFT       = 0.5;
const VIS_LIFT_LAVA  = 0.44;
const AMBIENT_DARKNESS_LIFT_SCALE = 0.28;
const UNSEEN_AMBIENT_LIFT_CAP = 0.42;
const DAY_MEMORY_DARK_ALPHA_FLOOR = 72;
const SHELTERED_EXTERIOR_BLACKOUT_ALPHA = 188;

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

const DEFAULT_MATERIAL_RESPONSE = Object.freeze({
  albedoR: 1,
  albedoG: 1,
  albedoB: 1,
  normal: 0.5,
  rim: 0.08,
  sheen: 0,
  absorb: 0,
  emit: 0,
  emitR: 1,
  emitG: 0.82,
  emitB: 0.55,
  void: 0,
});

function colorTempToRgb01(kelvin) {
  const k = clamp(Number(kelvin || 0), 1000, 40000) / 100;
  let r, g, b;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }
  return [
    clamp(r, 0, 255) / 255,
    clamp(g, 0, 255) / 255,
    clamp(b, 0, 255) / 255,
  ];
}

/**
 * Convert rule/material catalog optical fields into display-side lighting
 * response.  Accepts either a Material object or a catalog row with `.Material`.
 *
 * @param {any} material
 * @returns {{ albedoR:number, albedoG:number, albedoB:number, normal:number, rim:number, sheen:number, absorb:number, emit:number, emitR:number, emitG:number, emitB:number, void:number }}
 */
export function resolveMaterialLightingResponse(material) {
  const mat = material?.Material || material;
  if (!mat || typeof mat !== "object") return DEFAULT_MATERIAL_RESPONSE;
  const pass = clamp01(Number(mat.lightPass || 0));
  const reflect = clamp01(Number(mat.lightReflect || 0));
  const absorb = clamp01(Number(mat.lightAbsorb || 0));
  const emit = clamp01(Number(mat.lightEmit || 0));
  const dispersion = clamp01(Number(mat.dispersion || 0));
  const conductivity = clamp01(Number(mat.conductivity || 0));
  const kind = String(mat.kind || "").toLowerCase();
  const shine = Math.max(reflect, conductivity * 0.22, dispersion * 0.55);
  let tintR = 1, tintG = 1, tintB = 1;
  if (kind === "ice" || kind === "quartz" || kind === "diamond") {
    tintR = 0.88; tintG = 1.06; tintB = 1.22;
  } else if (kind === "gold" || kind === "brass" || kind === "bronze" || kind === "amber") {
    tintR = 1.18; tintG = 1.04; tintB = 0.78;
  } else if (kind === "copper" || kind === "blood-iron") {
    tintR = 1.18; tintG = 0.86; tintB = 0.72;
  } else if (kind === "jadeite" || kind === "nephrite" || kind === "turquoise") {
    tintR = 0.76; tintG = 1.14; tintB = 0.96;
  } else if (kind === "obsidian" || kind === "jet" || kind === "voidstone" || kind === "darksteel") {
    tintR = 0.58; tintG = 0.55; tintB = 0.68;
  } else if (kind === "paper" || kind === "bone" || kind === "ivory") {
    tintR = 1.14; tintG = 1.09; tintB = 0.96;
  } else if (kind === "wood" || kind === "leather") {
    tintR = 1.08; tintG = 0.88; tintB = 0.68;
  }

  const lift = reflect * 0.55 + pass * 0.32 + emit * 0.28;
  const dim = absorb * 0.48;
  const glow = colorTempToRgb01(mat.glowColorTempK || 3200);
  return {
    albedoR: clamp((1 + lift - dim) * tintR, 0.18, 1.65),
    albedoG: clamp((1 + lift - dim) * tintG, 0.18, 1.65),
    albedoB: clamp((1 + lift - dim) * tintB, 0.18, 1.65),
    normal: clamp(0.42 + reflect * 1.25 + pass * 0.18 + dispersion * 0.55 - absorb * 0.22, 0.12, 1.65),
    rim: clamp(0.06 + reflect * 0.72 + pass * 0.28 + dispersion * 0.38, 0, 0.92),
    sheen: clamp(shine, 0, 1),
    absorb,
    emit,
    emitR: glow[0],
    emitG: glow[1],
    emitB: glow[2],
    void: (kind === "voidstone" || kind === "darksteel" || absorb >= 0.85) ? absorb : 0,
  };
}

/**
 * Sky ambient is illumination, not knowledge.  It should colour and brighten
 * the world, but it must not fully erase the memory veil outside current FOV.
 *
 * @param {number} ambientLightSum
 * @param {number} sight
 * @returns {number}
 */
export function resolveAmbientDarknessLift(ambientLightSum, sight) {
  const ambientLift = clamp01(Math.max(0, ambientLightSum) * AMBIENT_DARKNESS_LIFT_SCALE);
  const s = clamp01(sight);
  const lowSightCap = UNSEEN_AMBIENT_LIFT_CAP + (1 - UNSEEN_AMBIENT_LIFT_CAP) * s;
  return Math.min(ambientLift, lowSightCap);
}

/**
 * Resolve the black-overlay alpha for one lighting sub-cell.
 * Exported for focused tests; render() still owns terrain-specific modifiers.
 *
 * @param {{ lightSum:number, ambientLightSum?:number, sight?:number, inLava?:boolean, dark?:number, extraDark?:number, voidAmount?:number }} input
 * @returns {number}
 */
export function resolveDarknessAlpha(input) {
  const DARK = input.dark != null ? input.dark : 140;
  const lightSum = Number(input.lightSum || 0);
  const ambientLightSum = Math.max(0, Number(input.ambientLightSum || 0));
  const localLightSum = Math.max(0, lightSum - ambientLightSum);
  const voidAmount = Math.max(0, Number(input.voidAmount || 0));
  const sight = clamp01(Number(input.sight || 0));
  const inLava = !!input.inLava;
  const visLift = sight * (inLava ? VIS_LIFT_LAVA : VIS_LIFT);
  const ambientLift = resolveAmbientDarknessLift(ambientLightSum, sight);
  const localLightLift = clamp01(localLightSum * 0.5);
  const totalLift = Math.min(1, visLift + ambientLift + localLightLift);
  let extraDark = Number(input.extraDark || 0);

  const legacyNegativeVoid = lightSum < 0 ? Math.max(0, -lightSum) : 0;
  const voidDarkInput = Math.max(voidAmount, legacyNegativeVoid);
  if (voidDarkInput > 0) {
    const voidDark = Math.min(1, Math.pow(voidDarkInput * 0.62, 0.58));
    extraDark += voidDark * Math.max(86, 255 - DARK + 120);
  }

  let alpha = Math.min(255, Math.max(0, (DARK * (1 - totalLift) + extraDark) | 0));
  if (!inLava && ambientLightSum > 0.9 && sight < 0.08 && localLightLift < 0.2 && voidDarkInput < 0.1) {
    alpha = Math.max(alpha, DAY_MEMORY_DARK_ALPHA_FLOOR);
  }
  return alpha;
}

/**
 * When the player is indoors, sky-lit exterior cells should recede.  This
 * mirrors the audio model: outside still exists, but the shelter separates it.
 *
 * @param {{ playerSheltered?:boolean, shelterInterior?:boolean }} input
 * @returns {number}
 */
export function resolveShelteredExteriorDarkening(input) {
  if (!input.playerSheltered || input.shelterInterior) return 0;
  return SHELTERED_EXTERIOR_BLACKOUT_ALPHA;
}

/**
 * @typedef {{
 *   x: number,           // lightmap tile-space X (world glyph X + 0.5)
 *   y: number,           // lightmap tile-space Y (world glyph Y + 0.5)
 *   radius: number,      // falloff radius in tiles
 *   color?: [number, number, number],  // RGB 0-255, default warm orange
 *   flicker?: number,    // 0-1 intensity multiplier (applied by caller)
 *   softness?: number    // penumbra softness (0=hard, 16=torch, 32=wide). Default 16.
 * }} LightDef
 */

/**
 * Vision mask — NOT a light.  Controls what the player can perceive (lifts
 * darkness) without emitting colour or creating halos.
 * @typedef {{
 *   x: number,           // tile-space X (fractional, tile-center)
 *   y: number,           // tile-space Y
 *   radius: number,      // max sight distance in tiles (smoothed)
 *   facingX?: number,    // unit-direction X (null/0 = omnidirectional)
 *   facingY?: number,    // unit-direction Y
 *   coneDeg?: number,    // total cone width in degrees (360 = full circle)
 *   penumbraDeg?: number // soft edge width in degrees (default 25)
 * }} VisionDef
 */

/**
 * Create a self-contained lighting engine instance.
 * Manages its own off-screen canvas and typed-array buffers.
 */
export function createLightingEngine() {
  // ---- Buffers (resized lazily) ----------------------------------------
  let lmW = 0, lmH = 0;
  /** @type {Float32Array} */ let sdf   = null;
  /** @type {Float32Array} */ let normX = null;
  /** @type {Float32Array} */ let normY = null;
  /** @type {Float32Array} */ let lightR = null;
  /** @type {Float32Array} */ let lightG = null;
  /** @type {Float32Array} */ let lightB = null;
  /** @type {Float32Array} */ let voidField = null;
  /** @type {Float32Array} */ let vision = null;  // 0 = unseen, 1 = full sight
  /** @type {Float32Array} */ let floorH = null;  // debug floor relief height (tile-ish units)
  /** @type {Float32Array} */ let floorGX = null; // relief gradient x
  /** @type {Float32Array} */ let floorGY = null; // relief gradient y
  let hasFloorRelief = false;
  /** @type {Float32Array} */ let surfSdf   = null;  // distance from hull edge (sub-cell units)
  /** @type {Float32Array} */ let surfNormX = null;  // inward-facing surface normals (toward center)
  /** @type {Float32Array} */ let surfNormY = null;
  /** @type {Uint8Array}   */ let surfType  = null;  // 0=none, 1=water, 2=lava
  /** @type {Uint8Array}   */ let lavaMask = null;   // 1=inside lava region
  /** @type {Float32Array} */ let lavaEdgeDist = null; // distance to lava hull boundary (both sides)

  const lmCanvas = document.createElement('canvas');
  const lmCtx    = lmCanvas.getContext('2d');
  /** @type {ImageData} */ let imgData = null;
  /** @type {Uint8ClampedArray} */ let pixels = null;

  // Viewport origin (tile ints) — kept for coordinate math in render().
  let _tx0 = 0, _ty0 = 0;

  // ---- Dirty-field tracking ------------------------------------------------
  // Each field is rebuilt only when its dirty flag is set.  Flags cascade:
  //   geometry → vision, lights     (SDF changed = re-march everything)
  //   surface  → lights             (pool shapes changed)
  //   relief   → lights             (floor height changed)
  //   vision   → lights             (what player sees changed)
  //   lights   → (terminal)
  // A viewport pan (tx0/ty0 change) or resize dirties everything.
  let _dirtyGeometry = true;
  let _dirtySurface  = true;
  let _dirtyRelief   = true;
  let _dirtyVision   = true;
  let _dirtyLights   = true;
  // Previous viewport for change detection
  let _prevTx0 = -9999, _prevTy0 = -9999, _prevTw = 0, _prevTh = 0;

  // ---- Per-frame perf stats ------------------------------------------------
  const _stats = {
    builtSdf: 0, builtSurf: 0, builtRelief: 0, builtVision: 0,
    lightCount: 0, dtMs: 0,
  };

  // ---- Debug floor relief (generic terrain heightfield) -----------------
  // This is intentionally tag-agnostic: lava/water are just surface tags.
  // Relief lives in the same sub-cell field and can represent cuts/piles.
  /** @typedef {{ x:number, y:number, delta:number }} FloorTileMod */
  /** @typedef {{ x:number, y:number, radius:number, delta:number, falloff:number, roughness:number, depthNoise:number, seed:number }} FloorRadialMod */
  /** @typedef {{ tileMods:Map<string, FloorTileMod>, radialMods:FloorRadialMod[], noiseAmp:number, noiseFreq:number }} FloorReliefState */
  /** @type {Map<string, FloorReliefState>} */
  const floorReliefByKey = new Map();
  let activeReliefKey = "depth:0";
  const floorNoiseSeed = 0x9e3779b9;
  const MAX_RADIAL_MODS_PER_KEY = 320;

  function normalizeReliefKey(key) {
    if (typeof key === "number" && Number.isFinite(key)) return `depth:${Math.floor(key)}`;
    const s = String(key ?? "").trim();
    if (!s) return "depth:0";
    return s.startsWith("depth:") ? s : `depth:${s}`;
  }

  /** @param {string} key */
  function getReliefStateForKey(key) {
    const k = normalizeReliefKey(key);
    let state = floorReliefByKey.get(k);
    if (!state) {
      state = { tileMods: new Map(), radialMods: [], noiseAmp: 0, noiseFreq: 0.06 };
      floorReliefByKey.set(k, state);
    }
    return state;
  }

  function getActiveReliefState() {
    return getReliefStateForKey(activeReliefKey);
  }

  function smoothstep01(t) {
    const x = t < 0 ? 0 : (t > 1 ? 1 : t);
    return x * x * (3 - 2 * x);
  }

  function hash2i(xi, yi, seed) {
    let h = (xi | 0) * 374761393 + (yi | 0) * 668265263 + (seed | 0) * 1442695041;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967295;
  }

  function valueNoise2(x, y, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const tx = x - x0;
    const ty = y - y0;
    const sx = smoothstep01(tx);
    const sy = smoothstep01(ty);
    const n00 = hash2i(x0, y0, seed);
    const n10 = hash2i(x1, y0, seed);
    const n01 = hash2i(x0, y1, seed);
    const n11 = hash2i(x1, y1, seed);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sy;
  }

  function fbm2(x, y, seed) {
    let sum = 0;
    let amp = 0.55;
    let freq = 1.0;
    let norm = 0;
    for (let o = 0; o < 3; o++) {
      const v = valueNoise2(x * freq, y * freq, seed + o * 1013);
      sum += ((v * 2) - 1) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return norm > 0 ? (sum / norm) : 0;
  }

  /** Ensure buffers match the required sub-cell dimensions. */
  function ensureSize(tw, th) {
    const w = tw * SUB;
    const h = th * SUB;
    if (w === lmW && h === lmH) return;
    lmW = w; lmH = h;
    const n = w * h;
    sdf      = new Float32Array(n);
    normX    = new Float32Array(n);
    normY    = new Float32Array(n);
    lightR   = new Float32Array(n);
    lightG   = new Float32Array(n);
    lightB   = new Float32Array(n);
    voidField = new Float32Array(n);
    vision   = new Float32Array(n);
    floorH   = new Float32Array(n);
    floorGX  = new Float32Array(n);
    floorGY  = new Float32Array(n);
    surfSdf   = new Float32Array(n);
    surfNormX = new Float32Array(n);
    surfNormY = new Float32Array(n);
    surfType  = new Uint8Array(n);
    lavaMask = new Uint8Array(n);
    lavaEdgeDist = new Float32Array(n);
    lmCanvas.width  = w;
    lmCanvas.height = h;
    imgData = lmCtx.createImageData(w, h);
    pixels  = imgData.data;
  }

  // ---- SDF construction ------------------------------------------------

  /**
   * Build an approximate SDF from tile opacity via two-pass Chamfer distance
   * transform.  Result is in *sub-cell* units (1 = one sub-cell width).
   *
   * @param {(x:number,y:number)=>boolean} isOpaque
   * @param {number} tx0 - viewport tile origin X
   * @param {number} ty0 - viewport tile origin Y
   * @param {number} tw  - viewport width in tiles
   * @param {number} th  - viewport height in tiles
   */
  function buildSDF(isOpaque, tx0, ty0, tw, th) {
    const w = tw * SUB, h = th * SUB;

    // Initialise: wall sub-cells = 0, open = large sentinel.
    for (let sy = 0; sy < h; sy++) {
      const tyi = ty0 + ((sy * INV_SUB) | 0);
      for (let sx = 0; sx < w; sx++) {
        const txi = tx0 + ((sx * INV_SUB) | 0);
        sdf[sy * w + sx] = isOpaque(txi, tyi) ? 0 : 9999;
      }
    }

    // Forward pass (top-left → bottom-right)
    for (let sy = 1; sy < h; sy++) {
      for (let sx = 1; sx < w - 1; sx++) {
        const i = sy * w + sx;
        if (sdf[i] === 0) continue;
        let m = sdf[i];
        const a = sdf[i - 1]     + 1;      if (a < m) m = a;
        const b = sdf[i - w]     + 1;      if (b < m) m = b;
        const c = sdf[i - w - 1] + SQRT2;  if (c < m) m = c;
        const d = sdf[i - w + 1] + SQRT2;  if (d < m) m = d;
        sdf[i] = m;
      }
    }

    // Backward pass (bottom-right → top-left)
    for (let sy = h - 2; sy >= 0; sy--) {
      for (let sx = w - 2; sx >= 1; sx--) {
        const i = sy * w + sx;
        if (sdf[i] === 0) continue;
        let m = sdf[i];
        const a = sdf[i + 1]     + 1;      if (a < m) m = a;
        const b = sdf[i + w]     + 1;      if (b < m) m = b;
        const c = sdf[i + w + 1] + SQRT2;  if (c < m) m = c;
        const d = sdf[i + w - 1] + SQRT2;  if (d < m) m = d;
        sdf[i] = m;
      }
    }

    // Normals from gradient (central differences)
    for (let sy = 1; sy < h - 1; sy++) {
      for (let sx = 1; sx < w - 1; sx++) {
        const i = sy * w + sx;
        const dx = sdf[i + 1] - sdf[i - 1];
        const dy = sdf[i + w] - sdf[i - w];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        normX[i] = dx / len;
        normY[i] = dy / len;
      }
    }
  }

  // ---- Surface SDF construction -----------------------------------------

  // Surface depth thresholds (sub-cell units)
  const MAX_SURF_DEPTH = 3.5;   // depth at which tint is fully saturated
  const SURF_EDGE_THRESH = 2.8; // bright rim fades over this many sub-cells

  /**
   * Build a surface SDF by rasterizing hull contours onto the sub-cell grid,
   * then running the same Chamfer distance transform.  Result: smooth distance
   * from the hull boundary for each surface sub-cell ("depth into the pool").
   *
   * @param {Array<{family:string, loops:Array<Array<{x:number,y:number}>>}>} regions
   * @param {number} tx0  @param {number} ty0
   * @param {number} tw   @param {number} th
   */
  function buildSurfaceSDF(regions, tx0, ty0, tw, th) {
    const w = tw * SUB, h = th * SUB;
    surfSdf.fill(0);
    surfType.fill(0);
    lavaMask.fill(0);
    lavaEdgeDist.fill(9999);
    if (!regions || !regions.length) return;

    // Offset: drawImage maps sub-cell (0,0) to world (tx0-0.5, ty0-0.5),
    // so world→sub-cell is: sx = (wx - tx0 + 0.5) * SUB
    const ox = (-tx0 + 0.5) * SUB;
    const oy = (-ty0 + 0.5) * SUB;

    // Rasterize each region's Bezier hull contour via scanline fill
    for (let ri = 0; ri < regions.length; ri++) {
      const region = regions[ri];
      const st = region.family === 'lava' ? 2 : 1;  // 1=water, 2=lava
      const loops = region.loops;
      if (!loops || !loops.length) continue;

      for (let li = 0; li < loops.length; li++) {
        const loop = loops[li];
        if (loop.length < 4) continue;

        // Strip closing duplicate (loops close by repeating first point)
        const raw = loop[0].x === loop[loop.length - 1].x &&
                    loop[0].y === loop[loop.length - 1].y
          ? loop.slice(0, -1) : loop;
        if (raw.length < 3) continue;

        // Sample the quadratic Bezier hull path into a dense polygon.
        // Same curve logic as traceSurfaceHullPath: midpoint start/end,
        // each corner vertex is a Bezier control point.
        const SEGS = 10;  // samples per curve segment (denser preserves Bezier wall curvature)
        const sampled = [];  // flat [x0,y0, x1,y1, ...]
        let prevMid = {
          x: (raw[raw.length - 1].x + raw[0].x) * 0.5,
          y: (raw[raw.length - 1].y + raw[0].y) * 0.5,
        };
        for (let j = 0; j < raw.length; j++) {
          const ctrl = raw[j];
          const next = raw[(j + 1) % raw.length];
          const endMid = { x: (ctrl.x + next.x) * 0.5, y: (ctrl.y + next.y) * 0.5 };
          for (let s = 0; s < SEGS; s++) {
            const t = s / SEGS;
            const u = 1 - t;
            sampled.push(
              (u * u * prevMid.x + 2 * u * t * ctrl.x + t * t * endMid.x) + ox,
              (u * u * prevMid.y + 2 * u * t * ctrl.y + t * t * endMid.y) + oy,
            );
          }
          prevMid = endMid;
        }

        const nPts = sampled.length >> 1;
        if (nPts < 3) continue;

        let minSY = h, maxSY = 0;
        for (let p = 0; p < nPts; p++) {
          const py = sampled[p * 2 + 1];
          if (py < minSY) minSY = py;
          if (py > maxSY) maxSY = py;
        }
        const y0 = Math.max(0, Math.floor(minSY));
        const y1 = Math.min(h - 1, Math.ceil(maxSY));

        // Scanline fill (even-odd rule)
        for (let sy = y0; sy <= y1; sy++) {
          const scanY = sy + 0.5;
          let xCount = 0;
          const xBuf = [];
          for (let j = 0; j < nPts; j++) {
            const ax = sampled[j * 2], ay = sampled[j * 2 + 1];
            const nj = (j + 1) % nPts;
            const bx = sampled[nj * 2], by = sampled[nj * 2 + 1];
            if ((ay <= scanY && by > scanY) || (by <= scanY && ay > scanY)) {
              const t = (scanY - ay) / (by - ay);
              xBuf[xCount++] = ax + t * (bx - ax);
            }
          }
          if (xCount < 2) continue;
          for (let a = 1; a < xCount; a++) {
            const v = xBuf[a];
            let b = a - 1;
            while (b >= 0 && xBuf[b] > v) { xBuf[b + 1] = xBuf[b]; b--; }
            xBuf[b + 1] = v;
          }
          for (let j = 0; j < xCount - 1; j += 2) {
            const x0 = Math.max(0, Math.ceil(xBuf[j]));
            const x1 = Math.min(w - 1, Math.floor(xBuf[j + 1]));
            const rowOff = sy * w;
            for (let sx = x0; sx <= x1; sx++) {
              const idx = rowOff + sx;
              surfType[idx] = st;
              surfSdf[idx] = 9999;
              if (st === 2) lavaMask[idx] = 1;
            }
          }
        }
      }
    }

    // Chamfer distance transform — identical to wall SDF but for surface boundary.
    // Forward pass
    for (let sy = 1; sy < h; sy++) {
      for (let sx = 1; sx < w - 1; sx++) {
        const i = sy * w + sx;
        if (surfSdf[i] === 0) continue;
        let m = surfSdf[i];
        const a = surfSdf[i - 1]     + 1;      if (a < m) m = a;
        const b = surfSdf[i - w]     + 1;      if (b < m) m = b;
        const c = surfSdf[i - w - 1] + SQRT2;  if (c < m) m = c;
        const d = surfSdf[i - w + 1] + SQRT2;  if (d < m) m = d;
        surfSdf[i] = m;
      }
    }
    // Backward pass
    for (let sy = h - 2; sy >= 0; sy--) {
      for (let sx = w - 2; sx >= 1; sx--) {
        const i = sy * w + sx;
        if (surfSdf[i] === 0) continue;
        let m = surfSdf[i];
        const a = surfSdf[i + 1]     + 1;      if (a < m) m = a;
        const b = surfSdf[i + w]     + 1;      if (b < m) m = b;
        const c = surfSdf[i + w + 1] + SQRT2;  if (c < m) m = c;
        const d = surfSdf[i + w - 1] + SQRT2;  if (d < m) m = d;
        surfSdf[i] = m;
      }
    }

    // Surface normals from gradient (central differences) — point inward from hull edge.
    // These describe the inner wall face direction of the below-grade cut.
    surfNormX.fill(0);
    surfNormY.fill(0);
    for (let sy = 1; sy < h - 1; sy++) {
      for (let sx = 1; sx < w - 1; sx++) {
        const i = sy * w + sx;
        if (surfSdf[i] === 0) continue;
        const dx = surfSdf[i + 1] - surfSdf[i - 1];
        const dy = surfSdf[i + w] - surfSdf[i - w];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        surfNormX[i] = dx / len;
        surfNormY[i] = dy / len;
      }
    }

    // Lava signed-boundary distance support:
    // distance to lava hull on both sides (inside and outside) in sub-cells.
    for (let sy = 0; sy < h; sy++) {
      const rowOff = sy * w;
      for (let sx = 0; sx < w; sx++) {
        const i = rowOff + sx;
        const inLava = lavaMask[i] === 1;
        const nL = sx > 0     ? (lavaMask[i - 1] === 1) : false;
        const nR = sx < w - 1 ? (lavaMask[i + 1] === 1) : false;
        const nU = sy > 0     ? (lavaMask[i - w] === 1) : false;
        const nD = sy < h - 1 ? (lavaMask[i + w] === 1) : false;
        if (inLava !== nL || inLava !== nR || inLava !== nU || inLava !== nD) {
          lavaEdgeDist[i] = 0;
        }
      }
    }
    // Full-grid chamfer transform from lava boundary seeds.
    for (let sy = 1; sy < h; sy++) {
      for (let sx = 1; sx < w - 1; sx++) {
        const i = sy * w + sx;
        if (lavaEdgeDist[i] === 0) continue;
        let m = lavaEdgeDist[i];
        const a = lavaEdgeDist[i - 1]     + 1;      if (a < m) m = a;
        const b = lavaEdgeDist[i - w]     + 1;      if (b < m) m = b;
        const c = lavaEdgeDist[i - w - 1] + SQRT2;  if (c < m) m = c;
        const d = lavaEdgeDist[i - w + 1] + SQRT2;  if (d < m) m = d;
        lavaEdgeDist[i] = m;
      }
    }
    for (let sy = h - 2; sy >= 0; sy--) {
      for (let sx = w - 2; sx >= 1; sx--) {
        const i = sy * w + sx;
        if (lavaEdgeDist[i] === 0) continue;
        let m = lavaEdgeDist[i];
        const a = lavaEdgeDist[i + 1]     + 1;      if (a < m) m = a;
        const b = lavaEdgeDist[i + w]     + 1;      if (b < m) m = b;
        const c = lavaEdgeDist[i + w + 1] + SQRT2;  if (c < m) m = c;
        const d = lavaEdgeDist[i + w - 1] + SQRT2;  if (d < m) m = d;
        lavaEdgeDist[i] = m;
      }
    }
  }

  /**
   * Build debug floor relief field (height + gradient) at sub-cell resolution.
   * Height is tile-agnostic and intended for generic dig/pile experiments.
   *
   * @param {number} tx0
   * @param {number} ty0
   * @param {number} tw
   * @param {number} th
   * @param {FloorReliefState} relief
   */
  function buildFloorRelief(tx0, ty0, tw, th, relief) {
    const w = tw * SUB;
    const h = th * SUB;
    const hasNoise = Math.abs(relief.noiseAmp) > 1e-6;
    const hasMods = relief.tileMods.size > 0;
    const hasRadials = Array.isArray(relief.radialMods) && relief.radialMods.length > 0;

    hasFloorRelief = hasNoise || hasMods || hasRadials;
    if (!hasFloorRelief) {
      floorH.fill(0);
      floorGX.fill(0);
      floorGY.fill(0);
      return;
    }

    if (hasNoise) {
      const freq = Math.max(1e-5, relief.noiseFreq);
      const amp = relief.noiseAmp;
      for (let sy = 0; sy < h; sy++) {
        const wy = ty0 - 0.5 + (sy + 0.5) * INV_SUB;
        const rowOff = sy * w;
        for (let sx = 0; sx < w; sx++) {
          const wx = tx0 - 0.5 + (sx + 0.5) * INV_SUB;
          floorH[rowOff + sx] = fbm2(wx * freq, wy * freq, floorNoiseSeed) * amp;
        }
      }
    } else {
      floorH.fill(0);
    }

    if (hasMods) {
      for (const rec of relief.tileMods.values()) {
        const sx0 = (rec.x - tx0) * SUB;
        const sy0 = (rec.y - ty0) * SUB;
        const sx1 = sx0 + SUB - 1;
        const sy1 = sy0 + SUB - 1;
        if (sx1 < 0 || sy1 < 0 || sx0 >= w || sy0 >= h) continue;
        const mx0 = Math.max(0, sx0);
        const my0 = Math.max(0, sy0);
        const mx1 = Math.min(w - 1, sx1);
        const my1 = Math.min(h - 1, sy1);
        for (let sy = my0; sy <= my1; sy++) {
          const rowOff = sy * w;
          for (let sx = mx0; sx <= mx1; sx++) {
            floorH[rowOff + sx] += rec.delta;
          }
        }
      }
    }

    if (hasRadials) {
      const twoPi = Math.PI * 2;
      for (let ri = 0; ri < relief.radialMods.length; ri++) {
        const mod = relief.radialMods[ri];
        const r = Math.max(0.01, Number(mod.radius) || 0);
        const delta = Number(mod.delta) || 0;
        if (!Number.isFinite(delta) || delta === 0) continue;
        const cx = Number(mod.x) || 0;
        const cy = Number(mod.y) || 0;
        const falloff = Math.max(0.25, Math.min(5, Number(mod.falloff) || 1.4));
        const roughness = Math.max(0, Math.min(0.9, Number(mod.roughness) || 0));
        const depthNoise = Math.max(0, Math.min(0.9, Number(mod.depthNoise) || 0));
        const seed = Number.isFinite(mod.seed) ? (mod.seed | 0) : 0;
        const maxR = r * (1 + roughness * 0.95);

        const sx0 = Math.floor((cx - maxR - tx0 + 0.5) * SUB);
        const sy0 = Math.floor((cy - maxR - ty0 + 0.5) * SUB);
        const sx1 = Math.ceil((cx + maxR - tx0 + 0.5) * SUB);
        const sy1 = Math.ceil((cy + maxR - ty0 + 0.5) * SUB);
        if (sx1 < 0 || sy1 < 0 || sx0 >= w || sy0 >= h) continue;
        const mx0 = Math.max(0, sx0);
        const my0 = Math.max(0, sy0);
        const mx1 = Math.min(w - 1, sx1);
        const my1 = Math.min(h - 1, sy1);

        for (let sy = my0; sy <= my1; sy++) {
          const wy = ty0 - 0.5 + (sy + 0.5) * INV_SUB;
          const rowOff = sy * w;
          for (let sx = mx0; sx <= mx1; sx++) {
            const wx = tx0 - 0.5 + (sx + 0.5) * INV_SUB;
            const dx = wx - cx;
            const dy = wy - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (!Number.isFinite(dist)) continue;
            const ang = Math.atan2(dy, dx);
            let effR = r;
            if (roughness > 1e-6) {
              const sector = Math.floor(((ang + Math.PI) / twoPi) * 24);
              const h0 = hash2i(sector, seed, 0x7f4a7c15 ^ seed);
              const wobble = Math.sin(ang * 3.0 + seed * 0.013) * 0.55
                + Math.sin(ang * 5.0 + seed * 0.021) * 0.45;
              const n = ((h0 * 2) - 1) * 0.75 + wobble * 0.25;
              effR *= (1 + roughness * n);
              effR = Math.max(r * 0.25, effR);
            }
            if (dist > effR) continue;
            const t = Math.max(0, 1 - dist / effR);
            let k = Math.pow(t, falloff);
            if (depthNoise > 1e-6) {
              const n = valueNoise2(wx * 2.1, wy * 2.1, 0x5bd1e995 ^ seed);
              k *= (1 + depthNoise * ((n * 2) - 1));
            }
            floorH[rowOff + sx] += delta * k;
          }
        }
      }
    }

    floorGX.fill(0);
    floorGY.fill(0);
    for (let sy = 1; sy < h - 1; sy++) {
      const rowOff = sy * w;
      for (let sx = 1; sx < w - 1; sx++) {
        const i = rowOff + sx;
        floorGX[i] = (floorH[i + 1] - floorH[i - 1]) * 0.5;
        floorGY[i] = (floorH[i + w] - floorH[i - w]) * 0.5;
      }
    }
  }

  // ---- Vision mask construction -----------------------------------------

  /**
   * Build the vision mask: a smooth 0-1 buffer indicating how well the player
   * can perceive each sub-cell.  This is NOT illumination — it only controls
   * whether the darkness overlay is lifted so the player can see what's there.
   *
   * Supports both omnidirectional (360°) and directional cone vision with
   * smooth penumbra edges.  Wall occlusion is handled via SDF ray-march.
   *
   * @param {VisionDef|null} visionDef
   */
  function buildVision(visionDef) {
    const w = lmW, h = lmH;
    vision.fill(0);
    if (!visionDef || visionDef.radius <= 0) return;

    const vr = visionDef.radius;
    const vrSub = vr * SUB;
    const vrSub2 = vrSub * vrSub;
    const invVrSub = 1 / vrSub;

    // Player position in sub-cell space
    const psx = (visionDef.x - _tx0) * SUB;
    const psy = (visionDef.y - _ty0) * SUB;

    // Cone parameters
    const coneDeg = visionDef.coneDeg || 360;
    const hasCone = coneDeg < 359;
    const penumbraDeg = visionDef.penumbraDeg || 25;
    const halfConeRad = (coneDeg * 0.5) * (Math.PI / 180);
    const penumbraRad = penumbraDeg * (Math.PI / 180);
    const fx = visionDef.facingX || 0;
    const fy = visionDef.facingY || 0;

    // Bounding rect
    const sx0 = Math.max(1,     (psx - vrSub) | 0);
    const sy0 = Math.max(1,     (psy - vrSub) | 0);
    const sx1 = Math.min(w - 2, (psx + vrSub) | 0);
    const sy1 = Math.min(h - 2, (psy + vrSub) | 0);

    for (let sy = sy0; sy <= sy1; sy++) {
      const dy = sy - psy;
      const dy2 = dy * dy;
      const rowOff = sy * w;
      for (let sx = sx0; sx <= sx1; sx++) {
        const i = rowOff + sx;
        if (sdf[i] <= 0) continue;  // inside wall

        const dx = sx - psx;
        const dist2 = dx * dx + dy2;
        if (dist2 > vrSub2) continue;

        // Wall occlusion — soft penumbra near wall edges.
        // Vision uses moderate softness (k=10) for readable but soft edges.
        const vis = rayVisible(psx, psy, sx, sy, w, 10);
        if (vis <= 0) continue;

        // Distance falloff — smooth fade over last 1.5 tiles
        const dist = Math.sqrt(dist2);
        const edgeFade = 1.5 * SUB;  // fade zone width in sub-cells
        let v = vis;  // start from penumbra factor, not 1.0
        if (dist > vrSub - edgeFade) {
          const fade = Math.max(0, (vrSub - dist) / edgeFade);
          v *= fade * fade * (3 - 2 * fade);  // smoothstep
        }

        // Cone attenuation — applied everywhere except the player's own tile
        if (hasCone && dist > SUB * 0.5) {
          const angle = Math.atan2(dy, dx);
          const facingAngle = Math.atan2(fy, fx);
          let diff = angle - facingAngle;
          // Normalize to [-PI, PI]
          if (diff > Math.PI) diff -= 2 * Math.PI;
          if (diff < -Math.PI) diff += 2 * Math.PI;
          const absDiff = Math.abs(diff);

          if (absDiff > halfConeRad + penumbraRad) {
            continue;  // fully outside cone + penumbra
          } else if (absDiff > halfConeRad) {
            // In penumbra — smooth falloff
            const penT = 1.0 - (absDiff - halfConeRad) / penumbraRad;
            v *= penT * penT * (3 - 2 * penT);  // smoothstep
          }
        }

        vision[i] = v;
      }
    }

    liftOpaqueTileVision();
  }

  function liftOpaqueTileVision() {
    const w = lmW;
    const h = lmH;
    if (w <= 0 || h <= 0) return;
    const source = vision.slice();
    const tilesW = (w * INV_SUB) | 0;
    const tilesH = (h * INV_SUB) | 0;

    for (let ty = 0; ty < tilesH; ty++) {
      const sy0 = ty * SUB;
      const sy1 = sy0 + SUB - 1;
      for (let tx = 0; tx < tilesW; tx++) {
        const sx0 = tx * SUB;
        const sx1 = sx0 + SUB - 1;
        const cx = sx0 + (SUB >> 1);
        const cy = sy0 + (SUB >> 1);
        if (sdf[cy * w + cx] > 0) continue;

        let maxVision = 0;
        for (let sy = Math.max(0, sy0 - 1); sy <= Math.min(h - 1, sy1 + 1); sy++) {
          const row = sy * w;
          for (let sx = Math.max(0, sx0 - 1); sx <= Math.min(w - 1, sx1 + 1); sx++) {
            if (sx >= sx0 && sx <= sx1 && sy >= sy0 && sy <= sy1) continue;
            const i = row + sx;
            if (sdf[i] <= 0) continue;
            const v = source[i];
            if (v > maxVision) maxVision = v;
          }
        }
        if (maxVision <= 0) continue;

        const lifted = Math.min(1, maxVision * 0.92);
        for (let sy = sy0; sy <= sy1; sy++) {
          const row = sy * w;
          for (let sx = sx0; sx <= sx1; sx++) {
            vision[row + sx] = lifted;
          }
        }
      }
    }
  }

  // ---- SDF ray-march (sphere tracing) for shadow occlusion --------------

  /**
   * March a ray from (ox, oy) toward (tx, ty) in sub-cell space.
   *
   * Returns a penumbra factor: 1.0 = fully visible (no nearby walls),
   * 0.0 = fully blocked.  Values in between give soft shadow edges.
   *
   * The softness parameter (`k`) controls penumbra width:
   *   k = 0  → hard binary shadows (equivalent to old boolean mode)
   *   k = 4  → narrow penumbra (spell bolts, lasers)
   *   k = 16 → wide penumbra (torches, fires — soft and atmospheric)
   *   k = 32 → very wide (large area lights)
   *
   * Technique: standard SDF soft shadow — at each march step, track the
   * minimum ratio of (k × SDF / ray_t).  Where the ray passes close to a
   * wall (small SDF) relative to how far it has traveled, the penumbra
   * drops, darkening the sample smoothly without extra rays.
   *
   * Uses sphere-tracing: at each step, advance by the SDF distance at the
   * current sample point.  If the SDF drops below the hit threshold, the ray
   * has struck a wall.  Typical iteration count is 4-12 in corridors, 2-4 in
   * open rooms — driven by how large the SDF values are in open space.
   */
  function rayVisible(ox, oy, tx, ty, w, k) {
    const dx = tx - ox;
    const dy = ty - oy;
    const totalDist = Math.sqrt(dx * dx + dy * dy);
    if (totalDist < 1.5) return 1.0;       // adjacent cells — always visible

    const invDist = 1 / totalDist;
    const rdx = dx * invDist;               // unit direction
    const rdy = dy * invDist;

    const HIT    = 0.45;   // SDF below this = inside wall
    const MIN_STEP = 0.7;  // don't crawl — ensure forward progress
    const MAX_STEPS = 24;  // hard cap (generous; typical is 4-12)

    const soft = k > 0;
    let penumbra = 1.0;

    let t = 1.0;  // start slightly away from light centre
    for (let step = 0; step < MAX_STEPS; step++) {
      const cx = ox + rdx * t;
      const cy = oy + rdy * t;

      // Sample SDF via nearest-neighbour (fast integer lookup)
      const si = (cx + 0.5) | 0;
      const sj = (cy + 0.5) | 0;
      if (si < 0 || si >= w || sj < 0 || sj >= lmH) return 0.0;  // off-grid = blocked

      const d = sdf[sj * w + si];
      if (d < HIT) return 0.0;             // hit a wall

      // Track penumbra: how close the ray skimmed past geometry.
      // Smaller d/t ratio = closer shave = darker shadow edge.
      if (soft) {
        const p = k * d / t;
        if (p < penumbra) penumbra = p;
      }

      t += Math.max(d, MIN_STEP);
      if (t >= totalDist - 0.5) return soft ? Math.min(1.0, penumbra) : 1.0; // reached the target
    }

    return soft ? Math.min(1.0, penumbra) : 1.0;  // ran out of steps — assume visible (rare)
  }

  // ---- Light accumulation ----------------------------------------------

  /**
   * Accumulate RGB contributions from all light sources into the lightR/G/B
   * buffers.  Works entirely in sub-cell space for the inner loop.
   *
   * @param {LightDef[]} lights
   * @param {[number,number,number]|null} ambient — RGB 0-1, added to every open cell
   * @param {((x:number,y:number)=>boolean)|null} [isRoofed] — if provided, roofed cells receive no ambient (sky blocked by roof)
   * @param {{ materialAt?: ((x:number,y:number)=>any)|null }} [opts]
   */
  function accumulateLights(lights, ambient, isRoofed, opts) {
    const w = lmW, h = lmH;
    const n = w * h;
    const materialAt = typeof opts?.materialAt === "function" ? opts.materialAt : null;
    voidField.fill(0);

    // Seed with ambient (sunlight / moonlight) if provided.
    // Roofed cells are excluded — the sky can't reach under a roof.
    if (ambient && (ambient[0] > 0 || ambient[1] > 0 || ambient[2] > 0)) {
      const ar = ambient[0], ag = ambient[1], ab = ambient[2];
      if (isRoofed) {
        for (let sy = 0; sy < h; sy++) {
          const ty = _ty0 + ((sy * INV_SUB) | 0);
          const rowOff = sy * w;
          for (let sx = 0; sx < w; sx++) {
            const i = rowOff + sx;
            if (sdf[i] > 0 && !isRoofed(_tx0 + ((sx * INV_SUB) | 0), ty)) {
              lightR[i] = ar; lightG[i] = ag; lightB[i] = ab;
            } else {
              lightR[i] = 0; lightG[i] = 0; lightB[i] = 0;
            }
          }
        }
      } else {
        for (let i = 0; i < n; i++) {
          if (sdf[i] > 0) { lightR[i] = ar; lightG[i] = ag; lightB[i] = ab; }
          else            { lightR[i] = 0;  lightG[i] = 0;  lightB[i] = 0;  }
        }
      }
    } else {
      lightR.fill(0);
      lightG.fill(0);
      lightB.fill(0);
    }

    // Ambient sky light barely reaches below-grade lava basins.
    for (let i = 0; i < n; i++) {
      if (lavaMask[i] !== 1) continue;
      const sd = lavaEdgeDist[i];
      const block = Math.min(1, sd / 1.65) * 0.92;
      lightR[i] *= (1 - block);
      lightG[i] *= (1 - block);
      lightB[i] *= (1 - block);
    }

    for (let li = 0; li < lights.length; li++) {
      const light = lights[li];
      const col = light.color || [255, 200, 140];
      const flicker = light.flicker ?? 1;
      const rawCr = (col[0] / 255) * flicker;
      const rawCg = (col[1] / 255) * flicker;
      const rawCb = (col[2] / 255) * flicker;
      const isVoid = light.kind === "void" || Number(light.voidStrength || 0) > 0
        || rawCr < 0 || rawCg < 0 || rawCb < 0;
      const voidStrength = Math.max(
        0,
        Number(light.voidStrength || 0),
        -(Math.min(rawCr, rawCg, rawCb, 0)),
      );
      const cr = Math.max(0, rawCr);
      const cg = Math.max(0, rawCg);
      const cb = Math.max(0, rawCb);
      const softK = light.softness ?? 0;   // default: hard shadows (FX lights); world lights set explicit softness
      const lr  = light.radius;          // tile units
      const lrSub = lr * SUB;            // sub-cell units
      const lrSub2 = lrSub * lrSub;
      const invLrSub = 1 / lrSub;

      // Light position in sub-cell coords (relative to lightmap origin)
      const lsx = (light.x - _tx0) * SUB;
      const lsy = (light.y - _ty0) * SUB;
      const lsi = Math.min(w - 2, Math.max(1, (lsx + 0.5) | 0));
      const lsj = Math.min(h - 2, Math.max(1, (lsy + 0.5) | 0));
      // Robust source classification: use a small neighborhood so half-tile
      // offsets near the hull don't misclassify in-pit lights as floor lights.
      let sourceLavaVotes = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const row = (lsj + oy) * w;
        for (let ox = -1; ox <= 1; ox++) {
          const j = row + lsi + ox;
          if (lavaMask[j] === 1) sourceLavaVotes++;
        }
      }
      const sourceInLava = sourceLavaVotes >= 3;

      // Bounding rect in sub-cells
      const sx0 = Math.max(1,     (lsx - lrSub) | 0);
      const sy0 = Math.max(1,     (lsy - lrSub) | 0);
      const sx1 = Math.min(w - 2, (lsx + lrSub) | 0);
      const sy1 = Math.min(h - 2, (lsy + lrSub) | 0);

      for (let sy = sy0; sy <= sy1; sy++) {
        const dwy = sy - lsy;
        const dwy2 = dwy * dwy;
        const rowOff = sy * w;
        for (let sx = sx0; sx <= sx1; sx++) {
          const i = rowOff + sx;
          const d = sdf[i];
          if (d <= 0) continue;           // inside wall

          const dwx = sx - lsx;
          const dist2 = dwx * dwx + dwy2;
          if (dist2 > lrSub2) continue;

          // SDF ray-march: penumbra factor (0 = blocked, 1 = fully lit)
          const pen = rayVisible(lsx, lsy, sx, sy, w, softK);
          if (pen <= 0) continue;

          const dist = Math.sqrt(dist2);
          const atten = 1.0 - dist * invLrSub;
          const atten2 = atten * atten * atten * pen;   // cubic falloff × penumbra — punchy core, fast drop
          const tx = _tx0 + ((sx * INV_SUB) | 0);
          const ty = _ty0 + ((sy * INV_SUB) | 0);
          const mat = materialAt
            ? resolveMaterialLightingResponse(materialAt(tx, ty))
            : DEFAULT_MATERIAL_RESPONSE;

          // Near-wall diffuse catch-light (sub-cell threshold ≈ 0.5 tiles)
          const wallThresh = 4;
          let intensity;
          if (d < wallThresh) {
            const invDist = 1 / (dist || 1);
            const ldx = -dwx * invDist;
            const ldy = -dwy * invDist;
            const diffuse = Math.max(0, normX[i] * ldx + normY[i] * ldy);
            const wallBlend = 1.0 - d / wallThresh;
            intensity = (0.9 + diffuse * wallBlend * mat.normal + mat.rim * wallBlend) * atten2;
          } else {
            const shimmer = mat.sheen > 0
              ? 1 + mat.sheen * 0.08 * Math.sin((opts?.fxTime || 0) * 2.1 + sx * 0.087 + sy * 0.051)
              : 1;
            intensity = (0.9 + mat.rim * 0.18) * atten2 * shimmer;
          }

          const targetInLava = lavaMask[i] === 1;
          if (sourceInLava !== targetInLava) continue;
          if (targetInLava) {
            const sd = lavaEdgeDist[i];
            // In-pit lights cast against inner walls of the cut.
            const invDist = 1 / (dist || 1);
            const ldx = -dwx * invDist;
            const ldy = -dwy * invDist;
            const surfDiffuse = Math.max(0, surfNormX[i] * ldx + surfNormY[i] * ldy);
            const wallBand = Math.max(0, 1 - Math.abs(sd - 2.15) / 1.05);
            const deepBand = Math.max(0, Math.min(1, (sd - 2.35) / 1.0));
            const catchBoost = 1 + wallBand * (0.90 * surfDiffuse + 0.30) + deepBand * 0.25;
            intensity *= catchBoost;
          } else if (surfType[i] === 0) {
            // Debug floor relief occlusion approximation: higher relief between
            // target and light attenuates intensity (partial "pile shadow").
            const invDist = 1 / (dist || 1);
            const toLightX = -dwx * invDist;
            const toLightY = -dwy * invDist;
            const stepX = toLightX > 0.35 ? 1 : (toLightX < -0.35 ? -1 : 0);
            const stepY = toLightY > 0.35 ? 1 : (toLightY < -0.35 ? -1 : 0);
            if (stepX !== 0 || stepY !== 0) {
              const h0 = floorH[i];
              let ridge = 0;
              let cx = sx;
              let cy = sy;
              for (let tap = 0; tap < 3; tap++) {
                cx += stepX;
                cy += stepY;
                if (cx < 0 || cx >= w || cy < 0 || cy >= h) break;
                const j = cy * w + cx;
                const dh = floorH[j] - h0;
                if (dh > ridge) ridge = dh;
              }
              if (ridge > 0) {
                const shadow = Math.min(0.92, ridge * 0.85);
                intensity *= (1 - shadow);
              }
            }
          }

          if (isVoid) {
            voidField[i] += Math.max(0.0001, voidStrength) * intensity;
            continue;
          }

          const absorbKeep = 1 - mat.absorb * 0.42;
          lightR[i] += cr * mat.albedoR * absorbKeep * intensity;
          lightG[i] += cg * mat.albedoG * absorbKeep * intensity;
          lightB[i] += cb * mat.albedoB * absorbKeep * intensity;
        }
      }
    }

    if (materialAt) {
      for (let sy = 0; sy < h; sy++) {
        const ty = _ty0 + ((sy * INV_SUB) | 0);
        const rowOff = sy * w;
        for (let sx = 0; sx < w; sx++) {
          const i = rowOff + sx;
          if (sdf[i] <= 0) continue;
          const tx = _tx0 + ((sx * INV_SUB) | 0);
          const mat = resolveMaterialLightingResponse(materialAt(tx, ty));
          if (mat.void > 0) voidField[i] += mat.void * 0.035;
          if (mat.emit <= 0) continue;
          const e = mat.emit * (0.05 + 0.10 * mat.sheen);
          lightR[i] += mat.emitR * e;
          lightG[i] += mat.emitG * e;
          lightB[i] += mat.emitB * e;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      const v = voidField[i];
      if (v <= 0) continue;
      const eat = clamp01(Math.pow(v * 0.42, 0.72));
      const keep = 1 - eat;
      lightR[i] *= keep;
      lightG[i] *= keep;
      lightB[i] *= keep;
    }
  }

  function roofedCell(i, isRoofed) {
    if (!isRoofed) return false;
    const sx = i % lmW;
    const sy = (i / lmW) | 0;
    const tx = _tx0 + ((sx * INV_SUB) | 0);
    const ty = _ty0 + ((sy * INV_SUB) | 0);
    return isRoofed(tx, ty);
  }

  function shelterInteriorCell(i, isShelterInterior) {
    if (!isShelterInterior) return false;
    const sx = i % lmW;
    const sy = (i / lmW) | 0;
    const tx = _tx0 + ((sx * INV_SUB) | 0);
    const ty = _ty0 + ((sy * INV_SUB) | 0);
    return isShelterInterior(tx, ty);
  }

  function ambientLightSumForCell(i, ambient, isRoofed) {
    if (!ambient || sdf[i] <= 0) return 0;
    if (roofedCell(i, isRoofed)) return 0;
    let sum = Math.max(0, ambient[0] + ambient[1] + ambient[2]);
    if (lavaMask[i] === 1) {
      const sd = lavaEdgeDist[i];
      const block = Math.min(1, sd / 1.65) * 0.92;
      sum *= (1 - block);
    }
    return sum;
  }

  // ---- Render to canvas ------------------------------------------------

  /**
   * Compute lighting and composite the two-pass overlay onto `ctx`.
   *
   * @param {CanvasRenderingContext2D} ctx   — under camera/world transform
   * @param {LightDef[]} lights
   * @param {(x:number,y:number)=>boolean} isOpaque
   * @param {number} vx0  @param {number} vy0
   * @param {number} vx1  @param {number} vy1
   * @param {[number,number,number]|null} [ambient] — RGB 0-1 base light for every open cell
   * @param {number} [maxDark=140] — max darkness alpha (0=no overlay, 255=pure black)
   * @param {((x:number,y:number)=>boolean)|null} [isRoofed] — roofed cells get no ambient
   * @param {VisionDef|null} [visionDef] — player vision mask (not a light)
   * @param {Array<{family:string, loops:Array<Array<{x:number,y:number}>>}>} [surfaceRegions]
   * @param {number} [fxTime]
   * @param {string|number} [reliefKey] — debug floor-relief scope key (e.g. depth)
   * @param {{ playerSheltered?: boolean, isShelterInterior?: ((x:number,y:number)=>boolean)|null, materialAt?: ((x:number,y:number)=>any)|null }} [opts]
   */
  function render(ctx, lights, isOpaque, vx0, vy0, vx1, vy1, ambient, maxDark, isRoofed, visionDef, surfaceRegions, fxTime, reliefKey, opts) {
    const DARK = (maxDark != null) ? maxDark : 190;
    const tx0 = Math.floor(vx0) - 1;
    const ty0 = Math.floor(vy0) - 1;
    const tx1 = Math.ceil(vx1)  + 1;
    const ty1 = Math.ceil(vy1)  + 1;
    const tw  = tx1 - tx0;
    const th  = ty1 - ty0;
    if (tw <= 2 || th <= 2) return;

    ensureSize(tw, th);
    _tx0 = tx0; _ty0 = ty0;
    activeReliefKey = normalizeReliefKey(reliefKey);
    const relief = getActiveReliefState();

    // Viewport change dirties everything — all fields are viewport-relative.
    if (tx0 !== _prevTx0 || ty0 !== _prevTy0 || tw !== _prevTw || th !== _prevTh) {
      _dirtyGeometry = true;
      _dirtySurface  = true;
      _dirtyRelief   = true;
      _dirtyVision   = true;
      _dirtyLights   = true;
      _prevTx0 = tx0; _prevTy0 = ty0; _prevTw = tw; _prevTh = th;
    }

    // Cascade: upstream dirty forces downstream dirty.
    if (_dirtyGeometry) { _dirtyVision = true; _dirtyLights = true; }
    if (_dirtySurface)  { _dirtyLights = true; }
    if (_dirtyRelief)   { _dirtyLights = true; }
    if (_dirtyVision)   { _dirtyLights = true; }

    // Lights always rebuild — they depend on moving sources, flicker, and
    // fxTime, which change every frame.  The expensive wins are skipping
    // SDF, surface, relief, and vision when geometry hasn't changed.
    _dirtyLights = true;

    const _t0 = performance.now();

    _stats.builtSdf     = _dirtyGeometry ? 1 : 0;
    _stats.builtSurf    = _dirtySurface  ? 1 : 0;
    _stats.builtRelief  = _dirtyRelief   ? 1 : 0;
    _stats.builtVision  = _dirtyVision   ? 1 : 0;
    _stats.lightCount   = lights.length;

    if (_dirtyGeometry) buildSDF(isOpaque, tx0, ty0, tw, th);
    if (_dirtySurface)  buildSurfaceSDF(surfaceRegions || [], tx0, ty0, tw, th);
    if (_dirtyRelief)   buildFloorRelief(tx0, ty0, tw, th, relief);
    if (_dirtyVision)   buildVision(visionDef || null);
    accumulateLights(lights, ambient || null, isRoofed || null, {
      materialAt: opts?.materialAt || null,
      fxTime: fxTime || 0,
    });

    _dirtyGeometry = false;
    _dirtySurface  = false;
    _dirtyRelief   = false;
    _dirtyVision   = false;
    _dirtyLights   = false;
    const n = lmW * lmH;
    const playerSheltered = opts?.playerSheltered === true;
    const isShelterInterior = opts?.isShelterInterior || null;
    // Lava self-emission (inside basin only): this is the "light in the pit".
    // Kept fully contained to lavaMask cells so it reads as below-grade glow.
    for (let i = 0; i < n; i++) {
      if (lavaMask[i] !== 1) continue;
      const sd = lavaEdgeDist[i];
      const wallBand = Math.max(0, 1 - Math.abs(sd - 2.0) / 1.15); // inner wall
      const deepBand = Math.max(0, Math.min(1, (sd - 2.2) / 1.2)); // molten core
      const emit = 0.46 + wallBand * 1.28 + deepBand * 1.91;
      if (emit <= 0) continue;
      const t = fxTime || 0;
      const pulse = 0.84 + 0.16 * Math.sin(t * 2.4 + sd * 0.34);
      const shimmer = 0.84 + 0.16 * Math.sin(t * 7.0 + (i % lmW) * 0.09 + ((i / lmW) | 0) * 0.05);
      const e = emit * pulse * shimmer;
      lightR[i] += 1.91 * e;
      lightG[i] += 0.82 * e;
      lightB[i] += 0.20 * e;
    }

    // ---- Pass 1: darkness overlay (source-over, black + alpha) ----------
    // Vision mask lifts darkness (lets you see) without adding colour.
    // Lights also lift darkness AND add colour in pass 2.
    for (let i = 0; i < n; i++) {
      const pi = i << 2;
      pixels[pi]     = 0;
      pixels[pi + 1] = 0;
      pixels[pi + 2] = 0;
      {
        const opaqueCell = sdf[i] <= 0;
        const lightSum = lightR[i] + lightG[i] + lightB[i];
        const ambientLightSum = ambientLightSumForCell(i, ambient || null, isRoofed || null);
        const sight = Math.max(0, vision[i] * (1 - clamp01(voidField[i] * 0.16)));  // 0-1 vision mask
        // Vision lifts darkness to reveal what's there; light lifts further.
        // For below-grade surfaces we intentionally reduce this lift so the
        // depression profile can remain visible instead of flattening out.
        const inLava = lavaMask[i] === 1;
        let alpha = 0;

        // Generic floor relief shading (debug): digs/piles should be legible
        // as terrain, independent of surface tags.
        if (hasFloorRelief && !opaqueCell && !inLava && surfType[i] === 0) {
          const hRel = floorH[i];
          const gx = floorGX[i];
          const gy = floorGY[i];
          const slope = Math.min(1, Math.hypot(gx, gy) * 3.2);
          const shade = Math.max(-1, Math.min(1, (-gx * 0.82) + (-gy * 0.58)));
          const digDark = Math.max(0, -hRel) * 0.95 + slope * (0.28 + 0.38 * Math.max(0, -shade));
          const pileLift = Math.max(0, hRel) * 0.58 + slope * 0.22 * Math.max(0, shade);
          alpha = resolveDarknessAlpha({ lightSum, ambientLightSum, sight, inLava, dark: DARK, voidAmount: voidField[i] });
          const liftDelta = digDark - pileLift;
          alpha = Math.min(255, Math.max(0, alpha + liftDelta * DARK));
          alpha = Math.min(255, Math.max(0, alpha + digDark * 118));
        } else {
          alpha = resolveDarknessAlpha({ lightSum, ambientLightSum, sight, inLava, dark: DARK, voidAmount: voidField[i] });
        }
        // Lava below-grade basin: dark lip → lit inner wall → emissive interior.
        // Important: this applies both additive emissive lift and subtractive cut shadow
        // so the basin reads as carved below the surrounding floor.
        if (!opaqueCell && inLava) {
          const sd = lavaEdgeDist[i];
          const lipBand = Math.max(0, 1 - (sd - 0.85) / 1.45); // steep drop edge
          const wallBand = Math.max(0, 1 - Math.abs(sd - 2.0) / 1.15);
          const deepBand = Math.max(0, Math.min(1, (sd - 2.2) / 1.2));
          const cutShadow = lipBand * 0.82 + wallBand * 0.20;
          const emissiveLift = 0.30 + wallBand * 0.42 + deepBand * 1.08;
          alpha = Math.min(255, Math.max(0, alpha + (cutShadow - emissiveLift) * DARK));
          // Negative-wall read: allow the lip to go darker than global DARK cap.
          alpha = Math.min(255, Math.max(0, alpha + lipBand * 92 + wallBand * 15));
        } else if (!opaqueCell) {
          // Slight outside rim darkening helps the cut boundary read as "below grade".
          const rimD = lavaEdgeDist[i];
          if (rimD < 1.4) alpha = Math.min(255, Math.max(0, alpha + 28 * (1 - rimD / 1.4)));
        }
        if (playerSheltered && !opaqueCell && !shelterInteriorCell(i, isShelterInterior)) {
          alpha = Math.max(alpha, SHELTERED_EXTERIOR_BLACKOUT_ALPHA);
        }
        pixels[pi + 3] = alpha | 0;
      }
    }
    lmCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    // Each sub-cell maps to INV_SUB tiles; the full lightmap covers tw × th tiles.
    // Tiles are drawn centred on integer coords → tile tx0 occupies [tx0−0.5 .. tx0+0.5].
    ctx.drawImage(lmCanvas,
      0, 0, lmW, lmH,
      tx0 - 0.5, ty0 - 0.5, tw, th);
    ctx.restore();

    // ---- Pass 2: warm colour tint (additive via 'lighter') --------------
    for (let i = 0; i < n; i++) {
      const pi = i << 2;
      const opaqueCell = sdf[i] <= 0;
      const st = surfType[i];
      if (!opaqueCell && st > 0 && surfSdf[i] > 0) {
        // Surface sub-cell: neutral tone + depth-based color
        const sd = surfSdf[i];
        const depth = Math.min(1, sd / MAX_SURF_DEPTH);
        const edgeF = sd < SURF_EDGE_THRESH ? 1 - sd / SURF_EDGE_THRESH : 0;
        let sr, sg, sb, sa;
        if (st === 1) { // water — cool blue depression
          sr = (15 + 50 * edgeF) * depth;
          sg = (50 + 80 * edgeF) * depth;
          sb = (85 + 110 * edgeF) * depth;
          sa = 0.45 * depth + 0.5 * edgeF;
        } else { // lava — below-grade cut: dark lip, hot wall, emissive core
          const sd = lavaEdgeDist[i];
          const flk = 0.84 + 0.16 * Math.sin((fxTime || 0) * 3.8 + sd * 0.42);
          const lipBand = Math.max(0, 1 - (sd - 0.85) / 1.45);
          const wallBand = Math.max(0, 1 - Math.abs(sd - 2.0) / 1.15);
          const deepBand = Math.max(0, Math.min(1, (sd - 2.2) / 1.2));
          const rimBand = Math.max(0, 1 - Math.abs(sd - 1.0) / 1.25); // Bezier-following rim line
          const core = Math.max(0, depth - lipBand * 0.98 - 0.20);
          sr = (8 * lipBand + 182 * wallBand + 182 * deepBand + 50 * core + 114 * rimBand) * flk;
          sg = (2 * lipBand + 108 * wallBand + 108 * deepBand + 20 * core + 56 * rimBand) * flk;
          sb = (0 * lipBand + 22 * wallBand + 20 * deepBand + 12 * rimBand) * flk;
          sa = Math.min(1, lipBand * 0.03 + wallBand * 0.70 + deepBand * 0.79 + rimBand * 0.40);
        }
        // Blend: surface color + accumulated light (neutral, no warm bias)
        pixels[pi]     = Math.min(255, (lightR[i] * 255 + sr) | 0);
        pixels[pi + 1] = Math.min(255, (lightG[i] * 255 + sg) | 0);
        pixels[pi + 2] = Math.min(255, (lightB[i] * 255 + sb) | 0);
        const lightBri = Math.min(1, (lightR[i] + lightG[i] + lightB[i]) * 0.4);
        pixels[pi + 3] = Math.min(255, (lightBri * 170 + sa * 210) | 0);
      } else {
        // Warm-biased tint that preserves cool emissives.
        // When accumulated light is warm-dominant (torch), the classic warm
        // bias applies.  When blue/green dominates (potions, gems, altars),
        // the multipliers open up so the hue reads correctly.
        const lr = lightR[i], lg = lightG[i], lb = lightB[i];
        const brightness = Math.min(1, (lr + lg + lb) * 0.4);
        const peak = Math.max(lr, lg, lb) || 1;
        const coolBias = Math.min(1, Math.max(0, (lb + lg * 0.5 - lr) / peak));
        let r = (lr * 255) | 0;
        let g = (lg * (180 + 75 * coolBias)) | 0;
        let b = (lb * (60 + 195 * coolBias)) | 0;
        let a = (brightness * 120) | 0;
        if (hasFloorRelief && !opaqueCell && st === 0) {
          const hRel = floorH[i];
          const gx = floorGX[i];
          const gy = floorGY[i];
          const slope = Math.min(1, Math.hypot(gx, gy) * 3.0);
          const shade = Math.max(-1, Math.min(1, (-gx * 0.82) + (-gy * 0.58)));
          const pos = Math.max(0, shade);
          const neg = Math.max(0, -shade);
          const contour = Math.min(1, Math.abs(hRel) * 1.4 + slope * 0.9);
          r += (22 * pos * contour - 15 * neg * contour) | 0;
          g += (16 * pos * contour - 12 * neg * contour) | 0;
          b += (9 * pos * contour - 8 * neg * contour) | 0;
          a += (26 * contour) | 0;

        }
        pixels[pi] = Math.max(0, Math.min(255, r));
        pixels[pi + 1] = Math.max(0, Math.min(255, g));
        pixels[pi + 2] = Math.max(0, Math.min(255, b));
        pixels[pi + 3] = Math.max(0, Math.min(255, a));
      }
    }
    lmCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lmCanvas,
      0, 0, lmW, lmH,
      tx0 - 0.5, ty0 - 0.5, tw, th);
    ctx.restore();

    _stats.dtMs = performance.now() - _t0;
  }

  function addFloorTileDelta(x, y, delta, reliefKeyOverride) {
    const relief = reliefKeyOverride == null
      ? getActiveReliefState()
      : getReliefStateForKey(reliefKeyOverride);
    const tx = Number.isFinite(Number(x)) ? (Math.round(Number(x)) | 0) : 0;
    const ty = Number.isFinite(Number(y)) ? (Math.round(Number(y)) | 0) : 0;
    const dd = Number(delta);
    if (!Number.isFinite(dd) || dd === 0) return 0;
    const key = `${tx},${ty}`;
    const prev = relief.tileMods.get(key)?.delta || 0;
    const next = Math.max(-4, Math.min(4, prev + dd));
    if (Math.abs(next) < 1e-5) relief.tileMods.delete(key);
    else relief.tileMods.set(key, { x: tx, y: ty, delta: next });
    _dirtyRelief = true;
    return next;
  }

  function addFloorRadialDelta(x, y, delta, radius, opts, reliefKeyOverride) {
    const relief = reliefKeyOverride == null
      ? getActiveReliefState()
      : getReliefStateForKey(reliefKeyOverride);
    const cx = Number(x);
    const cy = Number(y);
    const dd = Number(delta);
    const rr = Number(radius);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return 0;
    if (!Number.isFinite(dd) || dd === 0) return 0;
    if (!Number.isFinite(rr) || rr <= 0) return 0;

    const o = opts && typeof opts === "object" ? opts : {};
    relief.radialMods.push({
      x: cx,
      y: cy,
      radius: Math.max(0.1, Math.min(8, rr)),
      delta: Math.max(-4, Math.min(4, dd)),
      falloff: Math.max(0.25, Math.min(5, Number(o.falloff) || 1.4)),
      roughness: Math.max(0, Math.min(0.9, Number(o.roughness) || 0)),
      depthNoise: Math.max(0, Math.min(0.9, Number(o.depthNoise) || 0)),
      seed: Number.isFinite(Number(o.seed)) ? (Number(o.seed) | 0) : (((cx * 73856093) ^ (cy * 19349663) ^ (dd * 83492791)) | 0),
    });
    if (relief.radialMods.length > MAX_RADIAL_MODS_PER_KEY) {
      relief.radialMods.splice(0, relief.radialMods.length - MAX_RADIAL_MODS_PER_KEY);
    }
    _dirtyRelief = true;
    return relief.radialMods.length;
  }

  function setFloorTileDelta(x, y, delta, reliefKeyOverride) {
    const relief = reliefKeyOverride == null
      ? getActiveReliefState()
      : getReliefStateForKey(reliefKeyOverride);
    const tx = Number.isFinite(Number(x)) ? (Math.round(Number(x)) | 0) : 0;
    const ty = Number.isFinite(Number(y)) ? (Math.round(Number(y)) | 0) : 0;
    const value = Number(delta);
    if (!Number.isFinite(value)) return 0;
    const next = Math.max(-4, Math.min(4, value));
    const key = `${tx},${ty}`;
    if (Math.abs(next) < 1e-5) relief.tileMods.delete(key);
    else relief.tileMods.set(key, { x: tx, y: ty, delta: next });
    _dirtyRelief = true;
    return next;
  }

  function setFloorNoise(amplitude, frequency) {
    const relief = getActiveReliefState();
    const a = Number(amplitude);
    if (!Number.isFinite(a)) return relief.noiseAmp;
    relief.noiseAmp = Math.max(-2, Math.min(2, a));
    if (frequency != null) {
      const f = Number(frequency);
      if (Number.isFinite(f) && f > 0) relief.noiseFreq = Math.max(0.001, Math.min(2, f));
    }
    _dirtyRelief = true;
    return relief.noiseAmp;
  }

  function clearFloorRelief(scope) {
    if (String(scope || "").toLowerCase() === "all") {
      floorReliefByKey.clear();
      _dirtyRelief = true;
      return;
    }
    const relief = getActiveReliefState();
    relief.tileMods.clear();
    relief.radialMods.length = 0;
    relief.noiseAmp = 0;
    _dirtyRelief = true;
  }

  function getFloorReliefState() {
    const relief = getActiveReliefState();
    return {
      reliefKey: activeReliefKey,
      tileMods: relief.tileMods.size,
      radialMods: relief.radialMods.length,
      noiseAmp: relief.noiseAmp,
      noiseFreq: relief.noiseFreq,
    };
  }

  // ---- Invalidation API ---------------------------------------------------
  // Call these when the world changes between frames so the next render()
  // knows which fields to rebuild.  Safe to over-invalidate; the worst case
  // is one extra rebuild (which is what pre-dirty-fields did every frame).

  /** Tile opacity changed (pickaxe dig, wall destroyed, door open/close). */
  function invalidateGeometry() { _dirtyGeometry = true; }

  /** Surface pools changed (lava/water added or removed). */
  function invalidateSurface() { _dirtySurface = true; }

  /** Floor relief changed (meteor impact, sculpt commands). */
  function invalidateRelief() { _dirtyRelief = true; }

  /** Player moved, turned, or vision radius changed. */
  function invalidateVision() { _dirtyVision = true; }

  /** Light sources changed (force full relight next frame). */
  function invalidateLights() { _dirtyLights = true; }

  /** Nuclear option — mark everything dirty. */
  function invalidateAll() {
    _dirtyGeometry = true;
    _dirtySurface  = true;
    _dirtyRelief   = true;
    _dirtyVision   = true;
    _dirtyLights   = true;
  }

  /** Return a snapshot of the last frame's build/perf stats. */
  function getLastFrameStats() {
    return {
      builtSdf:    _stats.builtSdf,
      builtSurf:   _stats.builtSurf,
      builtRelief: _stats.builtRelief,
      builtVision: _stats.builtVision,
      lightCount:  _stats.lightCount,
      dtMs:        _stats.dtMs,
    };
  }

  return {
    render,
    addFloorTileDelta, addFloorRadialDelta, setFloorTileDelta,
    setFloorNoise, clearFloorRelief, getFloorReliefState,
    invalidateGeometry, invalidateSurface, invalidateRelief,
    invalidateVision, invalidateLights, invalidateAll,
    getLastFrameStats,
  };
}
